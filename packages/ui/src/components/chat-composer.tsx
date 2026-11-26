/*
 * [OUTPUT]: 自适应 Composer 在紧凑宽度测量折行，经 Motion layout 切换；编辑器和操作组进行位置校正。
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: InputGroup 原语、标准表单属性与宿主传入的内容/事件。
 * [OUTPUT]: 保留大圆角与紧凑布局的聊天输入表面，内侧细边缘/高光复用 Button control、无底部外侧阴影，文本框聚焦保持中性边缘；两行文本框、分侧操作栏和权限/模型菜单控件；不管理会话运行时。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的聊天输入组合，业务与组件验收页共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from 'cn'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './input-group'
import { Button } from './button'

function ChatComposer({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return <InputGroup variant="composer" data-slot="chat-composer" className={className} {...props} />
}
interface AdaptiveComposerProps extends ComponentProps<typeof ChatComposer> {
  value: string
  input: ReactNode
  beforeInput?: ReactNode
  afterInput?: ReactNode
}

const ComposerLayout = createContext<boolean | null>(null)
const layoutTransition = { layout: { type: 'tween', duration: 0.18, ease: 'easeInOut' } } as const

function measureCompact(slot: HTMLDivElement | null, expanded: boolean) {
  if (!slot) return null
  const composer = slot.parentElement
  const input = slot.querySelector<HTMLElement>('.chat-composer-input')
  if (!composer?.clientWidth || !input) return null
  if (expanded) return false

  const wasCompact = composer.hasAttribute('data-compact')
  const scrollTop = input.scrollTop
  // Measure the compact geometry without changing the layout Motion snapshots at commit time.
  composer.toggleAttribute('data-compact', true)
  const fits = slot.clientWidth >= 96 && input.scrollHeight <= input.clientHeight
  composer.toggleAttribute('data-compact', wasCompact)
  if (!wasCompact) input.scrollTop = scrollTop
  return fits
}

function AdaptiveChatComposer({ value, input, beforeInput, afterInput, children, className, ...props }: AdaptiveComposerProps) {
  const slot = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(true)
  const reducedMotion = useReducedMotion()
  const layoutMode = reducedMotion ? null : compact
  const expanded = useRef(false)
  expanded.current = Boolean(beforeInput || afterInput) || /[\r\n]/.test(value)

  const updateLayout = useCallback(() => {
    const next = measureCompact(slot.current, expanded.current)
    if (next !== null) setCompact(next)
  }, [])

  useLayoutEffect(() => { updateLayout() })
  useLayoutEffect(() => {
    const composer = slot.current?.parentElement
    if (!composer || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const widths = new WeakMap<Element, number>()
    const observer = new ResizeObserver(entries => {
      const needsMeasure = entries.some(({ target, contentRect }) => widths.get(target) !== contentRect.width)
      for (const { target, contentRect } of entries) widths.set(target, contentRect.width)
      if (!needsMeasure) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateLayout)
    })
    observer.observe(composer)
    for (const actions of composer.querySelectorAll('.chat-composer-actions')) observer.observe(actions)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [updateLayout])

  return <ComposerLayout.Provider value={layoutMode}>
    <motion.div layout={layoutMode !== null} layoutDependency={layoutMode} transition={layoutTransition} className="adaptive-composer-shell">
      <ChatComposer className={className} data-compact={compact ? '' : undefined} {...props}>
        {beforeInput}
        <motion.div ref={slot} layout={layoutMode !== null && 'position'} layoutDependency={layoutMode} transition={layoutTransition} className="adaptive-composer-editor">{input}</motion.div>
        {afterInput}
        {children}
      </ChatComposer>
    </motion.div>
  </ComposerLayout.Provider>
}

function ChatComposerInput({ className, ...props }: ComponentProps<typeof InputGroupTextarea>) {
  return <InputGroupTextarea className={cn('chat-composer-input min-h-[44px] max-h-[240px] group-data-[compact]/input-group:min-h-0 px-1 py-0 text-[length:var(--text-content-body)] font-[family-name:var(--font-content-family)] leading-[1.6] md:text-[length:var(--text-content-body)]', className)} rows={2} {...props} />
}
function ChatComposerFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn('chat-composer-footer justify-between p-0 group-data-[compact]/input-group:contents', className)} {...props} />
}
function ChatComposerActions({ align = 'start', className, ...props }: ComponentProps<typeof motion.div> & { align?: 'start' | 'end' }) {
  const mode = useContext(ComposerLayout)
  return <motion.div layout={mode !== null && 'position'} layoutDependency={mode} transition={layoutTransition} className={cn('chat-composer-actions', className)} data-align={align} {...props} />
}
function ChatComposerSelect({ kind, className, ...props }: ComponentProps<typeof Button> & { kind: 'permission' | 'model' }) {
  return <Button variant="ghost" size="sm" className={cn('chat-composer-select min-w-0 max-w-[220px] gap-[5px] text-[length:var(--text-ui-secondary)] font-normal', className)} data-kind={kind} {...props} />
}
function ChatComposerOption({ label, description }: { label: string; description: string }) {
  return <span className="chat-composer-option"><span>{label}</span><small>{description}</small></span>
}
export { AdaptiveChatComposer, ChatComposer, ChatComposerInput, ChatComposerFooter, ChatComposerActions, ChatComposerSelect, ChatComposerOption }
