// @vitest-environment jsdom
/*
 * [OUTPUT]: 五项反馈的调度额度/取消接续或历史展示回归；具体验证边界以本文件用例为准。
 * [OUTPUT]: 订阅夹具沿DesktopApi声明回调类型，保持严格类型检查。
 * [INPUT]: 生产通讯录直接执行列表、TraceTab及受控原IPC。
 * [OUTPUT]: 标题行筛选、可见读取、隐藏停读、固定Run导航与迟到隔离；员工绑定源/核心已启用源按原权限展示。
 * [POS]: 通讯录执行交互的组件回归，不运行E2E或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { AgentRun, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { EmployeeExecutionNavigation, EmployeeExecutionPane } from '../apps/electron/src/renderer/components/employee/execution-pane'
import { TraceTab } from '../apps/electron/src/renderer/components/detail-panel/trace-tab'
import { EmployeeResourceCards } from '../apps/electron/src/renderer/components/employee/resource-cards'

vi.mock('../apps/electron/src/renderer/components/detail-panel/execution-feed', () => ({ ExecutionFeed: ({ run }: { run: AgentRun }) => h('div', { 'data-feed-run': run.id }, run.id) }))
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

it.each(['employee', 'group'])('shows %s records directly and navigates the exact run without a dialog', async kind => {
  const open = vi.fn()
  const render = async (active: boolean) => act(async () => root.render(h(EmployeeExecutionNavigation.Provider, { value: open }, h(EmployeeExecutionPane, { api, snapshot, active, ...(kind === 'employee' ? { agent } : { conversationId: 'room' }) }))))
  await render(true)
  expect(host.querySelector('[data-slot=collapsible-trigger]')).toBeNull()
  const row = host.querySelector('[data-employee-run-id]')!
  expect(row.classList.contains('automation-record-row')).toBe(true)
  expect(row.querySelector('.conversation-title')).not.toBeNull()
  expect(row.querySelector('.conversation-preview')).not.toBeNull()
  const filter = host.querySelector('[aria-label="执行记录会话"]')
  if (kind === 'employee') expect(filter?.closest('.automation-records-heading')?.querySelector('h3')?.textContent).toBe('执行记录')
  else expect(filter).toBeNull()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  await click('[data-employee-run-id]')
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'room', agentId: 'ds', runId: 'run-older' }))
  await render(false)
  request.mockClear(); await refresh()
  expect(request).not.toHaveBeenCalled()
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

it('removes a deleted execution from the panel and reports the failure through Sonner', async () => {
  const notify = vi.spyOn(toast, 'error')
  await act(async () => root.render(h(TraceTab, { api, snapshot, active: true, conversationId: 'room', agentId: 'ds', runId: 'run-older' })))
  expect(host.querySelector('[data-execution-run-id]')).not.toBeNull()
  request.mockRejectedValue(new Error('执行记录已删除'))
  await refresh()
  expect(host.querySelector('[data-execution-run-id]')).toBeNull()
  expect(host.querySelector('[role=alert]')).toBeNull()
  expect(host.textContent).not.toContain('执行记录已删除')
  expect(notify).toHaveBeenCalledWith('执行记录已删除', expect.anything())
})

it('shows only bound sources for an employee and enabled sources for the core agent', async () => {
  const sources = [{ id: 'allowed', name: '天气 API', type: 'api', enabled: true }, { id: 'off', name: '已停用 MCP', type: 'mcp', enabled: false }, { id: 'unbound', name: '本地笔记', type: 'local', enabled: true }]
  request.mockResolvedValue(sources)
  const render = async (core: boolean) => act(async () => root.render(h(EmployeeResourceCards, { key: String(core), api, snapshot, agent: { ...agent, skillIds: [], knowledgeIds: [], sourceIds: ['allowed', 'off'], ...(core ? { id: 'bobo', systemRole: 'core' as const } : {}) }, active: true, revision: 0, capabilities: [], onOpenSkill: vi.fn() })))
  await render(false)
  expect(host.textContent).toContain('天气 API')
  expect(host.textContent).toContain('已停用 MCP')
  expect(host.textContent).not.toContain('本地笔记')
  await render(true)
  expect(host.textContent).toContain('本地笔记')
  expect(host.textContent).not.toContain('已停用 MCP')
  expect(request.mock.calls.every(([method]) => method === 'listDataSources')).toBe(true)
})

it('does not load resource metadata while hidden or publish a late result after hiding', async () => {
  let resolve!: (value: unknown) => void
  request.mockImplementation(() => new Promise(done => { resolve = done }))
  const render = async (active: boolean) => act(async () => root.render(h(EmployeeResourceCards, { api, snapshot, agent: { ...agent, skillIds: [], knowledgeIds: [], sourceIds: ['allowed'] }, active, revision: 0, capabilities: [], onOpenSkill: vi.fn() })))
  await render(false); expect(request).not.toHaveBeenCalled()
  await render(true); expect(request).toHaveBeenCalledOnce()
  await render(false)
  await act(async () => resolve([{ id: 'allowed', name: '迟到数据源', type: 'api', enabled: true }]))
  expect(host.textContent).not.toContain('迟到数据源')
})


it.each(['failed', 'cancelled', 'interrupted'] as const)('execution history never offers a send or continue action for %s records', async status => {
  request.mockImplementation(async (method: string) => {
    if (method === 'listExecutionHistory') return { items: [{ run: { ...run, status }, trigger: '原任务' }] }
    throw new Error(`unexpected ${method}`)
  })
  await act(async () => root.render(h(TraceTab, { api, snapshot, active: true, conversationId: 'room', agentId: 'ds' })))
  expect(host.querySelector('[data-execution-run-id]')).not.toBeNull()
  expect([...host.querySelectorAll('button')].some(button => button.textContent === '继续')).toBe(false)
  expect(request.mock.calls.some(([method]) => method === 'sendMessage' || method === 'retryRun')).toBe(false)
})
