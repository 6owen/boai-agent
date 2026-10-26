/*
 * [INPUT]: Rovai ExecutionAvatarRail.tsx @ f9acc2395283d49f0ce247dc0af2207c155f6eb6 (MIT)。
 * [OUTPUT]: 保留Rovai键盘/横向滚动/揭示/提示；总览复用群组合头像，成员共用60px栏位/40px头像/8px间距，无状态角标。
 * [POS]: 执行员工选择；许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '@/components/common'
import { GroupAvatar } from '@/components/common/group-avatar'
import type { DigitalAgent } from '@boai/shared/domain'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/icons'
const uiAttribute = (text: string, ...values: string[]) => text.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? '')

export interface ExecutionAvatarRailItem  {
  agentId: string; displayName: string; avatarRef?: DigitalAgent['avatar']; color?: string
  overview?: boolean
  statusLabel: string
}

// Four group-member-profile controls (60px), each followed by an 8px gap.
const SCROLL_STEP = 272
const EDGE_INSET = 32

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

function revealAvatar(rail: HTMLUListElement, button: HTMLButtonElement): void {
  const viewport = rail.getBoundingClientRect()
  const avatar = button.getBoundingClientRect()
  const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
  const left = viewport.left + (rail.scrollLeft > 1 ? EDGE_INSET : 3)
  const right = viewport.right - (rail.scrollLeft < maximum - 1 ? EDGE_INSET : 3)
  const delta = avatar.left < left ? avatar.left - left : avatar.right > right ? avatar.right - right : 0
  // Scroll only this rail; scrollIntoView would also move the conversation/Inspector ancestors.
  if (delta !== 0) rail.scrollTo({
    left: Math.max(0, Math.min(rail.scrollLeft + delta, maximum)),
    behavior: scrollBehavior()
  })
}

export function ExecutionAvatarRail({
  items,
  members,
  selectedAgentId,
  revealRequest,
  active,
  onOpen
}: {
  items: ExecutionAvatarRailItem[]
  members: DigitalAgent[]
  selectedAgentId: string | null
  revealRequest: number
  active: boolean
  onOpen(agentId: string, trigger: HTMLButtonElement): void
}): React.JSX.Element {
  const railRef = useRef<HTMLUListElement>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const leftButtonRef = useRef<HTMLButtonElement>(null)
  const rightButtonRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const lastReveal = useRef<{ agentId: string; request: number } | null>(null)
  const arrowScrollTarget = useRef<number | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null)
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const tooltipId = useId()
  const listId = useId()
  const itemIds = JSON.stringify(items.map(item => item.agentId))
  const tooltipItem = active
    ? items.find(item => item.agentId === (hoveredAgentId ?? focusedAgentId))
    : undefined

  const updateEdges = useCallback((): void => {
    const rail = railRef.current
    if (!rail) return
    const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
    if (arrowScrollTarget.current !== null
      && (Math.abs(rail.scrollLeft - arrowScrollTarget.current) < 1 || arrowScrollTarget.current > maximum)) {
      arrowScrollTarget.current = null
    }
    const left = maximum > 1 && rail.scrollLeft > 1
    const right = maximum > 1 && rail.scrollLeft < maximum - 1
    setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right })
  }, [])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const wheel = (event: WheelEvent): void => {
      if (event.ctrlKey || rail.scrollWidth <= rail.clientWidth + 1) return
      arrowScrollTarget.current = null
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rail.clientWidth : 1
      rail.scrollBy({ left: event.deltaY * unit, behavior: 'auto' })
    }
    const observer = new ResizeObserver(updateEdges)
    observer.observe(rail)
    rail.addEventListener('scroll', updateEdges, { passive: true })
    // React's delegated wheel listener is passive; the vertical-wheel conversion must not be.
    rail.addEventListener('wheel', wheel, { passive: false })
    updateEdges()
    return () => {
      observer.disconnect()
      rail.removeEventListener('scroll', updateEdges)
      rail.removeEventListener('wheel', wheel)
    }
  }, [itemIds, updateEdges])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!active || !selectedAgentId || !rail?.clientWidth) return
    if (lastReveal.current?.agentId === selectedAgentId && lastReveal.current.request === revealRequest) return
    const button = buttons.current.get(selectedAgentId)
    if (!button) return
    arrowScrollTarget.current = null
    revealAvatar(rail, button)
    lastReveal.current = { agentId: selectedAgentId, request: revealRequest }
  }, [active, selectedAgentId, revealRequest, itemIds])

  useLayoutEffect(() => {
    if (!active) return
    // A scroll arrow disappearing at an edge must not strand keyboard focus on an invisible control.
    const boundary = !edges.left && document.activeElement === leftButtonRef.current ? items[0]
      : !edges.right && document.activeElement === rightButtonRef.current ? items.at(-1) : null
    if (boundary) buttons.current.get(boundary.agentId)?.focus({ preventScroll: true })
  }, [active, edges, items])

  useLayoutEffect(() => {
    const rail = railRef.current
    const tooltip = tooltipRef.current
    const button = tooltipItem && buttons.current.get(tooltipItem.agentId)
    if (!rail || !tooltip || !button) return
    const position = (): void => {
      const viewport = rail.getBoundingClientRect()
      const avatar = button.getBoundingClientRect()
      tooltip.hidden = avatar.right <= viewport.left || avatar.left >= viewport.right
      const center = avatar.left + avatar.width / 2 - viewport.left
      tooltip.style.left = `${Math.max(0, Math.min(center - tooltip.offsetWidth / 2, rail.clientWidth - tooltip.offsetWidth))}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(rail)
    observer.observe(tooltip)
    rail.addEventListener('scroll', position, { passive: true })
    return () => {
      observer.disconnect()
      rail.removeEventListener('scroll', position)
    }
  }, [tooltipItem])

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === 'Escape' && tooltipItem) {
      event.preventDefault()
      event.stopPropagation()
      setHoveredAgentId(null)
      setFocusedAgentId(null)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      || event.altKey || event.ctrlKey || event.metaKey) return
    const current = items.findIndex(item => buttons.current.get(item.agentId) === event.target)
    if (current < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    const button = buttons.current.get(items[next].agentId)
    if (!button || !railRef.current) return
    arrowScrollTarget.current = null
    setHoveredAgentId(null)
    setFocusedAgentId(items[next].agentId)
    button.focus({ preventScroll: true })
    // Home/End also reveal an already-focused avatar after a wheel gesture moved it off screen.
    revealAvatar(railRef.current, button)
  }

  const scrollByFour = (direction: -1 | 1): void => {
    const rail = railRef.current
    if (!rail) return
    const target = Math.max(0, Math.min(
      (arrowScrollTarget.current ?? rail.scrollLeft) + direction * SCROLL_STEP,
      rail.scrollWidth - rail.clientWidth
    ))
    arrowScrollTarget.current = target
    rail.scrollTo({ left: target, behavior: scrollBehavior() })
  }

  return <div className="relative min-w-0 w-full">
    <Button
      ref={leftButtonRef}
      variant="secondary" size="icon-sm" className={`absolute left-0 top-3 z-10 ${edges.left ? '' : 'invisible'}`}
      type="button"
      aria-label={uiAttribute("向左查看更多员工")}
      aria-controls={listId}
      aria-hidden={!edges.left}
      disabled={!edges.left}
      onClick={() => scrollByFour(-1)}
    ><Icon name="ChevronLeft" /></Button>
    <ul ref={railRef} id={listId} className="m-0 flex list-none gap-[8px] overflow-x-auto p-0 [scrollbar-width:none]" aria-label={uiAttribute("员工执行过程入口")} onKeyDown={onKeyDown}>
      {items.map(item => <li key={item.agentId} className="shrink-0">
        <Button
          ref={button => { if (button) buttons.current.set(item.agentId, button); else buttons.current.delete(item.agentId) }}
          type="button"
          variant="ghost" size="content" className="group-member-profile relative shrink-0"
          aria-label={item.overview ? uiAttribute("打开全部员工执行总览") : uiAttribute("打开{0}的执行过程，{1}", String(item.displayName), String(item.statusLabel))}
          aria-pressed={selectedAgentId === item.agentId}
          aria-controls="agent-execution-drawer"
          aria-describedby={tooltipItem?.agentId === item.agentId ? tooltipId : undefined}
          data-agent-id={item.agentId}
          onPointerEnter={() => setHoveredAgentId(item.agentId)}
          onPointerLeave={() => setHoveredAgentId(null)}
          onFocus={event => {
            arrowScrollTarget.current = null
            setFocusedAgentId(item.agentId)
            if (railRef.current) revealAvatar(railRef.current, event.currentTarget)
          }}
          onBlur={() => setFocusedAgentId(null)}
          onClick={event => onOpen(item.agentId, event.currentTarget)}
        >
          {item.overview
            ? <GroupAvatar members={members} />
            : <Avatar name={item.displayName} seed={item.agentId} avatar={item.avatarRef} color={item.color} />}
          <span>{item.displayName}</span>
        </Button>
      </li>)}
    </ul>
    <Button
      ref={rightButtonRef}
      variant="secondary" size="icon-sm" className={`absolute right-0 top-3 z-10 ${edges.right ? '' : 'invisible'}`}
      type="button"
      aria-label={uiAttribute("向右查看更多员工")}
      aria-controls={listId}
      aria-hidden={!edges.right}
      disabled={!edges.right}
      onClick={() => scrollByFour(1)}
    ><Icon name="ChevronRight" /></Button>
    {tooltipItem && <span ref={tooltipRef} id={tooltipId} className="absolute top-full z-20 max-w-full truncate rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md" role="tooltip">
      {tooltipItem.overview ? uiAttribute("总览 · 全部员工") : `${tooltipItem.displayName} · ${tooltipItem.statusLabel}`}
    </span>}
  </div>
}
