/*
 * [OUTPUT]: application.guide公开员工任务五状态及交付验收规则。
 * [OUTPUT]: 公开计划操作排除内部任务消息，避免自定义类型进入工具JSON Schema。
 * [OUTPUT]: prompts域复用提示词模板CRUD与版本前检，contacts/prompts操作指南纳入现有业务协议。
 * [OUTPUT]: application.guide 增加 PPT 独立配置说明，保留原执行与配置分离。
 * [OUTPUT]: 技能安装映射与独立副本详情提供只读协议，更新前可精确核对原员工绑定和内容，复用原服务。
 * [OUTPUT]: 会话搜索/核心会话改名接原搜索schema和列表服务，稳定回执与本人发送边界保持。
 * [OUTPUT]: 登记的源文件与生成记忆/日期视图共用readFile；生成视图不可writeFile。
 * [OUTPUT]: 人格活动单条删除/截止时间清空沿写回执；运行记录前置拒绝，最小去重身份保留。
 * [OUTPUT]: 人格协议保存简单偏好；旧计划只读，后台检查沿内置策略和静默门槛。
 * [OUTPUT]: 新增七项人格/状态/行为操作，配置与状态CAs前置核对；源文件登记范围一致。
 * [INPUT]: Original typed service port and its existing employee/connection/conversation schemas.
 * [OUTPUT]: Explicit application use cases with discoverable schemas; create and execute stay separate.
 * [POS]: Registry adapter, no alternate employee, schedule, source or conversation service.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import type { ApplicationHostPort } from '@boai/shared/ipc/application-host'
import { appearancePatchSchema } from '@boai/shared/appearance/schema'
import { availableThemes } from '@boai/shared/appearance'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { profileSchema } from '../backends/profiles'
import { DEFAULT_EMPLOYEE_SOUL } from '@boai/shared/domain/agent-presets'
import { applicationGuides } from './application-tools'
import { channelBindingInputSchema, channelBindingActionSchema } from '../channels/channel-service'
import { knowledgeSourceSchema, saveEmployeeKnowledgeSchema, knowledgeSharingSchema, removeEmployeeKnowledgeSchema } from '@boai/shared/domain/knowledge'
import { randomUUID } from 'node:crypto'
import { agentSourceNameSchema, saveAgentProfileSchema, updateAgentStateSchema, deleteAgentBehaviorHistorySchema, clearAgentBehaviorHistorySchema } from '@boai/shared/domain/agent-profile'
import { z } from 'zod'
import type { Method, Methods } from '@boai/shared/ipc'
import { CONVERSATION_TITLE_MAX_LENGTH } from '@boai/shared/domain/conversation-list'
import { agentSchema } from '../employees/employee-service'
import { employeeCreationDefaults, EMPLOYEE_PRESETS } from '@boai/shared/domain/agent-presets'
import { saveDataSourceSchema, dataSourceConfigSchema, dataSourceIdentitySchema, dataSourceBindingsSchema } from '@boai/shared/domain/sources'
import { saveWebSearchDefaultSchema, saveWebSearchServiceSchema } from '@boai/shared/domain/web-search'
import { automationInputSchema } from '../automations/automation-service'
import { automationListSchema } from '../automations/automation-commands'
import { scheduleSchema } from '../automations/schedule-policy'
import { saveLocalSkillSchema, removeLocalSkillSchema } from '../resources/local-skill-editing'
import { scanSkillSchema, installSkillsSchema, prepareLocalSkillBindingSchema, bindLocalSkillSchema } from '../resources/skill-management'
import { updateSkillSchema } from '../resources/skill-updates'
import { marketplaceListSchema, marketplaceDetailSchema } from '../resources/skill-marketplace'
import { collectionChangeSchema } from '../resources/skill-collections'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
import { savePromptTemplateSchema, removePromptTemplateSchema } from '@boai/shared/domain/prompt-templates'

export interface ApplicationPort { request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>; personality?(action: 'profile' | 'configure' | 'state' | 'updateState' | 'behaviorHistory' | 'runBehavior' | 'stopBehavior' | 'validateHistoryDeletion' | 'deleteBehaviorHistory' | 'clearBehaviorHistory', input: any): Promise<unknown> }
const id = z.string().trim().min(1).max(200), version = z.number().int().positive()
const empty = z.object({}).strict(), lookup = z.object({ id }).strict()
type Shape = z.ZodObject<any>
export function applicationOperations(port: ApplicationPort, schemas: { connection: Shape; conversation: Shape; search: z.ZodType<Methods['searchConversations']['input']> }, host?: ApplicationHostPort): ApplicationOperation[] {
  const operations: ApplicationOperation[] = []
  function operation(name: string, description: string, effect: ApplicationOperation['effect'], input: z.ZodType, resultType: string, execute: ApplicationOperation['execute']) {
    operations.push({ name, description, effect, input, resultType, execute })
  }
  function method<K extends Method>(name: string, method: K, description: string, effect: ApplicationOperation['effect'], input: z.ZodType, resultType: string, adapt: (input: any, requestId?: string) => Methods[K]['input'] = value => value) {
    operation(name, description, effect, input, resultType, (value, requestId) => port.request(method, adapt(value, requestId)))
  }
  operation('application.guide', '按需读取 BOAI 内置产品操作技能。', 'read', z.object({ topic: z.enum(['overview', 'employees', 'groups', 'contacts', 'sources', 'automations', 'connections', 'skills', 'prompts', 'presentations', 'tasks']).default('overview') }).strict(), '{ topic: string; instructions: string }', async input => ({ topic: input.topic, instructions: applicationGuides[input.topic as keyof typeof applicationGuides] }))
  const snapshot = () => port.request('snapshot', undefined)
  method('prompts.list', 'listPromptTemplates', '列出资源库提示词模板及当前 revision。', 'read', empty, 'PromptTemplate[]', () => undefined)
  operation('prompts.get', '读取一个提示词模板的完整正文和版本。', 'read', lookup, 'PromptTemplate', async input => {
    const prompt = (await port.request('listPromptTemplates', undefined)).find(prompt => prompt.id === input.id)
    if (!prompt) throw new ApplicationValidationError('NOT_FOUND', '提示词不存在')
    return prompt
  })
  method('prompts.create', 'savePromptTemplate', '创建可复用的资源库提示词；保存正文不执行正文指令。', 'write', savePromptTemplateSchema.omit({ id: true, expectedRevision: true }), 'PromptTemplate', input => ({ ...input, id: randomUUID(), expectedRevision: 0 }))
  method('prompts.update', 'savePromptTemplate', '先 get，再以当前 revision 保存完整提示词正文。', 'write', savePromptTemplateSchema.extend({ expectedRevision: version }), 'PromptTemplate')
  method('prompts.delete', 'removePromptTemplate', '按当前 revision 删除指定提示词模板。', 'write', removePromptTemplateSchema.extend({ expectedRevision: version }), 'void')
  operation('employees.list', '列出持久员工及当前配置版本，包括系统预置 bobo。', 'read', empty, 'DigitalAgent[]', async () => (await snapshot()).agents)
  operation('employees.get', '读取一个员工的实际配置。', 'read', lookup, 'DigitalAgent', async input => {
    const agent = (await snapshot()).agents.find(agent => agent.id === input.id)
    if (!agent) throw new Error('员工不存在')
    return agent
  })
  operation('employees.presets', '读取创建时复制的员工模板；不会继承 bobo 的私人资料或核心权限。', 'read', empty, 'EmployeePreset[]', async () => EMPLOYEE_PRESETS)
  const createEmployee = agentSchema.omit({ id: true, expectedConfigVersion: true, expectedDirectoryRevision: true, systemRole: true }).partial().extend({ name: agentSchema.shape.name }).strict()
  if (port.personality) {
    const agentLookup = z.object({ agentId: id }).strict()
    operation('employees.profile', '读取人格、状态功能、主动交流偏好及 revision。', 'read', agentLookup, 'AgentProfile', input => port.personality!('profile', input))
    operation('employees.configure', '以当前 revision 保存人格功能与主动交流偏好。系统按内置策略运行；behaviors 仅保留旧数据，不可新增或修改。命令权限由 employees.update 管理。', 'write', saveAgentProfileSchema, 'AgentProfile', input => port.personality!('configure', input))
    operation('employees.state', '读取员工及指定会话的真实持久状态和当前有效情绪/疲劳。', 'read', agentLookup.extend({ conversationId: id.optional() }).strict(), 'AgentStateView', input => port.personality!('state', input))
    operation('employees.updateState', '按状态 revision 调整情绪、休息或虚拟旅行；不改变员工配置版本。', 'write', updateAgentStateSchema, 'AgentPersonalityState', input => port.personality!('updateState', input))
    operation('employees.behaviorHistory', '查看员工真实行为记录，含跳过、失败和中断。', 'read', agentLookup, 'AgentBehaviorRun[]', input => port.personality!('behaviorHistory', input))
    operation('employees.runBehavior', '检查一次内置人格活动，仍遵守功能开关、频率、免打扰及新内容门槛；不需要更新时返回 null。同 requestId 不重放。', 'write', agentLookup.extend({ behaviorId: z.enum(['personality-heartbeat', 'builtin-emotion', 'builtin-reflection', 'builtin-travel', 'builtin-greeting']) }).strict(), 'AgentBehaviorRun | null', (input, requestId) => port.personality!('runBehavior', { ...input, requestId }))
    operation('employees.stopBehavior', '取消一个实际进行中的员工行为。', 'write', z.object({ runId: id }).strict(), 'void', input => port.personality!('stopBehavior', input))
    operation('employees.deleteBehaviorHistory', '删除当前员工的一条已结束人格活动记录；保留当前状态、聊天及最小去重身份，不重新执行活动。', 'write', deleteAgentBehaviorHistorySchema, 'AgentBehaviorHistoryCleanup', input => port.personality!('deleteBehaviorHistory', input))
    operations.at(-1)!.validate = async input => { await port.personality!('validateHistoryDeletion', input) }
    operation('employees.clearBehaviorHistory', '清空当前员工在 before 截止时间前已结束的人格活动记录（包括未展示的更早记录）；保留运行中与后来结束的记录、状态、聊天及去重身份。', 'write', clearAgentBehaviorHistorySchema, 'AgentBehaviorHistoryCleanup', input => port.personality!('clearBehaviorHistory', input))
    operations.at(-1)!.validate = async input => { await port.personality!('profile', { agentId: input.agentId }) }
  }
  operation('employees.create', '独立创建员工；只需姓名，可补职责和高级设置。默认采用 bobo 当前 API 模型或唯一连接；不组群、不开始工作。多个连接且无默认时请明确选择。', 'write', createEmployee, 'DigitalAgent', async input => {
    const current = await snapshot()
    return port.request('saveAgent', employeeCreationDefaults(input, current.connections, current.agents))
  })
  method('employees.update', 'saveAgent', '保存完整员工配置；先 get，使用原 configVersion。核心身份由宿主确定。', 'write', agentSchema.omit({ systemRole: true, initialSoul: true }).extend({ id, expectedConfigVersion: version }).strict(), 'DigitalAgent')
  method('employees.delete', 'deleteAgent', '删除指定普通员工及其关联资料；bobo 不能删除。', 'write', lookup, 'void')
  method('employees.files', 'getAgentHome', '查看员工工作区源文件与记忆视图。', 'read', z.object({ agentId: id }).strict(), 'AgentHome')
  method('employees.readFile', 'readAgentFile', '读取工作规则、人格、场景模块或已生成的员工记忆/日期日记视图；生成视图不可通过writeFile修改。', 'read', z.object({ agentId: id, name: z.union([agentSourceNameSchema, z.enum(['IDENTITY.md', 'USER.md', 'MEMORY.md']), z.string().regex(/^memory\/\d{4}-\d{2}-\d{2}\.md$/)]) }).strict(), 'AgentFileContent')
  method('employees.writeFile', 'saveAgentFile', '按文件 hash 和员工版本保存完整人格或场景模块；每文件最多64 KiB。', 'write', z.object({ agentId: id, name: agentSourceNameSchema, content: z.string().max(64000), expectedHash: z.string().regex(/^(?:[a-f0-9]{64})?$/), expectedConfigVersion: version }).strict(), 'AgentHome')

  operation('connections.list', '列出已保存的模型连接，不返回密钥。', 'read', empty, 'Connection[]', async () => (await snapshot()).connections)
  method('connections.create', 'saveConnection', '添加模型连接；不会调用模型测试。密钥仅写入原凭据服务。', 'write', schemas.connection.omit({ id: true, expectedRevision: true, localConfigId: true }), 'Connection')
  method('connections.update', 'saveConnection', '以当前 revision 更新模型连接；省略 apiKey 保留，空串清除。', 'write', schemas.connection.extend({ id, expectedRevision: version }), 'Connection')
  method('connections.delete', 'deleteConnection', '删除模型连接；原员工引用按现行服务处理。', 'write', lookup, 'void')
  operation('connections.models', '读取所选连接的实际模型目录，不启动聊天。', 'read', lookup, 'string[]', async input => {
    const connection = (await snapshot()).connections.find(connection => connection.id === input.id)
    if (!connection) throw new Error('连接不存在')
    return port.request('listConnectionModels', { id: connection.id, baseUrl: connection.baseUrl, gateway: connection.gateway, expectedRevision: connection.revision })
  })
  method('runtimes.list', 'listLaunchProfiles', '列出已保存的本机执行配置，保留原生能力和来源。', 'read', empty, 'LaunchProfile[]', () => undefined)
  method('runtimes.status', 'getLaunchProfileStatus', '只读检查实际程序与已有验证，不启动模型。', 'read', lookup, 'LaunchProfileStatus')
  method('runtimes.save', 'saveLaunchProfile', '保存明确的本机程序配置，沿原程序来源与主机访问确认；编辑必须带 expectedRevision，不安装程序或迁移登录。', 'write', profileSchema.refine(value => !value.id || value.expectedRevision !== undefined, '编辑需要当前版本'), 'LaunchProfile')
  method('runtimes.test', 'testLaunchProfile', '显式验证本机程序协议；会启动配置的程序，不能把保存视为验证通过。', 'write', lookup, 'LaunchProfile')
  method('runtimes.delete', 'deleteLaunchProfile', '删除 BOAI 本机连接配置，保留外部程序和原生登录。', 'write', lookup, 'void')
  method('connections.test', 'testConnection', '明确发送一次模型连接测试，可能产生供应商用量。', 'write', lookup, '{ text: string }')

  method('sources.list', 'listDataSources', '列出业务数据源，不含凭据。网页检索使用独立 webSearch 配置。', 'read', empty, 'DataSource[]', () => undefined)
  method('sources.get', 'getDataSource', '读取数据源配置、版本和测试状态，不含凭据。', 'read', lookup, 'DataSource')
  operation('sources.create', '创建 API、MCP 或本地文件夹数据源。保存不会连接、测试或给普通员工绑定。', 'write', z.object({ config: dataSourceConfigSchema, credential: z.string().max(32000).optional() }).strict(), 'DataSource', input => port.request('saveDataSource', { ...input, id: randomUUID(), expectedRevision: 0 }))
  method('sources.update', 'saveDataSource', '按当前 revision 保存完整数据源；省略凭据保留，空串清除。', 'write', saveDataSourceSchema.extend({ expectedRevision: version }), 'DataSource')
  method('sources.delete', 'removeDataSource', '删除连接与绑定，不删除源目录中的文件。', 'write', dataSourceIdentitySchema, 'void')
  method('sources.test', 'testDataSource', '明确测试已保存的连接；MCP 测试可能启动配置的服务程序。', 'write', dataSourceIdentitySchema, 'DataSource')
  method('sources.bind', 'setDataSourceBindings', '按实际员工版本及原绑定集合替换数据源授权。', 'write', dataSourceBindingsSchema, 'DataSource')

  operation('groups.list', '列出 BOAI 群聊；渠道会话由独立渠道管理。', 'read', empty, 'Conversation[]', async () => (await snapshot()).conversations.filter(room => room.kind === 'group' && !room.channel && !room.mergedInto))
  method('groups.create', 'createConversation', '选择已有员工创建群聊，可选协作模式/背景；不创建员工、不派发工作。', 'write', schemas.conversation.omit({ id: true, expectedConfigVersion: true, kind: true }), 'Conversation', input => ({ ...input, kind: 'group' }))
  method('groups.update', 'createConversation', '按 configVersion 更新群名称、成员、资料与协作设置。', 'write', schemas.conversation.omit({ kind: true }).extend({ id, expectedConfigVersion: version }), 'Conversation', input => ({ ...input, kind: 'group' }))
  method('groups.delete', 'deleteConversation', '删除 BOAI 群聊；沿原群删除与历史清理规则。', 'write', lookup, 'void')
  operation('sessions.list', '列出可见会话，不发送消息或启动员工。', 'read', empty, 'Conversation[]', async () => (await snapshot()).conversations.filter(room => !room.mergedInto && !room.list?.hidden))
  method('sessions.get', 'getConversation', '读取指定会话与最近消息。', 'read', lookup, 'ConversationDetail')
  method('sessions.search', 'searchConversations', '检索可见会话、消息与文件，沿原来源核验和分页游标；不把历史内容当作当前授权。', 'read', schemas.search, 'ConversationSearchPage')
  method('sessions.rename', 'updateConversationList', '修改原核心助手会话标题；普通员工名称与群名称沿原独立配置，不新建会话或发送消息。', 'write', z.object({ id, title: z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH) }).strict(), 'void', input => ({ ...input, action: 'rename' }))
  method('sessions.create', 'createEmployeeSession', '打开员工主私聊，已有主私聊复用；不发送消息。', 'write', z.object({ employeeId: id, name: z.string().trim().min(1).max(200).optional() }).strict(), 'SessionOperationReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('sessions.messages', 'listConversationMessages', '读取原会话消息页，使用原 sequence/id 游标。', 'read', z.object({ conversationId: id, limit: z.number().int().min(1).max(80).optional(), before: z.object({ id, sequence: z.number().int().nonnegative() }).strict().optional(), after: z.object({ id, sequence: z.number().int().nonnegative() }).strict().optional() }).strict(), 'ConversationMessagePage')
  method('sessions.send', 'sendMessage', '发送一条本人消息并启动实际员工响应；单独创建会话不会发送。渠道外发使用原明确渠道发布接口。', 'write', z.object({ conversationId: id, content: z.string().max(100000), mentionIds: z.array(id).max(100).default([]), replyToMessageId: id.optional() }).strict(), 'Message', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('sessions.delete', 'deleteSession', '清空并隐藏原会话，保留原删除回执。', 'write', z.object({ conversationId: id }).strict(), 'SessionOperationReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))

  method('automations.list', 'listOwnerAutomations', '按员工或群列出定时任务及下一次时间。省略 owner 查看全部。', 'read', automationListSchema, 'AutomationListPage')
  method('automations.get', 'getAutomation', '读取计划及 revision，不执行任务。', 'read', lookup, 'AutomationDefinition | null')
  method('automations.preview', 'previewAutomation', '核对实际时区与未来执行时间。', 'read', scheduleSchema, '{ nextTimes: string[] }')
  method('automations.create', 'saveAutomation', '创建定时计划，明确 owner/时间/时区/prompt；不会立即执行。单员工计划可使用 owner 与默认独立执行上下文。', 'write', automationInputSchema.omit({ employeeTask: true, id: true, expectedRevision: true, requestId: true }), 'AutomationDefinition', (input, requestId) => ({ ...input, requestId }))
  method('automations.update', 'saveAutomation', '以当前 revision 保存完整计划；修改计划不手动运行。', 'write', automationInputSchema.omit({ employeeTask: true, requestId: true }).extend({ id, expectedRevision: version }), 'AutomationDefinition', (input, requestId) => ({ ...input, requestId }))
  method('automations.history', 'listAutomationHistory', '分页查询计划的真实执行历史。', 'read', z.object({ automationId: id.optional(), status: z.enum(['all', 'active', 'completed', 'attention']).optional(), search: z.string().max(200).optional(), before: z.object({ startedAt: z.iso.datetime(), id: z.string().min(1).max(500) }).strict().optional(), limit: z.number().int().min(1).max(100).default(30) }).strict(), 'AutomationHistoryPage')
  method('automations.occurrence', 'getAutomationOccurrence', '读取一个实际执行记录，id 为 occurrence ID。', 'read', lookup, 'AutomationOccurrence')
  method('automations.stop', 'stopAutomation', '停止指定实际执行记录；id 为 occurrence ID，不是计划 ID。', 'write', lookup, 'void')
  method('automations.pause', 'pauseAutomation', '暂停计划未来调度。', 'write', lookup, 'void')
  method('automations.resume', 'resumeAutomation', '恢复计划未来调度。', 'write', lookup, 'AutomationDefinition')
  method('automations.delete', 'deleteAutomation', '删除计划，沿原调度和实际退出规则。', 'write', lookup, 'void')
  method('automations.run', 'runAutomation', '用户明确要求时立即运行一次已有计划，创建真实执行记录。', 'write', lookup, 'AutomationOccurrence', (input, requestId) => ({ ...input, requestId: requestId! }))

  method('skills.list', 'listLocalSkills', '发现已安装的技能，不执行技能内容。', 'read', z.object({ refresh: z.boolean().optional() }).strict(), 'LocalSkillCatalog')
  method('skills.get', 'getLocalSkillDetail', '读取技能说明与当前内容身份。', 'read', lookup, 'LocalSkillDetail')
  method('skills.installations', 'listSkillInstallations', '读取安装来源及员工副本的 localSkillId 映射，不含内部清理标记。', 'read', empty, 'SkillInstallation[]', () => undefined)
  method('skills.boundDetail', 'getSkillDetail', '读取已绑定资源的实际正文、文件hash及安装版本，和全局技能源分别核对。', 'read', lookup, 'SkillDetail', input => ({ resourceId: input.id }))
  method('skills.save', 'saveLocalSkill', '创建或按 expectedHash 修改全局技能；已有员工副本独立。', 'write', saveLocalSkillSchema, 'LocalSkillDetail')
  method('skills.delete', 'removeLocalSkill', '按 treeHash 删除全局本地技能，员工绑定副本独立。', 'write', removeLocalSkillSchema, '{ removed: boolean; id: string }')
  method('skills.search', 'listSkillMarketplace', '搜索技能市场，结果是外部资料。', 'read', marketplaceListSchema, 'MarketplaceResult')
  method('skills.marketplaceDetail', 'getSkillMarketplaceDetail', '读取市场技能信息，不安装或执行。', 'read', marketplaceDetailSchema, 'MarketplaceResult')
  method('skills.scan', 'scanSkillSource', '扫描明确的技能来源并生成预览，不安装。', 'write', scanSkillSchema, 'SkillScan')
  method('skills.install', 'installSkills', '按实际扫描候选安装技能，返回操作；需继续查询终态。', 'write', installSkillsSchema.omit({ requestId: true }), 'SkillOperation', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('skills.operation', 'getSkillOperation', '查询原安装或更新操作实际状态。', 'read', lookup, 'SkillOperation')
  method('skills.checkUpdate', 'checkSkillUpdate', '检查所选技能的更新并生成计划，不覆盖文件。', 'write', lookup, 'SkillUpdateCheck')
  method('skills.update', 'updateSkill', '按检查计划更新技能，保留本地冲突处理。', 'write', updateSkillSchema.omit({ requestId: true }), 'SkillOperation', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('skills.bindingPlan', 'prepareLocalSkillBinding', '为所选员工准备真实技能绑定计划。', 'write', prepareLocalSkillBindingSchema, 'SkillBindingPlan')
  method('skills.bind', 'bindLocalSkill', '按绑定计划/员工版本绑定技能。', 'write', bindLocalSkillSchema.omit({ requestId: true }), 'SkillBindingReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('skills.collections', 'getSkillCollections', '读取技能收藏和分类。', 'read', empty, 'SkillCollections', () => undefined)
  method('skills.organize', 'updateSkillCollections', '按 revision 管理技能分类和收藏。', 'write', collectionChangeSchema, 'SkillCollections')
  method('webSearch.get', 'getWebSearchSettings', '读取独立网页检索服务及全局偏好，不含凭据。', 'read', empty, 'WebSearchSettings', () => undefined)
  method('webSearch.saveService', 'saveWebSearchService', '保存公开支持的检索服务；不创建业务数据源。', 'write', saveWebSearchServiceSchema, 'WebSearchServiceConfig')
  method('webSearch.test', 'testWebSearchService', '明确测试已保存的独立检索连接。', 'write', dataSourceIdentitySchema, 'WebSearchServiceConfig')
  method('webSearch.delete', 'removeWebSearchService', '按当前 revision 删除独立检索服务配置。', 'write', dataSourceIdentitySchema, 'void')
  method('webSearch.setDefault', 'saveWebSearchDefault', '设置全局网页检索偏好，员工可独立配置。', 'write', saveWebSearchDefaultSchema, 'WebSearchSettings')
  method('knowledge.list', 'listEmployeeKnowledge', '列出员工独立保留的知识资料。', 'read', z.object({ agentId: id }).strict(), 'Resource[]')
  method('knowledge.save', 'saveEmployeeKnowledge', '将实际会话附件或成果保留为员工知识，必须提供固定内容身份；文件上传沿材料传输入口。', 'write', saveEmployeeKnowledgeSchema.omit({ requestId: true }).extend({ source: knowledgeSourceSchema }), 'KnowledgeReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('knowledge.remove', 'removeEmployeeKnowledge', '按员工配置版本移除一份知识资料。', 'write', removeEmployeeKnowledgeSchema.omit({ requestId: true }), 'KnowledgeReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('knowledge.share', 'setEmployeeKnowledgeSharing', '明确将员工资料共享给指定群或取消共享。', 'write', knowledgeSharingSchema.omit({ requestId: true }), 'KnowledgeReceipt', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('channels.list', 'listChannelBindings', '列出指定员工的渠道绑定和连接状态，不包含凭据。', 'read', z.object({ agentId: id }).strict(), 'ChannelBindingState[]')
  method('channels.create', 'saveChannelBinding', '创建员工渠道绑定及明确允许的用户/群范围，不发送消息。', 'write', channelBindingInputSchema.omit({ id: true, expectedRevision: true, requestId: true }), 'ChannelBindingState', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('channels.update', 'saveChannelBinding', '按当前 revision 更新员工渠道设置，不发送消息。', 'write', channelBindingInputSchema.omit({ requestId: true }).extend({ id, expectedRevision: version }), 'ChannelBindingState', (input, requestId) => ({ ...input, requestId: requestId! }))
  method('channels.connect', 'connectChannelBinding', '明确连接已保存的渠道并开始接收获准消息。', 'write', channelBindingActionSchema, 'void')
  method('channels.disconnect', 'disconnectChannelBinding', '断开已保存的渠道连接。', 'write', channelBindingActionSchema, 'void')
  method('channels.delete', 'removeChannelBinding', '按当前 revision 删除渠道绑定。', 'write', channelBindingActionSchema, 'void')
  method('runtimePlugins.list', 'listRuntimePlugins', '读取本机运行时插件及状态。', 'read', empty, 'RuntimePluginCatalog', () => undefined)
  method('runtimePlugins.setEnabled', 'setRuntimePluginEnabled', '按当前目录 revision 启停已安装运行时插件，保留真实退出要求。', 'write', z.object({ id, enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() }).strict(), 'RuntimePluginCatalog')
  method('runtimePlugins.uninstall', 'uninstallRuntimePlugin', '按当前目录 revision 卸载已安装运行时插件。', 'write', z.object({ id, expectedRevision: z.number().int().nonnegative() }).strict(), 'RuntimePluginCatalog')
  const versionChecks: Record<string, { field: string; current(input: any): Promise<number | undefined> }> = {
    'prompts.update': { field: 'expectedRevision', current: async input => (await port.request('listPromptTemplates', undefined)).find(prompt => prompt.id === input.id)?.revision },
    'prompts.delete': { field: 'expectedRevision', current: async input => (await port.request('listPromptTemplates', undefined)).find(prompt => prompt.id === input.id)?.revision },
    ...(port.personality ? {
      'employees.configure': { field: 'expectedRevision', current: async (input: any) => (await port.personality!('profile', { agentId: input.agentId }) as { revision: number }).revision },
      'employees.updateState': { field: 'expectedRevision', current: async (input: any) => { const state = await port.personality!('state', { agentId: input.agentId, conversationId: input.conversationId }) as { base: { revision: number }; context?: { revision: number } }; return (input.conversationId ? state.context : state.base)?.revision } },
    } : {}),
    'employees.update': { field: 'expectedConfigVersion', current: async input => (await snapshot()).agents.find(agent => agent.id === input.id)?.configVersion },
    'connections.update': { field: 'expectedRevision', current: async input => (await snapshot()).connections.find(connection => connection.id === input.id)?.revision ?? undefined },
    'groups.update': { field: 'expectedConfigVersion', current: async input => (await snapshot()).conversations.find(room => room.id === input.id && room.kind === 'group')?.configVersion },
    'sources.update': { field: 'expectedRevision', current: async input => (await port.request('listDataSources', undefined)).find(source => source.id === input.id)?.revision },
    'automations.update': { field: 'expectedRevision', current: async input => (await port.request('getAutomation', { id: input.id }))?.revision },
  }
  for (const operation of operations) {
    const check = versionChecks[operation.name]
    if (check) operation.validate = async (input: Record<string, unknown>) => {
      const actual = await check.current(input)
      if (actual === undefined) throw new ApplicationValidationError('NOT_FOUND', '目标对象不存在或类型不匹配。')
      if (actual !== input[check.field]) throw new ApplicationValidationError('REVISION_CONFLICT', '目标已被修改，请读取当前版本后重新提交。')
    }
  }
  const hostStart = operations.length
  method('appearance.get', 'getAppearance', '读取实际外观、主题选择和 revision。需要连接桌面宿主。', 'read', empty, 'AppearanceSnapshot', () => undefined)
  operation('appearance.themes', '列出当前可选择的明暗主题。', 'read', empty, 'Theme[]', async () => availableThemes((await port.request('getPluginSettings', undefined)).disabledIds))
  method('appearance.update', 'updateAppearance', '按当前 revision 更新主题/明暗模式/字体/缩放，立即沿原桌面事件生效。', 'write', z.object({ patch: appearancePatchSchema, expectedRevision: z.number().int().nonnegative() }).strict(), 'AppearanceSnapshot')
  method('appearance.reset', 'resetAppearance', '明确恢复默认外观。', 'write', empty, 'AppearanceSnapshot', () => undefined)
  method('appearance.removeBackground', 'removeAppearanceBackground', '移除应用背景图配置。', 'write', empty, 'AppearanceSnapshot', () => undefined)
  operation('plugins.list', '读取内置插件清单与持久启停状态。', 'read', empty, '{ plugins: ApplicationPluginManifest[]; settings: PluginSettingsSnapshot }', async () => ({ plugins: applicationPlugins, settings: await port.request('getPluginSettings', undefined) }))
  method('plugins.setEnabled', 'setPluginEnabled', '按当前设置 revision 启停内置插件。', 'write', z.object({ id, enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() }).strict(), 'PluginSettingsSnapshot')
  for (const operation of operations.slice(hostStart)) { operation.available = () => host?.available ?? false; operation.unavailableReason = '需要连接同一配置目录的 BOAI 桌面宿主；不会启动第二个设置写入器。' }
  operations.find(operation => operation.name === 'sessions.send')!.ownerOnly = true
  return operations
}
