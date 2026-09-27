import type { ReactNode, RefObject } from 'react'
import { ArrowLeft, ChevronLeft, X } from '@/components/icons'

export function DetailPanel({ title, headerRef, nested, dirty, onBack, onClose, children }: {
  title: string; headerRef: RefObject<HTMLElement | null>; nested: boolean; dirty: boolean
  onBack(): void; onClose(): void; children: ReactNode
}) {
  return <aside className="detail-panel" aria-label={title}><header className="detail-header" ref={headerRef} tabIndex={-1}>
    {nested ? <button className="icon-button" onClick={onBack} aria-label="返回上一级详情"><ChevronLeft size={18} /></button> : <button className="icon-button narrow-back" onClick={onClose} aria-label="返回内容"><ArrowLeft size={18} /></button>}
    <strong>{title}</strong>{dirty && <span className="dirty-label">未保存</span>}<button className="icon-button" onClick={onClose} aria-label="关闭详情"><X size={18} /></button>
  </header>{children}</aside>
}
