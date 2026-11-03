/*
 * [INPUT]: 员工任务目标、当前快照、原主私聊创建/显隐接口与导航存活检查。
 * [OUTPUT]: 普通员工复用主私聊，bobo优先保持当前核心会话；无核心历史时仅打开首发草稿和任务面板，不创建空会话。
 * [POS]: 所有员工任务入口的共同导航边界，定时任务页不承载员工任务面板。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Conversation, Snapshot } from '@boai/shared/domain'
import { CORE_AGENT_ID, isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DetailTarget } from '../detail-panel/tabs-state'

export type EmployeeTaskTarget = Extract<DetailTarget, { type: 'employee-tasks' }>
export function isEmployeeTaskHost(room: Conversation | undefined, employeeId: string) {
  return Boolean(room && room.kind === 'direct' && !room.mergedInto && (room.mainPrivate || !room.channel) && (employeeId === CORE_AGENT_ID ? room.purpose === 'core' : !room.purpose || room.purpose === 'personal') && room.agentIds.length === 1 && room.agentIds[0] === employeeId)
}
export async function resolveEmployeeTaskDestination({ api, snapshot, target, current, conversationId }: {
  api: DesktopApi; snapshot: Snapshot; target: EmployeeTaskTarget; current(): boolean; conversationId?: string | null
}) {
  if (!current()) return
  const employee = snapshot.agents.find(agent => agent.id === target.id)
  if (!employee) throw new Error('该员工已不存在')
  // Include hidden main chats: opening a task must not create a second private chat.
  const candidates = snapshot.conversations.filter(room => isEmployeeTaskHost(room, employee.id))
  const core = isCoreAgent(employee)
  const existing = candidates.find(room => room.id === conversationId) ?? (core ? candidates.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] : candidates.find(room => room.mainPrivate) ?? candidates[0])
  if (!existing && core) return { route: { page: 'conversations' as const, conversationId: null, coreDraft: true as const }, scope: 'conversations' as const, target }
  const room = existing ?? await api.request('createConversation', { kind: 'direct', title: employee.name, agentIds: [employee.id], mode: 'natural' })
  if (!current()) return
  if (!isEmployeeTaskHost(room, employee.id)) throw new Error('员工主会话身份不匹配，请重新打开')
  if (room.list?.hidden) await api.request('updateConversationList', { id: room.id, action: 'show' })
  if (!current()) return
  return { route: { page: 'conversations' as const, conversationId: room.id }, scope: 'conversations' as const, target }
}
