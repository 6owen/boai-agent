/*
 * [INPUT]: 浏览器原窗口投影与本地宿主授权回调。
 * [OUTPUT]: 无远程 RPC 的窗口/生命周期合同；网页不取得业务类型。
 * [POS]: src/main/browser/types.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface BrowserInstanceInfo {
  id: string; url: string; title: string; favicon: string | null; isLoading: boolean
  canGoBack: boolean; canGoForward: boolean; boundSessionId: string | null
  ownerType: 'session' | 'manual'; ownerSessionId: string | null; isVisible: boolean
  agentControlActive: boolean; themeColor: string | null; workspaceId?: string | null
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
  toolbarState: (instanceId: string) => Record<string, unknown>
  userControl: (instanceId: string, action: 'take' | 'resume' | 'stop' | 'hide' | 'close' | 'clear') => Promise<void>
}
