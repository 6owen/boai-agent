/*
 * [INPUT]: 多个详情名称、图标、选中/未保存状态、排序与关闭回调与统一窗口 Tabs。
 * [OUTPUT]: 全局 header 中可拖拽排序、可滚动、独立关闭的浏览器式标签栏，以及下方详情内容容器。
 * [POS]: src/renderer/components/detail-panel/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cn } from 'cn'
import { X } from '@/components/icons'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export function DetailPanelHeader({ tabs, activeKey, onClose, onMove }: {
  tabs: { key: string; label: string; description: string; icon: ReactNode; dirty: boolean }[]
  activeKey: string | null; onClose(key: string): void
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
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const active = list.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
    active?.focus({ preventScroll: true })
    const tab = active?.closest<HTMLElement>('.detail-tab')
    const reveal = () => tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    reveal()
    const resize = new ResizeObserver(reveal)
    if (list.current) resize.observe(list.current)
    if (tab) resize.observe(tab)
    return () => resize.disconnect()
  }, [activeKey])
  return <div className="detail-header">
    <TabsList variant="window" aria-label="详情标签" ref={list} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null) }}>
      {tabs.map(tab => <div className={cn('detail-tab', { dragging: dragged === tab.key })} key={tab.key} data-selected={activeKey === tab.key} data-drop={drop?.key === tab.key ? drop.placement : undefined}
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

export function DetailPanel({ title, hidden, children }: { title: string; hidden?: boolean; children: ReactNode }) {
  return <aside className="detail-panel" aria-label={title} hidden={hidden}>{children}</aside>
}
