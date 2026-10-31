/*
 * [INPUT]: 员工任务目标、当前快照、原主私聊创建/显隐接口与导航存活检查。
 * [OUTPUT]: 返回该员工主会话与右侧任务面板定位；任务私有会话仍在Dialog内，群和渠道不能充当主会话。
 * [POS]: 所有员工任务入口的共同导航边界，定时任务页不承载员工任务面板。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Conversation, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DetailTarget } from '../detail-panel/tabs-state'

export type EmployeeTaskTarget = Extract<DetailTarget, { type: 'employee-tasks' }>
export function isEmployeeTaskHost(room: Conversation | undefined, employeeId: string) {
  return Boolean(room && room.kind === 'direct' && !room.mergedInto && (room.mainPrivate || !room.channel) && (!room.purpose || room.purpose === 'personal') && room.agentIds.length === 1 && room.agentIds[0] === employeeId)
}
export async function resolveEmployeeTaskDestination({ api, snapshot, target, current }: {
  api: DesktopApi; snapshot: Snapshot; target: EmployeeTaskTarget; current(): boolean
}) {
  if (!current()) return
  const employee = snapshot.agents.find(agent => agent.id === target.id)
  if (!employee) throw new Error('该员工已不存在')
  // Include hidden main chats: opening a task must not create a second private chat.
  const candidates = snapshot.conversations.filter(room => isEmployeeTaskHost(room, employee.id))
  const existing = candidates.find(room => room.mainPrivate) ?? candidates[0]
  const room = existing ?? await api.request('createConversation', { kind: 'direct', title: employee.name, agentIds: [employee.id], mode: 'natural' })
  if (!current()) return
  if (!isEmployeeTaskHost(room, employee.id)) throw new Error('员工主会话身份不匹配，请重新打开')
  if (room.list?.hidden) await api.request('updateConversationList', { id: room.id, action: 'show' })
  if (!current()) return
  return { route: { page: 'conversations' as const, conversationId: room.id }, scope: 'conversations' as const, target }
}
