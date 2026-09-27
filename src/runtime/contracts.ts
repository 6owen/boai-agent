import type { RunEnvironmentPlan } from './modules/workspaces/environment-plan'
import type { Artifact, DigitalAgent, Connection, Conversation, Message, Resource, BootstrapSnapshot, MemoryView, SessionWorkspace, ParticipationDecision, Contribution, ConversationEvent, ModelUsage, ToolEvent, MemoryCandidate } from '../shared/domain'

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
  triggerMessageId?: string
  turnId?: string
  participation?: { isFirstDecision: boolean; hasRespondedInTurn: boolean; triggerEventType: ConversationEvent['type']; eventMessageId?: string; observedThroughSequence: number }
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
  decide?(context: EngineContext): Promise<ParticipationDecision>
  extractMemory?(context: EngineContext): Promise<MemoryCandidate[]>
  plan?(context: Omit<EngineContext, 'onDelta' | 'onTool' | 'approveCommand'>, members: DigitalAgent[]): Promise<string[]>
  test(connection: Connection, apiKey: string): Promise<string>
}
