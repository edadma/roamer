import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import * as pty from 'node-pty'

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
      try {
        const stat = await fs.stat(fullPath)
        size = stat.size
        modifiedAt = stat.mtime.toISOString()
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
        extension: ext,
      }
    })
  )
  return results
})

// PTY management
let ptyProcess: pty.IPty | null = null

ipcMain.handle('pty-spawn', (_event, cwd: string) => {
  if (ptyProcess) {
    ptyProcess.kill()
  }
  const shell = process.env.SHELL || '/bin/zsh'
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
