/*
 * [INPUT]: 面板显隐、左右位置、既有分割线与内容；宽度由宿主 CSS 变量提供。
 * [OUTPUT]: transitions-dev Card resize 宽度过渡；内容保持挂载，关闭立即隔离交互，分割线保留原命中区域。
 * [POS]: 桌面左右分栏的共用展示容器，不延迟业务活跃状态或读取清理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ReactNode } from 'react'

export function PanelResize({ open, side, divider, children }: {
  open: boolean; side: 'left' | 'right'; divider: ReactNode; children: ReactNode
}) {
  return <div className="panel-resize t-resize" data-open={open} data-side={side} inert={!open} aria-hidden={!open}>
    <div className="panel-resize-content">{children}</div>
    {divider}
  </div>
}
