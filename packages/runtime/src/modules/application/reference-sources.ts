/*
 * [INPUT]: Original store plus host-authorized employee, conversation, messages, memory and bound skill readers.
 * [OUTPUT]: Bounded reference snapshots with current source bodies and content revisions; no shadow content store.
 * [POS]: BOAI object projection for refs; source policy stays in AppService and original domains.
 * [PROTOCOL]: Update Header and application/.folder.md on change.
 */
import { createHash } from 'node:crypto'
import type { Conversation, DigitalAgent, Message, MemoryEntry } from '@boai/shared/domain'
import { referenceKinds, referenceUri, type ReferenceKind, type ReferenceObject } from '@boai/shared/domain/references'
import type { ProductStore } from '../../adapters/storage/product-store'
import { listPromptTemplates } from '../resources/prompt-templates'
import type { TrackedTask } from './task-operations'
import { planCollection, planSnapshot, type PlanRecord } from './plan-weave'
import type { ReferenceSnapshot } from './reference-operations'

interface ReferenceSources {
  agent: DigitalAgent; conversation: Conversation
  messages(): Promise<Message[]>
  memories(): Promise<MemoryEntry[]>
  skills(): Promise<{ items: { id: string; name: string; content: string; revision: string }[]; unavailable: number }>
}
export async function collectReferenceSources(store: ProductStore, sources: ReferenceSources, kinds: readonly ReferenceKind[] = referenceKinds): Promise<ReferenceSnapshot> {
  const { agent, conversation } = sources, objects: ReferenceObject[] = []
  let omitted = 0, unavailableSkills = 0, characters = 0
  const add = (kind: ReferenceKind, id: string, title: string, body: string, sourceRevision: unknown, updatedAt?: string) => {
    if (objects.length >= 2000 || characters + body.length > 2_000_000) { omitted++; return }
    characters += body.length
    const revision = createHash('sha256').update(JSON.stringify([title, body, sourceRevision, updatedAt])).digest('hex')
    objects.push({ kind, id, uri: referenceUri(kind, id), title, body, revision, ...(updatedAt ? { updatedAt } : {}) })
  }
  if (kinds.includes('employee')) add('employee', agent.id, agent.name, agent.role, agent.configVersion)
  if (kinds.includes('conversation')) add('conversation', conversation.id, conversation.title, JSON.stringify({ kind: conversation.kind, agentIds: conversation.agentIds }), conversation.updatedAt)
  if (kinds.includes('message')) for (const message of await sources.messages()) add('message', message.id, `${message.senderName} · ${message.createdAt}`, message.content, [message.sequence, message.status], message.createdAt)
  if (kinds.includes('memory')) for (const memory of await sources.memories()) add('memory', memory.id, `${memory.kind ?? memory.scope} · ${memory.createdAt}`, memory.content, memory.version, memory.updatedAt)
  if (kinds.includes('skill')) {
    const skills = await sources.skills(); unavailableSkills = skills.unavailable
    for (const skill of skills.items) add('skill', skill.id, skill.name, skill.content, skill.revision)
  }
  if (kinds.includes('prompt')) for (const prompt of await listPromptTemplates(store)) add('prompt', prompt.id, prompt.name, prompt.content, [prompt.revision, prompt.description], prompt.updatedAt)
  if (kinds.includes('task')) for (const task of await store.load<TrackedTask>('agentTasks')) if (task.agentId === agent.id && task.conversationId === conversation.id) add('task', task.id, task.title, JSON.stringify({ title: task.title, status: task.status, steps: task.steps, note: task.note }, null, 2), task.revision, task.updatedAt)
  if (kinds.includes('plan')) for (const plan of await store.load<PlanRecord>(planCollection)) if (plan.agentId === agent.id && plan.conversationId === conversation.id) add('plan', plan.id, plan.manifest.title, JSON.stringify({ status: planSnapshot(plan).status, manifest: plan.manifest, blocks: plan.blocks, feedback: plan.feedback }, null, 2), [plan.epoch, plan.revision], plan.updatedAt)
  return { scope: { agentId: agent.id, conversationId: conversation.id }, objects: objects.sort((a, b) => a.uri.localeCompare(b.uri)), coverage: { scope: 'employee-conversation', complete: !omitted && !unavailableSkills, omitted, unavailableSkills } }
}
