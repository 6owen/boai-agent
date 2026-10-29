/*
 * [OUTPUT]: 2026-10-11 原生完整执行和只读后工作区hash纳入评分输入及样本身份；旧无此字段样本hash保持。
 * [INPUT]: 版本化业务题、固定素材、公开运行记录与外部评审。
 * [OUTPUT]: SG-v1支持明确员工职责与组长交付/异常检查，旧样本合同保持。
 * [OUTPUT]: 员工输入和评分侧答案分离的数据合同、事件脚本及可重评分记录；可选独立版本 MD-v1 交付证据保留旧样本合同。
 * [POS]: tests/evaluation/schema.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Artifact, ConversationDetail } from '../../packages/shared/src/domain'
import type { MaterialDeliveryContract, MaterialDeliveryEvidence } from './material-delivery'
export const DATASET_VERSION = 'boai-team-2026-09-28-v1'
export const SCORER_VERSION = 'boai-team-checks-v1'
export type CheckSpec =
  | { kind: 'first-opportunity' } | { kind: 'no-tools'; allowed?: string[] } | { kind: 'no-work' } | { kind: 'no-replies' } | { kind: 'delegation' } | { kind: 'review-lineage' }
  | { kind: 'only-member'; member: number }
  | { kind: 'artifact'; name: string; member?: number; contains?: string[] }
  | { kind: 'json-fields'; name: string; fields: Record<string, string | number | boolean | string[]>; tolerance?: number }
  | { kind: 'text-pattern'; pattern: string }
  | { kind: 'event-hit'; id: string }
  | { kind: 'material-delivery' }
  | { kind: 'group-supervision'; exportConflict: boolean }
export interface EventScript {
  id: string
  when: 'public-message' | 'tool-completed' | 'child-output'
  tool?: string
  action: 'user-message' | 'cancel' | 'remove-member' | 'replace-child-output'
  content?: string
  member?: number
}
export interface EvaluationCase {
  id: string; matrixId: string; members: number; prompt: string; mention?: number; seed?: string; criterion: string
  split: 'regression' | 'development' | 'holdout'; cluster: string; category: string
  roles?: [string, string][]; memberInstructions?: string[]; files?: { path: string; content: string }[]; events?: EventScript[]
  checks: CheckSpec[]; semantic: string[]; timeoutMs?: number; maxRequests?: number; executionTimeoutMs?: number | null
  source?: string; comparableSingle?: boolean
  delivery?: MaterialDeliveryContract
}
export interface ArtifactEvidence extends Artifact { content?: string; sha256?: string; bytes?: number; complete?: boolean; captureError?: string }
export interface EventEvidence { id: string; action: string; at: number; trigger: string; status: 'applied' | 'failed'; error?: string }
export interface EvaluationRecord {
  caseId: string; prompt: string; criterion?: string; seed?: string; startedAt: number; sentAt: number; elapsedMs: number
  scenario?: EvaluationCase; datasetVersion?: string; error?: string; runtimeErrors: string[]
  metadata: { label: string; revision: string; sourceHashes: Record<string, string>; model: string; provider: string; members: { id: string; name: string; role: string; instructions?: string }[]; promptHash?: string; datasetHash?: string; modelSignature?: string; team?: 'single' | 'multi'; requestLimit?: number }
  detail?: ConversationDetail; artifacts: ArtifactEvidence[]; events?: EventEvidence[]
  fixtureFiles?: { agentId: string; path: string; expectedHash: string; actualHash?: string; error?: string }[]
  nativeEvidence?: { items: import('../../packages/shared/src/domain/execution').ExecutionEvidence[]; completeRunIds: string[]; sourceFiles: { label: string; sha256: string; contentHashMatched: boolean }[] }
  delivery?: MaterialDeliveryEvidence
  phases?: { phase: string; agentId: string; runId: string; startAt: number; endAt?: number }[]
  emitted?: { id: string; at: number; content: string; status: string }[]
  requests: { startedAt: number; phase: string; runId: string; status?: number; error?: string }[]
  metrics?: { firstVisibleReplyMs?: number | null; usage?: { reported: { totalTokens?: number }; totalRuns: number; runsReportingEachField: Record<string, number> }; [key: string]: unknown }
}
export interface ExternalReview {
  caseId: string; sampleHash: string; scorerVersion: string; source: 'human' | 'model-assisted'; reviewer: string
  criteria: { criterion: string; score: 0 | 1 | 2; evidence: string[]; reason: string }[]
}
export interface CheckResult { name: string; status: 'passed' | 'failed' | 'incomplete'; evidence: string[]; reason: string }
export interface EvaluationScore {
  caseId: string; matrixId: string; category: string; cluster: string; split: string; scorerVersion: string; sampleHash: string
  executionStatus: 'completed' | 'failed' | 'incomplete'; hardChecks: CheckResult[]
  goalVerdict: 'passed' | 'failed' | 'incomplete' | 'review-needed'; judgeStatus: 'not-required' | 'pending' | 'human' | 'model-assisted' | 'invalid'
  verdict: 'passed' | 'failed' | 'incomplete' | 'review-needed'; runtimeErrors: string[]
  firstReplyMs: number | null; lastReplyMs: number | null; turnCompletedMs: number | null; totalMs: number
  providerRequests: number; totalTokens: number | null; usageCoverage: number | null; decisionRuns: number; supersededDecisions: number
}
