import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('roamer', {
  platform: process.platform,
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  getHome: () => ipcRenderer.invoke('get-home'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  startDrag: (filePaths: string[]) => ipcRenderer.send('start-drag', filePaths),
  copyFiles: (sources: string[], destDir: string) => ipcRenderer.invoke('copy-files', sources, destDir),
  moveFiles: (sources: string[], destDir: string) => ipcRenderer.invoke('move-files', sources, destDir),
  trashFiles: (paths: string[]) => ipcRenderer.invoke('trash-files', paths),
  ptySpawn: (cwd: string) => ipcRenderer.invoke('pty-spawn', cwd),
  ptyWrite: (data: string) => ipcRenderer.send('pty-write', data),
  ptyResize: (cols: number, rows: number) => ipcRenderer.send('pty-resize', cols, rows),
  ptyKill: () => ipcRenderer.invoke('pty-kill'),
  onPtyData: (callback: (data: string) => void) => {
    const listener = (_event: unknown, data: string) => callback(data)
    ipcRenderer.on('pty-data', listener)
    return () => ipcRenderer.removeListener('pty-data', listener)
  },
})
