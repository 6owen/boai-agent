/*
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 本机交互预算/请求固定原消息来源及external-turn计量，判断/执行/记忆共账本；保留旧字段兼容，不冒充内部逐模型限额。
 * [INPUT]: 用户请求、员工工作意图、执行权与可检查结果。
 * [OUTPUT]: 新宿主授权完整群协作首次固定48次共用调用，其他及追加方案保留24；原保存预算不升级，输出/运行/事项/绝对期限不变。
 * [OUTPUT]: bobo 组织合同/真实组织证据与独立群根共原预算；启动意图唯一消费；非自动化逐调用账本和清理去重；明确用户问题与公开结果绑定，依赖等待保持独立，补充沿原工作/预算；宿主修订请求绑定新根工作并由子工作继承来源身份；材料来源约束工作正文与父子继承；显式追加额度的固定方案与前后限额/累计用量回执；版本化父子工作、依赖、共享预算/调用账本及私有汇报合同。
 * [POS]: 协作工作领域；独立于历史 Contribution 和单次 AgentRun。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ModelUsage } from './index'
import type { AutomationOrigin } from './automations'
import type { MaterialReadRef } from './materials'
import type { PublishedUserQuestion } from './inbox'

/** Explicit source key identifies shared work; purpose text and employee identity do not. */
export interface WorkIntent {
  key: string
  scope: string
  deliverable: string
  workId?: string
  expectedVersion?: number
  /** Model judgment only; request identity and authorization are assigned by the host. */
  organization?: { mode: BoboOrganizationMode; goal: string }
}
export type BoboOrganizationMode = 'employee_creation' | 'organize_only' | 'organize_and_execute'
export interface WorkOrganization { requestId: string; mode: BoboOrganizationMode; goal: string }
export interface CollaborationStartIntent {
  id: string; schemaVersion: 1; requestId: string; operationId: string
  groupConversationId: string; announcementMessageId: string; announcementHash: string
  groupRootWorkId: string; rootWorkVersion: number; budgetId: string
  status: 'pending' | 'consumed' | 'interrupted' | 'blocked' | 'cancelled'
  turnId?: string; createdAt: string; consumedAt?: string; reason?: string
}
export type WorkDisposition = 'delivered' | 'progress' | 'waiting' | 'blocked' | 'no_progress'
export interface WorkOutcome {
  /** Explicit question, quoted in this publication; dependency waiting is a separate protocol. */
  userQuestion?: string
  disposition: WorkDisposition
  summary: string
  evidence?: { kind: 'answer' | 'artifact' | 'collaboration'; reference: string }[]
}
export interface WorkDraft {
  text: string
  observedThroughSequence: number
  revisions: number
  status: 'private' | 'published' | 'withheld'
  reason?: string
}
export interface WorkReport {
  action: 'publish' | 'discard'
  text?: string
  outcome?: WorkOutcome
}
export interface WorkDependency { workId: string; resultVersion: number }
export interface WorkWait { dependencies: WorkDependency[]; nextStep: string }
export interface WorkDelegation {
  key: string
  scope: string
  deliverable: string
  ownerAgentId: string
  dependencies?: WorkDependency[]
}
export interface WorkWake {
  collaborationRequestId?: string
  origin?: AutomationOrigin
  id: string
  workId: string
  conversationId: string
  ownerAgentId: string
  waitRevision: number
  requiredResults: WorkDependency[]
  kind: 'assigned' | 'ready' | 'blocked'
  status: 'pending' | 'scheduled' | 'consumed' | 'interrupted' | 'cancelled'
  sourceRunId: string
  sourceAgentId: string
  turnId?: string
  reason?: string
  createdAt: string
}
export interface WorkItem {
  organization?: WorkOrganization
  /** Shared budget authority, never a cross-conversation parent relation. */
  collaborationRequestId?: string
  userQuestion?: PublishedUserQuestion
  /** Host-accepted revision source; children inherit it without acquiring replacement publication rights. */
  revisionRequestId?: string
  materialSources?: MaterialReadRef[]
  origin?: AutomationOrigin
  schemaVersion: 2
  id: string
  conversationId: string
  sourceMessageId: string
  key: string
  scope: string
  deliverable: string
  ownerAgentId: string
  activeRunId?: string
  version: number
  status: 'ready' | 'running' | 'delivered' | 'waiting' | 'blocked' | 'failed' | 'cancelled' | 'interrupted'
  budgetId: string
  rootWorkId: string
  parentWorkId?: string
  dependsOnWorkIds: string[]
  requiredResults: WorkDependency[]
  observedResults: WorkDependency[]
  waitRevision: number
  nextStep?: string
  wakeId?: string
  outcome?: WorkOutcome
  resultMessageIds: string[]
  artifactIds: string[]
  resultVersion: number
  requiresReview: boolean
  cancellationCause?: 'user' | 'budget'
  createdAt: string
  updatedAt: string
}
export interface WorkBudget {
  /** Original interactive request; unlike an occurrence or organized collaboration. */
  sourceMessageId?: string
  /** Legacy field names remain compatible; native Codex counts host turns, never internal model steps. */
  callUnit?: 'external-turn' | 'mixed'
  collaborationRequestId?: string
  renewals?: BudgetRenewal[]
  origin?: AutomationOrigin
  conversationId?: string
  accounting?: 'model-calls-v1'
  unknownCalls?: number
  id: string
  schemaVersion: 1
  modelCalls: number
  runs: number
  maxModelCalls: number
  maxRuns: number
  maxOutputTokens: number
  deadlineAt: string
  usage: ModelUsage
  usageIncomplete: boolean
  workItems: number
  retries: number
  reportRefreshes: number
  noProgress: number
  maxWorkItems: number
  maxRetries: number
  maxReportRefreshes: number
  maxNoProgress: number
}
/** User-confirmed addition; cumulative counters and earlier allowances are never reset. */
export const WORK_BUDGET_ALLOWANCE = { durationMs: 5 * 60_000, modelCalls: 24, runs: 8, outputTokens: 16000, workItems: 8, retries: 3, reportRefreshes: 4, noProgress: 3 } as const
/** Only the first host-authorized organize_and_execute budget; persisted budgets and renewals keep their original limits. */
export const BOBO_COLLABORATION_INITIAL_MODEL_CALLS = 48
export type WorkBudgetLimits = Pick<WorkBudget, 'maxModelCalls' | 'maxRuns' | 'maxOutputTokens' | 'maxWorkItems' | 'maxRetries' | 'maxReportRefreshes' | 'maxNoProgress' | 'deadlineAt'>
export interface BudgetRenewal {
  id: string
  previousId?: string
  requestId: string
  messageId: string
  turnId: string
  createdAt: string
  before: WorkBudgetLimits
  after: WorkBudgetLimits
  used: Pick<WorkBudget, 'modelCalls' | 'runs' | 'usage' | 'usageIncomplete' | 'unknownCalls' | 'workItems' | 'retries' | 'reportRefreshes' | 'noProgress'>
  previousStatus: string
  previousReason?: string
  cancellationRequestedAt?: string
  workVersions: { id: string; version: number; status: WorkItem['status'] }[]
}
export interface BudgetModelCall {
  sourceMessageId?: string
  callUnit?: 'external-turn'
  id: string
  budgetId: string
  conversationId: string
  origin?: AutomationOrigin
  collaborationRequestId?: string
  workId?: string
  agentId?: string
  runId: string
  turnId: string
  phase: 'decision' | 'execution' | 'memory' | 'report' | 'coordination'
  usage: ModelUsage
  usageComplete: boolean
  reservedAt: string
  settledAt?: string
}
/** Cleared private call identities cannot be reserved or settled again. Counters stay on the shared budget. */
export interface ClearedBudgetModelCall { id: string; budgetId: string; status: 'cleared'; requestHash: string }
export interface WorkExecution {
  callUnit?: 'external-turn'
  origin?: AutomationOrigin
  id: string
  workId: string
  budgetId: string
  agentId: string
  claimVersion: number
  modelCalls: number
  usage: ModelUsage
  status: 'active' | 'released'
  pendingWait?: WorkWait
  pendingEffects?: number
  /** Explicit audited file continuation; the original tool source is not rewritten. */
  organizationRecoveryFrom?: string
}
