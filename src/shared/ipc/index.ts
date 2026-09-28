/*
 * [INPUT]: 跨进程产品实体、桌面请求与宿主事件。
 * [OUTPUT]: 类型化 DesktopApi 与会话列表排序/置顶/隐藏请求；支持清理会话记录/专属文件及会话停止或单个工作树停止。
 * [POS]: shared/ipc 的唯一方法与事件合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationInput, AutomationDefinition, AutomationOccurrence, AutomationsView } from '../domain/automations'
import type { LaunchProfile, LaunchProfileInput } from '../domain/backends'
import type { ConversationListChange } from '../domain/conversation-list'
import type { AppearanceSnapshot, AppearancePatch } from '../appearance'
import type { AgentInput, AgentHome, AgentFileContent, Connection, ConnectionInput, DigitalAgent, Conversation, ConversationInput, ConversationDetail, Resource, Message, Snapshot, MemoryQuery, MemoryView, MemoryInput } from '../domain'

export type AppEvent =
  | { type: 'appearance:flush' }
  | { type: 'appearance:changed'; appearance: AppearanceSnapshot }
  | { type: 'automation:notice'; occurrence: AutomationOccurrence }
  | { type: 'focus-conversation'; conversationId: string }
  | { type: 'conversation:cleared'; conversationId: string }
  | { type: 'changed'; conversationId?: string }
  | { type: 'message'; message: Message }
  | { type: 'runtime-error'; error: string }

export interface Methods {
  listExternalFiles: { input: {runId:string}; output: {directory:string;files:{name:string;relativePath:string}[]} }
  publishExternalArtifact: { input: {runId:string;relativePath:string}; output: void }
  listAutomations: { input: undefined; output: AutomationsView }
  saveAutomation: { input: AutomationInput; output: AutomationDefinition }
  pauseAutomation: { input: {id:string}; output: void }
  deleteAutomation: { input: {id:string}; output: void }
  runAutomation: { input: {id:string;requestId:string}; output: AutomationOccurrence }
  stopAutomation: { input: {id:string}; output: void }
  listLaunchProfiles: { input: undefined; output: LaunchProfile[] }
  saveLaunchProfile: { input: LaunchProfileInput; output: LaunchProfile }
  testLaunchProfile: { input: { id: string }; output: LaunchProfile }
  sendExternalTask: { input: { conversationId: string; content: string; requestId: string }; output: Message }
  getAppearance: { input: undefined; output: AppearanceSnapshot }
  updateAppearance: { input: { patch: AppearancePatch; expectedRevision: number }; output: AppearanceSnapshot }
  importAppearanceBackground: { input: undefined; output: AppearanceSnapshot | null }
  removeAppearanceBackground: { input: undefined; output: AppearanceSnapshot }
  resetAppearance: { input: undefined; output: AppearanceSnapshot }
  snapshot: { input: undefined; output: Snapshot }
  saveAgent: { input: AgentInput; output: DigitalAgent }
  saveConnection: { input: ConnectionInput; output: Connection }
  deleteConnection: { input: { id: string }; output: void }
  testConnection: { input: { id: string }; output: { text: string } }
  createConversation: { input: ConversationInput; output: Conversation }
  updateConversationList: { input: ConversationListChange; output: void }
  clearConversationHistory: { input: { id: string; hide: boolean }; output: void }
  getConversation: { input: { id: string }; output: ConversationDetail }
  sendMessage: { input: { conversationId: string; content: string; mentionIds: string[]; requestId: string; replyToMessageId?: string; stopPrevious?: boolean }; output: Message }
  cancelRun: { input: { conversationId: string; workId?: string }; output: void }
  approve: { input: { id: string; approved: boolean }; output: void }
  importResource: { input: { kind: Resource['kind']; path: string; ownerAgentId?: string }; output: Resource }
  removeResource: { input: { id: string }; output: void }
  retryRun: { input: { id: string; requestId: string }; output: void }
  getAgentHome: { input: { agentId: string; conversationId?: string }; output: AgentHome }
  readAgentFile: { input: { agentId: string; name: string; conversationId?: string }; output: AgentFileContent }
  saveAgentFile: { input: { agentId: string; name: 'AGENTS.md' | 'SOUL.md'; content: string; expectedHash: string; expectedConfigVersion: number }; output: AgentHome }
  regenerateAgentViews: { input: { agentId: string; conversationId?: string }; output: AgentHome }
  getMemory: { input: MemoryQuery; output: MemoryView }
  saveMemory: { input: MemoryInput; output: MemoryView }
  deleteMemory: { input: MemoryQuery & { id: string; expectedEpoch: number }; output: MemoryView }
  clearMemory: { input: MemoryQuery & { expectedEpoch: number }; output: MemoryView }
  // These three methods are handled by the desktop host, not by model tools.
  choosePath: { input: { kind: 'skill' | 'knowledge' }; output: string | null }
  openPath: { input: { path: string }; output: void }
  exportBackup: { input: undefined; output: string | null }
  setUnsavedChanges: { input: { dirty: boolean; source?: 'business' | 'appearance' }; output: void }
}
export type Method = keyof Methods
export interface DesktopApi {
  initialAppearance?: AppearanceSnapshot
  request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>
  subscribe(listener: (event: AppEvent) => void): () => void
}
export interface RpcRequest { id: string; method: Method; input: unknown }
export type RpcResponse = { id: string; result?: unknown; error?: string }
export type RuntimeMessage = { type: 'ready' } | { type: 'response'; response: RpcResponse } | { type: 'event'; event: AppEvent }

declare global { interface Window { boai: DesktopApi } }
