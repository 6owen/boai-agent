/*
 * [INPUT]: Electron IPC 与 shared/ipc 合同。
 * [OUTPUT]: 受控的 window.boai 请求/订阅与真实 File 的技能拖入授权；不暴露任意路径注册方法。
 * [POS]: src/main/preload.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppEvent, DesktopApi } from '../shared/ipc'

const api: DesktopApi = {
  initialAppearance: ipcRenderer.sendSync('boai:appearance-initial'),
  selectSkillFile: (file, kind) => ipcRenderer.invoke('boai:skill-file', { path: webUtils.getPathForFile(file), kind }),
  request: (method, input) => ipcRenderer.invoke('boai:request', { method, input }),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value)
    ipcRenderer.on('boai:event', handler)
    return () => ipcRenderer.removeListener('boai:event', handler)
  },
}
contextBridge.exposeInMainWorld('boai', api)
