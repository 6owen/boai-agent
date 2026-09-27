/*
 * [INPUT]: 页面标题、导航历史和分栏显示状态、统一 UI 基础组件。
 * [OUTPUT]: 紧凑原生标题栏中的14px Carbon 后退、前进、侧栏与详情开关；开合状态用图标区分，不使用选中底色。
 * [POS]: app-shell 顶部工具栏，标题供辅助技术读取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight } from '@/components/icons'

interface Props {
  title: string; showListToggle: boolean; listShown: boolean; detailOpen: boolean; listLabel: string
  canBack: boolean; canForward: boolean; detailDisabled: boolean
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
    <div className="toolbar-right">{!props.detailDisabled && <Button variant="ghost" size="icon-sm" aria-label="显示或隐藏详情" aria-pressed={props.detailOpen} onClick={props.onToggleDetails}>{props.detailOpen ? <PanelLeft /> : <PanelRight />}</Button>}</div>
  </header>
}
