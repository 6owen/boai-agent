/*
 * [INPUT]: 员工配置、受管工作区、存储与头像合同。
 * [OUTPUT]: 版本校验的员工保存、头像持久化和系统文件同步；拒绝外链或超限头像。
 * [POS]: runtime/modules/employees 的员工定义服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AgentInput, DigitalAgent, Connection, Resource, MemoryEntry } from '../../../shared/domain'
import { ProductStore, type StoredRecord } from '../../adapters/storage/product-store'
import { WorkspaceService } from '../workspaces/workspace-service'
import { avatarPresets, AVATAR_IMAGE_MAX_LENGTH } from '../../../shared/domain/avatars'

export const backendSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('mastra-model')}).strict(),z.object({kind:z.literal('acp-local'),profileId:z.string().min(1).max(200)}).strict()])
const id = z.string().trim().min(1).max(200)
const ids = z.array(id).max(100).refine(value => new Set(value).size === value.length, '不能包含重复 ID')
const text = (max: number) => z.string().trim().min(1).max(max)
const avatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id: z.enum(avatarPresets.map(preset => preset.id)) }).strict(),
  z.object({ kind: z.literal('image'), dataUrl: z.string().max(AVATAR_IMAGE_MAX_LENGTH).regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/, '头像必须是本地 PNG 图片') }).strict(),
])
export const agentSchema = z.object({ avatar: avatarSchema.optional(), executionBackend: backendSchema.optional(), id: id.optional(), expectedConfigVersion: z.number().int().positive().optional(), name: text(100), role: z.string().max(1000), instructions: z.string().max(40000), color: z.string().regex(/^#[0-9a-f]{6}$/i), connectionId: z.string().max(200), modelId: z.string().max(300), skillIds: ids, knowledgeIds: ids, allowCommands: z.boolean(), active: z.boolean() }).strict()

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
    for (const agent of this.definitions.values()) { await this.homes.initialize(agent); updates.push(record('agents', agent)) }
    return updates
  }
  private validateResources(ids: string[], kind: Resource['kind']) {
    for (const id of ids) if (this.hooks.resource(id)?.kind !== kind) fail(kind === 'skill' ? 'Skill 不存在或类型不匹配' : '知识资源不存在或类型不匹配')
  }
  async save(input: AgentInput) {
    const previous = input.id ? this.get(input.id) : undefined
    if (previous && input.expectedConfigVersion !== undefined && previous.configVersion !== input.expectedConfigVersion) fail('员工配置已变更，请刷新后保存')
    const executionBackend=input.executionBackend??previous?.executionBackend??{kind:'mastra-model' as const}
    if(executionBackend.kind==='acp-local'&&(input.skillIds.length||input.knowledgeIds.length||input.allowCommands))fail('外部任务后端暂不支持 BoAI 的 Skills、知识绑定和命令策略；请先取消这些绑定。')
    if (input.connectionId) this.hooks.connection(input.connectionId)
    this.validateResources(input.skillIds, 'skill'); this.validateResources(input.knowledgeIds, 'knowledge')
    const skillNames = input.skillIds.map(id => this.hooks.resource(id)!.name)
    if (new Set(skillNames).size !== skillNames.length) fail('同一员工不能绑定名称相同的 Skills，请修改技能名称后重新导入')
    if (input.skillIds.some(id => this.hooks.resource(id)?.ownerAgentId && this.hooks.resource(id)?.ownerAgentId !== previous?.id)) fail('不能绑定其他员工的专属技能')
    const { expectedConfigVersion: _, ...definition } = input
    const agent: DigitalAgent = { ...previous, ...definition, executionBackend, id: previous?.id ?? randomUUID(), configVersion: (previous?.configVersion ?? 0) + 1 }
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
