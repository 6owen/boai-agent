/*
 * [INPUT]: 浏览器原窗口投影与本地宿主授权回调。
 * [OUTPUT]: 普通窗口导航与关闭生命周期合同；可信工具栏人工导航沿原 scope 串行，网页不取得业务类型。
 * [POS]: src/main/browser/types.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface BrowserInstanceInfo {
  id: string; url: string; title: string; favicon: string | null; isLoading: boolean
  canGoBack: boolean; canGoForward: boolean; boundSessionId: string | null
  ownerType: 'session' | 'manual'; ownerSessionId: string | null; isVisible: boolean
  themeColor: string | null; workspaceId?: string | null
}
export interface BrowserInstanceSnapshot { id: string; boundSessionId: string | null; ownerSessionId: string | null; workspaceId: string | null; destroyed: boolean }
export interface BrowserManagerOptions {
  rendererDirectory: string; preloadPath: string; developmentUrl?: string
  sessionPathResolver?: (sessionId: string) => string | null
  accentColor?: (dark: boolean) => string
  allowNavigation: (instanceId: string, url: string) => boolean
  allowNetwork: (instanceId: string, url: string, resourceType: string) => boolean
  allowDownload: (instanceId: string, url: string) => boolean
  allowUserNavigation: (instanceId: string) => boolean
  userNavigation?: (instanceId: string, operation: () => Promise<void>) => Promise<void>
  toolbarState: (instanceId: string) => Record<string, unknown>
  userControl: (instanceId: string, action: 'close') => Promise<void>
}
