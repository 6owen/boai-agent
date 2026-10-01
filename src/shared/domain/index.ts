/*
 * [INPUT]: 产品实体、成果内容版本/修订与采用合同、受管材料/来源、持久工作/预算、协作投递/模型耗时、自动化、执行后端及员工头像合同。
 * [OUTPUT]: Trace 可选有界当前来源 trigger 摘要投影；D6 无正文详情的即时来源证据布尔投影，不作为持久交付或人工质量批准；导出只读待处理合同、已发布问题关系及宿主定向补充消息身份；明确成果内容版本/修订和采用导出、用户修订消息身份；可选消息材料关联、消息/成果派生材料来源和会话材料列表；预置系统核心员工标识与独立 core 会话类别；统一记忆合同导出及会话记忆范围；员工/群可选团队来源与群 teamSetup 背景合同； 个人资料快照和独立活动保存错误；消息可选持久表情回应；宿主确认的失败轮次/运行接续关联；仅由宿主保存的任务聊天 purpose/计划/触发关联；宿主写入跨轮次补充关联；自动化来源贯穿轮次与运行； 导出技能集合/预览/操作合同；运行观测错误独立于业务终态；员工独立思考强度及保留本地配置来源、OpenAI 接口协议的模型连接、并行发布的投递观察事件与跨进程领域类型、兼容旧记录的会话列表偏好；版本化工作/依赖/定向通知与可选运行关联兼容已有记录。
 * [POS]: shared/domain 的产品领域合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { LocalUserProfile } from './profile'
import type { MemoryContextRef } from './memory'
import type { ConversationMaterial, MaterialReadRef } from './materials'
import type { ArtifactExtension } from './artifacts'
import type { InboxReplyRelation, PublishedUserQuestion } from './inbox'
export * from './inbox'
export * from './artifacts'
export * from './materials'
export * from './memory'
import type { TeamCreationSource, TeamSetup } from './team-creation'
import type { AgentAvatar } from './avatars'
import type { MessageReaction } from './message-reactions'
export * from './skills'
import type { ThinkingLevel } from './model-preferences'
import type { AutomationOrigin } from './automations'
export * from './automations'
import type { ExecutionBackend } from './backends'
export * from './backends'
export * from './work'
import type { WorkIntent, WorkItem, WorkBudget, WorkDisposition, WorkDraft, WorkWake } from './work'
export type Provider = 'openai' | 'anthropic' | 'openai-compatible'
export interface Connection {
  api?: 'chat' | 'responses'
  localConfigId?: string
  id: string
  name: string
  provider: Provider
  baseUrl: string
  defaultModel: string
  hasApiKey: boolean
}
export interface ConnectionInput {
  api?: 'chat' | 'responses'
  localConfigId?: string
  id?: string
  name: string
  provider: Provider
  baseUrl: string
  defaultModel: string
  apiKey?: string
}
export interface DigitalAgent {
  systemRole?: 'core'
  creationSource?: TeamCreationSource
  thinkingLevel?: ThinkingLevel
  avatar?: AgentAvatar
  executionBackend?: ExecutionBackend
  id: string
  name: string
  role: string
  instructions: string
  color: string
  connectionId: string
  modelId: string
  skillIds: string[]
  knowledgeIds: string[]
  allowCommands: boolean
  active: boolean
  configVersion: number
  workspaceRef?: string
  memoryNamespace?: string
  policyVersion?: number
}
export type AgentInput = Omit<DigitalAgent, 'id' | 'configVersion' | 'workspaceRef' | 'memoryNamespace' | 'policyVersion' | 'creationSource' | 'systemRole'> & { id?: string; expectedConfigVersion?: number }
export interface Resource {
  id: string
  kind: 'skill' | 'knowledge'
  name: string
  description: string
  path: string
  createdAt: string
  ownerAgentId?: string
}
export interface Conversation {
  memoryContextRef?: MemoryContextRef
  memoryScope?: 'employee' | 'conversation'
  creationSource?: TeamCreationSource
  teamSetup?: TeamSetup
  purpose?: 'personal' | 'automation' | 'core'
  automationId?: string
  occurrenceId?: string
  list?: { hidden?: boolean; pinned?: boolean; order?: number }
  id: string
  kind: 'direct' | 'group'
  title: string
  agentIds: string[]
  mode: 'natural' | 'mention' | 'coordinator'
  workspacePath: string
  sharedKnowledgeIds: string[]
  createdAt: string
  updatedAt: string
  lastMessagePreview?: string
  lastMessageAt?: string
  activity?: 'idle' | 'running' | 'waiting_approval' | 'queued' | 'failed'
  configVersion?: number
}
export interface ConversationInput {
  memoryContextRef?: MemoryContextRef | null
  memoryScope?: 'employee' | 'conversation'
  teamSetup?: TeamSetup | null
  id?: string
  kind: 'direct' | 'group'
  title: string
  agentIds: string[]
  mode?: 'natural' | 'mention' | 'coordinator'
  sharedKnowledgeIds?: string[]
  expectedConfigVersion?: number
}
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface Message {
  inboxReply?: InboxReplyRelation
  artifactRevisionRequestId?: string
  materialIds?: string[]
  materialSources?: MaterialReadRef[]
  reactions?: MessageReaction[]
  origin?: AutomationOrigin
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  senderId: string
  senderName: string
  content: string
  status: 'streaming' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  sequence: number
  runId?: string
  turnId?: string
  mentionIds?: string[]
  replyToMessageId?: string
  createdAt: string
}
export interface ToolEvent {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  detail: string
  createdAt: string
}
export interface AgentRun {
  origin?: AutomationOrigin
  traceError?: string
  activityError?: string
  taskQueueMs?: number
  draft?: WorkDraft
  workId?: string
  workVersion?: number
  disposition?: WorkDisposition
  timing?: { queueMs: number; executionMs: number; backoffMs: number; rateLimitRetries: number }
  failureKind?: 'unsupported' | 'auth_required' | 'input_required' | 'budget_exhausted' | 'transport'
  backend?: { program?: {name:string;version:string;executableHash:string}; sessionId?:string; kind: 'acp-local'; profileId: string; profileRevision: number; externalInvocations: number; sessionPolicy: 'fresh'; toolControl: 'external' }
  id: string
  phase?: 'coordination' | 'decision' | 'execution' | 'memory'
  turnId?: string
  responseKind?: 'chat' | 'task'
  bootstrap?: BootstrapSnapshot
  environment?: RunEnvironmentSummary
  usage?: ModelUsage
  conversationId: string
  agentId: string
  agentName: string
  triggerMessageId: string
  messageId: string
  status: RunStatus
  error?: string
  createdAt: string
  finishedAt?: string
  toolEvents: ToolEvent[]
}
export interface Approval {
  id: string
  runId: string
  conversationId: string
  agentName: string
  command: string
  cwd: string
}
export interface Artifact extends ArtifactExtension { materialSources?: MaterialReadRef[]; name: string; path: string; size: number; id?: string; ownerAgentId?: string; runId?: string; sourcePath?: string; publishedAt?: string }
export interface Snapshot {
  userProfile?: LocalUserProfile
  agents: DigitalAgent[]
  conversations: Conversation[]
  connections: Connection[]
  resources: Resource[]
  approvals: Approval[]
  dataPath: string
}
export interface ConversationDetail {
  /** Ephemeral host source checks; never a saved delivery or human quality approval. */
  workEvidenceVerified?: Record<string, boolean>
  /** Optional bounded, source-checked trigger excerpts for execution round selection. */
  triggerSummaries?: Record<string, string>
  materials?: ConversationMaterial[]
  workItems?: WorkItem[]
  workBudgets?: WorkBudget[]
  workWakes?: WorkWake[]
  conversation: Conversation
  messages: Message[]
  runs: AgentRun[]
  artifacts: Artifact[]
  turns?: DiscussionTurn[]
  deliveries?: AgentDelivery[]
  decisions?: DecisionRecord[]
  unresolvedFailureDeliveryIds?: string[]
  contributions?: Contribution[]
  events?: ConversationEvent[]
}

export type TurnStatus = 'queued' | 'evaluating' | 'responding' | 'executing' | 'waiting_user' | 'completed' | 'cancelled' | 'failed' | 'interrupted' | 'budget_exhausted'
export interface DiscussionTurn { origin?: AutomationOrigin; replyToTurnIds?: string[]; resumesTurnIds?: string[]; resumesRunIds?: string[]; id: string; conversationId: string; triggerMessageId: string; workId?: string; wakeId?: string; status: TurnStatus; generation: number; createdAt: string; finishedAt?: string; reason?: string; modelCalls: number; publicMessages: number; tokenEstimate?: number }
export interface AgentDelivery { observedEventId?: string; id: string; turnId: string; conversationId: string; agentId: string; eventId: string; eventIds?: string[]; supersededByDeliveryId?: string; status: 'pending' | 'evaluating' | 'ready' | 'waiting' | 'passed' | 'responding' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'skipped'; observedThroughSequence: number; error?: string; updatedAt: string }
export interface ParticipationDecision {
  work?: WorkIntent
  action: 'reply' | 'pass' | 'wait' | 'ask' | 'request_handoff'
  responseKind?: 'chat' | 'task'
  replyToMessageId?: string
  recipientAgentIds?: string[]
  purpose?: string
  dependencyMessageIds?: string[]
  proposedContribution?: { key: 'main'; purpose: string }
  dependsOnContributions?: { agentId: string; key: 'main' }[]
  observedThroughSequence: number
}
export interface DecisionRecord extends ParticipationDecision { userQuestion?: PublishedUserQuestion; id: string; turnId: string; agentId: string; deliveryId: string; createdAt: string }
export interface Contribution { id: string; turnId: string; agentId: string; key: 'main'; purpose: string; status: 'proposed' | 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'declined'; dependsOn: string[]; resultMessageIds: string[]; artifactIds: string[]; error?: string }
export interface ConversationEvent { id: string; conversationId: string; turnId: string; type: 'user_message' | 'agent_message' | 'handoff' | 'dependency_resolved' | 'work_ready' | 'stopped'; work?: WorkIntent; messageId?: string; agentId?: string; recipientAgentIds?: string[]; createdAt: string }

export interface BootstrapSnapshot { instructions: string; hashes: Record<string, string>; configVersion: number; memoryVersion: number; policyVersion: number; sources: string[] }
export interface AgentFile { name: string; purpose: string; kind: 'source' | 'generated'; path: string; hash: string; status: 'current' | 'modified' | 'missing' | 'invalid'; error?: string }
export interface AgentFileContent extends AgentFile { content: string }
export interface AgentHome { environment?: EmployeeEnvironmentStatus; agentId: string; workspacePath: string; sessionPath?: string; memoryNamespace: string; configVersion: number; files: AgentFile[] }
export interface SessionWorkspace { root: string; workPath: string; runPath: string; sharedPath: string }
export interface ModelUsage { inputTokens?: number; outputTokens?: number; totalTokens?: number }

/** Additive S1 diagnostics; no credentials or SDK objects cross IPC. */
export interface SkillReadiness { resourceId: string; name: string; instructions: 'available' | 'invalid'; execution: 'not_checked' | 'disabled'; detail: string; contentHash?: string }
export interface EmployeeEnvironmentStatus { version: 1; isolation: 'application'; commandMode: 'disabled' | 'host-approved'; skills: SkillReadiness[] }
export interface RunEnvironmentSummary { version: 1; agentId: string; conversationId: string; runId: string; configVersion: number; policyVersion: number; isolation: 'application'; commandMode: 'disabled' | 'host-approved'; policyHash: string; resourceVersions: { id: string; hash: string }[] }
