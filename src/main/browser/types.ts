/*
 * [OUTPUT]: 工具栏Cookie来源/导入回调只接可信实例、opaque来源ID和可重核sender，不接受路径/partition/Cookie值。
 * [INPUT]: 浏览器原窗口投影与本地宿主授权回调。
 * [OUTPUT]: 内置浏览器导航与关闭合同；每次下载固定原生保存或受管目录策略，网页不取得业务类型。
 * [POS]: src/main/browser/types.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { BrowserCookieImportReply, BrowserCookieSourceList } from '../../shared/ipc/browser'
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
  downloadPolicy: (instanceId: string, url: string) => { kind: 'native' } | { kind: 'managed'; directory: string } | null
  allowUserNavigation: (instanceId: string) => boolean
  userNavigation?: (instanceId: string, operation: () => Promise<void>) => Promise<void>
  toolbarState: (instanceId: string) => Record<string, unknown>
  userControl: (instanceId: string, action: 'close') => Promise<void>
  importCookies?: (instanceId: string, assertSender: () => void, sourceId?: string) => Promise<BrowserCookieImportReply>
  listCookieSources?: (instanceId: string, assertSender: () => void, refresh: boolean) => Promise<BrowserCookieSourceList>
}
