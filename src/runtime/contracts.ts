/*
 * [INPUT]: 共享工作/产品合同、协作投递引用和授权执行环境。
 * [OUTPUT]: 逐模型调用开始/实际思考强度和原生技能激活观察；无工具的定时任务草稿模型接口与原始用量回调；明确预算接续与被接替判断的宿主上下文；明确补充对应的原始请求/提问上下文合同；唯一模型请求身份与逐调用用量回执；原生 Trace 保存/观测错误、统一容量/判断时限、工作上下文及结果/副作用和无工具汇报接口。
 * [POS]: runtime 内部合同，不向 renderer 暴露凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RunEnvironmentPlan } from './modules/workspaces/environment-plan'
import type { TraceSpan } from '../shared/domain/traces'
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
  /** Host-committed answer to this occurrence's previous questions; IDs refer to authorized messages/turns. */
  continuation?: { originalRequestId: string; replyToTurnIds: string[]; resumesTurnIds?: string[]; resumesRunIds?: string[] }
  participation?: { isFirstDecision: boolean; hasRespondedInTurn: boolean; triggerEventType: ConversationEvent['type']; eventMessageId?: string; observedThroughSequence: number; sourceEventIds?: string[] }
  /** Reserve another model request beyond this phase's already reserved first request. */
  onAdditionalModelCall?(phase?: 'report'): Promise<string | void>
  /** Host reservation for this adapter invocation's first request. */
  modelCallId?: string
  onModelCallStarted?(callId: string, phase: 'chat' | 'task' | 'decision' | 'memory' | 'report', thinking?: string): Promise<void>
  onSkillActivated?(toolCallId: string, skill: { id: string; name: string }): Promise<void>
  /** Raw per-request usage, never the SDK's zero-filled or cumulative aggregate. */
  onModelCallUsage?(callId: string, usage: ModelUsage): Promise<void>
  onArtifact?(artifact: Artifact): Promise<void>
  onUsage?(usage: ModelUsage): Promise<void>
  onTrace?(span: TraceSpan): Promise<void>
  onTraceError?(error: string): Promise<void>
  onDelta(text: string): Promise<void>
  onTool(event: ToolEvent): Promise<void>
  approveCommand(command: string, cwd: string): Promise<boolean>
}
export interface AutomationDraftContext {
  connection: Connection
  apiKey: string
  instruction: string
  timezone: string
  targets: import('./modules/automations/automation-draft').AutomationDraftTarget[]
  signal: AbortSignal
  onUsage(usage: ModelUsage): Promise<void>
}
export interface AgentEngine {
  draftAutomation?(context: AutomationDraftContext): Promise<unknown>
  run(context: EngineContext): Promise<void>
  report?(context: EngineContext, draft: WorkDraft): Promise<WorkReport>
  decide?(context: EngineContext): Promise<ParticipationDecision>
  extractMemory?(context: EngineContext): Promise<MemoryCandidate[]>
  plan?(context: Omit<EngineContext, 'onDelta' | 'onTool' | 'approveCommand'>, members: DigitalAgent[]): Promise<string[]>
  test(connection: Connection, apiKey: string): Promise<string>
}
