/*
 * [INPUT]: 配置表单、原返回守卫、页面可见状态与共用 Motion/ScrollFade。
 * [OUTPUT]: 单一中性返回/保存操作行随滚动上移并向两侧展开；正文在Header下沿用会话同款ScrollFade自然淡出，无实色遮挡层；原表单、缩放及减少动态偏好保持。
 * [POS]: 通讯录配置页的滚动和顶部操作布局。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { ArrowLeft } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ScrollFade } from '@/components/ui/scroll-fade'

export function ContactEditorLayout({ active, onBack, children }: {
  active: boolean; onBack(): void; children(actionsTarget: HTMLElement | null): ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null)
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null)
  const scrollTop = useMotionValue(0), originTop = useMotionValue(48), originInset = useMotionValue(36), edgeInset = useMotionValue(24)
  const reducedMotion = useReducedMotion()
  const progress = useTransform(() => Math.min(1, Math.max(0, scrollTop.get() / Math.max(1, originTop.get()))))
  const y = useTransform(() => Math.max(0, originTop.get() - scrollTop.get()))
  const paddingInline = useTransform(() => {
    const amount = reducedMotion ? Number(progress.get() >= 1) : progress.get()
    return `${originInset.get() + (edgeInset.get() - originInset.get()) * amount}px`
  })
  useLayoutEffect(() => {
    const container = viewport.current, content = contentRef.current, scroller = scroll.current
    if (!active || !container || !content || !scroller) return
    const measure = () => {
      if (!container.clientWidth) return
      const outer = container.getBoundingClientRect(), inner = content.getBoundingClientRect(), style = getComputedStyle(content)
      originTop.set(inner.top - outer.top + scroller.scrollTop + parseFloat(style.paddingTop))
      originInset.set(inner.left - outer.left + parseFloat(style.paddingLeft))
      edgeInset.set(container.clientWidth <= 540 ? 16 : 24)
      scrollTop.set(scroller.scrollTop)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container); observer.observe(content)
    return () => observer.disconnect()
  }, [active, originTop, originInset, edgeInset, scrollTop])
  return <div ref={viewport} className="contact-editor-viewport">
    <motion.header className="contact-edit-header" style={{ y, paddingInline }}>
      <Button variant="secondary" onClick={onBack}><ArrowLeft />返回资料</Button>
      <div ref={setActionsTarget} className="contact-edit-header-actions" />
    </motion.header>
    <ScrollFade ref={scroll} className="contact-edit-scroll" onScroll={event => scrollTop.set(event.currentTarget.scrollTop)}>
      <div ref={contentRef} className="contact-document contact-editor-document">
        <div className="contact-edit-header-space" aria-hidden="true" />
        <div className="contact-editor">{children(actionsTarget)}</div>
      </div>
    </ScrollFade>
  </div>
}
