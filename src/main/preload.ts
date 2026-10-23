/*
 * [OUTPUT]: 消息复制经主窗口系统剪贴板桥完成，复制回执沿preload类型合同返回。
 * [OUTPUT]: 消息复制使用仅主窗口可调用的系统剪贴板写入桥，浏览器预览保留Web回退；成功后才显示已复制。
 * [OUTPUT]: 首帧带已核验插件启停快照，避免停用项在异步初始化前误激活。
 * [OUTPUT]: 工作视图的有界查询/原目标解析复用通用类型化请求桥，无额外窗口或路径接口。
 * [INPUT]: Electron IPC、真实 File/有界字节与 shared/ipc 合同。
 * [OUTPUT]: 截图/复制图片及无路径任意File有界上传至宿主私有来源；真实 paste 系统文件引用只返回身份/名称。
 * [OUTPUT]: D6 无正文详情沿通用类型化 IPC 桥接；D6 有界个人历史/检索/阅读与锚点沿既有类型化请求桥接，不新增路径或执行权限。
 * [OUTPUT]: 类型化 IPC 支持只读待处理、原问题补充与显式成果验收资格；类型化请求沿主进程白名单支持本机 ID 的员工技能绑定/只读回执；无需新增任意路径能力。
 * [OUTPUT]: 受控的 window.boai 请求/订阅、真实 File 技能拖入授权及仅返回一次选择身份的材料拖入；不暴露任意路径注册。
 * [POS]: src/main/preload.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppEvent, DesktopApi, MaterialFileSourceInput } from '../shared/ipc'
import { MATERIAL_LIMITS } from '../shared/domain/materials'

const api: DesktopApi = {
  initialPlugins: ipcRenderer.sendSync('boai:plugins-initial'),
  initialAppearance: ipcRenderer.sendSync('boai:appearance-initial'),
  selectSkillFile: (file, kind) => ipcRenderer.invoke('boai:skill-file', { path: webUtils.getPathForFile(file), kind }),
  selectMaterialFile: async file => {
    const path = webUtils.getPathForFile(file)
    let input: MaterialFileSourceInput
    if (path) input = { path }
    else {
      if (file.size > MATERIAL_LIMITS.attachmentBytes) throw new Error('附件大小不能超过 20 MiB')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength > MATERIAL_LIMITS.attachmentBytes) throw new Error('附件大小不能超过 20 MiB')
      input = { name: file.name || 'attachment', bytes }
    }
    return ipcRenderer.invoke('boai:material-file', input)
  },
  writeClipboardText: text => ipcRenderer.invoke('boai:clipboard-write-text', text),
  selectClipboardMaterialFiles: () => ipcRenderer.invoke('boai:clipboard-material-files'),
  request: (method, input) => ipcRenderer.invoke('boai:request', { method, input }),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: AppEvent) => listener(value)
    ipcRenderer.on('boai:event', handler)
    return () => ipcRenderer.removeListener('boai:event', handler)
  },
}
contextBridge.exposeInMainWorld('boai', api)
