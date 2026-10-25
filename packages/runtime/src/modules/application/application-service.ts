/*
 * [OUTPUT]: 会话/员工清理同步擦除终端、预览回执正文，仅保留写入去重身份。
 * [OUTPUT]: 员工/会话清理同步移除手动引用关系与回执结果；关系回执不保存对象正文。
 * [OUTPUT]: Plan Weave状态/报告随来源清理；已知事务前置拒绝保留稳定rejected回执，未知副作用仍不重放。
 * [OUTPUT]: 规划状态与回执随员工/源会话原清理事务清除，保留请求去重。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [OUTPUT]: 行为调用使用独立宿主principal及原持久业务回执；来源清理后不返回已清除正文。
 * [INPUT]: Explicit operation registry, original ProductStore and host-authenticated actor.
 * [OUTPUT]: Domain precondition failures include explicit FORBIDDEN for scoped read operations.
 * [OUTPUT]: Stable business request identity, discovery, validated calls and durable receipts.
 * [POS]: Application facade; no model invocation, new Work or parallel business persistence.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { APPLICATION_PROTOCOL_VERSION, applicationResultSchema, applicationReceiptQuerySchema, type ApplicationReceiptQuery, applicationCatalogQuerySchema, applicationRequestSchema, type ApplicationActor, type ApplicationCatalogQuery, type ApplicationRequest, type ApplicationResult } from '@boai/shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

export interface ApplicationOperation {
  name: string
  description: string
  effect: 'read' | 'write'
  ownerOnly?: boolean
  input: z.ZodType
  resultType: string
  available?(): boolean
  unavailableReason?: string
  validate?(input: any, actor: ApplicationActor): Promise<void>
  execute(input: any, requestId: string | undefined, actor: ApplicationActor): Promise<unknown>
}
interface OperationReceipt { ownerAgentId?: string; runtimeId?: string; id: string; actor: ApplicationActor; fingerprint: string; result: ApplicationResult }
/** Only throw before any effect, or from an atomic transaction that rolls back on failure. */
export class ApplicationValidationError extends Error { constructor(readonly code: 'REVISION_CONFLICT' | 'NOT_FOUND' | 'INVALID_INPUT' | 'FORBIDDEN', message: string) { super(message) } }
const collection = 'applicationOperations'
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
const principal = (actor: ApplicationActor) => actor.kind === 'owner' ? 'owner' : actor.kind === 'behavior' ? `behavior:${actor.employeeId}:${actor.behaviorRunId}` : `employee:${actor.employeeId}:${actor.conversationId}:${actor.messageId}`

export class ApplicationService {
  private runtimeId = randomUUID()
  private failures = new Set<string>()
  private operations: Map<string, ApplicationOperation>
  private pending = new Set<Promise<ApplicationResult>>()
  get busy() { return this.pending.size > 0 }
  async drain() { await Promise.allSettled([...this.pending]) }
  constructor(private store: ProductStore, operations: ApplicationOperation[], private authorize: (actor: ApplicationActor, operation?: ApplicationOperation) => Promise<void>) {
    this.operations = new Map(operations.map(operation => [operation.name, operation]))
    if (this.operations.size !== operations.length) throw new Error('Duplicate application operation')
  }
  async catalog(query: ApplicationCatalogQuery = {}, actor: ApplicationActor = { kind: 'owner' }) {
    await this.authorize(actor)
    const filter = applicationCatalogQuerySchema.parse(query)
    return { protocolVersion: APPLICATION_PROTOCOL_VERSION, operations: [...this.operations.values()]
      .filter(item => (actor.kind === 'owner' || !item.ownerOnly) && (!filter.domain || item.name.startsWith(`${filter.domain}.`)) && (!filter.operation || item.name === filter.operation))
      .map(item => ({ name: item.name, description: item.description, effect: item.effect, access: item.ownerOnly ? 'owner' as const : 'owner-or-core' as const, available: item.available?.() ?? true,
        ...(item.available && !item.available() ? { unavailableReason: item.unavailableReason ?? '当前宿主不提供此能力' } : {}),
        resultType: item.resultType,
        ...(filter.operation || filter.includeSchemas ? { inputSchema: z.toJSONSchema(item.input, { io: 'input', unrepresentable: 'any' }), outputSchema: z.toJSONSchema(applicationResultSchema, { unrepresentable: 'any' }) } : {}) })) }
  }
  async receipt(query: string | ApplicationReceiptQuery, actor: ApplicationActor = { kind: 'owner' }): Promise<ApplicationResult | null> {
    await this.authorize(actor)
    const input = applicationReceiptQuerySchema.parse(typeof query === 'string' ? { requestId: query } : query)
    const receipt = await this.store.get<OperationReceipt>(collection, input.receiptId ?? digest([principal(actor), input.requestId]))
    if (!receipt) return null
    if (actor.kind !== 'owner' && (receipt.actor.kind === 'owner' || actor.employeeId !== receipt.actor.employeeId || actor.conversationId !== receipt.actor.conversationId || actor.kind === 'behavior' && (receipt.actor.kind !== 'behavior' || actor.behaviorRunId !== receipt.actor.behaviorRunId))) throw new Error('原回执不属于当前员工会话')
    // A previous process may have committed the domain write but died before its receipt.
    // Never promote that gap to success or invoke the operation again.
    if (receipt.result.status === 'running' && (receipt.runtimeId !== this.runtimeId || this.failures.has(receipt.id))) return { ...receipt.result, status: 'unknown', error: { code: 'OUTCOME_UNKNOWN', message: '原服务未留下完成回执，请核对目标对象；本请求不会自动重放。' } }
    return structuredClone(receipt.result)
  }
  call(raw: ApplicationRequest, actor: ApplicationActor = { kind: 'owner' }): Promise<ApplicationResult> {
    const task = this.invoke(raw, actor)
    this.pending.add(task)
    void task.finally(() => this.pending.delete(task)).catch(() => {})
    return task
  }
  private async invoke(raw: ApplicationRequest, actor: ApplicationActor): Promise<ApplicationResult> {
    const parsed = applicationRequestSchema.safeParse(raw)
    const reject = (operation: string, error: NonNullable<ApplicationResult['error']>, requestId?: string): ApplicationResult => ({ protocolVersion: APPLICATION_PROTOCOL_VERSION, operation, ...(requestId ? { requestId } : {}), status: 'rejected', error })
    if (!parsed.success) return reject('invalid', { code: 'INVALID_INPUT', message: '应用操作信封不符合协议。', fields: parsed.error.issues.map(issue => issue.path.join('.')) })
    const request = parsed.data, operation = this.operations.get(request.operation)
    if (!operation) return reject(request.operation, { code: 'UNKNOWN_OPERATION', message: '操作未注册，请先查询业务目录。' }, request.requestId)
    if (operation.ownerOnly && actor.kind !== 'owner') return reject(request.operation, { code: 'FORBIDDEN', message: '此操作仅面向本人入口，员工不能代冒本人身份调用。' }, request.requestId)
    try { await this.authorize(actor, operation) } catch { return reject(request.operation, { code: 'FORBIDDEN', message: '当前调用者没有此应用管理权限。' }, request.requestId) }
    const input = operation.input.safeParse(request.input)
    if (!input.success) return reject(request.operation, { code: 'INVALID_INPUT', message: '业务参数不符合目录中的输入合同。', fields: input.error.issues.map(issue => issue.path.join('.')) }, request.requestId)
    if (operation.effect === 'write' && !request.requestId) return reject(request.operation, { code: 'INVALID_INPUT', message: '写操作必须提供稳定的 requestId；重试同一意图请保留此 ID。' })
    const base: ApplicationResult = { protocolVersion: APPLICATION_PROTOCOL_VERSION, operation: request.operation, ...(request.requestId ? { requestId: request.requestId } : {}), status: 'running' }
    const key = request.requestId ? digest([principal(actor), request.requestId]) : undefined
    const fingerprint = digest({ operation: request.operation, input: input.data })
    if (operation.effect === 'write') {
      // Check an old receipt even when capability availability has since changed.
      const previous = await this.store.get<OperationReceipt>(collection, key!)
      if (previous) return previous.fingerprint === fingerprint ? (await this.receipt(request.requestId!, actor))! : reject(request.operation, { code: 'REQUEST_CONFLICT', message: '同一 requestId 已用于不同参数或操作，请核对原回执。' }, request.requestId)
    }
    if (operation.available && !operation.available()) return reject(request.operation, { code: 'CAPABILITY_UNAVAILABLE', message: operation.unavailableReason ?? '当前宿主不提供此能力。' }, request.requestId)
    try { await operation.validate?.(input.data, actor) } catch (error) {
      if (error instanceof ApplicationValidationError) return reject(request.operation, { code: error.code, message: error.message }, request.requestId)
      return reject(request.operation, { code: 'INVALID_INPUT', message: '操作前核对未通过，未开始写入。' }, request.requestId)
    }
    if (operation.effect === 'read') {
      try { return { ...base, status: 'succeeded', data: (await operation.execute(input.data, request.requestId, actor)) ?? null } }
      catch (error) { return reject(request.operation, error instanceof ApplicationValidationError ? { code: error.code, message: error.message } : { code: 'INVALID_INPUT', message: '读取未完成，请核对对象是否存在及当前访问条件。' }, request.requestId) }
    }
    const claimed = await this.store.transaction(async tx => {
      const prior = await tx.get<OperationReceipt>(collection, key!)
      if (prior) return false
      base.startedAt = new Date().toISOString()
      base.receiptId = key!
      await tx.put({ collection, id: key!, value: { id: key!, runtimeId: this.runtimeId, actor, fingerprint, result: base } satisfies OperationReceipt })
      return true
    })
    if (!claimed) return this.invoke(raw, actor)
    try {
      const data = await operation.execute(input.data, `application-${key}`, actor)
      const result: ApplicationResult = { ...base, status: 'succeeded', data: data ?? null, finishedAt: new Date().toISOString() }
      const ownerAgentId = (request.operation.startsWith('employees.') || request.operation.startsWith('tasks.') || request.operation.startsWith('planning.') || request.operation.startsWith('plans.') || request.operation.startsWith('refs.')) && data && typeof data === 'object' ? ((data as { agentId?: string; id?: string }).agentId ?? (data as { id?: string }).id) : undefined
      await this.store.transaction(async tx => {
        if ((ownerAgentId && !await tx.get('agents', ownerAgentId)) || (actor.kind === 'employee' && !await tx.get('messages', actor.messageId)) || (actor.kind === 'behavior' && !await tx.get('agentBehaviorRuns', actor.behaviorRunId))) { result.status = 'cleared'; delete result.data }
        if (request.operation === 'refs.link' && result.data && !await tx.get('agentReferenceLinks', (result.data as { id: string }).id)) { result.status = 'cleared'; delete result.data }
        if (request.operation.startsWith('plans.') && result.data && request.operation !== 'plans.delete') {
          const source = result.data as { id: string; epoch: string }, current = await tx.get<{ epoch: string }>('agentPlans', source.id)
          if (!current || current.epoch !== source.epoch) { result.status = 'cleared'; delete result.data }
        }
        await tx.put({ collection, id: key!, value: { id: key!, runtimeId: this.runtimeId, actor, fingerprint, ...(ownerAgentId ? { ownerAgentId } : {}), result } satisfies OperationReceipt })
      })
      return result
    } catch (error) {
      if (error instanceof ApplicationValidationError) {
        const result: ApplicationResult = { ...base, status: 'rejected', error: { code: error.code, message: error.message }, finishedAt: new Date().toISOString() }
        await this.store.write([{ collection, id: key!, value: { id: key!, runtimeId: this.runtimeId, actor, fingerprint, result } satisfies OperationReceipt }])
        return result
      }
      this.failures.add(key!)
      // Existing domain methods can fail after a filesystem/credential/SQLite effect.
      // Do not store their raw errors or inputs: either may contain credentials.
      const result: ApplicationResult = { ...base, status: 'unknown', error: { code: 'OUTCOME_UNKNOWN', message: '操作未确认完成。请核对目标对象和原回执；未自动重试。' }, finishedAt: new Date().toISOString() }
      await this.store.write([{ collection, id: key!, value: { id: key!, runtimeId: this.runtimeId, actor, fingerprint, ...(request.operation.startsWith('employees.') && result.data && typeof result.data === 'object' ? { ownerAgentId: ((result.data as { agentId?: string; id?: string }).agentId ?? (result.data as { id?: string }).id) } : {}), result } satisfies OperationReceipt }]).catch(() => {})
      return result
    }
  }
}

/** Preserve only request deduplication when an employee or source conversation is removed. */
export async function clearApplicationReceipts(tx: RecordTransaction, scope: { employeeIds?: Set<string>; conversationId?: string }) {
  const clearedTasks = new Set<string>(), clearedPlanning = new Set<string>()
  for (const link of await tx.list<{ id: string; agentId: string; conversationId: string }>('agentReferenceLinks')) {
    if (scope.employeeIds?.has(link.agentId) || scope.conversationId === link.conversationId) await tx.remove('agentReferenceLinks', link.id)
  }
  for (const plan of await tx.list<{ id: string; agentId: string; conversationId: string }>('agentPlans')) {
    if (scope.employeeIds?.has(plan.agentId) || scope.conversationId === plan.conversationId) await tx.remove('agentPlans', plan.id)
  }
  for (const mode of await tx.list<{ id: string; agentId: string; conversationId: string }>('agentPlanningModes')) {
    if (scope.employeeIds?.has(mode.agentId) || scope.conversationId === mode.conversationId) { clearedPlanning.add(mode.id); await tx.remove('agentPlanningModes', mode.id) }
  }
  for (const task of await tx.list<{ id: string; agentId: string; conversationId?: string }>('agentTasks')) {
    if (scope.employeeIds?.has(task.agentId) || scope.conversationId && task.conversationId === scope.conversationId) { clearedTasks.add(task.id); await tx.remove('agentTasks', task.id) }
  }
  for (const receipt of await tx.list<OperationReceipt>(collection)) {
    const clearedTask = receipt.result.operation.startsWith('planning.') && (clearedPlanning.has((receipt.result.data as { id?: string } | undefined)?.id ?? '') || !!scope.conversationId && (receipt.result.data as { conversationId?: string } | undefined)?.conversationId === scope.conversationId) || receipt.result.operation.startsWith('tasks.') && clearedTasks.has((receipt.result.data as { id?: string } | undefined)?.id ?? '')
    const clearedPlan = receipt.result.operation.startsWith('plans.') && !!scope.conversationId && (receipt.result.data as { conversationId?: string } | undefined)?.conversationId === scope.conversationId
    const clearedReference = receipt.result.operation.startsWith('refs.') && !!scope.conversationId && (receipt.result.data as { conversationId?: string } | undefined)?.conversationId === scope.conversationId
    const clearedWorkspace = /^(terminal|preview|workspace)\./.test(receipt.result.operation) && (!!scope.conversationId && (receipt.result.data as { conversationId?: string } | undefined)?.conversationId === scope.conversationId || !!scope.employeeIds?.has((receipt.result.data as { employeeId?: string } | undefined)?.employeeId ?? ''))
    if (!clearedWorkspace && !clearedReference && !clearedPlan && !clearedTask && !(receipt.ownerAgentId && scope.employeeIds?.has(receipt.ownerAgentId)) && !(receipt.actor.kind !== 'owner' && (scope.employeeIds?.has(receipt.actor.employeeId) || scope.conversationId === receipt.actor.conversationId))) continue
    const { data: _data, error: _error, ...result } = receipt.result
    await tx.put({ collection, id: receipt.id, value: { ...receipt, result: { ...result, status: 'cleared' } } satisfies OperationReceipt })
  }
}

/** A requested reset/delete also removes old report bodies from replayable owner receipts. */
export async function clearPlanReceipts(tx: RecordTransaction, planId: string) {
  for (const receipt of await tx.list<OperationReceipt>(collection)) {
    if (!receipt.result.operation.startsWith('plans.') || (receipt.result.data as { id?: string } | undefined)?.id !== planId) continue
    const { data: _data, error: _error, ...result } = receipt.result
    await tx.put({ collection, id: receipt.id, value: { ...receipt, result: { ...result, status: 'cleared' } } satisfies OperationReceipt })
  }
}
