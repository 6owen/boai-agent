/*
 * [INPUT]: Electron IPC 与 shared/ipc 合同。
 * [OUTPUT]: D6 无正文详情沿通用类型化 IPC 桥接；D6 有界个人历史/检索/阅读与锚点沿既有类型化请求桥接，不新增路径或执行权限。
 * [OUTPUT]: 类型化 IPC 支持只读待处理、原问题补充与显式成果验收资格；类型化请求沿主进程白名单支持本机 ID 的员工技能绑定/只读回执；无需新增任意路径能力。
 * [OUTPUT]: 受控的 window.boai 请求/订阅、真实 File 技能拖入授权及仅返回一次选择身份的材料拖入；不暴露任意路径注册。
 * [POS]: src/main/preload.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppEvent, DesktopApi } from '../shared/ipc'

const api: DesktopApi = {
  initialAppearance: ipcRenderer.sendSync('boai:appearance-initial'),
  selectSkillFile: (file, kind) => ipcRenderer.invoke('boai:skill-file', { path: webUtils.getPathForFile(file), kind }),
  selectMaterialFile: file => ipcRenderer.invoke('boai:material-file', { path: webUtils.getPathForFile(file) }),
  request: (method, input) => ipcRenderer.invoke('boai:request', { method, input }),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value)
    ipcRenderer.on('boai:event', handler)
    return () => ipcRenderer.removeListener('boai:event', handler)
  },
}
contextBridge.exposeInMainWorld('boai', api)
