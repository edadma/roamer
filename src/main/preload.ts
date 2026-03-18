import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('roam', {
  platform: process.platform,
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  getHome: () => ipcRenderer.invoke('get-home'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
})
