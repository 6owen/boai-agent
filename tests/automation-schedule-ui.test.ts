// @vitest-environment jsdom
/*
 * [INPUT]: 实际任务编辑器/执行面板与隔离IPC回执。
 * [OUTPUT]: 已有任务可更换执行员工并保存归属/名单；未投递记录不读取虚构会话，原因沿Sonner，已投递仍读取本次Trace。
 * [POS]: 定时任务编辑与未开始执行的组件回归，不运行Electron或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { AutomationDefinition, AutomationOccurrence, Snapshot } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { AutomationEditorTab } from '../src/renderer/pages/schedules/automation-editor'
import { AutomationOccurrenceView } from '../src/renderer/pages/schedules/automation-history'
import { ScheduleNavigationContext } from '../src/renderer/pages/schedules/owner-automations'

let host: HTMLDivElement, root: Root
const definition = { id: 'plan', revision: 6, owner: { kind: 'employee', employeeId: 'ds' }, employeeIds: ['ds'], conversationPolicy: 'new-conversation', name: '每日天气预报', prompt: '查询南京天气', frequency: 'daily', time: '09:00', weekday: 1, enabled: true, notify: false } as AutomationDefinition
const snapshot = { agents: [{ id: 'ds', name: 'DS', active: true, connectionId: 'connection' }, { id: 'writer', name: '写作者', active: true, connectionId: 'connection' }, { id: 'inactive', name: '未启用员工', active: false, connectionId: 'connection' }], connections: [{ id: 'connection', defaultModel: 'fixture' }], conversations: [] } as unknown as Snapshot
const occurrence: AutomationOccurrence = { schemaVersion: 1, stateVersion: 1, id: 'occurrence', automationId: definition.id, name: definition.name, source: 'manual', startedAt: '2026-10-19T15:59:35Z', scheduledFor: '2026-10-19T15:59:35Z', usageIncomplete: true, status: 'skipped', deliveryStatus: 'unknown', conversationId: 'never-created', runIds: [], resultMessageIds: [], reason: '员工或会话权限已变更，请编辑保存任务后重新启用', attentionReason: 'authorization' }
function apiFor(values: Record<string, unknown>): DesktopApi {
  return { request: vi.fn(async (method: string) => { if (!(method in values)) throw new Error(`Unexpected request: ${method}`); return values[method] }), subscribe: () => () => {} } as unknown as DesktopApi
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = () => {}
  vi.spyOn(toast, 'error').mockReturnValue('test-error')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

it('allows changing an existing employee task and saves owner and members together at the original revision', async () => {
  const api = apiFor({ getAutomation: definition, previewAutomation: { nextTimes: ['2026-10-21T01:00:00Z'] }, saveAutomation: { ...definition, revision: 7, owner: { kind: 'employee', employeeId: 'writer' }, employeeIds: ['writer'] } })
  const saved = vi.fn()
  await act(async () => root.render(h(AutomationEditorTab, { api, snapshot, id: definition.id, onClose() {}, onSaved: saved })))
  await act(async () => vi.advanceTimersByTimeAsync(160))
  const select = host.querySelector<HTMLButtonElement>('[aria-label="执行员工"]')!
  expect(select.disabled).toBe(false)
  await act(async () => select.click())
  const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
  expect(options.find(option => option.textContent === '未启用员工')?.getAttribute('aria-disabled')).toBe('true')
  await act(async () => { const option = options.find(option => option.textContent === '写作者')!; option.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' })); option.click() })
  expect(select.querySelector('[data-slot="select-value"]')?.textContent).toBe('写作者')
  expect(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '保存修改')!.disabled).toBe(false)
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(vi.mocked(api.request).mock.calls.find(([method]) => method === 'saveAutomation')?.[1]).toMatchObject({ id: definition.id, expectedRevision: 6, owner: { kind: 'employee', employeeId: 'writer' }, employeeIds: ['writer'] })
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ revision: 7 }), false)
})

it('shows the real skipped reason through Sonner without querying a conversation that was never created', async () => {
  const api = apiFor({ getAutomationOccurrence: occurrence }), openTask = vi.fn()
  await act(async () => root.render(h(ScheduleNavigationContext.Provider, { value: openTask }, h(AutomationOccurrenceView, { api, snapshot, id: occurrence.id, active: true }))))
  expect(toast.error).toHaveBeenCalledWith(occurrence.reason, expect.anything())
  expect(vi.mocked(api.request).mock.calls.map(([method]) => method)).toEqual(['getAutomationOccurrence'])
  expect(host.textContent).toContain('本次没有启动员工执行')
  expect(host.textContent).not.toContain(occurrence.reason)
  await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === '查看任务')!.click())
  expect(openTask).toHaveBeenCalledWith(definition.id)
})

it('keeps the actual occurrence trace query for dispatched executions', async () => {
  const api = apiFor({ getAutomationOccurrence: { ...occurrence, status: 'running', messageId: 'accepted-message', reason: undefined }, listExecutionHistory: { items: [] } })
  await act(async () => root.render(h(AutomationOccurrenceView, { api, snapshot, id: occurrence.id, active: true })))
  expect(api.request).toHaveBeenCalledWith('listExecutionHistory', expect.objectContaining({ conversationId: occurrence.conversationId, occurrenceId: occurrence.id }))
})
