// @vitest-environment jsdom
/*
 * [OUTPUT]: 订阅夹具沿DesktopApi声明回调类型，保持严格类型检查。
 * [INPUT]: 生产通讯录折叠执行列表、TraceTab及受控原IPC。
 * [OUTPUT]: 展开才读取、收起停读、员工/群固定Run导航、刷新不卸载列表、精确详情与迟到响应隔离。
 * [POS]: 通讯录执行交互的组件回归，不运行E2E或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentRun, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { AppEvent, DesktopApi } from '../src/shared/ipc'
import { EmployeeExecutionDisclosure, EmployeeExecutionNavigation, EmployeeExecutionPane } from '../src/renderer/components/employee/execution-pane'
import { TraceTab } from '../src/renderer/components/detail-panel/trace-tab'

vi.mock('../src/renderer/components/detail-panel/execution-feed', () => ({ ExecutionFeed: ({ run }: { run: AgentRun }) => h('div', { 'data-feed-run': run.id }, run.id) }))
const agent = { id: 'ds', name: 'DS', configVersion: 1 } as DigitalAgent
const snapshot = { agents: [agent], conversations: [{ id: 'room', kind: 'group', title: '天气讨论', agentIds: ['ds'] }], resources: [] } as unknown as Snapshot
const run: AgentRun = { id: 'run-older', agentId: 'ds', agentName: 'DS', conversationId: 'room', triggerMessageId: 'prompt', messageId: 'answer', createdAt: '2026-10-17T06:00:00Z', status: 'completed', phase: 'execution', toolEvents: [] }
const summary = { run, conversationTitle: '天气讨论', configuration: { label: 'DeepSeek', modelId: 'ds-model' } }
let host: HTMLDivElement, root: Root, listeners: Set<(event: AppEvent) => void>, request: ReturnType<typeof vi.fn>, api: DesktopApi
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  listeners = new Set()
  request = vi.fn(async (method: string) => {
    if (method === 'listEmployeeExecutions') return { items: [summary] }
    if (method === 'listExecutionHistory') return { items: [{ run, trigger: '查南京天气' }] }
    if (method === 'getEmployeeExecution') return { ...summary, run, spans: [], artifacts: [] }
    throw new Error(`unexpected ${method}`)
  })
  api = { request, subscribe: (listener: Parameters<DesktopApi['subscribe']>[0]) => { listeners.add(listener); return () => { listeners.delete(listener) } } } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click())
const refresh = async () => act(async () => { listeners.forEach(listener => listener({ type: 'changed', conversationId: 'room' })); await vi.advanceTimersByTimeAsync(500) })

it.each(['employee', 'group'])('opens %s records in place and navigates the exact run without a dialog', async kind => {
  const open = vi.fn()
  await act(async () => root.render(h(EmployeeExecutionNavigation.Provider, { value: open }, h(EmployeeExecutionDisclosure, { api, snapshot, active: true, ...(kind === 'employee' ? { agent } : { conversationId: 'room' }) }))))
  expect(request).not.toHaveBeenCalled()
  await click('[data-slot=collapsible-trigger]')
  const row = host.querySelector('[data-employee-run-id]')!
  expect(row.classList.contains('automation-record-row')).toBe(true)
  expect(row.querySelector('.conversation-title')).not.toBeNull()
  expect(row.querySelector('.conversation-preview')).not.toBeNull()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  await click('[data-employee-run-id]')
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'room', agentId: 'ds', runId: 'run-older' }))
  await click('[data-slot=collapsible-trigger]')
  request.mockClear(); await refresh()
  expect(request).not.toHaveBeenCalled()
  expect(host.querySelector('[data-slot=collapsible-trigger]')?.getAttribute('aria-expanded')).toBe('false')
})

it('keeps loaded rows during a refresh and ignores a response after leaving the page', async () => {
  const render = async (active: boolean) => act(async () => root.render(h(EmployeeExecutionPane, { api, snapshot, agent, active })))
  await render(true)
  const row = host.querySelector('[data-employee-run-id]')
  let resolve!: (value: unknown) => void
  request.mockImplementation(() => new Promise(done => { resolve = done }))
  await refresh()
  expect(host.querySelector('[data-employee-run-id]')).toBe(row)
  expect(host.querySelector('[role=status]')).toBeNull()
  await render(false)
  await act(async () => resolve({ items: [{ ...summary, run: { ...run, id: 'late' } }] }))
  expect(host.querySelector('[data-employee-run-id="late"]')).toBeNull()
  request.mockClear(); await refresh(); expect(request).not.toHaveBeenCalled()
})

it('opens an older exact execution using the original query and one shared process card', async () => {
  const render = async (active: boolean) => act(async () => root.render(h(TraceTab, { api, snapshot, active, conversationId: 'room', agentId: 'ds', runId: 'run-older', title: '查南京天气' })))
  await render(true)
  expect(request).toHaveBeenCalledWith('getEmployeeExecution', { agentId: 'ds', runId: 'run-older' })
  expect(request).not.toHaveBeenCalledWith('listExecutionHistory', expect.anything())
  expect(host.querySelectorAll('[data-execution-run-id]')).toHaveLength(1)
  expect(host.querySelector('[data-feed-run="run-older"]')).not.toBeNull()
  expect(host.querySelector('[data-slot=execution-employees]')).toBeNull()
  expect(host.textContent).not.toContain('执行历史')
  await render(false); request.mockClear(); await refresh()
  expect(request).not.toHaveBeenCalled()
})
