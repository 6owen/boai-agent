/*
 * [INPUT]: 页面业务状态与统一 UI 基础组件、统一 UI 基础组件。
 * [OUTPUT]: 保持原有交互的 Soft UI 页面控件。
 * [POS]: src/renderer/components/detail-panel/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import type { ReactNode, RefObject } from 'react'
import { ArrowLeft, ChevronLeft, X } from '@/components/icons'

export function DetailPanel({ title, headerRef, nested, dirty, onBack, onClose, children }: {
  title: string; headerRef: RefObject<HTMLElement | null>; nested: boolean; dirty: boolean
  onBack(): void; onClose(): void; children: ReactNode
}) {
  return <aside className="detail-panel" aria-label={title}><header className="detail-header" ref={headerRef} tabIndex={-1}>
    {nested ? <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="返回上一级详情"><ChevronLeft size={18} /></Button> : <Button variant="ghost" size="icon-sm" className="narrow-back" onClick={onClose} aria-label="返回内容"><ArrowLeft size={18} /></Button>}
    <strong>{title}</strong>{dirty && <span className="dirty-label">未保存</span>}<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭详情"><X size={18} /></Button>
  </header>{children}</aside>
}
