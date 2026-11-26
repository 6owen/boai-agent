/*
 * [INPUT]: 详情身份、当前可见状态与共享settings-page-transition/t-panel-slide样式。
 * [OUTPUT]: 新内容身份首次可见时入场；隐藏时结束过渡，恢复同一内容时直接显示。
 * [POS]: 通讯录详情与聊天消息共用的Panel reveal生命周期。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useLayoutEffect, useRef } from 'react'

export function usePanelReveal(identity: string, active: boolean) {
  const content = useRef<HTMLDivElement>(null)
  const last = useRef<{ identity: string; element: HTMLDivElement; revealed: boolean } | null>(null)
  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    if (last.current?.identity !== identity || last.current.element !== element) {
      last.current = { identity, element, revealed: false }
    }
    if (!active) {
      element.dataset.settled = 'true'
      return
    }
    if (!last.current.revealed) {
      last.current.revealed = true
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        element.dataset.open = 'true'; element.dataset.settled = 'true'
      } else {
        element.style.transition = 'none'; element.dataset.settled = 'false'; element.dataset.open = 'false'
        void element.offsetWidth
        element.style.transition = ''; element.dataset.open = 'true'
      }
    }
    if (element.dataset.settled === 'true') return
    const settle = (event: TransitionEvent) => { if (event.target === element && event.propertyName === 'opacity') element.dataset.settled = 'true' }
    element.addEventListener('transitionend', settle)
    return () => element.removeEventListener('transitionend', settle)
  }, [identity, active])
  return content
}
