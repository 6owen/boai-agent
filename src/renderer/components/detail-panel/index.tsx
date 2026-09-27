/*
 * [INPUT]: 详情名称、图标、未保存状态、导航回调与统一 Button。
 * [OUTPUT]: 放入全局 header 的内容宽度标签式标题，以及独立的下方详情内容容器。
 * [POS]: src/renderer/components/detail-panel/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import type { ReactNode, RefObject } from 'react'
import { ChevronLeft, X } from '@/components/icons'

export function DetailPanelHeader({ title, icon, headerRef, nested, dirty, onBack, onClose }: {
  title: string; headerRef: RefObject<HTMLElement | null>; nested: boolean; dirty: boolean
  icon: ReactNode; onBack(): void; onClose(): void
}) {
  return <div className="detail-header">
    {nested && <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="返回上一级详情"><ChevronLeft /></Button>}
    <div className="detail-tab">
      {icon}<span className="detail-tab-title" role="heading" aria-level={2} ref={headerRef} tabIndex={-1} title={title}>{title}</span>
      {dirty && <span className="dirty-label">未保存</span>}
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭详情"><X /></Button>
    </div>
  </div>
}

export function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="detail-panel" aria-label={title}>{children}</aside>
}
