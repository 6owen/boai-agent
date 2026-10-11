/*
 * [OUTPUT]: 2026-10-11 持续原生Claude生产驱动支持本机登录/显式API、原生工具与公开过程；旧私有阶段仅作兼容回归。
 * [OUTPUT]: 私有格式完成回执的is_error仅接受省略或布尔值；异常类型不确认完成，原唯一身份、三轮纠正、终态深相等及私有文本隔离保持。
 * [OUTPUT]: 原内容对象解析后、工具校验/文本回调完成前计固定类型桶，仅表示进入分支；未知/缺省/非字符串归other，不保存类型原文、正文、签名或工具参数，排队行不计桶。
 * [OUTPUT]: 当前会话api_retry的401/403立即拒绝并沿原监督器等待实际退出，只保留固定状态；其他重试状态保持原流程，不传播提供方错误正文。显式disabled桥及流式计量保持。
 * [OUTPUT]: 外部阶段诊断仅保留白名单事件类型/计数/相对时间、格式计数和传输终态；故障与成功分别留证，无正文、凭据或内部模型步骤推断。
 * [OUTPUT]: 宿主工具诊断保存唯一调用的接收/实际执行/回执计数及错误结果当时的固定状态；清理后核对，不改变失败或重放业务。
 * [INPUT]: 明确程序/hash、API来源、受管会话目录与当前获准宿主工具。
 * [OUTPUT]: Claude有界图片/阶段核对与逐消息已知计量，终态后才完整结算；私有格式提交无业务授权，低强度限定阶段；原三轮纠正与业务不重放保持。
 * [POS]: Claude底层阶段；员工路由/记忆/Work发布由宿主负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdir } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { ModelUsage } from '../../../shared/domain'
import type { LaunchProfile } from '../../../shared/domain/backends'
import { inspectProgram } from '../../modules/backends/program'
import { CLAUDE_PROGRAM_LIMIT, CLAUDE_STRUCTURED_INSTRUCTIONS, CLAUDE_STRUCTURED_MAX_TURNS, CLAUDE_STRUCTURED_REMINDER, CLAUDE_VERIFIED_VERSION, claudeEnvironment, claudeNoToolsArgs, claudeProviderEnvironment } from './policy'
import { runClaudeProcess, type ClaudeProcessReceipt } from './process'
import { claudeInput } from './input'
import { ClaudeUsage } from './usage'
import { createClaudeToolBridge, type ClaudeToolBridgeDiagnostic, type ClaudeToolCallState } from './tools'
import { createClaudeThinkingBridge } from './thinking-bridge'
import type { NativeTool } from '../native-task'

type RecordValue = Record<string, unknown>
export interface ClaudeProgram { executable: string; executableHash: string; runtime?: 'node'; version: string }
export interface ClaudePhaseDiagnostic {
  outcome: 'completed' | 'failed' | 'cancelled'
  stage: 'prepare' | 'init_wait' | 'event_wait' | 'result_received' | 'returned' | 'cleanup' | 'usage_settlement'
  eventCounts: Record<string, number>
  contentBlockStartCounts?: Record<'text' | 'thinking' | 'tool_use' | 'server_tool_use' | 'other', number>
  contentBlockDeltaCounts?: Record<'text_delta' | 'thinking_delta' | 'input_json_delta' | 'other', number>
  lastEvent?: { type: string; afterMs: number }
  transport?: ClaudeProcessReceipt
  protocolCounts?: { formatterCalls: number; formatterRejections: number; formatReminders: number }
  toolBridge?: ClaudeToolBridgeDiagnostic & { errorResultState?: ClaudeToolCallState }
  apiRejection?: { status: 401 | 403 }
}
const diagnosticEvents = new Set(['init', 'system', 'message_start', 'message_delta', 'message_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'assistant', 'user', 'result', 'tool_progress', 'tool_use_summary'])
const object = (value: unknown): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Claude返回无效协议对象')
  return value as RecordValue
}
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const empty = (value: unknown) => Array.isArray(value) && value.length === 0
async function directories(cwd: string, configDirectory: string) {
  if (!isAbsolute(cwd) || !isAbsolute(configDirectory)) throw new Error('Claude需要明确的受管绝对目录')
  await mkdir(cwd, { recursive: true, mode: 0o700 })
  await mkdir(configDirectory, { recursive: true, mode: 0o700 })
}

/** Version check does not receive credentials or invoke a model. */
export async function verifyClaudeProgram(input: { executable: string; cwd: string; configDirectory: string; signal: AbortSignal; native?: boolean }): Promise<ClaudeProgram> {
  input.signal.throwIfAborted()
  const file = inspectProgram(input.executable, CLAUDE_PROGRAM_LIMIT)
  await directories(input.cwd, input.configDirectory)
  const lines: string[] = []
  await runClaudeProcess({ executable: file.path, runtime: file.runtime, args: ['--version'], cwd: input.cwd,
    env: claudeEnvironment(input.configDirectory), signal: input.signal, timeoutMs: 10_000, onLine: line => { lines.push(line) } })
  const version = lines.length === 1 ? /^(\d+\.\d+\.\d+) \(Claude Code\)$/.exec(lines[0])?.[1] : undefined
  if (!version || !input.native && version !== CLAUDE_VERIFIED_VERSION) throw new Error('Claude 程序版本无法识别或不支持旧阶段协议')
  return { executable: file.path, executableHash: file.hash, runtime: file.runtime, version }
}

/** Program-only verification: no provider credentials, authentication claim or model request. */
export async function testClaudeProgram(input: { profile: LaunchProfile; cwd: string; privateHome: string; signal: AbortSignal }): Promise<NonNullable<LaunchProfile['verified']>> {
  const { profile } = input
  if (profile.protocol !== 'claude-cli' || profile.args.length || profile.codexHome || profile.localConfigId) throw new Error('Claude程序配置不符合受管参数和明确API来源要求')
  const program = await verifyClaudeProgram({ executable: profile.executable, cwd: input.cwd, configDirectory: input.privateHome, signal: input.signal, native: true })
  if (program.executableHash !== profile.executableHash || program.executable !== profile.executable || program.runtime !== profile.runtime) throw new Error('Claude程序已变化，请重新核对')
  return { name: 'Claude', version: program.version, protocolVersion: 1, checkedAt: new Date().toISOString() }
}

export interface ClaudePhaseInput {
  program: ClaudeProgram; cwd: string; configDirectory: string; baseUrl: string; apiKey: string; model: string
  instructions: string; prompt: string; images?: string[]; signal: AbortSignal; timeoutMs: number
  sessionId?: string; ephemeral?: boolean; onSession?(sessionId: string): Promise<void> | void
  onDelta?(text: string): Promise<void> | void
  onUsage?(usage: ModelUsage): Promise<void> | void
  onDiagnostic?(value: ClaudePhaseDiagnostic): Promise<void> | void
  tools?: NativeTool[]; onStop?(): void
  outputSchema?: Record<string, unknown>; effort?: 'low'; thinking?: 'disabled'
}

export function runClaudeNoTools(input: Omit<ClaudePhaseInput, 'tools' | 'onStop'>) {
  return runClaudePhase({ ...input, tools: undefined })
}

export async function runClaudePhase(input: ClaudePhaseInput) {
  input.signal.throwIfAborted()
  if (input.program.version !== CLAUDE_VERIFIED_VERSION) throw new Error('Claude程序版本尚未验证')
  if (input.sessionId && (!uuid(input.sessionId) || input.ephemeral)) throw new Error('Claude会话续用参数无效')
  if (input.outputSchema && (!input.ephemeral || input.tools?.length || input.sessionId)) throw new Error('Claude结构化输出仅用于独立无业务工具阶段')
  if (input.effort !== undefined && (input.effort !== 'low' || !input.outputSchema && !(input.ephemeral && input.tools?.length))) throw new Error('Claude低档配置仅支持私有结果或独立宿主工具阶段')
  if (input.thinking !== undefined && (input.thinking !== 'disabled' || !input.outputSchema || input.effort || input.images?.length || input.model !== 'deepseek-v4-pro')) throw new Error('Claude显式关闭仅支持已验证模型的私有无媒体结果阶段')
  const prepared = claudeInput(input.prompt, input.images)
  const file = inspectProgram(input.program.executable, CLAUDE_PROGRAM_LIMIT)
  if (file.path !== input.program.executable || file.hash !== input.program.executableHash || file.runtime !== input.program.runtime) throw new Error('Claude程序已变化，请重新验证')
  let env = claudeProviderEnvironment(input)
  await directories(input.cwd, input.configDirectory)
  const controller = new AbortController(), signal = AbortSignal.any([input.signal, controller.signal])
  let bridge: Awaited<ReturnType<typeof createClaudeToolBridge>> | undefined
  let thinkingBridge: Awaited<ReturnType<typeof createClaudeThinkingBridge>> | undefined
  let sessionId: string | undefined, result: { text: string; usage?: ModelUsage } | undefined, assistantSeen = false
  let formatted: { id: string; value: RecordValue; confirmed: boolean } | undefined
  const formatIds = new Set<string>()
  const meter = new ClaudeUsage()
  let formatReminders = 0, formatRejections = 0
  const startedAt = Date.now(), eventCounts: Record<string, number> = {}
  const contentBlockStartCounts = { text: 0, thinking: 0, tool_use: 0, server_tool_use: 0, other: 0 }
  const contentBlockDeltaCounts = { text_delta: 0, thinking_delta: 0, input_json_delta: 0, other: 0 }
  let stage: ClaudePhaseDiagnostic['stage'] = 'prepare', outcome: ClaudePhaseDiagnostic['outcome'] = 'failed'
  let lastEvent: ClaudePhaseDiagnostic['lastEvent'], transport: ClaudeProcessReceipt | undefined
  let errorResultState: ClaudeToolCallState | undefined
  let apiRejection: ClaudePhaseDiagnostic['apiRejection']
  const toolNames = () => input.outputSchema ? ['StructuredOutput'] : bridge?.toolNames ?? []
  const accept = async (line: string) => {
    signal.throwIfAborted()
    let message: RecordValue
    try { message = object(JSON.parse(line)) } catch { throw new Error('Claude返回无效JSON事件') }
    const rawType = message.type === 'system' && message.subtype === 'init' ? 'init' : message.type === 'stream_event' ? (message.event as RecordValue | undefined)?.type : message.type
    const type = typeof rawType === 'string' && diagnosticEvents.has(rawType) ? rawType : 'other'
    eventCounts[type] = (eventCounts[type] ?? 0) + 1
    lastEvent = { type, afterMs: Date.now() - startedAt }
    if (result) throw new Error('Claude终态后仍返回事件，原请求需要核对')
    if (message.type === 'system' && message.subtype === 'init') {
      if (sessionId || !uuid(message.session_id) || (input.sessionId && input.sessionId !== message.session_id) ||
        message.claude_code_version !== CLAUDE_VERIFIED_VERSION || message.model !== input.model ||
        message.apiKeySource !== 'ANTHROPIC_API_KEY' || message.permissionMode !== 'dontAsk' ||
        ![message.skills, message.plugins, message.slash_commands].every(empty) ||
        !Array.isArray(message.tools) || message.tools.length !== toolNames().length || new Set(message.tools).size !== message.tools.length ||
        message.tools.some(name => typeof name !== 'string' || !toolNames().includes(name)) ||
        (bridge ? !Array.isArray(message.mcp_servers) || message.mcp_servers.length !== 1 || object(message.mcp_servers[0]).name !== 'boai' || object(message.mcp_servers[0]).status !== 'connected' : !empty(message.mcp_servers))) {
        throw new Error('Claude未满足当前无工具或会话隔离策略')
      }
      sessionId = message.session_id as string
      await input.onSession?.(sessionId)
      stage = 'event_wait'
      return
    }
    if (!sessionId || message.session_id !== sessionId) throw new Error('Claude事件缺少当前会话身份')
    if (message.type === 'system' && message.subtype === 'api_retry' && (message.error_status === 401 || message.error_status === 403)) {
      apiRejection = { status: message.error_status }
      throw new Error(message.error_status === 401 ? 'Claude模型来源认证失败（401），请核对API凭据' : 'Claude模型来源拒绝访问（403），请核对API凭据和模型权限')
    }
    if (message.type === 'stream_event') {
      if (message.parent_tool_use_id != null) throw new Error('Claude无工具阶段出现子任务')
      const event = object(message.event)
      const partial = meter.update(event)
      if (partial) await input.onUsage?.(partial)
      if (event.type === 'content_block_start') {
        const block = object(event.content_block)
        const type = block.type === 'text' ? 'text' : block.type === 'thinking' ? 'thinking' : block.type === 'tool_use' ? 'tool_use' : block.type === 'server_tool_use' ? 'server_tool_use' : 'other'
        contentBlockStartCounts[type] = Math.min(Number.MAX_SAFE_INTEGER, contentBlockStartCounts[type] + 1)
        if (['tool_use', 'server_tool_use'].includes(String(block.type)) && (block.type !== 'tool_use' || !toolNames().includes(String(block.name)))) throw new Error('Claude返回未授权的工具请求')
      }
      if (event.type === 'content_block_delta') {
        const delta = object(event.delta)
        const type = delta.type === 'text_delta' ? 'text_delta' : delta.type === 'thinking_delta' ? 'thinking_delta' : delta.type === 'input_json_delta' ? 'input_json_delta' : 'other'
        contentBlockDeltaCounts[type] = Math.min(Number.MAX_SAFE_INTEGER, contentBlockDeltaCounts[type] + 1)
        if (!input.outputSchema && delta.type === 'text_delta' && typeof delta.text === 'string') await input.onDelta?.(delta.text)
      }
    } else if (message.type === 'assistant') {
      const content = object(message.message).content
      if (message.parent_tool_use_id != null || !Array.isArray(content)) throw new Error('Claude返回子任务或无效回复')
      for (const item of content) {
        const block = object(item)
        if (block.type === 'tool_use') {
          if (input.outputSchema && block.name === 'StructuredOutput') {
            if (formatted || typeof block.id !== 'string' || !block.id || formatIds.has(block.id)) throw new Error('Claude结构化结果缺少唯一调用身份')
            if (formatIds.size + formatReminders >= CLAUDE_STRUCTURED_MAX_TURNS) throw new Error('Claude结构化纠正超出当前轮次上限')
            formatIds.add(block.id)
            formatted = { id: block.id, value: object(block.input), confirmed: false }
          } else {
            if (!bridge) throw new Error('Claude无工具阶段返回工具请求')
            bridge.announce(block.id, block.name, block.input)
          }
        } else if (block.type === 'server_tool_use') throw new Error('Claude返回未授权的服务端工具')
      }
      assistantSeen = true
    } else if (message.type === 'user' && (bridge || input.outputSchema)) {
      const user = object(message.message), content = user.content
      if (!Array.isArray(content) || !content.length) throw new Error('Claude缺少宿主工具结果')
      if (input.outputSchema && content.length === 1 && object(content[0]).type === 'text') {
        if (message.isSynthetic !== true || message.parent_tool_use_id !== null || user.role !== 'user' ||
          object(content[0]).text !== CLAUDE_STRUCTURED_REMINDER || !assistantSeen || formatted ||
          ++formatReminders + formatIds.size >= CLAUDE_STRUCTURED_MAX_TURNS) throw new Error('Claude结构化内部提醒不符合已验证协议')
        // The CLI requests its own formatter within this private phase; this is neither a user message nor a receipt.
        return
      }
      for (const item of content) {
        const block = object(item)
        if (block.type !== 'tool_result') throw new Error(input.outputSchema ? `Claude结构化阶段返回未支持的${block.type === 'text' ? '文本' : '非工具结果'}事件` : 'Claude宿主工具结果事件不符')
        if (input.outputSchema) {
          if (!formatted || formatted.id !== block.tool_use_id || formatted.confirmed) throw new Error('Claude结构化完成回执身份不符')
          if (block.is_error !== undefined && typeof block.is_error !== 'boolean') throw new Error('Claude结构化完成回执错误标记无效')
          if (block.is_error === true) {
            // Only the effect-free private formatter can repair within this same CLI request.
            // Its rejected value is discarded; a later unique call and matching receipt are still required.
            formatted = undefined
            formatRejections++
            if (formatIds.size + formatReminders >= CLAUDE_STRUCTURED_MAX_TURNS) throw new Error('Claude结构化格式器拒绝结果且已达当前轮次上限')
            continue
          }
          formatted.confirmed = true
        } else {
          if (block.is_error === true) {
            errorResultState = bridge!.callState(block.tool_use_id)
            throw new Error('Claude宿主工具结果未确认成功')
          }
          bridge!.assertResult(block.tool_use_id)
        }
      }
    } else if (['tool_progress', 'tool_use_summary'].includes(String(message.type)) && (bridge || input.outputSchema)) {
      // Progress is not a completion receipt and does not publish a product result.
    } else if (message.type === 'result') {
      if (message.subtype !== 'success' || message.is_error !== false || message.terminal_reason !== 'completed' ||
        !assistantSeen || !empty(message.permission_denials) || typeof message.result !== 'string') throw new Error('Claude未确认成功终态，原请求需要核对')
      if (input.outputSchema && (!formatted?.confirmed || !isDeepStrictEqual(formatted.value, message.structured_output))) throw new Error('Claude结构化结果缺少一致的完成回执')
      result = { text: input.outputSchema ? JSON.stringify(message.structured_output) : message.result, usage: meter.finish(message.usage) }
      bridge?.assertComplete()
      stage = 'result_received'
    } else if (message.type !== 'system') throw new Error('Claude无工具阶段返回未支持的事件')
  }
  try {
    if (input.thinking === 'disabled') {
      thinkingBridge = await createClaudeThinkingBridge({ ...input, signal, onFailure: error => controller.abort(error) })
      env = claudeProviderEnvironment({ ...input, ...thinkingBridge })
    }
    if (input.tools?.length) bridge = await createClaudeToolBridge({ configDirectory: input.configDirectory, tools: input.tools, signal, onFailure: error => controller.abort(error) })
    stage = 'init_wait'
    await runClaudeProcess({ executable: file.path, runtime: file.runtime, cwd: input.cwd, env, signal,
      timeoutMs: input.timeoutMs, stdin: prepared.stdin,
      args: [...claudeNoToolsArgs, '--input-format', prepared.format, '--mcp-config', bridge?.configPath ?? '{"mcpServers":{}}',
        ...(input.outputSchema ? ['--json-schema', JSON.stringify(input.outputSchema), '--max-turns', String(CLAUDE_STRUCTURED_MAX_TURNS)] : []),
        ...(input.effort ? ['--effort', input.effort] : []),
        ...(input.thinking === 'disabled' ? ['--settings', '{"alwaysThinkingEnabled":false}'] : []),
        ...(bridge ? ['--allowedTools', ...bridge.toolNames] : []), '--model', input.model, '--system-prompt', input.outputSchema ? `${input.instructions}\n\n${CLAUDE_STRUCTURED_INSTRUCTIONS}` : input.instructions,
        ...(input.sessionId ? ['--resume', input.sessionId] : []), ...(input.ephemeral ? ['--no-session-persistence'] : [])], onLine: accept, onReceipt: value => { transport = value } })
    if (!sessionId || !result) throw new Error('Claude未返回完整终态，原请求需要核对')
    stage = 'returned'; outcome = 'completed'
    return { sessionId, ...result, ...(input.outputSchema ? { protocolCounts: { formatterCalls: formatIds.size, formatterRejections: formatRejections, formatReminders } } : {}) }
  } finally {
    try {
      controller.abort(new Error('Claude阶段已退出'))
      try { input.onStop?.() } finally { try { await bridge?.close() } finally { await thinkingBridge?.close() } }
    } catch (error) { stage = 'cleanup'; outcome = 'failed'; throw error }
    finally {
      try { await input.onDiagnostic?.({ outcome: input.signal.aborted ? 'cancelled' : outcome, stage, eventCounts, contentBlockStartCounts, contentBlockDeltaCounts, ...(lastEvent ? { lastEvent } : {}), ...(transport ? { transport } : {}),
        ...(apiRejection ? { apiRejection } : {}),
        ...(bridge ? { toolBridge: { ...bridge.diagnostic(), ...(errorResultState ? { errorResultState } : {}) } } : {}),
        ...(input.outputSchema ? { protocolCounts: { formatterCalls: formatIds.size, formatterRejections: formatRejections, formatReminders } } : {}) }) } catch { /* Diagnostics must not change or replay a business phase. */ }
    }
  }
}
