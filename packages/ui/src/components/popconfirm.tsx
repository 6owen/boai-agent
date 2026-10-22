/*
 * [INPUT]: React、BOAI共享组件及调用方传入的展示状态。
 * [OUTPUT]: 可在桌面与独立站点共用的展示组件。
 * [POS]: @boai/ui，无业务服务或桌面依赖。
 * [PROTOCOL]: 修改时同步Header和所属目录.folder.md。
 */
import { useId, type ReactElement, type ReactNode } from 'react'
import { Button } from './button'
import { Popover, PopoverTrigger, PopoverContent } from './popover'

export interface PopconfirmProps {
  trigger: ReactElement; title: string; description?: ReactNode
  open: boolean; onOpenChange(open: boolean): void
  onConfirm(): void; pending?: boolean; destructive?: boolean
  confirmLabel?: string; cancelLabel?: string
}
export function Popconfirm({ trigger, title, description, open, onOpenChange, onConfirm, pending = false, destructive = false, confirmLabel = '确认', cancelLabel = '取消' }: PopconfirmProps) {
  const id = useId()
  return <Popover open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
    <PopoverTrigger render={trigger} />
    <PopoverContent aria-labelledby={id} aria-describedby={description ? `${id}-description` : undefined} className="w-72">
      <strong id={id}>{title}</strong>
      {description && <p id={`${id}-description`} className="text-muted-foreground">{description}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
        <Button variant={destructive ? 'destructive' : 'default'} size="sm" disabled={pending} onClick={onConfirm}>{pending ? '处理中…' : confirmLabel}</Button>
      </div>
    </PopoverContent>
  </Popover>
}
