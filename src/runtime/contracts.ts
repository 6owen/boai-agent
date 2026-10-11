/*
 * [OUTPUT]: 2026-10-11 原生会话/执行证据/交互/普通公开消息为独立可选合同，不要求原生引擎实现私有五阶段。
 * [OUTPUT]: 2026-10-10 执行进度独立观察回调仅接公开摘要与实际阶段，不授业务权或改变发布。
 * [OUTPUT]: 2026-10-10 原生实际模型/线程/turn引用有独立元数据回调，不授予业务执行或重放权限。
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [OUTPUT]: 宿主在成果复制前持久登记准备身份，正式成果与准备记录清除共用提交事务。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 外部阶段用量区分中途观测与已确认终态；只有终态可关闭原请求的未知用量。
 * [OUTPUT]: 本机进程目录独立于任务文件能力，补充问题/只读汇报仍可启动无工具阶段。
 * [OUTPUT]: 执行上下文区分模型 API 与本机配置；API 适配器在构造模型前明确校验，外部员工不制造虚假连接。
 * [INPUT]: 共享工作/产品合同、协作投递引用和授权执行环境。
 * [OUTPUT]: 图片附件仅在当前获准上下文以内存媒体交给模型，不进入持久消息或运行快照。
 * [OUTPUT]: 核心组织阶段的有界员工摘要、宿主原工作授权及已提交真实组织回执 ID；群中 bobo 不持管理工具。
 * [OUTPUT]: 宿主即时核验的依赖成果 ID/hash/逻辑路径；读取仍核对来源，不将同伴文字或元信息当作本人交付。
 * [OUTPUT]: 判断阶段的当前宿主浏览器可用性与手动已认领工作独占的浏览器租约；同一验证读取字节的宿主文件读取回调；宿主提交的成果修订身份；材料读取证据和宿主文件访问授权回调；核心 Agent 团队工具的宿主授权/唯一工具调用身份与提交回执合同；员工统一召回和宿主已授权临时事项；逐模型调用开始/实际思考强度和原生技能激活观察；无工具的定时任务草稿模型接口与原始用量回调；明确预算接续与被接替判断的宿主上下文；明确补充对应的原始请求/提问上下文合同；唯一模型请求身份与逐调用用量回执；原生 Trace 保存/观测错误、统一容量/判断时限、工作上下文及结果/副作用和无工具汇报接口。
 * [POS]: runtime 内部合同，不向 renderer 暴露凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { RunEnvironmentPlan } from './modules/workspaces/environment-plan'
import type { TeamPlannerOutput } from '../shared/domain/team-creation'
import type { TraceSpan } from '../shared/domain/traces'
import type { Artifact, DigitalAgent, Connection, Conversation, Message, Resource, BootstrapSnapshot, MemoryView, SessionWorkspace, ParticipationDecision, Contribution, ConversationEvent, ModelUsage, ToolEvent, MemoryCandidate, WorkItem, WorkOutcome, WorkDraft, WorkReport, WorkDelegation, WorkWait, WorkBudget } from '../shared/domain'

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
  /** Bounded public capabilities only; ordinary discussion remains without Work or tools. */
  employeeCandidates?: import('../shared/domain/bobo-collaboration').EmployeeCandidatePage
  legacyTeamName?: string
  findEmployees?(query: import('../shared/domain/bobo-collaboration').EmployeeCandidateQuery): Promise<import('../shared/domain/bobo-collaboration').EmployeeCandidatePage>
  organizeCollaboration?(plan: import('../shared/domain/bobo-collaboration').BoboCollaborationPlan, toolCallId: string): Promise<import('../shared/domain/bobo-collaboration').BoboCollaborationReceipt>
  /** Host grants this only after a manual task owns its original Work. */
  browserSession?: import('./modules/browser/session').BrowserSession
  /** Current host availability for choosing a task; this does not grant a lease or tools. */
  browserAvailable?: boolean
  /** A host-committed revision request; file versions never reuse Work resultVersion. */
  artifactRevision?: import('../shared/domain/artifacts').ArtifactRevisionRequest
  materialRefs?: import('../shared/domain/materials').MaterialReadRef[]
  materialImages?: { messageId: string; materialId: string; dataUrl: string; mimeType: string }[]
  /** Host checks source grants before file reads, lists, writes and publication. */
  canAccessTaskPath?(path: string, operation: 'read' | 'list' | 'write' | 'publish'): Promise<boolean>
  /** Registered shared artifacts return the same bytes that the host validated, with no second filesystem read. */
  readTaskFile?(path: string): Promise<{ content: string } | null>
  agent: DigitalAgent
  connection?: Connection
  runtimeProfile?: import('../shared/domain/backends').LaunchProfile
  /** Process home survives no-tool question phases; this grants no workspace tool capability. */
  runtimeDirectory?: { cwd: string; privateHome: string }
  apiKey: string
  conversation: Conversation
  messages: Message[]
  resources: Resource[]
  runId: string
  signal: AbortSignal
  bootstrap?: BootstrapSnapshot
  memory?: MemoryView
  /** Stable host-authorized contexts for temporary memory; never chosen by the model. */
  memoryContexts?: import('../shared/domain').MemoryContextRef[]
  workspace?: SessionWorkspace
  environment?: RunEnvironmentPlan
  groupCoordination?: import('../shared/domain/group-coordination').GroupCoordination
  responseKind?: 'chat' | 'task'
  decision?: ParticipationDecision
  members?: DigitalAgent[]
  contributions?: Contribution[]
  workItems?: WorkItem[]
  work?: WorkItem
  /** Host snapshot for routing only; the repository rechecks every reservation transaction. */
  workBudget?: WorkBudget
  /** Exact logical files of delivered, currently authorized dependency results; reads still recheck sources. */
  dependencyArtifacts?: { artifactId: string; name: string; logicalPath: string; nativePath?: string; contentHash: string; workId: string; resultVersion: number }[]
  /** Host-verified committed organization receipts; model outcome references are not proof. */
  committedCollaborationIds?: string[]
  /** Waiting declared by this execution, retained when its private report is revised. */
  pendingWorkWait?: WorkWait
  completedWorkTools?: { runId: string; tools: ToolEvent[] }[]
  onWorkOutcome?(outcome: WorkOutcome): Promise<void>
  beforeEffect?(): Promise<void>
  afterEffect?(): Promise<void>
  delegateWork?(input: WorkDelegation): Promise<WorkItem>
  waitForWork?(input: WorkWait): Promise<void>
  /** Core-only product tool; the host owns authorization, idempotency and atomic publication. */
  createTeam?(plan: Extract<TeamPlannerOutput, { kind: 'plan' }>, toolCallId: string): Promise<{ operationId: string; conversationId: string; title: string; members: { id: string; name: string; role: string }[] }>
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
  onModelCallUsage?(callId: string, usage: ModelUsage, externalComplete?: boolean): Promise<void>
  /** Persist the exact publication identity before copying its shared original. */
  onArtifactPreparing?(artifact: Artifact): Promise<void>
  onArtifact?(artifact: Artifact): Promise<void>
  onUsage?(usage: ModelUsage): Promise<void>
  onNativeExecution?(receipt: { modelId?: string; sessionId?: string; turnId?: string; inputAccepted?: boolean; contextUsedTokens?: number; contextWindowTokens?: number; totalCostUsd?: number }): Promise<void>
  onExecutionEvent?(event: import('../shared/domain/execution').ExecutionEvent): Promise<void>
  requestNativeAction?(action: import('../shared/domain/execution').NativeActionInput, signal?: AbortSignal): Promise<import('../shared/domain/execution').NativeActionResponse>
  /** Lazily creates product Work only for explicit collaboration/publication tools. */
  ensureNativeWork?(intent?: import('../shared/domain').ParticipationDecision['work'], replacesArtifactId?: string): Promise<void>
  /** Public messages use actual employee identity; tool-call identity is idempotent. */
  publishNativeMessage?(content: string, callId: string): Promise<{ messageId: string; content: string }>
  nativeArtifacts?: { id: string; name: string; version: number; sourcePath: string }[]
  /** Current authorized source identities, including history outside the prompt window. */
  nativeSourceIds?: string[]
  onProgress?(event: Pick<import('../shared/domain').ExecutionProgressEvent, 'id' | 'kind' | 'text'>): Promise<void>
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
  interpretGroup?(context: EngineContext): Promise<import('../shared/domain/group-coordination').GroupInterpretation>
  draftAutomation?(context: AutomationDraftContext): Promise<unknown>
  run(context: EngineContext): Promise<void>
  report?(context: EngineContext, draft: WorkDraft): Promise<WorkReport>
  decide?(context: EngineContext): Promise<ParticipationDecision>
  extractMemory?(context: EngineContext): Promise<MemoryCandidate[]>
  plan?(context: Omit<EngineContext, 'onDelta' | 'onTool' | 'approveCommand'>, members: DigitalAgent[]): Promise<string[]>
  test(connection: Connection, apiKey: string): Promise<string>
}

/** API adapters reject local runtime contexts before constructing a model. */
export function assertApiContext(context: EngineContext): asserts context is EngineContext & { connection: Connection } {
  if (!context.connection || context.runtimeProfile) throw new Error('此执行上下文不属于模型 API')
}
