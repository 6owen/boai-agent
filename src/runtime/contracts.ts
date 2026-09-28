/*
 * [INPUT]: 共享工作/产品合同、协作投递引用和授权执行环境。
 * [OUTPUT]: 统一连接容量/成员判断时限、工作上下文、已声明等待、结果/副作用回调、无工具重新汇报与私有凭据接口。
 * [POS]: runtime 内部合同，不向 renderer 暴露凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RunEnvironmentPlan } from './modules/workspaces/environment-plan'
import type { Artifact, DigitalAgent, Connection, Conversation, Message, Resource, BootstrapSnapshot, MemoryView, SessionWorkspace, ParticipationDecision, Contribution, ConversationEvent, ModelUsage, ToolEvent, MemoryCandidate, WorkItem, WorkOutcome, WorkDraft, WorkReport, WorkDelegation, WorkWait } from '../shared/domain'

// The host and adapter share one phase budget, including the bounded JSON repair.
export const PARTICIPATION_TIMEOUT_MS = 30_000
export const DEFAULT_MODEL_CAPACITY = 6

// Only the host and runtime know secrets. These values never enter a renderer snapshot.
export interface SecretStore {
  get(connectionId: string): Promise<string | undefined>
  set(connectionId: string, value: string): Promise<void>
  delete(connectionId: string): Promise<void>
}
export interface EngineContext {
  agent: DigitalAgent
  connection: Connection
  apiKey: string
  conversation: Conversation
  messages: Message[]
  resources: Resource[]
  runId: string
  signal: AbortSignal
  bootstrap?: BootstrapSnapshot
  memory?: MemoryView
  workspace?: SessionWorkspace
  environment?: RunEnvironmentPlan
  responseKind?: 'chat' | 'task'
  decision?: ParticipationDecision
  members?: DigitalAgent[]
  contributions?: Contribution[]
  workItems?: WorkItem[]
  work?: WorkItem
  /** Waiting declared by this execution, retained when its private report is revised. */
  pendingWorkWait?: WorkWait
  completedWorkTools?: { runId: string; tools: ToolEvent[] }[]
  onWorkOutcome?(outcome: WorkOutcome): Promise<void>
  beforeEffect?(): Promise<void>
  afterEffect?(): Promise<void>
  delegateWork?(input: WorkDelegation): Promise<WorkItem>
  waitForWork?(input: WorkWait): Promise<void>
  triggerMessageId?: string
  turnId?: string
  participation?: { isFirstDecision: boolean; hasRespondedInTurn: boolean; triggerEventType: ConversationEvent['type']; eventMessageId?: string; observedThroughSequence: number; sourceEventIds?: string[] }
  /** Reserve another model request beyond this phase's already reserved first request. */
  onAdditionalModelCall?(): Promise<void>
  onArtifact?(artifact: Artifact): Promise<void>
  onUsage?(usage: ModelUsage): Promise<void>
  onDelta(text: string): Promise<void>
  onTool(event: ToolEvent): Promise<void>
  approveCommand(command: string, cwd: string): Promise<boolean>
}
export interface AgentEngine {
  run(context: EngineContext): Promise<void>
  report?(context: EngineContext, draft: WorkDraft): Promise<WorkReport>
  decide?(context: EngineContext): Promise<ParticipationDecision>
  extractMemory?(context: EngineContext): Promise<MemoryCandidate[]>
  plan?(context: Omit<EngineContext, 'onDelta' | 'onTool' | 'approveCommand'>, members: DigitalAgent[]): Promise<string[]>
  test(connection: Connection, apiKey: string): Promise<string>
}
