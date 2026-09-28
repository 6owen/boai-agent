/*
 * [INPUT]: 多个详情名称、图标、选中/未保存状态、关闭回调与统一窗口 Tabs。
 * [OUTPUT]: 全局 header 中可滚动、独立关闭的浏览器式标签栏，以及下方详情内容容器。
 * [POS]: src/renderer/components/detail-panel/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from '@/components/icons'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

export function DetailPanelHeader({ tabs, activeKey, onClose }: {
  tabs: { key: string; label: string; description: string; icon: ReactNode; dirty: boolean }[]
  activeKey: string | null; onClose(key: string): void
}) {
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
    <TabsList variant="window" aria-label="详情标签" ref={list}>
      {tabs.map(tab => <div className="detail-tab" key={tab.key} data-selected={activeKey === tab.key}>
        <TabsTrigger className="min-w-0 shrink" value={tab.key} aria-label={tab.label} title={tab.description}>
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
