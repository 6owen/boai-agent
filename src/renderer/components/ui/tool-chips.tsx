/*
 * [INPUT]: Beautiful UI Tool Chips布局（https://www.beautifului.dev/r/tool-chips.json）、BOAI基础组件和调用方状态。
 * [OUTPUT]: 共享紧凑工具组/工具标签/展开详情；24px工具行、12px次级色常规标签与11px详情，使用当前主题和Iconify，展开受控。
 * [POS]: 全局展示组件；不引入registry演示数据、计时器或执行/读取逻辑。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { ComponentType, ReactNode, Ref } from 'react'
import { cn } from 'cn'
import { ChevronRight, Terminal } from '@/components/icons'
import { Badge } from './badge'
import { Button } from './button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'

type DisclosureProps = { open: boolean; onOpenChange(open: boolean): void; children: ReactNode }

export function ToolChips({ title, children, ...props }: DisclosureProps & { title: string }) {
  return <Collapsible className="min-w-0" {...props}>
    <CollapsibleTrigger render={<Button variant="ghost" size="content" className="flex w-fit max-w-full min-w-0 items-center gap-1.5 px-1 py-1 text-[12px] leading-5 text-muted-foreground" />} title={title}>
      <ChevronRight className="size-3 shrink-0" /><span className="min-w-0 truncate font-normal">{title}</span>
    </CollapsibleTrigger>
    <CollapsibleContent><div data-slot="tool-chips" className="mt-1 flex min-w-0 flex-col">{children}</div></CollapsibleContent>
  </Collapsible>
}

export function ToolChip({ title, label, chip, mono = false, icon: Icon = Terminal, status, triggerRef, open, onOpenChange, children }: DisclosureProps & {
  title: string
  label?: string
  chip: string
  mono?: boolean
  icon?: ComponentType<{ className?: string }>
  status?: ReactNode
  triggerRef?: Ref<HTMLButtonElement>
}) {
  return <Collapsible className="min-w-0" open={open} onOpenChange={onOpenChange}>
    <CollapsibleTrigger ref={triggerRef} render={<Button variant="ghost" size="content" className="group/tool-chip flex h-[24px] min-w-0 items-center gap-2 px-1 text-left text-[12px] font-normal leading-5 text-muted-foreground" />} aria-label={title} title={title}>
      <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className={cn('size-3.5 transition-opacity group-hover/tool-chip:opacity-0 group-focus-visible/tool-chip:opacity-0', open && 'opacity-0')} />
        <ChevronRight className={cn('absolute size-3 transition-[opacity,transform] group-hover/tool-chip:opacity-100 group-focus-visible/tool-chip:opacity-100', open ? 'rotate-90 opacity-100' : 'opacity-0')} />
      </span>
      {label && <span className="max-w-24 shrink-0 truncate">{label}</span>}
      <Badge variant="secondary" className={cn('h-[22px] min-w-0 flex-1 shrink justify-start rounded-sm px-1.5 text-[12px] font-normal text-muted-foreground', mono && 'font-mono')}><span className="truncate">{chip}</span></Badge>
      {status}
    </CollapsibleTrigger>
    <CollapsibleContent><div data-slot="tool-chip-content" className="my-1 ml-3 flex min-w-0 flex-col gap-2 border-l border-border py-1 pl-3.5 pr-1 text-[11px] font-normal leading-relaxed text-muted-foreground">{children}</div></CollapsibleContent>
  </Collapsible>
}
