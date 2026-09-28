/*
 * [INPUT]: 用户请求、员工工作意图、执行权与可检查结果。
 * [OUTPUT]: 版本化父子工作、显式依赖/定向通知、根预算与私有汇报合同。
 * [POS]: 协作工作领域；独立于历史 Contribution 和单次 AgentRun。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ModelUsage } from './index'

/** Explicit source key identifies shared work; purpose text and employee identity do not. */
export interface WorkIntent {
  key: string
  scope: string
  deliverable: string
  workId?: string
  expectedVersion?: number
}
export type WorkDisposition = 'delivered' | 'progress' | 'waiting' | 'blocked' | 'no_progress'
export interface WorkOutcome {
  disposition: WorkDisposition
  summary: string
  evidence?: { kind: 'answer' | 'artifact'; reference: string }[]
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
  createdAt: string
  updatedAt: string
}
export interface WorkBudget {
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
export interface WorkExecution {
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
}
