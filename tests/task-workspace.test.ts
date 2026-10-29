// @vitest-environment jsdom
/*
 * [INPUT]: 任务工作区组件、固定occurrence、受控读取/停止回执。
 * [OUTPUT]: 排队时不读取虚构消息，停止固定原任务；已执行任务读取独立上下文并在隐藏时停止。
 * [POS]: 任务主区生命周期回归，不运行Electron或模型。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AutomationOccurrence, Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { TaskWorkspace } from '../apps/electron/src/renderer/pages/schedules/task-workspace'
let host: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
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
  await act(async () => root.render(h(TaskWorkspace, { api: { request, subscribe: () => () => {} } as unknown as DesktopApi, snapshot, id: occurrence.id, active: true, onContext, renderChat, onMaterials() {}, onProcess() {}, onDefinition() {} })))
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
  const props = { api, snapshot, id: occurrence.id, focusMessage: { id: 'result-msg', requestId: 'jump' }, onContext, onMaterials() {}, onProcess() {}, onDefinition() {}, renderChat: () => h('div', { 'data-task-result': true }, '任务结果') }
  await act(async () => root.render(h(TaskWorkspace, { ...props, active: true })))
  expect(host.querySelector('[data-task-result]')?.textContent).toBe('任务结果'); expect(onContext).toHaveBeenLastCalledWith('task-context')
  await act(async () => root.render(h(TaskWorkspace, { ...props, active: false })))
  expect(onContext).toHaveBeenLastCalledWith(undefined)
})
