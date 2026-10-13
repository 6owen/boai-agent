/*
 * [INPUT]: 主进程桌面偏好与操作系统登录项事实。
 * [OUTPUT]: 后台运行、登录启动的布尔白名单合同；不接受路径或命令。
 * [POS]: 桌面生命周期 IPC 类型。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
export type DesktopPreferences = { runInBackground: boolean; startHidden: boolean }
export type DesktopPatch = Partial<DesktopPreferences> & { openAtLogin?: boolean }
export type DesktopSettings = {
  revision: number
  preferences: DesktopPreferences
  trayAvailable: boolean
  login: { supported: boolean; enabled: boolean; status: 'enabled' | 'disabled' | 'requires-approval' | 'development' | 'unsupported' | 'error' }
  error?: string
}
