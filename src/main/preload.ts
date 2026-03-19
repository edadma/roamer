import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('roamer', {
  platform: process.platform,
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  getHome: () => ipcRenderer.invoke('get-home'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
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
