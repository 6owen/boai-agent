/*
 * [OUTPUT]: 2026-10-29 workspace-files增加授权根及预览DTO，index/public-methods接可信桌面预览入口。
 * [OUTPUT]: testWebSearchServiceDraft显式测试当前DeepSeek密钥，不保存配置。
 * [OUTPUT]: 当前轮次纯文本补充固定run/turn，原消息保存接受、原生确认与未知投递。
 * [OUTPUT]: 定时任务列表偏好独立 CAS 读写及变更事件，不改执行配置。
 * [OUTPUT]: 语音设置页外自动保存及关闭前排空回执，独立voice脏来源。
 * [OUTPUT]: 2026-10-27 语音插件与显式执行额度的公共合同；不依赖可执行插件。
 * [OUTPUT]: 桌面生命周期事件与主窗专用快照/诊断导出桥；员工公共方法不扩展。
 * [OUTPUT]: Owner任务结果读取复用共享Work结果合同，桌面与CLI同一投影。
 * [OUTPUT]: 工作区路径核验及轻量身份复核为私有合同；终端精确员工/会话排空保持原清理边界。
 * [OUTPUT]: 桌面活动原生采集参数、独立键鼠监听及权限命令保持宿主私有调用。
 * [OUTPUT]: approve协议新增allowSameKind，只表达本次运行同类操作批准。
 * [OUTPUT]: 增加系统文本复制桥和retryRun的显式continuation标识，原请求身份及通用IPC保持。
 * [OUTPUT]: 消息复制使用仅主窗口可调用的系统剪贴板写入桥，浏览器预览保留Web回退；成功后才显示已复制。
 * [OUTPUT]: 快捷键偏好、回执、窗口捕获与退出保存沿原受控 IPC。
 * [OUTPUT]: 提示词集合读取及版本化分组/排序合同，与正文版本独立。
 * [OUTPUT]: 清理开始事件先于读取失效，完成事件携带隐藏状态，供界面停读和准确移出列表。
 * [OUTPUT]: 2026-10-20全局字体与应用图标设置接入原外观持久化和宿主协议。
 * [OUTPUT]: 私有桌面活动采集合同与侧栏终端/预览定位事件。
 * [OUTPUT]: 全局提示词目录列表与版本化保存/删除，沿现有桌面IPC。
 * [OUTPUT]: 员工源文件保存扩展到已登记的八个场景模块，沿原hash及configVersion核验。
 * [OUTPUT]: 2026-10-19应用业务协议：类型化应用目录/调用/回执接口，调用者身份由宿主构造。
 * [OUTPUT]: 2026-10-19 独立网页检索设置/服务/默认/凭据/测试/移除的类型化桌面合同。
 * [OUTPUT]: 知识引用只沿实际读取记录及当前授权/内容身份预览；旧版本、伪造路径和未读行不扩权。
 * [OUTPUT]: CLI安装管理为桌面专用IPC，版本核对且不接受renderer指定程序路径。
 * [OUTPUT]: session create显式模式核对保存权限并进入稳定请求身份，旧回执不受后来改权影响。
 * [OUTPUT]: 显式CLI权限仅核对员工已保存模式，受理后继续沿原审批和当前授权，不临时改权。
 * [OUTPUT]: 员工/核心首发接收固定附件摘要及短期上传选择，重复核对不依赖临时token。
 * [OUTPUT]: 有界客户端附件字节上传复用原材料选择/准备与会话授权，不接收服务器源路径。
 * [OUTPUT]: 本轮API模型覆盖沿原请求与执行，冻结来源且临时凭据不写入公开记录或默认配置。
 * [OUTPUT]: send/run及核心首发转交本次工作位置，服务器核验路径，授权保持独立。
 * [OUTPUT]: sendEmployeeMessage携带原Composer固定引用，核心首发及已有私聊共用核验。
 * [OUTPUT]: 运行时版本查询复用程序身份/原验证与插件内容核验；未知明确、零启动，CLI区分自身及服务版本，验证归21组01 §12.9。
 * [OUTPUT]: 公开精确run取消、候选对象和实际退出查询；原消息取消入口保持。
 * [OUTPUT]: 员工主私聊创建/会话清空隐藏与持久操作回执，共用原身份和清理日志。
 * [OUTPUT]: 按明确员工发送原私聊消息；请求身份、核心首发与普通受理共用原回执。
 * [OUTPUT]: 原消息执行查询/精确取消共用Run/Turn/Work与实际宿主活动，不创建第二执行账本。
 * [OUTPUT]: 员工知识文件清单与相对文件选择预览；旧目录核验仍由宿主处理。
 * [OUTPUT]: 员工知识移除使用版本化请求身份和持久回执。
 * [OUTPUT]: 知识保存支持原条目内容替换，明确会话共享携带请求与版本身份。
 * [OUTPUT]: 员工知识资料提供宿主文件选择、保留/列表/预览及只读回执入口。
 * [OUTPUT]: 员工目录选择及原审批回执查询；审批继续使用原approve方法与可信本人入口。
 * [OUTPUT]: 版本化Magpie系统导入先持久草稿、明确确认后事务保存连接/回执；冷启动有界队列、未知核对和Sonner反馈，完整应用验收仍待运行。
 * [OUTPUT]: 无Run的连接测试/团队规划/自动化草稿沿原操作身份保存逐请求网关路由；不制造Work或更改原预算。
 * [OUTPUT]: Magpie只读本机发现与手动地址探测分开；仅返回服务名、版本和已核对根地址。
 * [OUTPUT]: 网关目录读取可核对保存版本，目录快照独立于连接变更。
 * [OUTPUT]: 增加Magpie只读识别/结构化目录接口，旧模型ID目录兼容网关根地址。
 * [OUTPUT]: 单条定时执行记录按所见版本删除；成功广播历史删除事件，关闭各页同源过程面板。
 * [OUTPUT]: 数据源编辑器专用getDataSourceCredential按ID/版本回填已保存值，普通列表/详情合同不携凭据。
 * [OUTPUT]: 执行卡片通过resolveExecutionMessage核对实际聊天消息后定位；隐藏可显式打开，已删不复活。
 * [OUTPUT]: 新增本地共享技能hash写入/移除接口和普通bobo目录操作结果查询。
 * [OUTPUT]: 命令审批支持显式记住员工授权；独立版本化撤销接口不改活动运行配置。
 * [OUTPUT]: 数据源独立配置/凭据与员工sourceIds接线；版本核对、撤权和实际调用退出沿宿主边界。
 * [OUTPUT]: 日程预览新增startsOn/dayOfMonth，与手动和bobo计划保存一致。
 * [OUTPUT]: Composer可读取本机模型目录及原生推理档位。
 * [OUTPUT]: 运行时插件目录查询/CAS启停/卸载和原生选择安装的类型化合同。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 内置插件配置快照/版本化启停与局部变化事件；无外部包或代码入口。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道内部讨论创建与固定消息引用、明确外发和消息级送达回执接口。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 2026-10-14固定网页引用由宿主核源；本机只读租约绑定真实消息/run，写操作沿Work；重开窗口使用独立实例身份。
 * [OUTPUT]: 归属员工/群计划有界分页读取，右侧和全局管理共用真实计划ID。
 * [OUTPUT]: 桌面后台偏好与真实登录项状态的 typed 白名单；不暴露路径/命令。
 * [OUTPUT]: 员工渠道绑定、连接/停止/解除、保存回执核对和独立平台发送结果；不公开平台入站或已保存凭据接口。
 * [OUTPUT]: openPath增加可选reveal动作，沿原宿主路径校验定位文件，不改变默认外部打开。
 * [OUTPUT]: 2026-10-11 原生执行历史/完整内容/窗口/交互/停止typed IPC；读面板不启动工作。
 * [OUTPUT]: 2026-10-10 员工执行清单/固定运行详情与已验证本机模型目录的类型化合同，输入仅对象身份，输出不包含凭据。
 * [OUTPUT]: deleteLaunchProfile仅接已保存配置ID，删除产品配置并保留外部程序和业务历史。
 * [OUTPUT]: prepareDetectedLocalAgent只接受扫描候选身份并核对真实程序；原prepareLocalAgent保留明确协议及旧ACP缺省。
 * [OUTPUT]: 工作/文件有界查询和精确原目标解析沿类型化IPC；不增加执行或路径读取权限。
 * [OUTPUT]: getLaunchProfileStatus仅按已保存启动项ID只读核对当前程序，不接受路径或启动验证。
 * [OUTPUT]: 新 prepareMaterial 不携收件人名单，附件随当前聊天消息发送；旧显式名单/撤权方法只供历史兼容。
 * [INPUT]: 跨进程产品实体、材料授权/版本、真实 File 的有界字节、明确系统剪贴板文件格式、桌面请求与宿主事件。
 * [OUTPUT]: 无本地路径 File 通过有界 name/bytes 产生私有来源身份；真实 paste 可读取系统文件引用，Renderer 不获得路径读取接口。
 * [OUTPUT]: 原核心会话组织回执的明确读取/继续/放弃与已发布群首发显式接续；无任意员工创建或身份授权 IPC。
 * [OUTPUT]: 内置浏览器公开打开/查看/操作不接受员工或会话归属；原始任务动作桥仅 runtime/Main 内部使用。
 * [OUTPUT]: getConversationMetadata 显式选择有界来源摘要；D6 无正文会话元信息与即时工作证据检查；D6 有界会话视图/消息页、确定性个人检索/正文位置与有界覆盖回执/索引代际游标及点击复核、真实完成快照阅读 CAS 与独立锚点 IPC；输入只携明确对象身份，不暴露路径读取。
 * [OUTPUT]: 四来源待处理稳定分页/精确读取、原问题定向补充及显式成果验收资格/只读回执；已保存员工的本机单技能准备/原子绑定与按原请求只读核对；输入仅发现 ID、所见 hash 和员工配置版本。
 * [OUTPUT]: 固定成果 ID/hash 预览、明确新请求修订及幂等采用/只读回执；原生材料来源身份、准备/回执/预览/移除/授权与消息稳定受理核对；通讯录标签/顺序专属局部变更事件，员工删除/群解散请求与会话删除事件；核心助手非空首发与具名团队请求的互斥受理合同；员工级记忆查询/管理和稳定请求身份；T1.3 批量创建/原子安装与显式恢复； 本机个人资料版本化保存与只读活动聚合接口；T1.2 生成/取消与可编辑方案； 定时任务草稿提取、持久创建回执查询及显式恢复计划；团队草稿打开/版本保存/恢复/放弃 IPC； 按会话/消息设置本地用户表情回应的幂等接口；扫描来源的 API 草稿测试合同，凭据不返回渲染端；通讯录分类/独立排序读取与版本化更新合同；本机 Agent 扫描预填与未保存配置测试合同；本机技能目录默认命中缓存，refresh 明确重新扫描； 本地安装目标与原生 File 拖入授权、本机技能发现/详情/明确预览导入/编辑定位合同；带预期状态版本的明确预算追加合同；单次执行/通知回执读取与主进程待消费导航；纯日程预览与完整历史分页查询；按 occurrence 提交补充信息的独立入口；商店、技能管理/便携库预览导出/收藏恢复/删除清理及持久操作合同；会话 Trace、本地连接导入、类型化 DesktopApi、连接编辑/测试和会话控制；快照不包含凭据。
 *           核心首发回执按稳定请求 ID 只读核对，未受理返回 null，历史已清理或权威提交未安装明确拒绝。
 * [OUTPUT]: replyAutomation补充强制所见问题版本/消息，预算追加独立；ACP受理回执和精确runId停止、原材料显式核对；材料/成果原ID预览返回独立有界filePreview，源码不执行且不改变模型材料解析。
 * [POS]: shared/ipc 的唯一方法与事件合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ShortcutSnapshot, ShortcutUpdate, ShortcutReceipt } from '../shortcuts'
import type { TeamCreationOperation, TeamGeneration, TeamDraft, TeamEditable, TeamDraftView, TeamRecovery } from '../domain/team-creation'
import type { StartCoreConversationInput } from '../domain/core-agent'
import type { BrowserControlInput, BrowserWindowState, BrowserManualOpenInput } from './browser'
import type { ConversationMaterial, MaterialSelection, MaterialPreview } from '../domain/materials'
import type { SkillMarketplaceListRequest, SkillMarketplaceDetailRequest, SkillMarketplaceListResult, SkillMarketplaceItem, SkillMarketplaceProvider, MarketplaceResult } from '../domain/skill-marketplace'
import type { AutomationDraftRequest, AutomationDraftResult, AutomationBudgetRenewalInput, AutomationHistoryPage, AutomationHistoryQuery, AutomationInput, AutomationDefinition, AutomationOccurrence, AutomationsView } from '../domain/automations'
import type { LaunchProfile, LaunchProfileInput, LaunchProfileStatus } from '../domain/backends'
import type { ConversationListChange } from '../domain/conversation-list'
import type { ContactListAction, ContactListPreferences } from '../domain/contact-list'
import type { AppearanceSnapshot, AppearancePatch, AppIconStatus } from '../appearance/index'
import type { DesktopPatch, DesktopSettings } from './desktop'
import type { CliInstallation } from './cli-installation'
import type { PluginEnableInput, PluginSettingsSnapshot } from '../plugins/types'
import type { LocalConfigScanResult } from '../domain/local-configs'
import type { StoredTraceSpan } from '../domain/traces'
import type { LocalSkillCatalog, LocalSkillDetail, ScanSkillSourceInput, SkillInstallation, SkillPreview, SkillCollections, SkillCollectionAction, SkillDetail, SkillFileContent, SkillScan, SkillOperation, InstallSkillsInput, SkillUpdateCheck, UpdateSkillInput, ResourceCleanup, PlanSkillLibraryExportInput, ExportSkillLibraryInput, SkillLibraryExportPlan, SkillUpdateBatch } from '../domain/skills'
import type { AgentInput, AgentHome, AgentFileContent, Connection, ConnectionInput, DigitalAgent, Conversation, ConversationInput, ConversationDetail, Resource, Message, Snapshot, MemoryQuery, MemoryView, MemoryInput } from '../domain/index'

export const unsupportedRequestMessage = '当前运行版本尚未加载此功能，请重启应用后重试。'
export const CLIPBOARD_MATERIAL_FILE_FORMATS = ['Files', 'text/uri-list', 'x-special/gnome-copied-files', 'public.file-url', 'NSFilenamesPboardType', 'CF_HDROP', 'FileNameW', 'FileName'] as const
export type MaterialFileSourceInput = { path: string } | { name: string; bytes: Uint8Array }

export type AppEvent =
  | { type: 'desktop:lifecycle'; state: import('./desktop').DesktopLifecycle }
  | { type: 'workspace:show'; employeeId: string; conversationId: string; view: 'terminal' | 'preview' }
  | { type: 'gateway-imports:changed' }
  | { type: 'automation:history-deleted'; occurrenceId: string }
  | { type: 'plugins:changed'; settings: PluginSettingsSnapshot }
  | { type: 'desktop:changed'; settings: DesktopSettings }
  | { type: 'shortcuts:changed'; settings: ShortcutSnapshot }
  | { type: 'shortcuts:capture-ended' }
  | { type: 'shortcuts:flush'; requestId: string; discard?: boolean }
  | { type: 'voice-settings:flush'; requestId: string; discard?: boolean }
  | { type: 'appearance:flush' }
  | { type: 'appearance:changed'; appearance: AppearanceSnapshot }
  | { type: 'app-icon:changed'; status: AppIconStatus }
  | { type: 'automation:notice' }
  | { type: 'automation:navigate' }
  | { type: 'focus-conversation'; conversationId: string; messageId?: string }
  | { type: 'conversation:clearing'; conversationId: string }
  | { type: 'conversation:cleared'; conversationId: string; hidden?: boolean }
  | { type: 'conversation:deleted'; conversationId: string }
  | { type: 'schedule-list:changed' }
  | { type: 'contact-list:changed' }
  | { type: 'browser:changed' }
  | { type: 'changed'; conversationId?: string }
  | { type: 'message'; message: Message }
  | { type: 'runtime-error'; error: string }

export interface Methods {
  closeUserWorkspace: { input: { employeeId: string; conversationId?: string } | { conversationId: string }; output: void }
  getWorkspaceRoot: { input: import('./workspace-files').WorkspaceFileScope; output: string }
  validateWorkspaceScope: { input: import('./workspace-files').WorkspaceFileScope; output: void }
  previewWorkspaceFile: { input: { scope: import('./workspace-files').FileExplorerScope; relativePath: string }; output: import('./workspace-files').WorkspaceFilePreview }
  listWorkspaceFiles: { input: import('./workspace-files').WorkspaceFilesQuery; output: import('./workspace-files').WorkspaceDirectoryPage }
  listWorkspaceApplications: { input: { refresh?: boolean }; output: import('./workspace-files').WorkspaceApplication[] }
  openWorkspacePath: { input: import('./workspace-files').WorkspaceOpenInput; output: void }
  workspaceTerminal: { input: import('./workspace-terminal').WorkspaceTerminalRequest; output: import('./workspace-terminal').WorkspaceTerminalResponse }
  captureDesktopActivity: { input: { action: import('../domain/desktop-activity').ActivityCaptureAction; excludedApps?: string[]; options?: import('../domain/desktop-activity').ActivityCaptureOptions }; output: import('../domain/desktop-activity').ActivityCaptureResult }
  getApplicationCatalog: { input: import('../domain/application-protocol').ApplicationCatalogQuery; output: import('../domain/application-protocol').ApplicationCatalog }
  executeApplicationOperation: { input: import('../domain/application-protocol').ApplicationRequest; output: import('../domain/application-protocol').ApplicationResult }
  getApplicationReceipt: { input: import('../domain/application-protocol').ApplicationReceiptQuery; output: import('../domain/application-protocol').ApplicationResult | null }
  getWebSearchSettings: { input: undefined; output: import('../domain/web-search').WebSearchSettings }
  saveWebSearchService: { input: import('../domain/web-search').SaveWebSearchService; output: import('../domain/web-search').WebSearchServiceConfig }
  saveWebSearchDefault: { input: import('../domain/web-search').SaveWebSearchDefault; output: import('../domain/web-search').WebSearchSettings }
  getWebSearchCredential: { input: import('../domain/sources').DataSourceIdentity; output: string }
  testWebSearchService: { input: import('../domain/sources').DataSourceIdentity; output: import('../domain/web-search').WebSearchServiceConfig }
  testWebSearchServiceDraft: { input: import('../domain/web-search').TestWebSearchDraft; output: NonNullable<import('../domain/sources').DataSource['test']> }
  removeWebSearchService: { input: import('../domain/sources').DataSourceIdentity; output: void }

  listGatewayImports: { input: undefined; output: import('../domain/gateway-import').GatewayImportView[] }
  cancelGatewayImport: { input: { draftId: string }; output: void }
  confirmGatewayImport: { input: import('../domain/gateway-import').GatewayImportConfirmation; output: import('../domain/gateway-import').GatewayImportReceipt }
  getGatewayImportReceipt: { input: { requestId: string }; output: import('../domain/gateway-import').GatewayImportReceipt | null }
  listCatalogResults: { input: { conversationId: string }; output: import('../domain/catalog-management').CatalogResult[] }
  listDataSources: { input: undefined; output: import('../domain/sources').DataSource[] }
  getPromptCollections: { input: undefined; output: import('../domain/prompt-templates').PromptCollections }
  updatePromptCollections: { input: import('../domain/prompt-templates').PromptCollectionChange; output: import('../domain/prompt-templates').PromptCollections }
  listPromptTemplates: { input: undefined; output: import('../domain/prompt-templates').PromptTemplate[] }
  savePromptTemplate: { input: import('../domain/prompt-templates').SavePromptTemplateInput; output: import('../domain/prompt-templates').PromptTemplate }
  removePromptTemplate: { input: { id: string; expectedRevision: number }; output: void }
  getDataSource: { input: { id: string }; output: import('../domain/sources').DataSource }
  getDataSourceCredential: { input: import('../domain/sources').DataSourceIdentity; output: string }
  saveDataSource: { input: import('../domain/sources').SaveDataSourceInput; output: import('../domain/sources').DataSource }
  testDataSource: { input: import('../domain/sources').DataSourceIdentity; output: import('../domain/sources').DataSource }
  removeDataSource: { input: import('../domain/sources').DataSourceIdentity; output: void }
  setDataSourceBindings: { input: import('../domain/sources').DataSourceBindingsInput; output: import('../domain/sources').DataSource }
  chooseEmployeeDirectory: { input: undefined; output: string | null }
  chooseDataSourceFolder: { input: undefined; output: string | null }
  listRuntimePlugins: { input: undefined; output: import('../plugins/runtime-catalog').RuntimePluginCatalog }
  getRuntimeVersions: { input: undefined; output: import('../domain/runtime-versions').RuntimeVersions }
  installRuntimePlugin: { input: { expectedRevision: number }; output: import('../plugins/runtime-catalog').RuntimePluginCatalog | null }
  setRuntimePluginEnabled: { input: { id: string; enabled: boolean; expectedRevision: number }; output: import('../plugins/runtime-catalog').RuntimePluginCatalog }
  uninstallRuntimePlugin: { input: { id: string; expectedRevision: number }; output: import('../plugins/runtime-catalog').RuntimePluginCatalog }
  getPluginSettings: { input: undefined; output: PluginSettingsSnapshot }
  setPluginEnabled: { input: PluginEnableInput; output: PluginSettingsSnapshot }
  publishChannelReply: { input: { conversationId: string; messageId: string; contentHash: string; requestId: string }; output: import('../domain/index').Message }
  publishChannelMessage: { input: import('../domain/channels').ChannelPublishInput; output: import('../domain/index').Message }
  listChannelMessageDeliveries: { input: { conversationId: string; messageIds: string[] }; output: import('../domain/channels').ChannelDelivery[] }
  listChannelBindings: { input: { agentId: string }; output: import('../domain/channels').ChannelBindingState[] }
  saveChannelBinding: { input: import('../domain/channels').ChannelBindingInput; output: import('../domain/channels').ChannelBindingState }
  getChannelBindingReceipt: { input: { agentId: string; requestId: string }; output: import('../domain/channels').ChannelBindingState | null }
  connectChannelBinding: { input: import('../domain/channels').ChannelBindingAction; output: void }
  disconnectChannelBinding: { input: import('../domain/channels').ChannelBindingAction; output: void }
  removeChannelBinding: { input: import('../domain/channels').ChannelBindingAction; output: void }
  listChannelDeliveries: { input: { agentId: string }; output: import('../domain/channels').ChannelDelivery[] }
  listExecutionHistory: { input: import('../domain/execution').ExecutionHistoryQuery; output: import('../domain/execution').ExecutionHistoryPage }
  resolveExecutionMessage: { input: { conversationId: string; runId: string }; output: { conversationId: string; messageId: string } }
  listExecutionEvidence: { input: import('../domain/execution').ExecutionEvidenceQuery; output: import('../domain/execution').ExecutionEvidencePage }
  listExecutionWindow: { input: import('../domain/execution').ExecutionWindowQuery; output: import('../rovai/contracts').AgentRunExecutionBlockPage | import('../rovai/contracts').AgentRunExecutionBlockChanges }
  getExecutionContent: { input: { conversationId: string; runId: string; evidenceId: string; offset: number }; output: { content: string; length: number; revision: number; next?: number } }
  listNativeActions: { input: { conversationId: string; runId: string }; output: import('../domain/execution').NativeAction[] }
  respondNativeAction: { input: { conversationId: string; runId: string; actionId: string; response: import('../domain/execution').NativeActionResponse }; output: void }
  stopNativeExecution: { input: { conversationId: string; runId: string }; output: void }

  listEmployeeExecutions: { input: import('../domain/employee-executions').EmployeeExecutionQuery; output: import('../domain/employee-executions').EmployeeExecutionPage }
  getEmployeeExecution: { input: { agentId: string; runId: string }; output: import('../domain/employee-executions').EmployeeExecutionDetail }
  getLaunchProfileModelCatalog: { input: { id: string }; output: NonNullable<import('../domain/execution').NativeAgentInfo['models']> }
  listLaunchProfileModels: { input: { id: string }; output: string[] }
  getTaskResult: { input: { workId: string }; output: import('../domain/task-results').TaskResult }
  queryWorkViews: { input: import('../domain/work-views').WorkViewQuery; output: import('../domain/work-views').WorkViewPage }
  queryConversationFiles: { input: import('../domain/work-views').ConversationFileQuery; output: import('../domain/work-views').ConversationFilePage }
  resolveWorkViewTarget: { input: import('../domain/work-views').WorkViewTargetInput; output: import('../domain/work-views').WorkViewTarget }
  resolveConversationFileTarget: { input: import('../domain/work-views').ConversationFileTargetInput; output: import('../domain/work-views').ConversationFileTarget }
  listBoboCollaborationOperations: { input: { conversationId: string }; output: import('../domain/bobo-collaboration').BoboCollaborationReceipt[] }
  getBoboCollaborationOperation: { input: { operationId: string }; output: import('../domain/bobo-collaboration').BoboCollaborationReceipt }
  resumeBoboCollaboration: { input: { operationId: string; expectedVersion: number }; output: import('../domain/bobo-collaboration').BoboCollaborationReceipt }
  abandonBoboCollaboration: { input: { operationId: string; expectedVersion: number }; output: import('../domain/bobo-collaboration').BoboCollaborationReceipt }
  resumeBoboCollaborationStart: { input: { operationId: string; expectedVersion: number }; output: import('../domain/bobo-collaboration').BoboCollaborationReceipt }
  getBrowserWindows: { input: Record<string, never>; output: BrowserWindowState[] }
  openBrowser: { input: BrowserManualOpenInput; output: BrowserWindowState }
  browserControl: { input: BrowserControlInput; output: void }
  listConversationMessages: { input: import('../domain/reading').ConversationMessagePageQuery; output: import('../domain/reading').ConversationMessagePage }
  searchConversations: { input: import('../domain/reading').ConversationSearchQuery; output: import('../domain/reading').ConversationSearchPage }
  resolveConversationSearchTarget: { input: import('../domain/reading').ConversationSearchTarget; output: import('../domain/reading').ConversationSearchResult }
  getConversationReading: { input: { conversationId: string }; output: import('../domain/reading').ConversationReadingState }
  observeConversationReading: { input: import('../domain/reading').ConversationObserveInput; output: import('../domain/reading').ConversationReadingState }
  saveConversationAnchor: { input: import('../domain/reading').ConversationAnchorInput; output: import('../domain/reading').ConversationReadingState }
  getConversationView: { input: import('../domain/reading').ConversationMessagePageQuery; output: import('../domain/reading').ConversationView }
  getConversationMetadata: { input: { id: string; includeTriggerSummaries?: boolean }; output: ConversationDetail }
  listInbox: { input: import('../domain/inbox').InboxQuery; output: import('../domain/inbox').InboxPage }
  getInboxItem: { input: { id: string }; output: import('../domain/inbox').InboxItem | null }
  replyInboxQuestion: { input: import('../domain/inbox').InboxQuestionReply; output: Message }
  requestArtifactAcceptance: { input: import('../domain/artifacts').ArtifactAcceptanceInput; output: import('../domain/artifacts').ArtifactAcceptanceReceipt }
  getArtifactAcceptanceReceipt: { input: { requestId: string }; output: import('../domain/artifacts').ArtifactAcceptanceReceipt | null }
  prepareLocalSkillBinding: { input: import('../domain/skills').PrepareLocalSkillBindingInput; output: import('../domain/skills').SkillBindingPlan }
  bindLocalSkill: { input: import('../domain/skills').BindLocalSkillInput; output: import('../domain/skills').SkillBindingReceipt }
  getSkillBindingReceipt: { input: { requestId: string }; output: import('../domain/skills').SkillBindingReceipt | null }
  getArtifactPreview: { input: { id: string; expectedHash?: string }; output: import('../domain/artifacts').ArtifactPreview }
  reviseArtifact: { input: import('../domain/artifacts').ArtifactRevisionInput; output: Message }
  adoptArtifact: { input: import('../domain/artifacts').ArtifactAdoptionInput; output: import('../domain/artifacts').ArtifactAdoptionReceipt }
  getArtifactAdoptionReceipt: { input: { requestId: string }; output: import('../domain/artifacts').ArtifactAdoptionReceipt | null }
  startCoreConversation: { input: StartCoreConversationInput; output: Conversation }
  getCoreConversationStart: { input: { requestId: string }; output: Conversation | null }
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
  getScheduleList: { input: undefined; output: import('../domain/schedule-list').ScheduleListPreferences }
  updateScheduleList: { input: import('../domain/schedule-list').ScheduleListChange; output: import('../domain/schedule-list').ScheduleListPreferences }
  getContactList: { input: undefined; output: ContactListPreferences }
  updateContactList: { input: { expectedRevision: number; action: ContactListAction }; output: ContactListPreferences }
  saveLocalSkill: { input: { id?: string; name?: string; content: string; expectedHash: string | null }; output: LocalSkillDetail & { contentHash: string; treeHash: string } }
  removeLocalSkill: { input: { id: string; expectedHash: string }; output: { removed: boolean; id: string } }
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
  getAutomation: { input: { id: string }; output: import('../domain/automations').AutomationDefinition | null }
  listAutomations: { input: undefined; output: AutomationsView }
  listOwnerAutomations: { input: import('../domain/automations').AutomationListQuery; output: import('../domain/automations').AutomationListPage }
  getPendingAutomationNavigation: { input: undefined; output: { automationId: string; occurrenceId: string; conversationId?: string; messageId?: string } | null }
  getAutomationOccurrence: { input: { id: string }; output: AutomationHistoryPage['occurrences'][number] }
  deleteAutomationOccurrence: { input: { id: string; expectedVersion: number }; output: void }
  listAutomationHistory: { input: AutomationHistoryQuery; output: AutomationHistoryPage }
  saveAutomation: { input: AutomationInput; output: AutomationDefinition }
  getAutomationCreation: { input: { requestId: string }; output: AutomationDefinition | null }
  generateAutomationDraft: { input: AutomationDraftRequest; output: AutomationDraftResult }
  resumeAutomation: { input: { id: string }; output: AutomationDefinition }
  pauseAutomation: { input: {id:string}; output: void }
  deleteAutomation: { input: {id:string}; output: void }
  runAutomation: { input: {id:string;requestId:string}; output: AutomationOccurrence }
  stopAutomation: { input: {id:string}; output: void }
  replyAutomation: { input: {occurrenceId:string;content:string;requestId:string;question?:{expectedVersion:number;questionMessageId:string};renewBudget?:AutomationBudgetRenewalInput}; output: Message }
  previewAutomation: { input: Pick<AutomationInput, 'frequency' | 'time' | 'weekday' | 'daysOfWeek' | 'timezone' | 'startsOn' | 'dayOfMonth'>; output: {nextTimes:string[]} }
  listLaunchProfiles: { input: undefined; output: LaunchProfile[] }
  getLaunchProfileStatus: { input: { id: string }; output: LaunchProfileStatus }
  saveLaunchProfile: { input: LaunchProfileInput; output: LaunchProfile }
  deleteLaunchProfile: { input: { id: string }; output: void }
  testLaunchProfile: { input: { id: string }; output: LaunchProfile }
  testLaunchProfileDraft: { input: LaunchProfileInput; output: NonNullable<LaunchProfile['verified']> }
  sendExternalTask: { input: { conversationId: string; content: string; requestId: string }; output: Message }
  getExternalTaskReceipt: { input: { conversationId: string; requestId: string }; output: Message | null }
  getShortcutSettings: { input: undefined; output: ShortcutSnapshot }
  updateShortcutSettings: { input: ShortcutUpdate; output: ShortcutSnapshot }
  getShortcutReceipt: { input: Pick<ShortcutUpdate, 'requestId' | 'expectedRevision'>; output: ShortcutReceipt }
  setShortcutCapture: { input: { token: string; active: boolean }; output: boolean }
  completeVoiceSettingsFlush: { input: { requestId: string; clean: boolean; settled: boolean }; output: void }
  completeShortcutFlush: { input: { requestId: string; clean: boolean; settled: boolean }; output: void }
  getAppearance: { input: undefined; output: AppearanceSnapshot }
  getAppIconStatus: { input: undefined; output: AppIconStatus }
  retryAppIcon: { input: undefined; output: AppIconStatus }
  getDesktopSettings: { input: undefined; output: DesktopSettings }
  getCliInstallation: { input: undefined; output: CliInstallation }
  installCli: { input: { expectedRevision: string }; output: CliInstallation | null }
  uninstallCli: { input: { expectedRevision: string }; output: CliInstallation }
  updateDesktopSettings: { input: { patch: DesktopPatch; expectedRevision: number }; output: DesktopSettings }
  updateAppearance: { input: { patch: AppearancePatch; expectedRevision: number }; output: AppearanceSnapshot }
  importAppearanceBackground: { input: undefined; output: AppearanceSnapshot | null }
  removeAppearanceBackground: { input: undefined; output: AppearanceSnapshot }
  resetAppearance: { input: undefined; output: AppearanceSnapshot }
  snapshot: { input: undefined; output: Snapshot }
  saveAgent: { input: AgentInput; output: DigitalAgent }
  deleteAgent: { input: { id: string }; output: void }
  scanLocalConnections: { input: { chooseDirectory?: boolean }; output: LocalConfigScanResult | null }
  importLocalConnection: { input: { configId: string; model?: string }; output: Connection }
  testLocalConnection: { input: { configId: string; model?: string }; output: { text: string } }
  importLocalAgent: { input: { configId: string; hostAccessAcknowledged: true }; output: LaunchProfile }
  prepareLocalAgent: { input: { configId: string; protocol?: 'acp' | 'codex-app-server' }; output: Omit<LaunchProfileInput, 'hostAccessAcknowledged'> }
  prepareDetectedLocalAgent: { input: { candidateId: string }; output: Omit<LaunchProfileInput, 'hostAccessAcknowledged'> }
  saveConnection: { input: ConnectionInput; output: Connection }
  getConnectionApiKey: { input: { id: string }; output: string }
  deleteConnection: { input: { id: string }; output: void }
  testConnection: { input: { id: string }; output: { text: string; modelCall?: import('../domain/model-gateway').GatewayModelCall } }
  testConnectionDraft: { input: ConnectionInput; output: { text: string; modelCall?: import('../domain/model-gateway').GatewayModelCall } }
  probeModelGateway: { input: { baseUrl: string }; output: import('../domain/model-gateway').GatewayIdentity }
  discoverModelGateway: { input: undefined; output: import('../domain/model-gateway').GatewayIdentity }
  getConnectionModelCatalog: { input: Pick<ConnectionInput, 'id' | 'baseUrl' | 'apiKey' | 'gateway' | 'expectedRevision'>; output: import('../domain/model-gateway').ModelCatalog }
  listConnectionModels: { input: Pick<ConnectionInput, 'id' | 'baseUrl' | 'apiKey' | 'gateway' | 'expectedRevision'>; output: string[] }
  createConversation: { input: ConversationInput; output: Conversation }
  createEmployeeSession: { input: { expectedExecutionPermission?: import('../domain/execution').ExecutionPermission; employeeId: string; name?: string; requestId: string }; output: import('../domain/session-operation').SessionOperationReceipt }
  deleteSession: { input: { conversationId: string; requestId: string }; output: import('../domain/session-operation').SessionOperationReceipt }
  getSessionReceipt: { input: { requestId: string }; output: import('../domain/session-operation').SessionOperationReceipt | null }
  sendEmployeeMessage: { input: { expectedExecutionPermission?: import('../domain/execution').ExecutionPermission; materialUploads?: import('../domain/material-upload').SubmittedMaterial[]; materialSelections?: MaterialSelection[]; apiModel?: import('../domain/model-source').ApiModelOverride; workingDirectory?: string; composerReferences?: import('../domain/composer-references').ComposerReference[]; employeeId: string; content: string; requestId: string }; output: Message }
  deleteConversation: { input: { id: string }; output: void }
  updateConversationList: { input: ConversationListChange; output: void }
  clearConversationHistory: { input: { id: string; hide: boolean }; output: void }
  getConversation: { input: { id: string }; output: ConversationDetail }
  getConversationTrace: { input: { conversationId: string; messageId: string; turnId?: string }; output: StoredTraceSpan[] }
  transferMaterial: { input: import('../domain/material-upload').MaterialUploadInput; output: import('../domain/material-upload').MaterialUploadReceipt }
  prepareUploadedMaterial: { input: { conversationId: string; selectionId: string; requestId: string }; output: ConversationMaterial }
  chooseMaterialSource: { input: undefined; output: { id: string; name: string } | null }
  prepareMaterial: { input: { conversationId: string; selectionId: string; requestId: string; authorizedAgentIds?: string[] }; output: ConversationMaterial }
  getMaterialPreparation: { input: { requestId: string }; output: ConversationMaterial | null }
  getMaterialPreview: { input: { id: string; expectedRevision?: number }; output: MaterialPreview }
  recheckMaterial: { input: { id: string; expectedRevision: number }; output: MaterialPreview }
  discardMaterial: { input: { id: string; expectedRevision: number }; output: void }
  setMaterialAuthorization: { input: { id: string; expectedRevision: number; authorizedAgentIds: string[] }; output: ConversationMaterial }
  getMessageReceipt: { input: { requestId: string }; output: Message | null }
  getMessageExecution: { input: { requestId: string }; output: import('../domain/message-execution').MessageExecution | null }
  cancelMessageExecution: { input: { requestId: string }; output: import('../domain/message-execution').MessageExecution }
  referenceBrowserPage: { input: Record<string, never>; output: import('./browser').BrowserPageReference }
  sendMessage: { input: { steer?: import('../domain/execution').NativeSteeringTarget; expectedExecutionPermission?: import('../domain/execution').ExecutionPermission; materialUploads?: import('../domain/material-upload').SubmittedMaterial[]; apiModel?: import('../domain/model-source').ApiModelOverride; workingDirectory?: string; composerReferences?: import('../domain/composer-references').ComposerReference[]; channelReference?: import('../domain/channels').ChannelMessageReference; materialReference?: import('../domain/materials').MaterialReadRef; conversationId: string; content: string; browserReference?: Pick<import('./browser').BrowserPageReference, 'instanceId' | 'pageVersion'>; materialSelections?: MaterialSelection[]; mentionIds: string[]; requestId: string; replyToMessageId?: string; stopPrevious?: boolean }; output: Message }
  setMessageReaction: { input: { conversationId: string; messageId: string; emoji: string; active: boolean }; output: Message }
  getCancellationTargets: { input: { conversationId: string }; output: import('../domain/run-cancellation').CancellationTarget[] }
  getRunCancellation: { input: { conversationId: string; runId: string }; output: import('../domain/run-cancellation').RunCancellation }
  cancelRunExecution: { input: { conversationId: string; runId: string }; output: import('../domain/run-cancellation').RunCancellation }
  cancelRun: { input: { conversationId: string; workId?: string; runId?: string }; output: void }
  getDirectoryApprovalReceipt: { input: { id: string }; output: import('../domain/directory-access').DirectoryApprovalReceipt | null }
  approve: { input: { id: string; approved: boolean; always?: boolean; allowSameKind?: boolean }; output: void }
  revokeCommandPermission: { input: { agentId: string; revision: string }; output: void }
  importResource: { input: { kind: Resource['kind']; path: string; ownerAgentId?: string }; output: Resource }
  chooseKnowledgeSource: { input: undefined; output: { id: string; name: string } | null }
  saveEmployeeKnowledge: { input: import('../domain/knowledge').SaveEmployeeKnowledgeInput; output: import('../domain/knowledge').KnowledgeReceipt }
  setEmployeeKnowledgeSharing: { input: import('../domain/knowledge').KnowledgeSharingInput; output: import('../domain/knowledge').KnowledgeReceipt }
  removeEmployeeKnowledge: { input: import('../domain/knowledge').RemoveEmployeeKnowledgeInput; output: import('../domain/knowledge').KnowledgeReceipt }
  getEmployeeKnowledgeReceipt: { input: { requestId: string }; output: import('../domain/knowledge').KnowledgeReceipt | null }
  listEmployeeKnowledge: { input: { agentId: string }; output: Resource[] }
  getKnowledgeCitationPreview: { input: import('../domain/knowledge').KnowledgeCitationInput; output: import('../domain/knowledge').KnowledgePreview }
  getEmployeeKnowledgeFiles: { input: { agentId: string; resourceId: string }; output: import('../domain/knowledge').KnowledgeFilesView }
  getEmployeeKnowledgePreview: { input: { agentId: string; resourceId: string; contentHash: string; fileKey?: string }; output: import('../domain/knowledge').KnowledgePreview }
  removeResource: { input: { id: string }; output: void }
  retryRun: { input: { id: string; requestId: string; continuation?: boolean }; output: void }
  getAgentHome: { input: { agentId: string; conversationId?: string }; output: AgentHome }
  readAgentFile: { input: { agentId: string; name: string; conversationId?: string }; output: AgentFileContent }
  saveAgentFile: { input: { agentId: string; name: import('../domain/agent-profile').AgentSourceName; content: string; expectedHash: string; expectedConfigVersion: number }; output: AgentHome }
  regenerateAgentViews: { input: { agentId: string; conversationId?: string }; output: AgentHome }
  getMemory: { input: MemoryQuery; output: MemoryView }
  saveMemory: { input: MemoryInput; output: MemoryView }
  deleteMemory: { input: MemoryQuery & { id: string; expectedEpoch: number; requestId?: string }; output: MemoryView }
  clearMemory: { input: MemoryQuery & { expectedEpoch: number; requestId?: string }; output: MemoryView }
  // These three methods are handled by the desktop host, not by model tools.
  choosePath: { input: { kind: 'skill' | 'knowledge' }; output: string | null }
  openPath: { input: { path: string; action?: 'open' | 'reveal' }; output: void }
  exportBackup: { input: undefined; output: string | null }
  setUnsavedChanges: { input: { dirty: boolean; source?: 'business' | 'appearance' | 'shortcuts' | 'voice' }; output: void }
}
export type Method = keyof Methods
export interface DesktopApi {
  /** Trusted main-window-only voice bridge; absent from employee and external RPC. */
  voice?: import('../plugins/voice-input').VoiceApi
  getDesktopLifecycle?(): Promise<import('./desktop').DesktopLifecycle>
  exportDiagnostics?(): Promise<string | null>
  initialPlugins?: PluginSettingsSnapshot
  initialAppearance?: AppearanceSnapshot
  selectSkillFile?(file: File, kind: 'folder' | 'zip'): Promise<string>
  selectMaterialFile?(file: File): Promise<{ id: string; name: string }>
  writeClipboardText?(text: string): Promise<void>
  selectClipboardMaterialFiles?(): Promise<{ id: string; name: string }[]>
  request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>
  subscribe(listener: (event: AppEvent) => void): () => void
}
export interface RpcRequest { id: string; method: Method; input: unknown }
export type RpcResponse = { id: string; result?: unknown; error?: string }
export type RuntimeMessage = { type: 'ready' } | { type: 'response'; response: RpcResponse } | { type: 'event'; event: AppEvent }

declare global { interface Window { boai: DesktopApi } }
