/*
 * [OUTPUT]: 详情标签显露仅局部调整列表scrollLeft；ResizeObserver按帧合并，避免展开时逐帧滚动祖先布局。
 * [OUTPUT]: 详情容器共用 PanelResize 展开/收起；拖动时关闭面板及顶栏过渡，原隐藏停读状态立即生效。
 * [OUTPUT]: 系统右侧容器统一持久宽度/窗口约束、拖拽/键盘复位；内容类型和主页面不参与尺寸选择，隐藏仍保留容器。
 * [OUTPUT]: 窄标题栏内详情标签按实际可用宽度收缩，标题省略且独立关闭按钮保持可达；多个标签仍局部滚动。
 * [OUTPUT]: 明确消息/审批来源导航恢复旧详情header时只展示标签，不抢原聊天焦点；后续显式切标签仍聚焦。
 * [INPUT]: 多个详情名称、图标、选中/未保存状态、排序与关闭回调与统一窗口 Tabs。
 * [OUTPUT]: 全局 header 中可拖拽排序、可滚动、独立关闭的浏览器式标签栏，以及下方详情内容容器。
 * [POS]: apps/electron/src/renderer/components/detail-panel/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cn } from 'cn'
import { X } from '@/components/icons'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PanelResize } from '@/components/common/panel-resize'

export function DetailPanelHeader({ tabs, activeKey, onClose, onMove, focusOnMount = true }: {
  tabs: { key: string; label: string; description: string; icon: ReactNode; dirty: boolean }[]
  activeKey: string | null; onClose(key: string): void; focusOnMount?: boolean
  onMove(key: string, targetKey: string, placement: 'before' | 'after'): void
}) {
  const [dragged, setDragged] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ key: string; placement: 'before' | 'after' } | null>(null)
  const finish = () => { setDragged(null); setDrop(null) }
  const locate = (event: DragEvent, key: string) => {
    if (!dragged || dragged === key) return null
    const box = event.currentTarget.getBoundingClientRect()
    return { key, placement: event.clientX < box.left + box.width / 2 ? 'before' as const : 'after' as const }
  }
  const list = useRef<HTMLDivElement>(null), initialFocus = useRef(focusOnMount), activated = useRef(false)
  useEffect(() => {
    const active = list.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
    if (activated.current || initialFocus.current) active?.focus({ preventScroll: true })
    activated.current = true
    const tab = active?.closest<HTMLElement>('.detail-tab')
    let frame = 0
    const reveal = () => {
      frame = 0
      const viewport = list.current
      if (!viewport || !tab || !viewport.clientWidth) return
      const bounds = viewport.getBoundingClientRect(), item = tab.getBoundingClientRect()
      // Only the tab strip scrolls. scrollIntoView also walks the animated shell.
      if (item.left < bounds.left - 1) viewport.scrollLeft += item.left - bounds.left
      else if (item.right > bounds.right + 1) viewport.scrollLeft += item.right - bounds.right
    }
    reveal()
    const resize = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(reveal)
    })
    if (list.current) resize.observe(list.current)
    if (tab) resize.observe(tab)
    return () => { resize.disconnect(); cancelAnimationFrame(frame) }
  }, [activeKey])
  return <div className="detail-header">
    <TabsList variant="window" aria-label="详情标签" ref={list} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null) }}>
      {tabs.map(tab => <div className={cn('detail-tab min-w-[min(90px,100%)] max-w-[min(180px,100%)]', { dragging: dragged === tab.key })} key={tab.key} data-selected={activeKey === tab.key} data-drop={drop?.key === tab.key ? drop.placement : undefined}
        onDragOver={event => {
          const next = locate(event, tab.key); setDrop(next)
          if (next) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }
          const edge = list.current?.getBoundingClientRect()
          if (edge) list.current?.scrollBy({ left: event.clientX < edge.left + 32 ? -16 : event.clientX > edge.right - 32 ? 16 : 0 })
        }}
        onDrop={event => { const next = locate(event, tab.key); if (next && dragged) { event.preventDefault(); onMove(dragged, next.key, next.placement) } finish() }}>
        <TabsTrigger className="min-w-0 shrink" value={tab.key} aria-label={tab.label} title={tab.description} draggable aria-description="可拖拽排序，或按 Alt 加左右方向键移动。"
          onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-boai-detail-tab', tab.key); setDragged(tab.key) }} onDragEnd={finish}
          onKeyDown={event => {
            if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault(); event.stopPropagation()
            const other = tabs[tabs.indexOf(tab) + (event.key === 'ArrowLeft' ? -1 : 1)]
            if (other) onMove(tab.key, other.key, event.key === 'ArrowLeft' ? 'before' : 'after')
          }}>
          {tab.icon}<span className="detail-tab-title">{tab.label}</span>{tab.dirty && <span className="dirty-label" aria-label="未保存">·</span>}
        </TabsTrigger>
        <Button variant="ghost" size="icon-sm" onClick={() => onClose(tab.key)} aria-label={activeKey === tab.key ? '关闭详情' : `关闭 ${tab.label}`} title={`关闭 ${tab.label}`}><X /></Button>
      </div>)}
    </TabsList>
  </div>
}

const DEFAULT_WIDTH = 360, MIN_WIDTH = 300, MAX_WIDTH = 960

/** Layout owns one width for every detail tab and page. Content cannot request a different size. */
export function useDetailPanelLayout() {
  const [resizing, setResizing] = useState(false)
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('boai.v2.detailWidth'))
      if (Number.isFinite(saved) && saved > 0) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, saved))
    } catch { /* Preferences are optional. */ }
    return DEFAULT_WIDTH
  })
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    try { localStorage.setItem('boai.v2.detailWidth', String(preferredWidth)) } catch { /* Preferences are optional. */ }
  }, [preferredWidth])
  // Reserve the navigation rail and main content; window shrinkage never overwrites the user's width.
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewportWidth - 56 - 280))
  const resize = (width: number) => setPreferredWidth(Math.max(MIN_WIDTH, Math.min(max, width)))
  return { width: Math.min(preferredWidth, max), min: MIN_WIDTH, max, resize, reset: () => resize(DEFAULT_WIDTH), resizing, setResizing }
}

export function DetailPanel({ title, hidden, layout, children }: { title: string; hidden?: boolean; layout: ReturnType<typeof useDetailPanelLayout>; children: ReactNode }) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const finish = () => { drag.current = null; layout.setResizing(false) }
  return <PanelResize open={!hidden} side="right" divider={<div className="resize-handle detail-resizer" role="separator" tabIndex={0} aria-label="调整详情宽度" aria-orientation="vertical"
      aria-valuemin={layout.min} aria-valuemax={layout.max} aria-valuenow={layout.width}
      onPointerDown={event => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
        layout.setResizing(true)
        drag.current = { pointerId: event.pointerId, x: event.clientX, width: layout.width }
      }}
      onPointerMove={event => { if (drag.current?.pointerId === event.pointerId) layout.resize(drag.current.width + drag.current.x - event.clientX) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish() }}
      onPointerCancel={finish} onLostPointerCapture={finish}
      onDoubleClick={layout.reset} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
        event.preventDefault()
        if (event.key === 'Home') layout.reset()
        else layout.resize(layout.width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 40 : 10))
      }} />}>
    <aside className="detail-panel" aria-label={title}>{children}</aside>
  </PanelResize>
}
