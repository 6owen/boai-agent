// @vitest-environment jsdom
/*
 * [INPUT]: 生产数据源列表、可控IPC回执与React交互。
 * [OUTPUT]: 行内测试独立锁定、真实失败状态、版本化启停及删除确认/取消/失败保留；操作不打开详情。
 * [POS]: 数据源行操作组件回归，不启动Electron或访问真实数据源。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { DesktopApi } from '../src/shared/ipc'
import type { DataSource } from '../src/shared/domain/sources'
import { SourcesView } from '../src/renderer/pages/sources/sources-view'

const source: DataSource = { id: 'source-a', name: '法律检索', type: 'mcp', description: '', guide: '', enabled: true, revision: 3, createdAt: '2026-10-17', updatedAt: '2026-10-17', hasCredential: true, mcp: { transport: 'http', url: 'https://example.com/mcp', authType: 'bearer' } }
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => { root.unmount(); toast.dismiss() }); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const byText = (text: string) => [...document.querySelectorAll<HTMLElement>('button,[role=menuitem]')].find(item => item.textContent === text)!
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => { element.click(); await vi.advanceTimersByTimeAsync(200) }) }
async function fixture(initial: DataSource[] = [source]) {
  const request = vi.fn<(method: string, input: unknown) => Promise<unknown>>(async method => { throw new Error(`Unexpected request ${method}`) })
  const api = { request } as unknown as DesktopApi, select = vi.fn(), changed = vi.fn(), removed = vi.fn()
  function Page() {
    const [sources, setSources] = useState(initial)
    return h(SourcesView, { api, sources, onSelect: select, onManage() {}, onChanged(value) { changed(value); setSources(items => items.map(item => item.id === value.id ? value : item)) }, onRemoved(id) { removed(id); setSources(items => items.filter(item => item.id !== id)) } })
  }
  await act(async () => root.render(h(Page)))
  return { request, select, changed, removed }
}

test('places persisted status beside each name, with disabled taking precedence over an old successful test', async () => {
  const success = { status: 'success' as const, checkedAt: '2026-10-17', message: 'ok' }
  await fixture([source, { ...source, id: 'b', name: '已连接', test: success }, { ...source, id: 'c', name: '失败', test: { ...success, status: 'failed', message: '认证失败' } }, { ...source, id: 'd', name: '停用', enabled: false, test: success }])
  expect([...host.querySelectorAll('.source-row-title [role=status]')].map(item => item.textContent)).toEqual(['未测试', '连接正常', '连接失败', '已停用'])
  expect(byLabel('测试连接 停用').disabled).toBe(true)
})

test('tests only the chosen row, prevents duplicate requests and shows the actual failed result without selecting details', async () => {
  const f = await fixture([source, { ...source, id: 'b', name: '其他源' }])
  let finish!: (value: DataSource) => void
  f.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await click(byLabel('测试连接 法律检索'))
  expect(host.querySelector('[role=status]')?.textContent).toBe('测试中')
  expect(byLabel('测试连接 法律检索').disabled).toBe(true)
  expect(byLabel('测试连接 其他源').disabled).toBe(false)
  await click(byLabel('测试连接 法律检索'))
  expect(f.request).toHaveBeenCalledExactlyOnceWith('testDataSource', { id: source.id, expectedRevision: 3 })
  await act(async () => finish({ ...source, test: { status: 'failed', checkedAt: '2026-10-17', message: '认证失败' } }))
  expect(host.querySelector('[role=status]')?.textContent).toBe('连接失败')
  expect(host.querySelector('[role=status]')?.getAttribute('title')).toBe('认证失败')
  expect(byLabel('测试连接 法律检索').disabled).toBe(false)
  expect(f.select).not.toHaveBeenCalled()
})

test('toggles enablement with the displayed revision and configuration, without submitting credential or metadata', async () => {
  const f = await fixture()
  f.request.mockResolvedValueOnce({ ...source, enabled: false, revision: 4 })
  await click(byLabel('数据源操作 法律检索')); await click(byText('停用数据源'))
  expect(f.request).toHaveBeenLastCalledWith('saveDataSource', { id: source.id, expectedRevision: 3, config: { name: source.name, type: 'mcp', description: '', guide: '', enabled: false, mcp: source.mcp } })
  expect(host.querySelector('[role=status]')?.textContent).toBe('已停用')
  f.request.mockResolvedValueOnce({ ...source, revision: 5 })
  await click(byLabel('数据源操作 法律检索')); await click(byText('启用数据源'))
  expect(f.request.mock.lastCall?.[1]).toMatchObject({ expectedRevision: 4, config: { enabled: true } })
  expect(host.querySelector('[role=status]')?.textContent).toBe('未测试')
  expect(f.select).not.toHaveBeenCalled()
})

test('cancels deletion without a request and removes only the confirmed row using its displayed revision', async () => {
  const f = await fixture([source, { ...source, id: 'b', name: '其他源' }])
  await click(byLabel('数据源操作 法律检索')); await click(byText('删除数据源'))
  expect(document.querySelector('[data-slot=popover-content]')?.textContent).toContain('删除“法律检索”？')
  await click(byText('取消')); expect(f.request).not.toHaveBeenCalled()
  f.request.mockResolvedValueOnce(undefined)
  await click(byLabel('数据源操作 法律检索')); await click(byText('删除数据源')); await click(byText('确认删除'))
  expect(f.request).toHaveBeenCalledExactlyOnceWith('removeDataSource', { id: source.id, expectedRevision: 3 })
  expect(f.removed).toHaveBeenCalledExactlyOnceWith(source.id)
  expect(host.querySelectorAll('.source-catalog-row')).toHaveLength(1)
  expect(host.textContent).toContain('其他源'); expect(f.select).not.toHaveBeenCalled()
})

test('keeps the row and confirmation available when a stale deletion is rejected', async () => {
  const f = await fixture(), error = vi.spyOn(toast, 'error').mockReturnValue('error')
  f.request.mockRejectedValueOnce(new Error('数据源配置已变化'))
  await click(byLabel('数据源操作 法律检索')); await click(byText('删除数据源')); await click(byText('确认删除'))
  expect(f.removed).not.toHaveBeenCalled(); expect(f.select).not.toHaveBeenCalled()
  expect(host.querySelectorAll('.source-catalog-row')).toHaveLength(1)
  expect(document.querySelector('[data-slot=popover-content]')).not.toBeNull()
  expect((byText('确认删除') as HTMLButtonElement).disabled).toBe(false)
  expect(error).toHaveBeenCalledWith('数据源配置已变化', expect.any(Object)); error.mockRestore()
})
