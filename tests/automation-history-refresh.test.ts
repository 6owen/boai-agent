// @vitest-environment jsdom
/*
 * [OUTPUT]: 全部清空覆盖分页冻结/确认取消/重复提交、活动保留、部分失败及隐藏停发；不删除用户数据。
 * [OUTPUT]: 删除Popover须明确确认，取消不提交；运行中禁删、失败仅Sonner、迟到列表不能恢复已删行。
 * [INPUT]: 生产AutomationHistory、可控历史请求与连续changed事件。
 * [OUTPUT]: 执行期间后台刷新不增删加载/空态行、不卸载已有记录；首次加载及隐藏停读保持。
 * [POS]: 定时任务列表布局稳定性的React组件回归，不启动Electron或调用模型。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AutomationHistoryPage } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { AutomationHistory } from '../src/renderer/pages/schedules/automation-history-list'
import { toast } from 'sonner'

let host: HTMLDivElement, root: Root
let pending: Array<(page: AutomationHistoryPage) => void>
let listeners: Set<Parameters<DesktopApi['subscribe']>[0]>
let api: DesktopApi
const record = { id: 'occurrence', name: '每日天气预报', startedAt: '2026-10-17T05:29:06Z', source: 'manual', status: 'running', deliveryStatus: 'pending' } as AutomationHistoryPage['occurrences'][number]

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  pending = []; listeners = new Set()
  api = {
    request: vi.fn((method: string) => {
      if (method !== 'listAutomationHistory') throw new Error(`Unexpected request: ${method}`)
      return new Promise<AutomationHistoryPage>(resolve => pending.push(resolve))
    }),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  } as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function render(active = true) { await act(async () => root.render(createElement(AutomationHistory, { api, active, automationId: 'plan', onOccurrence() {} }))) }
async function resolve(page: AutomationHistoryPage) { await act(async () => pending.shift()!(page)) }
async function change() {
  await act(async () => {
    for (const listener of listeners) listener({ type: 'changed', conversationId: 'task-chat' })
    await vi.advanceTimersByTimeAsync(100)
  })
}

test('running updates refresh existing rows without inserting a loading row into the layout', async () => {
  await render()
  expect(host.querySelector('[role=status]')).not.toBeNull()
  await resolve({ occurrences: [record] })
  const row = host.querySelector('[data-occurrence-id]')
  expect(row).not.toBeNull()
  for (let count = 0; count < 3; count++) {
    await change()
    expect(pending).toHaveLength(1)
    expect(host.querySelector('[role=status]'), '后台刷新不能反复向页面插入加载行').toBeNull()
    expect(host.querySelector('[data-occurrence-id]')).toBe(row)
    await resolve({ occurrences: [{ ...record, status: count === 2 ? 'completed' : 'running' }] })
    expect(host.querySelector('[data-occurrence-id]')).toBe(row)
  }
  expect(row!.textContent).toContain('运行结束')
  await render(false)
  await change()
  expect(pending).toHaveLength(0)
  await render()
  expect(host.querySelector('[role=status]')).toBeNull()
  expect(host.querySelector('[data-occurrence-id]')).toBe(row)
  await resolve({ occurrences: [record] })
})

test('an already loaded empty list does not alternate between empty and loading on each update', async () => {
  await render(); await resolve({ occurrences: [] })
  const empty = host.querySelector('.field-hint')
  expect(empty?.textContent).toBe('暂无执行记录')
  await change()
  expect(host.querySelector('[role=status]')).toBeNull()
  expect(host.querySelector('.field-hint')).toBe(empty)
  await resolve({ occurrences: [record] })
  expect(host.querySelector('[data-occurrence-id]')).not.toBeNull()
  expect(host.querySelector('.field-hint')).toBeNull()
})

const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!
test('requires confirmation, sends the frozen record version and removes a deleted row', async () => {
  await render(); await resolve({ occurrences: [{ ...record, status: 'completed', stateVersion: 7 }] })
  const request = vi.mocked(api.request)
  request.mockImplementation(async method => { if (method === 'deleteAutomationOccurrence') return undefined; return { occurrences: [{ ...record, status: 'completed', stateVersion: 7 }] } as never })
  const open = () => host.querySelector<HTMLButtonElement>('[aria-label="删除执行记录 每日天气预报"]')!
  await act(async () => open().click())
  expect(document.body.textContent).toContain('删除这条执行记录及其文件？')
  expect(request).not.toHaveBeenCalledWith('deleteAutomationOccurrence', expect.anything())
  await act(async () => button('取消').click())
  expect(request).not.toHaveBeenCalledWith('deleteAutomationOccurrence', expect.anything())
  await act(async () => open().click())
  request.mockImplementation(async method => { if (method === 'deleteAutomationOccurrence') return undefined; return { occurrences: [{ ...record, status: 'completed', stateVersion: 8 }] } as never })
  await change()
  await act(async () => button('确认删除').click())
  expect(request).toHaveBeenCalledWith('deleteAutomationOccurrence', { id: record.id, expectedVersion: 7 })
  // Even a stale fetch returning the deleted row must not restore it.
  expect(host.querySelector('[data-occurrence-id]')).toBeNull()
})

test('disables deletion while active and retains the row with Sonner feedback on cleanup failure', async () => {
  await render(); await resolve({ occurrences: [record] })
  const remove = () => host.querySelector<HTMLButtonElement>('[aria-label="删除执行记录 每日天气预报"]')!
  expect(remove().disabled).toBe(true)
  await change(); await resolve({ occurrences: [{ ...record, status: 'completed', stateVersion: 8 }] })
  const error = vi.spyOn(toast, 'error').mockImplementation(() => 'error')
  vi.mocked(api.request).mockRejectedValue(new Error('文件已外部修改'))
  await act(async () => remove().click())
  await act(async () => button('确认删除').click())
  expect(error).toHaveBeenCalledWith('文件已外部修改')
  expect(host.querySelector('[data-occurrence-id]')).not.toBeNull()
  expect(document.querySelector('[role=alert]')).toBeNull()
  expect(document.body.textContent).not.toContain('文件已外部修改')
  error.mockRestore()
})

test('clear all freezes every page before deletion, skips ongoing records and does not sweep newly arriving runs', async () => {
  const first = { ...record, status: 'completed' as const, stateVersion: 7 }
  const older = { ...first, id: 'older', stateVersion: 3 }
  const running = { ...record, id: 'running' }, arriving = { ...first, id: 'new' }
  await render(); await resolve({ occurrences: [first, running] })
  const request = vi.mocked(api.request), success = vi.spyOn(toast, 'success').mockImplementation(() => 'success')
  await act(async () => button('全部清空').click())
  expect(document.body.textContent).toContain('清空当前任务的执行记录及文件？')
  await act(async () => button('取消').click())
  expect(request.mock.calls.filter(([method]) => method === 'deleteAutomationOccurrence')).toHaveLength(0)
  let finishSecondPage!: (page: AutomationHistoryPage) => void
  const cursor = { startedAt: record.startedAt, id: record.id }
  request.mockImplementation(async (method, input) => {
    if (method === 'deleteAutomationOccurrence') return undefined as never
    const query = input as { limit?: number; before?: unknown }
    if (query.limit !== 100) return { occurrences: [arriving, first, running] } as never
    if (!query.before) return { occurrences: [first, running], nextCursor: cursor } as never
    return new Promise<AutomationHistoryPage>(resolve => { finishSecondPage = resolve }) as never
  })
  await act(async () => button('全部清空').click())
  await act(async () => { const confirm = button('确认清空'); confirm.click(); confirm.click() })
  expect(request.mock.calls.filter(([method]) => method === 'deleteAutomationOccurrence')).toHaveLength(0)
  expect(request.mock.calls.filter(([method, input]) => method === 'listAutomationHistory' && (input as { limit?: number }).limit === 100)).toEqual([
    ['listAutomationHistory', { automationId: 'plan', status: 'all', limit: 100, before: undefined }],
    ['listAutomationHistory', { automationId: 'plan', status: 'all', limit: 100, before: cursor }],
  ])
  await act(async () => finishSecondPage({ occurrences: [older] }))
  expect(request.mock.calls.filter(([method]) => method === 'deleteAutomationOccurrence')).toEqual([
    ['deleteAutomationOccurrence', { id: first.id, expectedVersion: 7 }],
    ['deleteAutomationOccurrence', { id: older.id, expectedVersion: 3 }],
  ])
  expect([...host.querySelectorAll('[data-occurrence-id]')].map(row => row.getAttribute('data-occurrence-id'))).toEqual(['new', 'running'])
  expect(success).toHaveBeenCalledWith('已清空 2 条执行记录')
  success.mockRestore()
})

test('clear all preserves failed rows and reports partial cleanup through Sonner', async () => {
  const rows = [record.id, 'older'].map(id => ({ ...record, id, status: 'completed' as const, stateVersion: 7 }))
  await render(); await resolve({ occurrences: rows })
  const error = vi.spyOn(toast, 'error').mockImplementation(() => 'error')
  vi.mocked(api.request).mockImplementation(async (method, input) => {
    if (method === 'deleteAutomationOccurrence') {
      if ((input as { id: string }).id === record.id) throw new Error('文件已外部修改')
      return undefined as never
    }
    return { occurrences: rows } as never
  })
  await act(async () => button('全部清空').click())
  await act(async () => button('确认清空').click())
  expect([...host.querySelectorAll('[data-occurrence-id]')].map(row => row.getAttribute('data-occurrence-id'))).toEqual([record.id])
  expect(error).toHaveBeenCalledWith('已删除 1 条，1 条未能删除：文件已外部修改')
  expect(document.body.textContent).not.toContain('文件已外部修改')
  error.mockRestore()
})

test('clear all does not mutate any record when a later history page fails', async () => {
  await render(); await resolve({ occurrences: [{ ...record, status: 'completed', stateVersion: 7 }] })
  const request = vi.mocked(api.request), error = vi.spyOn(toast, 'error').mockImplementation(() => 'error')
  request.mockImplementation(async (_method, input) => {
    if ((input as { before?: unknown }).before) throw new Error('历史读取失败')
    return { occurrences: [{ ...record, status: 'completed', stateVersion: 7 }], nextCursor: { startedAt: record.startedAt, id: record.id } } as never
  })
  await act(async () => button('全部清空').click())
  await act(async () => button('确认清空').click())
  expect(request.mock.calls.filter(([method]) => method === 'deleteAutomationOccurrence')).toHaveLength(0)
  expect(host.querySelector('[data-occurrence-id]')).not.toBeNull()
  expect(error).toHaveBeenCalledWith('历史读取失败')
  error.mockRestore()
})

test('hiding the task during a clear stops unsent deletion requests', async () => {
  await render(); await resolve({ occurrences: [{ ...record, status: 'completed', stateVersion: 7 }] })
  await act(async () => button('全部清空').click())
  await act(async () => button('确认清空').click())
  expect(pending).toHaveLength(1)
  await render(false)
  await resolve({ occurrences: [{ ...record, status: 'completed', stateVersion: 7 }] })
  expect(vi.mocked(api.request).mock.calls.filter(([method]) => method === 'deleteAutomationOccurrence')).toHaveLength(0)
})
