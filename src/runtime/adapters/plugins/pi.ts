/*
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: Pi 0.85.1+ native RPC and Runtime API v2 services; explicit sources require verified Pi 1.3.0.
 * [OUTPUT]: Strict JSONL, correlated acceptance, native session files, extension tools and actual settled termination.
 * [POS]: Independently bundled Pi provider; protocol source is Pi's shipped docs/rpc.md.
 * [PROTOCOL]: Update Header and plugins/.folder.md; verify changed upstream commands before release.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { launchNative, JsonLines } from './transport'
import { toolServer } from './tool-server'
import { piNativeSourceIdentity } from './native-source'
import { piGatewaySource } from './gateway-source'
import type { RuntimeProvider, RuntimeServices, RuntimeSessionInput, RuntimeSubmission } from '../../../shared/plugins/runtime-api'
export const runtimeApiVersion = 2
export function createRuntime(services: RuntimeServices): RuntimeProvider {
  const { launch, emit } = services
  const source = services.modelSource, gateway = source ? piGatewaySource(source) : undefined
  let rpc: JsonLines | undefined, bridge: Awaited<ReturnType<typeof toolServer>> | undefined, extension: string | undefined
  let sessionId = '', text = '', running = false, messageId = '', failure: Error | undefined
  let settled: { resolve(): void; reject(error: Error): void } | undefined
  const answered = new Set<string>()
  const event = (frame: any) => {
    if (['message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end', 'agent_settled'].includes(frame.type)) {
      for (const actionId of answered) emit({ type: 'action.resumed', actionId }); answered.clear()
    }
    if (frame.type === 'message_start' && frame.message?.role === 'assistant') messageId = randomUUID()
    if (frame.type === 'message_update') {
      const update = frame.assistantMessageEvent
      if (update?.type === 'text_delta' || update?.type === 'thinking_delta') emit({ type: update.type === 'text_delta' ? 'message.delta' : 'reasoning.delta', id: `${messageId}:${update.contentIndex}`, delta: String(update.delta ?? '') })
    }
    if (frame.type === 'message_end' && frame.message?.role === 'assistant') {
      const message = frame.message
      if (message.stopReason === 'error' || message.stopReason === 'aborted') failure = new Error(message.errorMessage ?? 'Pi执行未完成')
      const reply = (message.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')
      if (reply) text = reply
      // Completed blocks use the same identities as streamed blocks.
      for (const [index, part] of (message.content ?? []).entries()) if (part.type === 'text') emit({ type: 'message.completed', id: `${messageId}:${index}`, text: part.text })
    }
    if (frame.type === 'tool_execution_start' || frame.type === 'tool_execution_update' || frame.type === 'tool_execution_end') emit({ type: frame.type === 'tool_execution_start' ? 'tool.started' : frame.type === 'tool_execution_end' ? 'tool.completed' : 'tool.updated', id: frame.toolCallId, name: frame.toolName, input: frame.args, output: frame.result ?? frame.partialResult, failed: frame.isError === true })
    if (frame.type === 'agent_settled') { running = false; emit({ type: 'session.idle' }); if (failure) settled?.reject(failure); else settled?.resolve(); settled = undefined }
    if (frame.type === 'extension_ui_request') void respond(frame).catch(error => { failure = error; settled?.reject(error); void rpc?.close() })
  }
  async function respond(frame: any) {
    if (!['select', 'confirm', 'input', 'editor'].includes(frame.method)) {
      if (['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'].includes(frame.method)) { emit({ type: 'diagnostic', code: `pi.${frame.method}` }); return }
      rpc!.write({ type: 'extension_ui_response', id: frame.id, cancelled: true }); throw new Error(`不支持的Pi交互：${frame.method}`)
    }
    const confirm = frame.method === 'confirm', options = confirm ? [{ id: 'yes', label: '允许' }, { id: 'no', label: '拒绝' }] : frame.method === 'select' ? (frame.options ?? []).map((label: string, index: number) => ({ id: String(index), label })) : []
    const response = await services.action({ id: frame.id, kind: options.length ? 'approval' : 'input', title: frame.title ?? 'Pi 请求输入', detail: frame.message ?? frame.title ?? '', options, ...(!options.length ? { questions: [{ id: frame.id, question: frame.title ?? '请输入回复' }] } : {}) })
    const selected = options.find((option: { id: string }) => option.id === response.option)
    rpc!.write({ type: 'extension_ui_response', id: frame.id, ...(confirm ? { confirmed: response.option === 'yes' } : { value: selected?.label ?? response.answers?.[frame.id]?.join('\n'), cancelled: !selected && !response.answers?.[frame.id]?.length }) })
    answered.add(frame.id)
  }
  async function start(args: string[]) { rpc = new JsonLines(launchNative(launch, args, gateway?.env), event); return rpc.request('get_state', {}, 60000) }
  async function close() { const value = rpc; rpc = undefined; if (value) await value.close(); if (bridge) { await bridge.close(); bridge = undefined } if (extension) { await rm(extension, { force: true }); extension = undefined } }
  return {
    async inspectSource() { return { fingerprint: await piNativeSourceIdentity(launch) } },
    async probe() {
      const child = launchNative(launch, ['--version']); let version = ''
      child.stdout.on('data', value => { if (version.length < 1000) version += value.toString() }); child.stderr.resume()
      await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('Pi版本读取失败'))) })
      version = version.trim(); if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Pi未返回有效版本')
      const [major, minor, patch] = version.split('.').map(Number)
      if (major === 0 && (minor < 85 || minor === 85 && patch < 1)) throw new Error('Pi插件需要0.85.1或更新版本的agent_settled事件')
      if (source && version !== '1.3.0') throw new Error('明确网关来源需要已核对的Pi 1.3.0')
      await start(['--mode', 'rpc', '--no-session']); await close()
      return { name: 'Pi', version, protocolVersion: 1, ...(version === '1.3.0' ? { modelSource: { protocols: ['chat', 'responses', 'messages'] as ('chat' | 'responses' | 'messages')[] } } : {}), capabilities: { chat: 'supported', resume: 'supported', images: 'supported', tools: 'supported', actions: 'supported', steer: 'supported', followUp: 'supported' } }
    },
    async openSession(input: RuntimeSessionInput) {
      await mkdir(launch.privateHome, { recursive: true, mode: 0o700 })
      const sessions = join(launch.privateHome, 'sessions'); await mkdir(sessions, { recursive: true })
      if (input.resumeRef) { const path = relative(sessions, input.resumeRef); if (!isAbsolute(input.resumeRef) || path.startsWith('..') || isAbsolute(path)) throw new Error('Pi续用引用不属于当前员工会话') }
      bridge = await toolServer(services, input.tools)
      extension = join(launch.privateHome, `boai-${randomUUID()}.mjs`)
      await writeFile(extension, `export default function(pi) { ${gateway?.extension ?? ''} const tools = ${JSON.stringify(input.tools)}; for (const tool of tools) pi.registerTool({ name: tool.name, label: tool.name, description: tool.description, parameters: tool.inputSchema, async execute(callId, input, signal) { const response = await fetch(${JSON.stringify(bridge.url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: callId, method: 'tools/call', params: { name: tool.name, arguments: input, callId } }), signal }); const value = await response.json(); if (value.error) throw new Error(value.error.message); if (value.result?.isError) throw new Error(value.result.content?.map(part => part.text ?? '').join('\\n') || 'BOAI工具失败'); return { content: value.result.content, details: {} }; } }); }`, { mode: 0o600 })
      let state = await start(['--mode', 'rpc', '--session-dir', sessions, '--append-system-prompt', input.instructions, '--extension', extension, ...(input.resumeRef ? ['--session', input.resumeRef] : []), ...(gateway ? ['--provider', gateway.providerId, '--model', source!.modelId] : launch.modelId ? ['--model', launch.modelId] : [])])
      if (gateway) {
        await rpc!.request('set_model', { provider: gateway.providerId, modelId: source!.modelId })
        state = await rpc!.request('get_state')
        if (state.model?.provider !== gateway.providerId || state.model?.id !== source!.modelId || state.model?.baseUrl !== gateway.baseUrl) throw new Error('Pi实际模型来源与所选网关不一致，未发送本轮消息')
      }
      if (typeof state?.sessionId !== 'string' || typeof state?.sessionFile !== 'string') throw new Error('Pi未返回持久会话身份')
      sessionId = state.sessionId; return { sessionId, resumeRef: state.sessionFile, ...(source ? { modelSource: { protocol: source.protocol, modelId: source.modelId } } : {}) }
    },
    async submit(input: RuntimeSubmission) {
      if (!rpc || running) throw new Error('Pi会话未就绪或已有执行')
      running = true; text = ''; failure = undefined
      const completed = new Promise<void>((resolve, reject) => { settled = { resolve, reject } }); void completed.catch(() => {})
      const images = input.images.map(value => { const match = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(value); if (!match) throw new Error('Pi图片格式不支持'); return { type: 'image', mimeType: match[1], data: match[2] } })
      await rpc.request('prompt', { message: input.text, ...(images.length ? { images } : {}) }); emit({ type: 'input.accepted', requestId: input.requestId })
      await Promise.race([completed, rpc.exited.then(() => { throw new Error('Pi结束前连接断开，原请求需要核对') })]); return { text }
    },
    async sendInput(input) { if (!rpc) throw new Error('Pi会话已关闭'); if (input.images.length) throw new Error('活动输入图片尚未接入'); await rpc.request(input.mode === 'steer' ? 'steer' : 'follow_up', { message: input.text }); emit({ type: 'input.accepted', requestId: input.requestId }) },
    async interrupt() { if (rpc) { await rpc.request('clear_queue'); await rpc.request('abort') } },
    async inspect() { if (!rpc) return { state: 'unknown' }; const state = await rpc.request('get_state'); return { state: state.isStreaming || state.isCompacting || state.pendingMessageCount ? 'running' : 'idle' } },
    closeSession: close,
  }
}
