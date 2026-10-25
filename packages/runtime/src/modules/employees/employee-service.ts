/*
 * [OUTPUT]: API命令开关独立保存；整体只读始终禁命令，原生权限映射保持，不因改名重新启用已关闭命令。
 * [OUTPUT]: 单独追加技能保留当前运行的冻结技能集合，通过宿主更新兼容版本；移除/替换及其他配置变更仍取消旧运行。
 * [OUTPUT]: 仅首次创建 Bobo 同事务登记默认技能源绑定标记，既有员工不自动加回技能。
 * [OUTPUT]: 2026-10-19核心预设允许实际命令/完全访问，显式既有权限保留；完整适配人格仅升级精确旧默认，不覆盖自定义。
 * [OUTPUT]: 2026-10-19应用业务协议：bobo仅精确旧出厂规则/人格迁移；创建可初始人格，已有编辑保持hash/版本。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: webSearch检索偏好沿员工配置版本保存，不改变执行或模型权限。
 * [OUTPUT]: 员工知识资料绑定核对所属员工，不能借配置保存读取其他员工专属资料。
 * [OUTPUT]: 明确持久目录批准使用独立版本且不取消原任务，配置保存核对目录版本；核心员工可明确设置权限，旧定义不自动升级。
 * [OUTPUT]: 原生/插件实际目录策略接线前拒绝显式目录配置，保留未配置旧员工；不能以配置保存冒充原生权限生效。
 * [OUTPUT]: 员工可选目录许可严格校验并规范为真实路径；省略/未变条目保持旧配置及离线磁盘兼容，不修改cwd或业务目录。
 * [OUTPUT]: 整体执行权限按员工版本保存并派生原生审批/访问范围，API与本机宿主操作共用；清理旧永久命令授权。
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [OUTPUT]: 网关原始推理档位持久化前核对来源匹配目录，直连保留原固定档位。
 * [OUTPUT]: 关闭命令、停用或切离API后端时，同事务清理独立永久命令授权。
 * [OUTPUT]: 数据源独立配置/凭据与员工sourceIds接线；版本核对、撤权和实际调用退出沿宿主边界。
 * [OUTPUT]: 通用runtime-plugin员工/核心绑定schema；原身份与工作退出门禁保持。
 * [OUTPUT]: 通用运行时插件员工保持原身份、绑定和核心员工规则。
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [OUTPUT]: Claude核心与组织/具名团队沿已核对程序及明确API来源接线；新员工保留原运行绑定，发布前重核指纹，自动化门禁暂保留。
 * [OUTPUT]: Claude员工类型可沿原定义保存；首批仅普通员工，核心与群协作的准入独立保留。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: codex-local保留独立身份，交互任务可沿宿主逐次申请命令；已绑定技能/知识沿冻结资源接入，浏览器保持未接入门禁。
 * [OUTPUT]: Exact shipped persona/scene defaults upgrade through the existing journal; custom or missing sources remain authoritative.
 * [INPUT]: 员工配置、受管工作区、存储与头像合同。
 * [OUTPUT]: Mastra 员工及 bobo 默认具备浏览器能力，旧关闭/缺省字段在启动与 registry 正规化且不额外提升配置版本，ACP 仅正规化为不支持；配置变更沿原取消/版本边界； 显式单技能绑定在调用者 SQLite 事务内比较员工版本并保存授权；提交后区分追加兼容/其他配置取消，并复用记忆失效、registry 与工作区同步。
 * [OUTPUT]: 新旧库补齐唯一 bobo 核心身份并保留改名/模型选择，拒绝身份伪造、停用、命令和 ACP；已提交员工整批内存安装与完整重载；版本校验的员工保存、独立思考强度与头像持久化和系统文件同步；拒绝无效思考档位、外链或超限头像。
 * [POS]: runtime/modules/employees 的员工定义服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defaultSkillSeedRecord } from '../resources/bundled-skills'
import { BOBO_RULES, BOBO_SOUL, LEGACY_SIMPLIFIED_BOBO_SOUL, LEGACY_BOBO_RULES, DEFAULT_EMPLOYEE_SOUL } from '@boai/shared/domain/agent-presets'
import { previousPromptHashes, promptSourceDefaults } from '@boai/shared/domain/agent-prompts'
import { previousBoboPersonaHashes } from '@boai/shared/domain/bobo-persona'
import type { AgentSourceName } from '@boai/shared/domain/agent-profile'
import { MODEL_ID_MAX_LENGTH, validModelId } from '@boai/shared/domain/model-id'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { AgentInput, DigitalAgent, Connection, Resource, MemoryEntry } from '@boai/shared/domain'
import { commandPermissionCollection, canRememberCommands } from './command-permissions'
import { ProductStore, type StoredRecord, type RecordTransaction } from '../../adapters/storage/product-store'
import { WorkspaceService } from '../workspaces/workspace-service'
import { avatarPresets, AVATAR_IMAGE_MAX_LENGTH } from '@boai/shared/domain/avatars'
import { assertThinkingPreference, thinkingLevelPattern, thinkingLevels } from '@boai/shared/domain/model-preferences'
import { CORE_AGENT_ID, CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '@boai/shared/domain/core-agent'
import { executionPermissionNativeOptions } from '@boai/shared/domain/execution'
import { directoryGrantsSchema } from '@boai/shared/domain/directory-access'
import { webSearchPreferenceSchema } from '@boai/shared/domain/sources'
import { normalizeDirectoryGrants } from '../workspaces/directory-access'

export const backendSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('runtime-plugin'),profileId:z.string().min(1).max(200),pluginId:z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/),providerId:z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/)}).strict(),z.object({kind:z.literal('mastra-model')}).strict(),z.object({kind:z.enum(['acp-local','codex-local','claude-local']),profileId:z.string().min(1).max(200)}).strict()])
const id = z.string().trim().min(1).max(200)
const ids = z.array(id).max(100).refine(value => new Set(value).size === value.length, '不能包含重复 ID')
const text = (max: number) => z.string().trim().min(1).max(max)
const avatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id: z.enum(avatarPresets.map(preset => preset.id)) }).strict(),
  z.object({ kind: z.literal('image'), dataUrl: z.string().max(AVATAR_IMAGE_MAX_LENGTH).regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/, '头像必须是本地 PNG 图片') }).strict(),
])
export const agentSchema = z.object({ initialSoul: z.string().max(64000).optional(), webSearch: webSearchPreferenceSchema.optional(), directoryGrants: directoryGrantsSchema.optional(), expectedDirectoryRevision: z.number().int().nonnegative().optional(), executionPermission: z.enum(['read-only','ask','full-access']).optional(), nativeOptions: z.object({ useNativePermissions: z.boolean().optional(), effort: z.string().max(40).optional(), codexApprovalPolicy: z.enum(['untrusted','on-request','never']).optional(), codexSandbox: z.enum(['read-only','workspace-write','danger-full-access']).optional(), claudePermissionMode: z.enum(['default','acceptEdits','plan','dontAsk','bypassPermissions']).optional() }).strict().optional(), systemRole: z.literal('core').optional(), avatar: avatarSchema.optional(), thinkingLevel: z.string().regex(thinkingLevelPattern).optional(), executionBackend: backendSchema.optional(), id: id.optional(), expectedConfigVersion: z.number().int().positive().optional(), name: text(100), role: z.string().max(1000), instructions: z.string().max(40000), color: z.string().regex(/^#[0-9a-f]{6}$/i), connectionId: z.string().max(200), modelId: z.string().trim().max(MODEL_ID_MAX_LENGTH).refine(value => validModelId(value, true), '无效的模型 ID'), sourceIds: ids.optional(), skillIds: ids, knowledgeIds: ids, allowBrowser: z.boolean().optional(), allowCommands: z.boolean(), active: z.boolean() }).strict()

const clone = <T>(value: T): T => structuredClone(value)
const record = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const fail = (message: string): never => { throw new Error(message) }
interface EmployeeHooks {
  modelCatalog?(connection: Connection): import('@boai/shared/domain/model-gateway').ModelCatalog | undefined
  connection(id: string): Connection
  resource(id: string): Resource | undefined
  cancel(id: string, reason: string): Promise<void>
  skillsAdded?(previous: DigitalAgent, current: DigitalAgent): Promise<void>
  invalidateMemory(id: string, matches: (entry: MemoryEntry) => boolean): Promise<void>
  changed(): void
}

/** Sole definition registry. Mutations run in AppService's existing serialized transaction queue. */
export class EmployeeService {
  private definitions = new Map<string, DigitalAgent>()
  constructor(private readonly store: ProductStore, private readonly homes: WorkspaceService, private readonly hooks: EmployeeHooks) {}
  get(id: string): DigitalAgent { return clone(this.definitions.get(id) ?? fail('员工不存在')) }
  find(id: string): DigitalAgent | undefined { const value = this.definitions.get(id); return value && clone(value) }
  values(): DigitalAgent[] { return [...this.definitions.values()].map(clone) }
  /** Install only a successfully persisted definition; callers never retain the registry object. */
  install(id: string, agent: DigitalAgent) { this.definitions.set(id, { ...clone(agent), allowBrowser: (agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' }) }
  /** Clone the entire batch before one registry swap; no partially installed snapshot. */
  installBatch(agents: DigitalAgent[], replace = false) {
    const next = replace ? new Map<string, DigitalAgent>() : new Map(this.definitions)
    for (const agent of agents) next.set(agent.id, { ...clone(agent), allowBrowser: (agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model' })
    this.definitions = next
  }
  async initialize(): Promise<StoredRecord[]> {
    this.definitions = new Map((await this.store.load<DigitalAgent>('agents')).map(agent => [agent.id, agent]))
    const updates: StoredRecord[] = []
    if([...this.definitions.values()].some(a=>!a.executionBackend)) await this.store.backup(this.store.filename + '.before-backends-' + Date.now())
    for(const a of this.definitions.values()) if(!a.executionBackend){a.executionBackend={kind:'mastra-model'};a.configVersion=(a.configVersion??1)+1}
    if (!this.definitions.size) {
      const defaults = [
        ['researcher', '研究员', '查找资料、梳理事实', '你是一名研究员。根据可访问的资料进行研究，区分事实、推断与未知，并说明来源。', '#6c7c59'],
        ['writer', '写手', '整理思路、撰写内容', '你是一名写手。根据用户目标与已确认的资料撰写清楚、具体的内容，不编造事实。', '#b38661'],
        ['reviewer', '审核员', '检查事实与论证', '你是一名审核员。检查事实、逻辑、遗漏与表达，给出具体的修订意见。', '#79719a'],
      ]
      for (const [id, name, role, instructions, color] of defaults) {
        const agent: DigitalAgent = { id, name, role, instructions, color, executionBackend:{kind:'mastra-model'}, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowBrowser: true, allowCommands: false, active: true, configVersion: 1 }
        this.definitions.set(id, agent); updates.push(record('agents', agent))
      }
    }
    for (const agent of this.definitions.values()) if (agent.id !== CORE_AGENT_ID && agent.systemRole === 'core') { delete agent.systemRole; agent.configVersion++ }
    const core = this.definitions.get(CORE_AGENT_ID)
    if (!core) {
      updates.push(defaultSkillSeedRecord())
      this.definitions.set(CORE_AGENT_ID, {
      id: CORE_AGENT_ID, name: CORE_AGENT_DEFAULT_NAME, systemRole: 'core', role: '系统核心 Agent',
      instructions: BOBO_RULES,
      color: '#638ac5', executionBackend: { kind: 'mastra-model' }, connectionId: '', modelId: '',
      skillIds: [], knowledgeIds: [], allowBrowser: true, allowCommands: true, executionPermission: 'full-access', active: true, configVersion: 1,
      })
    }
    else if (!isCoreAgent(core) || !core.active || core.executionBackend?.kind === 'acp-local') {
      core.systemRole = 'core'; core.active = true; if (core.executionBackend?.kind === 'acp-local') core.executionBackend = { kind: 'mastra-model' }; core.configVersion++
    }
    if (core && core.executionPermission === undefined && (core.executionBackend?.kind ?? 'mastra-model') === 'mastra-model') { core.executionPermission = 'full-access'; core.allowCommands = true; core.configVersion++ }
    for (const agent of this.definitions.values()) {
      agent.allowBrowser = (agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model'
      await this.homes.initialize(agent)
      // Upgrade only exact, untouched shipped defaults. Custom persona/rules are authoritative.
      if (isCoreAgent(agent)) for (const [name, previous, next] of [['AGENTS.md', LEGACY_BOBO_RULES, BOBO_RULES], ['SOUL.md', DEFAULT_EMPLOYEE_SOUL, BOBO_SOUL], ['SOUL.md', LEGACY_SIMPLIFIED_BOBO_SOUL, BOBO_SOUL]] as const) {
        const file = await this.homes.read(agent, name).catch(() => undefined)
        if (file?.content === previous) {
          await this.homes.save(agent, name, next, file.hash)
          agent.configVersion++
          if (name === 'AGENTS.md') agent.instructions = next
          await this.homes.commit(agent)
        }
      }
      for (const [name, next] of Object.entries(promptSourceDefaults)) {
        const file = await this.homes.read(agent, name)
        if (file.status !== 'missing' && file.status !== 'invalid' && file.content !== next && previousPromptHashes[name]?.includes(file.hash)) {
          await this.homes.save(agent, name as AgentSourceName, next, file.hash)
          agent.configVersion++
          await this.homes.commit(agent)
        }
      }
      if (isCoreAgent(agent)) {
        const file = await this.homes.read(agent, 'SOUL.md')
        if (previousBoboPersonaHashes.some(hash => hash === file.hash)) {
          await this.homes.save(agent, 'SOUL.md', BOBO_SOUL, file.hash)
          agent.configVersion++
          await this.homes.commit(agent)
        }
      }
      updates.push(record('agents', agent))
    }
    return updates
  }
  private validateResources(ids: string[], kind: Resource['kind']) {
    for (const id of ids) if (this.hooks.resource(id)?.kind !== kind) fail(kind === 'skill' ? 'Skill 不存在或类型不匹配' : '知识资源不存在或类型不匹配')
  }
  assertSkillBinding(agentId: string, expectedConfigVersion: number) {
    const agent = this.get(agentId)
    if (agent.configVersion !== expectedConfigVersion) fail('员工配置已变更，请刷新后绑定')
    if (agent.executionBackend?.kind === 'acp-local') fail('外部任务后端暂不支持 BoAI 的 Skills 绑定')
    return agent
  }
  /** Resource, installation, employee and receipt are committed by the same caller transaction. */
  async bindSkillInTransaction(tx: RecordTransaction, agentId: string, expectedConfigVersion: number, resource: Resource): Promise<DigitalAgent> {
    const agent = await tx.get<DigitalAgent>('agents', agentId) ?? fail('员工不存在，请先保存员工')
    if (agent.configVersion !== expectedConfigVersion) fail('员工配置已变更，请刷新后绑定')
    if (agent.executionBackend?.kind === 'acp-local') fail('外部任务后端暂不支持 BoAI 的 Skills 绑定')
    if (resource.kind !== 'skill' || (resource.ownerAgentId && resource.ownerAgentId !== agent.id)) fail('不能绑定其他员工的专属技能')
    for (const skillId of agent.skillIds) {
      const bound = await tx.get<Resource>('resources', skillId) ?? fail('已绑定技能不存在，请刷新员工')
      if (bound.id !== resource.id && bound.name === resource.name) fail('同一员工不能绑定名称相同但来源或内容不同的 Skills')
    }
    if (agent.skillIds.includes(resource.id)) return agent
    if (agent.skillIds.length >= 100) fail('员工最多绑定 100 个 Skills')
    const updated = { ...agent, skillIds: [...agent.skillIds, resource.id], configVersion: agent.configVersion + 1 }
    await tx.put(record('agents', updated))
    return updated
  }
  async commitSkillBinding(agent: DigitalAgent) {
    const previous = this.get(agent.id)
    const { skillIds: beforeSkills, configVersion: beforeVersion, ...before } = previous
    const { skillIds: afterSkills, configVersion: afterVersion, ...after } = agent
    // SQLite omits undefined optional fields; compare their persisted representations.
    const same = (left: unknown, right: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)))
    const additive = afterVersion === beforeVersion + 1 && afterSkills.length > beforeSkills.length && beforeSkills.every((id, index) => afterSkills[index] === id) && same(before, after)
    this.install(agent.id, agent)
    if (additive && this.hooks.skillsAdded) await this.hooks.skillsAdded(previous, agent)
    else if (!same(previous, agent)) await this.hooks.cancel(agent.id, '员工技能已变更，请重新执行')
    await this.hooks.invalidateMemory(agent.id, entry => entry.sourceResourceIds.some(id => ![...agent.skillIds, ...agent.knowledgeIds].includes(id)))
    await this.homes.commit(agent)
    this.hooks.changed()
  }
  /** Only an additive, explicitly approved directory change; never changes model/session configuration. */
  async grantDirectoryInTransaction(tx: RecordTransaction, agentId: string, configVersion: number, grant: import('@boai/shared/domain/directory-access').DirectoryGrant): Promise<DigitalAgent> {
    const agent = await tx.get<DigitalAgent>('agents', agentId) ?? fail('员工不存在')
    if (!agent.active || agent.configVersion !== configVersion || agent.directoryGrants === undefined) fail('员工目录策略已变化，原审批已失效')
    if (agent.executionPermission === 'read-only' && grant.access === 'read-write') fail('只读员工不能获得写入权限')
    const [canonical] = (await normalizeDirectoryGrants([grant]))!
    if (canonical.path !== grant.path) fail('目录实际目标已变化，原审批已失效')
    const grants = clone(agent.directoryGrants!), existing = grants.find(item => item.path === grant.path)
    if (existing?.access === 'read-write' || existing?.access === grant.access) return agent
    if (existing) existing.access = grant.access
    else grants.push(canonical)
    directoryGrantsSchema.parse(grants)
    const updated = { ...agent, directoryGrants: grants, directoryRevision: (agent.directoryRevision ?? 0) + 1 }
    await tx.put(record('agents', updated))
    return updated
  }
  commitDirectoryGrant(agent: DigitalAgent) { this.install(agent.id, agent); this.hooks.changed() }
  async save(input: AgentInput & { systemRole?: 'core' }) {
    const previous = input.id ? this.get(input.id) : undefined
    if (previous && input.initialSoul !== undefined) fail('已有员工的人格请使用带文件 hash 的保存接口')
    if (input.systemRole && !isCoreAgent(previous)) fail('系统核心身份只能由应用预置')
    if (previous && input.expectedConfigVersion !== undefined && previous.configVersion !== input.expectedConfigVersion) fail('员工配置已变更，请刷新后保存')
    const executionBackend=input.executionBackend??previous?.executionBackend??{kind:'mastra-model' as const}
    if (isCoreAgent(previous) && (!input.active || !['mastra-model','codex-local','claude-local','runtime-plugin'].includes(executionBackend.kind))) fail('系统核心 Agent 必须启用模型 API、本机 Codex 或 Claude，且不能启用旧 ACP 任务后端')
    const executionPermission = ['codex-local', 'claude-local'].includes(executionBackend.kind) && input.nativeOptions?.useNativePermissions ? undefined : ['mastra-model', 'codex-local', 'claude-local'].includes(executionBackend.kind) ? input.executionPermission ?? previous?.executionPermission : undefined
    const allowBrowser = executionBackend.kind === 'mastra-model'
    // Preserve inactive API metadata across backend changes; native execution owns its configuration.
    if (executionBackend.kind !== 'mastra-model' && input.directoryGrants !== undefined && JSON.stringify(input.directoryGrants) !== JSON.stringify(previous?.directoryGrants)) fail('本机 Agent 使用自身目录配置；BOAI 授权目录仅用于模型 API 员工')
    const directoryGrants = executionBackend.kind === 'mastra-model' ? await normalizeDirectoryGrants(input.directoryGrants, previous?.directoryGrants) : previous?.directoryGrants
    if (input.directoryGrants !== undefined && previous?.directoryRevision !== undefined && input.expectedDirectoryRevision !== previous.directoryRevision) fail('员工目录授权已变化，请刷新授权目录后保存；其他草稿仍可保留')
    const directoryRevision = directoryGrants === undefined ? undefined : JSON.stringify(directoryGrants) === JSON.stringify(previous?.directoryGrants) ? previous?.directoryRevision ?? 1 : (previous?.directoryRevision ?? 0) + 1
    if(executionBackend.kind==='acp-local'&&(input.skillIds.length||input.knowledgeIds.length))fail('外部任务后端暂不支持 BoAI 的 Skills、知识绑定；请先取消这些绑定。')
    if(executionBackend.kind==='acp-local'&&input.allowCommands)fail('外部任务后端暂不支持 BoAI 的命令策略；请先关闭命令。')
    const connection = input.connectionId ? this.hooks.connection(input.connectionId) : undefined
    const thinkingLevel = input.thinkingLevel ?? previous?.thinkingLevel
    if (executionBackend.kind === 'mastra-model') {
      if (connection) assertThinkingPreference(connection, input.modelId, thinkingLevel, this.hooks.modelCatalog?.(connection))
      else if (thinkingLevel && !(thinkingLevels as readonly string[]).includes(thinkingLevel)) fail('请先选择模型连接再设置推理档位')
    }
    this.validateResources(input.skillIds, 'skill'); this.validateResources(input.knowledgeIds, 'knowledge')
    const skillNames = input.skillIds.map(id => this.hooks.resource(id)!.name)
    if (new Set(skillNames).size !== skillNames.length) fail('同一员工不能绑定名称相同的 Skills，请修改技能名称后重新导入')
    if (input.skillIds.some(id => this.hooks.resource(id)?.ownerAgentId && this.hooks.resource(id)?.ownerAgentId !== previous?.id)) fail('不能绑定其他员工的专属技能')
    if (input.knowledgeIds.some(id => this.hooks.resource(id)?.ownerAgentId && this.hooks.resource(id)?.ownerAgentId !== previous?.id)) fail('不能绑定其他员工的知识资料，请明确为该员工添加独立资料')
    const { expectedConfigVersion: _, expectedDirectoryRevision: _directoryRevision, systemRole: _systemRole, initialSoul, ...definition } = input
    const allowCommands = executionBackend.kind === 'mastra-model' ? input.allowCommands && executionPermission !== 'read-only' : executionPermission ? executionPermission !== 'read-only' : input.allowCommands
    const agent: DigitalAgent = { ...previous, ...definition, ...(isCoreAgent(previous) ? { systemRole: 'core' as const } : {}), executionBackend, executionPermission, directoryGrants, ...(directoryRevision !== undefined ? { directoryRevision } : {}), nativeOptions: executionPermissionNativeOptions(executionBackend.kind, input.nativeOptions, executionPermission), allowCommands, allowBrowser, id: previous?.id ?? randomUUID(), configVersion: (previous?.configVersion ?? 0) + 1 }
    if (previous && previous.instructions !== input.instructions) { const source = await this.homes.read(previous, 'AGENTS.md'); await this.homes.save(previous, 'AGENTS.md', input.instructions, source.hash) }
    if (!previous) await this.homes.initialize(agent, initialSoul)
    await this.store.write([record('agents', agent)], canRememberCommands(agent) ? [] : [{ collection: commandPermissionCollection, id: agent.id }]); this.install(agent.id, agent); await this.homes.commit(agent)
    if (previous) {
      await this.hooks.cancel(agent.id, '员工配置已变更，请重新执行')
      await this.hooks.invalidateMemory(agent.id, entry => entry.sourceResourceIds.some(id => ![...agent.skillIds, ...agent.knowledgeIds].includes(id)))
    }
    this.hooks.changed(); return clone(agent)
  }
  async saveFile(input: { agentId: string; name: AgentSourceName; content: string; expectedHash: string; expectedConfigVersion: number }) {
    const agent = this.get(input.agentId)
    if (agent.configVersion !== input.expectedConfigVersion) fail('员工配置已变更，请刷新后保存')
    await this.homes.save(agent, input.name, input.content, input.expectedHash)
    const updated = { ...agent, configVersion: agent.configVersion + 1, ...(input.name === 'AGENTS.md' ? { instructions: input.content } : {}) }
    await this.store.write([record('agents', updated)]); this.install(agent.id, updated); await this.homes.commit(updated)
    await this.hooks.cancel(agent.id, '员工系统文件已更新')
    this.hooks.changed(); return this.homes.inspect(updated)
  }
  async reconcile(id: string): Promise<DigitalAgent> {
    const agent = this.get(id)
    if (await this.homes.reconcile(agent)) {
      await this.store.write([record('agents', agent)]); this.install(id, agent); await this.homes.commit(agent)
      this.hooks.changed()
    }
    return agent
  }
}
