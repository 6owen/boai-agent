/*
 * [INPUT]: 已保存员工、冻结本机技能绑定输入和宿主只读回执。
 * [OUTPUT]: 按页面/员工隔离的最小未决请求、重启未知恢复、完整回执身份检查及真实提交配置选择；绑定后按字段差异保留未保存配置。
 * [POS]: employee 的纯绑定请求状态；不存技能正文或磁盘路径，不调用 IPC 或执行工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentInput, DigitalAgent } from '@shared/domain'
import type { BindLocalSkillInput, SkillBindingReceipt, SkillSource } from '@shared/domain/skills'

export const SKILL_BINDING_PENDING_KEY = 'boai:skills:binding-pending'
export type SkillBindingPending = { input: BindLocalSkillInput; status: 'submitting' | 'unknown' | 'running' | 'not_accepted' }
export type SkillBindingPendingMap = Record<string, SkillBindingPending>
export function skillBindingPendingKey(scope: string, agentId: string) { return JSON.stringify([scope, agentId]) }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 2000
function validPendingKey(key: string, agentId: string) {
  try { const parts: unknown = JSON.parse(key); return Array.isArray(parts) && parts.length === 2 && identity(parts[0]) && parts[1] === agentId && key === skillBindingPendingKey(parts[0], agentId) } catch { return false }
}
function sameInput(first: BindLocalSkillInput, second: BindLocalSkillInput) { return first.requestId === second.requestId && first.agentId === second.agentId && first.localSkillId === second.localSkillId && first.planId === second.planId && first.contentHash === second.contentHash && first.expectedConfigVersion === second.expectedConfigVersion }

/** Persist only the accepted input fields; process loss never authorizes another submission. */
export function restoreSkillBindingPending(value: unknown): SkillBindingPendingMap {
  if (!object(value)) return {}
  const result: SkillBindingPendingMap = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!object(entry) || !object(entry.input) || !['submitting', 'unknown', 'running', 'not_accepted'].includes(String(entry.status))) continue
    const input = entry.input
    if (!identity(input.agentId) || !identity(input.localSkillId) || !identity(input.planId) || !identity(input.requestId) || typeof input.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.contentHash) || !Number.isSafeInteger(input.expectedConfigVersion) || Number(input.expectedConfigVersion) < 1) continue
    if (!validPendingKey(key, input.agentId)) continue
    result[key] = { status: entry.status === 'submitting' ? 'unknown' : entry.status as SkillBindingPending['status'], input: { agentId: input.agentId, localSkillId: input.localSkillId, planId: input.planId, requestId: input.requestId, expectedConfigVersion: Number(input.expectedConfigVersion), contentHash: input.contentHash } }
  }
  return result
}

/** A late response can update only the original frozen request in its original scope. */
export function updateSkillBindingPending(previous: SkillBindingPendingMap, key: string, next: SkillBindingPending | undefined, expectedRequestId?: string): SkillBindingPendingMap | undefined {
  if (expectedRequestId && previous[key]?.input.requestId !== expectedRequestId) return
  if (next && (!validPendingKey(key, next.input.agentId) || previous[key] && !sameInput(previous[key].input, next.input))) return
  const result = { ...previous }
  if (next) result[key] = next; else delete result[key]
  return result
}

export function skillBindingReceiptMatches(input: BindLocalSkillInput, receipt: SkillBindingReceipt) {
  return receipt.id === input.requestId && receipt.planId === input.planId && receipt.localSkillId === input.localSkillId && receipt.agentId === input.agentId && receipt.expectedConfigVersion === input.expectedConfigVersion && receipt.contentHash === input.contentHash
}

/** Prefer a newer committed configuration; an old receipt cannot restore a subsequently removed binding. */
export function committedSkillBindingAgent(input: BindLocalSkillInput, receipt: SkillBindingReceipt, latest?: DigitalAgent): DigitalAgent | undefined {
  if (!skillBindingReceiptMatches(input, receipt) || receipt.status !== 'completed' || !receipt.agent || !receipt.resource) return
  if (receipt.agent.id !== input.agentId || receipt.resource.kind !== 'skill' || receipt.resource.ownerAgentId && receipt.resource.ownerAgentId !== input.agentId || !receipt.agent.skillIds.includes(receipt.resource.id) || receipt.agent.configVersion < input.expectedConfigVersion || receipt.agent.configVersion > input.expectedConfigVersion + 1) return
  return latest?.id === input.agentId && latest.configVersion > receipt.agent.configVersion ? latest : receipt.agent
}

/** Binding changes the committed version; retain the user's edits relative to their previous baseline. */
export function mergeSkillBindingDraft(previous: AgentInput, draft: AgentInput, committed: AgentInput): AgentInput {
  const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => key !== 'skillIds' && JSON.stringify(value) !== JSON.stringify(previous[key as keyof AgentInput])))
  const removed = new Set(previous.skillIds.filter(id => !draft.skillIds.includes(id)))
  const added = draft.skillIds.filter(id => !previous.skillIds.includes(id))
  return { ...committed, ...changes, skillIds: [...new Set([...committed.skillIds.filter(id => !removed.has(id)), ...added])] }
}

export function skillBindingSourceLabel(source: SkillSource) {
  if (source.kind === 'marketplace') return `${source.provider} · ${source.providerItemId}${source.resolvedCommit ? ` · ${source.resolvedCommit}` : ''}`
  if (source.kind === 'git') return `${source.repository} · ${source.ref}${source.resolvedCommit ? ` · ${source.resolvedCommit}` : ' · 原始 commit 未记录'}`
  if (source.kind === 'url') return source.url
  return `${source.kind === 'snapshot' ? '内容快照' : '本机来源'} · ${source.reason ?? source.identity}`
}
