import { ArrowLeft, ArrowRight, PanelLeft, PanelRight } from '@/components/icons'

interface Props {
  title: string; showListToggle: boolean; listShown: boolean; detailOpen: boolean
  canBack: boolean; canForward: boolean; detailDisabled: boolean
  onBack(): void; onForward(): void; onToggleList(): void; onToggleDetails(): void
}
export function DesktopToolbar(props: Props) {
  return <header className="global-toolbar">
    <div className="toolbar-left">
      <button className="icon-button" aria-label="后退" disabled={!props.canBack} onClick={props.onBack}><ArrowLeft size={18} /></button>
      <button className="icon-button" aria-label="前进" disabled={!props.canForward} onClick={props.onForward}><ArrowRight size={18} /></button>
      {props.showListToggle && <button className={`icon-button${props.listShown ? ' active' : ''}`} aria-label="显示或隐藏会话列表" aria-pressed={props.listShown} onClick={props.onToggleList}><PanelLeft size={19} /></button>}
    </div>
    <div className="toolbar-title" title={props.title}>{props.title}</div>
    <div className="toolbar-right"><span className="toolbar-brand">BoAI Agent</span><button className={`icon-button${props.detailOpen ? ' active' : ''}`} aria-label="显示或隐藏详情" aria-pressed={props.detailOpen} onClick={props.onToggleDetails} disabled={props.detailDisabled}><PanelRight size={20} /></button></div>
  </header>
}
