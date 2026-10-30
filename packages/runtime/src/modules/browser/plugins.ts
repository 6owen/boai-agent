/*
 * [INPUT]: Application plugin enablement, saved launch settings and the original execution context.
 * [OUTPUT]: Independent upstream browser sessions with existing approvals, cancellation and shutdown.
 * [POS]: Browser plugin host; never acquires BOAI's embedded-browser lease or login partition.
 * [PROTOCOL]: Update Header and browser/.folder.md on change.
 */
import { readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createBrowserPluginSession, browserPluginRuntimeRoot, type BrowserPluginSession } from '@boai/browser-plugins/host'
import { browserPluginProviderSchema, browserPluginConfigSchema, browserPluginId, browserPluginNames, browserPluginCallSchema, saveBrowserPluginSettingsSchema, type BrowserPluginProvider, type BrowserPluginSettings } from '@boai/shared/plugins/browser-tools'
import { readPluginSettingsSchema } from '@boai/shared/plugins/types'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { EngineContext } from '../../contracts'
import { authorizeExecution } from '../employees/execution-permissions'
import { executeCommand } from '../../adapters/mastra/host-command'
import { employeeCommandScope } from '../workspaces/directory-command'

const collection = 'browserPluginSettings'
const readTools = new Set(['browser_goto', 'browser_snapshot', 'browser_screenshot', 'browser_wait', 'browser_scroll', 'browser_back', 'browser_close'])
interface Entry { provider: BrowserPluginProvider; runId: string; session: Promise<BrowserPluginSession>; tail: Promise<unknown>; closing?: Promise<void>; detach?(): void }

export class BrowserPluginService {
  private entries = new Map<string, Entry>()
  private closing = false
  private updating = new Set<BrowserPluginProvider>()
  constructor(private store: ProductStore, private dataPath: string, private critical: <T>(action: () => Promise<T>) => Promise<T>) {}
  async enabled() {
    try {
      const text = await readFile(join(dirname(this.dataPath), 'application-plugins.json'), 'utf8')
      if (text.length > 32768) throw new Error('插件配置过大')
      const settings = readPluginSettingsSchema.parse(JSON.parse(text))
      return browserPluginProviderSchema.options.filter(provider => settings.enabledIds.includes(browserPluginId(provider)) && !settings.disabledIds.includes(browserPluginId(provider)))
    } catch (error) {
      // The main plugin store reports malformed settings; no optional provider may launch.
      return []
    }
  }
  async settings(raw: unknown): Promise<BrowserPluginSettings> {
    const provider = browserPluginProviderSchema.parse(raw)
    const saved = await this.store.get<BrowserPluginSettings>(collection, provider)
    return saved ? { provider, revision: saved.revision, config: browserPluginConfigSchema.parse(saved.config) } : { provider, revision: 0, config: browserPluginConfigSchema.parse({}) }
  }
  async save(raw: unknown) {
    const input = saveBrowserPluginSettingsSchema.parse(raw)
    if (this.updating.has(input.provider)) throw new Error('浏览器插件配置正在保存')
    this.updating.add(input.provider)
    try {
      const previous = await this.settings(input.provider)
      if (previous.revision !== input.expectedRevision) throw new Error('浏览器插件配置已变化，请刷新后重试')
      await this.closeWhere(entry => entry.provider === input.provider)
      return await this.critical(async () => {
        if (this.closing) throw new Error('应用正在退出')
        const current = await this.settings(input.provider)
        if (current.revision !== input.expectedRevision) throw new Error('浏览器插件配置已变化，请刷新后重试')
        const next = { provider: input.provider, revision: current.revision + 1, config: input.config }
        await this.store.write([{ collection, id: input.provider, value: next }])
        return next
      })
    } finally { this.updating.delete(input.provider) }
  }
  private async assertEnabled(provider: BrowserPluginProvider, context: EngineContext) {
    context.signal.throwIfAborted()
    if (this.closing || this.updating.has(provider) || !(await this.enabled()).includes(provider)) throw new Error('浏览器插件已停用或配置正在变化')
    if (context.work?.organization) throw new Error('组织管理阶段不提供浏览器插件')
  }
  private async entry(provider: BrowserPluginProvider, context: EngineContext) {
    await this.assertEnabled(provider, context)
    const key = `${context.runId}:${provider}`
    let entry = this.entries.get(key)
    if (!entry) {
      const settings = await this.settings(provider)
      await this.assertEnabled(provider, context)
      entry = this.entries.get(key)
      if (!entry) {
        const value: Entry = { provider, runId: context.runId, session: createBrowserPluginSession(provider, settings.config, context.runId, async (command, cleanup, runtimeWrites = []) => {
          if (!context.agent.allowCommands) throw new Error('当前员工未启用命令执行，无法使用 BrowserViewer CLI')
          const workspace = context.environment?.workspace
          const cwd = context.workingDirectory ?? workspace?.runPath
          if (!cwd) throw new Error('BrowserViewer CLI 需要当前工作目录')
          const effective = cleanup ? AbortSignal.timeout(10000) : context.signal
          const lease = cleanup ? undefined : await context.acquireCliEnvironment?.()
          try {
            const directories = cleanup ? undefined : await employeeCommandScope(context.agent, { readOnly: [browserPluginRuntimeRoot(), ...(workspace ? [workspace.root, workspace.sharedPath] : [])], readWrite: [workspace?.runPath ?? cwd, ...await Promise.all(runtimeWrites.map(value => realpath(value)))] }, context.directoryAccess?.temporaryGrants, context.directoryAccess?.protectedRoots)
            return await executeCommand(command, cwd, effective, cleanup ? 10000 : 120000, directories, lease?.env, cleanup ? undefined : () => this.assertEnabled(provider, context))
          } finally { await lease?.release() }
        }), tail: Promise.resolve() }
        this.entries.set(key, value); entry = value
        const abort = () => { void this.closeEntry(value).catch(() => {}) }
        context.signal.addEventListener('abort', abort, { once: true })
        void value.session.catch(() => { this.entries.delete(key) })
        // Detach after this run's browser is actually closed.
        value.detach = () => context.signal.removeEventListener('abort', abort)
      }
    }
    if (entry.closing) throw new Error('浏览器插件会话正在关闭')
    return entry
  }
  async inspect(raw: unknown, context: EngineContext) {
    const provider = browserPluginProviderSchema.parse(raw), entry = await this.entry(provider, context)
    return { provider, name: browserPluginNames[provider], tools: (await entry.session).inspect(), independentBrowser: true }
  }
  async call(raw: unknown, context: EngineContext) {
    const input = browserPluginCallSchema.parse(raw)
    await this.assertEnabled(input.provider, context)
    if (input.provider === 'browser-viewer' && !context.agent.allowCommands) throw new Error('当前员工未启用命令执行，无法使用 BrowserViewer CLI')
    const mutating = input.provider === 'browser-viewer' || !readTools.has(input.tool) || !!input.arguments.path
    if (mutating) {
      if (!context.work && context.ensureNativeWork) await context.ensureNativeWork.call(context)
      if (!context.work) throw new Error('请在任务执行阶段调用浏览器交互工具')
      await authorizeExecution(context, { kind: input.provider === 'browser-viewer' ? 'command' : 'browser', description: `使用 ${browserPluginNames[input.provider]} 执行 ${input.tool}` })
    }
    const entry = await this.entry(input.provider, context)
    const call = entry.tail.then(async () => {
      if (entry.closing) throw new Error('浏览器插件会话正在关闭')
      await this.assertEnabled(input.provider, context)
      if (mutating) await context.beforeEffect?.()
      const result = await (await entry.session).call(input.tool, input.arguments, randomUUID())
      await this.assertEnabled(input.provider, context)
      if (mutating) await context.afterEffect?.()
      return result
    })
    entry.tail = call.catch(() => {})
    return call
  }
  private closeEntry(entry: Entry) {
    return entry.closing ??= (async () => {
      try { await (await entry.session).close(); await entry.tail }
      finally { entry.detach?.(); this.entries.delete(`${entry.runId}:${entry.provider}`) }
    })()
  }
  private async closeWhere(predicate: (entry: Entry) => boolean) { await Promise.all([...this.entries.values()].filter(predicate).map(entry => this.closeEntry(entry))) }
  async refresh() { const enabled = await this.enabled(); await this.closeWhere(entry => !enabled.includes(entry.provider)) }
  closeRun(runId: string) { return this.closeWhere(entry => entry.runId === runId) }
  async close() { this.closing = true; await this.closeWhere(() => true) }
}
