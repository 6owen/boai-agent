/*
 * [INPUT]: Rovai packages/contracts/src/index.ts (referenced declarations) @ f9acc2395283d49f0ce247dc0af2207c155f6eb6 (MIT).
 * [OUTPUT]: 原执行呈现算法与类型，保留上游语义；仅调整本地导入和BOAI接线。
 * [POS]: 直接迁入的Rovai共享模块，来源与许可见LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export interface AgentRunExecutionEvidenceView {
  id: string
  agentRunId: string
  executionEpoch: number
  sequence: number
  operationId?: string | null
  revision?: number | null
  changeSequence?: number | null
  eventType: string
  kind:
    | 'reasoning_summary'
    | 'narration'
    | 'plan'
    | 'step'
    | 'tool_call'
    | 'tool_result'
    | 'command'
    | 'file_change'
  phase: 'started' | 'updated' | 'completed' | 'failed'
  payload: unknown
  contentBlobId: string | null
  contentByteCount: number
  isTruncated: boolean
  /** True only when ordinary Tool output bytes were permanently discarded; absent is historical/unknown. */
  outputTruncated?: boolean | null
  occurredAt: string
  canonical?: CanonicalRuntimeActivityView | null
}

export interface CanonicalRuntimeActivityView {
  operationId: string
  activityDomain: string
  semanticKind: string | null
  toolName: string | null
  presentationHint: string | null
  diffProjection?: CanonicalRuntimeDiffProjectionView | null
  phase: 'started' | 'progress' | 'terminal'
  outcome: 'succeeded' | 'failed' | 'denied' | 'cancelled' | 'not_executed' | 'unsettled' | 'unknown'
  credibility: 'core_verified' | 'runtime_structured' | 'runtime_reported' | 'unknown' | string
  coverageLevel: 'fine_grained' | 'run_level' | 'unknown'
  sourceAuthority: 'core' | 'runtime' | string
  sourceEvidenceIds: string[]
  classifierVersion: string
  firstEvidenceSequence: number
  lastEvidenceSequence: number
  revision: number
}

export interface CanonicalRuntimeDiffProjectionView {
  schemaVersion: 1
  source: 'runtime_reported'
  revision: number
  sourceEvidenceIds: string[]
  status: 'available' | 'unavailable' | 'conflict'
  semanticKind?: 'unified_diff_snapshot' | 'complete_patch_snapshot' | 'exact_mutation' | 'reported_mutation' | 'complete_before_after'
  entries?: CanonicalRuntimeDiffEntryView[]
  safeReasonCode?: string
}

export interface CanonicalRuntimeDiffEntryView {
  path: string
  changeKind: 'add' | 'delete' | 'update'
  additions: number
  deletions: number
  diff: string
}

export interface AgentRunView {
  id: string
  threadTurnId: string | null
  inputMessageIds?: string[]
  anchorMessageId?: string | null
  /** Core-rendered title source, independent of the loaded conversation page. */
  inputSummary?: string | null
  conversationId: string
  agentId: string
  taskId: string | null
  responsibilityKey: string
  responsibilityGeneration: number
  purpose: string
  completionRole: 'required' | 'optional'
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
  waitReason: string | null
  cancelRequestedAt: string | null
  cancelReasonCode: AgentRunCancelReasonCode | null
  cancelAcknowledgedAt: string | null
  terminalResolutionSource: 'runtime_terminal' | null
  terminalReasonCode:
    | 'planned_shutdown_completed'
    | 'planned_shutdown_failed'
    | 'planned_shutdown_cancelled'
    | 'runtime_interrupted'
    | 'agent_unavailable'
    | 'member_away'
    | 'member_removed'
    | 'runtime_not_configured'
    | 'runtime_configuration_invalid'
    | 'runtime_configuration_adapter_mismatch'
    | 'conversation_runtime_override_unsupported'
    | 'adapter_installation_missing'
    | 'adapter_installation_disabled'
    | 'runtime_permission_adapter_mismatch'
    | 'runtime_permission_schema_mismatch'
    | 'runtime_permission_values_invalid'
    | 'runtime_permission_option_unknown'
    | 'runtime_permission_option_unsupported'
    | 'runtime_permission_value_invalid'
    | 'runtime_permission_value_required'
    | 'runtime_model_options_invalid'
    | 'runtime_model_unavailable'
    | 'runtime_model_option_unknown'
    | 'runtime_model_option_invalid'
    | 'runtime_adapter_not_implemented'
    | null
  failure: RuntimeFailureView | null
  runtimeModel: { modelId: string | null } | null
  executionEpoch: number
  permissionSemantics: 'core_enforced_v1' | 'runtime_managed_v2'
  invocationKind: 'direct' | 'a2a' | 'gather_completion' | 'single_chat' | 'batch'
  triggerDeliveryGeneration: number
  a2aParentAgentRunId: string | null
  a2aRootAgentRunId: string | null
  a2aDepth: number
  executionEvidenceCount: number
  executionEvidenceChangeSequence: number
  hasUnsettledExternalEffects: boolean
  workspace: {
    path: string
  } | null
  startingGitObservation: GitObservation | null
  endingGitObservation: GitObservation | null
  version: number
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  updatedAt: string
}

export type AgentRunCancelReasonCode =
  | 'camp_turn_cancelled'
  | 'execution_budget_exhausted'
  | 'user_requested_agent_run_stop'
  | 'single_chat_ended'

export interface RuntimeFailureView {
  runtimeKind: AdapterKind
  origin: RuntimeFailureOrigin
  phase: RuntimeFailurePhase
  code: string
  summary: string
  detail: string | null
  retryable: boolean
}

export type AdapterKind =
  | 'codex-cli'
  | 'pi'
  | 'opencode-cli'
  | 'copilot-cli'
  | 'claude-code-cli'
  | 'kiro-cli'
  | 'qoder-cli'
  | 'codebuddy-cli'
  | 'qwen-code'
  | 'trae-cn-cli'
  | 'cursor-agent'
  | 'kimi-code-cli'
  | 'grok-build'
  | 'zcode-app'
  | 'deepseek-harness'
  | 'cline-cli'
  | 'command-code-cli'
  | 'antigravity-app'

export type RuntimeFailureOrigin =
  | 'runtime'
  | 'compatibility'
  | 'environment'
  | 'rovai'
  | 'unknown'

export type RuntimeFailurePhase =
  | 'spawn'
  | 'authentication'
  | 'model_catalog'
  | 'execution'
  | 'terminal'

export interface GitObservation {
  state: GitCapabilityState
  repositoryRoot: string | null
  gitCommonDir: string | null
  objectFormat: 'sha1' | 'sha256' | null
  headCommit: string | null
  branch: string | null
  dirty: boolean | null
  observedAt: string
  diagnostic?: string
}

export type GitCapabilityState = 'not_git' | 'git_valid' | 'git_invalid'

export interface CoreEvent<T = unknown> {
  method: string
  params: T
}

export interface NavigationThreadItem {
  id: string
  title: string
  channelSource?: ThreadChannelSource | null
  activationState: ThreadActivationState
  projectBindingKind: ProjectBindingKind
  projectPath: string
  defaultLead: { agentId: string; displayName: string } | null
  marker: NavigationThreadMarker
  lastActivityAt: string
  lastActivityGlobalSequence: number
  latestCompletionGlobalSequence: number
  /** Saved read boundary; older clients/fixtures may omit it. */
  lastSeenGlobalSequence?: number
  version: number
}

export type ThreadChannelSource =
  | { provider: 'feishu' | 'lark'; conversationKind: 'p2p' | 'group' | 'topic' }
  | { provider: 'dingtalk'; conversationKind: 'p2p' | 'group' }

export type ThreadActivationState = 'pending' | 'active'

export type ProjectBindingKind = 'quick_chat' | 'directory'

export type NavigationThreadMarker = 'loading' | 'unread_completed' | 'none'

export interface NavigationSnapshot {
  schemaVersion: 3
  throughGlobalSequence: number
  quickChat: NavigationThreadGroup
  projects: ProjectNavigationGroup[]
}

export interface NavigationThreadGroup {
  totalCount: number
  recentThreads: NavigationThreadItem[]
}

export interface ProjectNavigationGroup {
  projectKey: string
  name: string
  projectPath: string
  lastActivityAt: string
  lastActivityGlobalSequence: number
  totalCount: number
  recentThreads: NavigationThreadItem[]
}

export interface AgentRunExecutionBlock {
  key: string
  kind: 'item' | 'toolGroup'
  sequence: number
  lastSequence: number
  changeSequence: number
  toolCount: number
  counts: Record<'completed' | 'failed' | 'stopped' | 'recorded' | 'running' | 'waiting', number>
  /** One root item, or latest/active operations with their proven Shell supports (at most four rows). */
  evidence: AgentRunExecutionEvidenceView[]
}

export interface AgentRunExecutionWindowPage {
  schemaVersion: 2
  threadId: string
  agentRunId: string
  requestedBeforeSequence: number | null
  requestedAfterSequence?: number | null
  nextAfterSequence?: number | null
  nextBeforeSequence: number | null
  throughSequence: number
  throughChangeSequence: number
  runtimePhase?: 'thinking' | 'executing'
  /** Ephemeral native short title; never a reasoning body or historical evidence. */
  runtimeThinkingTitle?: string | null
  hasMore: boolean
  /** Unfinished operations older than the first page remain visible, outside the cursor. */
  activeEvidence?: AgentRunExecutionEvidenceView[]
  /** Commands contain display metadata; isTruncated marks deferred payload/diff, not lost Tool output. */
  evidence: AgentRunExecutionEvidenceView[]
}

export interface AgentRunExecutionWindowChanges {
  schemaVersion: 2
  threadId: string
  agentRunId: string
  requestedAfterChangeSequence: number
  nextAfterChangeSequence: number
  throughSequence: number
  throughChangeSequence: number
  runtimePhase?: 'thinking' | 'executing'
  /** Ephemeral native short title; never a reasoning body or historical evidence. */
  runtimeThinkingTitle?: string | null
  hasMore: boolean
  evidence: AgentRunExecutionEvidenceView[]
  /** In-place updates of previously loaded, unfinished evidence (including text). */
  refreshedEvidence: AgentRunExecutionEvidenceView[]
}

export interface AgentRunExecutionBlockPage extends Omit<AgentRunExecutionWindowPage, 'schemaVersion' | 'evidence' | 'activeEvidence'> {
  schemaVersion: 3
  blocks: AgentRunExecutionBlock[]
  activeBlocks?: AgentRunExecutionBlock[]
}

export interface AgentRunExecutionBlockChanges extends Omit<AgentRunExecutionWindowChanges, 'schemaVersion' | 'evidence' | 'refreshedEvidence'> {
  schemaVersion: 3
  blocks: AgentRunExecutionBlock[]
  /** Watched in-memory text may grow without advancing the durable change cursor. */
  refreshedBlocks?: AgentRunExecutionBlock[]
}
