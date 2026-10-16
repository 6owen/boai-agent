/*
 * [INPUT]: Pinned plugin/profile, native conversation projections and original product callbacks.
 * [OUTPUT]: Supervised isolated module, correlated acceptance, execution feed and host-authorized tools.
 * [POS]: Runtime API to existing employee engine bridge; no parent model or business retry.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing lifecycle or receipt semantics.
 */
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { LaunchProfile } from '../../../shared/domain'
import type { RuntimeEvent, RuntimeProbe, RuntimeAction } from '../../../shared/plugins/runtime-api'
import type { EngineContext } from '../../contracts'
import type { ProductStore } from '../storage/product-store'
import { RuntimePlugins, runtimeBundleRoot } from '../../modules/backends/runtime-plugins'
import { inspectProgram } from '../../modules/backends/program'
import { runClaudeProcess } from '../claude/process'
import { NativeConversationEngine, type NativeConversationInput } from '../native-conversation'
import { nativeToolContent } from '../native-tool-result'
import { nativeActivity } from '../native-events'
import { pluginFrameSchema } from './validation'
const support = z.enum(['supported', 'unsupported', 'unknown'])
const probeSchema = z.object({ name: z.string().min(1).max(100), version: z.string().min(1).max(100), protocolVersion: z.literal(1), capabilities: z.object({ chat: support, resume: support, images: support, tools: support, actions: support, steer: support, followUp: support }).strict() }).strict()

export async function runPlugin(plugins: RuntimePlugins, profile: LaunchProfile, directory: { cwd: string; privateHome: string }, signal: AbortSignal, context?: EngineContext, input?: NativeConversationInput): Promise<{ text: string; verified: NonNullable<LaunchProfile['verified']> }> {
  if (!profile.runtimePlugin) throw new Error('缺少运行时插件绑定')
  const file = inspectProgram(profile.executable)
  if (file.path !== profile.executable || file.hash !== profile.executableHash) throw new Error('本机程序已变化，请重新测试并保存连接')
  const lease = await plugins.acquire(profile.runtimePlugin), control = new AbortController()
  const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }>()
  const callbacks = new Set<Promise<unknown>>()
  let write!: (line: string) => void, result: { text: string; verified: NonNullable<LaunchProfile['verified']> } | undefined, operation: Promise<void> | undefined, fault: Error | undefined
  let sessionId = '', requestId = '', accepted = false, idle = false
  const tools = new Map(input?.tools.map(tool => [tool.name, tool]) ?? [])
  const toolCalls = new Map<string, { fingerprint: string; result: Promise<unknown> }>()
  const stop = (error: unknown) => { fault ??= error instanceof Error ? error : new Error('运行时插件失败'); control.abort(fault); input?.cancelProducts?.(); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(fault) }; pending.clear() }
  const request = (method: string, value?: unknown) => new Promise<any>((resolve, reject) => { const id = randomUUID(); const timeout = method === 'submit' ? undefined : method === 'closeSession' || method === 'interrupt' ? 10000 : 90000; const timer = timeout ? setTimeout(() => { pending.delete(id); reject(new Error(`${method}控制回执未确认，原请求需要核对`)) }, timeout) : undefined; pending.set(id, { resolve, reject, timer }); write(JSON.stringify({ type: 'request', id, method, input: value }) + '\n') })
  const send = (id: string, result?: unknown, error?: string) => { if (!control.signal.aborted && !signal.aborted) write(JSON.stringify({ type: 'callback', id, result, error }) + '\n') }
  const callback = (task: Promise<unknown>) => { callbacks.add(task); void task.catch(stop).finally(() => callbacks.delete(task)) }
  async function event(event: RuntimeEvent) {
    if (!context || !input) return
    if (event.type === 'input.accepted') {
      if (event.requestId !== requestId) throw new Error('插件受理回执不属于当前请求')
      if (!accepted) { accepted = true; await input.onSubmitted(sessionId, requestId); await context.onNativeExecution?.({ sessionId, turnId: requestId, inputAccepted: true }) }
    } else if (event.type === 'action.resumed') await context.onNativeActionSubmitted?.(event.actionId)
    else if (event.type === 'session.idle') idle = true
    else if (event.type === 'message.delta' || event.type === 'reasoning.delta') await context.onExecutionEvent?.({ id: event.id, eventType: event.type === 'message.delta' ? 'agent.text.block' : 'agent.reasoning.block', payload: { text: '' }, appendText: event.delta })
    else if (event.type === 'message.completed') await context.onExecutionEvent?.({ id: event.id, eventType: 'agent.text.block', payload: { itemId: event.id, text: event.text } })
    else if (event.type === 'tool.started' || event.type === 'tool.updated' || event.type === 'tool.completed') {
      const completed = event.type === 'tool.completed'
      await context.onExecutionEvent?.(nativeActivity(event.id, { name: event.name, input: event.input, result: event.output, isError: event.failed }, completed))
    }
  }
  const abort = () => {
    // Interrupt is best effort; actual supervised resource exit remains authoritative.
    try { void request('interrupt').catch(() => {}) } catch { /* Launch may not have started. */ }
    stop(signal.reason ?? new Error('执行已停止'))
  }
  try {
    await mkdir(directory.cwd, { recursive: true }); await mkdir(directory.privateHome, { recursive: true, mode: 0o700 })
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: process.env.TMPDIR, HOME: profile.useExistingLogin ? process.env.HOME : directory.privateHome, USERPROFILE: profile.useExistingLogin ? process.env.USERPROFILE : directory.privateHome }
    for (const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR']) if (process.env[key]) env[key] = process.env[key]
    env.NO_PROXY = env.no_proxy = [...new Set([...(env.NO_PROXY ?? '').split(','),...(env.no_proxy ?? '').split(','),'127.0.0.1','localhost','::1'])].filter(Boolean).join(',')
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
    let eventQueue = Promise.resolve()
    await runClaudeProcess({ executable: join(runtimeBundleRoot(), 'runner.mjs'), runtime: 'node', args: [], cwd: directory.cwd, privateHome: directory.privateHome, env, signal: control.signal, native: true, ...(!context ? { timeoutMs: 60000 } : {}),
      onReady: (sendLine, end) => {
        write = sendLine
        operation = (async () => {
          await request('initialize', { entry: lease.entry, launch: { executable: file.path, runtime: profile.runtime, args: lease.contribution.launch?.args ?? [], cwd: directory.cwd, privateHome: directory.privateHome, modelId: context?.agent.modelId, config: lease.config } })
          const verified: RuntimeProbe = probeSchema.parse(await request('probe'))
          if (context && (!profile.verified || profile.verified.version !== verified.version || profile.verified.name !== verified.name)) throw new Error('原生程序版本变化，请重新测试连接')
          if (context && input) {
            if (verified.capabilities.chat !== 'supported') throw new Error('插件未验证聊天能力')
            if (input.images.length && verified.capabilities.images !== 'supported') throw new Error('当前插件未声明图片输入支持')
            const instructions = verified.capabilities.tools === 'supported' ? input.instructions : `${input.nativeInstructions ?? input.instructions}\nBOAI product tools are unavailable on this connection. Use native tools for native work; explain that BOAI file publication, delegation, automation and embedded browser actions require a connection with product-tool support.`
            const opened = await request('openSession', { resumeRef: verified.capabilities.resume === 'supported' ? input.threadId : undefined, instructions, tools: verified.capabilities.tools === 'supported' ? input.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) : [] })
            if (typeof opened.sessionId !== 'string' || !opened.sessionId) throw new Error('插件未返回会话身份')
            sessionId = opened.sessionId; if (opened.resumeRef) await input.onSession(opened.resumeRef)
            await context.onNativeExecution?.({ sessionId })
            requestId = context.runId
            const response = await request('submit', { requestId, text: input.prompt, images: input.images })
            await eventQueue
            if (!accepted || !idle || typeof response?.text !== 'string') throw new Error('插件缺少真实受理或空闲回执，原请求需要核对')
            await context.onDelta(response.text); result = { text: response.text, verified: { ...verified, checkedAt: new Date().toISOString() } }
          } else result = { text: '', verified: { ...verified, checkedAt: new Date().toISOString() } }
          await request('closeSession'); end()
        })().catch(stop)
      },
      onLine: line => {
        const frame = pluginFrameSchema.parse(JSON.parse(line))
        if (frame.type === 'response') { const item = pending.get(frame.id); if (!item) throw new Error('插件返回未知请求'); pending.delete(frame.id); clearTimeout(item.timer); if (frame.error) item.reject(new Error(frame.error)); else item.resolve(frame.result) }
        else if (frame.type === 'event') { eventQueue = eventQueue.then(() => event(frame.event)); callback(eventQueue) }
        else if (frame.type === 'tool') {
          callback((async () => { try {
            context?.signal.throwIfAborted(); const value = frame.value, tool = tools.get(value?.name)
            if (!context || !tool || typeof value.callId !== 'string') throw new Error('插件工具不属于当前获准执行')
            const fingerprint = JSON.stringify([value.name, value.input]), prior = toolCalls.get(value.callId)
            if (prior && prior.fingerprint !== fingerprint) throw new Error('插件工具身份重复且参数不同')
            const task = prior?.result ?? tool.execute(value.input, value.callId)
            if (!prior) toolCalls.set(value.callId, { fingerprint, result: task })
            const output = await task; send(frame.id, { content: nativeToolContent(tool, output) })
          } catch (error) { send(frame.id, { content: [{ type: 'text', text: error instanceof Error ? error.message : '工具失败' }], isError: true }) } })())
        } else if (frame.type === 'action') {
          callback((async () => { try { if (!context?.requestNativeAction) throw new Error('当前执行不支持原生交互'); const action = frame.value as RuntimeAction; const response = await context.requestNativeAction({ ...action, method: 'runtime-plugin' }, control.signal); send(frame.id, response) } catch (error) { send(frame.id, undefined, error instanceof Error ? error.message : '交互失败') } })())
        } else throw new Error('插件返回未知协议帧')
      },
    })
    if (pending.size) stop(new Error('插件退出时仍有未确认请求'))
    await operation
    if (fault) throw fault
    if (!result) throw new Error('插件退出但没有完成回执')
    return result
  } catch (error) { stop(error instanceof Error && error.message.startsWith('Claude') ? new Error(error.message.replaceAll('Claude', '运行时插件')) : error); throw fault } finally {
    signal.removeEventListener('abort', abort); control.abort(); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(fault ?? new Error('插件已退出')) }; pending.clear()
    await operation; await Promise.allSettled(callbacks); lease.release()
  }
}
export class PluginEmployeeEngine extends NativeConversationEngine {
  constructor(store: ProductStore, namespace: string, private readonly plugins: RuntimePlugins) { super(store, namespace) }
  protected conversation(context: EngineContext, input: NativeConversationInput) { if (!context.runtimeProfile || !context.runtimeDirectory) throw new Error('插件执行配置缺失'); return runPlugin(this.plugins, context.runtimeProfile, context.runtimeDirectory, context.signal, context, input) }
}
