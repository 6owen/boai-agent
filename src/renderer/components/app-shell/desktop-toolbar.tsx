/*
 * [INPUT]: 页面标题、导航历史、分栏显示状态、独立浏览器入口、详情标签及统一 UI 基础组件。
 * [OUTPUT]: 44px 原生标题栏导航、详情标签之前的浏览器按钮、与右侧拖拽线对齐的内容宽度多标签栏及无选中底色的面板开关。
 * [POS]: app-shell 顶部工具栏，标题供辅助技术读取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight } from '@/components/icons'

interface Props {
  title: string; showListToggle: boolean; listShown: boolean; detailOpen: boolean; listLabel: string
  canBack: boolean; canForward: boolean; detailDisabled: boolean
  detailHeader?: ReactNode
  browserAction?: ReactNode
  onBack(): void; onForward(): void; onToggleList(): void; onToggleDetails(): void
}
export function DesktopToolbar(props: Props) {
  return <header className="global-toolbar">
    <div className="toolbar-left">
      <Button variant="ghost" size="icon-sm" aria-label="后退" disabled={!props.canBack} onClick={props.onBack}><ArrowLeft /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="前进" disabled={!props.canForward} onClick={props.onForward}><ArrowRight /></Button>
      {props.showListToggle && <Button variant="ghost" size="icon-sm" aria-label={props.listLabel} title={props.listLabel} aria-pressed={props.listShown} onClick={props.onToggleList}>{props.listShown ? <PanelRight /> : <PanelLeft />}</Button>}
    </div>
    <span className="sr-only">{props.title}</span>
    {props.browserAction && <div className="ml-auto flex shrink-0 items-center">{props.browserAction}</div>}
    <div className={`toolbar-right${props.detailHeader ? ' toolbar-detail' : ''}`} style={props.browserAction ? { marginLeft: 0 } : undefined}>{props.detailHeader}{!props.detailDisabled && <Button variant="ghost" size="icon-sm" aria-label="显示或隐藏详情" aria-pressed={props.detailOpen} onClick={props.onToggleDetails}>{props.detailOpen ? <PanelLeft /> : <PanelRight />}</Button>}</div>
  </header>
}
