/*
 * [OUTPUT]: 记忆创建/更新时间只标为保存时间，区分用户提供/模型整理/导入及消息/父记忆来源，不能冒充发生时间或员工亲历。
 * [INPUT]: 有来源的员工记忆、当前会话/事项、宿主获准来源和时间。
 * [OUTPUT]: 单一范围/有效期过滤、中文相关性排序与保守 token 预算；管理视图不冒充召回。
 * [POS]: runtime/modules/memory 的纯策略，无模型和存储副作用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { MemoryContextRef, MemoryEntry, MemoryStatus, MemoryUseScope } from '@boai/shared/domain'

export function memoryUseScope(entry: MemoryEntry): MemoryUseScope {
  return entry.useScope ?? (entry.scope === 'profile' ? 'employee' : 'conversation')
}
export function memoryStatus(entry: MemoryEntry, time = Date.now()): MemoryStatus {
  if (entry.deletedAt || entry.status === 'deleted') return 'deleted'
  if (entry.status === 'superseded') return 'superseded'
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= time) return 'expired'
  return entry.status ?? 'active'
}
export function sameMemoryContext(a?: MemoryContextRef, b?: MemoryContextRef) { return !!a && !!b && a.kind === b.kind && a.id === b.id }
export interface MemoryAccess {
  agentId: string
  conversationId: string
  contextRefs?: MemoryContextRef[]
  now?: number
  history?: boolean
  sourceAllowed(entry: MemoryEntry): boolean
  conversationRestricted(id: string): boolean
}
export function memoryAllowed(entry: MemoryEntry, access: MemoryAccess) {
  if (entry.ownerAgentId !== access.agentId) return false
  const status = memoryStatus(entry, access.now)
  if (status !== 'active' && !(access.history && ['archived', 'expired', 'superseded'].includes(status))) return false
  const sources = entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])
  if (sources.some(id => id !== access.conversationId && access.conversationRestricted(id))) return false
  const scope = memoryUseScope(entry)
  if (scope === 'conversation' && entry.conversationId !== access.conversationId) return false
  if (scope === 'context' && !access.contextRefs?.some(ref => sameMemoryContext(ref, entry.contextRef))) return false
  return access.sourceAllowed(entry)
}
function terms(text: string) {
  const normalized = text.toLocaleLowerCase().normalize('NFKC')
  const result = new Set(normalized.match(/[a-z0-9_]{2,}/g) ?? [])
  for (const part of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    if (part.length === 1) result.add(part)
    else for (let i = 0; i < part.length - 1; i++) result.add(part.slice(i, i + 2))
  }
  return result
}
export function memoryRelevance(content: string, request: string) {
  const query = terms(request), text = terms(content)
  let score = 0
  for (const term of query) if (text.has(term)) score++
  return score
}
/** UTF-8 bytes are a conservative upper bound for byte-based model tokenizers. */
export function memoryTokenEstimate(text: string) { return Buffer.byteLength(text, 'utf8') }
export function memoryText(entry: MemoryEntry) {
  const origin = entry.origin === 'user' ? '用户提供' : entry.origin === 'model' ? '模型提取或整理（不证明员工亲历）' : entry.origin === 'import' ? '导入记录（原作者按来源）' : '旧记录，记录方式未知'
  const sources = [
    entry.sourceMessageIds.length ? `引用消息 ${entry.sourceMessageIds.join(', ')}` : '',
    entry.sourceMemoryIds?.length ? `父记忆 ${entry.sourceMemoryIds.join(', ')}` : '',
  ].filter(Boolean).join('；') || '无关联消息或父记忆'
  return `[记忆 ${entry.id} v${entry.version}；${entry.kind ?? '旧记录'}；${entry.evidence ?? '有来源的陈述'}；${entry.disclosure === 'private' ? '私人来源：不要主动公开私人原文或细节' : '来源记录'}；${origin}；保存于 ${entry.createdAt}${entry.updatedAt !== entry.createdAt ? `；记录更新于 ${entry.updatedAt}` : ''}${entry.diary ? `；反思素材日期 ${entry.diary.date}` : ''}；${sources}${entry.attribution ? `；原归属 ${entry.attribution}` : ''}]\n${entry.content}`
}
