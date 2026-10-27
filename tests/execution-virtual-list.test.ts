// @vitest-environment jsdom
/*
 * [INPUT]: 生产ExecutionVirtualList、真实TanStack useVirtualizer与可变行高/滚动容器几何。
 * [OUTPUT]: 主聊天和执行面板的长列表上下滚动持续挂载可见行；焦点保留、停读有界，前置消息高度变化按scrollMargin计算。
 * [POS]: 执行列表组件回归，不启动Electron或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ExecutionVirtualList } from '../apps/electron/src/renderer/components/detail-panel/ExecutionVirtualList'

let host: HTMLDivElement, root: Root, offset: number
const items = Array.from({ length: 60 }, (_, index) => ({ key: `row-${index}` }))
const observers = new Set<{ targets: Set<Element>; callback: ResizeObserverCallback }>()
const rowHeight = (element: HTMLElement) => element.dataset.executionVirtualKey === 'row-0' ? 280 : 80
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  observers.clear(); offset = 600
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Element>()
    constructor(public callback: ResizeObserverCallback) { observers.add(this) }
    observe(element: Element) { this.targets.add(element) }
    unobserve(element: Element) { this.targets.delete(element) }
    disconnect() { this.targets.clear() }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === host) return new DOMRect(0, 0, 600, 300)
    const top = offset - host.scrollTop + Number(this.style.transform.match(/translateY\(([-.\d]+)px\)/)?.[1] ?? 0)
    return new DOMRect(0, top, 600, this.dataset.executionVirtualKey ? rowHeight(this) : Number.parseFloat(this.style.height) || 0)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this === host ? 300 : this.dataset.executionVirtualKey ? rowHeight(this) : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  Object.defineProperties(host, { clientHeight: { value: 300 }, scrollHeight: { get: () => offset + Number.parseFloat(host.querySelector<HTMLElement>('.execution-virtual-list')?.style.height || '0') } })
  host.scrollTo = options => { if (typeof options === 'object') host.scrollTop = options.top ?? host.scrollTop }
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = (enabled = true, rows = items) => act(async () => root.render(h(ExecutionVirtualList, { items: rows, enabled, gap: 0, children: item => h('button', null, item.key) })))
const scroll = (top: number) => act(async () => { host.scrollTop = top; host.dispatchEvent(new Event('scroll')) })
const mounted = () => [...host.querySelectorAll<HTMLElement>('[data-execution-virtual-key]')]
function expectVisibleRows() {
  const rows = mounted().filter(row => { const rect = row.getBoundingClientRect(); return rect.bottom > 0 && rect.top < 300 })
  expect(rows.length).toBeGreaterThan(0)
  expect(Math.min(...rows.map(row => row.getBoundingClientRect().top))).toBeLessThanOrEqual(0)
  expect(Math.max(...rows.map(row => row.getBoundingClientRect().bottom))).toBeGreaterThanOrEqual(300)
  expect(mounted().length).toBeLessThan(24)
}
it.each(['messages', 'execution-drawer-body'])('renders both directions in the actual %s viewport, including variable rows', async className => {
  host.className = className
  await render()
  for (const top of [600, 1800, 3500, 1800, 600, 3500]) { await scroll(top); expectVisibleRows() }
  await scroll(600)
  expect(host.querySelector('[data-execution-virtual-key="row-0"]')).not.toBeNull()
  expect(host.querySelector('[data-execution-virtual-key="row-59"]')).toBeNull()
})
it('retains keyboard focus and a bounded inactive window, and accounts for earlier message resizing', async () => {
  host.className = 'messages'
  await render(); await scroll(600)
  const button = host.querySelector<HTMLButtonElement>('[data-execution-virtual-key="row-0"] button')!
  await act(async () => button.focus())
  await scroll(3500)
  expect(document.activeElement).toBe(button)
  expectVisibleRows()
  const count = mounted().length, height = host.querySelector<HTMLElement>('.execution-virtual-list')!.style.height
  await render(false)
  expect(mounted().length).toBe(count)
  expect(host.querySelector<HTMLElement>('.execution-virtual-list')!.style.height).toBe(height)
  await render(true)
  await act(async () => {
    offset = 1000
    for (const observer of observers) if (observer.targets.has(host)) observer.callback([{ target: host, contentRect: new DOMRect(0, 0, 600, 300), borderBoxSize: [{ inlineSize: 600, blockSize: 300 }], contentBoxSize: [], devicePixelContentBoxSize: [] }], {} as ResizeObserver)
  })
  await scroll(1800); expectVisibleRows()
})

it('preserves the visible stable key when earlier execution rows are prepended or trimmed', async () => {
  host.className = 'messages'
  await render(); await scroll(1800)
  const visible = mounted().find(row => row.getBoundingClientRect().top <= 0 && row.getBoundingClientRect().bottom > 0)!
  const key = visible.dataset.executionVirtualKey, top = visible.getBoundingClientRect().top
  const earlier = Array.from({ length: 30 }, (_, index) => ({ key: `earlier-${index}` }))
  await render(true, [...earlier, ...items])
  const restored = host.querySelector<HTMLElement>(`[data-execution-virtual-key="${key}"]`)!
  expect(restored).not.toBeNull()
  expect(restored.getBoundingClientRect().top).toBe(top)
  await scroll(host.scrollTop)
  await render(true, items)
  expect(host.querySelector<HTMLElement>(`[data-execution-virtual-key="${key}"]`)!.getBoundingClientRect().top).toBe(top)
})
