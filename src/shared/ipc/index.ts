/*
 * [INPUT]: 跨进程产品实体、桌面请求与宿主事件。
 * [OUTPUT]: T1.3 批量创建/原子安装与显式恢复； 本机个人资料版本化保存与只读活动聚合接口；T1.2 生成/取消与可编辑方案； 定时任务草稿提取、持久创建回执查询及显式恢复计划；团队草稿打开/版本保存/恢复/放弃 IPC； 按会话/消息设置本地用户表情回应的幂等接口；扫描来源的 API 草稿测试合同，凭据不返回渲染端；通讯录分类/独立排序读取与版本化更新合同；本机 Agent 扫描预填与未保存配置测试合同；本机技能目录默认命中缓存，refresh 明确重新扫描； 本地安装目标与原生 File 拖入授权、本机技能发现/详情/明确预览导入/编辑定位合同；带预期状态版本的明确预算追加合同；单次执行/通知回执读取与主进程待消费导航；纯日程预览与完整历史分页查询；按 occurrence 提交补充信息的独立入口；商店、技能管理/便携库预览导出/收藏恢复/删除清理及持久操作合同；会话 Trace、本地连接导入、类型化 DesktopApi、连接编辑/测试和会话控制；快照不包含凭据。
 * [POS]: shared/ipc 的唯一方法与事件合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { TeamCreationOperation, TeamGeneration, TeamDraft, TeamEditable, TeamDraftView, TeamRecovery } from '../domain/team-creation'
import type { SkillMarketplaceListRequest, SkillMarketplaceDetailRequest, SkillMarketplaceListResult, SkillMarketplaceItem, SkillMarketplaceProvider, MarketplaceResult } from '../domain/skill-marketplace'
import type { AutomationDraftRequest, AutomationDraftResult, AutomationBudgetRenewalInput, AutomationHistoryPage, AutomationHistoryQuery, AutomationInput, AutomationDefinition, AutomationOccurrence, AutomationsView } from '../domain/automations'
import type { LaunchProfile, LaunchProfileInput } from '../domain/backends'
import type { ConversationListChange } from '../domain/conversation-list'
import type { ContactListAction, ContactListPreferences } from '../domain/contact-list'
import type { AppearanceSnapshot, AppearancePatch } from '../appearance'
import type { LocalConfigScanResult } from '../domain/local-configs'
import type { StoredTraceSpan } from '../domain/traces'
import type { LocalSkillCatalog, LocalSkillDetail, ScanSkillSourceInput, SkillInstallation, SkillPreview, SkillCollections, SkillCollectionAction, SkillDetail, SkillFileContent, SkillScan, SkillOperation, InstallSkillsInput, SkillUpdateCheck, UpdateSkillInput, ResourceCleanup, PlanSkillLibraryExportInput, ExportSkillLibraryInput, SkillLibraryExportPlan, SkillUpdateBatch } from '../domain/skills'
import type { AgentInput, AgentHome, AgentFileContent, Connection, ConnectionInput, DigitalAgent, Conversation, ConversationInput, ConversationDetail, Resource, Message, Snapshot, MemoryQuery, MemoryView, MemoryInput } from '../domain'

export const unsupportedRequestMessage = '当前运行版本尚未加载此功能，请重启应用后重试。'

export type AppEvent =
  | { type: 'appearance:flush' }
  | { type: 'appearance:changed'; appearance: AppearanceSnapshot }
  | { type: 'automation:notice' }
  | { type: 'automation:navigate' }
  | { type: 'focus-conversation'; conversationId: string; messageId?: string }
  | { type: 'conversation:cleared'; conversationId: string }
  | { type: 'changed'; conversationId?: string }
  | { type: 'message'; message: Message }
  | { type: 'runtime-error'; error: string }

export interface Methods {
  updateUserProfile: { input: import('../domain/profile').UserProfileInput; output: import('../domain/profile').LocalUserProfile }
  getProfileActivity: { input: import('../domain/profile').ProfileActivityQuery; output: import('../domain/profile').ProfileActivity }
  acceptTeamCreation: { input: { draftId: string; expectedVersion: number; planHash: string; requestId: string }; output: TeamCreationOperation }
  getTeamCreation: { input: { operationId: string }; output: TeamCreationOperation }
  resumeTeamCreation: { input: { operationId: string; expectedVersion: number }; output: TeamCreationOperation }
  generateTeamPlan: { input: { draftId: string; expectedVersion: number; requestId: string }; output: TeamGeneration }
  cancelTeamGeneration: { input: { generationId: string }; output: void }
  openTeamDraft: { input: { draftId?: string } | undefined; output: TeamDraft }
  saveTeamDraft: { input: { draftId: string; expectedVersion: number; editableFields: TeamEditable }; output: TeamDraft }
  getTeamDraft: { input: { draftId: string }; output: TeamDraftView }
  abandonTeamDraft: { input: { draftId: string; expectedVersion: number }; output: TeamDraft }
  listTeamCreationRecovery: { input: undefined; output: TeamRecovery }
  getContactList: { input: undefined; output: ContactListPreferences }
  updateContactList: { input: { expectedRevision: number; action: ContactListAction }; output: ContactListPreferences }
  listLocalSkills: { input: { refresh?: boolean } | undefined; output: LocalSkillCatalog }
  getLocalSkillDetail: { input: { id: string }; output: LocalSkillDetail }
  scanLocalSkill: { input: { id: string; ownerAgentId?: string; requestId?: string }; output: SkillScan }
  openLocalSkill: { input: { id: string; action: 'edit' | 'reveal' }; output: void }
  listSkillMarketplace: { input: SkillMarketplaceListRequest; output: MarketplaceResult<SkillMarketplaceListResult> }
  getSkillMarketplaceDetail: { input: SkillMarketplaceDetailRequest; output: MarketplaceResult<SkillMarketplaceItem> }
  refreshSkillMarketplace: { input: { provider: SkillMarketplaceProvider }; output: void }
  getSkillDetail: { input: { resourceId: string }; output: SkillDetail }
  readSkillFile: { input: { resourceId: string; path: string }; output: SkillFileContent }
  getSkillCollections: { input: undefined; output: SkillCollections }
  updateSkillCollections: { input: { expectedRevision: number; action: SkillCollectionAction }; output: SkillCollections }
  scanSkillSource: { input: ScanSkillSourceInput; output: SkillScan }
  chooseSkillSource: { input: { kind: 'folder' | 'zip' }; output: string | null }
  cancelSkillScan: { input: { id: string }; output: void }
  discardSkillScan: { input: { id: string }; output: void }
  getSkillPreview: { input: { scanId: string; candidateId: string }; output: SkillPreview }
  readSkillPreviewFile: { input: { scanId: string; candidateId: string; path: string }; output: SkillFileContent }
  listSkillOperations: { input: undefined; output: SkillOperation[] }
  listSkillInstallations: { input: undefined; output: SkillInstallation[] }
  installSkills: { input: InstallSkillsInput; output: SkillOperation }
  getSkillOperation: { input: { id: string }; output: SkillOperation }
  cancelSkillOperation: { input: { id: string }; output: void }
  checkSkillUpdate: { input: { id: string }; output: SkillUpdateCheck }
  listSkillUpdateChecks: { input: undefined; output: SkillUpdateCheck[] }
  checkAllSkillUpdates: { input: { requestId: string; scope?: 'local' }; output: SkillUpdateBatch }
  getSkillUpdateBatch: { input: undefined; output: SkillUpdateBatch | null }
  cancelSkillUpdateBatch: { input: undefined; output: void }
  updateSkill: { input: UpdateSkillInput; output: SkillOperation }
  planSkillLibraryExport: { input: PlanSkillLibraryExportInput; output: SkillLibraryExportPlan }
  discardSkillLibraryExport: { input: { id: string }; output: void }
  cancelSkillLibraryPreview: { input: undefined; output: void }
  exportSkillLibrary: { input: ExportSkillLibraryInput; output: SkillOperation | null }
  listResourceCleanups: { input: undefined; output: ResourceCleanup[] }
  retryResourceCleanup: { input: { id: string }; output: void }
  listExternalFiles: { input: {runId:string}; output: {directory:string;files:{name:string;relativePath:string}[]} }
  publishExternalArtifact: { input: {runId:string;relativePath:string}; output: void }
  listAutomations: { input: undefined; output: AutomationsView }
  getPendingAutomationNavigation: { input: undefined; output: { automationId: string; occurrenceId: string; conversationId?: string; messageId?: string } | null }
  getAutomationOccurrence: { input: { id: string }; output: AutomationHistoryPage['occurrences'][number] }
  listAutomationHistory: { input: AutomationHistoryQuery; output: AutomationHistoryPage }
  saveAutomation: { input: AutomationInput; output: AutomationDefinition }
  getAutomationCreation: { input: { requestId: string }; output: AutomationDefinition | null }
  generateAutomationDraft: { input: AutomationDraftRequest; output: AutomationDraftResult }
  resumeAutomation: { input: { id: string }; output: AutomationDefinition }
  pauseAutomation: { input: {id:string}; output: void }
  deleteAutomation: { input: {id:string}; output: void }
  runAutomation: { input: {id:string;requestId:string}; output: AutomationOccurrence }
  stopAutomation: { input: {id:string}; output: void }
  replyAutomation: { input: {occurrenceId:string;content:string;requestId:string;renewBudget?:AutomationBudgetRenewalInput}; output: Message }
  previewAutomation: { input: Pick<AutomationInput, 'frequency' | 'time' | 'weekday' | 'daysOfWeek' | 'timezone'>; output: {nextTimes:string[]} }
  listLaunchProfiles: { input: undefined; output: LaunchProfile[] }
  saveLaunchProfile: { input: LaunchProfileInput; output: LaunchProfile }
  testLaunchProfile: { input: { id: string }; output: LaunchProfile }
  testLaunchProfileDraft: { input: LaunchProfileInput; output: NonNullable<LaunchProfile['verified']> }
  sendExternalTask: { input: { conversationId: string; content: string; requestId: string }; output: Message }
  getAppearance: { input: undefined; output: AppearanceSnapshot }
  updateAppearance: { input: { patch: AppearancePatch; expectedRevision: number }; output: AppearanceSnapshot }
  importAppearanceBackground: { input: undefined; output: AppearanceSnapshot | null }
  removeAppearanceBackground: { input: undefined; output: AppearanceSnapshot }
  resetAppearance: { input: undefined; output: AppearanceSnapshot }
  snapshot: { input: undefined; output: Snapshot }
  saveAgent: { input: AgentInput; output: DigitalAgent }
  scanLocalConnections: { input: { chooseDirectory?: boolean }; output: LocalConfigScanResult | null }
  importLocalConnection: { input: { configId: string; model?: string }; output: Connection }
  testLocalConnection: { input: { configId: string; model?: string }; output: { text: string } }
  importLocalAgent: { input: { configId: string; hostAccessAcknowledged: true }; output: LaunchProfile }
  prepareLocalAgent: { input: { configId: string }; output: Omit<LaunchProfileInput, 'hostAccessAcknowledged'> }
  saveConnection: { input: ConnectionInput; output: Connection }
  getConnectionApiKey: { input: { id: string }; output: string }
  deleteConnection: { input: { id: string }; output: void }
  testConnection: { input: { id: string }; output: { text: string } }
  testConnectionDraft: { input: ConnectionInput; output: { text: string } }
  listConnectionModels: { input: Pick<ConnectionInput, 'id' | 'baseUrl' | 'apiKey'>; output: string[] }
  createConversation: { input: ConversationInput; output: Conversation }
  updateConversationList: { input: ConversationListChange; output: void }
  clearConversationHistory: { input: { id: string; hide: boolean }; output: void }
  getConversation: { input: { id: string }; output: ConversationDetail }
  getConversationTrace: { input: { conversationId: string; messageId: string; turnId?: string }; output: StoredTraceSpan[] }
  sendMessage: { input: { conversationId: string; content: string; mentionIds: string[]; requestId: string; replyToMessageId?: string; stopPrevious?: boolean }; output: Message }
  setMessageReaction: { input: { conversationId: string; messageId: string; emoji: string; active: boolean }; output: Message }
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
  selectSkillFile?(file: File, kind: 'folder' | 'zip'): Promise<string>
  request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>
  subscribe(listener: (event: AppEvent) => void): () => void
}
export interface RpcRequest { id: string; method: Method; input: unknown }
export type RpcResponse = { id: string; result?: unknown; error?: string }
export type RuntimeMessage = { type: 'ready' } | { type: 'response'; response: RpcResponse } | { type: 'event'; event: AppEvent }

declare global { interface Window { boai: DesktopApi } }
