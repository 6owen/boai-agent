/*
 * [INPUT]: Original task, occurrence, Work, Run, source identity and bounded read-only evidence.
 * [OUTPUT]: Deterministic diagnosis metadata, unknown coverage and observed duration; zero recover or repair.
 * [POS]: Application read projection; does not change task labels, execution state or permissions.
 * [PROTOCOL]: Update Header and application/.folder.md when this file changes.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AgentRun, Conversation, DigitalAgent, Message } from '@boai/shared/domain'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { AutomationOccurrence } from '@boai/shared/domain/automations'
import { publishedWorkQuestionMatches } from '@boai/shared/domain/inbox'
import type { WorkItem } from '@boai/shared/domain/work'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import type { ExecutionEvidence } from '@boai/shared/domain/execution'
import { taskDiagnosisQuerySchema, taskDiagnosisTargetSchema, TASK_DIAGNOSIS_LIMITS, type DiagnosisFact, type DiagnosisTiming, type TaskDiagnosisTarget, type TaskDiagnosisSnapshot } from '@boai/shared/domain/task-diagnosis'
import { desktopDiagnosticsSnapshotSchema } from '@boai/shared/ipc/desktop-diagnostics'
import type { ApplicationHostPort } from '@boai/shared/ipc/application-host'
import type { TaskDiagnosisRecordScope } from '../../adapters/storage/task-diagnosis-records'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const stamp = z.object({ version: z.literal(1), key: z.string().length(64), revision: z.string().length(64), offset: z.number().int().nonnegative() }).strict()
const fail = (code: 'FORBIDDEN' | 'NOT_FOUND' | 'REVISION_CONFLICT' | 'INVALID_INPUT', message: string): never => { throw new ApplicationValidationError(code, message) }
const knownStatus = (value: unknown, choices: string[]) => typeof value === 'string' && choices.includes(value) ? value : 'unknown'
const runStatuses = ['queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'interrupted']
const occurrenceStatuses = ['queued', 'admitted', 'running', 'waiting_approval', 'waiting_user', 'waiting_work', 'cancelling', 'completed', 'failed', 'cancelled', 'interrupted', 'needs_review', 'skipped']
const receiptStatuses = ['running', 'succeeded', 'rejected', 'unknown', 'cleared']
const safeError = (value: unknown) => typeof value === 'string' && ['INVALID_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'REVISION_CONFLICT', 'REQUEST_CONFLICT', 'CAPABILITY_UNAVAILABLE', 'OUTCOME_UNKNOWN', 'UNRESOLVED_WRITE', 'NO_PROGRESS', 'UNKNOWN_OPERATION', 'UNSUPPORTED_CONTRACT_VERSION'].includes(value) ? value : value ? 'OTHER' : undefined
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const at = (value: unknown) => validDate(value) ? { at: value } : {}

async function availableRoom(store: ProductStore, id: string, employeeId: string) {
  const room = await store.get<Conversation>('conversations', id)
  if (!room || room.mergedInto || room.list?.hidden || !room.agentIds.includes(employeeId) || await store.get('conversationCleanup', id)) fail('NOT_FOUND', '目标会话已清理、隐藏或不再属于该员工')
  return room!
}

/** Always repeats source checks; raw model target arguments never provide cross-employee authority. */
async function authorize(store: ProductStore, actor: ApplicationActor, target: TaskDiagnosisTarget) {
  const employee = await store.get<DigitalAgent>('agents', target.employeeId)
  if (!employee) fail('NOT_FOUND', '目标员工已不存在')
  if (actor.kind === 'owner') return
  if (actor.kind !== 'employee') return fail('FORBIDDEN', '后台行为没有任务诊断授权')
  const caller = await store.get<DigitalAgent>('agents', actor.employeeId)
  if (!isCoreAgent(caller) || !caller?.active) fail('FORBIDDEN', '仅本人和当前bobo本人消息可诊断任务')
  const room = await availableRoom(store, actor.conversationId, actor.employeeId)
  const source = await store.get<Message>('messages', actor.messageId)
  if (room.channel || source?.conversationId !== room.id || source.senderType !== 'user' || source.senderId !== 'user' || source.status !== 'completed' || source.channel || source.origin) fail('FORBIDDEN', '原本人消息授权已失效')
  if (target.employeeId === actor.employeeId) return
  const selected = taskDiagnosisTargetSchema.safeParse(source!.diagnosisTarget)
  if (!selected.success || selected.data.employeeId !== target.employeeId || selected.data.kind !== target.kind || (selected.data.kind === 'task' ? target.kind !== 'task' || selected.data.taskId !== target.taskId || !!selected.data.occurrenceId && selected.data.occurrenceId !== target.occurrenceId : target.kind !== 'run' || selected.data.runId !== target.runId || selected.data.conversationId !== target.conversationId)) fail('FORBIDDEN', '跨员工诊断需要本人当前消息中由宿主核验的指定目标，模型参数不能代替授权')
}

export function diagnosisTiming(events: ExecutionEvidence[]): DiagnosisTiming {
  const intervals: DiagnosisTiming['intervals'] = []
  let unknownIntervals = 0, invalidClockIntervals = 0
  for (const event of events) {
    const canonical = event.canonical
    if (!canonical) continue
    const start = event.observedTiming?.startedAt, end = event.observedTiming?.finishedAt
    // Stable block sequence is not lifecycle evidence; legacy/terminal-only records stay unknown.
    if (canonical.phase !== 'terminal' || start === undefined || end === undefined) { unknownIntervals++; continue }
    if (!validDate(start) || !validDate(end) || Date.parse(end) < Date.parse(start)) { invalidClockIntervals++; continue }
    intervals.push({ sourceId: event.id, runId: event.runId, start, end, durationMs: Date.parse(end) - Date.parse(start) })
  }
  const ordered = intervals.map(value => ({ start: Date.parse(value.start), end: Date.parse(value.end) })).sort((a, b) => a.start - b.start)
  let union = 0, start: number | undefined, end = 0
  for (const current of ordered) {
    if (start === undefined) { start = current.start; end = current.end }
    else if (current.start <= end) end = Math.max(end, current.end)
    else { union += end - start; start = current.start; end = current.end }
  }
  if (start !== undefined) union += end - start
  const summed = intervals.reduce((total, value) => total + value.durationMs, 0)
  return { basis: 'observed-intervals', unionMs: intervals.length ? union : null, summedMs: intervals.length ? summed : null, overlapMs: intervals.length ? summed - union : null, intervals, unknownIntervals, invalidClockIntervals, complete: false,
    explanation: '仅为已配对的宿主工具观察区间；并行区间按并集计算，不代表完整任务耗时、native内部步骤或费用。缺失/未闭合/时钟异常区间保持未知。' }
}

export interface TaskDiagnosisOptions { host?: ApplicationHostPort }
export function taskDiagnosisOperation(store: ProductStore, options: TaskDiagnosisOptions = {}): ApplicationOperation {
  return { name: 'diagnostics.task', description: '只读解释明确任务或运行的状态与有证据的耗时。先固定employee/task/occurrence或run身份；多次执行需选择。仅本人/bobo，跨员工需本人消息中经宿主核验的诊断目标。零重试、零recover、零状态变更；未知不是成功或失败。', effect: 'read', input: taskDiagnosisQuerySchema, resultType: 'TaskDiagnosisSnapshot', execute: (raw, _, actor) => readTaskDiagnosis(store, raw, actor, options) }
}

export async function readTaskDiagnosis(store: ProductStore, raw: unknown, actor: ApplicationActor, options: TaskDiagnosisOptions = {}): Promise<TaskDiagnosisSnapshot> {
  const input = taskDiagnosisQuerySchema.parse(raw), { target } = input
  await authorize(store, actor, target)
  const observedAt = new Date().toISOString(), facts: DiagnosisFact[] = [], events: ExecutionEvidence[] = []
  const task = target.kind === 'task' ? await store.get<TrackedTask>('agentTasks', target.taskId) : undefined
  if (target.kind === 'task' && (!task || task.agentId !== target.employeeId)) fail('NOT_FOUND', '原任务已不存在或不属于指定员工')
  const result: TaskDiagnosisSnapshot = {
    schemaVersion: 1, target: { ...target, runIds: [], workIds: [], ...(task ? { taskRevision: task.revision } : {}) }, observedAt, sourceObservedAt: { runtime: observedAt }, snapshotChanged: false, selectionRequired: false, candidates: [],
    state: { ...(task ? { task: { status: knownStatus(task.status, ['pending', 'in_progress', 'in_review', 'done', 'closed']), ...(task.statusSource ? { statusSource: knownStatus(task.statusSource, ['manual', 'employee', 'execution']) } : {}) } } : {}), runs: [], works: [], waiting: { approval: false, input: false, dependency: false, queue: false, tool: false } }, facts: [],
    assessment: { certainty: 'unknown', findings: [], evidenceIds: [], missingEvidence: [], suggestedNextSteps: [] }, timing: diagnosisTiming([]),
    coverage: { runsTruncated: false, evidenceTruncated: false, recordsTruncated: false, sourceUnavailable: 0, receipts: 'source-message-only', nativeActions: 'available', host: 'not-requested', reasons: ['非原子全局快照；人工任务标签不等于执行完成或用户验收。', '回执仅核对原消息身份，不推定属于该消息的某个重试运行。'], totalFacts: 0 },
  }
  const add = (kind: DiagnosisFact['kind'], id: string, status: string, collection: string, sourceId: string, extra: Partial<DiagnosisFact> = {}) => facts.push({ id, kind, status, evidence: { collection, id: sourceId }, visibility: 'diagnostic-metadata', relation: 'target', ...extra })
  if (task) add('task', `task:${task.id}`, knownStatus(task.status, ['pending', 'in_progress', 'in_review', 'done', 'closed']), 'agentTasks', task.id, { ...at(task.updatedAt), evidence: { collection: 'agentTasks', id: task.id, revision: task.revision } })
  let occurrence: AutomationOccurrence | undefined, runIds: string[] = [], conversationId: string | undefined
  if (target.kind === 'run') { conversationId = target.conversationId; runIds = [target.runId] }
  else {
    if (target.occurrenceId) {
      occurrence = await store.get<AutomationOccurrence>('automationOccurrences', target.occurrenceId)
      if (!occurrence || occurrence.deletedAt || occurrence.taskId !== task!.id) fail('NOT_FOUND', '指定执行已删除或不属于原任务')
    } else {
      const [page, source] = await Promise.all([
        store.automationHistory({ employeeId: target.employeeId, taskId: task!.id, limit: TASK_DIAGNOSIS_LIMITS.occurrences }),
        task!.source ? store.employeeTaskSource(target.employeeId, task!.source) : undefined,
      ])
      const occurrenceRuns = new Set(page.occurrences.flatMap(value => value.runIds))
      const sourceRuns = (source?.runs ?? []).filter(value => !occurrenceRuns.has(value.id))
      result.candidates = [
        ...page.occurrences.map(value => ({ kind: 'occurrence' as const, id: value.id, status: knownStatus(value.status, occurrenceStatuses), at: validDate(value.startedAt) ? value.startedAt : 'unknown' })),
        ...sourceRuns.map(value => ({ kind: 'run' as const, id: value.id, status: knownStatus(value.status, runStatuses), at: validDate(value.createdAt) ? value.createdAt : 'unknown' })),
      ]
      result.coverage.runsTruncated = !!page.nextCursor || source?.runs.length === 30
      if (source?.runs.length === 30) result.coverage.reasons.push('原消息执行查询已达到30项保留上限，可能还有未返回的运行。')
      if (source && !source.available) result.coverage.sourceUnavailable++
      if (source?.available) conversationId = task!.source!.conversationId
      result.selectionRequired = result.candidates.length > 1 || !!page.nextCursor
      if (result.candidates.length === 1 && !page.nextCursor) {
        if (page.occurrences.length) occurrence = page.occurrences[0]
        else if (source?.available) runIds = [sourceRuns[0]!.id]
      }
    }
    if (occurrence) {
      conversationId = occurrence.conversationId
      runIds = occurrence.runIds
      result.target.occurrenceId = occurrence.id; result.target.occurrenceVersion = occurrence.stateVersion
      result.state.occurrence = { status: knownStatus(occurrence.status, occurrenceStatuses), deliveryStatus: knownStatus(occurrence.deliveryStatus, ['pending', 'delivered', 'no_change', 'partial', 'blocked', 'unknown']) }
      add('occurrence', `occurrence:${occurrence.id}`, result.state.occurrence.status, 'automationOccurrences', occurrence.id, { ...at(occurrence.finishedAt ?? occurrence.startedAt), evidence: { collection: 'automationOccurrences', id: occurrence.id, revision: occurrence.stateVersion } })
      result.state.waiting.approval = occurrence.status === 'waiting_approval'; result.state.waiting.input = occurrence.status === 'waiting_user'; result.state.waiting.dependency = occurrence.status === 'waiting_work'; result.state.waiting.queue = occurrence.status === 'queued'
    }
  }
  if (conversationId) { await availableRoom(store, conversationId, target.employeeId); result.target.conversationId = conversationId }
  if (runIds.length > TASK_DIAGNOSIS_LIMITS.runs) result.coverage.runsTruncated = true
  const guards: { collection: string; id: string; value: string; required: boolean }[] = []
  const recordGuards: { scope: TaskDiagnosisRecordScope; value: string }[] = []
  // Cursor versions contain only identity/state metadata, never hashes of private message/tool bodies.
  const guardValue = (collection: string, value: any) => {
    const fields: Record<string, string[]> = {
      agentTasks: ['id', 'agentId', 'revision', 'sessionConversationId', 'status', 'updatedAt'],
      automationOccurrences: ['id', 'taskId', 'stateVersion', 'conversationId', 'deletedAt', 'status', 'runIds'],
      runs: ['id', 'agentId', 'conversationId', 'triggerMessageId', 'status', 'createdAt', 'finishedAt', 'workId'],
      messages: ['id', 'conversationId', 'senderType', 'senderId', 'status', 'sequence', 'runId', 'employeeTaskId', 'diagnosisTarget'],
      workItems: ['id', 'ownerAgentId', 'conversationId', 'version', 'status', 'resultVersion', 'requiredResults', 'requiresReview'],
      executionClocks: ['id', 'revision'],
    }
    return hash(Object.fromEntries((fields[collection] ?? ['id']).map(key => [key, value?.[key]])))
  }
  const guard = (collection: string, value: { id: string } | undefined, id = value?.id, required = true) => { if (id) guards.push({ collection, id, value: guardValue(collection, value), required }) }
  guard('agentTasks', task); guard('automationOccurrences', occurrence)
  for (const runId of runIds.slice(0, TASK_DIAGNOSIS_LIMITS.runs)) {
    const run = await store.get<AgentRun>('runs', runId)
    const source = run?.triggerMessageId ? await store.get<Message>('messages', run.triggerMessageId) : undefined
    if (!run || run.agentId !== target.employeeId || run.conversationId !== conversationId || !source || source.conversationId !== conversationId || occurrence && run.origin?.occurrenceId !== occurrence.id) {
      if (target.kind === 'run') fail('NOT_FOUND', '原运行来源已清除或身份不匹配')
      result.coverage.sourceUnavailable++; continue
    }
    guard('runs', run); guard('messages', source)
    const active = ['queued', 'running', 'waiting_approval'].includes(run.status)
    result.target.runIds.push(run.id)
    result.state.runs.push({ id: run.id, status: knownStatus(run.status, runStatuses), phase: knownStatus(run.phase, ['decision', 'coordination', 'execution', 'memory']) })
    add('run', `run:${run.id}`, knownStatus(run.status, runStatuses), 'runs', run.id, { ...at(run.finishedAt ?? run.createdAt), errorCode: run.failureKind ? knownStatus(run.failureKind, ['unsupported', 'auth_required', 'input_required', 'budget_exhausted', 'transport']) : undefined })
    result.state.waiting.approval ||= run.status === 'waiting_approval'; result.state.waiting.queue ||= run.status === 'queued'
    if (run.workId) {
      const work = await store.get<WorkItem>('workItems', run.workId)
      if (work && work.conversationId === conversationId && work.ownerAgentId === target.employeeId && (!occurrence || work.origin?.occurrenceId === occurrence.id)) {
        guard('workItems', work)
        if (!result.target.workIds.includes(work.id)) {
          result.target.workIds.push(work.id)
          result.state.works.push({ id: work.id, status: knownStatus(work.status, ['ready', 'running', 'delivered', 'waiting', 'blocked', 'failed', 'cancelled', 'interrupted']), version: work.version, resultVersion: work.resultVersion, requiresReview: work.requiresReview })
          const questionMessage = work.userQuestion?.messageId ? await store.get<Message>('messages', work.userQuestion.messageId) : undefined
          if (publishedWorkQuestionMatches(work, run, questionMessage)) { result.state.waiting.input = true; add('input', `work-input:${work.id}`, 'waiting', 'workItems', work.id, { evidence: { collection: 'workItems', id: work.id, revision: work.version } }); guard('messages', questionMessage) }
          for (const dependency of work.requiredResults.slice(0, TASK_DIAGNOSIS_LIMITS.records)) {
            const other = await store.get<WorkItem>('workItems', dependency.workId)
            guard('workItems', other, dependency.workId, false)
            const ready = !!other && other.conversationId === work.conversationId && other.status === 'delivered' && other.resultVersion >= dependency.resultVersion
            // A dependency's body/owner/other work identity is not needed in the projection.
            add('dependency', `dependency:${work.id}:${facts.length}`, ready ? 'ready' : 'waiting_or_unavailable', 'workItems', work.id, { evidence: { collection: 'workItems', id: work.id, revision: work.version } })
            if (!ready && work.status === 'waiting' && (!work.activeRunId || work.activeRunId === run.id)) result.state.waiting.dependency = true
          }
          if (work.requiredResults.length > TASK_DIAGNOSIS_LIMITS.records) result.coverage.recordsTruncated = true
        }
      } else result.coverage.sourceUnavailable++
    }
    const clockBefore = await store.get<{ id: string; revision: number }>('executionClocks', run.id)
    const evidence = await store.queryExecutionEvidence(run.id)
    guard('executionClocks', clockBefore, run.id, false)
    if (evidence.length > 100) result.coverage.evidenceTruncated = true
    for (const event of evidence.slice(0, 100)) {
      if (event.runId !== run.id || event.conversationId !== run.conversationId || event.agentId !== run.agentId) { result.coverage.sourceUnavailable++; continue }
      if (!event.canonical) continue
      events.push(event)
      const status = event.canonical.phase === 'terminal' ? knownStatus(event.canonical.outcome, ['succeeded', 'failed', 'denied', 'cancelled', 'not_executed', 'unsettled', 'unknown']) : 'running'
      result.state.waiting.tool ||= active && status === 'running'
      add('tool', `tool:${event.id}`, status, 'executionEvidence', event.id, { ...at(event.updatedAt), evidence: { collection: 'executionEvidence', id: event.id, runId: run.id, revision: event.revision ?? undefined } })
    }
    const recordScope = { employeeId: run.agentId, conversationId: run.conversationId, runId: run.id, triggerMessageId: run.triggerMessageId }
    const records = await store.queryTaskDiagnosisRecords(recordScope, TASK_DIAGNOSIS_LIMITS.records)
    recordGuards.push({ scope: recordScope, value: hash(records) })
    if (Object.values(records.truncated).some(Boolean)) result.coverage.recordsTruncated = true
    for (const receipt of records.receipts) if (!facts.some(value => value.id === `receipt:${receipt.id}`)) add('receipt', `receipt:${receipt.id}`, knownStatus(receipt.status, receiptStatuses), 'applicationOperations', receipt.id, { relation: 'source-message', ...at(receipt.finishedAt ?? receipt.startedAt), errorCode: safeError(receipt.errorCode) })
    for (const action of records.nativeActions) {
      const kind = action.kind === 'approval' ? 'approval' : 'input', pending = action.status === 'pending'
      if (pending && active) result.state.waiting[kind] = true
      add(kind, `action:${action.id}`, knownStatus(action.status, ['pending', 'answered', 'interrupted']), 'nativeActions', action.id, { ...at(action.createdAt), evidence: { collection: 'nativeActions', id: action.id, runId: run.id } })
    }
    for (const approval of records.approvals) { result.state.waiting.approval ||= active; add('approval', `approval:${approval.id}`, 'pending', 'approvals', approval.id, { evidence: { collection: 'approvals', id: approval.id, runId: run.id } }) }
  }
  if (options.host?.available && conversationId && result.target.runIds.length === 1) {
    try {
      result.host = desktopDiagnosticsSnapshotSchema.parse(await options.host.request('getDiagnosticsSnapshot', { target: { employeeId: target.employeeId, conversationId, runId: result.target.runIds[0], ...(result.target.workIds.length === 1 ? { workId: result.target.workIds[0] } : {}) }, limit: 64 }))
      result.sourceObservedAt.host = result.host.observedAt; result.coverage.host = 'available'
    } catch { result.coverage.host = 'unavailable'; result.coverage.reasons.push('宿主摘要请求失败；不能据此判断业务结果或服务端根因。') }
  } else if (!options.host?.available) result.coverage.host = 'unavailable'
  else result.coverage.reasons.push('尚未固定单一运行，未将宿主事件归因到其中某次运行。')
  await authorize(store, actor, target)
  if (conversationId) await availableRoom(store, conversationId, target.employeeId)
  for (const item of guards) {
    const current = await store.get<Record<string, unknown>>(item.collection, item.id)
    if (!current && item.required) fail('NOT_FOUND', '诊断读取期间原来源已清除，请重新选择目标')
    if (current && (item.collection === 'agentTasks' && current!.agentId !== target.employeeId || item.collection === 'runs' && (current!.agentId !== target.employeeId || current!.conversationId !== conversationId) || item.collection === 'automationOccurrences' && (current!.deletedAt || current!.taskId !== task!.id))) fail('NOT_FOUND', '原目标身份在读取期间已变化')
    if (guardValue(item.collection, current) !== item.value) result.snapshotChanged = true
  }
  for (const item of recordGuards) if (hash(await store.queryTaskDiagnosisRecords(item.scope, TASK_DIAGNOSIS_LIMITS.records)) !== item.value) result.snapshotChanged = true
  const key = hash({ actor, target, focus: input.focus, limit: input.limit }), revision = hash({ guards, facts, candidates: result.candidates })
  let offset = 0
  if (input.cursor) {
    let parsed: z.infer<typeof stamp>
    try { parsed = stamp.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))) } catch { return fail('INVALID_INPUT', '诊断游标无效，请从第一页重读') }
    if (parsed.key !== key || parsed.revision !== revision || result.snapshotChanged || parsed.offset > facts.length) fail('REVISION_CONFLICT', '诊断来源或范围已变化，请从第一页重读')
    offset = parsed.offset
  }
  result.coverage.totalFacts = facts.length
  result.facts = facts.slice(offset, offset + input.limit)
  if (!result.snapshotChanged && offset + input.limit < facts.length) result.nextCursor = Buffer.from(JSON.stringify({ version: 1, key, revision, offset: offset + input.limit })).toString('base64url')
  result.timing = diagnosisTiming(events)
  const missing = result.assessment.missingEvidence
  if (result.selectionRequired) missing.push('该任务有多次执行；请指定occurrenceId或精确run目标，不能猜最近一次。')
  if (!result.target.runIds.length) missing.push('当前未取得可核对的运行来源；不表示任务没有执行。')
  if (result.coverage.host !== 'available') missing.push('未取得本次运行的宿主摘要。')
  if (result.coverage.sourceUnavailable || result.coverage.runsTruncated || result.coverage.evidenceTruncated || result.coverage.recordsTruncated) missing.push('部分来源不可用或超过本次保留范围；未找到错误不证明没有发生错误。')
  if (result.snapshotChanged) missing.push('读取期间来源发生变化；此结果不是同一时点的原子快照。')
  for (const [flag, text] of [['approval', '现有记录显示等待批准。'], ['input', '现有记录显示等待用户补充。'], ['dependency', '现有记录显示依赖未满足或其结果不可用。'], ['queue', '现有记录显示排队等待。'], ['tool', '现有工具记录尚未终结；不能仅因时间长判断死锁或失败。']] as const) if (result.state.waiting[flag]) result.assessment.findings.push(text)
  if (facts.some(value => value.relation === 'target' && value.status === 'failed')) result.assessment.findings.push('目标存在失败记录；错误类别不足以确定账号、网络或远端服务的具体根因。')
  if (facts.some(value => value.kind === 'receipt' && ['running', 'unknown'].includes(value.status))) result.assessment.findings.push('原消息存在尚未确认结果的写回执；诊断未恢复或重放该操作。')
  if (result.host?.events.some(event => event.relation === 'target' && event.event === 'request-timeout')) result.assessment.findings.push('该目标有宿主请求超时记录；这只证明请求等待超时，不证明业务未执行，不能自动重放。')
  if (result.host?.events.some(event => event.relation === 'target' && event.event === 'runtime-exit')) result.assessment.findings.push('该目标有runtime退出记录；进程断开不证明远端服务的具体根因。')
  if (result.host?.events.some(event => event.relation === 'environment')) missing.push('无目标关联的宿主事件仅是环境线索，不能作为本任务原因。')
  if (result.host && (result.host.coverage.uncorrelatedRecords || result.host.coverage.unknownBuildEntries || result.host.coverage.unreadableFiles || result.host.coverage.rejectedRecords || result.host.coverage.truncated || result.host.coverage.clockOrderUncertain || result.host.coverage.persistenceError)) missing.push('宿主摘要存在关联缺失、旧身份、读取/保留或时钟覆盖限制；host可用不表示证据完整，请结合宿主coverage核对。')
  if (!result.assessment.findings.length && result.target.runIds.length) result.assessment.findings.push('仅能确认所列运行状态；运行结束不等于任务通过验收。')
  result.assessment.certainty = result.assessment.findings.length && !result.snapshotChanged ? 'supported' : 'unknown'
  result.assessment.evidenceIds = [...facts.filter(value => value.kind !== 'task').slice(0, 100).map(value => value.id), ...(result.host?.events.filter(event => event.relation === 'target' && ['request-timeout', 'runtime-exit'].includes(event.event)).map(event => event.id) ?? [])]
  if (result.state.waiting.approval || result.state.waiting.input) result.assessment.suggestedNextSteps.push('在原任务或会话查看对应待批准/待回答项；诊断没有替你处理。')
  if (result.selectionRequired) result.assessment.suggestedNextSteps.push('从候选执行中明确选择一个身份，再读取诊断。')
  return result
}
