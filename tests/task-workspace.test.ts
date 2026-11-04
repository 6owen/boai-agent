// @vitest-environment jsdom
/*
 * [OUTPUT]: 各状态统一快捷执行、composer队列展示/待决防重复/稳定请求重试及隐藏停读。
 * [OUTPUT]: 看板/列表列清空二级确认、取消零写、空列禁用与稳定请求重试。
 * [OUTPUT]: 创建状态只继承触发列且无header入口；溢出看板的Portal菜单指针不触发横拖，显示标签沿pressed状态。
 * [OUTPUT]: 平级列创建与共享显隐零执行、批量入口隐藏；会话创建以稳定身份建任务/执行并复用任务Dialog。
 * [OUTPUT]: 空白鼠标拖动横向滚动及松手/取消/丢失捕获收尾；卡片/控件/触摸手势不接管，任务要求仅在左侧属性展示。
 * [OUTPUT]: 任务详情关闭等待全局动画结束才回调卸载，退出时暂停读取且不停止执行；隐藏可恢复。
 * [OUTPUT]: 已完成/关闭任务保留原会话且不展示再次执行；详情Popover改状态不执行；标题/描述显式保存、内部点击不关闭，批量重试及原拖拽/关闭回归保持。
 * [OUTPUT]: 任务详情属性/会话沿全局Resizable分栏，原会话与精确取消行为保持。
 * [OUTPUT]: 菜单打开/重开后静止指针不高亮删除；真实移动与键盘导航沿原库。
 * [OUTPUT]: 删除子菜单使用取消/确认删除两项，取消零写、确认固定员工/任务/修订。
 * [OUTPUT]: 状态保存期间只更新目标卡片，其他卡片状态控件/内容和整板DOM保持；原拒绝回退继续覆盖。
 * [OUTPUT]: ReUI真实传感器覆盖同列排序重挂载保留、跨列后外部松手取消，视图顺序不调用执行接口。
 * [OUTPUT]: 列表分组折叠、列表/看板右键子菜单、重命名/删除确认及无误执行回归。
 * [OUTPUT]: 真实dnd-kit传感器覆盖跨列预览不写、跨列取消无误开、待决投影与失败回退，异步保存不重建滚动容器；任务属性左侧平铺。
 * [INPUT]: Real shared task panel/Dialog/Select and bounded conversation reader, with controlled IPC.
 * [OUTPUT]: Property header opens a separate requirements Dialog; no property footer or collapse controls are rendered.
 * [OUTPUT]: Board drag persistence/cancellation, two-column task session, manual status, precise stop and hidden read guards.
 * [POS]: Renderer interaction contract; no Electron or model calls.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AutomationOccurrence, Conversation, Snapshot } from '../packages/shared/src/domain'
import type { TrackedTask } from '../packages/shared/src/domain/tracked-tasks'
import type { ConversationReadingState } from '../packages/shared/src/domain/reading'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { ConversationQueue } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-queue'
import { EmployeeTasksPanel } from '../apps/electron/src/renderer/components/detail-panel/employee-tasks-panel'
import { EmployeeTaskDetail } from '../apps/electron/src/renderer/components/detail-panel/employee-task-detail'
import { EmployeeTaskForm } from '../apps/electron/src/renderer/components/detail-panel/employee-task-form'
import { EmployeeTaskBatch } from '../apps/electron/src/renderer/components/detail-panel/employee-task-batch'
import { taskStatusLabels } from '../apps/electron/src/renderer/components/detail-panel/employee-task-status'
import { EMPLOYEE_TASK_STATUSES } from '../packages/shared/src/domain/tracked-tasks'
import type { ChannelChatWindow } from '../apps/electron/src/renderer/components/detail-panel/channels-tab'
let host: HTMLDivElement, root: Root
const originalAnimations = Element.prototype.getAnimations
beforeEach(() => { localStorage.clear(); Element.prototype.getAnimations = () => []; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => {
  await act(async () => root.unmount())
  // dnd-kit intentionally keeps document click suppression for 50ms after drop.
  // Let that real sensor cleanup finish before the next independent fixture clicks.
  await new Promise(resolve => setTimeout(resolve, 60))
  host.remove(); if (originalAnimations) Element.prototype.getAnimations = originalAnimations; else Reflect.deleteProperty(Element.prototype, 'getAnimations'); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const stamp = '2026-10-30T01:00:00.000Z'
const task: TrackedTask = { id: 'task', agentId: 'employee', title: '新闻总结', description: '总结新闻', status: 'pending', steps: [], note: '', revision: 1, createdAt: stamp, updatedAt: stamp }
const room = { id: 'task-session', purpose: 'automation', employeeTaskId: task.id, agentIds: ['employee'], kind: 'direct' } as Conversation
const reading: ConversationReadingState = { id: room.id, conversationId: room.id, userId: 'user', epoch: 1, revision: 0, boundary: 0, sparseSeen: [], completionCount: 0, unreadCount: 0, legacyCompletedUnknown: false, anchor: null }
const snapshot = { agents: [{ id: 'employee', name: 'DS' }], conversations: [] } as unknown as Snapshot
const occurrence: AutomationOccurrence = { schemaVersion: 1, stateVersion: 1, id: 'occurrence', automationId: 'definition', name: task.title, status: 'queued', source: 'manual', scheduledFor: stamp, startedAt: stamp, deliveryStatus: 'pending', usageIncomplete: true, resultMessageIds: [], runIds: [], conversationId: room.id, plan: { owner: { kind: 'employee', employeeId: 'employee' }, employeeIds: ['employee'] } }
function fixture(executions: AutomationOccurrence[] = []) {
  let value = task, deleted = false
  const request = vi.fn(async (method: string, input?: any): Promise<any> => {
    if (method === 'getEmployeeTask') return { task: value, executions: { occurrences: executions } }
    if (method === 'listEmployeeTasks') return { items: !deleted && (!input.status || input.status === value.status) ? [value] : [] }
    if (method === 'openEmployeeTaskSession') return room
    if (method === 'getConversationReading') return reading
    if (method === 'getConversationView') return { conversation: room, reading, messagePage: { items: [] }, messages: [], runs: [], artifacts: [], approvals: [] }
    if (method === 'updateEmployeeTask') { expect(input).toMatchObject({ employeeId: task.agentId, id: task.id, expectedRevision: value.revision }); value = { ...value, ...(input.status ? { status: input.status } : {}), ...(input.title ? { title: input.title } : {}), ...(input.description ? { description: input.description } : {}), revision: value.revision + 1 }; return value }
    if (method === 'runEmployeeTask') return occurrence
    if (method === 'clearEmployeeTasks') { expect(input).toMatchObject({ employeeId: task.agentId, status: value.status, requestId: expect.any(String) }); deleted = true; return { deletedIds: [task.id], skippedIds: [] } }
    if (method === 'deleteEmployeeTask') { expect(input).toEqual({ employeeId: task.agentId, id: task.id, expectedRevision: value.revision }); deleted = true; return { deleted: true } }
    throw new Error('Unexpected request: ' + method)
  })
  const unsubscribe = vi.fn(), api = { request, subscribe: () => unsubscribe } as unknown as DesktopApi
  const renderChat = vi.fn((window: ChannelChatWindow, _onTrace: unknown, historyHeader?: ReactNode) => h('div', { 'data-shared-chat': window.detail.conversation.id }, historyHeader, 'shared chat'))
  const props = { api, snapshot, employeeId: task.agentId, onChat: vi.fn(), onProcess: vi.fn(), onSource: vi.fn(), onBack: vi.fn(), onMaterials: vi.fn(), onContext: vi.fn(), renderChat }
  return { request, unsubscribe, props }
}
const button = (label: string) => [...document.body.querySelectorAll('button')].find(b => b.textContent === label)!

test.each(['done', 'closed'] as const)('keeps a %s task in its original conversation without a rerun button', async status => {
  const f = fixture([{ ...occurrence, status: 'completed' }])
  await f.props.api.request('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, status })
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  expect(button('再次执行')).toBeUndefined()
  expect(button('开始执行')).toBeUndefined()
  expect(f.request.mock.calls.filter(([method]) => method === 'runEmployeeTask')).toHaveLength(0)
  expect(f.request.mock.calls.filter(([method]) => method === 'updateEmployeeTask')).toHaveLength(1)
  expect(document.querySelector('[data-shared-chat]')?.getAttribute('data-shared-chat')).toBe(room.id)
})

test('task properties choose status from a Popover without starting execution', async () => {
  // jsdom has no layout/scrolling; cmdk scrolls the selected option on open.
  const scrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = () => {}
  try {
    const f = fixture()
    await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
    await act(async () => document.querySelector<HTMLButtonElement>('aside [aria-label="任务状态"]')!.click())
    const popup = document.querySelector('[data-slot="popover-content"]')!
    expect(popup).not.toBeNull()
    await act(async () => popup.querySelector<HTMLElement>('[data-slot="command-item"][data-value="done"]')!.click())
    expect(f.request.mock.calls.filter(([method]) => method === 'updateEmployeeTask')).toEqual([['updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, status: 'done' }]])
    expect(document.querySelector('aside [aria-label="任务状态"]')?.textContent).toBe('完成')
    expect(document.querySelector('[data-slot="popover-content"][data-open]')).toBeNull()
    expect(f.request.mock.calls.some(([method]) => ['runEmployeeTask', 'sendMessage'].includes(method))).toBe(false)
  } finally { if (scrollIntoView) Element.prototype.scrollIntoView = scrollIntoView; else Reflect.deleteProperty(Element.prototype, 'scrollIntoView') }
})

test('edits title and description only on save, keeps the dialog open through focus changes and preserves concurrent status', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  expect(document.querySelector('aside footer')).toBeNull()
  expect(document.querySelector('aside header [aria-label="编辑任务"]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('aside [aria-label="编辑任务"]')!.click())
  const title = document.querySelector<HTMLInputElement>('#employee-task-edit-title')!, input = document.querySelector<HTMLTextAreaElement>('#employee-task-edit-description')!
  const editor = input.closest('[role="dialog"]')!
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  expect(editor.querySelector('[data-slot="dialog-title"]')?.textContent).toBe('编辑任务')
  expect(title.value).toBe(task.title)
  expect(input.value).toBe(task.description)
  await changeField(title, '修改后的任务标题')
  await act(async () => input.focus())
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '修改后的目标与验收标准'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => { input.blur(); editor.querySelector<HTMLElement>('[data-slot="dialog-title"]')!.click() })
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  expect(f.request.mock.calls.filter(([method]) => method === 'updateEmployeeTask')).toHaveLength(0)
  await f.props.api.request('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, status: 'in_review' })
  await act(async () => [...editor.querySelectorAll('button')].find(button => button.textContent === '保存')!.click())
  expect(f.request.mock.calls.find(([method, value]) => method === 'updateEmployeeTask' && value.description)?.[1]).toEqual({ employeeId: task.agentId, id: task.id, expectedRevision: 2, title: '修改后的任务标题', description: '修改后的目标与验收标准' })
  expect(document.querySelector('[aria-label="任务要求"]')?.textContent).toContain('修改后的任务标题')
  expect(document.querySelector('[aria-label="任务要求"]')?.textContent).toContain('修改后的目标与验收标准')
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(f.request.mock.calls.some(([method]) => ['runEmployeeTask', 'runEmployeeTasks', 'sendEmployeeTaskMessage'].includes(method))).toBe(false)
})

test('clicking inside an unchanged edit dialog never closes it, and cancel writes nothing', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  await act(async () => document.querySelector<HTMLButtonElement>('aside [aria-label="编辑任务"]')!.click())
  const title = document.querySelector<HTMLInputElement>('#employee-task-edit-title')!, input = document.querySelector<HTMLTextAreaElement>('#employee-task-edit-description')!, editor = title.closest('[role="dialog"]')!
  await act(async () => { input.focus(); input.blur(); editor.querySelector<HTMLElement>('[data-slot="dialog-title"]')!.click() })
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  expect(title.value).toBe(task.title)
  await act(async () => [...editor.querySelectorAll('button')].find(button => button.textContent === '取消')!.click())
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(f.request.mock.calls.some(([method]) => ['updateEmployeeTask', 'runEmployeeTask', 'sendMessage'].includes(method))).toBe(false)
})

test('batch selection preserves click order and retries an unknown request with the same identity', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!, requests: any[] = []
  const other = { ...task, id: 'other-task', title: '第二项任务', revision: 4, status: 'done' }
  f.request.mockImplementation(async (method, input) => {
    if (method === 'listEmployeeTasks' && !input.status) return { items: [{ ...task, executionStatus: 'completed' }, { ...other, executionStatus: 'completed' }] }
    if (method === 'runEmployeeTasks') { requests.push(input); if (requests.length === 1) throw new Error('受理回执连接中断'); return { items: input.tasks.map((value: any) => ({ id: value.id, execution: { ...occurrence, taskId: value.id } })) } }
    return original(method, input)
  })
  await act(async () => root.render(h(EmployeeTaskBatch, { api: f.props.api, employeeId: task.agentId, active: true, open: true, onClose() {}, onDispatched() {} })))
  expect(requests).toHaveLength(0)
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="选择任务：第二项任务"]')!.click())
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="选择任务：新闻总结"]')!.click())
  await act(async () => button('执行所选任务（2）').click())
  expect(requests[0].tasks).toEqual([{ id: other.id, expectedRevision: 4 }, { id: task.id, expectedRevision: 1 }])
  await act(async () => button('执行所选任务（2）').click())
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0])
})

const changeField = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
test.each(EMPLOYEE_TASK_STATUSES)('creates directly in the %s column without starting work', async status => {
  const f = fixture(), original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, input) => method === 'createEmployeeTask' ? { ...task, ...input } : original(method, input))
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'create-column' } })))
  expect(button('批量执行')).toBeUndefined()
  expect(host.querySelector('[aria-label="显示任务列"]')!.compareDocumentPosition(host.querySelector('[aria-label="任务视图"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="创建${taskStatusLabels[status]}任务"]`)!.click())
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.querySelector('[aria-label="任务状态"]')).toBeNull()
  await changeField(dialog.querySelector<HTMLInputElement>('#employee-task-title')!, '用户目标')
  await changeField(dialog.querySelector<HTMLTextAreaElement>('#employee-task-description')!, '验收标准')
  await act(async () => dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
  expect(f.request.mock.calls.find(([method]) => method === 'createEmployeeTask')?.[1]).toMatchObject({ status, title: '用户目标', description: '验收标准' })
  expect(f.request.mock.calls.some(([method]) => ['runEmployeeTask', 'runEmployeeTasks', 'sendEmployeeTaskMessage'].includes(method))).toBe(false)
})
test('hides and restores peer columns across board/list and remount without changing tasks', async () => {
  const f = fixture(), props = { ...f.props, active: true, target: { type: 'employee-tasks' as const, id: task.agentId, requestId: 'visibility' } }
  await act(async () => root.render(h(EmployeeTasksPanel, props)))
  const viewport = host.querySelector<HTMLDivElement>('[aria-label="任务看板横向滚动区域"]')!
  Object.defineProperties(viewport, { scrollWidth: { value: 1500 }, clientWidth: { value: 600 } })
  viewport.setPointerCapture = vi.fn()
  viewport.hasPointerCapture = vi.fn(() => false)
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="待办列菜单"]')!.click())
  const hide = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!
  await act(async () => { pointer(hide, 'pointerdown', 400); pointer(hide, 'pointerup', 400) })
  expect(viewport.setPointerCapture).not.toHaveBeenCalled()
  await act(async () => hide.click())
  expect(host.querySelector('section[aria-label="待办任务"]')).toBeNull()
  await act(async () => button('列表').click())
  expect(host.querySelector('section[aria-label="待办任务"]')).toBeNull()
  expect(host.querySelectorAll('button[aria-label^="创建"][aria-label$="任务"]')).toHaveLength(4)
  await act(async () => root.render(null))
  await act(async () => root.render(h(EmployeeTasksPanel, props)))
  expect(host.querySelector('section[aria-label="待办任务"]')).toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="显示任务列"]')!.click())
  const toggle = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button')].find(value => value.textContent === '待办')!
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  await act(async () => toggle.click())
  expect(host.querySelector('section[aria-label="待办任务"]')).not.toBeNull()
  expect(f.request.mock.calls.every(([method]) => method === 'listEmployeeTasks')).toBe(true)
})
test('conversation creation uses one raw prompt and retries the same accepted task execution', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!, saved = vi.fn(), requests: any[] = []
  f.request.mockImplementation(async (method, input) => {
    if (method === 'createEmployeeTask') return { ...task, ...input, revision: requests.length ? 5 : 1 }
    if (method === 'runEmployeeTask') { requests.push(input); if (requests.length === 1) throw new Error('执行回执连接中断'); return occurrence }
    return original(method, input)
  })
  await act(async () => root.render(h(EmployeeTaskForm, { api: f.props.api, employeeId: task.agentId, active: true, initialStatus: 'closed', onClose() {}, onSaved: saved })))
  await act(async () => button('会话创建').click())
  expect(document.querySelector('#employee-task-title')).toBeNull()
  const input = document.querySelector<HTMLTextAreaElement>('#employee-task-prompt')!
  await changeField(input, '请查南京天气，给出来源和穿衣建议')
  await act(async () => button('创建会话').click())
  expect(saved).not.toHaveBeenCalled()
  expect(input.disabled).toBe(true)
  await act(async () => button('核对本次提交').click())
  const creations = f.request.mock.calls.filter(([method]) => method === 'createEmployeeTask').map(([, value]) => value)
  expect(creations).toHaveLength(2); expect(creations[1]).toEqual(creations[0])
  expect(creations[0]).toMatchObject({ status: 'closed', conversation: true, description: '请查南京天气，给出来源和穿衣建议' })
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(requests[0].expectedRevision).toBe(1)
  expect(saved).toHaveBeenCalledExactlyOnceWith(task.id)
})

test('matches resource header, switches board/list and opens one task in a Dialog using its shared conversation', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  expect(host.querySelector('header.chat-header.skill-detail-title')?.textContent).toContain('DS · 任务')
  expect(host.querySelector('[aria-label="任务看板"]')).not.toBeNull()
  expect(f.request.mock.calls.filter(([m]) => m === 'listEmployeeTasks').map(([, input]) => input.status)).toEqual(['pending', 'in_progress', 'in_review', 'done', 'closed'])
  expect(button('创建任务')).toBeUndefined()
  await act(async () => button('列表').click())
  expect(host.querySelector('[aria-label="任务列表"]')).not.toBeNull()
  await act(async () => (host.querySelector('[data-employee-task-id]') as HTMLButtonElement).click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.querySelector('[data-shared-chat]')?.getAttribute('data-shared-chat')).toBe(room.id)
  expect(f.props.onContext).toHaveBeenCalledWith(room)
  expect(f.request.mock.calls.filter(([m]) => m === 'openEmployeeTaskSession')).toHaveLength(1)
  expect(f.request.mock.calls.some(([m]) => ['runEmployeeTask', 'sendMessage'].includes(m))).toBe(false)
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.querySelector('[aria-label="任务会话"] [aria-label="任务要求"]')).toBeNull()
  expect(dialog.querySelector('[data-shared-chat]')?.textContent).toBe('shared chat')
  expect(dialog.querySelector('aside[aria-label="任务属性"] [aria-label="任务要求"]')?.textContent).toContain(task.title)
  expect(dialog.querySelector('aside[aria-label="任务属性"] [aria-label="任务要求"]')?.textContent).toContain(task.description)
  expect(dialog.querySelector('aside[aria-label="任务属性"] [aria-label="任务状态"]')).not.toBeNull()
  expect(dialog.querySelector('aside[aria-label="任务属性"]')?.textContent).toContain('负责人')
  const properties = dialog.querySelector('aside[aria-label="任务属性"]')!
  expect(properties.compareDocumentPosition(dialog.querySelector('[aria-label="任务会话"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(dialog.querySelector('[role="separator"][aria-label="调整任务属性与会话宽度"]')).not.toBeNull()
  expect(properties.textContent).toContain('创建时间')
  expect(properties.textContent).toContain('更新时间')
  expect(properties.textContent).not.toContain('执行记录')
  expect(properties.querySelector('[data-slot="collapsible"]')).toBeNull()
})

function pointer(target: Element, type: string, clientX: number, pointerType = 'mouse', button = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button })
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: pointerType }, isPrimary: { value: true } })
  target.dispatchEvent(event)
  return event
}

test.each(['pointerup', 'pointercancel', 'lostpointercapture'])('mouse pans board space without task writes and stops on %s', async end => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'pan' } })))
  const viewport = host.querySelector<HTMLDivElement>('[aria-label="任务看板横向滚动区域"]')!
  const blank = host.querySelector('[data-task-status="done"] h3')!
  Object.defineProperties(viewport, { scrollWidth: { value: 1500 }, clientWidth: { value: 600 } })
  let captured = false
  viewport.setPointerCapture = vi.fn(() => { captured = true })
  viewport.hasPointerCapture = () => captured
  viewport.releasePointerCapture = vi.fn(() => { captured = false })
  viewport.scrollLeft = 120
  await act(async () => { pointer(blank, 'pointerdown', 400); pointer(viewport, 'pointermove', 250) })
  expect(viewport.scrollLeft).toBe(270)
  expect(viewport.classList.contains('cursor-grabbing')).toBe(true)
  if (end === 'lostpointercapture') captured = false
  await act(async () => { pointer(viewport, end, 250); pointer(viewport, 'pointermove', 200) })
  expect(viewport.scrollLeft).toBe(270)
  expect(captured).toBe(false)
  expect(viewport.classList.contains('cursor-grabbing')).toBe(false)
  expect(f.request.mock.calls.some(([m]) => ['updateEmployeeTask', 'runEmployeeTask', 'sendMessage', 'openEmployeeTaskSession'].includes(m))).toBe(false)
  expect(document.querySelector('[data-task-drag-preview]')).toBeNull()
})

test('board panning leaves task cards, controls, secondary mouse buttons and touch gestures alone', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'pan-guards' } })))
  const viewport = host.querySelector<HTMLDivElement>('[aria-label="任务看板横向滚动区域"]')!
  Object.defineProperties(viewport, { scrollWidth: { value: 1500 }, clientWidth: { value: 600 } })
  viewport.setPointerCapture = vi.fn()
  const card = host.querySelector('[data-employee-task-id] h4')!, create = host.querySelector('[aria-label="创建待办任务"]')!, status = host.querySelector('[data-employee-task-id] [aria-label="任务状态"]')!
  for (const target of [card, create, status]) expect(pointer(target, 'pointerdown', 400).defaultPrevented).toBe(false)
  expect(pointer(viewport, 'pointerdown', 400, 'touch').defaultPrevented).toBe(false)
  expect(pointer(viewport, 'pointerdown', 400, 'mouse', 2).defaultPrevented).toBe(false)
  pointer(viewport, 'pointermove', 200)
  expect(viewport.scrollLeft).toBe(0)
  expect(viewport.setPointerCapture).not.toHaveBeenCalled()
})

// jsdom has no layout; give the real dnd-kit sensors/collision detector stable board rectangles.
function boardLayout() {
  const statuses = ['pending', 'in_progress', 'in_review', 'done', 'closed']
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const lane = this.closest('[data-task-status]'), index = statuses.indexOf(lane?.getAttribute('data-task-status') ?? '')
    if (this.hasAttribute('data-task-status')) return new DOMRect(index * 300, 0, 280, 500)
    if (index >= 0) {
      const card = this.closest('[data-employee-task-id]')
      const row = card ? [...lane!.querySelectorAll('[data-employee-task-id]')].indexOf(card) : 0
      return new DOMRect(index * 300 + 12, 60 + Math.max(0, row) * 132, 256, 120)
    }
    return new DOMRect(0, 0, 1500, 500)
  })
}
const mouse = (target: EventTarget, type: string, x: number, y = 100) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y }))
async function startDrag() {
  await act(async () => { mouse(host.querySelector('[data-employee-task-id] button')!, 'mousedown', 40) })
  await act(async () => { mouse(document, 'mousemove', 55) })
  expect(document.querySelector('[data-task-drag-preview]')).not.toBeNull()
}
async function dropAt(x: number) {
  await act(async () => { mouse(document, 'mousemove', x) })
  await act(async () => { mouse(document, 'mouseup', x) })
}
test('ReUI cross-column drag persists once without opening or executing the task', async () => {
  const f = fixture(); boardLayout()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  await startDrag(); await dropAt(960)
  await act(async () => { mouse(document, 'mouseup', 960) })
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toEqual([['updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, status: 'done' }]])
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).not.toBeNull()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.querySelector('[data-task-drag-preview]')).toBeNull()
  expect(f.request.mock.calls.some(([m]) => ['runEmployeeTask', 'sendMessage', 'openEmployeeTaskSession'].includes(m))).toBe(false)
})
test('ReUI same-column, outside drops and Escape cancellation keep the original status', async () => {
  const f = fixture(); boardLayout()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  await startDrag(); await dropAt(80)
  await startDrag()
  await act(async () => { mouse(document, 'mousemove', 960) })
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).not.toBeNull()
  await dropAt(1700)
  expect(host.querySelector('[data-task-status="pending"] [data-employee-task-id]')).not.toBeNull()
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toHaveLength(0)
  await startDrag()
  await act(async () => { mouse(document, 'mousemove', 960) })
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).not.toBeNull()
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toHaveLength(0)
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toHaveLength(0)
  expect(host.querySelector('[data-task-status="pending"] [data-employee-task-id]')).not.toBeNull()
  expect(document.querySelector('[data-task-drag-preview]')).toBeNull()
  // A mouse release after Escape can still produce a click after the library detaches its click blocker.
  await act(async () => (host.querySelector('[data-employee-task-id] button') as HTMLButtonElement).click())
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
test('ReUI same-column sorting survives board remount without changing status or execution order', async () => {
  const f = fixture(), normal = f.request.getMockImplementation()!; boardLayout()
  const items = [task, { ...task, id: 'task-b', title: '第二项' }, { ...task, id: 'task-c', title: '第三项' }]
  f.request.mockImplementation(async (method, input) => method === 'listEmployeeTasks' ? { items: input.status === 'pending' ? items : [] } : normal(method, input))
  const props = { ...f.props, active: true, target: { type: 'employee-tasks' as const, id: task.agentId, requestId: 'order' } }
  await act(async () => root.render(h(EmployeeTasksPanel, props)))
  const ids = () => [...host.querySelectorAll('[data-task-status="pending"] [data-employee-task-id]')].map(node => node.getAttribute('data-employee-task-id'))
  await startDrag()
  await act(async () => { mouse(document, 'mousemove', 80, 350) })
  await act(async () => { mouse(document, 'mouseup', 80, 350) })
  expect(ids()).toEqual(['task-b', 'task-c', 'task'])
  await act(async () => root.render(null))
  await act(async () => root.render(h(EmployeeTasksPanel, props)))
  expect(ids()).toEqual(['task-b', 'task-c', 'task'])
  expect(items.map(item => item.id)).toEqual(['task', 'task-b', 'task-c'])
  expect(f.request.mock.calls.some(([method]) => ['updateEmployeeTask', 'runEmployeeTask', 'sendMessage', 'openEmployeeTaskSession'].includes(method))).toBe(false)
})

test('a rejected library drop retains the stored status and original card', async () => {
  const f = fixture(), normal = f.request.getMockImplementation()!; boardLayout()
  f.request.mockImplementation(async (method, input) => { if (method === 'updateEmployeeTask') throw new Error('任务已经改变，请刷新后重新提交'); return normal(method, input) })
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  await startDrag(); await dropAt(960)
  expect(host.querySelector('[data-task-status="pending"] [data-employee-task-id]')).not.toBeNull()
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).toBeNull()
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toHaveLength(1)
})

test.each([false, true])('preserves horizontal/vertical scroll containers through a pending status save (reject=%s)', async reject => {
  const f = fixture(), normal = f.request.getMockImplementation()!; boardLayout()
  let finish!: () => void
  f.request.mockImplementation(async (method, input) => {
    if (method === 'updateEmployeeTask') {
      await new Promise<void>(resolve => { finish = resolve })
      if (reject) throw new Error('修订冲突')
    }
    return normal(method, input)
  })
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  const outer = host.querySelector<HTMLElement>('[aria-label="任务看板横向滚动区域"]')!
  const lane = host.querySelector<HTMLElement>('[aria-label="待确认任务滚动区域"]')!
  outer.scrollLeft = 400; lane.scrollTop = 120
  await startDrag(); await dropAt(960)
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).not.toBeNull()
  expect(host.querySelector('[aria-label="任务看板横向滚动区域"]')).toBe(outer)
  expect(host.querySelector('[aria-label="待确认任务滚动区域"]')).toBe(lane)
  expect(outer.scrollLeft).toBe(400); expect(lane.scrollTop).toBe(120)
  await act(async () => finish())
  expect(host.querySelector('[aria-label="任务看板横向滚动区域"]')).toBe(outer)
  expect(host.querySelector('[aria-label="待确认任务滚动区域"]')).toBe(lane)
  expect(outer.scrollLeft).toBe(400); expect(lane.scrollTop).toBe(120)
  expect(host.querySelector(`[data-task-status="${reject ? 'pending' : 'done'}"] [data-employee-task-id]`)).not.toBeNull()
})

test('lets a task status be changed manually from the card without opening the task', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'open' } })))
  await act(async () => (host.querySelector('[aria-label="任务状态"]') as HTMLButtonElement).click())
  const options = [...document.querySelectorAll('[role="option"]')]
  expect(options.map(o => o.textContent)).toEqual(['待办', '进行中', '待确认', '完成', '已关闭'])
  await act(async () => { const option = options.find(o => o.textContent === '完成') as HTMLElement; option.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' })); option.click() })
  expect(f.request.mock.calls.find(([m]) => m === 'updateEmployeeTask')?.[1]).toMatchObject({ status: 'done' })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

test('a pending drop only marks its own card busy and preserves unrelated card content', async () => {
  const f = fixture(), normal = f.request.getMockImplementation()!; boardLayout()
  let finish!: () => void
  const other = { ...task, id: 'other-task', title: '无需刷新的任务', status: 'closed' }
  f.request.mockImplementation(async (method, input) => {
    if (method === 'listEmployeeTasks' && input.status === 'closed') return { items: [other] }
    if (method === 'updateEmployeeTask') await new Promise<void>(resolve => { finish = resolve })
    return normal(method, input)
  })
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'local' } })))
  const board = host.querySelector<HTMLElement>('[aria-label="任务看板"]')!
  const original = host.querySelector('[data-employee-task-id="other-task"]')!
  const content = original.querySelector('[data-slot="card-content"]')!
  const status = content.querySelector<HTMLButtonElement>('[aria-label="任务状态"]')!
  await startDrag(); await dropAt(960)
  expect(host.querySelector('[aria-label="任务看板"]')).toBe(board)
  expect(board.hasAttribute('inert')).toBe(true)
  expect(host.querySelector('[data-employee-task-id="other-task"]')).toBe(original)
  expect(original.querySelector('[data-slot="card-content"]')).toBe(content)
  expect(status.disabled).toBe(false)
  expect(original.getAttribute('data-disabled')).not.toBe('true')
  expect(host.querySelector<HTMLButtonElement>('[data-employee-task-id="task"] [aria-label="任务状态"]')!.disabled).toBe(true)
  await act(async () => finish())
  expect(board.hasAttribute('inert')).toBe(false)
  expect(original.querySelector('[data-slot="card-content"]')).toBe(content)
  expect(status.disabled).toBe(false)
  expect(f.request.mock.calls.filter(([method]) => method === 'updateEmployeeTask')).toHaveLength(1)
})

test.each(['button', 'Escape'])('task Dialog waits for its exit animation before releasing selection (%s)', async closeWith => {
  const f = fixture([occurrence])
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  const chat = dialog.querySelector('[data-shared-chat]')!
  let finish!: () => void
  const finished = new Promise<void>(resolve => { finish = resolve })
  const animations = vi.spyOn(Element.prototype, 'getAnimations').mockImplementation(function (this: Element) {
    return this === dialog && this.hasAttribute('data-ending-style') ? [{ finished } as unknown as Animation] : []
  })
  const reads = f.request.mock.calls.length
  await act(async () => {
    if (closeWith === 'button') dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click()
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
  })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(animations.mock.results.some(result => result.value?.length === 1)).toBe(true)
  expect(dialog.isConnected).toBe(true)
  expect(dialog.querySelector('[data-shared-chat]')).toBe(chat)
  expect(f.props.onBack).not.toHaveBeenCalled()
  expect(f.props.onContext).toHaveBeenLastCalledWith(undefined)
  expect(f.props.renderChat.mock.lastCall?.[0].pageActive).toBe(false)
  expect(f.request.mock.calls).toHaveLength(reads)
  await act(async () => finish())
  expect(f.props.onBack).toHaveBeenCalledTimes(1)
  expect(dialog.isConnected).toBe(false)
  expect(f.request.mock.calls.some(([method]) => method === 'stopAutomation')).toBe(false)
})

test('cancels the exact queued occurrence once and hiding the Dialog preserves selection for reopening', async () => {
  const f = fixture([occurrence]), normal = f.request.getMockImplementation()!
  let finish!: () => void
  f.request.mockImplementation(async (method, input) => { if (method === 'stopAutomation') { expect(input).toEqual({ id: occurrence.id }); await new Promise<void>(resolve => { finish = resolve }); return }; return normal(method, input) })
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  await act(async () => { button('取消排队').click(); button('取消排队').click() })
  expect(f.request.mock.calls.filter(([m]) => m === 'stopAutomation')).toHaveLength(1)
  await act(async () => finish())
  const reads = f.request.mock.calls.length
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: false })))
  expect(f.unsubscribe).toHaveBeenCalled()
  expect(f.request.mock.calls).toHaveLength(reads)
  expect(f.props.onContext).toHaveBeenLastCalledWith(undefined)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(f.props.onBack).not.toHaveBeenCalled()
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  expect(document.querySelector('[data-shared-chat]')?.getAttribute('data-shared-chat')).toBe(room.id)
  expect(f.request.mock.calls.filter(([m]) => m === 'openEmployeeTaskSession')).toHaveLength(1)
  expect(f.request.mock.calls.filter(([m]) => m === 'stopAutomation')).toHaveLength(1)
})

test('rejects another employee task before loading a conversation', async () => {
  const f = fixture()
  f.request.mockImplementation(async method => { if (method === 'getEmployeeTask') return { task: { ...task, agentId: 'other' }, executions: { occurrences: [] } }; throw new Error('must not load foreign session') })
  await act(async () => root.render(h(EmployeeTaskDetail, { ...f.props, id: task.id, active: true })))
  expect(f.request.mock.calls).toEqual([['getEmployeeTask', { employeeId: task.agentId, id: task.id, before: undefined }]])
  expect(f.props.renderChat).not.toHaveBeenCalled()
})

test('hidden employee panel does not read task pages', async () => {
  const f = fixture(), props = { ...f.props, target: { type: 'employee-tasks' as const, id: task.agentId, requestId: 'open' } }
  await act(async () => root.render(h(EmployeeTasksPanel, { ...props, active: true })))
  const count = f.request.mock.calls.length
  await act(async () => root.render(h(EmployeeTasksPanel, { ...props, active: false })))
  expect(f.unsubscribe).toHaveBeenCalled(); expect(f.request.mock.calls).toHaveLength(count)
})

async function openTaskMenu() {
  await act(async () => { host.querySelector('[data-employee-task-id]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 100 })) })
}
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === label)!
test('opening a task menu ignores stationary pointer entry and resets after a previous hover', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'focus' } })))
  await openTaskMenu()
  const enter = () => menuItem('删除任务').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 40, clientY: 100 }))
  await act(async () => {
    enter()
    menuItem('删除任务').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 100 }))
    menuItem('删除任务').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 100 }))
    await new Promise(resolve => setTimeout(resolve, 50))
  })
  expect(document.activeElement).not.toBe(menuItem('删除任务'))
  expect(menuItem('删除任务').hasAttribute('data-highlighted')).toBe(false)
  expect(document.querySelector('[aria-label="删除任务确认"]')).toBeNull()
  await act(async () => {
    menuItem('删除任务').dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 130 }))
    menuItem('删除任务').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 70, clientY: 130 }))
    await new Promise(resolve => setTimeout(resolve, 50))
  })
  expect(document.activeElement).toBe(menuItem('删除任务'))
  await act(async () => menuItem('删除任务').click())
  await act(async () => (document.querySelector('[aria-label="删除任务确认"] [role="menuitem"]') as HTMLElement).click())
  await openTaskMenu()
  await act(async () => { enter(); await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(document.activeElement).not.toBe(menuItem('删除任务'))
  expect(menuItem('删除任务').hasAttribute('data-highlighted')).toBe(false)
  expect(f.request.mock.calls.some(([method]) => method === 'deleteEmployeeTask')).toBe(false)
})
test('list groups fold independently and row context menu renames without opening a session', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'list' } })))
  await act(async () => button('列表').click())
  const heading = host.querySelector<HTMLButtonElement>('section[aria-label="待办任务"] [data-slot="collapsible-trigger"]')!
  expect(heading.getAttribute('aria-expanded')).toBe('true')
  await act(async () => heading.click())
  expect(heading.getAttribute('aria-expanded')).toBe('false')
  await act(async () => heading.click())
  expect(heading.getAttribute('aria-expanded')).toBe('true')
  await openTaskMenu()
  expect(menuItem('重命名任务')).toBeDefined(); expect(menuItem('删除任务')).toBeDefined()
  await act(async () => menuItem('重命名任务').click())
  const input = document.querySelector<HTMLInputElement>('#employee-task-rename')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '每周新闻'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => button('保存').click())
  expect(f.request.mock.calls.filter(([m]) => m === 'updateEmployeeTask')).toEqual([['updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, title: '每周新闻' }]])
  expect(host.textContent).toContain('每周新闻')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(f.request.mock.calls.some(([m]) => m === 'openEmployeeTaskSession')).toBe(false)
})
test('board keyboard/context submenu saves status and right-side submenu confirmation deletes only the chosen task', async () => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'menu' } })))
  await act(async () => { host.querySelector('[data-employee-task-id] button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })) })
  await act(async () => menuItem('状态').click())
  const done = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent === '完成')!
  expect(done).toBeDefined()
  await act(async () => done.click())
  expect(host.querySelector('[data-task-status="done"] [data-employee-task-id]')).not.toBeNull()
  await openTaskMenu()
  await act(async () => menuItem('删除任务').click())
  expect(f.request.mock.calls.some(([m]) => m === 'deleteEmployeeTask')).toBe(false)
  expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  expect([...document.querySelectorAll('[aria-label="删除任务确认"] [role="menuitem"]')].map(item => item.textContent)).toEqual(['取消', '确认删除'])
  await act(async () => (document.querySelector('[aria-label="删除任务确认"] [role="menuitem"]') as HTMLElement).click())
  expect(host.querySelector('[data-employee-task-id]')).not.toBeNull()
  await openTaskMenu(); await act(async () => menuItem('删除任务').click())
  await act(async () => menuItem('确认删除').click())
  expect(f.request.mock.calls.filter(([m]) => m === 'deleteEmployeeTask')).toEqual([['deleteEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 2 }]])
  expect(host.querySelector('[data-employee-task-id]')).toBeNull()
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
  expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  expect(f.request.mock.calls.some(([m]) => ['openEmployeeTaskSession', 'runEmployeeTask', 'deleteAutomation'].includes(m))).toBe(false)
})

test.each(['board', 'list'])('%s column clear confirms once, cancels without writes and disables empty columns', async view => {
  const f = fixture()
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'clear-column' } })))
  if (view === 'list') await act(async () => button('列表').click())
  const open = async () => { await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="待办列菜单"]')!.click()); await act(async () => menuItem('清空').click()) }
  await open()
  expect(f.request.mock.calls.some(([method]) => method === 'clearEmployeeTasks')).toBe(false)
  expect([...document.querySelectorAll('[aria-label="清空待办任务确认"] [role="menuitem"]')].map(item => item.textContent)).toEqual(['取消', '确认清空'])
  await act(async () => menuItem('取消').click())
  expect(f.request.mock.calls.some(([method]) => method === 'clearEmployeeTasks')).toBe(false)
  await open()
  const original = f.request.getMockImplementation()!
  f.request.mockImplementationOnce(async () => { throw new Error('回执暂时不可用') })
  await act(async () => menuItem('确认清空').click())
  const failed = f.request.mock.calls.find(([method]) => method === 'clearEmployeeTasks')![1]
  f.request.mockImplementation(original)
  await act(async () => { menuItem('确认清空').click(); menuItem('确认清空').click() })
  const calls = f.request.mock.calls.filter(([method]) => method === 'clearEmployeeTasks')
  expect(calls).toHaveLength(2)
  expect(calls[1][1]).toEqual(failed)
  expect(host.querySelector('[data-employee-task-id]')).toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="待办列菜单"]')!.click())
  expect(menuItem('清空').getAttribute('aria-disabled')).toBe('true')
  expect(f.request.mock.calls.some(([method]) => ['deleteEmployeeTask', 'runEmployeeTask', 'deleteAutomation'].includes(method))).toBe(false)
})

test.each(EMPLOYEE_TASK_STATUSES)('offers the same quick-run action for %s tasks without opening the dialog', async status => {
  const f = fixture()
  await f.props.api.request('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 1, status })
  await act(async () => root.render(h(EmployeeTasksPanel, { ...f.props, active: true, target: { type: 'employee-tasks', id: task.agentId, requestId: 'quick-run' } })))
  await openTaskMenu()
  expect(menuItem('执行任务')).toBeDefined()
  await act(async () => { menuItem('执行任务').click(); menuItem('执行任务')?.click() })
  expect(f.request.mock.calls.filter(([method]) => method === 'runEmployeeTask')).toEqual([['runEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: 2, requestId: expect.any(String) }]])
  expect(f.request.mock.calls.some(([method]) => method === 'openEmployeeTaskSession')).toBe(false)
})

test('composer queue keeps an unknown send-now request stable, prevents duplicate clicks and removes only the selected item', async () => {
  let items = [{ id: 'second', conversationId: 'room', revision: 1, content: '第二条', createdAt: stamp, attachmentCount: 0 }, { id: 'third', conversationId: 'room', revision: 2, content: '第三条', createdAt: stamp, attachmentCount: 2 }]
  let release!: () => void, failOnce = true
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'listConversationQueue') return { items }
    if (method === 'actOnConversationQueue') {
      if (failOnce) { failOnce = false; throw new Error('回执暂时不可用') }
      if (input.action === 'send-now') await new Promise<void>(resolve => { release = resolve })
      items = items.filter(item => item.id !== input.id)
      return { accepted: true }
    }
    throw new Error('unexpected ' + method)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  await act(async () => root.render(h(ConversationQueue, { api, conversationId: 'room', active: true })))
  expect(host.textContent).toContain('排队消息2')
  expect(host.textContent).toContain('2 个附件')
  const send = () => host.querySelector<HTMLButtonElement>('[data-queued-message-id="third"] [aria-label="立即发送"]')!
  await act(async () => send().click())
  const first = request.mock.calls.find(([method]) => method === 'actOnConversationQueue')![1]
  await act(async () => { send().click(); send().click() })
  expect(send().disabled).toBe(true)
  expect(request.mock.calls.filter(([method]) => method === 'actOnConversationQueue')).toEqual([['actOnConversationQueue', first], ['actOnConversationQueue', first]])
  await act(async () => release())
  expect(host.textContent).not.toContain('第三条')
  expect(host.textContent).toContain('第二条')
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="移除排队消息"]')!.click())
  expect(request.mock.calls.at(-2)).toEqual(['actOnConversationQueue', expect.objectContaining({ id: 'second', action: 'remove', expectedRevision: 1 })])
  expect(host.querySelector('[aria-label="待发送消息队列"]')).toBeNull()
  const count = request.mock.calls.length
  await act(async () => root.render(h(ConversationQueue, { api, conversationId: 'room', active: false })))
  expect(request.mock.calls).toHaveLength(count)
})
