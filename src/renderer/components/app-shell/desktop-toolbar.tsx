/*
 * [INPUT]: 页面标题、导航历史和分栏显示状态。
 * [OUTPUT]: 紧凑原生标题栏中的后退、前进、侧栏与详情开关。
 * [POS]: app-shell 顶部工具栏，标题供辅助技术读取。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight } from '@/components/icons'

interface Props {
  title: string; showListToggle: boolean; listShown: boolean; detailOpen: boolean; listLabel: string
  canBack: boolean; canForward: boolean; detailDisabled: boolean
  onBack(): void; onForward(): void; onToggleList(): void; onToggleDetails(): void
}
export function DesktopToolbar(props: Props) {
  return <header className="global-toolbar">
    <div className="toolbar-left">
      <button className="icon-button" aria-label="后退" disabled={!props.canBack} onClick={props.onBack}><ArrowLeft size={18} /></button>
      <button className="icon-button" aria-label="前进" disabled={!props.canForward} onClick={props.onForward}><ArrowRight size={18} /></button>
      {props.showListToggle && <button className="icon-button" aria-label={props.listLabel} title={props.listLabel} aria-pressed={props.listShown} onClick={props.onToggleList}><PanelLeft size={18} /></button>}
    </div>
    <span className="sr-only">{props.title}</span>
    <div className="toolbar-right">{!props.detailDisabled && <button className={`icon-button${props.detailOpen ? ' active' : ''}`} aria-label="显示或隐藏详情" aria-pressed={props.detailOpen} onClick={props.onToggleDetails}><PanelRight size={18} /></button>}</div>
  </header>
}
