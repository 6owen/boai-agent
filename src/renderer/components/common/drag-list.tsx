/*
 * [INPUT]: 有序条目身份、可移动边界、受控保存回调与自定义行内容。
 * [OUTPUT]: 会话式原生拖拽、前后落点/归组提示、拖动态、取消清理和 Alt 方向键排序。
 * [POS]: 跨页面列表拖拽组件；只管理手势，不保存业务数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createContext, useContext, useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'

export type ListMove = { id: string; targetId: string; placement: 'before' | 'after' }
type Target = { id: string; placement: ListMove['placement'] | 'inside' }
interface DragListProps {
  ids: string[]; disabled?: boolean; children: ReactNode
  onMove(move: ListMove): void
  canMove?(id: string, targetId: string): boolean
  onGroupDrop?(id: string, groupId: string): void
}
type DragContextValue = DragListProps & {
  dragged: string | null; target: Target | null
  source: React.RefObject<string | null>
  setDragged(id: string | null): void; setTarget(target: Target | null): void; finish(): void
}
const DragContext = createContext<DragContextValue | null>(null)
function useDragList() {
  const context = useContext(DragContext)
  if (!context) throw new Error('拖拽条目需要放在 DragList 中')
  return context
}
export function DragList(props: DragListProps) {
  const [dragged, setDragged] = useState<string | null>(null), [target, setTarget] = useState<Target | null>(null)
  const source = useRef<string | null>(null)
  const finish = () => { source.current = null; setDragged(null); setTarget(null) }
  return <DragContext.Provider value={{ ...props, source, dragged, target, setDragged, setTarget, finish }}>{props.children}</DragContext.Provider>
}

export function DragListItem({ id, className = '', children }: { id: string; className?: string; children: (props: { dragging: boolean; dragProps: HTMLAttributes<HTMLElement> }) => ReactNode }) {
  const drag = useDragList(), ignorePointer = useRef(false)
  const canMove = (source: string, target: string) => !drag.disabled && source !== target && drag.ids.includes(source) && drag.ids.includes(target) && (!drag.canMove || drag.canMove(source, target))
  const target = (event: DragEvent): ListMove | null => {
    const source = drag.source.current
    if (!source || !canMove(source, id)) return null
    const box = event.currentTarget.getBoundingClientRect()
    return { id: source, targetId: id, placement: event.clientY < box.y + box.height / 2 ? 'before' : 'after' }
  }
  const dragProps: HTMLAttributes<HTMLElement> = {
    draggable: !drag.disabled,
    onPointerDown: event => { const control = (event.target as HTMLElement).closest('button,input,textarea,select,a,[contenteditable=true]'); ignorePointer.current = Boolean(control && control !== event.currentTarget) },
    onDragStart: event => {
      if (drag.disabled || ignorePointer.current) { event.preventDefault(); return }
      event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-boai-list-item', id)
      drag.source.current = id; drag.setDragged(id)
    },
    onDragEnd: drag.finish,
    onKeyDown: event => {
      if (event.target !== event.currentTarget || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || drag.disabled) return
      event.preventDefault(); event.stopPropagation()
      const eligible = drag.ids.filter(other => other === id || canMove(id, other))
      const targetId = eligible[eligible.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1)]
      if (targetId) drag.onMove({ id, targetId, placement: event.key === 'ArrowUp' ? 'before' : 'after' })
    },
    'aria-description': '可拖拽排序，或按 Alt 加上下方向键移动。',
  }
  return <div className={`drag-list-row ${className}`} data-drop={drag.target?.id === id && drag.target.placement !== 'inside' ? drag.target.placement : undefined}
    onDragOver={event => { const next = target(event); event.stopPropagation(); drag.setTarget(next ? { id, placement: next.placement } : null); if (next) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) drag.setTarget(null) }}
    onDrop={event => { const next = target(event); event.stopPropagation(); if (next) { event.preventDefault(); drag.onMove(next) } drag.finish() }}>
    {children({ dragging: drag.dragged === id, dragProps })}
  </div>
}

export function DragListGroupTarget({ id, children }: { id: string; children: ReactNode }) {
  const drag = useDragList()
  const source = () => !drag.disabled && drag.onGroupDrop && drag.source.current && drag.ids.includes(drag.source.current) ? drag.source.current : null
  return <div className="drag-list-group-target" data-drop={drag.target?.id === id && drag.target.placement === 'inside' ? 'inside' : undefined}
    onDragOver={event => { if (!source()) return; event.stopPropagation(); event.preventDefault(); event.dataTransfer.dropEffect = 'move'; drag.setTarget({ id, placement: 'inside' }) }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) drag.setTarget(null) }}
    onDrop={event => { const idToMove = source(); if (idToMove) { event.stopPropagation(); event.preventDefault(); drag.onGroupDrop!(idToMove, id) } drag.finish() }}>
    {children}
  </div>
}
