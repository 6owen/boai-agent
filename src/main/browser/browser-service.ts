/*
 * [OUTPUT]: 页面实际变化后回传refs失效及snapshot下一步，避免沿用填表前节点。
 * [OUTPUT]: 同源本机只读升级Work保留当前refs；其他租约及文档变化仍使refs失效，沿原实际退出。
 * [OUTPUT]: 2026-10-14固定网页引用由宿主核源；本机只读租约绑定真实消息/run，写操作沿Work；重开窗口使用独立实例身份。
 * [INPUT]: 私有 Runtime 租约/动作信封、冻结来源与原版 Electron BrowserPaneManager。
 * [OUTPUT]: 项目内置浏览器单窗口/固定登录分区与独立任务持有者；人工导航不扩张模型权限，跨任务互斥等实际退出；旧分区保留，旧调用尾部不能更新重开窗口。
 * [POS]: Main 浏览器唯一宿主；网页/Renderer 不取得 BrowserPaneFns 或任意 CDP 接口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { session } from 'electron'
import { BrowserPaneManager } from './browser-pane-manager'
import type { BrowserPaneFns } from '../../runtime/adapters/mastra/browser-tool-types'
import { BROWSER_PAGE_METRICS_EXPRESSION, executeBrowserSingleCommand, parseBrowserSingleCommand } from '../../runtime/adapters/mastra/browser-tool-runtime'
import { APPLICATION_BROWSER_SCOPE } from '../../shared/ipc/browser'
import type { BrowserActionEnvelope, BrowserActionReply, BrowserCompletedDownload, BrowserControlAction, BrowserLease, BrowserManualOpenRequest, BrowserPageEvidence, BrowserPageReference, BrowserWindowState } from '../../shared/ipc/browser'

const PAGE_STATE_EXPRESSION = `(() => ({url:location.href,title:document.title,html:(document.documentElement?.outerHTML||'').slice(0,2000000),forms:Array.from(document.querySelectorAll('input,textarea,select')).slice(0,1000).map(e=>({type:e.type,name:e.name,value:e.type==='password'?'[redacted]':String(e.value).slice(0,2000),checked:e.checked,disabled:e.disabled}))}))()`
interface Profile { scopeKey: string; partition: string; status: 'ready' | 'clearing' | 'cleared'; retiredLeases?: string[] }
interface Scope {
  lease?: BrowserLease; state: BrowserWindowState; partition: string; active: boolean; origins: Set<string>
  queue: Promise<void>; inFlight?: Promise<BrowserActionReply>; actionReplies: Map<string, { hash: string; reply?: BrowserActionReply; pending?: Promise<BrowserActionReply> }>
  draining?: Promise<{ drained: true }>
  pageHash?: string; pageCounter: number; releaseRequested: boolean; performingAgentAction: boolean
}
export interface BrowserServiceOptions {
  rendererDirectory: string; preloadPath: string; developmentUrl?: string
  profileRegistryPath: string; managedDataDirectory: string
  onStateChanged?: (state: BrowserWindowState) => void
  onUserControl?: (input: { scopeKey: string; action: BrowserControlAction | 'stop'; lease?: BrowserLease }) => Promise<void>
  /** Tests inject a driver; production always uses the copied native manager. */
  manager?: BrowserPaneManager
  clearPartition?: (partition: string) => Promise<void>
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const origin = (url: string) => { try { const value = new URL(url); return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password ? value.origin : undefined } catch { return undefined } }
const sameLease = (left: BrowserLease, right: BrowserLease) => left.scopeKey === right.scopeKey && left.scopeEpoch === right.scopeEpoch && left.agentId === right.agentId && left.conversationId === right.conversationId && left.workId === right.workId && left.sourceMessageId === right.sourceMessageId && left.runId === right.runId && left.generation === right.generation && left.configVersion === right.configVersion && left.downloadDirectory === right.downloadDirectory

export class BrowserService {
  readonly manager: BrowserPaneManager
  private scopes = new Map<string, Scope>()
  private profiles = new Map<string, Profile>()
  private retiredRuns = new Set<string>()
  private registryReady: Promise<void>
  private registryQueue: Promise<void> = Promise.resolve()
  private scopeTransitions = new Map<string, Promise<unknown>>()
  constructor(private readonly options: BrowserServiceOptions) {
    this.registryReady = this.loadRegistry()
    // Keep the original rejection observable by acquire/shutdown while preventing
    // an eager asynchronous registry read from becoming an unhandled rejection.
    void this.registryReady.catch(() => {})
    this.manager = options.manager ?? new BrowserPaneManager({
      rendererDirectory: options.rendererDirectory, preloadPath: options.preloadPath, developmentUrl: options.developmentUrl,
      allowNavigation: (id, url) => this.allowedNavigation(id, url),
      allowNetwork: (id, url, type) => {
        if (!origin(url)) return false
        return type === 'mainFrame' || type === 'subFrame' ? this.allowedNavigation(id, url) : true
      },
      downloadPolicy: (id, url) => {
        const scope = this.byInstance(id), target = origin(url)
        if (!scope || !target || scope.state.clearing || ['closing', 'closed'].includes(scope.state.control)) return null
        if (!scope.performingAgentAction) return { kind: 'native' }
        return scope.active && scope.lease && scope.origins.has(target) ? { kind: 'managed', directory: scope.lease.downloadDirectory } : null
      },
      allowUserNavigation: id => { const scope = this.byInstance(id); return !!scope && !scope.state.clearing && !['closing', 'closed'].includes(scope.state.control) },
      userNavigation: (id, operation) => this.navigateByUser(id, operation),
      toolbarState: id => { const scope = this.byInstance(id); return scope ? { state: scope.state } : {} },
      userControl: async (id, action) => {
        const scope = this.byInstance(id); if (!scope) throw new Error('浏览器已关闭')
        if (!this.options.onUserControl) throw new Error('浏览器宿主控制入口不可用')
        await this.options.onUserControl({ scopeKey: APPLICATION_BROWSER_SCOPE, action, ...(scope.lease ? { lease: scope.lease } : {}) })
      },
    })
    this.manager.onStateChange(info => {
      const scope = this.byInstance(info.id); if (!scope) return
      const instance = this.manager.getInstance(info.id)
      Object.assign(scope.state, { url: info.url, title: info.title, isLoading: info.isLoading, isVisible: info.isVisible, toolbarReady: !!instance?.toolbarReady, ...(instance?.toolbarError ? { error: instance.toolbarError } : {}) })
      this.emit(scope)
    })
    this.manager.onRemoved(id => { const scope = this.byInstance(id); if (!scope) return; scope.active = false; scope.state.control = 'closed'; scope.state.isVisible = false; this.emit(scope) })
    if (!options.manager) this.manager.registerToolbarIpc()
  }
  private byInstance(id: string): Scope | undefined { return [...this.scopes.values()].find(scope => scope.state.instanceId === id) }
  private emit(scope: Scope): void {
    if (this.scopes.get(APPLICATION_BROWSER_SCOPE) !== scope) return
    scope.state.revision += 1
    this.options.onStateChanged?.(structuredClone(scope.state))
    const instance = this.manager?.getInstance(scope.state.instanceId)
    const toolbarContents = instance?.ownedWebContents?.[0] ?? instance?.toolbarView.webContents
    if (instance && toolbarContents && !toolbarContents.isDestroyed()) toolbarContents.send('browser-toolbar:state-update', {
      url: scope.state.url, title: scope.state.title, isLoading: scope.state.isLoading, canGoBack: instance.canGoBack, canGoForward: instance.canGoForward,
      themeColor: instance.themeColor, state: structuredClone(scope.state),
    })
  }
  private allowedNavigation(id: string, url: string): boolean {
    const scope = this.byInstance(id), target = origin(url)
    if (!scope || !target || scope.state.clearing || ['closing', 'closed'].includes(scope.state.control)) return false
    // An acquired task lease never locks ordinary browsing. Only the actual
    // employee action uses its frozen approved origins; human navigation does
    // not add those URLs to the employee's authorization or tool receipts.
    return !scope.performingAgentAction || scope.origins.has(target)
  }
  private navigateByUser(id: string, operation: () => Promise<void>): Promise<void> {
    const scope = this.byInstance(id)
    if (!scope || scope.state.clearing || ['closing', 'closed'].includes(scope.state.control)) return Promise.reject(new Error('浏览器已关闭或正在清理'))
    const navigation = scope.queue.then(async () => {
      if (this.scopes.get(APPLICATION_BROWSER_SCOPE) !== scope || scope.state.clearing || ['closing', 'closed'].includes(scope.state.control)) throw new Error('原浏览器已关闭或正在清理')
      await operation()
    })
    scope.queue = navigation.catch(() => undefined)
    // Creation/close/cleanup also wait for this real navigation to exit.
    return this.transition(APPLICATION_BROWSER_SCOPE, () => navigation)
  }
  private require(lease: BrowserLease, active = true): Scope {
    const scope = this.scopes.get(APPLICATION_BROWSER_SCOPE)
    if (!scope?.lease || !sameLease(scope.lease, lease) || active && (!scope.active || scope.state.control !== 'agent-controlled')) throw new Error('浏览器租约已失效或原任务已结束')
    return scope
  }
  private async loadRegistry(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.options.profileRegistryPath, 'utf8'))
      if (raw.schema !== 1 || !Array.isArray(raw.profiles)) throw new Error('浏览器资料登记损坏')
      for (const profile of raw.profiles as Profile[]) {
        if (!profile.scopeKey || profile.partition !== `persist:boai-browser-${hash(profile.scopeKey)}` || !['ready', 'clearing', 'cleared'].includes(profile.status)) throw new Error('浏览器资料登记无效')
        this.profiles.set(profile.scopeKey, profile)
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private saveRegistry(): Promise<void> {
    const save = this.registryQueue.then(async () => {
      await mkdir(dirname(this.options.profileRegistryPath), { recursive: true })
      const temp = `${this.options.profileRegistryPath}.tmp`
      await writeFile(temp, JSON.stringify({ schema: 1, profiles: [...this.profiles.values()] }) + '\n', { mode: 0o600 })
      await rename(temp, this.options.profileRegistryPath)
    })
    this.registryQueue = save.catch(() => undefined)
    return save
  }
  private transition<T>(scopeKey: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.scopeTransitions.get(scopeKey) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    this.scopeTransitions.set(scopeKey, next)
    void next.finally(() => { if (this.scopeTransitions.get(scopeKey) === next) this.scopeTransitions.delete(scopeKey) }).catch(() => {})
    return next
  }
  manualOpen(_input: BrowserManualOpenRequest): Promise<BrowserWindowState> {
    return this.transition(APPLICATION_BROWSER_SCOPE, async () => {
      await this.registryReady
      const profile = this.profiles.get(APPLICATION_BROWSER_SCOPE)
      if (profile?.status === 'clearing') throw new Error('内置浏览器登录资料正在清理')
      const existing = this.scopes.get(APPLICATION_BROWSER_SCOPE)
      if (existing && existing.state.control !== 'closed') {
        if (existing.state.control === 'closing') throw new Error('内置浏览器尚未实际关闭')
        if (!existing.state.toolbarReady) throw new Error(existing.state.error ?? '浏览器工具栏尚未准备好')
        this.manager.focus(existing.state.instanceId)
        return structuredClone(existing.state)
      }
      const partition = `persist:boai-browser-${hash(APPLICATION_BROWSER_SCOPE)}`
      this.profiles.set(APPLICATION_BROWSER_SCOPE, { ...profile, scopeKey: APPLICATION_BROWSER_SCOPE, partition, status: 'ready' })
      await this.saveRegistry()
      const instanceId = existing && existing.state.control !== 'closed' ? existing.state.instanceId : `browser-${randomUUID()}`
      const scope: Scope = {
        partition, active: false, origins: new Set(), queue: Promise.resolve(), actionReplies: new Map(), pageCounter: 0, releaseRequested: false, performingAgentAction: false,
        state: { scopeKey: APPLICATION_BROWSER_SCOPE, instanceId, revision: existing?.state.revision ?? 0, pageVersion: '0', url: 'about:blank', title: '新网页', isLoading: false, isVisible: false, toolbarReady: false, control: 'user-controlled' },
      }
      this.scopes.set(APPLICATION_BROWSER_SCOPE, scope)
      this.manager.createInstance(instanceId, { show: false, partition })
      this.manager.getInstance(instanceId)?.window.setTitle('内置浏览器')
      try { await this.manager.ready(instanceId) } catch (error) { scope.state.error = error instanceof Error ? error.message : String(error); this.emit(scope); throw error }
      scope.state.toolbarReady = true
      this.manager.focus(instanceId)
      this.emit(scope)
      return structuredClone(scope.state)
    })
  }
  acquire(lease: BrowserLease): Promise<void> {
    const existing = this.scopes.get(APPLICATION_BROWSER_SCOPE)
    if (existing && (['draining', 'closing'].includes(existing.state.control) || existing.inFlight && (!existing.lease || !sameLease(existing.lease, lease)))) return Promise.reject(new Error('原浏览器动作尚未实际退出，请等待后重试'))
    return this.transition(APPLICATION_BROWSER_SCOPE, () => this.acquireScope(lease))
  }
  private async acquireScope(lease: BrowserLease): Promise<void> {
    await this.registryReady
    if (!lease.scopeKey || !lease.agentId || !lease.conversationId || !lease.runId || (!lease.workId && !lease.sourceMessageId) || !lease.generation || !Number.isSafeInteger(lease.scopeEpoch) || !Number.isSafeInteger(lease.configVersion) || !isAbsolute(lease.downloadDirectory)) throw new Error('无效的浏览器工具调用身份')
    if (this.retiredRuns.has(`${lease.runId}:${lease.generation}`)) throw new Error('旧浏览器执行代际已退出')
    const profile = this.profiles.get(APPLICATION_BROWSER_SCOPE)
    if (profile?.status === 'clearing') throw new Error('内置浏览器登录资料正在清理')
    if (profile?.retiredLeases?.includes(`${lease.runId}:${lease.generation}`)) throw new Error('旧浏览器租约已清理，不得重放')
    const existing = this.scopes.get(APPLICATION_BROWSER_SCOPE)
    if (existing && ['draining', 'closing'].includes(existing.state.control)) throw new Error('原浏览器动作尚未实际退出，请等待后重试')
    if (existing?.active) { if (existing.lease && sameLease(existing.lease, lease)) return; throw new Error('内置浏览器正由另一任务使用，请等待实际退出') }
    if (existing?.inFlight) throw new Error('原浏览器动作尚未实际退出，请等待后重试')
    await mkdir(lease.downloadDirectory, { recursive: true })
    const dataRoot = await realpath(this.options.managedDataDirectory), downloadRoot = await realpath(lease.downloadDirectory)
    if ((await lstat(lease.downloadDirectory)).isSymbolicLink() || relative(dataRoot, downloadRoot).startsWith('..') || isAbsolute(relative(dataRoot, downloadRoot))) throw new Error('浏览器下载必须位于本次受管工作目录')
    const partition = `persist:boai-browser-${hash(APPLICATION_BROWSER_SCOPE)}`
    this.profiles.set(APPLICATION_BROWSER_SCOPE, { ...profile, scopeKey: APPLICATION_BROWSER_SCOPE, partition, status: 'ready' }); await this.saveRegistry()
    const instanceId = existing && existing.state.control !== 'closed' ? existing.state.instanceId : `browser-${randomUUID()}`
    const scope: Scope = {
      lease: structuredClone(lease), partition, active: true, origins: new Set(), queue: Promise.resolve(), actionReplies: new Map(), pageHash: existing?.pageHash, pageCounter: existing?.pageCounter ?? 0, releaseRequested: false, performingAgentAction: false,
      state: { scopeKey: APPLICATION_BROWSER_SCOPE, instanceId, revision: existing?.state.revision ?? 0, pageVersion: existing?.state.pageVersion ?? '0', url: existing?.state.url ?? 'about:blank', title: existing?.state.title ?? '新网页', isLoading: existing?.state.isLoading ?? false, isVisible: existing?.state.isVisible ?? false, toolbarReady: false, control: 'agent-controlled' },
    }
    this.scopes.set(APPLICATION_BROWSER_SCOPE, scope)
    this.manager.createInstance(instanceId, { show: false, partition, downloadDirectory: downloadRoot })
    const instance = this.manager.getInstance(instanceId)
    // Native read -> Work promotion is the same caller on the same document. Its first
    // write uses the refs just returned to that caller; unrelated leases still discard them.
    const prior = existing?.lease
    const promotion = prior && !prior.workId && !!lease.workId && !!prior.sourceMessageId && prior.sourceMessageId === lease.sourceMessageId &&
      prior.runId === lease.runId && prior.agentId === lease.agentId && prior.conversationId === lease.conversationId && prior.configVersion === lease.configVersion && prior.scopeEpoch === lease.scopeEpoch && existing.state.instanceId === instanceId
    if (instance) { instance.downloadDirectory = downloadRoot; if (!promotion) instance.cdp.invalidateRefs(); instance.window.setTitle('内置浏览器') }
    try { await this.manager.ready(instanceId) } catch (error) { scope.active = false; scope.state.control = 'idle'; scope.state.error = error instanceof Error ? error.message : String(error); this.emit(scope); throw error }
    scope.state.toolbarReady = true
    this.emit(scope)
  }
  async reference(input: { instanceId?: string; pageVersion?: string }): Promise<BrowserPageReference> {
    return this.transition(APPLICATION_BROWSER_SCOPE, async () => {
      const scope = this.scopes.get(APPLICATION_BROWSER_SCOPE)
      if (!scope || ['closing', 'closed'].includes(scope.state.control)) throw new Error('请先打开要引用的内置浏览器网页')
      await scope.queue
      if (input.instanceId && input.instanceId !== scope.state.instanceId) throw new Error('原网页窗口已关闭或替换，请重新引用')
      const source = await this.pageEvidence(scope, 'reference')
      if (!source || !origin(source.url)) throw new Error('当前没有可引用的网页')
      if (input.pageVersion && input.pageVersion !== source.pageVersion) throw new Error('引用后网页已变化，请重新引用当前网页')
      return { instanceId: scope.state.instanceId, pageVersion: source.pageVersion, url: source.url, title: source.title, obtainedAt: source.obtainedAt }
    })
  }
  async inspect(lease: BrowserLease): Promise<BrowserPageEvidence | null> {
    return this.readPageEvidence(lease)
  }
  private async readPageEvidence(lease: BrowserLease, active = true): Promise<BrowserPageEvidence | null> {
    return this.pageEvidence(this.require(lease, active), lease.generation)
  }
  private async pageEvidence(scope: Scope, generation: string): Promise<BrowserPageEvidence | null> {
    const instance = this.manager.getInstance(scope.state.instanceId)
    if (!instance || instance.window.isDestroyed()) return null
    const page = await instance.pageView.webContents.executeJavaScript(PAGE_STATE_EXPRESSION)
    if (!page || typeof page.url !== 'string' || typeof page.title !== 'string') throw new Error('网页状态无法可靠核对')
    const digest = hash(JSON.stringify({documentRevision:instance.documentRevision ?? 0,page}))
    if (scope.pageHash !== digest) { scope.pageHash = digest; scope.pageCounter += 1; scope.state.pageVersion = `${scope.pageCounter}:${digest}`; instance.cdp.invalidateRefs() }
    scope.state.url = page.url.includes('browser-empty-state.html') ? 'about:blank' : page.url
    scope.state.title = page.title.slice(0, 300)
    return { instanceId: scope.state.instanceId, scopeKey: APPLICATION_BROWSER_SCOPE, generation, pageVersion: scope.state.pageVersion, url: scope.state.url, title: scope.state.title, obtainedAt: new Date().toISOString() }
  }
  async resumeSnapshot(lease: BrowserLease): Promise<{ source: BrowserPageEvidence; output: string }> {
    const scope = this.require(lease), instance = this.manager.getInstance(scope.state.instanceId)
    if (!instance) throw new Error('浏览器页面已关闭，无法交还原任务')
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await this.inspect(lease)
      if (!before) throw new Error('浏览器页面已关闭，无法交还原任务')
      instance.cdp.invalidateRefs()
      const snapshot = await this.manager.getAccessibilitySnapshot(scope.state.instanceId)
      this.require(lease)
      const source = await this.inspect(lease)
      if (!source) throw new Error('浏览器页面已关闭，无法交还原任务')
      if (before.pageVersion === source.pageVersion) return { source, output: JSON.stringify(snapshot).slice(0, 64000) }
    }
    throw new Error('交还期间页面持续变化，请重新核对页面')
  }

  async executeSingle(envelope: BrowserActionEnvelope, beforeStart?: () => Promise<void>): Promise<BrowserActionReply> {
    const parsed = parseBrowserSingleCommand(envelope.command), argumentHash = hash(JSON.stringify(parsed.parts))
    if (argumentHash !== envelope.argumentHash || !envelope.actionId || !envelope.toolCallId) throw new Error('浏览器动作身份或参数不匹配')
    const scope = this.require(envelope.lease)
    const old = scope.actionReplies.get(envelope.actionId)
    if (old) { if (old.hash !== argumentHash) throw new Error('同一浏览器动作不能更换参数'); return old.reply ?? await old.pending! }
    let started = false
    const action = scope.queue.then(async (): Promise<BrowserActionReply> => {
      try {
        this.require(envelope.lease)
        const current = await this.inspect(envelope.lease)
        if (envelope.expectedPageVersion && current?.pageVersion !== envelope.expectedPageVersion) throw new Error('网页已变化，请重新获取页面并审批')
        const approved = envelope.approvedOrigins.map(value => origin(value))
        if (approved.some(value => !value) || approved.length > 20) throw new Error('浏览任务的网页来源授权无效')
        scope.origins = new Set(approved as string[])
        if (parsed.targetUrl && !scope.origins.has(origin(parsed.targetUrl)!)) throw new Error('尚未批准该网页来源')
        if (parsed.action !== 'navigate' && current?.url !== 'about:blank' && !scope.origins.has(origin(current?.url ?? '')!)) throw new Error('当前页面不在获准来源范围')
        if (parsed.mutating && parsed.action !== 'navigate' && (!envelope.approval || envelope.approval.commandHash !== argumentHash || envelope.approval.pageVersion !== current?.pageVersion || envelope.approval.url !== current?.url)) throw new Error('网页操作缺少对应当前页面与内容的明确批准')
        await beforeStart?.()
        this.require(envelope.lease)
        if (current && (await this.inspect(envelope.lease))?.pageVersion !== current.pageVersion) throw new Error('持有者确认期间网页发生变化，请重新核对')
        started = true
        scope.performingAgentAction = true
        const result = await executeBrowserSingleCommand({ command: envelope.command, fns: this.functions(scope), sessionId: envelope.lease.scopeKey, platform: process.platform })
        if (result.image && result.image.sizeBytes > 8 * 1024 * 1024) throw new Error('浏览器截图超出 8 MiB 有界范围')
        await this.manager.waitForLoads(scope.state.instanceId)
        // Closing the acquisition gate does not erase the known result of an action
        // which actually finished. The identity must still match the original lease.
        const source = scope.state.control === 'closed' ? current : await this.readPageEvidence(envelope.lease, false)
        const downloads = await this.completedDownloads(scope)
        const refresh = source && current && source.pageVersion !== current.pageVersion ? '\nPage changed; previous element refs are invalid. Call browser_tool with command "snapshot" before any further @eN action.' : ''
        const reply: BrowserActionReply = { actionId: envelope.actionId, generation: envelope.lease.generation, status: 'completed', result: { ...result, output: result.output.slice(0, 63000) + refresh }, ...(source ? { source } : {}), ...(downloads.length ? { downloads } : {}) }
        return reply
      } catch (error) {
        return { actionId: envelope.actionId, generation: envelope.lease.generation, status: started ? 'unknown' : 'cancelled_before_start', error: error instanceof Error ? error.message : String(error) }
      } finally {
        scope.performingAgentAction = false
        if (scope.releaseRequested) { scope.active = false; this.retiredRuns.add(`${envelope.lease.runId}:${envelope.lease.generation}`); this.emit(scope) }
      }
    })
    scope.inFlight = action
    scope.actionReplies.set(envelope.actionId, { hash: argumentHash, pending: action })
    scope.queue = action.then(reply => { scope.actionReplies.set(envelope.actionId, { hash: argumentHash, reply }); if (scope.inFlight === action) scope.inFlight = undefined }).catch(() => undefined)
    return action
  }
  lookup(input: { lease: BrowserLease; actionId: string }): BrowserActionReply | null {
    const scope = this.require(input.lease, false)
    return scope.actionReplies.get(input.actionId)?.reply ?? null
  }
  private functions(scope: Scope): BrowserPaneFns {
    const lease = scope.lease
    if (!lease) throw new Error('人工浏览器尚无员工任务租约')
    const id = scope.state.instanceId, manager = this.manager
    const guard = () => { this.require(lease); if (scope.releaseRequested) throw new Error('浏览器窗口正在关闭') }
    const act = async <T>(operation: () => Promise<T> | T): Promise<T> => { guard(); return await operation() }
    const forbidden = async (): Promise<never> => { throw new Error('此浏览器能力首批未开放') }
    const bound = (requested?: string) => { if (requested && requested !== id) throw new Error('不能操作其他窗口') }
    return {
      openPanel: args => act(() => { if (!args?.background) manager.focus(id); return { instanceId: id } }),
      navigate: url => act(() => manager.navigate(id, url)), snapshot: () => act(() => manager.getAccessibilitySnapshot(id)),
      click: (ref, args) => act(() => manager.clickElement(id, ref, args)), clickAt: (x, y) => act(() => manager.clickAtCoordinates(id, x, y)),
      drag: (x1, y1, x2, y2) => act(() => manager.drag(id, x1, y1, x2, y2)), fill: (ref, value) => act(() => manager.fillElement(id, ref, value)),
      type: text => act(() => manager.typeText(id, text)), select: (ref, value) => act(() => manager.selectOption(id, ref, value)),
      screenshot: args => act(() => manager.screenshot(id, args)), screenshotRegion: args => act(() => manager.screenshotRegion(id, args)),
      windowResize: args => act(() => manager.windowResize(id, args.width, args.height)), waitFor: args => act(() => manager.waitFor(id, args)), sendKey: args => act(() => manager.sendKey(id, args)),
      getDownloads: args => act(async () => {
        const directory = await realpath(lease.downloadDirectory), entries = await manager.getDownloads(id, args)
        const current: typeof entries = []
        for (const entry of entries) {
          if (!entry.savePath) continue
          let path = resolve(entry.savePath)
          try { path = await realpath(path) } catch { /* Pending managed downloads may not have created the file yet. */ }
          const rel = relative(directory, path)
          if (rel.startsWith('..') || isAbsolute(rel)) continue
          // Runtime publishes a readable self: path only after hash-checked promotion.
          const { savePath: _savePath, ...progress } = entry
          current.push(progress)
        }
        return current
      }),
      scroll: (direction, amount) => act(() => manager.scroll(id, direction, amount)), goBack: () => act(() => manager.goBack(id)), goForward: () => act(() => manager.goForward(id)),
      evaluate: expression => act(() => { if (expression !== BROWSER_PAGE_METRICS_EXPRESSION) throw new Error('只允许固定页面测量'); return manager.evaluate(id, expression) }),
      focusWindow: requested => act(() => { bound(requested); manager.focus(id); const instance = manager.getInstance(id)!; return { instanceId: id, title: instance.title, url: instance.currentUrl } }),
      listWindows: async () => manager.listInstances().filter(instance => instance.id === id),
      releaseControl: async requested => { guard(); bound(requested); manager.focus(id); return { action: 'released', resolvedInstanceId: id, affectedIds: [id] } },
      hideWindow: requested => act(() => { bound(requested); manager.hide(id); return { action: 'hidden' as const, resolvedInstanceId: id, affectedIds: [id] } }),
      closeWindow: async requested => { guard(); bound(requested); scope.state.control = 'closing'; this.emit(scope); await manager.destroyInstance(id); scope.releaseRequested = true; scope.state.control = 'closed'; return { action: 'closed', resolvedInstanceId: id, affectedIds: [id] } },
      detectChallenge: () => act(() => manager.detectSecurityChallenge(id)),
      setClipboard: forbidden, getClipboard: forbidden, upload: forbidden, getConsoleLogs: forbidden,
      getNetworkLogs: args => act(() => {
        // The copied navigation algorithm uses this one fixed, bounded failure summary.
        // The model network/console commands remain rejected by the shared parser.
        if (args?.status !== 'failed' || args.limit !== 200) throw new Error('只允许内部有界导航失败核对')
        return manager.getNetworkLogs(id, {status:'failed',limit:200}).filter(entry=>origin(entry.url)).map(entry=>{
          const url = new URL(entry.url); url.search=''; url.hash=''
          return {...entry,url:url.href,method:entry.method.slice(0,12),resourceType:entry.resourceType.slice(0,40)}
        })
      }),
    }
  }
  private async completedDownloads(scope: Scope): Promise<BrowserCompletedDownload[]> {
    if (!scope.lease || !this.manager.getInstance(scope.state.instanceId)) return []
    const entries = await this.manager.getDownloads(scope.state.instanceId, { action: 'list', limit: 20 }), out: BrowserCompletedDownload[] = []
    const directory = await realpath(scope.lease.downloadDirectory)
    for (const entry of entries) {
      if (entry.state !== 'completed' || !entry.savePath || !origin(entry.url) || !scope.origins.has(origin(entry.url)!)) continue
      const candidate = relative(directory, resolve(entry.savePath)), selected = relative(resolve(scope.lease.downloadDirectory), resolve(entry.savePath))
      if ((candidate.startsWith('..') || isAbsolute(candidate)) && (selected.startsWith('..') || isAbsolute(selected))) continue
      if ((await lstat(entry.savePath)).isSymbolicLink()) throw new Error('下载原件不是受管普通文件')
      const actual = await realpath(entry.savePath), rel = relative(directory, actual)
      if (rel.startsWith('..') || isAbsolute(rel)) continue
      const stat = await lstat(actual); if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('下载原件超出首批有界范围')
      const bytes = await readFile(actual)
      out.push({ id: entry.id, path: actual, name: entry.filename, size: bytes.length, hash: createHash('sha256').update(bytes).digest('hex'), url: entry.url, obtainedAt: new Date(entry.timestamp).toISOString() })
    }
    return out
  }
  async drain(lease: BrowserLease): Promise<{ drained: true }> {
    const scope = this.scopes.get(APPLICATION_BROWSER_SCOPE)
    if (!scope?.lease || !sameLease(scope.lease, lease)) return { drained: true }
    return this.drainScope(scope)
  }
  private drainScope(scope: Scope): Promise<{ drained: true }> {
    if (scope.draining) return scope.draining
    const pending = this.performDrain(scope)
    scope.draining = pending
    void pending.catch(() => { if (scope.draining === pending) scope.draining = undefined })
    return pending
  }
  private async performDrain(scope: Scope): Promise<{ drained: true }> {
    if (this.scopes.get(APPLICATION_BROWSER_SCOPE) !== scope) return { drained: true }
    scope.active = false
    if (scope.state.control !== 'closed') scope.state.control = 'draining'
    if (scope.lease) this.retiredRuns.add(`${scope.lease.runId}:${scope.lease.generation}`)
    this.emit(scope)
    if (scope.performingAgentAction) this.manager.stop(scope.state.instanceId)
    await this.manager.cancelDownloads(scope.state.instanceId, { managedOnly: true })
    await scope.queue
    await this.manager.waitForLoads(scope.state.instanceId)
    const instance = this.manager.getInstance(scope.state.instanceId); await instance?.cdp.drain()
    if (this.scopes.get(APPLICATION_BROWSER_SCOPE) !== scope) return { drained: true }
    if (scope.state.control !== 'closed') scope.state.control = 'idle'
    this.emit(scope)
    return { drained: true }
  }
  async userControl(input: { scopeKey: string; action: BrowserControlAction }): Promise<void> {
    const scope = this.scopes.get(input.scopeKey)
    if (!scope) throw new Error('浏览器窗口尚未建立或已关闭')
    if (input.action === 'show') { this.manager.focus(scope.state.instanceId); return }
    if (input.action === 'hide') { this.manager.hide(scope.state.instanceId); return }
    if (input.action === 'resume') {
      if (scope.state.control !== 'user-controlled') throw new Error('当前浏览器不处于人工操作状态')
      if (!scope.lease) throw new Error('尚无可继续的员工任务，请在聊天中发送新任务')
      if (!this.options.onUserControl) throw new Error('原任务无法继续，请在聊天中发起新任务')
      await this.options.onUserControl({ scopeKey: input.scopeKey, action: 'resume', lease: scope.lease })
      return
    }
    if (input.action === 'clear') { await this.clearScope({ scopeKey: input.scopeKey }); return }
    const draining = this.drainScope(scope)
    void draining.catch(() => {})
    await this.transition(input.scopeKey, async () => {
      await draining
      if (this.scopes.get(APPLICATION_BROWSER_SCOPE) !== scope) return
      if (input.action === 'close') {
        scope.state.control = 'closing'; this.emit(scope)
        try { await this.manager.destroyInstance(scope.state.instanceId); scope.state.control = 'closed'; this.emit(scope) }
        catch (error) { scope.state.error = error instanceof Error ? error.message : String(error); this.emit(scope); throw error }
      } else { scope.state.control = 'user-controlled'; this.manager.getInstance(scope.state.instanceId)?.cdp.invalidateRefs(); this.emit(scope) }
    })
  }
  clearScope(input: { scopeKey: string }): Promise<{ cleared: true }> { return this.transition(input.scopeKey, () => this.clearScopeState(input)) }
  private async clearScopeState(input: { scopeKey: string }): Promise<{ cleared: true }> {
    await this.registryReady
    const profile = this.profiles.get(input.scopeKey), scope = this.scopes.get(input.scopeKey)
    if (!profile || profile.status === 'cleared') return { cleared: true }
    profile.status = 'clearing'
    if (scope?.lease) profile.retiredLeases = [...new Set([...(profile.retiredLeases ?? []), `${scope.lease.runId}:${scope.lease.generation}`])]
    await this.saveRegistry()
    if (scope) { scope.state.clearing = true; this.emit(scope); await this.drainScope(scope); scope.state.control = 'closing'; this.emit(scope); await this.manager.destroyInstance(scope.state.instanceId) }
    if (this.options.clearPartition) await this.options.clearPartition(profile.partition)
    else {
      const partition = session.fromPartition(profile.partition)
      await partition.closeAllConnections(); await partition.clearStorageData(); await partition.clearCache(); await partition.clearHostResolverCache()
    }
    profile.status = 'cleared'; await this.saveRegistry()
    if (scope) {
      scope.pageHash = undefined; scope.pageCounter = 0; scope.actionReplies.clear(); scope.origins.clear()
      Object.assign(scope.state, { control: 'closed', clearing: false, url: 'about:blank', title: '新网页', pageVersion: '0', isLoading: false, isVisible: false, toolbarReady: false })
      delete scope.state.error
      this.emit(scope)
    }
    return { cleared: true }
  }
  list(): BrowserWindowState[] { return [...this.scopes.values()].map(scope => structuredClone(scope.state)) }
  currentLease(): BrowserLease | null {
    const scope = this.scopes.get(APPLICATION_BROWSER_SCOPE)
    return scope?.lease && (scope.active || ['draining', 'user-controlled'].includes(scope.state.control)) ? structuredClone(scope.lease) : null
  }
  async disconnectAll(): Promise<void> { await Promise.all([...this.scopes.values()].map(scope => this.transition(APPLICATION_BROWSER_SCOPE, () => this.drainScope(scope)))) }
  async shutdown(): Promise<void> { await this.registryReady; await this.disconnectAll(); await this.manager.destroyAll() }
}
