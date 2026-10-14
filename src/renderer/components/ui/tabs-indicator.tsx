/*
 * [INPUT]: Base UI 已提交的 aria-selected、标签列表真实布局与 transitions-dev 的滑动片段。
 * [OUTPUT]: 仅跟随选中态移动背景；首次/尺寸改变不播放，支持横纵、线形、可关闭窗口及隐藏恢复；卸载清理观测。
 * [POS]: 共享 Tabs 内部装饰层，不写选择状态、不接管焦点或业务回调。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useLayoutEffect, useRef } from 'react'

export function TabsSlidingIndicator() {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const pill = ref.current, bar = pill?.parentElement
    if (!pill || !bar) return
    let previous: HTMLElement | null = null
    const observed = new Set<HTMLElement>()
    const move = (animate: boolean) => {
      const tabs = Array.from(bar.querySelectorAll<HTMLElement>('[data-slot=tabs-trigger]')).filter(tab => tab.closest('[data-slot=tabs-list]') === bar)
      const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? null
      const target = bar.dataset.variant === 'window' ? active?.closest<HTMLElement>('.detail-tab') ?? active : active
      for (const old of observed) if (!tabs.includes(old)) { resize.unobserve(old); observed.delete(old) }
      for (const tab of tabs) if (!observed.has(tab)) { resize.observe(tab); observed.add(tab) }
      if (!target || !target.getClientRects().length) { pill.hidden = true; previous = null; return }
      const rect = target.getBoundingClientRect(), parent = bar.getBoundingClientRect()
      if (!rect.width || !rect.height) { pill.hidden = true; previous = null; return }
      // Modal entrance transforms affect viewport rectangles, not CSS layout coordinates.
      const style = getComputedStyle(bar)
      const scaleX = parent.width / (Number.parseFloat(style.width) || parent.width)
      const scaleY = parent.height / (Number.parseFloat(style.height) || parent.height)
      let x = (rect.left - parent.left) / scaleX - bar.clientLeft + bar.scrollLeft
      let y = (rect.top - parent.top) / scaleY - bar.clientTop + bar.scrollTop
      let width = rect.width / scaleX, height = rect.height / scaleY
      if (bar.dataset.variant === 'line') {
        if (bar.dataset.orientation === 'vertical') { x += width - 2; y += 4; width = 2; height = Math.max(0, height - 8) }
        else { x += 10; y += height - 2; width = Math.max(0, width - 20); height = 2 }
      }
      const snap = !animate || !previous || previous === active
      if (snap) pill.style.transition = 'none'
      pill.hidden = false
      pill.style.transform = `translate(${x}px, ${y}px)`
      pill.style.width = `${width}px`
      pill.style.height = `${height}px`
      if (snap) { void pill.offsetWidth; pill.style.transition = '' }
      previous = active
    }
    const resize = new ResizeObserver(() => move(false))
    const mutation = new MutationObserver(() => move(true))
    move(false)
    resize.observe(bar)
    mutation.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-selected', 'data-orientation', 'data-variant'] })
    return () => { resize.disconnect(); mutation.disconnect() }
  }, [])
  return <span ref={ref} className="t-tabs-pill" data-slot="tabs-indicator" aria-hidden="true" hidden />
}
