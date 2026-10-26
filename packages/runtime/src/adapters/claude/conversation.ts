/*
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 首条消息前核对实际permission rules及managed-only来源；原始设置包含已失效ask不再被接受。
 * [OUTPUT]: 已装配的request_directory可进入受核验产品桥，目录决定仍归宿主原审批；避免只读申请被通用原生批准先拒绝。
 * [OUTPUT]: 已核验Claude直接文件操作走员工目录批准；发送消息前核对原生有效ask规则，控制请求失败不重试。
 * [OUTPUT]: 显式业务cwd只核对原目录，不因进程准备而创建或授予写入。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: 整体执行权限派生Claude真实permission-mode及跳过审批参数；只读拒绝原生提权，不影响普通用户问题。
 * [OUTPUT]: 原生配置模式在本次子进程合并loopback代理排除，保持原生来源/远端代理；取消不能留下代理持有的本机请求。
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 实际返回的thinking块及增量独立进入执行流；签名/redacted字段不持久化，不混入最终答复。
 * [OUTPUT]: CLI先返回真实错误result再非零退出时保留原错误，不被通用进程异常覆盖。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 2026-10-12保留公开初始化目录和原生/API模型身份，容量匹配原生条目且带来源；账号/私有字段排除，回应写入独立记账。
 * [OUTPUT]: 工具结果同时核对原生双错误标记，保留原始结果与真实文件活动；不从create猜测新增。
 * [INPUT]: Rovai claude.rs/claude_control.rs @ f9acc239 (MIT)、已核对程序和持续员工session。
 * [OUTPUT]: stream-json双向控制、原生登录/工具/插件、公开过程和完整工具参数结果；用户批准精确回传。
 * [POS]: Claude生产会话驱动；不采用旧私有阶段或空工具策略，许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { workingDirectoryTarget } from '../../modules/workspaces/working-directory'
import { assertClaudeNativeSource } from './native-source'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { EngineContext } from '../../contracts'
import type { NativeConversationInput } from '../native-conversation'
import { nativeActivity, recordValue } from '../native-events'
import { inspectProgram } from '../../modules/backends/program'
import { CLAUDE_PROGRAM_LIMIT } from './policy'
import { claudeProvider } from './provider'
import { assertClaudeGatewayVersion } from '@boai/shared/domain/claude-provider'
import { claudeGatewayEnvironment, claudeLoopbackEnvironment } from './gateway-source'
import { runClaudeProcess } from './process'
import { createClaudeToolBridge } from './tools'
import { executionPermissionNativeOptions } from '@boai/shared/domain/execution'
import { claudeInput } from './input'
import type { NativeAgentInfo } from '@boai/shared/domain/execution'

/** Keep public directory fields only; account, PID and private extension data never reach BOAI. */
export function claudePublicInfo(input: unknown): NativeAgentInfo {
  const frame = recordValue(input), result: NativeAgentInfo = {}
  const strings = (values: unknown) => Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : undefined
  const entries = (values: unknown, key: 'value' | 'name', fields: string[]) => Array.isArray(values) ? values.flatMap(raw => {
    const value = typeof raw === 'string' ? { [key]: raw } : recordValue(raw)
    if (typeof value[key] !== 'string') return []
    return [Object.fromEntries([key, ...fields].filter(field => typeof value[field] === 'string').map(field => [field, value[field]]))]
  }) : undefined
  if (Array.isArray(frame.models)) result.models = frame.models.flatMap(raw => {
    const value = recordValue(raw); if (typeof value.value !== 'string') return []
    return [{ value: value.value, ...(typeof value.displayName === 'string' ? { displayName: value.displayName } : {}), ...(typeof value.description === 'string' ? { description: value.description } : {}), ...(typeof value.supportsEffort === 'boolean' ? { supportsEffort: value.supportsEffort } : {}), ...(strings(value.supportedEffortLevels) ? { supportedEffortLevels: strings(value.supportedEffortLevels) } : {}) }]
  })
  if (Array.isArray(frame.commands)) result.commands = entries(frame.commands, 'name', ['description', 'argumentHint']) as NativeAgentInfo['commands']
  if (Array.isArray(frame.agents)) result.agents = entries(frame.agents, 'name', ['description', 'model']) as NativeAgentInfo['agents']
  if (Array.isArray(frame.tools)) result.tools = strings(frame.tools)
  if (Array.isArray(frame.mcp_servers)) result.mcpServers = entries(frame.mcp_servers, 'name', ['status']) as NativeAgentInfo['mcpServers']
  return result
}

export async function runClaudeConversation(context: EngineContext, input: NativeConversationInput) {
  const profile = context.runtimeProfile, directory = context.runtimeDirectory
  if (!profile?.verified || !directory) throw new Error('请先测试本机 Claude 连接')
  const program = inspectProgram(profile.executable, CLAUDE_PROGRAM_LIMIT)
  if (program.hash !== profile.executableHash || program.path !== profile.executable) throw new Error('Claude 程序已变化，请重新测试连接')
  const provider = !profile.useExistingLogin ? context.connection && context.apiKey ? claudeProvider(context.connection, context.agent.modelId) : undefined : undefined
  if (!profile.useExistingLogin && !provider) throw new Error('Claude 显式 API 连接缺少凭据')
  const managedGateway = !profile.useExistingLogin && !!context.connection?.gateway
  if (managedGateway) assertClaudeGatewayVersion(context.connection, profile.verified.version)
  const selectedModel = provider?.model || context.agent.modelId
  const controller = new AbortController(), signal = AbortSignal.any([context.signal, controller.signal])
  if (context.workingDirectory) await workingDirectoryTarget(directory.cwd); else await mkdir(directory.cwd, { recursive: true }); await mkdir(directory.privateHome, { recursive: true, mode: 0o700 })
  const bootstrap = join(directory.privateHome, `bootstrap-${randomUUID()}.txt`)
  await writeFile(bootstrap, input.instructions, { flag: 'wx', mode: 0o600 })
  const bridge = await createClaudeToolBridge({ native: true, configDirectory: directory.privateHome, tools: input.tools, signal, onFailure: error => controller.abort(error) })
  const sessionId = input.threadId ?? randomUUID(), initializeId = randomUUID()
  let env: NodeJS.ProcessEnv = { ...(profile.useExistingLogin ? claudeLoopbackEnvironment(process.env) : process.env), CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' }
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT
  if (!profile.useExistingLogin) {
    Object.assign(env, { ANTHROPIC_API_KEY: context.apiKey, ANTHROPIC_AUTH_TOKEN: context.apiKey, ANTHROPIC_BASE_URL: provider!.baseUrl })
    if (managedGateway) env = claudeGatewayEnvironment(context.connection!, selectedModel, context.apiKey, env, context.agent.nativeOptions?.effort)
  }
  const mode = executionPermissionNativeOptions('claude-local', context.agent.nativeOptions, context.agent.executionPermission)?.claudePermissionMode
  const args = ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--permission-prompt-tool', 'stdio', '--verbose', '--include-partial-messages',
    input.threadId ? '--resume' : '--session-id', sessionId, '--append-system-prompt-file', bootstrap, '--mcp-config', bridge.configPath]
  if (mode) args.push('--permission-mode', mode)
  if (selectedModel) args.push('--model', selectedModel)
  if (context.agent.nativeOptions?.effort) args.push('--effort', context.agent.nativeOptions.effort)
  if (mode === 'bypassPermissions') args.push('--dangerously-skip-permissions')
  const prepared = claudeInput(input.prompt, input.images)
  const prompt = prepared.format === 'stream-json' ? { ...JSON.parse(prepared.stdin), session_id: sessionId } : { type: 'user', session_id: sessionId, parent_tool_use_id: null, message: { role: 'user', content: input.prompt } }
  let write!: (line: string) => void, end!: () => void, initialized = false, hasResult = false, state: string | undefined, finalText = '', resultError: string | undefined
  const messageIds = new Map<string, string>()
  const blocks = new Map<string, Record<string, any>>(), tools = new Map<string, Record<string, any>>(), tasks = new Set<string>()
  const controls = new Map<string, AbortController>(), pending = new Set<Promise<void>>()
  let submission: Promise<void> | undefined
  const emit = context.onExecutionEvent ?? (async () => {})
  let endedAt = 0, resultWaitAt = 0, turnInProgress = false
  let inputAccepted = false, contextModel: string | undefined, nativeModel: string | undefined
  let nativeInfo: NativeAgentInfo = {}
  const initializedAt = Date.now()
  // Port of Rovai ClaudeControl's initialization/end fences, not a task deadline.
  const watchdog = setInterval(() => {
    const elapsed = Date.now()
    if (!initialized && elapsed - initializedAt > 60000) controller.abort(new Error('Claude 控制协议初始化超时'))
    if (resultWaitAt && elapsed - resultWaitAt > (state === undefined ? 10000 : 600000)) controller.abort(new Error('Claude 已返回结果，但没有确认会话空闲；原请求需要核对'))
    if (endedAt && elapsed - endedAt > 10000) controller.abort(new Error('Claude 关闭输入后未退出'))
  }, 1000)
  watchdog.unref()
  const maybeEnd = () => {
    if (hasResult && !turnInProgress && !tasks.size && !pending.size) {
      resultWaitAt ||= Date.now()
      if (state === 'idle' && !endedAt) { endedAt = Date.now(); end() }
    } else resultWaitAt = 0
  }
  const block = async (id: string, value: Record<string, any>, parent?: string) => {
    if (value.type === 'text') await emit({ id, parentId: parent, eventType: 'agent.text.block', payload: { itemId: id, text: value.text ?? '' } })
    else if (value.type === 'thinking') await emit({ id, parentId: parent, eventType: 'agent.reasoning.block', payload: { text: value.thinking ?? '' } })
    else if (value.type === 'tool_use' || value.type === 'server_tool_use') {
      tools.set(value.id, value)
      await emit(nativeActivity(value.id, { ...value, arguments: value.input }, false, parent))
      if (String(value.name).startsWith('mcp__boai__')) bridge.announce(value.id, value.name, value.input)
    }
  }
  let cli: import('@boai/shared/cli/run-access').RunCliEnvironmentLease | undefined
  try {
    cli = await context.acquireCliEnvironment?.()
    await input.onSession(sessionId); await context.onNativeExecution?.({ sessionId, ...(selectedModel ? { selectedModelId: selectedModel } : {}), ...(managedGateway ? { modelSource: { mode: 'boai-connection' as const, connectionId: context.connection!.id, connectionRevision: context.connection!.revision ?? 1, protocol: 'messages' as const, selectedModelId: selectedModel } } : {}) })
    await runClaudeProcess({ executable: profile.executable, runtime: profile.runtime, args, env, cliEnvironment: cli?.env, cwd: directory.cwd, privateHome: directory.privateHome, signal, native: true,
      onReady: (send, finish) => { write = send; end = finish; write(JSON.stringify({ type: 'control_request', request_id: initializeId, request: { subtype: 'initialize' } }) + '\n') },
      onLine: async line => {
        const frame = recordValue(JSON.parse(line))
        if (frame.type !== 'control_response') await submission
        if (frame.session_id && frame.session_id !== sessionId) throw new Error('Claude 事件不属于当前原生会话')
        if (initialized && !inputAccepted && ['stream_event', 'assistant', 'result'].includes(frame.type)) {
          inputAccepted = true; await context.onNativeExecution?.({ sessionId, inputAccepted: true })
        }
        if (frame.type === 'control_response') {
          if (frame.response?.request_id !== initializeId || initialized || frame.response?.subtype !== 'success') throw new Error('Claude 控制协议初始化失败')
          initialized = true; state = undefined
          nativeInfo = { ...nativeInfo, ...claudePublicInfo(frame.response.response) }
          if (Object.keys(nativeInfo).length) await context.onNativeExecution?.({ nativeInfo })
          // Control replies use this same serial reader. Awaiting a new control
          // request here would prevent its response from ever being processed.
          const preparation = (async () => {
            signal.throwIfAborted(); await assertClaudeNativeSource(context)
            write(JSON.stringify(prompt) + '\n'); submission = input.onSubmitted(sessionId, context.runId); await submission
          })()
          pending.add(preparation)
          void preparation.catch(error => controller.abort(error)).finally(() => { pending.delete(preparation); maybeEnd() })
          return
        }
        if (frame.type === 'control_cancel_request') { controls.get(frame.request_id)?.abort(new Error('Claude 已撤回此请求')); return }
        if (frame.type === 'control_request') {
          const request = recordValue(frame.request), id = frame.request_id, local = new AbortController()
          if (!initialized || typeof id !== 'string' || !id || request.subtype !== 'can_use_tool' || !request.tool_use_id || !request.tool_name || controls.has(id)) throw new Error('Claude 原生交互缺少有效身份')
          controls.set(id, local)
          const operation = (async () => {
            const input = recordValue(request.input), asking = request.tool_name === 'AskUserQuestion'
            if (!asking && context.agent.executionPermission === 'read-only') {
              write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: id, response: { behavior: 'deny', message: '当前员工为只读权限，不能执行此操作。' } } }) + '\n')
              return
            }
            if (!context.requestNativeAction) throw new Error('原生批准交互未接入')
            const response = await context.requestNativeAction({ id, method: request.tool_name, kind: asking ? 'input' : 'approval', title: asking ? '需要你的回复' : String(input.command ?? request.description ?? request.tool_name), detail: request,
              options: asking ? [] : [{ id: 'allow', label: '允许一次' }, ...(Array.isArray(request.permission_suggestions) && request.permission_suggestions.length ? [{ id: 'session', label: '按所示规则允许' }] : []), { id: 'deny', label: '拒绝' }],
              ...(asking ? { questions: (input.questions ?? []).map((q: Record<string, any>) => ({ ...q, id: q.question })) } : {}) }, AbortSignal.any([signal, local.signal]))
            if (signal.aborted || local.signal.aborted) return
            const decision = asking ? { behavior: 'allow', updatedInput: { ...input, answers: Object.fromEntries(Object.entries(response.answers ?? {}).map(([key, answer]) => [key, answer.join(', ')])) } } : response.option === 'allow' || response.option === 'session'
              ? { behavior: 'allow', updatedInput: input, ...(response.option === 'session' ? { updatedPermissions: request.permission_suggestions } : {}) }
              : { behavior: 'deny', message: '用户拒绝此操作。请尊重该决定。' }
            write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: id, response: decision } }) + '\n')
            await context.onNativeActionSubmitted?.(id)
          })()
          pending.add(operation); void operation.catch(error => { if (!local.signal.aborted) controller.abort(error) }).finally(() => { pending.delete(operation); controls.delete(id); maybeEnd() }); return
        }
        if (frame.type === 'stream_event') {
          const event = recordValue(frame.event), parentId = frame.parent_tool_use_id ?? undefined, stream = parentId ?? 'main'
          if (event.type === 'message_start' && !parentId) {
            contextModel = event.message?.model
            await context.onNativeExecution?.({ ...(contextModel ? { reportedModelId: contextModel, ...(!nativeModel ? { modelId: contextModel, modelIdSource: 'api-event' as const } : {}) } : {}) })
          }
          if (event.type === 'message_start') { messageIds.set(stream, String(event.message?.id ?? frame.uuid)); if (!parentId) turnInProgress = true }
          const messageId = messageIds.get(stream) ?? String(frame.uuid)
          const id = `text:${messageId}:${event.index}`
          if (event.type === 'content_block_start') { blocks.set(id, recordValue(event.content_block)); if (['text', 'thinking'].includes(event.content_block?.type)) await block(id, event.content_block, parentId) }
          if (event.type === 'content_block_delta') {
            const value = blocks.get(id)
            if (event.delta?.type === 'text_delta') {
              if (value) value.text = String(value.text ?? '') + String(event.delta.text)
              await emit({ id, parentId, eventType: 'agent.text.block', payload: { itemId: id, text: '' }, appendText: String(event.delta.text) })
            }
            if (value && event.delta?.type === 'thinking_delta') {
              value.thinking = String(value.thinking ?? '') + String(event.delta.thinking ?? '')
              await emit({ id, parentId, eventType: 'agent.reasoning.block', payload: { text: '' }, appendText: String(event.delta.thinking ?? '') })
            }
            if (value && event.delta?.type === 'input_json_delta') value.json = (value.json ?? '') + event.delta.partial_json
          }
          if (event.type === 'content_block_stop') {
            const value = blocks.get(id)
            if (value?.type === 'tool_use') { if (value.json) value.input = JSON.parse(value.json); await block(id, value, parentId) }
          }
        } else if (frame.type === 'assistant') {
          if (!frame.parent_tool_use_id) turnInProgress = true
          const message = recordValue(frame.message)
          const matched = new Set<string>()
          for (const [index, value] of (message.content ?? []).entries()) {
            // Complete messages can omit thinking blocks, changing array indices.
            const prefix = `text:${message.id ?? frame.uuid}:`
            const streamed = ['text', 'thinking'].includes(value.type) ? [...blocks].find(([id, prior]) => id.startsWith(prefix) && !matched.has(id) && prior.type === value.type && (value.type === 'text' ? prior.text === value.text : prior.thinking === value.thinking))?.[0] : undefined
            const id = streamed ?? `${prefix}${index}`; matched.add(id)
            await block(id, value, frame.parent_tool_use_id ?? undefined)
          }
        } else if (frame.type === 'user') {
          for (const value of frame.message?.content ?? []) if (value.type === 'tool_result') {
            const original = tools.get(value.tool_use_id) ?? { name: 'tool', type: 'tool_use' }
            // Match Rovai: only absent/false error flags prove a successful file operation.
            const isError = [value.is_error, frame.tool_use_result?.is_error].some(flag => flag !== undefined && flag !== false)
            await emit(nativeActivity(value.tool_use_id, { ...original, result: value.content, toolUseResult: frame.tool_use_result, isError, status: isError ? 'failed' : 'completed' }, true, frame.parent_tool_use_id ?? undefined))
          }
        } else if (frame.type === 'result') {
          hasResult = true; turnInProgress = false; finalText = typeof frame.result === 'string' ? frame.result : ''
          if (frame.is_error || frame.subtype !== 'success') resultError = (frame.errors ?? [frame.result ?? frame.subtype]).join('\n')
          const models = recordValue(frame.modelUsage), matched = nativeModel ?? (contextModel && Object.keys(models).length === 1 && Object.hasOwn(models, contextModel) ? contextModel : undefined)
          const window = matched ? recordValue(models[matched]).contextWindow : undefined
          await context.onNativeExecution?.({ ...(typeof window === 'number' && Number.isSafeInteger(window) && window > 0 ? { contextWindowTokens: window, contextWindowSource: { modelId: matched!, event: 'result.modelUsage' as const, sessionId, runId: context.runId } } : { contextWindowTokens: undefined, contextWindowSource: undefined }) })
        } else if (frame.type === 'system') {
          if (frame.subtype === 'init') {
            const publicInfo = claudePublicInfo(frame)
            if (publicInfo.agents) publicInfo.agents = publicInfo.agents.map(agent => ({ ...nativeInfo.agents?.find(previous => previous.name === agent.name), ...agent }))
            nativeInfo = { ...nativeInfo, ...publicInfo }
            if (typeof frame.model === 'string' && frame.model) nativeModel = frame.model
            await context.onNativeExecution?.({ nativeInfo, ...(nativeModel ? { modelId: nativeModel, modelIdSource: 'native-init' as const } : {}) })
          }
          if (frame.subtype === 'session_state_changed') state = frame.state
          if (frame.subtype === 'task_started' && ['local_agent', 'local_workflow'].includes(frame.task_type)) tasks.add(frame.task_id)
          if (frame.subtype === 'task_notification' || frame.subtype === 'task_updated' && ['completed', 'failed', 'stopped', 'cancelled'].includes(frame.patch?.status)) tasks.delete(frame.task_id)
          if (frame.subtype !== 'init' && frame.subtype !== 'session_state_changed') await emit({ id: String(frame.uuid ?? randomUUID()), parentId: frame.parent_tool_use_id ?? undefined, eventType: 'runtime.native', payload: { method: frame.subtype, params: frame } })
        } else if (!['rate_limit_event', 'keep_alive'].includes(frame.type)) await emit({ id: String(frame.uuid ?? randomUUID()), parentId: frame.parent_tool_use_id ?? undefined, eventType: 'runtime.native', payload: { method: frame.type, params: frame } })
        maybeEnd()
      },
    })
    if (!hasResult) throw new Error('Claude 退出前未返回本轮结果')
    if (resultError) throw new Error(resultError)
    await context.onDelta(finalText); return { text: finalText }
  } catch (error) {
    // The CLI can return its actual error result and then exit nonzero. Preserve
    // that public result instead of replacing it with the generic process error.
    if (resultError) throw new Error(resultError, { cause: error })
    throw error
  } finally {
    cli?.release()
    clearInterval(watchdog)
    controller.abort(new Error('Claude 原生会话已退出'))
    await Promise.allSettled([...pending]); await bridge.close(); await unlink(bootstrap)
  }
}
