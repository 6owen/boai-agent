/*
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 原生命令additionalPermissions接组合目录审批；其余无法确认范围的提权继续拒绝。
 * [OUTPUT]: 用户所选业务cwd必须已存在，不由本机进程准备隐式创建。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: 目录策略接原生permissions请求/身份和turn范围；通用逃逸批准暂拒绝，完整能力仍受后端准入门禁。
 * [OUTPUT]: 整体执行权限同时派生原生sandbox/approvalPolicy，覆盖文件/命令/网络访问与审批。
 * [OUTPUT]: 首线程只接纳原生有效写权限产生的精确信任新增，并持久化核对后的来源指纹；其他配置漂移仍在提交前拒绝。
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: Codex公开思考摘要完成快照覆盖对应增量块；私有正文不进入执行流。
 * [OUTPUT]: 显式宿主媒体投影转换为当前app-server schema的inputImage，普通工具保持原文本，不变更原生循环。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 2026-10-12原生交互身份关联实际回应写入，材料路径沿原会话接收；不改变工具目录和所选权限。
 * [INPUT]: Rovai codex.rs @ f9acc239 (MIT)、原生会话、用户权限选择与追加的产品工具。
 * [OUTPUT]: 原生工具/配置的持续turn、完整公开事件、真实审批和用量；不改模型目录、不划分私有模型阶段。
 * [POS]: Codex员工生产会话驱动；协议移植来源许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { assertCodexNativeSource, prepareCodexNativeSource } from './native-source'
import { codexToolResult } from '../native-tool-result'
import { randomUUID } from 'node:crypto'
import type { EngineContext } from '../../contracts'
import type { NativeConversationInput } from '../native-conversation'
import { codexExecutionEvent, recordValue } from '../native-events'
import { CodexClient, object, string } from './client'
import { codexGatewaySource } from './gateway-source'
import { assertCodexGatewayVersion } from '../../../shared/domain/codex-provider'
import { executionPermissionNativeOptions } from '../../../shared/domain/execution'

/** Rovai's native approval decisions, including permission grants (not only shell). */
export function codexApprovalResult(method: string, params: Record<string, unknown>, option?: string) {
  const accepted = option === 'accept' || option === 'acceptForSession'
  if (method === 'item/permissions/requestApproval') return { permissions: accepted ? params.permissions ?? {} : {}, scope: option === 'acceptForSession' ? 'session' : 'turn', strictAutoReview: true }
  return { decision: ['accept', 'acceptForSession', 'decline', 'cancel'].includes(option ?? '') ? option : 'decline' }
}

export async function runCodexConversation(context: EngineContext, input: NativeConversationInput) {
  const controller = new AbortController()
  context = { ...context, signal: AbortSignal.any([context.signal, controller.signal]) }
  const { runtimeProfile: profile, runtimeDirectory: directory, signal } = context
  if (!profile?.verified || !directory) throw new Error('请先测试本机 Codex 连接')
  if (context.connection) assertCodexGatewayVersion(profile.verified.version)
  const gateway = context.connection ? codexGatewaySource(context.connection, context.agent.modelId, context.apiKey, process.env) : undefined
  let threadId = input.threadId ?? '', turnId = '', finalText = '', completedTurn: Record<string, unknown> | undefined
  let resolveDone!: () => void, rejectDone!: (error: Error) => void
  const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject }); void done.catch(() => {})
  let releaseReady!: () => void
  const ready = new Promise<void>(resolve => { releaseReady = resolve })
  const calls = new Map<string, { signature: string; result: Promise<unknown> }>()
  const children = new Map<string, { parentId: string; turnId?: string }>()
  const answeredActions = new WeakMap<object, string>()
  const complete = (turn: Record<string, unknown>) => {
    if (!turnId) { completedTurn = turn; return }
    if (turn.id !== turnId) return
    if (turn.status === 'completed') resolveDone()
    else rejectDone(new Error(String(recordValue(turn.error).message ?? `Codex 本轮${turn.status === 'interrupted' ? '已中断' : '失败'}`)))
  }
  await assertCodexNativeSource(context)
  const preparation = await prepareCodexNativeSource(context)
  let client: CodexClient | undefined
  let cli: import('../../../shared/cli/run-access').RunCliEnvironmentLease | undefined
  try {
  cli = await context.acquireCliEnvironment?.()
  const started = await CodexClient.start({ profile, ...directory, existingCwd: !!context.workingDirectory, signal, native: true, gatewaySource: gateway, cliEnvironment: cli?.env,
    onRequest: async (method, params) => {
      await ready; signal.throwIfAborted()
      const child = children.get(String(params.threadId))
      if (params.threadId && params.threadId !== threadId && !child || params.turnId && params.turnId !== (child?.turnId ?? turnId)) throw new Error('原生请求不属于当前会话轮次')
      if (method === 'item/tool/call') {
        const name = String(params.tool), id = string(params.callId, '工具身份')
        const tool = params.namespace === 'boai' && input.tools.find(tool => tool.name === name)
        if (!tool) throw new Error(`未知产品工具：${name}`)
        const signature = JSON.stringify([name, params.arguments]), previous = calls.get(id)
        if (previous) { if (signature !== previous.signature) throw new Error('同一工具身份的输入发生变化'); return previous.result }
        const result = Promise.resolve().then(async () => {
          try { return codexToolResult(tool, await tool.execute(params.arguments, id)) }
          catch (error) { signal.throwIfAborted(); return { contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : String(error) }], success: false } }
        })
        calls.set(id, { signature, result }); return result
      }
      if (!context.requestNativeAction) throw new Error('原生交互未接入')
      const id = `${turnId}:${String(params.itemId ?? params.callId ?? randomUUID())}:${method}`
      answeredActions.set(params, id)
      if (method === 'item/tool/requestUserInput') {
        const response = await context.requestNativeAction({ id, method, kind: 'input', title: '需要你的回复', detail: params,
          options: [], questions: Array.isArray(params.questions) ? params.questions as never : [] }, signal)
        return { answers: Object.fromEntries(Object.entries(response.answers ?? {}).map(([key, answers]) => [key, { answers }])) }
      }
      if (/requestApproval$/.test(method) || ['execCommandApproval', 'applyPatchApproval'].includes(method)) {
        if (context.agent.executionPermission === 'read-only') return codexApprovalResult(method, params, 'decline')
        const response = await context.requestNativeAction({ id, method, kind: 'approval', title: String(params.command ?? params.reason ?? '本机 Codex 请求批准'), detail: params,
          options: [{ id: 'accept', label: '允许一次' }, { id: 'acceptForSession', label: '本次会话允许' }, { id: 'decline', label: '拒绝' }, { id: 'cancel', label: '取消本轮' }] }, signal)
        return codexApprovalResult(method, params, response.option)
      }
      throw new Error(`当前版本未支持原生交互 ${method}，请求已保留且未自动批准`)
    },
    onResponseSent: async (_, params) => { const id = answeredActions.get(params); if (id) await context.onNativeActionSubmitted?.(id) },
    onNotification: async (method, params) => {
      const child = children.get(String(params.threadId))
      if (params.threadId && params.threadId !== threadId && !child) return
      if (child && method === 'turn/started') child.turnId = String(recordValue(params.turn).id)
      if (!child && params.turnId && turnId && params.turnId !== turnId) return
      const nativeItem = recordValue(params.item)
      if (nativeItem.type === 'collabAgentToolCall' && Array.isArray(nativeItem.receiverThreadIds)) {
        for (const id of nativeItem.receiverThreadIds) if (typeof id === 'string' && id !== threadId && !children.has(id)) children.set(id, { parentId: child ? `${params.threadId}:${nativeItem.id}` : String(nativeItem.id) })
      }
      if (method === 'item/completed' && nativeItem.type === 'reasoning' && Array.isArray(nativeItem.summary)) {
        for (const [index, text] of nativeItem.summary.entries()) if (typeof text === 'string') await context.onExecutionEvent?.({ id: `${child ? `${params.threadId}:` : ''}reasoning:${nativeItem.id}:${index}`, parentId: child?.parentId, eventType: 'agent.reasoning.block', payload: { text } })
      }
      const event = codexExecutionEvent(method, params)
      if (event && child) {
        event.id = `${params.threadId}:${event.id}`; event.parentId = child.parentId
        if (event.canonical) event.canonical.operationId = `${params.threadId}:${event.canonical.operationId}`
      }
      if (event) await context.onExecutionEvent?.(event)
      if (child) return
      if (method === 'item/completed') {
        const item = recordValue(params.item)
        if (item.type === 'agentMessage' && item.phase !== 'commentary' && typeof item.text === 'string') finalText = item.text
      }
      if (method === 'thread/tokenUsage/updated') {
        const tokens = recordValue(params.tokenUsage)
        if (typeof tokens.modelContextWindow === 'number') await context.onNativeExecution?.({ contextWindowTokens: tokens.modelContextWindow })
      }
      if (method === 'turn/completed') complete(object(params.turn))
    },
  })
  client = started.client
    const options = executionPermissionNativeOptions('codex-local', context.agent.nativeOptions, context.agent.executionPermission)
    const threadOptions = { cwd: directory.cwd, developerInstructions: input.instructions,
      ...(options?.codexApprovalPolicy ? { approvalPolicy: options.codexApprovalPolicy } : {}),
      ...(options?.codexSandbox ? { sandbox: options.codexSandbox } : {}),
      ...(gateway ? { model: gateway.model, modelProvider: gateway.providerId } : context.agent.modelId ? { model: context.agent.modelId } : {}),
      dynamicTools: [{ type: 'namespace', name: 'boai', description: 'Employee collaboration and publishing in BOAI', tools: input.tools.map(({ name, description, inputSchema }) => ({ type: 'function', name, description, inputSchema, deferLoading: false })) }],
    }
    const thread = await client.request(input.threadId ? 'thread/resume' : 'thread/start', { ...threadOptions, ...(input.threadId ? { threadId: input.threadId, excludeTurns: true } : {}) })
    threadId = string(object(thread.thread).id, '原生会话身份')
    if (input.threadId && input.threadId !== threadId) throw new Error('原生会话身份发生变化')
    if (gateway && (thread.modelProvider !== gateway.providerId || thread.model !== gateway.model)) throw new Error('Codex实际模型来源与所选网关不一致，未发送本轮消息')
    const sandbox = recordValue(thread.sandbox)
    const preparedSource = await preparation?.verify(!input.threadId && ['workspaceWrite', 'dangerFullAccess', 'externalSandbox'].includes(String(sandbox.type)))
    if (preparedSource) context = { ...context, nativeSourceFingerprint: preparedSource }
    await input.onSession(threadId, preparedSource)
    await context.onNativeExecution?.({ sessionId: threadId, ...(typeof thread.model === 'string' ? { modelId: thread.model } : {}), ...(gateway ? { selectedModelId: gateway.model, modelSource: { mode: 'boai-connection' as const, connectionId: context.connection!.id, connectionRevision: context.connection!.revision ?? 1, protocol: 'responses' as const, selectedModelId: gateway.model } } : {}) })
    await assertCodexNativeSource(context)
    const response = await client.request('turn/start', { threadId, clientUserMessageId: context.triggerMessageId || randomUUID(),
      input: [{ type: 'text', text: input.prompt, text_elements: [] }, ...input.images.map(url => ({ type: 'image', url }))],
      ...(options?.effort ? { effort: options.effort } : {}) })
    turnId = string(object(response.turn).id, '原生轮次身份')
    await input.onSubmitted(threadId, turnId); await context.onNativeExecution?.({ sessionId: threadId, turnId, inputAccepted: true }); releaseReady()
    if (completedTurn) complete(completedTurn)
    await client.wait(done); await client.drain(); signal.throwIfAborted()
    await context.onDelta(finalText)
    return { text: finalText }
  } finally {
    controller.abort(new Error('Codex 原生turn已退出')); releaseReady()
    preparation?.dispose()
    try { await client?.close() } finally { cli?.release() }
  }
}
