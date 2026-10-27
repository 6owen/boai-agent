/*
 * [INPUT]: Rovai ExecutionVirtualList.tsx @ f9acc2395283d49f0ce247dc0af2207c155f6eb6 (MIT)。
 * [OUTPUT]: TanStack useVirtualizer测量可变行高，识别主聊天/执行面板两种viewport；稳定key及焦点保留、停读时保持有界窗口。
 * [POS]: BOAI执行面板的阅读基础，许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { defaultRangeExtractor, elementScroll, useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { createContext, useContext, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ExecutionContentCache } from './execution-content-cache'

export const ExecutionContentContext = createContext<ExecutionContentCache | null>(null)
export function useExecutionRetainedState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const cache = useContext(ExecutionContentContext)
  const [value, setValue] = useState<T>(() => cache?.get<T>(key) ?? (typeof initial === 'function' ? (initial as () => T)() : initial))
  return [value, next => setValue(previous => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
    // In-flight work belongs to the mounted row and must restart after unmount.
    if (!(resolved && typeof resolved === 'object' && 'status' in resolved && resolved.status === 'loading')) cache?.set(key, resolved)
    return resolved
  })]
}

/** TanStack owns the visible range and variable-height scroll compensation. */
export function ExecutionVirtualList<T extends { key: string }>({ items, children, enabled = true, gap = 14, gapAfter, onVisible }: {
  items: T[]; children: (item: T) => ReactNode; enabled?: boolean; gap?: number; gapAfter?: (item: T, next: T) => number; onVisible?: (items: T[]) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [retained, setRetained] = useState<{ focus?: string; anchor?: string }>({})
  const lastWindow = useRef<VirtualItem[]>([])
  const lastTotal = useRef(0)
  const firstKey = useRef(items[0]?.key)
  const virtual = items.length > 16
  const getScrollElement = () => root.current?.closest<HTMLElement>('.messages, .execution-drawer-body') ?? null
  const gapAt = (index: number) => index === items.length - 1 ? 0 : gapAfter?.(items[index], items[index + 1]) ?? gap
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: items.length,
    getScrollElement,
    getItemKey: index => items[index].key,
    estimateSize: index => 72 + gapAt(index),
    enabled: virtual && enabled,
    scrollMargin,
    // Preserve the visible stable key when ExecutionWindow prepends/trims a page.
    // Ordinary stream growth uses start anchoring; the host owns bottom following.
    anchorTo: firstKey.current !== items[0]?.key ? 'end' : 'start',
    overscan: 4,
    rangeExtractor: range => {
      const indexes = new Set(defaultRangeExtractor(range))
      for (const key of [retained.focus, retained.anchor]) {
        const index = key === undefined ? -1 : items.findIndex(item => item.key === key)
        if (index >= 0) indexes.add(index)
      }
      return [...indexes].sort((a, b) => a - b)
    },
    scrollToFn: (offset, options, instance) => {
      elementScroll(offset, options, instance)
      // ExecutionWindow must not mistake measurement compensation for user intent.
      if (instance.scrollElement) instance.scrollElement.dataset.executionAdjustedTop = String(instance.scrollElement.scrollTop)
    },
  })
  useLayoutEffect(() => {
    const element = root.current, host = getScrollElement()
    if (!element || !host || !enabled || !virtual) return
    const measureOffset = () => setScrollMargin(element.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - host.clientTop)
    const retainAnchor = () => {
      const key = host.dataset.executionAnchorKey
      const row = host.dataset.executionDisclosureAnchor === 'true' && key
        ? [...element.querySelectorAll<HTMLElement>('[data-execution-virtual-key]')].find(row => row.querySelector(`[data-execution-item-key="${CSS.escape(key)}"], [data-execution-item-keys~="${CSS.escape(key)}"]`)) : undefined
      setRetained(previous => ({ ...previous, anchor: row?.dataset.executionVirtualKey }))
    }
    measureOffset()
    const observer = new ResizeObserver(measureOffset)
    observer.observe(host)
    // Earlier message/card growth changes the list's offset within the shared viewport.
    if (host.firstElementChild) observer.observe(host.firstElementChild)
    host.addEventListener('execution-disclosure-anchor', retainAnchor)
    return () => { observer.disconnect(); host.removeEventListener('execution-disclosure-anchor', retainAnchor) }
  }, [enabled, virtual, items])
  useLayoutEffect(() => { firstKey.current = items[0]?.key }, [items])
  const measured = virtualizer.getVirtualItems()
  if (measured.length) lastWindow.current = measured
  const window = enabled ? measured : lastWindow.current.filter(row => items[row.index]?.key === row.key)
  useLayoutEffect(() => {
    if (enabled) onVisible?.(virtual ? measured.map(row => items[row.index]) : items)
  }, [enabled, items, measured, onVisible, virtual])
  if (!items.length) return null
  const rows = virtual ? window : items.map((item, index) => ({ index, key: item.key, start: 0, end: 0, size: 0 }))
  if (enabled) lastTotal.current = virtualizer.getTotalSize()
  const total = lastTotal.current
  return <div ref={root} className="execution-virtual-list" style={{ overflowAnchor: 'none', ...(virtual ? { height: total, position: 'relative' } : {}) }}
    onFocusCapture={event => {
      const key = (event.target as HTMLElement).closest<HTMLElement>('[data-execution-virtual-key]')?.dataset.executionVirtualKey
      setRetained(previous => ({ ...previous, focus: key }))
    }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRetained(previous => ({ ...previous, focus: undefined })) }}>
    {rows.map(row => <div key={row.key} data-index={row.index} data-execution-virtual-key={items[row.index].key}
      ref={virtual ? virtualizer.measureElement : undefined}
      style={{ paddingBottom: gapAt(row.index), display: 'flow-root', ...(virtual ? { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start - scrollMargin}px)` } : {}) }}>{children(items[row.index])}</div>)}
  </div>
}
