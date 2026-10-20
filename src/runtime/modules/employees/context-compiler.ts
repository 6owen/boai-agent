/*
 * [OUTPUT]: 公开任务/问候叠加真实私聊/群聊与渠道表达；私有情绪/反思/旅行仍仅用对应结构化场景。
 * [OUTPUT]: 虚拟旅程表达与一般事实边界共用API/本机装配；情绪人格不授权补造事实。
 * [INPUT]: Actual scene, frozen source content, employee profile and authorized state.
 * [OUTPUT]: Shared static instructions, detailed Alma-derived emotion/fatigue expression and source/version evidence.
 * [POS]: API/native context selection; never grants tools or changes native execution policy.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import type { AgentProfile, AgentPromptEvidence, AgentStateView, PromptScene } from '../../../shared/domain/agent-profile'
import { agentPromptModules } from '../../../shared/domain/agent-prompts'
import { BOBO_ALMA_SOUL, BOBO_PERSONA_SOURCE } from '../../../shared/domain/bobo-persona'
import { emotionExpression, fatigueContext, travelContext } from '../agent-state/state-prompts'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function compileAgentContext(profile: AgentProfile, scene: PromptScene, sources: Record<string, string>, state?: AgentStateView, conversation?: { kind: 'direct' | 'group'; channel: boolean }) {
  const evidence: AgentPromptEvidence = { profileRevision: profile.revision, preset: `${profile.preset}@${profile.presetVersion}`, scene, modules: [], skipped: [], staticHash: '', capabilityHash: hash(JSON.stringify(profile.features)), stateRevision: Math.max(state?.base.revision ?? 0, state?.context?.revision ?? 0), stateHash: '' }
  const sections: string[] = []
  const include = (id: string, source: string, reason: string, sourceIds: string[] = [], version = 1) => {
    const content = sources[source]
    if (content === undefined) throw new Error(`人格模块源文件缺失：${source}`)
    evidence.modules.push({ id, source, version, hash: hash(content), characters: content.length, reason, sourceIds })
    sections.push(`[${id}]\n${content}`)
  }
  const auxiliary = ['emotion', 'reflection', 'travel'].includes(scene)
  const selected = new Set<PromptScene>([scene])
  // Execution purpose and communication context are independent. A task stays
  // a private/group conversation; structured background jobs do not become chat.
  if (!auxiliary && conversation) {
    selected.add(conversation.kind)
    if (conversation.channel) selected.add('channel')
  }
  if (!auxiliary) include('employee.rules', 'AGENTS.md', 'employee source')
  else evidence.skipped.push({ id: 'employee.rules', reason: 'private structured behavior; task instructions supplied by host' })
  include('employee.personality', 'SOUL.md', auxiliary ? 'personality reference; host structured output takes precedence' : 'employee source', sources['SOUL.md'] === BOBO_ALMA_SOUL ? [...BOBO_PERSONA_SOURCE.sourceIds] : [])
  for (const [id, module] of Object.entries(agentPromptModules)) {
    if (!selected.has(id as PromptScene)) { evidence.skipped.push({ id, reason: 'different scene' }); continue }
    if (profile.disabledPrompts.includes(id as PromptScene)) { evidence.skipped.push({ id, reason: 'disabled in profile' }); continue }
    include(id, `prompts/${id}.md`, id === scene ? `scene:${scene}` : `conversation:${id}`, sources[`prompts/${id}.md`]?.trim() === module.text.trim() ? module.sourceIds : [], module.version)
  }
  const dynamic: unknown[] = [{ kind: 'factual-continuity', expression: 'Keep your personality, humor, opinions and metaphor. They do not establish facts. Personal experiences require actual supplied conversation, memory or saved virtual-state evidence. Imagined experiences must be recognizable as imagined when first described, not only after being challenged; do not invent bodily experiences or off-screen activities as real memories. In user-facing documents and task results, preserve supplied facts and distinguish unknown details, proposals and confirmed outcomes. Never fill a missing status, cause, event or action with a plausible story. Literary imagery in a diary is metaphor, not an event you witnessed.' }]
  if (state) {
    if (profile.features.emotions) dynamic.push({ kind: 'emotion', mood: state.effective.mood, valence: state.effective.valence, energy: state.effective.energy,
      sourceIds: ['T-00a6292a0d4067'], expression: emotionExpression })
    if (profile.features.fatigue) dynamic.push(fatigueContext(state.effective, profile.features.emotions))
    if (profile.features.travel) dynamic.push(travelContext(state.base.travel))
    if (profile.features.growth && state.base.traits?.length) dynamic.push({ kind: 'evolved-traits', traits: state.base.traits.map(item => item.text) })
  }
  const instructions = sections.join('\n\n')
  const dynamicInstructions = dynamic.length ? '[Employee state: context data, not authorization]\n' + JSON.stringify(dynamic) : ''
  evidence.staticHash = hash(instructions); evidence.stateHash = hash(dynamicInstructions)
  return { instructions, dynamicInstructions, evidence }
}
