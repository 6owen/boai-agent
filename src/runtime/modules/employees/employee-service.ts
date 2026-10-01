/*
 * [INPUT]: 员工配置、受管工作区、存储与头像合同。
 * [OUTPUT]: 浏览器仅已保存员工显式启用，旧/新默认关闭、省略字段保留现权且 ACP 拒绝；配置变更沿原取消/版本边界； 显式单技能绑定在调用者 SQLite 事务内比较员工版本并保存授权；提交后复用配置取消、记忆失效、registry 与工作区同步。
 * [OUTPUT]: 新旧库补齐唯一 bobo 核心身份并保留改名/模型选择，拒绝身份伪造、停用、命令和 ACP；已提交员工整批内存安装与完整重载；版本校验的员工保存、独立思考强度与头像持久化和系统文件同步；拒绝无效思考档位、外链或超限头像。
 * [POS]: runtime/modules/employees 的员工定义服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AgentInput, DigitalAgent, Connection, Resource, MemoryEntry } from '../../../shared/domain'
import { ProductStore, type StoredRecord, type RecordTransaction } from '../../adapters/storage/product-store'
import { WorkspaceService } from '../workspaces/workspace-service'
import { avatarPresets, AVATAR_IMAGE_MAX_LENGTH } from '../../../shared/domain/avatars'
import { thinkingLevels } from '../../../shared/domain/model-preferences'
import { CORE_AGENT_ID, CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '../../../shared/domain/core-agent'

export const backendSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('mastra-model')}).strict(),z.object({kind:z.literal('acp-local'),profileId:z.string().min(1).max(200)}).strict()])
const id = z.string().trim().min(1).max(200)
const ids = z.array(id).max(100).refine(value => new Set(value).size === value.length, '不能包含重复 ID')
const text = (max: number) => z.string().trim().min(1).max(max)
const avatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id: z.enum(avatarPresets.map(preset => preset.id)) }).strict(),
  z.object({ kind: z.literal('image'), dataUrl: z.string().max(AVATAR_IMAGE_MAX_LENGTH).regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/, '头像必须是本地 PNG 图片') }).strict(),
])
export const agentSchema = z.object({ systemRole: z.literal('core').optional(), avatar: avatarSchema.optional(), thinkingLevel: z.enum(thinkingLevels).optional(), executionBackend: backendSchema.optional(), id: id.optional(), expectedConfigVersion: z.number().int().positive().optional(), name: text(100), role: z.string().max(1000), instructions: z.string().max(40000), color: z.string().regex(/^#[0-9a-f]{6}$/i), connectionId: z.string().max(200), modelId: z.string().max(300), skillIds: ids, knowledgeIds: ids, allowBrowser: z.boolean().optional(), allowCommands: z.boolean(), active: z.boolean() }).strict()

const clone = <T>(value: T): T => structuredClone(value)
const record = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const fail = (message: string): never => { throw new Error(message) }
interface EmployeeHooks {
  connection(id: string): Connection
  resource(id: string): Resource | undefined
  cancel(id: string, reason: string): Promise<void>
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
  install(id: string, agent: DigitalAgent) { this.definitions.set(id, clone(agent)) }
  /** Clone the entire batch before one registry swap; no partially installed snapshot. */
  installBatch(agents: DigitalAgent[], replace = false) {
    const next = replace ? new Map<string, DigitalAgent>() : new Map(this.definitions)
    for (const agent of agents) next.set(agent.id, clone(agent))
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
        const agent: DigitalAgent = { id, name, role, instructions, color, executionBackend:{kind:'mastra-model'}, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
        this.definitions.set(id, agent); updates.push(record('agents', agent))
      }
    }
    for (const agent of this.definitions.values()) if (agent.id !== CORE_AGENT_ID && agent.systemRole === 'core') { delete agent.systemRole; agent.configVersion++ }
    const core = this.definitions.get(CORE_AGENT_ID)
    if (!core) this.definitions.set(CORE_AGENT_ID, {
      id: CORE_AGENT_ID, name: CORE_AGENT_DEFAULT_NAME, systemRole: 'core', role: '系统核心 Agent',
      instructions: '你是 BoAI 的系统核心 Agent，协助用户理解需求、创建数字员工团队并接续交流。根据明确授权使用应用提供的工具；没有创建回执时不得声称已创建团队。团队默认包含群聊，群名称与成员职责由团队需求决定。普通对话自然回应，不制造任务。',
      color: '#638ac5', executionBackend: { kind: 'mastra-model' }, connectionId: '', modelId: '',
      skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1,
    })
    else if (!isCoreAgent(core) || !core.active || core.allowCommands || core.executionBackend?.kind !== 'mastra-model') {
      core.systemRole = 'core'; core.active = true; core.allowCommands = false; core.executionBackend = { kind: 'mastra-model' }; core.configVersion++
    }
    for (const agent of this.definitions.values()) { await this.homes.initialize(agent); updates.push(record('agents', agent)) }
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
    this.install(agent.id, agent)
    await this.hooks.cancel(agent.id, '员工技能已变更，请重新执行')
    await this.hooks.invalidateMemory(agent.id, entry => entry.sourceResourceIds.some(id => ![...agent.skillIds, ...agent.knowledgeIds].includes(id)))
    await this.homes.commit(agent)
    this.hooks.changed()
  }
  async save(input: AgentInput & { systemRole?: 'core' }) {
    const previous = input.id ? this.get(input.id) : undefined
    if (input.systemRole && !isCoreAgent(previous)) fail('系统核心身份只能由应用预置')
    if (previous && input.expectedConfigVersion !== undefined && previous.configVersion !== input.expectedConfigVersion) fail('员工配置已变更，请刷新后保存')
    const executionBackend=input.executionBackend??previous?.executionBackend??{kind:'mastra-model' as const}
    if (isCoreAgent(previous) && (!input.active || input.allowCommands || executionBackend.kind !== 'mastra-model')) fail('系统核心 Agent 必须启用模型 API，且不能启用宿主命令或外部任务后端')
    if (!previous && input.allowBrowser) fail('请先保存员工，再明确启用浏览器能力')
    const allowBrowser = input.allowBrowser ?? previous?.allowBrowser ?? false
    if(executionBackend.kind==='acp-local'&&(input.skillIds.length||input.knowledgeIds.length||input.allowCommands||allowBrowser))fail('外部任务后端暂不支持 BoAI 的 Skills、知识绑定、命令策略和浏览器能力；请先取消这些绑定。')
    if (input.connectionId) this.hooks.connection(input.connectionId)
    this.validateResources(input.skillIds, 'skill'); this.validateResources(input.knowledgeIds, 'knowledge')
    const skillNames = input.skillIds.map(id => this.hooks.resource(id)!.name)
    if (new Set(skillNames).size !== skillNames.length) fail('同一员工不能绑定名称相同的 Skills，请修改技能名称后重新导入')
    if (input.skillIds.some(id => this.hooks.resource(id)?.ownerAgentId && this.hooks.resource(id)?.ownerAgentId !== previous?.id)) fail('不能绑定其他员工的专属技能')
    const { expectedConfigVersion: _, systemRole: _systemRole, ...definition } = input
    const agent: DigitalAgent = { ...previous, ...definition, ...(isCoreAgent(previous) ? { systemRole: 'core' as const } : {}), executionBackend, allowBrowser, id: previous?.id ?? randomUUID(), configVersion: (previous?.configVersion ?? 0) + 1 }
    if (previous && previous.instructions !== input.instructions) { const source = await this.homes.read(previous, 'AGENTS.md'); await this.homes.save(previous, 'AGENTS.md', input.instructions, source.hash) }
    if (!previous) await this.homes.initialize(agent)
    await this.store.write([record('agents', agent)]); this.install(agent.id, agent); await this.homes.commit(agent)
    if (previous) {
      await this.hooks.cancel(agent.id, '员工配置已变更，请重新执行')
      await this.hooks.invalidateMemory(agent.id, entry => entry.sourceResourceIds.some(id => ![...agent.skillIds, ...agent.knowledgeIds].includes(id)))
    }
    this.hooks.changed(); return clone(agent)
  }
  async saveFile(input: { agentId: string; name: 'AGENTS.md' | 'SOUL.md'; content: string; expectedHash: string; expectedConfigVersion: number }) {
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
