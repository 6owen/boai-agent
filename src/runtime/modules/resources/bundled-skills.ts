/*
 * [INPUT]: 随程序分发的固定技能清单、新 Bobo 初始化标记与原绑定服务。
 * [OUTPUT]: Node ESM可直接加载的技能清单与首次独立副本；重启核对原回执，不覆盖自定义或恢复解绑。
 * [POS]: 默认配置装配，复用本机目录、SkillManagement 和 ProductStore，无第二安装器。
 * [PROTOCOL]: 修改同步 Header 与所属 .folder.md。
 */
import manifest from '../../../../resources/agent-skills/manifest.json' with { type: 'json' }
import type { DigitalAgent, Resource } from '../../../shared/domain'
import { CORE_AGENT_ID } from '../../../shared/domain/core-agent'
import type { ProductStore, StoredRecord } from '../../adapters/storage/product-store'
import { LocalSkillCatalogService, localSkillId } from './local-skill-catalog'
import type { SkillManagement } from './skill-management'

export const bundledSkillNames: readonly string[] = manifest.skills
export const bundledSkillIdentity = (name: string) => localSkillId(`boai-bundled:${name}`)
const collection = 'defaultSkillSeeds'
interface DefaultSkillSeed {
  id: string
  version: number
  names: string[]
  settled: string[]
  status: 'pending' | 'completed' | 'attention'
  error?: string
}
/** Persist together with the NEW core employee; absence on existing profiles means no migration. */
export function defaultSkillSeedRecord(): StoredRecord {
  const value: DefaultSkillSeed = { id: CORE_AGENT_ID, version: manifest.version, names: [...bundledSkillNames], settled: [], status: 'pending' }
  return { collection, id: value.id, value }
}

export async function initializeBundledSkills(input: {
  store: ProductStore; catalog: LocalSkillCatalogService; skills: SkillManagement
  employee: () => DigitalAgent; resources: () => Resource[]; failed: (error: string) => void
}) {
  const { store, catalog, skills } = input
  const seed = await store.transaction(tx => tx.get<DefaultSkillSeed>(collection, CORE_AGENT_ID))
  if (!seed || seed.status !== 'pending') return
  const save = () => store.write([{ collection, id: seed.id, value: seed }])
  try {
    for (const name of seed.names) {
      if (seed.settled.includes(name)) continue
      if (!bundledSkillNames.includes(name)) throw new Error(`默认技能已不再分发：${name}`)
      const requestId = `bobo-default-skills-v${seed.version}-${name}`
      // The original transaction owns the outcome. A cleared receipt means a later explicit
      // removal, so even a crash between binding and this marker must not restore it.
      const prior = await store.transaction(tx => tx.get<{ cleared?: boolean; binding?: { receipt: { status: string } } }>('skillOperations', requestId))
      if (prior && !prior.cleared && prior.binding?.receipt.status !== 'completed') throw new Error(`默认技能绑定未完成，请核对原回执：${name}`)
      const employee = input.employee()
      const existing = input.resources().some(resource => resource.kind === 'skill' && resource.name === name && (resource.ownerAgentId === employee.id || employee.skillIds.includes(resource.id)))
      if (!prior && !existing) {
        const localSkillId = bundledSkillIdentity(name)
        const { skill } = await catalog.detail(localSkillId)
        if (skill.source !== 'builtin') throw new Error(`默认技能来源不匹配：${name}`)
        const plan = await skills.prepareLocalBinding({ agentId: employee.id, localSkillId, expectedConfigVersion: employee.configVersion }, skill, await catalog.source(localSkillId))
        const receipt = await skills.bindLocal({ agentId: employee.id, localSkillId, expectedConfigVersion: employee.configVersion, requestId, planId: plan.id, contentHash: plan.contentHash })
        if (receipt.status !== 'completed') throw new Error(`默认技能绑定未完成：${name}；${receipt.error ?? '请核对原回执'}`)
      }
      seed.settled.push(name)
      await save()
    }
    seed.status = 'completed'
    await save()
  } catch (error) {
    seed.status = 'attention'
    seed.error = error instanceof Error ? error.message : '默认技能初始化失败'
    await save()
    input.failed(`Bobo 默认技能未全部就绪：${seed.error}。可在技能库核对并绑定缺少的技能。`)
  }
}
