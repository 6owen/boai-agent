import { contextBridge, ipcRenderer } from 'electron'
import type { AppEvent, DesktopApi } from '../shared/contracts'

const api: DesktopApi = {
  initialAppearance: ipcRenderer.sendSync('boai:appearance-initial'),
  request: (method, input) => ipcRenderer.invoke('boai:request', { method, input }),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value)
    ipcRenderer.on('boai:event', handler)
    return () => ipcRenderer.removeListener('boai:event', handler)
  },
}
contextBridge.exposeInMainWorld('boai', api)
