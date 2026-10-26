/*
 * [INPUT]: 详情身份、当前可见状态与共享settings-page-transition/t-panel-slide样式。
 * [OUTPUT]: 复用通讯录详情的布局前重置/显现与opacity结束清理；身份切换或隐藏移除旧监听，减少动态效果直接显示，不使用延时二次切换。
 * [POS]: 通讯录详情与聊天消息共用的Panel reveal生命周期。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useLayoutEffect, useRef } from 'react'

export function usePanelReveal(identity: string, active: boolean) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    if (!active || !element) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      element.dataset.open = 'true'; element.dataset.settled = 'true'
      return
    }
    element.style.transition = 'none'; element.dataset.settled = 'false'; element.dataset.open = 'false'
    void element.offsetWidth
    element.style.transition = ''; element.dataset.open = 'true'
    const settle = (event: TransitionEvent) => { if (event.target === element && event.propertyName === 'opacity') element.dataset.settled = 'true' }
    element.addEventListener('transitionend', settle)
    return () => { element.removeEventListener('transitionend', settle); element.dataset.settled = 'true' }
  }, [identity, active])
  return content
}
