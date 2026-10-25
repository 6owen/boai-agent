/*
 * [OUTPUT]: Cookie菜单只返回profile标签/opaque id；菜单展开与来源刷新受Main核验，路径/凭据/导入确认留在Main。
 * [INPUT]: Electron contextBridge 与专用工具栏最小 API。
 * [OUTPUT]: 只给本地工具栏普通导航/停止加载/关闭状态桥；query instanceId 由 Main 真实 sender 复核，无操作权菜单。
 * [POS]: src/main/browser-toolbar-preload.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
/**
 * Preload script for browser toolbar windows.
 *
 * Exposes a minimal API for the React BrowserControls component
 * to send navigation actions and receive state updates from the
 * main process BrowserPaneManager.
 */

import { contextBridge, ipcRenderer } from 'electron'

const CHANNELS = {
  NAVIGATE: 'browser-toolbar:navigate',
  GO_BACK: 'browser-toolbar:go-back',
  GO_FORWARD: 'browser-toolbar:go-forward',
  RELOAD: 'browser-toolbar:reload',
  STOP: 'browser-toolbar:stop',
  DESTROY: 'browser-toolbar:destroy',
  STATE_UPDATE: 'browser-toolbar:state-update',
  THEME_COLOR: 'browser-toolbar:theme-color',
} as const

// Instance ID is passed via query parameter by BrowserPaneManager
const instanceId = new URLSearchParams(location.search).get('instanceId') || ''

contextBridge.exposeInMainWorld('browserToolbar', {
  instanceId,
  getState: () => ipcRenderer.invoke('browser-toolbar:get-state', instanceId),
  navigate: (url: string) => ipcRenderer.invoke(CHANNELS.NAVIGATE, instanceId, url),
  goBack: () => ipcRenderer.invoke(CHANNELS.GO_BACK, instanceId),
  goForward: () => ipcRenderer.invoke(CHANNELS.GO_FORWARD, instanceId),
  reload: () => ipcRenderer.invoke(CHANNELS.RELOAD, instanceId),
  stop: () => ipcRenderer.invoke(CHANNELS.STOP, instanceId),
  closeWindowEntirely: () => ipcRenderer.invoke(CHANNELS.DESTROY, instanceId),
  importCookies: (sourceId?: string) => ipcRenderer.invoke('browser-toolbar:import-cookies', instanceId, sourceId),
  listCookieSources: (refresh = false) => ipcRenderer.invoke('browser-toolbar:list-cookie-sources', instanceId, refresh),
  setCookieMenuOpen: (open: boolean) => ipcRenderer.invoke('browser-toolbar:cookie-menu-open', instanceId, open),
  onCookieMenuDismiss: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('browser-toolbar:cookie-menu-dismiss', handler)
    return () => { ipcRenderer.removeListener('browser-toolbar:cookie-menu-dismiss', handler) }
  },
  onStateUpdate: (callback: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on(CHANNELS.STATE_UPDATE, handler)
    return () => { ipcRenderer.removeListener(CHANNELS.STATE_UPDATE, handler) }
  },
  onThemeColor: (callback: (color: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, color: string | null) => callback(color)
    ipcRenderer.on(CHANNELS.THEME_COLOR, handler)
    return () => { ipcRenderer.removeListener(CHANNELS.THEME_COLOR, handler) }
  },
})
