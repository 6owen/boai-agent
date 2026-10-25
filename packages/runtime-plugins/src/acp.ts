/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: ACP SDK v1, a declaration-only launch package and Runtime API services.
 * [OUTPUT]: Negotiated sessions, native permission choices, tool/text events and HTTP MCP product tools.
 * [POS]: Reusable ACP driver; contains no OpenCode or other brand dispatch.
 * [PROTOCOL]: Update Header and plugins/.folder.md; preserve negotiated capabilities.
 */
import { Readable, Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import type { RuntimeProvider, RuntimeServices, RuntimeSubmission, RuntimeModelProtocol } from '@boai/runtime-plugin-sdk'
import { launchNative } from './transport'
import { toolServer } from './tool-server'
export const runtimeApiVersion = 1
export function createRuntime(services: RuntimeServices, native: { env?: NodeJS.ProcessEnv; modelId?: string; modelSource?: { protocol: RuntimeModelProtocol; modelId: string } } = {}): RuntimeProvider {
  let child: ReturnType<typeof launchNative> | undefined, connection: ClientSideConnection | undefined
  let initialized: Awaited<ReturnType<ClientSideConnection['initialize']>> | undefined
  let bridge: Awaited<ReturnType<typeof toolServer>> | undefined, exited: Promise<void> | undefined
  let sessionId = '', running = false, loading = false, accepted = false, requestId = '', text = '', block = '', instructions = ''
  const accept = () => { if (!accepted && requestId) { accepted = true; services.emit({ type: 'input.accepted', requestId }) } }
  const answered = new Set<string>()
  const resumed = () => { for (const actionId of answered) services.emit({ type: 'action.resumed', actionId }); answered.clear() }
  async function start() {
    if (connection) return
    child = launchNative(services.launch, services.launch.args, native.env); child.stderr.resume(); child.stdin.on('error', () => {})
    exited = new Promise(resolve => { child!.once('close', () => resolve()); child!.once('error', () => resolve()) })
    connection = new ClientSideConnection(() => ({
      requestPermission: async request => {
        if (request.sessionId !== sessionId || !running) return { outcome: { outcome: 'cancelled' as const } }
        accept()
        const id = `acp-${request.toolCall.toolCallId}-${randomUUID()}`
        const response = await services.action({ id, kind: 'approval', title: request.toolCall.title ?? '原生工具权限', detail: request.toolCall.rawInput ?? {}, options: request.options.map(option => ({ id: option.optionId, label: option.name })) })
        answered.add(id)
        return request.options.some(option => option.optionId === response.option) ? { outcome: { outcome: 'selected' as const, optionId: response.option! } } : { outcome: { outcome: 'cancelled' as const } }
      },
      sessionUpdate: async notification => {
        if (loading || notification.sessionId !== sessionId || !running) return
        accept(); resumed(); const update = notification.update
        if (update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') {
          if (update.content.type === 'text') { const reasoning = update.sessionUpdate === 'agent_thought_chunk'; if (!reasoning) text += update.content.text; services.emit({ type: reasoning ? 'reasoning.delta' : 'message.delta', id: `${block}:${reasoning ? 'thinking' : 'text'}`, delta: update.content.text }) }
        } else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          services.emit({ type: update.status === 'completed' || update.status === 'failed' ? 'tool.completed' : update.sessionUpdate === 'tool_call' ? 'tool.started' : 'tool.updated', id: update.toolCallId, name: update.title ?? '原生工具', input: update.rawInput, output: update.rawOutput ?? update.content, failed: update.status === 'failed' })
        }
      },
    }), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>))
    initialized = await Promise.race([connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientInfo: { name: 'boai-agent', version: '0.2.2' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } }), exited.then(() => { throw new Error('ACP握手前程序退出') })])
    if (initialized.protocolVersion !== PROTOCOL_VERSION || !initialized.agentInfo?.version) throw new Error('ACP协议或程序版本不可验证')
  }
  async function close() {
    if (child) { child.kill('SIGTERM'); const timer = setTimeout(() => child?.kill('SIGKILL'), 1000); try { await exited } finally { clearTimeout(timer) } }
    if (bridge) await bridge.close(); child = undefined; connection = undefined; bridge = undefined
  }
  return {
    async probe() { await start(); return { name: initialized!.agentInfo!.name, version: initialized!.agentInfo!.version, protocolVersion: initialized!.protocolVersion, capabilities: { chat: 'supported', resume: initialized!.agentCapabilities?.loadSession ? 'supported' : 'unsupported', images: initialized!.agentCapabilities?.promptCapabilities?.image ? 'supported' : 'unsupported', tools: initialized!.agentCapabilities?.mcpCapabilities?.http ? 'supported' : 'unsupported', actions: 'supported', steer: 'unsupported', followUp: 'unsupported' } } },
    async openSession(input) {
      await start(); instructions = input.instructions
      const capabilities = initialized!.agentCapabilities
      const servers: { type: 'http'; name: string; url: string; headers: [] }[] = []
      if (input.tools.length) {
        if (!capabilities?.mcpCapabilities?.http) throw new Error('此ACP程序未声明HTTP MCP；当前BOAI产品工具桥不可用')
        bridge = await toolServer(services, input.tools); servers.push({ type: 'http', name: 'boai', url: bridge.url, headers: [] })
      }
      let options: import('@agentclientprotocol/sdk').SessionConfigOption[] | undefined
      if (input.resumeRef && capabilities?.loadSession) {
        loading = true
        try { options = (await connection!.loadSession({ sessionId: input.resumeRef, cwd: services.launch.cwd, mcpServers: servers })).configOptions ?? undefined; sessionId = input.resumeRef } finally { loading = false }
      } else { const session = await connection!.newSession({ cwd: services.launch.cwd, mcpServers: servers }); sessionId = session.sessionId; options = session.configOptions ?? undefined }
      const selectedModel = native.modelId ?? services.launch.modelId
      if (selectedModel) {
        const model = options?.find(value => value.category === 'model'); if (!model) throw new Error('此ACP程序未提供模型配置，请留空使用原生默认模型')
        const selected = await connection!.setSessionConfigOption({ sessionId, configId: model.id, value: selectedModel })
        if (native.modelSource && selected.configOptions.find(value => value.id === model.id)?.currentValue !== selectedModel) throw new Error('ACP未确认所选网关模型，未发送本轮消息')
      }
      return { sessionId, ...(capabilities?.loadSession ? { resumeRef: sessionId } : {}), ...(native.modelSource ? { modelSource: native.modelSource } : {}) }
    },
    async submit(input: RuntimeSubmission) {
      if (!connection || !sessionId || running) throw new Error('ACP会话未就绪')
      if (input.images.length && !initialized?.agentCapabilities?.promptCapabilities?.image) throw new Error('此ACP程序不支持图片输入')
      requestId = input.requestId; accepted = false; text = ''; running = true; block = randomUUID()
      const prompt: ({ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string })[] = [{ type: 'text', text: `${instructions}\n\n${input.text}` }]
      for (const value of input.images) { const match = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(value); if (!match) throw new Error('图片格式无效'); prompt.push({ type: 'image', mimeType: match[1], data: match[2] }) }
      const result = await Promise.race([connection.prompt({ sessionId, prompt }), exited!.then(() => { throw new Error('ACP连接断开，原请求需要核对') })])
      accept(); resumed(); running = false; services.emit({ type: 'session.idle' })
      if (result.stopReason !== 'end_turn') throw new Error(`ACP执行未完成：${result.stopReason}`)
      return { text }
    },
    async interrupt() { if (connection && running) await connection.cancel({ sessionId }) },
    async inspect() { return { state: running ? 'running' : connection ? 'idle' : 'unknown' } },
    closeSession: close,
  }
}
