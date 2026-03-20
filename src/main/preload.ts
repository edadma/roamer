import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('roamer', {
  platform: process.platform,
  dbInit: () => ipcRenderer.invoke('db-init'),
  dbGetPlaces: () => ipcRenderer.invoke('db-get-places'),
  dbAddPlace: (name: string, path: string) => ipcRenderer.invoke('db-add-place', name, path),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  getHome: () => ipcRenderer.invoke('get-home'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  getThumbnail: (filePath: string, mtime: string) => ipcRenderer.invoke('get-thumbnail', filePath, mtime),
  gitStatus: (dirPath: string) => ipcRenderer.invoke('git-status', dirPath),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  createFolder: (dirPath: string) => ipcRenderer.invoke('create-folder', dirPath),
  createFile: (filePath: string) => ipcRenderer.invoke('create-file', filePath),
  getFileInfo: (filePath: string) => ipcRenderer.invoke('get-file-info', filePath),
  readFilePreview: (filePath: string, maxBytes: number) => ipcRenderer.invoke('read-file-preview', filePath, maxBytes),
  readImageAsDataUrl: (filePath: string) => ipcRenderer.invoke('read-image-data-url', filePath),
  startDrag: (filePaths: string[]) => ipcRenderer.send('start-drag', filePaths),
  copyFiles: (sources: string[], destDir: string) => ipcRenderer.invoke('copy-files', sources, destDir),
  moveFiles: (sources: string[], destDir: string) => ipcRenderer.invoke('move-files', sources, destDir),
  trashFiles: (paths: string[]) => ipcRenderer.invoke('trash-files', paths),
  restoreFromTrash: (items: { name: string; originalPath: string }[]) => ipcRenderer.invoke('restore-from-trash', items),
  watchDirectory: (dirPath: string, callback: () => void) => {
    const channel = `fs-change-${dirPath}`
    const listener = () => callback()
    ipcRenderer.on(channel, listener)
    ipcRenderer.send('watch-directory', dirPath)
    return () => {
      ipcRenderer.removeListener(channel, listener)
      ipcRenderer.send('unwatch-directory', dirPath)
    }
  },
  ptySpawn: (cwd: string) => ipcRenderer.invoke('pty-spawn', cwd),
  ptyWrite: (data: string) => ipcRenderer.send('pty-write', data),
  ptyResize: (cols: number, rows: number) => ipcRenderer.send('pty-resize', cols, rows),
  ptyKill: () => ipcRenderer.invoke('pty-kill'),
  onEscape: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('escape-pressed', listener)
    return () => ipcRenderer.removeListener('escape-pressed', listener)
  },
  onPtyData: (callback: (data: string) => void) => {
    const listener = (_event: unknown, data: string) => callback(data)
    ipcRenderer.on('pty-data', listener)
    return () => ipcRenderer.removeListener('pty-data', listener)
  },
})
