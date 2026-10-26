/*
 * [INPUT]: Original employee/conversation records and expected profile revision.
 * [OUTPUT]: Atomic feature/proactive settings; old manual plans remain immutable and inactive.
 * [POS]: Employee configuration extension in the original ProductStore.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { defaultAgentProfile, normalizeAgentProfile, saveAgentProfileSchema, type AgentProfile } from '@boai/shared/domain/agent-profile'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DigitalAgent } from '@boai/shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'

export class AgentProfileService {
  constructor(private readonly store: ProductStore) {}
  async get(agentId: string): Promise<AgentProfile> {
    const agent = await this.store.get<DigitalAgent>('agents', agentId)
    if (!agent) throw new Error('员工不存在')
    return normalizeAgentProfile(await this.store.get<AgentProfile>('agentProfiles', agentId) ?? defaultAgentProfile(agentId, isCoreAgent(agent)))
  }
  async save(raw: unknown) {
    const input = saveAgentProfileSchema.parse(raw)
    return this.store.transaction(async tx => {
      const agent = await tx.get<DigitalAgent>('agents', input.agentId)
      if (!agent) throw new Error('员工不存在')
      if (input.config.preset !== (isCoreAgent(agent) ? 'bobo-core' : 'employee')) throw new Error('预设类型必须与真实员工身份一致')
      const previous = await tx.get<AgentProfile>('agentProfiles', agent.id)
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('员工人格与行为配置已变更，请刷新后保存')
      if (JSON.stringify(input.config.behaviors) !== JSON.stringify(previous?.behaviors ?? [])) throw new Error('旧版手动行为计划已退役，请通过功能开关和主动交流偏好配置')
      const profile: AgentProfile = { ...input.config, agentId: agent.id, revision: (previous?.revision ?? 0) + 1, updatedAt: new Date().toISOString() }
      await tx.put({ collection: 'agentProfiles', id: agent.id, value: profile })
      return profile
    })
  }
}
