/*
 * [OUTPUT]: 读取插件技能不启动进程，停用/退出/配置变化不返回正文。
 * [INPUT]: Explicit application plugin enablement, employee permission and pinned upstream CLI.
 * [OUTPUT]: Desktop calls with shared admission, per-conversation refs, real images and cancellation fences.
 * [POS]: BOAI desktop provider; honors explicit plugin disablement and employee permissions.
 * [PROTOCOL]: Update Header and desktop-plugin/.folder.md on change.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareDesktopExecutable, runDesktopCommand, DESKTOP_VERSION } from '@boai/desktop-plugin/host'
import { DESKTOP_PLUGIN_ID, desktopPluginConfigSchema, desktopPluginCallSchema, desktopPluginWrites, validateDesktopPluginCall, saveDesktopPluginSettingsSchema, type DesktopPluginSettings, type DesktopPluginCall } from '@boai/shared/plugins/desktop-tools'
import { pluginAvailability, readPluginSettingsSchema } from '@boai/shared/plugins/types'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { EngineContext } from '../../contracts'
import { authorizeExecution } from '../employees/execution-permissions'
import { TaskAdmission } from '../collaboration/task-admission'
import { desktopPluginSkill } from './skill'

const desktopAdmission = new TaskAdmission()
const collection = 'desktopPluginSettings'
const plugin = applicationPlugins.find(value => value.id === DESKTOP_PLUGIN_ID)!
export class DesktopPluginService {
  private executable?: Promise<string>
  private closing = false
  private updating = false
  private calls = new Set<{ runId: string; controller: AbortController; done: Promise<unknown> }>()
  constructor(private store: ProductStore, private dataPath: string, private critical: <T>(action: () => Promise<T>) => Promise<T>) {}
  get busy() { return this.calls.size > 0 || this.updating }
  async enabled() {
    try {
      const text = await readFile(join(dirname(this.dataPath), 'application-plugins.json'), 'utf8')
      if (text.length > 32768) return false
      const settings = readPluginSettingsSchema.parse(JSON.parse(text))
      return pluginAvailability(plugin, settings) === 'enabled'
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' && pluginAvailability(plugin, { revision: 0, disabledIds: [] }) === 'enabled'
    }
  }
  async settings(): Promise<DesktopPluginSettings> {
    const saved = await this.store.get<DesktopPluginSettings>(collection, 'agent-desktop')
    return saved ? { revision: saved.revision, config: desktopPluginConfigSchema.parse(saved.config) } : { revision: 0, config: desktopPluginConfigSchema.parse({}) }
  }
  async skill(context: EngineContext) {
    context.signal.throwIfAborted()
    if (this.closing || this.updating || context.work?.organization || !await this.enabled()) return undefined
    context.signal.throwIfAborted()
    return { ...desktopPluginSkill }
  }
  async save(raw: unknown) {
    const input = saveDesktopPluginSettingsSchema.parse(raw)
    if (this.updating) throw new Error('桌面插件配置正在保存')
    this.updating = true
    try {
      if ((await this.settings()).revision !== input.expectedRevision) throw new Error('桌面插件配置已变化，请刷新后重试')
      await this.stopCalls()
      return await this.critical(async () => {
        if (this.closing) throw new Error('应用正在退出')
        if ((await this.settings()).revision !== input.expectedRevision) throw new Error('桌面插件配置已变化，请刷新后重试')
        const next = { revision: input.expectedRevision + 1, config: input.config }
        await this.store.write([{ collection, id: 'agent-desktop', value: next }])
        return next
      })
    } finally { this.updating = false }
  }
  private async assertEnabled(signal: AbortSignal) {
    signal.throwIfAborted()
    if (this.closing || this.updating || !await this.enabled()) throw new Error('Agent Desktop 插件已停用或配置正在变化')
  }
  private program() {
    return this.executable ??= prepareDesktopExecutable(join(this.dataPath, 'tools', 'agent-desktop')).catch(error => { this.executable = undefined; throw error })
  }
  async inspect(context: EngineContext) {
    await this.assertEnabled(context.signal)
    if (context.work?.organization) throw new Error('组织管理阶段不提供桌面操作')
    return { provider: 'agent-desktop', version: DESKTOP_VERSION, config: (await this.settings()).config,
      inputSchema: (await import('zod')).z.toJSONSchema(desktopPluginCallSchema),
      instructions: 'Use call_desktop_plugin for BOAI computer use. First read skills get desktop and skills get platform, then status. Use snapshot → action → fresh snapshot to verify. Pass original CLI arguments as an array, and a qualified ref from this conversation. No shell command is accepted. Screenshots return actual image parts. Read error.disposition before retrying; an unknown result may already have taken effect. Headed mode and physical keyboard input require the owner setting. If this plugin is unavailable, report that state; do not fall back to a different desktop provider.' }
  }
  async call(raw: unknown, context: EngineContext) {
    const input = desktopPluginCallSchema.parse(raw)
    await this.assertEnabled(context.signal)
    if (context.work?.organization) throw new Error('组织管理阶段不提供桌面操作')
    const settings = await this.settings()
    validateDesktopPluginCall(input, settings.config)
    const mutating = desktopPluginWrites(input)
    if (mutating) {
      const operation = { kind: 'source' as const, description: `使用 Agent Desktop 执行 ${input.command}${input.headed ? '（前台输入）' : ''}` }
      if (!context.agent.executionPermission) {
        if (!context.approveOperation || !await context.approveOperation(operation)) throw new Error('桌面操作尚未获批，操作未执行')
      } else await authorizeExecution(context, operation)
    }
    const session = `boai-${createHash('sha256').update(`${context.agent.id}:${context.conversation.id}`).digest('hex').slice(0, 32)}`
    return this.execute(input, session, context.runId, context.signal, async () => {
      if ((await this.settings()).revision !== settings.revision) throw new Error('桌面插件配置已变化，操作未执行')
      if (mutating) await context.beforeEffect?.()
    }, mutating ? context.afterEffect : undefined)
  }
  /** Owner connection check never reads an app, prompts for permission or changes desktop state. */
  test() { return this.execute(desktopPluginCallSchema.parse({ command: 'status' }), 'boai-owner-check', 'owner-check', AbortSignal.timeout(30000)) }
  private execute(input: DesktopPluginCall, session: string, runId: string, parent: AbortSignal, before?: () => Promise<void>, after?: () => Promise<void>) {
    const controller = new AbortController(), signal = AbortSignal.any([parent, controller.signal])
    const done = (async () => {
      await this.assertEnabled(signal)
      const release = await desktopAdmission.acquire(true, signal)
      try {
        await this.assertEnabled(signal)
        await before?.()
        const program = await this.program()
        await this.assertEnabled(signal)
        const args = [...input.args]
        if (input.command === 'type' && !args.some(arg => /^--timeout-ms(?:=|$)/.test(arg))) args.push('--timeout-ms', '10000')
        const result = await runDesktopCommand(program, [...(input.headed ? ['--headed'] : []), input.command, ...args], join(this.dataPath, 'agent-desktop-state'), session, signal)
        await this.assertEnabled(signal)
        await after?.()
        return result
      } finally { release() }
    })()
    const entry = { runId, controller, done }
    this.calls.add(entry)
    void done.finally(() => this.calls.delete(entry)).catch(() => {})
    return done
  }
  private async stopCalls(runId?: string) {
    const entries = [...this.calls].filter(entry => runId === undefined || entry.runId === runId)
    for (const entry of entries) entry.controller.abort(new Error('Agent Desktop 调用已取消；已投递操作须重新观察，不能自动重试'))
    await Promise.allSettled(entries.map(entry => entry.done))
  }
  async refresh() { if (!await this.enabled()) await this.stopCalls() }
  closeRun(runId: string) { return this.stopCalls(runId) }
  async close() { this.closing = true; await this.stopCalls() }
}
