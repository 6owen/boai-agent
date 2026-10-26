/*
 * [INPUT]: 当前目录标签内容与已安装的transitions-dev Panel reveal原版CSS。
 * [OUTPUT]: 标签内容挂载时短位移/淡入/去模糊；减少动态效果沿原片段。
 * [POS]: 目录内容展示层，标签导航始终保持挂载。
 * [PROTOCOL]: 变化同步Header与.folder.md。
 */
import { useState, type ReactNode } from 'react'
export function CatalogTransition({ children }: { children: ReactNode }) {
  const [settled, setSettled] = useState(false)
  return <div data-settled={settled} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'opacity') setSettled(true) }} className="catalog-transition t-panel-slide" data-open="true">{children}</div>
}
