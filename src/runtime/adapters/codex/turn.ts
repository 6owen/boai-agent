/*
 * [OUTPUT]: 2026-10-10 精确thread/turn接公开summary与commentary，原始reasoning/text不保存；有界限频进度不替代终态。
 * [OUTPUT]: 2026-10-10 已验证配置可有界读取canonical model/list且零turn提交；实际模型/线程/提交回执可投影至员工执行记录。
 * [OUTPUT]: 仅当前已提交线程的固定WebSockets到HTTPS回退warning进入八条有界诊断；无turnId不推断旧轮归属，不记录原文或改变业务。
 * [OUTPUT]: 动态工具类型与Claude宿主桥共用NativeTool，Codex协议与调用方式保持。
 * [INPUT]: 已验证Codex启动项、宿主授权的文本/图片、会话引用和无工具阶段策略。
 * [OUTPUT]: 无工具阶段或明确宿主工具桥接、真实终态与累计用量；退出阻止迟到操作并等待工具终止，失败不重发。
 * [OUTPUT]: 阶段等待位置、外部错误码和有界协议计数独立观测；不保存提示/媒体/原始错误，不改变超时或重发策略。
 * [POS]: 原生Codex阶段执行；持久映射与业务权威归宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { LaunchProfile } from '../../../shared/domain/backends'
import { EXECUTION_PROGRESS_LIMITS, type ModelUsage, type ExecutionProgressEvent } from '../../../shared/domain'
import { CodexClient, object, string } from './client'
import { CODEX_MODEL_CATALOG_LIMITS, noToolsThread } from './policy'
import { prepareCodexCatalog } from './catalog'

export type { NativeTool as CodexDynamicTool } from '../native-task'
import type { NativeTool as CodexDynamicTool } from '../native-task'
interface CodexPhaseInput {
  profile: LaunchProfile
  cwd: string
  privateHome?: string
  signal: AbortSignal
  instructions: string
  prompt: string
  model?: string
  effort?: string
  threadId?: string
  ephemeral?: boolean
  outputSchema?: Record<string, unknown>
  images?: string[]
  timeoutMs?: number
  tools?: CodexDynamicTool[]
  onStop?(): void
  onUsage?(usage: ModelUsage): Promise<void>
  onSession?(threadId: string): Promise<void>
  onSubmitted?(threadId: string, turnId: string): Promise<void>
  onModelSelected?(model: string): Promise<void>
  onDelta?(text: string): Promise<void>
  onDiagnostic?(diagnostic: CodexPhaseDiagnostic): Promise<void>
  onProgress?(event: Pick<ExecutionProgressEvent, 'id' | 'kind' | 'text'>): Promise<void>
}

export interface CodexPhaseDiagnostic {
  outcome: 'completed' | 'failed' | 'cancelled'
  stage: string
  elapsedMs: number
  stages: { name: string; elapsedMs: number }[]
  threadId?: string
  turnId?: string
  externalErrors: { code: string; httpStatusCode?: number; willRetry: boolean; elapsedMs: number }[]
  transportEvents?: { type: 'websocket_to_https_fallback'; elapsedMs: number }[]
  protocol?: ReturnType<CodexClient['diagnostics']>
}
const errorCodes = new Set(['contextWindowExceeded', 'sessionBudgetExceeded', 'usageLimitExceeded', 'rateLimitExceeded', 'flexUnavailable', 'serverOverloaded',
  'cyberPolicy', 'misalignmentPolicyViolation', 'tooManyDenials', 'internalServerError', 'unauthorized', 'badRequest', 'threadRollbackFailed', 'sandboxError', 'other',
  'httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts', 'activeTurnNotSteerable'])

function errorCode(value: unknown): { code: string; httpStatusCode?: number } {
  if (typeof value === 'string') return { code: errorCodes.has(value) ? value : 'unknown' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { code: 'unknown' }
  const entry = Object.entries(value).find(([key]) => errorCodes.has(key))
  if (!entry) return { code: 'unknown' }
  const status = entry[1] && typeof entry[1] === 'object' && 'httpStatusCode' in entry[1] ? entry[1].httpStatusCode : undefined
  return { code: entry[0], ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatusCode: status } : {}) }
}

const textOnlyItems = new Set(['userMessage', 'agentMessage', 'reasoning', 'contextCompaction'])
const visibleStages: Record<string, string> = {
  bootstrap_start: '正在核对本机 Codex 配置', runtime_start: '正在启动本机 Codex',
  thread_start: '正在建立执行会话', thread_resume: '正在继续原会话',
  turn_start: '正在提交请求', turn_wait: 'Codex 已接收请求，正在处理',
  event_drain: '正在核对执行结果', completed: '本机执行已结束',
}

export async function testCodexConnection(input: Pick<CodexPhaseInput, 'profile' | 'cwd' | 'privateHome' | 'signal'>) {
  const { client, verified } = await CodexClient.start({ ...input, profile: { ...input.profile, verified: undefined } })
  try {
    const account = await client.request('account/read', { refreshToken: false })
    if (account.requiresOpenaiAuth && !account.account) throw new Error('Codex需要登录，请先在本机Codex完成登录')
    const read = await client.request('config/read', { includeLayers: false })
    await client.request('thread/start', { ...noToolsThread(input.cwd, object(read.config)), ephemeral: true, baseInstructions: 'Connection verification. No model invocation.' })
    await client.drain()
    return verified
  } finally { await client.close() }
}

export async function listCodexModels(input: Pick<CodexPhaseInput, 'profile' | 'cwd' | 'privateHome' | 'signal'>): Promise<string[]> {
  if (!input.profile.verified) throw new Error('请先测试当前 Codex 连接')
  const { client } = await CodexClient.start(input)
  try {
    const models = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < CODEX_MODEL_CATALOG_LIMITS.maxPages; page++) {
      const result = await client.request('model/list', { limit: CODEX_MODEL_CATALOG_LIMITS.pageSize, ...(cursor ? { cursor } : {}) })
      if (!Array.isArray(result.data) || result.data.length > CODEX_MODEL_CATALOG_LIMITS.pageSize) throw new Error('Codex 模型列表格式无效或超过单页上限')
      for (const entry of result.data) {
        const value = object(entry)
        const model = typeof value.model === 'string' ? value.model : value.id
        if (typeof model === 'string' && model.length && model.length <= 200) models.add(model)
      }
      if (!result.nextCursor) return [...models]
      const next = string(result.nextCursor, '模型目录游标')
      if (next === cursor) throw new Error('Codex 模型目录游标没有推进')
      cursor = next
    }
    throw new Error('Codex 模型目录超出读取上限')
  } finally { await client.close() }
}

export async function runCodexPhase(input: CodexPhaseInput) {
  if (!input.profile.verified) throw new Error('请先测试Codex连接')
  const startedAt = performance.now(), elapsed = () => Math.round(performance.now() - startedAt)
  const diagnostic: CodexPhaseDiagnostic = { outcome: 'failed', stage: 'bootstrap_start', elapsedMs: 0, stages: [], externalErrors: [] }
  const stage = async (name: string) => {
    diagnostic.stage = name; diagnostic.stages.push({ name, elapsedMs: elapsed() })
    if (visibleStages[name]) await input.onProgress?.({ id: `stage:${name}`, kind: 'stage', text: visibleStages[name] })
  }
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('Codex阶段超时，未确认请求不得自动重试')), input.timeoutMs ?? 120_000)
  timer.unref()
  const signal = AbortSignal.any([input.signal, timeout.signal])
  let threadId = input.threadId ?? '', turnId = '', text = '', finalText = '', usage: ModelUsage = {}
  let turnRequested = false, turnEnded = false
  const calls = new Map<string, { signature: string; promise: Promise<unknown> }>()
  const seenUsage = new Set<string>()
  const unknownUsage = new Set<string>()
  const progress = new Map<string, { kind: 'summary' | 'commentary'; text: string; emittedAt: number }>()
  const commentaryItems = new Set<string>()
  const publishProgress = async (id: string, kind: 'summary' | 'commentary', value: string, append = false, force = false) => {
    if (!progress.has(id) && progress.size >= EXECUTION_PROGRESS_LIMITS.events) return
    const previous = progress.get(id), text = ((append ? previous?.text ?? '' : '') + value).slice(0, EXECUTION_PROGRESS_LIMITS.text)
    const entry = { kind, text, emittedAt: previous?.emittedAt ?? 0 }; progress.set(id, entry)
    if (text.trim() && (force || performance.now() - entry.emittedAt >= 250)) {
      entry.emittedAt = performance.now(); await input.onProgress?.({ id, kind, text })
    }
  }
  let rejectCancelled!: (reason: unknown) => void
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject })
  void cancelled.catch(() => {})
  const cancelWait = () => rejectCancelled(signal.reason)
  signal.addEventListener('abort', cancelWait, { once: true })
  let resolveReady!: () => void
  const ready = new Promise<void>(resolve => { resolveReady = resolve })
  let pendingCompletion: Record<string, unknown> | undefined
  let resolveCompleted!: () => void
  let rejectCompleted!: (error: Error) => void
  const completed = new Promise<void>((resolve, reject) => { resolveCompleted = resolve; rejectCompleted = reject })
  void completed.catch(() => {})
  const complete = (turn: Record<string, unknown>) => {
    if (!turnId) { pendingCompletion = turn; return }
    if (turn.id !== turnId) throw new Error('Codex返回了其他轮次的终态')
    turnEnded = true
    if (turn.status === 'completed') resolveCompleted()
    else rejectCompleted(new Error(`Codex本轮${turn.status === 'interrupted' ? '已中断' : '执行失败'}，没有成功完成`))
  }
  let client: CodexClient | undefined
  let catalog: Awaited<ReturnType<typeof prepareCodexCatalog>> | undefined
  try {
    // No inference occurs during this bootstrap; load the selected model's public
    // metadata before starting the process that will be allowed to execute a turn.
    await stage('bootstrap_start')
    const bootstrap = await CodexClient.start({ ...input, signal })
    let config: Record<string, unknown>, model: string
    try {
      await stage('config_read'); config = object((await bootstrap.client.request('config/read', { includeLayers: false })).config)
      model = string(input.model || config.model, '已配置模型')
      await input.onModelSelected?.(model)
      await stage('model_list')
      await bootstrap.client.request('model/list', {})
      await stage('catalog_prepare')
      catalog = await prepareCodexCatalog(input.profile, input.cwd, input.privateHome, model)
    } finally { await bootstrap.client.close(); diagnostic.protocol = bootstrap.client.diagnostics() }
    await stage('runtime_start')
    const started = await CodexClient.start({ ...input, signal, catalogPath: catalog.path,
      onRequest: async (method, params) => {
        try {
          if (!input.tools?.length || method !== 'item/tool/call') throw new Error('此阶段未授权外部操作')
          // The native request may arrive in the same packet as turn/start's response.
          await Promise.race([ready, cancelled])
          await client?.drain()
          signal.throwIfAborted()
          if (params.threadId !== threadId || params.turnId !== turnId || params.namespace !== 'boai') throw new Error('外部工具调用不属于当前执行')
          const name = string(params.tool, '工具名称'), callId = string(params.callId, '工具调用身份')
          const tool = input.tools.find(tool => tool.name === name)
          if (!tool) throw new Error('外部工具不在当前授权列表')
          const signature = JSON.stringify([name, params.arguments]), previous = calls.get(callId)
          if (previous) { if (previous.signature !== signature) throw new Error('同一工具身份的输入发生变化'); return await previous.promise }
          if (calls.size >= 48) throw new Error('达到本次外部工具调用上限')
          const promise = Promise.resolve().then(async () => {
            signal.throwIfAborted()
            const result = await tool.execute(params.arguments, callId)
            signal.throwIfAborted()
            return { contentItems: [{ type: 'inputText', text: JSON.stringify(result) ?? 'null' }], success: true }
          })
          calls.set(callId, { signature, promise })
          return await promise
        } catch (error) { timeout.abort(error); throw error }
      },
      onNotification: async (method, params) => {
        if (!threadId || params.threadId !== threadId) return
        // Warnings have a thread target but no turn identity. Ignore pre-turn and
        // post-terminal warnings; an in-flight submission must first get its receipt.
        if (method === 'warning') {
          if (!turnRequested || turnEnded || pendingCompletion || typeof params.message !== 'string' || !/^Falling back from WebSockets to HTTPS transport(?:\.|$)/.test(params.message)) return
          await Promise.race([ready, cancelled])
          if (!turnId || turnEnded || pendingCompletion || signal.aborted) return
          const events = diagnostic.transportEvents ??= []
          if (events.length < 8) events.push({ type: 'websocket_to_https_fallback', elapsedMs: elapsed() })
          return
        }
        if (['item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'thread/tokenUsage/updated', 'error'].includes(method)) {
          await Promise.race([ready, cancelled])
          if (params.turnId !== turnId || turnEnded && method !== 'thread/tokenUsage/updated') return
        }
        if (method === 'item/started' || method === 'item/completed') {
          const item = object(params.item)
          if (!textOnlyItems.has(string(item.type, '事件类型')) && !(input.tools?.length && item.type === 'dynamicToolCall')) throw new Error('无工具阶段出现工具事件，已停止')
          if (item.type === 'agentMessage' && item.phase === 'commentary' && typeof item.id === 'string') {
            commentaryItems.add(item.id)
            if (method === 'item/completed' && typeof item.text === 'string') await publishProgress(`commentary:${item.id}`, 'commentary', item.text, false, true)
          } else if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') finalText = item.text
          if (method === 'item/completed' && item.type === 'reasoning' && typeof item.id === 'string' && Array.isArray(item.summary)) {
            for (const [index, value] of item.summary.slice(0, EXECUTION_PROGRESS_LIMITS.events).entries()) if (typeof value === 'string') await publishProgress(`summary:${item.id}:${index}`, 'summary', value, false, true)
          }
        } else if (method === 'item/reasoning/summaryTextDelta') {
          if (typeof params.itemId !== 'string' || !Number.isSafeInteger(params.summaryIndex) || Number(params.summaryIndex) < 0 || typeof params.delta !== 'string') return
          await publishProgress(`summary:${params.itemId}:${params.summaryIndex}`, 'summary', params.delta, true)
        } else if (method === 'item/agentMessage/delta') {
          const delta = typeof params.delta === 'string' ? params.delta : ''
          if (typeof params.itemId === 'string' && commentaryItems.has(params.itemId)) await publishProgress(`commentary:${params.itemId}`, 'commentary', delta, true)
          text += delta
          await input.onDelta?.(delta)
        } else if (method === 'thread/tokenUsage/updated') {
          const tokenUsage = object(params.tokenUsage), raw = object(tokenUsage.last)
          // Codex reports each completed model response; total identifies duplicate notifications.
          const receipt = JSON.stringify(object(tokenUsage.total))
          if (!seenUsage.has(receipt)) {
            seenUsage.add(receipt)
            for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
              const value = raw[field]
              if (!unknownUsage.has(field) && typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[field] = (usage[field] ?? 0) + value
              else { unknownUsage.add(field); delete usage[field] }
            }
            await input.onUsage?.({ ...usage })
          }
        } else if (method === 'error' && params.turnId === turnId && diagnostic.externalErrors.length < 8) {
          const error = params.error && typeof params.error === 'object' && !Array.isArray(params.error) ? params.error as Record<string, unknown> : {}
          diagnostic.externalErrors.push({ ...errorCode(error.codexErrorInfo), willRetry: params.willRetry === true, elapsedMs: elapsed() })
        } else if (method === 'turn/completed') complete(object(params.turn))
      },
    })
    client = started.client
    const options = { ...noToolsThread(input.cwd, config), baseInstructions: input.instructions,
      ...(input.tools?.length ? { dynamicTools: [{ type: 'namespace', name: 'boai', description: 'BoAI host-authorized work tools', tools: input.tools.map(({ name, description, inputSchema }) => ({ type: 'function', name, description, inputSchema, deferLoading: false })) }] } : {}),
      model }
    await stage(input.threadId ? 'thread_resume' : 'thread_start')
    const thread = input.threadId
      ? await client.request('thread/resume', { ...options, threadId: input.threadId, excludeTurns: true })
      : await client.request('thread/start', { ...options, ephemeral: input.ephemeral ?? false })
    threadId = string(object(thread.thread).id, '会话身份')
    if (input.threadId && input.threadId !== threadId) throw new Error('Codex会话身份发生变化')
    await stage('session_commit')
    await input.onSession?.(threadId)
    signal.throwIfAborted()
    await stage('turn_start')
    turnRequested = true
    const response = await client.request('turn/start', { threadId, environments: [],
      input: [{ type: 'text', text: input.prompt, text_elements: [] }, ...(input.images ?? []).map(url => ({ type: 'image', url }))],
      ...(input.effort ? { effort: input.effort } : {}), ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
    })
    turnId = string(object(response.turn).id, '轮次身份')
    resolveReady()
    await stage('submission_commit')
    await input.onSubmitted?.(threadId, turnId)
    if (pendingCompletion) complete(pendingCompletion)
    await stage('turn_wait')
    await client.wait(completed)
    await stage('event_drain')
    await client.drain()
    signal.throwIfAborted()
    for (const [id, entry] of progress) await publishProgress(id, entry.kind, entry.text, false, true)
    if (!(finalText || text).trim()) throw new Error('Codex没有返回可见内容')
    await stage('completed'); diagnostic.outcome = 'completed'
    return { text: finalText || text, threadId, turnId, usage, verified: started.verified }
  } finally {
    if (input.signal.aborted) diagnostic.outcome = 'cancelled'
    diagnostic.protocol = client?.diagnostics() ?? diagnostic.protocol
    clearTimeout(timer)
    timeout.abort(new Error('Codex阶段已退出'))
    input.onStop?.()
    signal.removeEventListener('abort', cancelWait)
    resolveReady()
    try { await client?.close(); await catalog?.dispose() }
    finally {
      diagnostic.elapsedMs = elapsed()
      diagnostic.threadId = threadId || undefined; diagnostic.turnId = turnId || undefined
      // Diagnostic persistence is best-effort and cannot replay or fail the business operation.
      try { await input.onDiagnostic?.(diagnostic) } catch { /* The observer reports its own storage error. */ }
    }
  }
}
