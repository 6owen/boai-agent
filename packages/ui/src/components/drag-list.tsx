/*
 * [OUTPUT]: 原生指针移动直接更新命中的落点，重复经过同一位置不触发列表渲染。
 * [INPUT]: 有序条目身份、可移动边界、受控保存回调与自定义行内容。
 * [OUTPUT]: 归组目标可随可接受的拖拽显示，头像网格按横向落点排序。
 * [OUTPUT]: 会话式原生拖拽、前后落点/归组提示；有效行内排序优先，无效排序保留来源并冒泡至分类目标；按条目身份校验归组目标、拖动态、取消清理和 Alt 方向键排序。
 * [POS]: 跨页面列表拖拽组件；只管理手势，不保存业务数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'

export type ListMove = { id: string; targetId: string; placement: 'before' | 'after' }
type Target = { element: HTMLElement; placement: ListMove['placement'] | 'inside' }
interface DragListProps {
  ids: string[]; disabled?: boolean; children: ReactNode
  onMove(move: ListMove): void
  canMove?(id: string, targetId: string): boolean
  canGroupDrop?(id: string, groupId: string): boolean
  onGroupDrop?(id: string, groupId: string): void
}
type DragContextValue = DragListProps & {
  dragged: string | null
  source: React.RefObject<string | null>
  setDragged(id: string | null): void
  setTarget(element: HTMLElement, placement: Target['placement']): void
  leaveTarget(element: HTMLElement): void
  finish(): void
}
const DragContext = createContext<DragContextValue | null>(null)
function useDragList() {
  const context = useContext(DragContext)
  if (!context) throw new Error('拖拽条目需要放在 DragList 中')
  return context
}
export function DragList(props: DragListProps) {
  const [dragged, setDragged] = useState<string | null>(null)
  const source = useRef<string | null>(null)
  const target = useRef<Target | null>(null)
  const clearTarget = useCallback(() => {
    if (target.current) delete target.current.element.dataset.drop
    target.current = null
  }, [])
  const setTarget = (element: HTMLElement, placement: Target['placement']) => {
    if (target.current?.element === element && target.current.placement === placement) return
    if (target.current?.element !== element) clearTarget()
    target.current = { element, placement }
    element.dataset.drop = placement
  }
  const leaveTarget = (element: HTMLElement) => {
    if (target.current?.element === element) clearTarget()
  }
  const finish = useCallback(() => { source.current = null; setDragged(null); clearTarget() }, [clearTarget])
  useEffect(() => {
    if (props.disabled) finish()
  }, [props.disabled, finish])
  return <DragContext.Provider value={{ ...props, source, dragged, setDragged, setTarget, leaveTarget, finish }}>{props.children}</DragContext.Provider>
}

export function DragListItem({ id, className = '', horizontal = false, children }: { id: string; className?: string; horizontal?: boolean; children: (props: { dragging: boolean; dragProps: HTMLAttributes<HTMLElement> }) => ReactNode }) {
  const drag = useDragList(), ignorePointer = useRef(false)
  const canMove = (source: string, target: string) => !drag.disabled && source !== target && drag.ids.includes(source) && drag.ids.includes(target) && (!drag.canMove || drag.canMove(source, target))
  const target = (event: DragEvent): ListMove | null => {
    const source = drag.source.current
    if (!source || !canMove(source, id)) return null
    const box = event.currentTarget.getBoundingClientRect()
    return { id: source, targetId: id, placement: (horizontal ? event.clientX < box.x + box.width / 2 : event.clientY < box.y + box.height / 2) ? 'before' : 'after' }
  }
  const enabled = !drag.disabled && drag.ids.includes(id)
  const dragProps: HTMLAttributes<HTMLElement> = {
    draggable: enabled,
    onPointerDown: event => { const control = (event.target as HTMLElement).closest('button,input,textarea,select,a,[contenteditable=true]'); ignorePointer.current = Boolean(control && control !== event.currentTarget) },
    onDragStart: event => {
      if (!enabled || ignorePointer.current) { event.preventDefault(); return }
      event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-boai-list-item', id)
      drag.source.current = id; drag.setDragged(id)
    },
    onDragEnd: drag.finish,
    onKeyDown: event => {
      if (event.target !== event.currentTarget || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !enabled) return
      event.preventDefault(); event.stopPropagation()
      const eligible = drag.ids.filter(other => other === id || canMove(id, other))
      const targetId = eligible[eligible.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1)]
      if (targetId) drag.onMove({ id, targetId, placement: event.key === 'ArrowUp' ? 'before' : 'after' })
    },
    'aria-description': '可拖拽排序，或按 Alt 加上下方向键移动。',
  }
  return <div className={`drag-list-row ${className}`}
    onDragOver={event => {
      const next = target(event)
      if (!next) { drag.leaveTarget(event.currentTarget); return }
      event.stopPropagation(); event.preventDefault(); event.dataTransfer.dropEffect = 'move'
      drag.setTarget(event.currentTarget, next.placement)
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) drag.leaveTarget(event.currentTarget) }}
    onDrop={event => { const next = target(event); if (next) { event.stopPropagation(); event.preventDefault(); drag.onMove(next); drag.finish() } }}>
    {children({ dragging: drag.dragged === id, dragProps })}
  </div>
}

export function DragListGroupTarget({ id, className, children }: { id: string; className?: string; children: ReactNode | ((eligible: boolean) => ReactNode) }) {
  const drag = useDragList()
  const source = () => !drag.disabled && drag.onGroupDrop && drag.source.current && drag.ids.includes(drag.source.current) && (!drag.canGroupDrop || drag.canGroupDrop(drag.source.current, id)) ? drag.source.current : null
  const content = typeof children === 'function' ? children(Boolean(drag.dragged && source())) : children
  if (content == null) return null
  return <div className={['drag-list-group-target', className].filter(Boolean).join(' ')}
    onDragOver={event => {
      if (!source()) { drag.leaveTarget(event.currentTarget); return }
      event.stopPropagation(); event.preventDefault(); event.dataTransfer.dropEffect = 'move'
      drag.setTarget(event.currentTarget, 'inside')
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) drag.leaveTarget(event.currentTarget) }}
    onDrop={event => { const idToMove = source(); if (idToMove) { event.stopPropagation(); event.preventDefault(); drag.onGroupDrop!(idToMove, id); drag.finish() } }}>
    {content}
  </div>
}
