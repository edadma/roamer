import { app, BrowserWindow, ipcMain, shell, globalShortcut } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { watch, readFileSync, type FSWatcher } from 'fs'
import { execSync } from 'child_process'
import * as pty from 'node-pty'

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

  win.once('ready-to-show', () => win.show())

  // Forward Escape key to renderer — Electron/Chromium swallows it on macOS
  globalShortcut.register('Escape', () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused) focused.webContents.send('escape-pressed')
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-home', () => {
  return app.getPath('home')
})

ipcMain.handle('get-cwd', () => {
  return process.cwd()
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
      try {
        const stat = await fs.stat(fullPath)
        size = stat.size
        modifiedAt = stat.mtime.toISOString()
        mode = stat.mode
        owner = `${getUserName(stat.uid)}:${getGroupName(stat.gid)}`
      } catch {
        // Broken symlink or permission denied
      }
      const ext = entry.isDirectory() ? '' : path.extname(entry.name).slice(1)
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
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

ipcMain.handle('get-file-url', (_event, filePath: string) => {
  return `file://${filePath}`
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
  ptyProcess = pty.spawn(shell, [], {
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
