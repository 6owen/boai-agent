// @vitest-environment jsdom
/*
 * [INPUT]: 任务工作区组件、固定occurrence、受控读取/停止回执。
 * [OUTPUT]: 排队时不读虚构消息、精确停止、按员工读取/隔离及隐藏停读，跨员工任务拒绝载入。
 * [POS]: 员工任务右侧详情生命周期回归，不运行Electron或模型。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AutomationOccurrence, Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { EmployeeTasksPanel } from '../apps/electron/src/renderer/components/detail-panel/employee-tasks-panel'
import { EmployeeTaskDetail } from '../apps/electron/src/renderer/components/detail-panel/employee-task-detail'
let host: HTMLDivElement, root: Root
const originalAnimations = Element.prototype.getAnimations
beforeEach(() => { Element.prototype.getAnimations = () => []; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); if (originalAnimations) Element.prototype.getAnimations = originalAnimations; else Reflect.deleteProperty(Element.prototype, 'getAnimations'); vi.unstubAllGlobals() })
const snapshot = { agents: [{ id: 'employee', name: 'DS' }], conversations: [{ id: 'task-context', purpose: 'automation', agentIds: ['employee'] }] } as unknown as Snapshot
const occurrence: AutomationOccurrence = { schemaVersion: 1, stateVersion: 1, id: 'occurrence', automationId: 'definition', name: '新闻总结', status: 'queued', source: 'manual', scheduledFor: '2026-10-30T01:00:00.000Z', startedAt: '2026-10-30T01:00:00.000Z', deliveryStatus: 'pending', usageIncomplete: true, resultMessageIds: [], runIds: [], conversationId: 'task-context', plan: { owner: { kind: 'employee', employeeId: 'employee' }, employeeIds: ['employee'] } }

test('cancels the exact queued occurrence once without reading a conversation or invoking an employee', async () => {
  let finish!: () => void
  const request = vi.fn(async (method: string, input?: unknown) => {
    if (method === 'getAutomationOccurrence') return occurrence
    if (method === 'stopAutomation') { expect(input).toEqual({ id: occurrence.id }); await new Promise<void>(resolve => { finish = resolve }); return }
    throw new Error('Unexpected request: ' + method)
  })
  const onContext = vi.fn(), renderChat = vi.fn(() => null)
  await act(async () => root.render(h(EmployeeTaskDetail, { api: { request, subscribe: () => () => {} } as unknown as DesktopApi, snapshot, id: occurrence.id, active: true, onContext, renderChat, onMaterials() {}, onProcess() {}, onBack() {} })))
  expect(host.textContent).toContain('排队中'); expect(renderChat).not.toHaveBeenCalled(); expect(onContext).toHaveBeenLastCalledWith(undefined)
  await act(async () => { const stop = [...host.querySelectorAll('button')].find(b => b.textContent === '取消排队')!; stop.click(); stop.click() })
  expect(request.mock.calls.filter(([method]) => method === 'stopAutomation')).toHaveLength(1)
  await act(async () => finish())
  expect(request.mock.calls.every(([method]) => ['getAutomationOccurrence', 'stopAutomation'].includes(method))).toBe(true)
})
test('reads results through the original task context and does not leave an active question scope when hidden', async () => {
  const record = { ...occurrence, status: 'completed', messageId: 'trigger' }
  const request = vi.fn(async (method: string, input?: unknown) => {
    if (method === 'getAutomationOccurrence') return record
    if (method === 'getConversationReading') return { conversationId: occurrence.conversationId }
    if (method === 'getConversationView') {
      expect(input).toMatchObject({ conversationId: 'task-context', aroundMessageId: 'result-msg' })
      return { conversation: snapshot.conversations[0], messagePage: { conversationId: 'task-context', items: [] }, reading: { conversationId: 'task-context' }, messages: [], materials: [] }
    }
    throw new Error('Unexpected request: ' + method)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi, onContext = vi.fn()
  const props = { api, snapshot, id: occurrence.id, focusMessage: { id: 'result-msg', requestId: 'jump' }, onContext, onMaterials() {}, onProcess() {}, onBack() {}, renderChat: () => h('div', { 'data-task-result': true }, '任务结果') }
  await act(async () => root.render(h(EmployeeTaskDetail, { ...props, active: true })))
  expect(host.querySelector('[data-task-result]')?.textContent).toBe('任务结果'); expect(onContext).toHaveBeenLastCalledWith('task-context')
  await act(async () => root.render(h(EmployeeTaskDetail, { ...props, active: false })))
  expect(onContext).toHaveBeenLastCalledWith(undefined)
})


test('employee panel scopes current tasks, ordinary definitions and history to its owner and stops reading when hidden', async () => {
  const request = vi.fn(async (method: string, input?: unknown) => {
    if (method === 'listAutomationHistory') { expect(input).toMatchObject({ employeeId: 'employee' }); return { occurrences: (input as { status: string }).status === 'active' ? [occurrence] : [] } }
    if (method === 'listOwnerAutomations') { expect(input).toMatchObject({ owner: { kind: 'employee', employeeId: 'employee' }, purpose: 'employee-task' }); return { definitions: [] } }
    throw new Error('Unexpected request: ' + method)
  })
  const unsubscribe = vi.fn(), api = { request, subscribe: () => unsubscribe } as unknown as DesktopApi
  const props = { api, snapshot, employeeId: 'employee', target: { type: 'employee-tasks' as const, id: 'employee', requestId: 'open' }, onContext() {}, onMaterials() {}, onProcess() {}, renderChat: () => null }
  await act(async () => root.render(h(EmployeeTasksPanel, { ...props, active: true })))
  expect(host.querySelector('[data-employee-tasks="employee"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="排队任务"]')?.textContent).toContain('新闻总结')
  expect(host.querySelector('[aria-label="当前任务"]')?.textContent).toContain('暂无正在执行')
  const reads = request.mock.calls.length
  await act(async () => root.render(h(EmployeeTasksPanel, { ...props, active: false })))
  expect(unsubscribe).toHaveBeenCalled()
  expect(request.mock.calls).toHaveLength(reads)
})

test('a task target from another employee cannot load a conversation into this employee panel', async () => {
  const request = vi.fn(async (method: string) => {
    if (method === 'getAutomationOccurrence') return { ...occurrence, plan: { ...occurrence.plan, employeeIds: ['other-employee'] }, messageId: 'trigger' }
    throw new Error('Unexpected request: ' + method)
  })
  const renderChat = vi.fn(() => null)
  await act(async () => root.render(h(EmployeeTaskDetail, { api: { request, subscribe: () => () => {} } as unknown as DesktopApi, snapshot, employeeId: 'employee', id: occurrence.id, active: true, onContext() {}, renderChat, onMaterials() {}, onProcess() {}, onBack() {} })))
  expect(host.textContent).toContain('此任务不属于当前员工')
  expect(renderChat).not.toHaveBeenCalled()
  expect(request.mock.calls).toEqual([['getAutomationOccurrence', { id: occurrence.id }]])
})
