import { app, BrowserWindow, ipcMain, shell, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { watch, readFileSync, mkdirSync, type FSWatcher } from 'fs'
import { execSync } from 'child_process'
import * as pty from 'node-pty'
import { Session } from '@petradb/engine'
import { quarry, table, serial, text, integer, boolean, eq } from '@petradb/quarry'

// Cache uid/gid to name lookups
const uidCache = new Map<number, string>()
const gidCache = new Map<number, string>()

function getUserName(uid: number): string {
  if (uidCache.has(uid)) return uidCache.get(uid)!
  try {
    const name = execSync(`id -un ${uid}`, { encoding: 'utf-8' }).trim()
    uidCache.set(uid, name)
    return name
  } catch {
    const s = String(uid)
    uidCache.set(uid, s)
    return s
  }
}

function loadGroupMap() {
  try {
    const content = readFileSync('/etc/group', 'utf-8')
    for (const line of content.split('\n')) {
      const parts = line.split(':')
      if (parts.length >= 3) {
        gidCache.set(Number(parts[2]), parts[0])
      }
    }
  } catch { /* ignore */ }
}
loadGroupMap()

function getGroupName(gid: number): string {
  return gidCache.get(gid) ?? String(gid)
}

// Database — memory in dev, file-backed in production
const isDev = process.env.NODE_ENV === 'development'
const dbDir = path.join(app.getPath('userData'), 'db')
if (!isDev) try { mkdirSync(dbDir, { recursive: true }) } catch {}
const session = isDev
  ? new Session({ storage: 'memory' })
  : new Session({ storage: 'persistent', path: path.join(dbDir, 'roamer.db') })
const db = quarry(session)

const places = table('places', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
})

const thumbnails = table('thumbnails', {
  id: serial('id').primaryKey(),
  path: text('path').notNull().unique(),
  mtime: text('mtime').notNull(),
  data: text('data').notNull(), // base64 JPEG
})

const THUMB_SIZE = 64

async function generateThumbnail(filePath: string): Promise<{ data: string; format: string } | null> {
  try {
    const buf = await fs.readFile(filePath)
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) {
      // nativeImage can't handle this format — use raw file if small enough
      if (buf.length < 512 * 1024) {
        const ext = path.extname(filePath).slice(1).toLowerCase()
        const mime = ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/png'
        return { data: buf.toString('base64'), format: mime }
      }
      return null
    }
    const resized = img.resize({ width: THUMB_SIZE, height: THUMB_SIZE })
    return { data: resized.toJPEG(80).toString('base64'), format: 'image/jpeg' }
  } catch {
    return null
  }
}

async function initDb() {
  try {
    await db.createTable(places)
    // Seed defaults
    const home = app.getPath('home')
    await db.insert(places).values(
      { name: 'Home', path: home, icon: 'home', sortOrder: 0, isDefault: true },
      { name: 'Desktop', path: `${home}/Desktop`, icon: 'desktop', sortOrder: 1, isDefault: true },
      { name: 'Documents', path: `${home}/Documents`, icon: 'documents', sortOrder: 2, isDefault: true },
      { name: 'Downloads', path: `${home}/Downloads`, icon: 'downloads', sortOrder: 3, isDefault: true },
    ).execute()
  } catch {
    // Table already exists
  }
  try {
    await db.createTable(thumbnails)
  } catch {
    // Table already exists
  }
}

ipcMain.handle('db-init', () => initDb())

ipcMain.handle('db-get-places', async () => {
  return db.from(places).execute()
})

ipcMain.handle('db-add-place', async (_event, name: string, placePath: string) => {
  const existing = await db.from(places).execute()
  const maxOrder = existing.reduce((max: number, p: any) => Math.max(max, p.sortOrder), -1)
  await db.insert(places).values(
    { name, path: placePath, icon: 'folder', sortOrder: maxOrder + 1, isDefault: false },
  ).execute()
})

ipcMain.handle('db-delete-place', async (_event, placePath: string) => {
  await db.delete(places).where(eq(places.path, placePath)).execute()
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    if (process.env.NODE_ENV !== 'development') {
      win.webContents.send('window-shown')
    }
  })

  // Forward Escape key to renderer via hidden menu accelerator
  // This is app-scoped (not global) so it doesn't leak to other apps
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '',
      submenu: [
        {
          label: 'Escape',
          accelerator: 'Escape',
          visible: false,
          click: () => win.webContents.send('escape-pressed'),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
    win.webContents.once('devtools-opened', () => {
      win.focus()
      win.webContents.focus()
      win.webContents.send('window-shown')
    })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-home', () => {
  return app.getPath('home')
})

ipcMain.handle('get-cwd', () => {
  // Check for --cwd=<path> argument (from CLI launcher)
  const cwdArg = process.argv.find((a) => a.startsWith('--cwd='))
  if (cwdArg) return cwdArg.split('=').slice(1).join('=')
  const cwd = process.cwd()
  // When launched from Finder, cwd is /
  return cwd === '/' ? app.getPath('home') : cwd
})

ipcMain.handle('read-directory', async (_event, dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name)
      let size = 0
      let modifiedAt = ''
      let mode = 0
      let owner = ''
      let isSymlink = false
      let linkTarget: string | null = null
      try {
        const lstat = await fs.lstat(fullPath)
        isSymlink = lstat.isSymbolicLink()
        if (isSymlink) {
          linkTarget = await fs.readlink(fullPath)
          // Get target's info for size/dates
          try {
            const stat = await fs.stat(fullPath)
            size = stat.size
            modifiedAt = stat.mtime.toISOString()
            mode = stat.mode
            owner = `${getUserName(stat.uid)}:${getGroupName(stat.gid)}`
          } catch {
            // Dangling symlink — use lstat info
            mode = lstat.mode
            owner = `${getUserName(lstat.uid)}:${getGroupName(lstat.gid)}`
          }
        } else {
          size = lstat.size
          modifiedAt = lstat.mtime.toISOString()
          mode = lstat.mode
          owner = `${getUserName(lstat.uid)}:${getGroupName(lstat.gid)}`
        }
      } catch {
        // Permission denied
      }
      const ext = entry.isDirectory() ? '' : path.extname(entry.name).slice(1)
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isSymlink,
        linkTarget,
        size,
        modifiedAt,
        mode,
        owner,
        extension: ext,
      }
    })
  )
  return results
})

// Thumbnails
const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])

// Prevent concurrent thumbnail generation for the same file
const thumbInFlight = new Map<string, Promise<string | null>>()

ipcMain.handle('get-thumbnail', async (_event, filePath: string, mtime: string) => {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (!imageExts.has(ext)) return null

  // Deduplicate concurrent requests
  const existing = thumbInFlight.get(filePath)
  if (existing) return existing

  const work = (async () => {
    // Check cache
    const cached = await db.from(thumbnails).execute()
    const match = cached.find((t: any) => t.path === filePath)
    if (match && match.mtime === mtime) {
      return match.data as string // already a data URL
    }

    // Generate
    const result = await generateThumbnail(filePath)
    if (!result) return null

    const dataUrl = `data:${result.format};base64,${result.data}`

    // Store in cache
    try {
      if (match) {
        await session.execute(`UPDATE thumbnails SET mtime = '${mtime}', data = '${dataUrl.replace(/'/g, "''")}'  WHERE path = '${filePath.replace(/'/g, "''")}'`)
      } else {
        await db.insert(thumbnails).values({ path: filePath, mtime, data: dataUrl }).execute()
      }
    } catch {
      // Race condition — another request already inserted
    }

    return dataUrl
  })()

  thumbInFlight.set(filePath, work)
  try {
    return await work
  } finally {
    thumbInFlight.delete(filePath)
  }
})

// Git status
ipcMain.handle('git-status', async (_event, dirPath: string) => {
  try {
    // Check if inside a git repo
    execSync('git rev-parse --git-dir', { cwd: dirPath, encoding: 'utf-8', stdio: 'pipe' })
    // Get status
    const output = execSync('git status --porcelain -uall', { cwd: dirPath, encoding: 'utf-8', stdio: 'pipe' })
    const gitRoot = execSync('git rev-parse --show-toplevel', { cwd: dirPath, encoding: 'utf-8', stdio: 'pipe' }).trim()
    const branch = execSync('git branch --show-current', { cwd: dirPath, encoding: 'utf-8', stdio: 'pipe' }).trim()
    const files: Record<string, string> = {}
    for (const line of output.split('\n')) {
      if (!line) continue
      const status = line.substring(0, 2)
      const filePath = line.substring(3).split(' -> ').pop()! // handle renames
      const fullPath = path.resolve(gitRoot, filePath)
      files[fullPath] = status.trim()
    }
    return { files, branch }
  } catch {
    return null // not a git repo
  }
})

// File info and preview
ipcMain.handle('get-file-info', async (_event, filePath: string) => {
  const stat = await fs.stat(filePath)
  return {
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    createdAt: stat.birthtime.toISOString(),
    isDirectory: stat.isDirectory(),
    mode: stat.mode,
  }
})

ipcMain.handle('read-file-preview', async (_event, filePath: string, maxBytes: number) => {
  const fh = await fs.open(filePath, 'r')
  const buf = Buffer.alloc(maxBytes)
  const { bytesRead } = await fh.read(buf, 0, maxBytes, 0)
  await fh.close()
  return buf.slice(0, bytesRead).toString('utf-8')
})

ipcMain.handle('read-image-data-url', async (_event, filePath: string) => {
  const buf = await fs.readFile(filePath)
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', ico: 'image/x-icon',
  }
  const mime = mimeMap[ext] || 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
})

// Open file with default app
ipcMain.handle('open-file', async (_event, filePath: string) => {
  await shell.openPath(filePath)
})

// Rename
ipcMain.handle('rename-file', async (_event, oldPath: string, newPath: string) => {
  await fs.rename(oldPath, newPath)
})

// Create file/folder
ipcMain.handle('create-folder', async (_event, dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true })
})

ipcMain.handle('create-file', async (_event, filePath: string) => {
  await fs.writeFile(filePath, '', { flag: 'wx' }) // fail if exists
})

// File operations
ipcMain.handle('copy-files', async (_event, sources: string[], destDir: string) => {
  const results: { src: string; dest: string; error?: string }[] = []
  for (const src of sources) {
    const name = path.basename(src)
    const dest = path.join(destDir, name)
    try {
      await fs.cp(src, dest, { recursive: true, preserveTimestamps: true })
      // Preserve permissions
      const stat = await fs.stat(src)
      await fs.chmod(dest, stat.mode)
      results.push({ src, dest })
    } catch (e: any) {
      results.push({ src, dest, error: e.message })
    }
  }
  return results
})

ipcMain.handle('move-files', async (_event, sources: string[], destDir: string) => {
  const results: { src: string; dest: string; error?: string }[] = []
  for (const src of sources) {
    const name = path.basename(src)
    const dest = path.join(destDir, name)
    try {
      await fs.rename(src, dest)
      results.push({ src, dest })
    } catch (e: any) {
      // rename fails across devices, fall back to copy+delete
      try {
        await fs.cp(src, dest, { recursive: true, preserveTimestamps: true })
        const stat = await fs.stat(src)
        await fs.chmod(dest, stat.mode)
        await fs.rm(src, { recursive: true })
        results.push({ src, dest })
      } catch (e2: any) {
        results.push({ src, dest, error: e2.message })
      }
    }
  }
  return results
})

ipcMain.handle('trash-files', async (_event, paths: string[]) => {
  const results: { path: string; error?: string }[] = []
  for (const p of paths) {
    try {
      await shell.trashItem(p)
      results.push({ path: p })
    } catch (e: any) {
      results.push({ path: p, error: e.message })
    }
  }
  return results
})

ipcMain.handle('restore-from-trash', async (_event, items: { name: string; originalPath: string }[]) => {
  const home = app.getPath('home')
  const trashDir = process.platform === 'darwin'
    ? path.join(home, '.Trash')
    : path.join(home, '.local', 'share', 'Trash', 'files')
  const results: { path: string; error?: string }[] = []
  for (const item of items) {
    const trashPath = path.join(trashDir, item.name)
    try {
      await fs.rename(trashPath, item.originalPath)
      results.push({ path: item.originalPath })
    } catch (e: any) {
      results.push({ path: item.originalPath, error: e.message })
    }
  }
  return results
})

// Directory watching
const watchers = new Map<string, FSWatcher>()

ipcMain.on('watch-directory', (event, dirPath: string) => {
  if (watchers.has(dirPath)) return
  try {
    let debounce: ReturnType<typeof setTimeout> | null = null
    const watcher = watch(dirPath, () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
          wins[0].webContents.send(`fs-change-${dirPath}`)
        }
      }, 200)
    })
    watchers.set(dirPath, watcher)
  } catch {
    // Directory may not exist
  }
})

ipcMain.on('unwatch-directory', (_event, dirPath: string) => {
  const watcher = watchers.get(dirPath)
  if (watcher) {
    watcher.close()
    watchers.delete(dirPath)
  }
})

// Native drag
ipcMain.on('start-drag', (event, filePaths: string[]) => {
  if (filePaths.length === 0) return
  // Use the first file's icon as the drag image
  const icon = filePaths.length === 1
    ? app.getFileIcon(filePaths[0])
    : app.getFileIcon(filePaths[0])
  icon.then((nativeImage) => {
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon: nativeImage,
    })
  })
})

// PTY management
let ptyProcess: pty.IPty | null = null

ipcMain.handle('pty-spawn', (_event, cwd: string) => {
  if (ptyProcess) {
    ptyProcess.kill()
  }
  const shell = process.env.SHELL || '/bin/sh'
  ptyProcess = pty.spawn(shell, ['--login'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>,
  })
  ptyProcess.onData((data) => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      wins[0].webContents.send('pty-data', data)
    }
  })
  ptyProcess.onExit(() => {
    ptyProcess = null
  })
})

ipcMain.on('pty-write', (_event, data: string) => {
  ptyProcess?.write(data)
})

ipcMain.on('pty-resize', (_event, cols: number, rows: number) => {
  ptyProcess?.resize(cols, rows)
})

ipcMain.handle('pty-kill', () => {
  ptyProcess?.kill()
  ptyProcess = null
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
