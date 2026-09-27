/*
 * [INPUT]: Electron IPC 与 shared/ipc 合同。
 * [OUTPUT]: 受控的 window.boai 请求和订阅接口。
 * [POS]: src/main/preload.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { AppEvent, DesktopApi } from '../shared/ipc'

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
