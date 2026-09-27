import type { AutomationOrigin } from './automations'
export * from './automations'
import type { ExecutionBackend } from './backends'
export * from './backends'
export type Provider = 'openai' | 'anthropic' | 'openai-compatible'
export interface Connection {
  id: string
  name: string
  provider: Provider
  baseUrl: string
  defaultModel: string
  hasApiKey: boolean
}
export interface ConnectionInput {
  id?: string
  name: string
  provider: Provider
  baseUrl: string
  defaultModel: string
  apiKey?: string
}
export interface DigitalAgent {
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
export type AgentInput = Omit<DigitalAgent, 'id' | 'configVersion' | 'workspaceRef' | 'memoryNamespace' | 'policyVersion'> & { id?: string; expectedConfigVersion?: number }
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
export interface Artifact { name: string; path: string; size: number; id?: string; ownerAgentId?: string; runId?: string; sourcePath?: string; publishedAt?: string }
export interface Snapshot {
  agents: DigitalAgent[]
  conversations: Conversation[]
  connections: Connection[]
  resources: Resource[]
  approvals: Approval[]
  dataPath: string
}
export interface ConversationDetail {
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
export interface DiscussionTurn { id: string; conversationId: string; triggerMessageId: string; status: TurnStatus; generation: number; createdAt: string; finishedAt?: string; reason?: string; modelCalls: number; publicMessages: number; tokenEstimate?: number }
export interface AgentDelivery { id: string; turnId: string; conversationId: string; agentId: string; eventId: string; status: 'pending' | 'evaluating' | 'ready' | 'waiting' | 'passed' | 'responding' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'skipped'; observedThroughSequence: number; error?: string; updatedAt: string }
export interface ParticipationDecision {
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
export interface DecisionRecord extends ParticipationDecision { id: string; turnId: string; agentId: string; deliveryId: string; createdAt: string }
export interface Contribution { id: string; turnId: string; agentId: string; key: 'main'; purpose: string; status: 'proposed' | 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'declined'; dependsOn: string[]; resultMessageIds: string[]; artifactIds: string[]; error?: string }
export interface ConversationEvent { id: string; conversationId: string; turnId: string; type: 'user_message' | 'agent_message' | 'handoff' | 'dependency_resolved' | 'stopped'; messageId?: string; agentId?: string; recipientAgentIds?: string[]; createdAt: string }

export type MemoryScope = 'profile' | 'conversation'
export interface MemoryEntry { id: string; ownerAgentId: string; scope: MemoryScope; conversationId?: string; content: string; sourceMessageIds: string[]; sourceResourceIds: string[]; origin: 'model' | 'user' | 'import'; version: number; createdAt: string; updatedAt: string; deletedAt?: string }
export interface MemoryQuery { agentId: string; scope: MemoryScope; conversationId?: string }
export interface MemoryView { entries: MemoryEntry[]; epoch: number; namespace: string }
export interface MemoryCandidate { content: string; sourceMessageIds: string[]; sourceResourceIds?: string[] }
export interface MemoryInput extends MemoryQuery { id?: string; content: string; sourceMessageIds?: string[]; sourceResourceIds?: string[]; expectedEpoch: number; origin?: 'user' | 'import' }
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
