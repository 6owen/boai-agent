/*
 * [OUTPUT]: 默认执行不按累计调用、工具步骤、用量或墙钟截断；保留真实用量、取消/权限和明确指定的预算。
 * [OUTPUT]: 自动化预算没有执行截止时间，旧持久账本保留兼容；普通工作期限合同不变。
 * [OUTPUT]: 已删除执行仅保留deletedAt最小触发墓碑，历史查询/统计不展示，旧触发不重跑。
 * [OUTPUT]: 单员工创建共用描述、手动/小时/日/周/月频率和开始日期；旧日周计划兼容。
 * [OUTPUT]: 员工/BOAI群归属、固定成员分工与每次执行快照；旧计划缺省保持原聊天策略。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 自动化预算增加可选callUnit，旧API记录不变；本机外部请求与内部模型次数分开。
 * [INPUT]: 自动化配置、原生触发与产品执行记录。
 * [OUTPUT]: 七项创建的稳定请求身份、草稿生成合同与全历史搜索/进行中/完成筛选；结构化监控来源/规则、比较证据与成功检查点；完整历史待处理谓词/查询、每计划最近结果及计数；显式预算追加请求及累计限额/追加回执；三档通知策略、任务聊天/日历、触发来源、跨工作证据和运行/交付合同。
 * [POS]: 跨进程的自动化领域合同；旧记录由运行时迁移，不伪造历史交付。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { BudgetRenewal } from './work'
export type AutomationNotificationPolicy = 'all_results' | 'important_only' | 'muted'
export interface AutomationBudgetRenewalInput { expectedVersion: number; allowance: 'standard-v1' }

export type AutomationOwner = { kind: 'employee'; employeeId: string } | { kind: 'group'; conversationId: string }
export interface AutomationAssignment {
  employeeId: string
  instruction: string
  deliverable: string
  /** Employee IDs from this plan, resolved to actual Work IDs during this occurrence. */
  dependsOn: string[]
}
export interface AutomationCollaboration {
  coordinatorId: string
  assignments: AutomationAssignment[]
}
export interface AutomationExecutionPlan {
  owner: AutomationOwner
  employeeIds: string[]
  collaboration?: AutomationCollaboration
}
export interface AutomationCreationSource { conversationId: string; messageId: string; agentId: string }
export interface AutomationListQuery { owner?: AutomationOwner; before?: { updatedAt: string; id: string }; limit?: number }
export interface AutomationListPage { definitions: (AutomationDefinition & { nextTimes: string[]; latestOccurrence?: Pick<AutomationOccurrence, 'id' | 'status' | 'deliveryStatus' | 'startedAt' | 'finishedAt'> })[]; nextCursor?: { updatedAt: string; id: string } }

export interface AutomationMonitorPolicy {
  comparator: 'json-fields-v1'
  source: { kind: 'conversation-artifact'; conversationId: string; name: string }
  maxAgeSeconds: number
  cooldownSeconds: number
  rules: ({ pointer: string; mode: 'changed' } | { pointer: string; mode: 'numeric_delta'; threshold: number })[]
}
/** Nested JSON is bounded and validated at the runtime boundary. */
export type MonitorValue = null | boolean | number | string | unknown[] | { [key: string]: unknown }
export interface AutomationMonitorResult {
  policy: AutomationMonitorPolicy
  policyFingerprint: string
  checkedAt: string
  observedAt?: string
  sourceHash?: string
  outcome: 'baseline' | 'no_change' | 'change' | 'data_error'
  important: boolean
  notification: 'eligible' | 'cooldown' | 'quiet'
  reason: string
  evidence?: AutomationMonitorEvidence
  comparisons: { pointer: string; previous?: MonitorValue; reference?: MonitorValue; current: MonitorValue; changed: boolean; significant: boolean; delta?: number }[]
}
export interface AutomationMonitorEvidence { artifactId: string; name: string; publishedAt: string; fileHash: string }
export type AutomationMonitorRead = { observation: unknown; evidence: AutomationMonitorEvidence } | { error: string }
export interface AutomationMonitorCheckpoint {
  id: string
  schemaVersion: 1
  occurrenceId: string
  conversationId: string
  policyFingerprint: string
  checkedAt: string
  observedAt: string
  sourceHash: string
  values: MonitorValue[]
  /** Baseline of the last released important result; muted OS notifications do not change comparison semantics. */
  referenceValues: MonitorValue[]
  lastImportantAt?: string
}

export interface AutomationInput {
  owner?: AutomationOwner
  collaboration?: AutomationCollaboration
  /** Stable creation intent. Retries return the same persisted plan, including after restart. */
  requestId?: string
  id?: string
  expectedRevision?: number
  name: string
  description?: string
  prompt: string
  conversationPolicy?: 'existing-conversation' | 'new-conversation'
  conversationId?: string
  employeeIds?: string[]
  frequency: 'manual' | 'hourly' | 'daily' | 'weekly' | 'monthly'
  startsOn?: string
  dayOfMonth?: number
  time: string
  weekday: number
  daysOfWeek?: number[]
  timezone: string
  enabled: boolean
  notify: boolean
  notificationPolicy?: AutomationNotificationPolicy
  taskKind?: 'report' | 'monitor'
  monitor?: AutomationMonitorPolicy
}

export interface AutomationDefinition extends Omit<AutomationInput, 'id' | 'expectedRevision' | 'requestId'> {
  creationSource?: AutomationCreationSource
  schemaVersion: 1
  id: string
  revision: number
  executionRevision: number
  scheduleGeneration: number
  /** Only a migrated, still-compatible legacy schedule may use this input revision. */
  legacyRevision?: number
  scheduleEffectiveAt: string
  conversationPolicy: 'existing-conversation' | 'new-conversation'
  notificationPolicy: AutomationNotificationPolicy
  cron: string
  authorizedFingerprint: string
  scheduleId?: string
  sync: 'pending' | 'synced' | 'error'
  appliedRevision?: number
  syncedAt?: string
  syncError?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export type OccurrenceStatus = 'admitted' | 'running' | 'waiting_approval' | 'waiting_user' | 'waiting_work' | 'cancelling' | 'completed' | 'failed' | 'skipped' | 'interrupted' | 'needs_review' | 'cancelled'
export type AutomationDeliveryStatus = 'pending' | 'delivered' | 'no_change' | 'partial' | 'blocked' | 'unknown'
export interface AutomationOccurrence {
  /** Minimal trigger receipt retained after history/files were removed. */
  deletedAt?: string
  /** Immutable execution configuration; editing the definition cannot rewrite a running assignment. */
  plan?: AutomationExecutionPlan
  /** Native runs are never constrained by the shared API budget. */
  budgetScope?: 'native' | 'mixed'
  schemaVersion: 1
  id: string
  stateVersion: number
  automationId: string
  /** Unknown for historical native triggers without a product admission record. */
  revision?: number
  executionRevision?: number
  scheduleGeneration?: number
  logicalSlot?: string
  name: string
  source: 'schedule' | 'manual'
  taskKind?: 'report' | 'monitor'
  scheduledFor: string
  admittedAt?: string
  startedAt: string
  finishedAt?: string
  status: OccurrenceStatus
  deliveryStatus: AutomationDeliveryStatus
  reason?: string
  attentionReason?: 'authorization'
  conversationId: string
  messageId?: string
  turnId?: string
  turnIds?: string[]
  waitingTurnIds?: string[]
  workIds?: string[]
  rootWorkIds?: string[]
  cancellationCause?: 'user' | 'budget'
  cancellationRequestedAt?: string
  budgetId?: string
  budget?: { callUnit?: 'external-turn' | 'mixed'; maxModelCalls: number | null; maxRuns: number | null; maxOutputTokens: number | null; deadlineAt?: string; runs: number; exhausted?: boolean; renewals?: BudgetRenewal[] }
  resultEvidence?: { workId: string; resultVersion: number; kind: 'answer' | 'artifact'; reference: string; messageId?: string; artifactId?: string }[]
  runIds: string[]
  resultMessageIds: string[]
  nativeRunId?: string
  nativeTriggerId?: string
  manualRequestId?: string
  /** Legacy receipt only; does not prove OS delivery or that a user read it. */
  notificationDelivered?: boolean
  modelCalls?: number
  usageIncomplete: boolean
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  monitor?: AutomationMonitorResult
}

export interface AutomationOrigin {
  kind: 'automation'
  automationId: string
  occurrenceId: string
  name: string
  authorizedFingerprint: string
}

/** Created with admission, consumed with the message/turn transaction, never replayed on restart. */
export interface AutomationDispatch {
  schemaVersion: 1
  id: string
  requestId: string
  status: 'pending' | 'started' | 'completed' | 'interrupted' | 'failed' | 'cleared'
  definition?: AutomationDefinition
  origin?: AutomationOrigin
  messageId?: string
  turnId?: string
}

export interface AutomationsView {
  definitions: (AutomationDefinition & { nextTimes: string[]; latestOccurrence?: AutomationOccurrence; attentionCount?: number })[]
  occurrences: AutomationOccurrence[]
  attentionCount?: number
  available: boolean
  error?: string
}

export interface AutomationHistoryQuery {
  automationId?: string
  search?: string
  status?: 'all' | 'active' | 'completed' | 'attention'
  attentionOnly?: boolean
  before?: { startedAt: string; id: string }
  limit?: number
}

export const AUTOMATION_ONGOING_STATUSES = ['admitted', 'running', 'waiting_approval', 'waiting_user', 'waiting_work', 'cancelling'] as const

export interface AutomationDraftRequest {
  draftId: string
  version: number
  requestId: string
  connectionId: string
  instruction: string
  timezone: string
}
export interface AutomationDraftResult {
  draftId: string
  version: number
  candidate: Partial<AutomationInput>
  questions: string[]
  unsupported: string[]
  nextTimes: string[]
  usage?: import('./index').ModelUsage
}

export const AUTOMATION_ATTENTION_STATUSES = ['waiting_user', 'waiting_approval', 'failed', 'interrupted', 'needs_review'] as const
/** Current unresolved state, not an unread flag. Ordinary skips and deliberate user stops stay in history. */
export function automationNeedsAttention(o: Pick<AutomationOccurrence, 'status' | 'deliveryStatus' | 'attentionReason' | 'cancellationCause'>) {
  return (AUTOMATION_ATTENTION_STATUSES as readonly string[]).includes(o.status) || o.attentionReason === 'authorization' || o.status === 'cancelled' && o.cancellationCause === 'budget' || o.status === 'completed' && ['blocked', 'partial'].includes(o.deliveryStatus)
}
export interface AutomationHistoryPage {
  occurrences: (AutomationOccurrence & { notices?: AutomationNotice[] })[]
  nextCursor?: { startedAt: string; id: string }
}

/** Local submission receipt only. Never proof of operating-system delivery or user attention. */
export interface AutomationNotice {
  id: string
  automationId: string
  occurrenceId: string
  conversationId?: string
  messageId?: string
  kind: 'result' | 'attention'
  occurrenceStatus: OccurrenceStatus
  deliveryStatus: AutomationDeliveryStatus
  status: 'pending' | 'submitting' | 'submitted' | 'failed' | 'unknown' | 'suppressed'
  createdAt: string
  attemptId?: string
  attemptedAt?: string
  finishedAt?: string
  error?: string
}
export interface AutomationNoticeReceipt {
  id: string
  attemptId: string
  status: 'submitted' | 'failed' | 'unknown'
  error?: string
}
