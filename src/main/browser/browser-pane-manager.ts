/*
 * [OUTPUT]: BOAI就绪门禁等待Craft初始页面实际载入，初始化失败明确返回；移除会覆盖随后导航的迟到about:blank回退。
 * [OUTPUT]: Craft v0.15.1后台新帧捕获与不可见临时显示整段迁入；恢复原可见状态/节流，无法确认新帧则返回失败。
 * [OUTPUT]: Craft v0.15.1按键优先走CDP，已知Ctrl/Cmd等原生快捷键回退保留，应用统一窗口/登录与退出保持。
 * [INPUT]: Electron 与冻结的 Craft BrowserWindow / 三 BrowserView、CDP 算法；内置浏览器导航与下载策略。
 * [OUTPUT]: 固定地址栏布局/正常窗口缩放与网页输入；持久登录分区、沙箱与实际退出；人工下载沿原生保存，工具下载固定受管目录，工具退出仅取消受管下载；同ID重开拒绝旧窗口迟到回调。
 * [POS]: src/main/browser/browser-pane-manager.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
// Apache-2.0; adapted from Craft Docs Ltd. apps/electron/src/main/browser-pane-manager.ts. See LICENSE.txt, NOTICE.txt and source-manifest.json.
/**
 * BrowserPaneManager
 *
 * Owns browser instances as dedicated BrowserWindow objects.
 * Each instance maps 1:1 to a full native window while preserving
 * the built-in browser's persistent cookie partition and CDP automation support.
 */

import { join, parse as parsePath, basename, relative, isAbsolute } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { screen, BrowserView, BrowserWindow, ipcMain, nativeTheme, session, type Session as ElectronSession, type DownloadItem, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { mainLog } from './logger'
import { BrowserCDP, type AccessibilitySnapshot, type ElementGeometry } from './browser-cdp'
import type { BrowserInstanceInfo, BrowserInstanceSnapshot, BrowserManagerOptions } from './types'

export type { BrowserInstanceInfo }

const VITE_DEV_SERVER_URL = process.env.BOAI_RENDERER_URL
const TOOLBAR_LOAD_MAX_RETRIES = 4
const TOOLBAR_LOAD_RETRY_DELAY_MS = 500
const TOOLBAR_HEIGHT = 48
const MAX_CONSOLE_LOG_ENTRIES = 500
const MAX_NETWORK_LOG_ENTRIES = 500
const MAX_DOWNLOAD_LOG_ENTRIES = 200
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const DEFAULT_WAIT_POLL_MS = 100
/** How long a capture waits for the page to paint (two animation frames) before calling it stale. */
const SCREENSHOT_FRAME_TIMEOUT_MS = 400
const SCREENSHOT_RESCUE_FRAME_TIMEOUT_MS = 1_000

const SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS = 3
const SCREENSHOT_RETRY_DELAY_MS = 120
const SCREENSHOT_RESCUE_PAINT_DELAY_MS = 180
const SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS = 1_000
const SCREENSHOT_NETWORK_IDLE_MS = 300
const THEME_COLOR_SIGNAL_PREFIX = '__craft_theme_color__:'
const THEME_COLOR_NULL_SENTINEL = '__NULL__'
const THEME_OBSERVER_MIN_INTERVAL_MS = 120
const EARLY_THEME_EXTRACTION_DELAY_MS = 100
const BROWSER_EMPTY_STATE_PAGE = 'browser-empty-state.html'

const THEME_COLOR_EXTRACTOR_FN = String.raw`
() => {
  const toHex = (r, g, b) => '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

  const parseColor = (str) => {
    if (!str) return null;
    str = str.trim();
    const hm = /^#([0-9a-f]{3,8})$/i.exec(str);
    if (hm) {
      const h = hm[1];
      let r, g, b;
      if (h.length === 3) { r = parseInt(h[0]+h[0],16); g = parseInt(h[1]+h[1],16); b = parseInt(h[2]+h[2],16); }
      else if (h.length >= 6) { r = parseInt(h.slice(0,2),16); g = parseInt(h.slice(2,4),16); b = parseInt(h.slice(4,6),16); }
      else return null;
      return toHex(r, g, b);
    }
    const rm = str.match(/rgba?[\(]\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (rm) return toHex(+rm[1], +rm[2], +rm[3]);
    return null;
  };

  const parseBg = (el) => {
    if (!el) return null;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return null;
    return parseColor(bg);
  };

  // 1. theme-color meta — respect media attribute for light/dark
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  for (const m of metas) {
    const media = m.getAttribute('media');
    if (media && !window.matchMedia(media).matches) continue;
    const c = parseColor(m.content);
    if (c) return c;
  }

  // 2. Safari-like approach: sample fixed/sticky elements at viewport top-center
  const els = document.elementsFromPoint(window.innerWidth / 2, 4);
  for (const el of els) {
    if (el === document.documentElement || el === document.body) continue;
    const style = getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.8) continue;
    const c = parseBg(el);
    if (c) return c;
  }

  // 3. Fallback: body then html
  return parseBg(document.body) || parseBg(document.documentElement) || null;
}
`

/** IPC channels for the browser toolbar preload */
const TOOLBAR_CHANNELS = {
  NAVIGATE: 'browser-toolbar:navigate',
  GO_BACK: 'browser-toolbar:go-back',
  GO_FORWARD: 'browser-toolbar:go-forward',
  RELOAD: 'browser-toolbar:reload',
  STOP: 'browser-toolbar:stop',
  DESTROY: 'browser-toolbar:destroy',
  STATE_UPDATE: 'browser-toolbar:state-update',
  THEME_COLOR: 'browser-toolbar:theme-color',
} as const
const UI_SESSION_PARTITION = 'boai:browser-ui'

interface BrowserInstance {
  rendersWhileHidden?: boolean
  documentRevision?: number
  id: string
  window: BrowserWindow
  toolbarView: BrowserView
  pageView: BrowserView
  nativeOverlayView: BrowserView
  /** BrowserView getters may be cleared on window destruction; retain actual contents until exit. */
  ownedWebContents: WebContents[]
  cdp: BrowserCDP
  currentUrl: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  boundSessionId: string | null
  ownerType: 'session' | 'manual'
  ownerSessionId: string | null
  /**
   * Workspace this instance is associated with, or `null` for unbound manual
   * windows. Renderers in other workspaces filter such entries out of the tab
   * strip / status badge. Stamped at create-time (or first bind) — once non-null,
   * subsequent rebinds may overwrite it with the new binder's workspace.
   */
  workspaceId: string | null
  isVisible: boolean
  isHiding: boolean
  toolbarReady: boolean
  showOnCreate: boolean
  pendingShowOnReady: boolean
  pendingShowToken: number
  lastAction: LastBrowserAction | null
  themeColor: string | null
  inPageThemeTimer: ReturnType<typeof setTimeout> | null
  themeObserverToken: string | null
  consoleLogs: BrowserConsoleEntry[]
  networkLogs: BrowserNetworkEntry[]
  downloads: BrowserDownloadEntry[]
  lastLaunchToken: string | null
  partition: string
  downloadDirectory: string | null
  toolbarError: string | null
  initialPageReady: boolean
  initialPageError: string | null
  activeDownloads: Map<string, { item: DownloadItem; done: Promise<void>; kind: 'native' | 'managed' }>
  loadDone: Promise<void> | null
  resolveLoadDone: (() => void) | null
}

export interface CreateBrowserInstanceOptions {
  partition: string
  downloadDirectory?: string
  show?: boolean
  ownerType?: 'session' | 'manual'
  ownerSessionId?: string
  workspaceId?: string | null
}

export interface BrowserScreenshotOptions {
  mode?: 'raw' | 'agent'
  refs?: string[]
  includeLastAction?: boolean
  includeMetadata?: boolean
  /** Annotate screenshot with @eN labels on all interactive elements from accessibility tree */
  annotate?: boolean
  format?: 'png' | 'jpeg'
  jpegQuality?: number
}

export interface BrowserConsoleEntry {
  timestamp: number
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
}

export interface BrowserConsoleOptions {
  level?: 'all' | BrowserConsoleEntry['level']
  limit?: number
}

export interface BrowserScreenshotRegionTarget {
  x?: number
  y?: number
  width?: number
  height?: number
  ref?: string
  selector?: string
  padding?: number
  format?: 'png' | 'jpeg'
  jpegQuality?: number
}

export interface BrowserNetworkEntry {
  timestamp: number
  method: string
  url: string
  status: number
  resourceType: string
  ok: boolean
}

export interface BrowserNetworkOptions {
  limit?: number
  status?: 'all' | 'failed' | '2xx' | '3xx' | '4xx' | '5xx'
  method?: string
  resourceType?: string
}

export interface BrowserWaitArgs {
  kind: 'selector' | 'text' | 'url' | 'network-idle'
  value?: string
  timeoutMs?: number
  pollMs?: number
  idleMs?: number
}

export interface BrowserWaitResult {
  ok: true
  kind: BrowserWaitArgs['kind']
  elapsedMs: number
  detail: string
}

export interface BrowserKeyArgs {
  key: string
  modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>
}

export interface BrowserDownloadEntry {
  id: string
  timestamp: number
  url: string
  filename: string
  state: 'started' | 'completed' | 'interrupted' | 'cancelled'
  bytesReceived: number
  totalBytes: number
  mimeType: string
  savePath?: string
}

export interface BrowserDownloadOptions {
  action?: 'list' | 'wait'
  limit?: number
  timeoutMs?: number
}

export interface BrowserScreenshotResult {
  imageBuffer: Buffer
  imageFormat: 'png' | 'jpeg'
  metadata?: {
    mode: 'raw' | 'agent'
    viewport?: {
      width: number
      height: number
      dpr: number
      scrollX: number
      scrollY: number
    }
    targets?: Array<{
      ref: string
      role?: string
      name?: string
      box: { x: number; y: number; width: number; height: number }
      clickPoint: { x: number; y: number }
    }>
    action?: {
      tool: string
      ref?: string
      status: 'succeeded' | 'failed'
      timestamp: number
    }
    annotationPartial?: boolean
    warnings?: string[]
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    targetMode?: 'coords' | 'ref' | 'selector'
  }
}

interface LastBrowserAction {
  tool: string
  ref?: string
  status: 'succeeded' | 'failed'
  geometry?: ElementGeometry
  timestamp: number
}

let instanceCounter = 0

export class BrowserPaneManager {
  constructor(private readonly options: BrowserManagerOptions) {}

  private instances: Map<string, BrowserInstance> = new Map()
  private destroyingIds: Set<string> = new Set()
  private destroyPromises = new Map<string, Promise<void>>()
  private stateChangeCallback: ((info: BrowserInstanceInfo) => void) | null = null
  private removedCallback: ((id: string) => void) | null = null
  private interactedCallback: ((id: string) => void) | null = null
  private permissionSessions = new WeakSet<ElectronSession>()
  private observerSessions = new WeakSet<ElectronSession>()
  private inFlightRequestsByWebContentsId = new Map<number, number>()
  private lastNetworkActivityByWebContentsId = new Map<number, number>()
  private popupWindowsByParentInstanceId = new Map<string, Set<BrowserWindow>>()
  private popupParentByWebContentsId = new Map<number, string>()
  private popupWebContentsIds = new WeakMap<BrowserWindow, number>()
  onStateChange(callback: (info: BrowserInstanceInfo) => void): void {
    this.stateChangeCallback = callback
  }

  onRemoved(callback: (id: string) => void): void {
    this.removedCallback = callback
  }

  onInteracted(callback: (id: string) => void): void {
    this.interactedCallback = callback
  }

  createInstance(id?: string, options?: CreateBrowserInstanceOptions): string {
    const instanceId = id || `browser-${++instanceCounter}`
    const shouldShow = options?.show ?? false
    const ownerType = options?.ownerType ?? 'manual'
    const ownerSessionId = ownerType === 'session' ? (options?.ownerSessionId ?? null) : null
    const workspaceId = options?.workspaceId ?? null

    if (this.instances.has(instanceId)) {
      mainLog.warn(`[browser-pane] Instance already exists, reusing: ${instanceId}`)
      return instanceId
    }

    if (!options?.partition?.startsWith('persist:boai-browser-')) throw new Error('浏览器作用域分区无效')
    const partition = options.partition
    const ses = session.fromPartition(partition)
    const uiSession = session.fromPartition(UI_SESSION_PARTITION)
    this.setupSessionPermissions(uiSession)
    this.setupSessionPermissions(ses)
    this.setupSessionObservers(ses)

    // Match background to current OS theme to prevent black/white flash on open
    const bgColor = nativeTheme.shouldUseDarkColors ? '#2b292e' : '#fafafb'

    const window = new BrowserWindow({
      width: 1200,
      height: 900,
      minWidth: 700,
      minHeight: 500,
      show: false, // Always hidden until toolbar is painted (ready-to-show)
      backgroundColor: bgColor,
      // Fully chromeless — toolbar is rendered in a dedicated BrowserView
      frame: false,
      webPreferences: {
        partition,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const toolbarView = new BrowserView({
      webPreferences: {
        preload: this.options.preloadPath,
        partition: UI_SESSION_PARTITION,
        session: uiSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const pageView = new BrowserView({
      webPreferences: {
        partition,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const supportsMultiView = typeof window.addBrowserView === 'function' && typeof window.setTopBrowserView === 'function'
    if (!supportsMultiView) {
      throw new Error('[browser-pane] Native overlay requires BrowserWindow.addBrowserView + setTopBrowserView')
    }

    const nativeOverlayView = new BrowserView({
      webPreferences: {
        partition: UI_SESSION_PARTITION,
        session: uiSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    // Set BrowserView backgrounds to match theme so about:blank doesn't flash white
    const toolbarWcWithBg = toolbarView.webContents as typeof toolbarView.webContents & { setBackgroundColor?: (color: string) => void }
    toolbarWcWithBg.setBackgroundColor?.('#00000000')
    const pageWcWithBg = pageView.webContents as typeof pageView.webContents & { setBackgroundColor?: (color: string) => void }
    pageWcWithBg.setBackgroundColor?.(bgColor)
    const overlayWcWithBg = nativeOverlayView.webContents as typeof nativeOverlayView.webContents & { setBackgroundColor?: (color: string) => void }
    overlayWcWithBg.setBackgroundColor?.('#00000000')

    const cdp = new BrowserCDP(pageView.webContents)

    const instance: BrowserInstance = {
      id: instanceId,
      window,
      toolbarView,
      ownedWebContents: [toolbarView.webContents, pageView.webContents, nativeOverlayView.webContents],
      pageView,
      nativeOverlayView,
      cdp,
      currentUrl: 'about:blank',
      title: 'New Tab',
      favicon: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      boundSessionId: ownerSessionId,
      ownerType,
      ownerSessionId,
      workspaceId,
      isVisible: false,
      isHiding: false,
      toolbarReady: false,
      showOnCreate: shouldShow,
      pendingShowOnReady: false,
      pendingShowToken: 0,
      lastAction: null,
      themeColor: null,
      inPageThemeTimer: null,
      themeObserverToken: null,
      consoleLogs: [],
      networkLogs: [],
      downloads: [],
      lastLaunchToken: null,
      partition, downloadDirectory: options.downloadDirectory ?? null, toolbarError: null,
      initialPageReady: false, initialPageError: null,
      activeDownloads: new Map(), loadDone: null, resolveLoadDone: null,
    }

    const defaultUa = pageView.webContents.userAgent || ''
    const sanitizedUa = defaultUa.replace(/\sElectron\/[^\s]+/g, '')
    if (sanitizedUa && sanitizedUa !== defaultUa) {
      pageView.webContents.setUserAgent(sanitizedUa)
    }

    window.addBrowserView(pageView)
    // Retain ownership of the third sandboxed view for actual-exit accounting;
    // it stays zero-sized and never paints a shield or intercepts page input.
    window.addBrowserView(nativeOverlayView)
    nativeOverlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    window.addBrowserView(toolbarView)
    window.setTopBrowserView(toolbarView)

    this.instances.set(instanceId, instance)
    this.layoutAllViews(instance)

    this.setupWindowListeners(instance)
    this.emitStateChange(instance)
    mainLog.info(`[browser-pane] toolbar version: v4-react-chromeless`)
    mainLog.info(`[browser-pane] Created instance: ${instanceId} (show=${shouldShow}, ownerType=${ownerType}, ownerSessionId=${ownerSessionId ?? 'none'})`)

    void this.loadToolbarPage(instance).catch((error) => {
      instance.toolbarError = error instanceof Error ? error.message : String(error)
      this.emitStateChange(instance)
    })
    void this.loadEmptyStatePage(instance).then(() => {
      instance.initialPageReady = true
    }).catch((error) => {
      mainLog.warn(`[browser-pane] empty-state load failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
      instance.initialPageError = error instanceof Error ? error.message : String(error)
      this.emitStateChange(instance)
    })

    return instanceId
  }

  destroyInstance(id: string): Promise<void> {
    const existing = this.destroyPromises.get(id)
    if (existing) return existing
    const pending = this.destroyActualInstance(id).finally(() => this.destroyPromises.delete(id))
    this.destroyPromises.set(id, pending)
    return pending
  }

  private async destroyActualInstance(id: string): Promise<void> {
    const instance = this.instances.get(id)
    if (!instance) return
    await this.cancelDownloads(id)
    this.stop(id)
    await this.waitForLoads(id)
    await instance.cdp.drain()
    if (instance.inPageThemeTimer) clearTimeout(instance.inPageThemeTimer)
    instance.inPageThemeTimer = null; instance.themeObserverToken = null
    instance.pendingShowOnReady = false; instance.pendingShowToken += 1
    this.closePopupsForParent(instance.id, 'parent_destroy')
    this.destroyingIds.add(id)
    if (!instance.window.isDestroyed()) instance.window.destroy()
    if (!instance.window.isDestroyed()) throw new Error('浏览器窗口仍未实际关闭，请核对')
    for (const contents of instance.ownedWebContents) {
      if (!contents.isDestroyed()) {
        const closed = new Promise<void>(resolve => contents.once('destroyed', resolve))
        contents.close({ waitForBeforeUnload: false })
        if (!contents.isDestroyed()) await closed
      }
      if (!contents.isDestroyed()) throw new Error('浏览器页面仍未实际退出，请核对')
    }
    this.finalizeDestroyedInstance(instance, 'destroy')
  }

  async ready(id: string): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < 8000) {
      const instance = this.requireAliveInstance(id)
      if (instance.toolbarError) throw new Error(`浏览器工具栏加载失败：${instance.toolbarError}`)
      if (instance.initialPageError) throw new Error(`浏览器初始页面加载失败：${instance.initialPageError}`)
      if (instance.toolbarReady && instance.initialPageReady) return
      await this.sleep(25)
    }
    throw new Error('浏览器工具栏或初始页面尚未准备完成')
  }

  async waitForLoads(id: string): Promise<void> {
    const instance = this.instances.get(id)
    if (instance?.loadDone) await instance.loadDone
  }

  async cancelDownloads(id: string, options: { managedOnly?: boolean } = {}): Promise<void> {
    const instance = this.instances.get(id)
    if (!instance) return
    const downloads = [...instance.activeDownloads.values()].filter(entry => !options.managedOnly || entry.kind === 'managed')
    for (const entry of downloads) entry.item.cancel()
    await Promise.all(downloads.map(entry => entry.done))
  }

  getInstance(id: string): BrowserInstance | undefined {
    return this.instances.get(id)
  }

  private cleanupDestroyedInstance(instance: BrowserInstance, reason: string): void {
    this.finalizeDestroyedInstance(instance, 'closed')
    mainLog.info(`[browser-pane] cleaned up stale instance ${instance.id}: ${reason}`)
  }

  /**
   * Get an instance that is confirmed alive (window not destroyed).
   * Throws a clear error if the instance is missing or its window was closed.
   * Automatically cleans up stale entries from the instance map.
   */
  private requireAliveInstance(id: string): BrowserInstance {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Browser instance not found: ${id}`)
    if (instance.window.isDestroyed()) {
      this.cleanupDestroyedInstance(instance, `lookup by id ${id}`)
      throw new Error(`Browser window was closed (instance: ${id})`)
    }
    return instance
  }

  listInstances(): BrowserInstanceInfo[] {
    const infos: BrowserInstanceInfo[] = []
    for (const instance of this.instances.values()) {
      if (instance.window.isDestroyed()) {
        this.cleanupDestroyedInstance(instance, 'listInstances')
        continue
      }
      infos.push(this.toInfo(instance))
    }
    return infos
  }

  async listInstancesAsync(): Promise<BrowserInstanceInfo[]> {
    return this.listInstances()
  }

  async getInstanceAsync(id: string): Promise<BrowserInstanceSnapshot | undefined> {
    const instance = this.getInstance(id)
    return instance ? {id:instance.id,boundSessionId:instance.boundSessionId,ownerSessionId:instance.ownerSessionId,workspaceId:instance.workspaceId,destroyed:instance.window.isDestroyed()} : undefined
  }

  async createForSessionAsync(
    sessionId: string,
    options?: { show?: boolean; workspaceId?: string | null },
  ): Promise<string> {
    return this.createForSession(sessionId, options)
  }

  async getOrCreateForSessionAsync(
    sessionId: string,
    options?: { workspaceId?: string | null },
  ): Promise<string> {
    return this.getOrCreateForSession(sessionId, options)
  }

  async focusBoundForSessionAsync(
    sessionId: string,
    options?: { workspaceId?: string | null },
  ): Promise<string> {
    return this.focusBoundForSession(sessionId, options)
  }

  getWindowCount(): number {
    return this.instances.size
  }

  getBrowserWindows(): BrowserWindow[] {
    return Array.from(this.instances.values())
      .map((instance) => instance.window)
      .filter((win) => !win.isDestroyed())
  }

  async navigate(id: string, url: string): Promise<{ url: string; title: string }> {
    await this.ready(id)
    const instance = this.requireAliveInstance(id)

    let normalizedUrl = url.trim()
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl)
    const isAbout = normalizedUrl.startsWith('about:')
    if (!hasScheme && !isAbout) {
      const looksLikeHost = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:\/|$)/i.test(normalizedUrl)
      if (looksLikeHost) {
        normalizedUrl = `https://${normalizedUrl}`
      } else {
        normalizedUrl = `https://duckduckgo.com/?q=${encodeURIComponent(normalizedUrl)}`
      }
    }

    const parsed = new URL(normalizedUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('只支持无凭据的 HTTP/HTTPS 网页地址')
    if (!this.options.allowNavigation?.(instance.id, normalizedUrl)) throw new Error('当前浏览任务未获准该网页来源')
    const loaded = instance.pageView.webContents.loadURL(normalizedUrl)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([loaded, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { instance.pageView.webContents.stop(); reject(new Error('网页导航超时，已停止加载')) }, 30_000)
      })])
      this.pushToolbarState(instance)
      return { url: instance.pageView.webContents.getURL(), title: instance.pageView.webContents.getTitle() }
    } catch (error) {
      instance.pageView.webContents.stop()
      await loaded.catch(() => undefined)
      throw error
    } finally { if (timer) clearTimeout(timer) }
  }

  async goBack(id: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    if (instance.pageView.webContents.navigationHistory.canGoBack()) {
      instance.pageView.webContents.navigationHistory.goBack()
    }
  }

  async goForward(id: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    if (instance.pageView.webContents.navigationHistory.canGoForward()) {
      instance.pageView.webContents.navigationHistory.goForward()
    }
  }

  reload(id: string): void {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return
    instance.pageView.webContents.reload()
  }

  stop(id: string): void {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return
    instance.pageView.webContents.stop()
  }

  focus(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) return

    const win = instance.window
    if (win.isDestroyed()) return

    // If toolbar hasn't painted yet, defer showing until markToolbarReady runs.
    // Token guard prevents stale deferred focus from showing after hide/destroy.
    if (!instance.toolbarReady) {
      if (instance.pendingShowOnReady) return
      instance.pendingShowOnReady = true
      const token = ++instance.pendingShowToken
      mainLog.info(`[browser-pane] focus deferred until ready id=${instance.id} token=${token}`)
      return
    }

    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()

    instance.isVisible = true
    this.emitStateChange(instance)
  }

  hide(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) return

    // Re-entrancy guard: bail if a hide is already in progress. Prevents the
    // 'close' listener from re-entering hide() during teardown, which can crash
    // Chromium's compositor when the BrowserView is mid-load.
    if (instance.isHiding) return

    const win = instance.window
    if (win.isDestroyed()) return

    instance.isHiding = true

    // Cancel any deferred show request queued before toolbar was ready.
    if (instance.pendingShowOnReady) {
      instance.pendingShowOnReady = false
      instance.pendingShowToken += 1
    }


    win.hide()

    instance.isVisible = false

    // Defer the state-change callback so native window teardown completes before
    // listeners (which may touch BrowserView/Chromium internals) run.
    queueMicrotask(() => {
      instance.isHiding = false
      this.emitStateChange(instance)
    })
  }

  async getAccessibilitySnapshot(id: string): Promise<AccessibilitySnapshot> {
    const instance = this.requireAliveInstance(id)
    return instance.cdp.getAccessibilitySnapshot()
  }

  async clickAtCoordinates(id: string, x: number, y: number): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.clickAtCoordinates(x, y)
      instance.lastAction = {
        tool: 'browser_click_at',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_click_at',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async drag(id: string, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.drag(x1, y1, x2, y2)
      instance.lastAction = {
        tool: 'browser_drag',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_drag',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async typeText(id: string, text: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.typeText(text)
      instance.lastAction = {
        tool: 'browser_type',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_type',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async setClipboard(id: string, text: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    await instance.cdp.setClipboard(text)
  }

  async getClipboard(id: string): Promise<string> {
    const instance = this.requireAliveInstance(id)
    return instance.cdp.getClipboard()
  }

  async clickElement(
    id: string,
    ref: string,
    options?: { waitFor?: 'none' | 'navigation' | 'network-idle'; timeoutMs?: number }
  ): Promise<import('../../runtime/adapters/mastra/browser-tool-types').BrowserClickResult> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.clickElement(ref)
      instance.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }

      const waitFor = options?.waitFor ?? 'none'
      if (waitFor === 'navigation') {
        const timeoutMs = Math.max(100, options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup()
            reject(new Error(
              `Click navigation wait timed out after ${timeoutMs}ms (no navigation event observed). `
              + `Tip: retry with "click ${ref}" (no navigation wait), then use "wait url <pattern>" or "wait network-idle".`
            ))
          }, timeoutMs)

          const onNav = () => {
            cleanup()
            resolve()
          }

          const cleanup = () => {
            clearTimeout(timer)
            instance.pageView.webContents.removeListener('did-navigate', onNav)
            instance.pageView.webContents.removeListener('did-navigate-in-page', onNav)
          }

          instance.pageView.webContents.once('did-navigate', onNav)
          instance.pageView.webContents.once('did-navigate-in-page', onNav)
        })
      } else if (waitFor === 'network-idle') {
        await this.waitFor(id, { kind: 'network-idle', timeoutMs: options?.timeoutMs })
      }
      return {via:geometry.via,note:geometry.note}
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async fillElement(id: string, ref: string, value: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.fillElement(ref, value)
      instance.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async selectOption(id: string, ref: string, value: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.selectOption(ref, value)
      instance.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async screenshot(id: string, options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult> {
    const instance = this.requireAliveInstance(id)

    // When annotating, force agent mode and gather refs from accessibility tree
    const annotate = !!options?.annotate
    const mode = (annotate || options?.mode === 'agent') ? 'agent' : 'raw'

    if (mode === 'raw') {
      const viewport = await instance.cdp.getViewportMetrics()
      const captured = await this.capturePageWithRecovery(instance, {
        mode,
        errorPrefix: 'screenshot',
        dpr: viewport.dpr,
        format: options?.format,
        jpegQuality: options?.jpegQuality,
      })

      return {
        imageBuffer: captured.imageBuffer,
        imageFormat: captured.imageFormat,
        metadata: options?.includeMetadata
          ? {
            mode: 'raw',
            warnings: captured.warnings.length > 0 ? captured.warnings : undefined,
          }
          : undefined,
      }
    }

    const warnings: string[] = []
    const geometries: ElementGeometry[] = []

    const MAX_ANNOTATED_REFS = 100
    let refs = options?.refs ?? []

    if (annotate) {
      try {
        const snapshot = await instance.cdp.getAccessibilitySnapshot()
        refs = snapshot.nodes.map((node) => node.ref).slice(0, MAX_ANNOTATED_REFS)
        if (snapshot.nodes.length > MAX_ANNOTATED_REFS) {
          warnings.push(`Annotation capped at ${MAX_ANNOTATED_REFS} of ${snapshot.nodes.length} elements`)
        }
      } catch (error) {
        warnings.push(`Accessibility snapshot for annotation failed: ${error instanceof Error ? error.message : String(error)}`)
        refs = []
      }
    }

    const settled = await Promise.allSettled(
      refs.map((ref) => instance.cdp.getElementGeometry(ref)),
    )

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]!
      if (result.status === 'fulfilled') {
        geometries.push(result.value)
      } else if (!annotate) {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
        warnings.push(`Could not resolve ref ${refs[i]}: ${reason}`)
      }
    }

    if (options?.includeLastAction && instance.lastAction?.geometry) {
      geometries.push(instance.lastAction.geometry)
    }

    const metadataText = instance.lastAction
      ? `${instance.lastAction.tool} • ${instance.lastAction.status} • ${new Date(instance.lastAction.timestamp).toISOString()}`
      : `browser_screenshot • ${new Date().toISOString()}`

    let annotationPartial = false

    try {
      if (geometries.length > 0 || options?.includeMetadata) {
        await instance.cdp.renderTemporaryOverlay({
          geometries,
          includeMetadata: !!options?.includeMetadata,
          metadataText,
          includeClickPoints: true,
        })
      }
    } catch (error) {
      annotationPartial = true
      warnings.push(`Annotation overlay failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    try {
      const viewport = await instance.cdp.getViewportMetrics()
      const captured = await this.capturePageWithRecovery(instance, {
        mode,
        errorPrefix: 'screenshot',
        dpr: viewport.dpr,
        format: options?.format,
        jpegQuality: options?.jpegQuality,
      })

      if (captured.warnings.length > 0) {
        warnings.push(...captured.warnings)
      }

      return {
        imageBuffer: captured.imageBuffer,
        imageFormat: captured.imageFormat,
        metadata: {
          mode: 'agent',
          viewport,
          targets: geometries.map((g) => ({
            ref: g.ref,
            role: g.role,
            name: g.name,
            box: g.box,
            clickPoint: g.clickPoint,
          })),
          action: instance.lastAction
            ? {
              tool: instance.lastAction.tool,
              ref: instance.lastAction.ref,
              status: instance.lastAction.status,
              timestamp: instance.lastAction.timestamp,
            }
            : undefined,
          annotationPartial,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      }
    } finally {
      try {
        await instance.cdp.clearTemporaryOverlay()
      } catch {
        // ignore cleanup errors
      }
    }
  }

  async screenshotRegion(id: string, target: BrowserScreenshotRegionTarget): Promise<BrowserScreenshotResult> {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Browser instance not found: ${id}`)

    const hasCoords = [target.x, target.y, target.width, target.height].every((v) => typeof v === 'number')
    const hasRef = typeof target.ref === 'string' && target.ref.length > 0
    const hasSelector = typeof target.selector === 'string' && target.selector.length > 0

    const modeCount = [hasCoords, hasRef, hasSelector].filter(Boolean).length
    if (modeCount === 0) {
      throw new Error('Region screenshot requires either coordinates, ref, or selector')
    }
    if (modeCount > 1) {
      throw new Error('Region screenshot target is ambiguous. Provide only one of coordinates, ref, or selector')
    }

    let box: { x: number; y: number; width: number; height: number }

    if (hasRef) {
      const geometry = await instance.cdp.getElementGeometry(String(target.ref))
      box = { ...geometry.box }
    } else if (hasSelector) {
      const geometry = await instance.cdp.getElementGeometryBySelector(String(target.selector))
      box = { ...geometry.box }
    } else {
      box = {
        x: Number(target.x),
        y: Number(target.y),
        width: Number(target.width),
        height: Number(target.height),
      }
    }

    const padding = Math.max(0, Number(target.padding ?? 0))
    box = {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    }

    const viewport = await instance.cdp.getViewportMetrics()

    const clippedX = Math.max(0, Math.floor(box.x))
    const clippedY = Math.max(0, Math.floor(box.y))
    const maxWidth = Math.max(0, Math.floor(viewport.width - clippedX))
    const maxHeight = Math.max(0, Math.floor(viewport.height - clippedY))
    const clippedWidth = Math.min(Math.max(1, Math.floor(box.width)), maxWidth)
    const clippedHeight = Math.min(Math.max(1, Math.floor(box.height)), maxHeight)

    if (maxWidth <= 0 || maxHeight <= 0 || clippedWidth <= 0 || clippedHeight <= 0) {
      throw new Error('Resolved screenshot region is outside the current viewport')
    }

    const captured = await this.capturePageWithRecovery(instance, {
      mode: 'region',
      errorPrefix: 'region screenshot',
      rect: {
        x: clippedX,
        y: clippedY,
        width: clippedWidth,
        height: clippedHeight,
      },
      dpr: viewport.dpr,
      format: target.format,
      jpegQuality: target.jpegQuality,
    })

    return {
      imageBuffer: captured.imageBuffer,
      imageFormat: captured.imageFormat,
      metadata: {
        mode: 'raw',
        viewport,
        region: {
          x: clippedX,
          y: clippedY,
          width: clippedWidth,
          height: clippedHeight,
        },
        targetMode: hasRef ? 'ref' : hasSelector ? 'selector' : 'coords',
        warnings: captured.warnings.length > 0 ? captured.warnings : undefined,
      },
    }
  }

  private async capturePageWithRecovery(
    instance: BrowserInstance,
    options: {
      mode: 'raw' | 'agent' | 'region'
      errorPrefix: 'screenshot' | 'region screenshot'
      rect?: { x: number; y: number; width: number; height: number }
      dpr?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<{ imageBuffer: Buffer; imageFormat: 'png' | 'jpeg'; warnings: string[] }> {
    // A hidden page stops painting. Captured while its surface lingers, it gave its last frame,
    // which agents took for the current page (found 2026-10-11); later the surface is gone and
    // capturePage fails. Unthrottled it keeps painting while it can; hidden captures are used only
    // once it has painted, otherwise the window is shown invisibly for the capture.
    const unthrottledForCapture = !instance.rendersWhileHidden
    if (unthrottledForCapture) this.setRendersWhileHidden(instance, true)
    try {
      return await this.capturePageWhenPainted(instance, options)
    } finally {
      if (unthrottledForCapture) this.setRendersWhileHidden(instance, false)
    }
  }

  private async capturePageWhenPainted(
    instance: BrowserInstance,
    options: {
      mode: 'raw' | 'agent' | 'region'
      errorPrefix: 'screenshot' | 'region screenshot'
      rect?: { x: number; y: number; width: number; height: number }
      dpr?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<{ imageBuffer: Buffer; imageFormat: 'png' | 'jpeg'; warnings: string[] }> {
    let rescueUsed = false
    let sawDisplaySurfaceUnavailable = false
    const warnings: string[] = []
    const imageOpts = { dpr: options.dpr, format: options.format, jpegQuality: options.jpegQuality }

    const painting = await this.pageIsPainting(instance, SCREENSHOT_FRAME_TIMEOUT_MS)
    if (!painting) {
      mainLog.warn(`[browser-pane] ${options.errorPrefix} page not painting instance=${instance.id} visible=${instance.isVisible} url=${instance.currentUrl}`)
    }

    for (let attempt = 1; painting && attempt <= SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS; attempt += 1) {
      let result: { buffer: Buffer; format: 'png' | 'jpeg' } | null = null
      try {
        result = await this.capturePageImage(instance, {
          rect: options.rect,
          useHiddenCaptureOptions: true,
          ...imageOpts,
        })
      } catch (error) {
        if (this.isDisplaySurfaceUnavailableError(error)) {
          sawDisplaySurfaceUnavailable = true
          mainLog.warn(
            `[browser-pane] ${options.errorPrefix} display surface unavailable instance=${instance.id} mode=${options.mode} attempt=${attempt}/${SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS} visible=${instance.isVisible} url=${instance.currentUrl}`,
          )
        } else {
          throw error
        }
      }

      if (result) {
        if (attempt > 1) {
          warnings.push(`Capture recovered after ${attempt} hidden attempt${attempt === 1 ? '' : 's'}.`)
        }
        return { imageBuffer: result.buffer, imageFormat: result.format, warnings }
      }

      mainLog.warn(
        `[browser-pane] ${options.errorPrefix} empty capture attempt instance=${instance.id} mode=${options.mode} attempt=${attempt}/${SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS} visible=${instance.isVisible} isLoading=${instance.isLoading} url=${instance.currentUrl}`,
      )

      if (attempt < SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS) {
        await this.waitForScreenshotReadiness(instance.id)
      }
    }

    const window = instance.window
    const wasVisible = instance.isVisible

    if (!window.isDestroyed()) {
      let undoReveal: (() => void) | null = null
      try {
        if (!wasVisible) {
          if (window.isMinimized()) {
            window.restore()
          }
          // A hidden page has no surface to copy, so it must be on screen for a moment.
          undoReveal = this.revealInvisiblyForCapture(window)
          instance.isVisible = true
          this.emitStateChange(instance)
          rescueUsed = true
          await this.waitForScreenshotReadiness(instance.id)
        }
        // Covered by other windows the page may still not paint: say so rather than pass an old frame off as current.
        const paintedForRescue = await this.pageIsPainting(instance, SCREENSHOT_RESCUE_FRAME_TIMEOUT_MS)

        let rescueResult: { buffer: Buffer; format: 'png' | 'jpeg' } | null = null
        try {
          rescueResult = await this.capturePageImage(instance, {
            rect: options.rect,
            useHiddenCaptureOptions: false,
            ...imageOpts,
          })
        } catch (error) {
          if (this.isDisplaySurfaceUnavailableError(error)) {
            sawDisplaySurfaceUnavailable = true
            mainLog.warn(
              `[browser-pane] ${options.errorPrefix} display surface unavailable during rescue instance=${instance.id} mode=${options.mode} visible=${instance.isVisible} url=${instance.currentUrl}`,
            )
          } else {
            throw error
          }
        }

        if (rescueResult) {
          if (rescueUsed) {
            warnings.push('The hidden window was shown invisibly for a moment to render this capture.')
          }
          if (!paintedForRescue) throw new Error('当前页面未绘制新帧，未把旧截图返回给员工；请显示网页后重新核对')
          return { imageBuffer: rescueResult.buffer, imageFormat: rescueResult.format, warnings }
        }
      } finally {
        if (!wasVisible && !window.isDestroyed()) {
          if (undoReveal) undoReveal()
          else window.hide()
          instance.isVisible = false
          this.emitStateChange(instance)
        }
      }
    }

    mainLog.warn(
      `[browser-pane] ${options.errorPrefix} capture failed after recovery instance=${instance.id} mode=${options.mode} visible=${instance.isVisible} isLoading=${instance.isLoading} url=${instance.currentUrl} rescueUsed=${rescueUsed}`,
    )

    if (sawDisplaySurfaceUnavailable) {
      throw new Error(
        `Failed to capture ${options.errorPrefix}: current display surface is unavailable. `
        + `Try focusing the browser window first ("focus ${instance.id}" or "open --foreground") and retry.`
      )
    }

    throw new Error(`Failed to capture ${options.errorPrefix}: empty image buffer`)
  }

  /**
   * Show a hidden window for a capture without the user seeing it, click-through either way.
   * macOS and Windows: transparent and floating above other apps' windows (a plain showInactive
   * left it behind the frontmost app, and covered windows are not painted). Linux has no window
   * opacity, so the window is parked beyond every display instead (no taskbar entry); Wayland
   * ignores positions, so there it still shows briefly. Returns the undo, which hides it again.
   */
  private revealInvisiblyForCapture(window: BrowserWindow): () => void {
    window.setIgnoreMouseEvents(true)
    if (process.platform === 'linux') {
      const bounds = window.getBounds()
      const beyondDisplays = Math.max(...screen.getAllDisplays().map(({ bounds: display }) => display.x + display.width)) + 100
      window.setSkipTaskbar(true)
      window.setPosition(beyondDisplays, bounds.y)
      window.showInactive()
      return () => {
        window.hide()
        window.setBounds(bounds)
        window.setSkipTaskbar(false)
        window.setIgnoreMouseEvents(false)
      }
    }
    const opacity = window.getOpacity()
    window.setOpacity(0)
    window.setAlwaysOnTop(true, 'floating')
    window.showInactive()
    return () => {
      window.hide()
      window.setAlwaysOnTop(false)
      window.setIgnoreMouseEvents(false)
      window.setOpacity(opacity)
    }
  }

  /**
   * Whether the page renders frames right now: two animation frames within the timeout. A page
   * that isn't painting would be captured from its last composited frame.
   */
  private async pageIsPainting(instance: BrowserInstance, timeoutMs: number): Promise<boolean> {
    const webContents = instance.pageView.webContents
    if (webContents.isDestroyed()) return false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const painted = await Promise.race([
        webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))'),
        new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) }),
      ])
      return painted === true
    } catch {
      return false
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Turn background throttling off (or back on) for the page. Off, a window that was just hidden or
   * is covered keeps drawing frames, and timers and animations run at full speed: wanted while an
   * agent drives the page, not for idle windows.
   */
  private setRendersWhileHidden(instance: BrowserInstance, renders: boolean): void {
    if (instance.rendersWhileHidden === renders) return
    const webContents = instance.pageView.webContents
    if (webContents.isDestroyed()) return
    webContents.setBackgroundThrottling(!renders)
    instance.rendersWhileHidden = renders
  }

  private isDisplaySurfaceUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return error.message.toLowerCase().includes('current display surface not available for capture')
  }

  private async capturePageImage(
    instance: BrowserInstance,
    options: {
      rect?: { x: number; y: number; width: number; height: number }
      useHiddenCaptureOptions: boolean
      dpr?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<{ buffer: Buffer; format: 'png' | 'jpeg' } | null> {
    const captureOpts = options.useHiddenCaptureOptions
      ? { stayHidden: true, stayAwake: true }
      : undefined

    let image = options.rect
      ? await instance.pageView.webContents.capturePage(options.rect, captureOpts)
      : await instance.pageView.webContents.capturePage(undefined, captureOpts)

    if (image.isEmpty()) {
      return null
    }

    // Downscale from device pixels to CSS pixels so screenshot coordinates
    // match click-at viewport coordinates (uses Skia Lanczos via 'best')
    const dpr = options.dpr ?? 1
    if (dpr > 1) {
      const size = image.getSize()
      image = image.resize({
        width: Math.round(size.width / dpr),
        height: Math.round(size.height / dpr),
        quality: 'best',
      })
    }

    const fmt = options.format ?? 'png'
    const encoded = fmt === 'jpeg'
      ? image.toJPEG(options.jpegQuality ?? 80)
      : image.toPNG()

    if (!encoded || encoded.length === 0) {
      return null
    }

    return { buffer: encoded, format: fmt }
  }

  private async waitForScreenshotReadiness(instanceId: string): Promise<void> {
    try {
      await this.waitFor(instanceId, {
        kind: 'network-idle',
        timeoutMs: SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS,
        idleMs: SCREENSHOT_NETWORK_IDLE_MS,
      })
    } catch {
      // network-idle can fail on continuously active pages; still proceed after bounded delay
    }

    await this.sleep(SCREENSHOT_RETRY_DELAY_MS)
  }

  getConsoleLogs(id: string, options?: BrowserConsoleOptions): BrowserConsoleEntry[] {
    const instance = this.requireAliveInstance(id)

    const level = options?.level ?? 'all'
    const limit = Math.max(1, Math.min(500, Number(options?.limit ?? 50)))

    const filtered = level === 'all'
      ? instance.consoleLogs
      : instance.consoleLogs.filter((entry) => entry.level === level)

    return filtered.slice(-limit)
  }

  getNetworkLogs(id: string, options?: BrowserNetworkOptions): BrowserNetworkEntry[] {
    const instance = this.requireAliveInstance(id)

    const statusFilter = options?.status ?? 'all'
    const limit = Math.max(1, Math.min(500, Number(options?.limit ?? 50)))
    const method = options?.method?.toUpperCase()
    const resourceType = options?.resourceType?.toLowerCase()

    const filtered = instance.networkLogs.filter((entry) => {
      if (method && entry.method !== method) return false
      if (resourceType && entry.resourceType.toLowerCase() !== resourceType) return false

      if (statusFilter === 'all') return true
      if (statusFilter === 'failed') return !entry.ok
      if (statusFilter === '2xx') return entry.status >= 200 && entry.status < 300
      if (statusFilter === '3xx') return entry.status >= 300 && entry.status < 400
      if (statusFilter === '4xx') return entry.status >= 400 && entry.status < 500
      if (statusFilter === '5xx') return entry.status >= 500 && entry.status < 600
      return true
    })

    return filtered.slice(-limit)
  }

  async waitFor(id: string, args: BrowserWaitArgs): Promise<BrowserWaitResult> {
    const instance = this.requireAliveInstance(id)

    const timeoutMs = Math.max(100, args.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    const pollMs = Math.max(25, args.pollMs ?? DEFAULT_WAIT_POLL_MS)
    const idleMs = Math.max(100, args.idleMs ?? 700)
    const started = Date.now()

    const until = async (predicate: () => Promise<boolean>, detail: string): Promise<BrowserWaitResult> => {
      while (Date.now() - started <= timeoutMs) {
        if (await predicate()) {
          return {
            ok: true,
            kind: args.kind,
            elapsedMs: Date.now() - started,
            detail,
          }
        }
        await this.sleep(pollMs)
      }
      throw new Error(`Wait timed out after ${timeoutMs}ms (${args.kind})`)
    }

    if (args.kind === 'selector') {
      const selector = args.value?.trim()
      if (!selector) throw new Error('browser_wait selector requires value')
      return until(async () => {
        const exists = await instance.pageView.webContents.executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`
        )
        return Boolean(exists)
      }, `selector matched: ${selector}`)
    }

    if (args.kind === 'text') {
      const text = args.value?.trim()
      if (!text) throw new Error('browser_wait text requires value')
      return until(async () => {
        const found = await instance.pageView.webContents.executeJavaScript(
          `document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)})`
        )
        return Boolean(found)
      }, `text found: ${text}`)
    }

    if (args.kind === 'url') {
      const needle = args.value?.trim()
      if (!needle) throw new Error('browser_wait url requires value')
      return until(async () => {
        return instance.currentUrl.includes(needle)
      }, `url matched: ${needle}`)
    }

    if (args.kind === 'network-idle') {
      const wcId = instance.pageView.webContents.id
      return until(async () => {
        const inflight = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
        const last = this.lastNetworkActivityByWebContentsId.get(wcId) ?? started
        return inflight === 0 && (Date.now() - last) >= idleMs
      }, `network idle for ${idleMs}ms`)
    }

    throw new Error(`Unknown wait kind: ${args.kind}`)
  }

  async sendKey(id: string, args: BrowserKeyArgs): Promise<void> {
    const instance = this.requireAliveInstance(id)

    const key = args.key?.trim()
    if (!key) throw new Error('browser_key requires key')

    const modifiers = (args.modifiers ?? []) as Array<'shift' | 'control' | 'alt' | 'meta'>
    // Craft v0.15.1: CDP also reaches a hidden browser window.
    if (await instance.cdp.pressKey(key, modifiers)) return

    instance.pageView.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: key,
      modifiers,
    } as any)
    instance.pageView.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: key,
      modifiers,
    } as any)
  }

  async getDownloads(id: string, options?: BrowserDownloadOptions): Promise<BrowserDownloadEntry[]> {
    const instance = this.requireAliveInstance(id)

    const action = options?.action ?? 'list'
    const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 20)))

    if (action === 'wait') {
      const timeoutMs = Math.max(100, Number(options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS))
      const started = Date.now()
      while (Date.now() - started <= timeoutMs) {
        const hasTerminal = instance.downloads.some((d) => d.state === 'completed' || d.state === 'interrupted' || d.state === 'cancelled')
        if (hasTerminal) break
        await this.sleep(100)
      }
    }

    return instance.downloads.slice(-limit)
  }

  // validateUploadFilePath removed — uses shared validateFilePath from @craft-agent/server-core/handlers

  async uploadFile(_id: string, _ref: string, _filePaths: string[]): Promise<ElementGeometry> {
    throw new Error('首批浏览器不支持任意宿主路径上传')
  }

  windowResize(id: string, width: number, height: number): { width: number; height: number } {
    const instance = this.requireAliveInstance(id)

    const requestedViewportWidth = Math.max(320, Math.floor(width))
    const requestedViewportHeight = Math.max(240, Math.floor(height))
    instance.window.setContentSize(requestedViewportWidth, requestedViewportHeight + TOOLBAR_HEIGHT)

    this.layoutAllViews(instance)

    // Return effective viewport dimensions after OS/window min-size constraints are applied.
    const [appliedContentWidth, appliedContentHeight] = instance.window.getContentSize()
    return {
      width: Math.max(0, Math.floor(appliedContentWidth)),
      height: Math.max(0, Math.floor(appliedContentHeight - TOOLBAR_HEIGHT)),
    }
  }

  async evaluate(id: string, expression: string): Promise<unknown> {
    const instance = this.requireAliveInstance(id)
    return instance.pageView.webContents.executeJavaScript(expression)
  }

  async detectSecurityChallenge(id: string): Promise<{ detected: boolean; provider: string; signals: string[] }> {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return { detected: false, provider: 'none', signals: [] }

    const signals: string[] = []
    const title = instance.title || ''
    const url = instance.currentUrl || ''

    // Title-based detection
    if (/^Just a moment/i.test(title)) {
      signals.push('title:just-a-moment')
    }

    // URL-based detection
    if (url.includes('/cdn-cgi/challenge-platform/')) {
      signals.push('url:cdn-cgi-challenge')
    }

    // DOM-based detection via JS evaluation
    try {
      const domSignals = await instance.pageView.webContents.executeJavaScript(`(() => {
        const signals = [];
        const bodyText = (document.body?.innerText || '').slice(0, 2000);
        if (/Verify you are human/i.test(bodyText)) signals.push('text:verify-human');
        if (/Checking (if the site connection is secure|your browser)/i.test(bodyText)) signals.push('text:checking-browser');
        if (/Performing security verification/i.test(bodyText)) signals.push('text:security-verification');
        if (document.querySelector('#challenge-form')) signals.push('dom:challenge-form');
        if (document.querySelector('#turnstile-wrapper')) signals.push('dom:turnstile-wrapper');
        if (document.querySelector('.cf-turnstile')) signals.push('dom:cf-turnstile');
        if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) signals.push('dom:cf-challenge-iframe');
        return signals;
      })()`) as string[]

      if (Array.isArray(domSignals)) {
        signals.push(...domSignals)
      }
    } catch {
      // JS evaluation can fail if page is in a weird state — don't block on it
    }

    try {
      const snapshot = await instance.cdp.getAccessibilitySnapshot()
      const actionableRoles = new Set([
        'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
        'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'slider', 'spinbutton', 'listbox',
      ])
      const actionableCount = snapshot.nodes.filter((node) => {
        const role = (node.role || '').toLowerCase()
        return actionableRoles.has(role) && !node.disabled
      }).length

      if (snapshot.nodes.length > 0 && actionableCount <= 2) {
        signals.push(`ax:near-empty(${actionableCount}/${snapshot.nodes.length})`)
      }
    } catch {
      // AX snapshot can fail transiently during navigation; ignore
    }

    // A normal article or short page can have very few actionable elements.
    // AX sparsity alone is not evidence of a verification challenge.
    const detected = signals.some(signal => !signal.startsWith('ax:near-empty('))
    const isCloudflare = signals.some(s =>
      s.includes('cf-') || s.includes('challenge') || s.includes('turnstile') || s === 'title:just-a-moment'
    )
    const provider = detected ? (isCloudflare ? 'cloudflare' : 'unknown') : 'none'

    if (detected) {
      mainLog.info(`[browser-pane] security challenge detected id=${id} provider=${provider} signals=[${signals.join(', ')}]`)
    }

    return { detected, provider, signals }
  }

  async scroll(id: string, direction: 'up' | 'down' | 'left' | 'right', amount = 500): Promise<void> {
    const instance = this.requireAliveInstance(id)

    const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0
    const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0

    await instance.pageView.webContents.executeJavaScript(`window.scrollBy(${deltaX}, ${deltaY})`)
  }

  bindSession(id: string, sessionId: string, options?: { workspaceId?: string | null }): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.boundSessionId = sessionId
      instance.ownerType = 'session'
      instance.ownerSessionId = sessionId
      // Adopt the new binder's workspace. Manual windows being reused for a
      // session start carrying that session's workspace so the receiving
      // workspace's UI sees them and others don't.
      if (options?.workspaceId !== undefined) {
        instance.workspaceId = options.workspaceId
      }
      this.emitStateChange(instance)
    }
  }

  unbindSession(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.boundSessionId = null
      instance.ownerType = 'manual'
      // Preserve ownerSessionId as last-known owner for lifecycle targeting.
      this.emitStateChange(instance)
    }
  }

  /** Unbind all instances bound to the given session (non-destructive — window stays alive and reusable). */
  unbindAllForSession(sessionId: string): void {
    for (const instance of this.instances.values()) {
      if (instance.boundSessionId === sessionId) {
        instance.boundSessionId = null
        instance.ownerType = 'manual'
        // Keep ownerSessionId for post-turn lifecycle commands like `close` and `hide`.
        instance.ownerSessionId = instance.ownerSessionId ?? sessionId
        this.emitStateChange(instance)
        mainLog.info(`[browser-pane] Unbound instance ${instance.id} from session ${sessionId} (owner retained: ${instance.ownerSessionId ?? 'none'})`)
      }
    }
  }

  getBoundForSession(sessionId: string): string | null {
    for (const instance of this.instances.values()) {
      if (instance.ownerType === 'session' && instance.ownerSessionId === sessionId) {
        if (instance.window.isDestroyed()) {
          this.cleanupDestroyedInstance(instance, `getBoundForSession(${sessionId})`)
          continue
        }
        return instance.id
      }
    }
    return null
  }

  /**
   * Pick an unbound window that the caller's workspace is allowed to adopt.
   *
   * Why workspace filtering matters: when a session ends, its window stays
   * alive and becomes `ownerType='manual'` so the next turn of the **same**
   * session can re-bind it. But the window keeps its original `workspaceId`.
   * Without filtering, a session in workspace B would grab a window left
   * behind by workspace A — moving the window across workspaces, which is
   * exactly the leak this whole workspace-isolation work is fixing.
   *
   * Rule: adoption is allowed if the unbound window has `workspaceId === null`
   * (truly user-opened, no workspace context) OR matches the caller's
   * `workspaceId`. Same-workspace reuse covers the legitimate "turn ended,
   * next turn re-binds" case as well as any future turn of any session in
   * that workspace.
   */
  private findReusableUnboundInstance(workspaceId: string | null): BrowserInstance | null {
    const candidates = Array.from(this.instances.values()).filter(
      (i) =>
        i.boundSessionId === null &&
        i.ownerType === 'manual' &&
        (i.workspaceId === null || i.workspaceId === workspaceId),
    )
    if (candidates.length === 0) return null

    // Prefer visible windows first, then fall back to first available.
    return candidates.find((i) => i.isVisible) ?? candidates[0]
  }

  createForSession(
    sessionId: string,
    options?: { show?: boolean; allowReuseManual?: boolean; workspaceId?: string | null },
  ): string {
    const workspaceId = options?.workspaceId ?? null
    const existing = this.getBoundForSession(sessionId)
    if (existing) {
      // Already bound — adopt the workspace if the caller provided one and the
      // existing instance was bound before we knew about its workspace.
      if (options?.workspaceId !== undefined) {
        const instance = this.instances.get(existing)
        if (instance) instance.workspaceId = options.workspaceId
      }
      if (options?.show) {
        this.focus(existing)
      }
      return existing
    }

    // Reuse an unbound/manual window before creating a new one — local
    // sessions only. Remote agents must always get a fresh window so they
    // can never hijack a window the user opened manually.
    const allowReuseManual = options?.allowReuseManual ?? true
    if (allowReuseManual) {
      const reusable = this.findReusableUnboundInstance(workspaceId)
      if (reusable) {
        this.bindSession(reusable.id, sessionId, { workspaceId })
        if (options?.show) {
          this.focus(reusable.id)
        }
        mainLog.info(`[browser-pane] Reused unbound instance ${reusable.id} for session ${sessionId} (workspace=${workspaceId ?? 'none'})`)
        return reusable.id
      }
    }

    return this.createInstance(undefined, { partition: 'persist:boai-browser-disabled-legacy',
      show: options?.show ?? false,
      ownerType: 'session',
      ownerSessionId: sessionId,
      workspaceId,
    })
  }

  focusBoundForSession(sessionId: string, options?: { workspaceId?: string | null }): string {
    const id = this.createForSession(sessionId, { show: true, workspaceId: options?.workspaceId })
    this.focus(id)
    return id
  }

  getOrCreateForSession(sessionId: string, options?: { workspaceId?: string | null }): string {
    return this.createForSession(sessionId, { show: false, workspaceId: options?.workspaceId })
  }

  getBoundInstanceId(sessionId: string): string | null {
    for (const [id, instance] of this.instances) {
      if (instance.boundSessionId === sessionId) {
        if (instance.window.isDestroyed()) {
          this.cleanupDestroyedInstance(instance, `getBoundInstanceId(${sessionId})`)
          continue
        }
        return id
      }
    }
    return null
  }

  destroyForSession(sessionId: string): void {
    for (const [id, instance] of this.instances) {
      if (instance.boundSessionId === sessionId) {
        void this.destroyInstance(id)
      }
    }
  }

  private canLayoutViews(instance: BrowserInstance): boolean {
    // Instances remain registered until all retained WebContents actually exit.
    return this.instances.get(instance.id) === instance && !this.destroyingIds.has(instance.id) && !instance.window.isDestroyed()
      && instance.ownedWebContents.every(contents => !contents.isDestroyed())
  }

  private layoutToolbarView(instance: BrowserInstance): void {
    const [width] = instance.window.getContentSize()
    instance.toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT })
    instance.toolbarView.setAutoResize({ width: true, height: false })
  }

  async destroyAll(): Promise<void> {
    await Promise.all([...this.instances.keys()].map(id => this.destroyInstance(id)))
  }

  private finalizeDestroyedInstance(instance: BrowserInstance, source: 'destroy' | 'closed'): void {
    if (this.instances.get(instance.id) !== instance || !instance.window.isDestroyed() || instance.ownedWebContents.some(contents=>!contents.isDestroyed())) return

    this.destroyingIds.delete(instance.id)
    this.closePopupsForParent(instance.id, 'parent_destroy')
    instance.cdp.detach()
    this.instances.delete(instance.id)
    this.removedCallback?.(instance.id)
    mainLog.info(`[browser-pane] Destroyed instance: ${instance.id} (${source})`)
  }

  private layoutPageView(instance: BrowserInstance): void {
    const [width, height] = instance.window.getContentSize()
    instance.pageView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(100, height - TOOLBAR_HEIGHT) })
    instance.pageView.setAutoResize({ width: true, height: true })
  }

  private layoutAllViews(instance: BrowserInstance): void {
    if (!this.canLayoutViews(instance)) return
    this.layoutToolbarView(instance)
    this.layoutPageView(instance)
    if (!instance.window.isDestroyed()) {
      instance.window.setTopBrowserView(instance.toolbarView)
    }
  }

  private isBrowserEmptyStateUrl(url: string): boolean {
    if (!url) return false
    try { const parsed = new URL(url); const expected = this.options.developmentUrl ?? VITE_DEV_SERVER_URL; return expected ? parsed.origin === new URL(expected).origin && parsed.pathname === '/' + BROWSER_EMPTY_STATE_PAGE : parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname) === join(this.options.rendererDirectory, BROWSER_EMPTY_STATE_PAGE) } catch { return false }
  }

  private normalizePageState(url: string, title: string): { url: string; title: string } {
    if (this.isBrowserEmptyStateUrl(url)) {
      return { url: 'about:blank', title: 'New Tab' }
    }
    return { url, title }
  }

  private async loadEmptyStatePage(instance: BrowserInstance): Promise<void> {
    if (this.options.developmentUrl ?? VITE_DEV_SERVER_URL) {
      await instance.pageView.webContents.loadURL(`${(this.options.developmentUrl ?? VITE_DEV_SERVER_URL)!.replace(/\/$/, '')}/${BROWSER_EMPTY_STATE_PAGE}`)
      return
    }

    await instance.pageView.webContents.loadFile(join(this.options.rendererDirectory, BROWSER_EMPTY_STATE_PAGE))
  }

  private async maybeHandleEmptyStateLaunch(_instance: BrowserInstance, _url: string): Promise<boolean> {
    // The local empty state is presentation only; it never launches/sends a conversation.
    return false
  }

  private async loadToolbarPage(instance: BrowserInstance): Promise<void> {
    const query = `instanceId=${encodeURIComponent(instance.id)}`
    let lastError: unknown = null

    for (let attempt = 0; attempt <= TOOLBAR_LOAD_MAX_RETRIES; attempt++) {
      try {
        if (this.options.developmentUrl ?? VITE_DEV_SERVER_URL) {
          await instance.toolbarView.webContents.loadURL(`${(this.options.developmentUrl ?? VITE_DEV_SERVER_URL)!.replace(/\/$/, '')}/browser-toolbar.html?${query}`)
        } else {
          await instance.toolbarView.webContents.loadFile(
            join(this.options.rendererDirectory, 'browser-toolbar.html'),
            { query: { instanceId: instance.id } },
          )
        }

        if (attempt > 0) {
          mainLog.info(`[browser-pane] toolbar load recovered id=${instance.id} attempt=${attempt + 1}`)
        }
        return
      } catch (error) {
        lastError = error
        const retrying = attempt < TOOLBAR_LOAD_MAX_RETRIES
        mainLog.warn(
          `[browser-pane] toolbar load failed id=${instance.id} attempt=${attempt + 1}/${TOOLBAR_LOAD_MAX_RETRIES + 1}: ${error instanceof Error ? error.message : String(error)}${retrying ? ' (retrying)' : ''}`,
        )

        if (retrying) {
          await this.sleep(TOOLBAR_LOAD_RETRY_DELAY_MS)
        }
      }
    }

    const errorText = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error')
    instance.toolbarError = errorText
    this.emitStateChange(instance)
    await this.loadToolbarFallback(instance, errorText)
    if (instance.showOnCreate) instance.window.show()
    throw new Error(errorText)
  }

  private async loadToolbarFallback(instance: BrowserInstance, reason: string): Promise<void> {
    const safeReason = reason.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] || ch))
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Toolbar Error</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafb; color: #1f2937; }
      @media (prefers-color-scheme: dark) { html, body { background: #2b292e; color: #e5e7eb; } }
      .wrap { height: 100%; display: flex; align-items: center; justify-content: center; }
      .card { max-width: 640px; margin: 0 20px; padding: 14px 16px; border-radius: 10px; background: rgba(127,127,127,0.12); font-size: 12px; line-height: 1.45; }
      .title { font-weight: 600; margin-bottom: 6px; }
      .muted { opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="title">Browser toolbar failed to load</div>
        <div class="muted">The page area still works, but toolbar UI is unavailable. Try reopening the browser window.</div>
        <div class="muted" style="margin-top: 8px; word-break: break-word;">Reason: ${safeReason}</div>
      </div>
    </div>
  </body>
</html>`

    try {
      await instance.toolbarView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
      mainLog.warn(`[browser-pane] Loaded toolbar fallback id=${instance.id}`)
    } catch (error) {
      mainLog.error(`[browser-pane] Failed to load toolbar fallback id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private pushToolbarState(instance: BrowserInstance): void {
    if (this.instances.get(instance.id) !== instance || instance.window.isDestroyed() || instance.toolbarView.webContents.isDestroyed()) return
    const state = {
      url: instance.currentUrl,
      title: instance.title,
      isLoading: instance.isLoading,
      canGoBack: instance.canGoBack,
      canGoForward: instance.canGoForward,
      themeColor: instance.themeColor,
      isDark: nativeTheme.shouldUseDarkColors,
      ...this.options.toolbarState?.(instance.id),
    }
    instance.toolbarView.webContents.send(TOOLBAR_CHANNELS.STATE_UPDATE, state)
  }

  private async navigateFromToolbar(id: string, action: 'navigate' | 'back' | 'forward' | 'reload', url?: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    if (action === 'navigate') { await this.navigate(id, url!); return }
    const contents = instance.pageView.webContents
    if (action === 'back' && !contents.navigationHistory.canGoBack() || action === 'forward' && !contents.navigationHistory.canGoForward()) return
    let finish!: () => void
    let fail!: () => void
    const loaded = new Promise<void>((resolve, reject) => { finish = resolve; fail = () => reject(new Error('浏览器页面已关闭')) })
    void loaded.catch(() => undefined)
    contents.once('did-stop-loading', finish)
    contents.once('destroyed', fail)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (action === 'back') contents.navigationHistory.goBack()
      else if (action === 'forward') contents.navigationHistory.goForward()
      else contents.reload()
      await Promise.race([loaded, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { if (!contents.isDestroyed()) contents.stop(); reject(new Error('网页加载超时，已停止加载')) }, 30_000)
      })])
    } finally {
      if (timer) clearTimeout(timer)
      contents.removeListener('did-stop-loading', finish)
      contents.removeListener('destroyed', fail)
      await this.waitForLoads(id)
    }
  }

  /** Register IPC handlers for toolbar actions. Call once at app startup. */
  registerToolbarIpc(): void {
    const findInstance = (event: IpcMainInvokeEvent, instanceId: string): BrowserInstance => {
      const instance = this.instances.get(instanceId)
      if (!instance || event.sender !== instance.ownedWebContents[0] || event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame || !this.isToolbarUiDocumentUrl(event.sender.getURL())) throw new Error('无效的浏览器工具栏来源')
      return instance
    }
    const manual = (event: IpcMainInvokeEvent, id: string, action: 'navigate' | 'back' | 'forward' | 'reload', url?: string) => {
      const instance = findInstance(event, id)
      if (!this.options.allowUserNavigation(id) || !this.options.userNavigation) throw new Error('浏览器已关闭或正在清理')
      return this.options.userNavigation(instance.id, () => this.navigateFromToolbar(instance.id, action, url))
    }
    ipcMain.handle(TOOLBAR_CHANNELS.NAVIGATE, async (event, id: string, url: string) => { await manual(event, id, 'navigate', url) })
    ipcMain.handle(TOOLBAR_CHANNELS.GO_BACK, async (event, id: string) => { await manual(event, id, 'back') })
    ipcMain.handle(TOOLBAR_CHANNELS.GO_FORWARD, async (event, id: string) => { await manual(event, id, 'forward') })
    ipcMain.handle(TOOLBAR_CHANNELS.RELOAD, async (event, id: string) => { await manual(event, id, 'reload') })
    ipcMain.handle(TOOLBAR_CHANNELS.STOP, async (event, id: string) => { this.stop(findInstance(event, id).id) })
    ipcMain.handle(TOOLBAR_CHANNELS.DESTROY, async (event, id: string) => { await this.options.userControl?.(findInstance(event, id).id, 'close') })
    ipcMain.handle('browser-toolbar:get-state', async (event, id: string) => { const instance = findInstance(event, id); this.pushToolbarState(instance) })
  }

  private markToolbarReady(instance: BrowserInstance, reason: string): void {
    if (instance.toolbarReady || instance.window.isDestroyed()) return

    instance.toolbarReady = true
    mainLog.info(`[browser-pane] toolbar ready id=${instance.id} reason=${reason}`)

    const shouldShowNow = instance.showOnCreate || instance.pendingShowOnReady
    if (!shouldShowNow) return

    const tokenAtReady = instance.pendingShowToken
    instance.pendingShowOnReady = false

    if (instance.window.isDestroyed()) return
    if (instance.pendingShowToken !== tokenAtReady) return

    instance.window.show()
    instance.window.focus()
    instance.isVisible = true
    this.emitStateChange(instance)

  }

  /**
   * Extract a theme color from the page using Safari 26-style heuristics.
   * Priority: media-aware theme-color meta → elementsFromPoint (fixed/sticky headers) → body/html bg.
   * All colors pass through (including white/black) — contrast is handled by the renderer.
   * Guards against stale extraction (URL change during async executeJavaScript).
   */
  private async extractThemeColor(instance: BrowserInstance): Promise<void> {
    if (instance.themeColor) return // already set by did-change-theme-color or observer
    const urlAtStart = instance.currentUrl
    try {
      const color = await instance.pageView.webContents.executeJavaScript(`(${THEME_COLOR_EXTRACTOR_FN})()`)
      // Guard: if user navigated away during extraction, discard stale result
      if (instance.currentUrl !== urlAtStart) return
      if (typeof color === 'string' && color.length > 0) {
        this.applyThemeColor(instance, color)
      }
    } catch {
      // page destroyed or JS error — ignore
    }
  }

  private applyThemeColor(instance: BrowserInstance, color: string | null): void {
    if (instance.themeColor === color) return
    instance.themeColor = color
    if (!instance.window.isDestroyed() && !instance.toolbarView.webContents.isDestroyed()) {
      instance.toolbarView.webContents.send(TOOLBAR_CHANNELS.THEME_COLOR, color)
    }
    this.emitStateChange(instance)
  }

  private installThemeObserver(instance: BrowserInstance, allowRetry = true): void {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const urlAtInstall = instance.currentUrl
    instance.themeObserverToken = token

    void instance.pageView.webContents.executeJavaScript(`
      (() => {
        const token = ${JSON.stringify(token)};
        const prefix = ${JSON.stringify(THEME_COLOR_SIGNAL_PREFIX)} + token + ':';
        const nullSentinel = ${JSON.stringify(THEME_COLOR_NULL_SENTINEL)};
        const extractThemeColor = ${THEME_COLOR_EXTRACTOR_FN};

        const w = window;
        const previousCleanup = w.__CRAFT_THEME_OBSERVER_CLEANUP__;
        if (typeof previousCleanup === 'function') {
          try { previousCleanup(); } catch {}
        }

        let lastColor = '__unset__';
        let rafId = 0;
        let timerId = 0;
        let lastRunAt = 0;
        const minIntervalMs = ${THEME_OBSERVER_MIN_INTERVAL_MS};

        const clearScheduled = () => {
          if (timerId) {
            clearTimeout(timerId);
            timerId = 0;
          }
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        };

        const emit = (color) => {
          const normalized = typeof color === 'string' && color.length > 0 ? color : null;
          if (normalized === lastColor) return;
          lastColor = normalized;
          console.info(prefix + (normalized ?? nullSentinel));
        };

        const run = () => {
          rafId = 0;
          lastRunAt = Date.now();
          try {
            emit(extractThemeColor());
          } catch {}
        };

        const schedule = () => {
          if (rafId || timerId) return;
          const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRunAt));
          if (waitMs > 0) {
            timerId = setTimeout(() => {
              timerId = 0;
              rafId = requestAnimationFrame(run);
            }, waitMs);
            return;
          }
          rafId = requestAnimationFrame(run);
        };

        const onScroll = () => schedule();
        const onResize = () => schedule();
        const onMutation = () => schedule();

        const headObserver = new MutationObserver(onMutation);
        if (document.head) {
          headObserver.observe(document.head, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['name', 'content', 'media'],
          });
        }

        const rootObserver = new MutationObserver(onMutation);
        if (document.documentElement) {
          rootObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          });
        }
        if (document.body) {
          rootObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          });
        }

        w.addEventListener('scroll', onScroll, { passive: true });
        w.addEventListener('resize', onResize, { passive: true });

        const mql = w.matchMedia('(prefers-color-scheme: dark)');
        const onSchemeChange = () => schedule();
        if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onSchemeChange);
        else if (typeof mql.addListener === 'function') mql.addListener(onSchemeChange);

        w.__CRAFT_THEME_OBSERVER_CLEANUP__ = () => {
          headObserver.disconnect();
          rootObserver.disconnect();
          w.removeEventListener('scroll', onScroll);
          w.removeEventListener('resize', onResize);
          if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onSchemeChange);
          else if (typeof mql.removeListener === 'function') mql.removeListener(onSchemeChange);
          clearScheduled();
        };

        // Fast first color for initial toolbar paint and after SPA route changes
        schedule();
      })()
    `).catch(() => {
      if (!allowRetry) return
      setTimeout(() => {
        if (this.instances.get(instance.id) !== instance) return
        if (instance.currentUrl !== urlAtInstall) return
        if (instance.themeObserverToken !== token) return
        this.installThemeObserver(instance, false)
      }, 120)
    })
  }

  private scheduleEarlyThemeExtraction(instance: BrowserInstance, urlAtSchedule: string): void {
    setTimeout(() => {
      if (this.instances.get(instance.id) !== instance) return
      if (instance.currentUrl !== urlAtSchedule) return
      void this.extractThemeColor(instance)
    }, EARLY_THEME_EXTRACTION_DELAY_MS)
  }

  private getInstanceByWebContentsId(webContentsId: number): BrowserInstance | undefined {
    for (const instance of this.instances.values()) {
      const contents = instance.ownedWebContents[1]!
      if (!contents.isDestroyed() && contents.id === webContentsId) return instance
    }
    return undefined
  }

  private registerPopupWindow(parentInstance: BrowserInstance, popupWindow: BrowserWindow, sourceUrl?: string): void {
    const popupWcId = popupWindow.webContents.id
    this.popupWebContentsIds.set(popupWindow, popupWcId)
    const existingParent = this.popupParentByWebContentsId.get(popupWcId)
    if (existingParent && existingParent !== parentInstance.id) {
      this.unregisterPopupWindow(popupWindow, 'reparented')
    }

    let popups = this.popupWindowsByParentInstanceId.get(parentInstance.id)
    if (!popups) {
      popups = new Set<BrowserWindow>()
      this.popupWindowsByParentInstanceId.set(parentInstance.id, popups)
    }

    popups.add(popupWindow)
    this.popupParentByWebContentsId.set(popupWcId, parentInstance.id)
    popupWindow.webContents.on('will-navigate', (event, url) => { if (!this.options.allowNavigation?.(parentInstance.id, url)) event.preventDefault() })
    popupWindow.webContents.on('will-redirect', (event, url) => { if (!this.options.allowNavigation?.(parentInstance.id, url)) event.preventDefault() })
    popupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))


    const initialUrl = sourceUrl || popupWindow.webContents.getURL?.() || 'about:blank'
    mainLog.info(`[browser-pane] popup created parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${initialUrl}`)

    popupWindow.webContents.on('did-navigate', (_event, urlFromEvent) => {
      const popupUrl = typeof popupWindow.webContents.getURL === 'function'
        ? popupWindow.webContents.getURL()
        : (urlFromEvent || initialUrl)
      mainLog.info(`[browser-pane] popup did-navigate parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${popupUrl}`)
    })

    popupWindow.webContents.on('did-redirect-navigation', (_event, popupUrl, isInPlace, isMainFrame) => {
      mainLog.info(
        `[browser-pane] popup redirect parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${popupUrl} inPlace=${isInPlace} mainFrame=${isMainFrame}`,
      )
    })

    popupWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.warn(
        `[browser-pane] popup did-fail-load parent=${parentInstance.id} popupWebContentsId=${popupWcId} code=${errorCode} url=${validatedURL} error=${errorDescription}`,
      )
    })

    popupWindow.on('closed', () => {
      this.unregisterPopupWindow(popupWindow, 'closed')
    })
  }

  private unregisterPopupWindow(popupWindow: BrowserWindow, reason: 'closed' | 'parent_destroy' | 'reparented'): void {
    const popupWcId = this.popupWebContentsIds.get(popupWindow)
    if (popupWcId === undefined) return
    const parentId = this.popupParentByWebContentsId.get(popupWcId)
    if (!parentId) return

    this.popupParentByWebContentsId.delete(popupWcId)

    const popups = this.popupWindowsByParentInstanceId.get(parentId)
    if (popups) {
      popups.delete(popupWindow)
      if (popups.size === 0) {
        this.popupWindowsByParentInstanceId.delete(parentId)
      }
    }

    mainLog.info(`[browser-pane] popup closed parent=${parentId} popupWebContentsId=${popupWcId} reason=${reason}`)
  }

  private closePopupsForParent(parentId: string, reason: 'parent_destroy'): void {
    const popups = this.popupWindowsByParentInstanceId.get(parentId)
    if (!popups) return
    for (const popup of [...popups]) {
      if (!popup.isDestroyed()) popup.destroy()
      if (!popup.isDestroyed()) throw new Error('浏览器弹窗仍未实际关闭')
      this.unregisterPopupWindow(popup, reason)
    }
  }

  private pushNetworkLog(instance: BrowserInstance, entry: BrowserNetworkEntry): void {
    instance.networkLogs.push(entry)
    if (instance.networkLogs.length > MAX_NETWORK_LOG_ENTRIES) {
      instance.networkLogs.splice(0, instance.networkLogs.length - MAX_NETWORK_LOG_ENTRIES)
    }
  }

  private pushDownloadLog(instance: BrowserInstance, entry: BrowserDownloadEntry): void {
    instance.downloads.push(entry)
    if (instance.downloads.length > MAX_DOWNLOAD_LOG_ENTRIES) {
      instance.downloads.splice(0, instance.downloads.length - MAX_DOWNLOAD_LOG_ENTRIES)
    }
  }

  private uniqueFilename(dir: string, filename: string): string {
    if (!existsSync(join(dir, filename))) return filename
    const { name, ext } = parsePath(filename)
    let counter = 1
    while (existsSync(join(dir, `${name}_${counter}${ext}`))) {
      counter++
    }
    return `${name}_${counter}${ext}`
  }

  private setupSessionObservers(ses: ElectronSession): void {
    if (this.observerSessions.has(ses)) return
    this.observerSessions.add(ses)

    ses.webRequest.onBeforeRequest((details, callback) => {
      const wcId = details.webContentsId
      if (typeof wcId === 'number' && wcId > 0) {
        const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
        this.inFlightRequestsByWebContentsId.set(wcId, current + 1)
        this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())
      }
      const owner = this.getInstanceByWebContentsId(wcId ?? -1) ?? [...this.instances.values()].find(instance => {
        const contents = instance.ownedWebContents[1]!
        return !instance.window.isDestroyed() && !contents.isDestroyed() && contents.session === ses
      })
      const allowed = !!owner && (this.isBrowserEmptyStateUrl(details.url) || this.isLocalEmptyResource(owner, details.url, details.resourceType) || this.options.allowNetwork?.(owner.id, details.url, details.resourceType) === true)
      callback({ cancel: !allowed })
    })

    ses.webRequest.onCompleted((details) => {
      const wcId = details.webContentsId
      if (typeof wcId !== 'number' || wcId <= 0) return

      const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
      this.inFlightRequestsByWebContentsId.set(wcId, Math.max(0, current - 1))
      this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())

      const instance = this.getInstanceByWebContentsId(wcId)
      if (!instance) return

      this.pushNetworkLog(instance, {
        timestamp: Date.now(),
        method: details.method ?? 'GET',
        url: details.url ?? '',
        status: details.statusCode ?? 0,
        resourceType: String(details.resourceType ?? 'unknown'),
        ok: (details.statusCode ?? 0) >= 200 && (details.statusCode ?? 0) < 400,
      })
    })

    ses.webRequest.onErrorOccurred((details) => {
      const wcId = details.webContentsId
      if (typeof wcId !== 'number' || wcId <= 0) return

      const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
      this.inFlightRequestsByWebContentsId.set(wcId, Math.max(0, current - 1))
      this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())

      const instance = this.getInstanceByWebContentsId(wcId)
      if (!instance) return

      this.pushNetworkLog(instance, {
        timestamp: Date.now(),
        method: details.method ?? 'GET',
        url: details.url ?? '',
        status: 0,
        resourceType: String(details.resourceType ?? 'unknown'),
        ok: false,
      })
    })

    ses.on('will-download', (event, item, webContents) => {
      const wcId = webContents?.id
      if (typeof wcId !== 'number') return
      const instance = this.getInstanceByWebContentsId(wcId)
      const policy = instance ? this.options.downloadPolicy(instance.id, item.getURL()) : null
      if (!instance || !policy) { event.preventDefault(); return }

      let filename = basename(item.getFilename().replace(/\\/g, '/')) || 'download'
      let savePath: string | undefined
      if (policy.kind === 'managed') {
        mkdirSync(policy.directory, { recursive: true })
        filename = this.uniqueFilename(policy.directory, filename)
        savePath = join(policy.directory, filename)
        item.setSavePath(savePath)
      }

      const downloadId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const started: BrowserDownloadEntry = {
        id: downloadId,
        timestamp: Date.now(),
        url: item.getURL(),
        filename,
        state: 'started',
        bytesReceived: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        mimeType: item.getMimeType() || 'application/octet-stream',
        savePath,
      }
      this.pushDownloadLog(instance, started)

      const onUpdated = (_e: Electron.Event, state: string) => {
        const latest = instance.downloads.find((d) => d.id === downloadId)
        if (!latest) return
        latest.bytesReceived = item.getReceivedBytes()
        latest.totalBytes = item.getTotalBytes()
        if (state === 'interrupted') latest.state = 'interrupted'
      }

      item.on('updated', onUpdated)
      let finish!: () => void
      const done = new Promise<void>(resolve => { finish = resolve })
      instance.activeDownloads.set(downloadId, { item, done, kind: policy.kind })

      item.once('done', (_e, state) => {
        item.removeListener('updated', onUpdated)
        const latest = instance.downloads.find((d) => d.id === downloadId)
        instance.activeDownloads.delete(downloadId)
        finish()
        if (!latest) return
        latest.bytesReceived = item.getReceivedBytes()
        latest.totalBytes = item.getTotalBytes()
        latest.savePath = item.getSavePath()
        latest.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      })
    })
  }

  private logPermissionDecision(kind: 'check' | 'request', permission: string, origin: string): void {
    const isNonBlockingNoise = permission === 'background-sync'
    const suffix = isNonBlockingNoise ? ' (non-blocking)' : ''
    const message = `[browser-pane] permission denied (${kind}): ${permission} origin=${origin}${suffix}`
    if (isNonBlockingNoise) {
      mainLog.info(message)
      return
    }
    mainLog.warn(message)
  }

  private setupSessionPermissions(ses: ElectronSession): void {
    if (this.permissionSessions.has(ses)) return
    this.permissionSessions.add(ses)
    ses.setPermissionCheckHandler(() => false)
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  }

  private isToolbarUiDocumentUrl(url: string): boolean {
    try {
      const parsed = new URL(url), development = this.options.developmentUrl ?? VITE_DEV_SERVER_URL
      return development ? parsed.origin === new URL(development).origin && parsed.pathname === '/browser-toolbar.html' : parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname) === join(this.options.rendererDirectory, 'browser-toolbar.html')
    } catch { return false }
  }

  private isLocalEmptyResource(instance: BrowserInstance, url: string, type: string): boolean {
    if (type === 'mainFrame' || type === 'subFrame' || !this.isBrowserEmptyStateUrl(instance.pageView.webContents.getURL())) return false
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'file:') return false
      const file = decodeURIComponent(parsed.pathname), rel = relative(join(this.options.rendererDirectory,'assets'), file)
      return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
    } catch { return false }
  }

  private setupWindowListeners(instance: BrowserInstance): void {
    const pageWc = instance.pageView.webContents
    const toolbarWc = instance.toolbarView.webContents

    instance.window.on('close', (event) => {
      if (this.destroyingIds.has(instance.id)) return
      event.preventDefault()
      void this.options.userControl(instance.id, 'close').catch(error => {
        mainLog.warn(`[browser-pane] window close failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
      })
    })

    instance.window.on('resize', () => {
      this.layoutAllViews(instance)
    })

    toolbarWc.on('did-finish-load', () => {
      const loadedUrl = typeof toolbarWc.getURL === 'function' ? toolbarWc.getURL() : ''
      if (!this.isToolbarUiDocumentUrl(loadedUrl)) {
        mainLog.info(`[browser-pane] toolbar did-finish-load ignored id=${instance.id} url=${loadedUrl || 'unknown'}`)
        this.pushToolbarState(instance)
        return
      }

      this.markToolbarReady(instance, 'did-finish-load')
      this.pushToolbarState(instance)
    })

    toolbarWc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.warn(`[browser-pane] toolbar did-fail-load id=${instance.id} code=${errorCode} url=${validatedURL} error=${errorDescription}`)
    })

    pageWc.on('did-start-loading', () => {
      if (!instance.loadDone) instance.loadDone = new Promise<void>(resolve => { instance.resolveLoadDone = resolve })
      instance.isLoading = true
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
    })

    pageWc.on('did-stop-loading', () => {
      instance.resolveLoadDone?.(); instance.loadDone = null; instance.resolveLoadDone = null
      instance.isLoading = false
      instance.canGoBack = pageWc.navigationHistory.canGoBack()
      instance.canGoForward = pageWc.navigationHistory.canGoForward()
      // Drain in-flight count — all pending requests are settled once loading stops
      this.inFlightRequestsByWebContentsId.set(pageWc.id, 0)
      this.lastNetworkActivityByWebContentsId.set(pageWc.id, Date.now())
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
      void this.extractThemeColor(instance)
    })

    pageWc.on('dom-ready', () => {
      this.installThemeObserver(instance)
      void this.extractThemeColor(instance)
    })

    pageWc.on('did-navigate', (_event, urlFromEvent) => {
      instance.documentRevision=(instance.documentRevision ?? 0)+1
      const url = typeof pageWc.getURL === 'function' ? pageWc.getURL() : (urlFromEvent || instance.currentUrl)
      instance.cdp.invalidateRefs()
      const previousUrl = instance.currentUrl
      if (instance.inPageThemeTimer) {
        clearTimeout(instance.inPageThemeTimer)
        instance.inPageThemeTimer = null
      }
      instance.themeObserverToken = null
      instance.themeColor = null // reset for new page (batched with state push below)
      const normalized = this.normalizePageState(url, pageWc.getTitle())
      instance.currentUrl = normalized.url
      instance.title = normalized.title
      mainLog.info(`[browser-pane] did-navigate id=${instance.id} from=${previousUrl} to=${instance.currentUrl}`)
      instance.canGoBack = pageWc.navigationHistory.canGoBack()
      instance.canGoForward = pageWc.navigationHistory.canGoForward()
      // Drain in-flight count — prior page's requests are cancelled on navigation
      this.inFlightRequestsByWebContentsId.set(pageWc.id, 0)
      this.lastNetworkActivityByWebContentsId.set(pageWc.id, Date.now())
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
      this.scheduleEarlyThemeExtraction(instance, url)
    })

    pageWc.on('did-redirect-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.info(`[browser-pane] did-redirect-navigation id=${instance.id} url=${url} inPlace=${isInPlace}`)
    })

    pageWc.on('did-navigate-in-page', (_event, urlFromEvent) => {
      instance.documentRevision=(instance.documentRevision ?? 0)+1
      instance.cdp.invalidateRefs()
      const url = typeof pageWc.getURL === 'function' ? pageWc.getURL() : (urlFromEvent || instance.currentUrl)
      const normalized = this.normalizePageState(url, instance.title)
      instance.currentUrl = normalized.url
      instance.title = normalized.title
      instance.canGoBack = pageWc.navigationHistory.canGoBack()
      instance.canGoForward = pageWc.navigationHistory.canGoForward()

      void this.maybeHandleEmptyStateLaunch(instance, url).then((handled) => {
        if (handled) {
          this.emitStateChange(instance)
          void this.pushToolbarState(instance)
          return
        }

        // SPA route change — re-extract theme color (debounced)
        if (instance.inPageThemeTimer) clearTimeout(instance.inPageThemeTimer)
        instance.themeObserverToken = null
        instance.themeColor = null
        this.emitStateChange(instance)
        void this.pushToolbarState(instance)
        this.installThemeObserver(instance)
        instance.inPageThemeTimer = setTimeout(() => { void this.extractThemeColor(instance) }, 300)
      }).catch((error) => {
        mainLog.warn(`[browser-pane] empty-state launch handling failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
      })
    })

    pageWc.on('page-title-updated', (_event, title) => {
      const normalized = this.normalizePageState(pageWc.getURL(), title)
      instance.title = normalized.title
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
    })

    pageWc.on('page-favicon-updated', (_event, favicons) => {
      instance.favicon = favicons[0] || null
      this.emitStateChange(instance)
    })

    pageWc.on('did-change-theme-color', (_event, color) => {
      this.applyThemeColor(instance, color ?? null)
    })

    pageWc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      mainLog.warn(`[browser-pane] did-fail-load id=${instance.id} code=${errorCode} url=${validatedURL} error=${errorDescription}`)
    })

    pageWc.on('console-message', ({ level, message }) => {
      if (message.startsWith(THEME_COLOR_SIGNAL_PREFIX)) {
        const payload = message.slice(THEME_COLOR_SIGNAL_PREFIX.length)
        const delimiterIdx = payload.indexOf(':')
        if (delimiterIdx > 0) {
          const token = payload.slice(0, delimiterIdx)
          const value = payload.slice(delimiterIdx + 1).trim()
          if (token === instance.themeObserverToken) {
            if (value === THEME_COLOR_NULL_SENTINEL) {
              this.applyThemeColor(instance, null)
            } else if (value.length > 0) {
              this.applyThemeColor(instance, value)
            }
          }
        }
        return
      }

      const mappedLevel: BrowserConsoleEntry['level'] = level === 'error' ? 'error' : level === 'warning' ? 'warn' : level === 'info' ? 'info' : 'log'
      instance.consoleLogs.push({
        timestamp: Date.now(),
        level: mappedLevel,
        message,
      })
      if (instance.consoleLogs.length > MAX_CONSOLE_LOG_ENTRIES) {
        instance.consoleLogs.splice(0, instance.consoleLogs.length - MAX_CONSOLE_LOG_ENTRIES)
      }

      if (level === 'warning' || level === 'error') {
        mainLog.warn(`[browser-pane] console id=${instance.id} level=${level}: ${message}`)
      }
    })

    pageWc.on('will-navigate', (event, url) => {
      if (!this.options.allowNavigation?.(instance.id, url)) event.preventDefault()
    })
    pageWc.on('will-redirect', (event, url) => {
      if (!this.options.allowNavigation?.(instance.id, url)) event.preventDefault()
    })

    pageWc.on('did-create-window', (popupWindow, details) => {
      const popupUrl = details?.url || popupWindow.webContents.getURL?.() || 'about:blank'
      this.registerPopupWindow(instance, popupWindow, popupUrl)
    })

    pageWc.setWindowOpenHandler((details) => {
      mainLog.info(
        `[browser-pane] window-open requested id=${instance.id} url=${details.url} disposition=${details.disposition ?? 'unknown'} frameName=${details.frameName || 'none'}`,
      )

      let parsed: URL
      try {
        parsed = new URL(details.url)
      } catch {
        mainLog.warn(`[browser-pane] window-open denied id=${instance.id} reason=invalid_url url=${details.url}`)
        return { action: 'deny' }
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        mainLog.warn(`[browser-pane] window-open denied id=${instance.id} reason=unsupported_protocol protocol=${parsed.protocol} url=${details.url}`)
        return { action: 'deny' }
      }

      if (!this.options.allowNavigation?.(instance.id, details.url)) return { action: 'deny' }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          minWidth: 420,
          minHeight: 520,
          show: true,
          autoHideMenuBar: true,
          parent: instance.window,
          modal: false,
          webPreferences: {
            partition: instance.partition,
            session: pageWc.session,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    })

    pageWc.on('focus', () => {
      this.interactedCallback?.(instance.id)
    })

    instance.window.on('focus', () => {
      this.interactedCallback?.(instance.id)
    })

    instance.window.on('show', () => {
      instance.isVisible = true
      this.emitStateChange(instance)
      this.pushToolbarState(instance)
      if (!instance.themeColor) {
        void this.extractThemeColor(instance)
      }
    })

    instance.window.on('hide', () => {
      instance.isVisible = false
      this.emitStateChange(instance)
    })

    instance.window.on('closed', () => {
      this.finalizeDestroyedInstance(instance, 'closed')
    })
  }

  private toInfo(instance: BrowserInstance): BrowserInstanceInfo {
    return {
      id: instance.id,
      url: instance.currentUrl,
      title: instance.title,
      favicon: instance.favicon,
      isLoading: instance.isLoading,
      canGoBack: instance.canGoBack,
      canGoForward: instance.canGoForward,
      boundSessionId: instance.boundSessionId,
      ownerType: instance.ownerType,
      ownerSessionId: instance.ownerSessionId,
      isVisible: instance.isVisible,
      themeColor: instance.themeColor,
      workspaceId: instance.workspaceId,
    }
  }

  private emitStateChange(instance: BrowserInstance): void {
    if (this.instances.get(instance.id) !== instance) {
      return
    }
    this.stateChangeCallback?.(this.toInfo(instance))
  }
}
