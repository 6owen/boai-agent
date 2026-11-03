/*
 * [OUTPUT]: bobo优先保持当前核心会话，无历史时只打开草稿；任务导航不创建或发送新的核心聊天。
 * [INPUT]: 真实员工任务导航函数、混合会话快照和可控IPC回执。
 * [OUTPUT]: 明确员工任务入口定位主会话及右侧任务面板；隐藏主会话复用、创建零发送、迟到取消及跨页错位标签清理。
 * [POS]: 员工为一等公民的任务导航合同回归，不调用模型或操作个人数据。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect, it, vi } from 'vitest'
import type { Conversation, Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { isEmployeeTaskHost, resolveEmployeeTaskDestination, type EmployeeTaskTarget } from '../apps/electron/src/renderer/components/app-shell/employee-task-navigation'
import { detailWorkspacesReducer, emptyDetailTabs } from '../apps/electron/src/renderer/components/detail-panel/tabs-state'

const target: EmployeeTaskTarget = { type: 'employee-tasks', id: 'codex', occurrenceId: 'weather', requestId: 'open-weather', focusMessage: { id: 'trigger', requestId: 'focus' } }
const room = (id: string, extra: Partial<Conversation> = {}) => ({ id, kind: 'direct', agentIds: ['codex'], ...extra }) as Conversation
const snapshot = (conversations: Conversation[]) => ({ agents: [{ id: 'codex', name: 'Codex' }], conversations }) as Snapshot
it('opens bobo tasks alongside the current core chat without switching to another core conversation or creating one', async () => {
  const request = vi.fn(), coreTarget: EmployeeTaskTarget = { type: 'employee-tasks', id: 'bobo', requestId: 'open-core-tasks' }
  const rooms = [room('newer-core', { purpose: 'core', agentIds: ['bobo'], updatedAt: '2026-11-03T08:00:00Z' }), room('current-core', { purpose: 'core', agentIds: ['bobo'], updatedAt: '2026-11-02T08:00:00Z' })]
  const state = { agents: [{ id: 'bobo', systemRole: 'core', name: 'bobo' }], conversations: rooms } as Snapshot
  expect(isEmployeeTaskHost(rooms[1], 'bobo')).toBe(true)
  const result = await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: state, target: coreTarget, conversationId: 'current-core', current: () => true })
  expect(result).toEqual({ route: { page: 'conversations', conversationId: 'current-core' }, scope: 'conversations', target: coreTarget })
  expect(request).not.toHaveBeenCalled()
  expect((await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: state, target: coreTarget, current: () => true }))?.route.conversationId).toBe('newer-core')
  expect(request).not.toHaveBeenCalled()
})
it('keeps bobo tasks available before the first core chat without manufacturing an empty conversation', async () => {
  const request = vi.fn(), coreTarget: EmployeeTaskTarget = { type: 'employee-tasks', id: 'bobo', requestId: 'open-core-draft-tasks' }
  const rooms = [room('task-context', { purpose: 'automation', agentIds: ['bobo'] }), room('internal', { purpose: 'channel-internal', agentIds: ['bobo'] }), room('group', { kind: 'group', purpose: 'core', agentIds: ['bobo'] })]
  const state = { agents: [{ id: 'bobo', systemRole: 'core', name: 'bobo' }], conversations: rooms } as Snapshot
  const result = await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: state, target: coreTarget, current: () => true })
  expect(result).toEqual({ route: { page: 'conversations', conversationId: null, coreDraft: true }, scope: 'conversations', target: coreTarget })
  expect(request).not.toHaveBeenCalled()
  for (const candidate of rooms) expect(isEmployeeTaskHost(candidate, 'bobo')).toBe(false)
})
it('locates the employee main chat and opens the employee main chat with the requested occurrence in its right-side task panel', async () => {
  const request = vi.fn()
  const result = await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: snapshot([
    room('private-execution', { purpose: 'automation', occurrenceId: 'weather' }),
    room('group', { kind: 'group' }), room('another-employee', { agentIds: ['writer'], mainPrivate: true }),
    room('codex-main', { mainPrivate: true }),
  ]), target, current: () => true })
  expect(result).toEqual({ route: { page: 'conversations', conversationId: 'codex-main' }, scope: 'conversations', target })
  expect(request).not.toHaveBeenCalled()
})
it('reveals the existing hidden main chat instead of creating another employee conversation', async () => {
  const request = vi.fn(async () => {})
  const result = await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: snapshot([room('hidden-main', { mainPrivate: true, list: { hidden: true } })]), target, current: () => true })
  expect(result?.route).toEqual({ page: 'conversations', conversationId: 'hidden-main' })
  expect(request.mock.calls).toEqual([['updateConversationList', { id: 'hidden-main', action: 'show' }]])
})
it('creates only the employee main chat when absent, without sending task instructions into it', async () => {
  const request = vi.fn(async () => room('new-main', { mainPrivate: true }))
  const result = await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: snapshot([room('task-context', { purpose: 'automation' })]), target, current: () => true })
  expect(result?.route.conversationId).toBe('new-main')
  expect(result?.scope).toBe('conversations')
  expect(request.mock.calls).toEqual([['createConversation', { kind: 'direct', title: 'Codex', agentIds: ['codex'], mode: 'natural' }]])
})
it('does not navigate after the user leaves while the main chat is being resolved', async () => {
  let current = true
  const request = vi.fn(async () => { current = false; return room('new-main', { mainPrivate: true }) })
  expect(await resolveEmployeeTaskDestination({ api: { request } as unknown as DesktopApi, snapshot: snapshot([]), target, current: () => current })).toBeUndefined()
})
it('keeps employee task panels in conversations and removes only misplaced preview tabs', () => {
  for (const scope of ['schedules', 'contacts']) expect(detailWorkspacesReducer({}, { scope, action: { type: 'open', target } })).toEqual({})
  const valid = detailWorkspacesReducer({}, { scope: 'conversations', action: { type: 'open', target } })
  const state = { ...valid, schedules: { ...emptyDetailTabs, tabs: [{ key: 'schedules/task', target }, { key: 'schedules/process', target: { type: 'automation-occurrence' as const, id: 'weather' } }], activeKey: 'schedules/task', shown: true } }
  const cleaned = detailWorkspacesReducer(state, { type: 'remove-misplaced-employee-tasks' })
  expect(cleaned.conversations).toEqual(valid.conversations)
  expect(cleaned.schedules.tabs).toEqual([state.schedules.tabs[1]])
  expect(cleaned.schedules.activeKey).toBe('schedules/process')
})
