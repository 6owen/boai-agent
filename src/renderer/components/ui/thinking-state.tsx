/*
 * [INPUT]: Beautiful UI thinking-state.json（2026-10-16）与宿主真实思考内容/受控展开状态。
 * [OUTPUT]: 11px浅色常规思考标题、12px闪光与缩进轨迹；Base UI可访问折叠，无演示步骤/自动完成。
 * [POS]: 共享ThinkingState展示原语；上游 https://www.beautifului.dev/r/thinking-state.json。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'
import './execution-state.css'

export function ThinkingState({ open, onOpenChange, working = false, active = true, children }: {
  open: boolean; onOpenChange(open: boolean): void; working?: boolean; active?: boolean; children: ReactNode
}) {
  return <Collapsible data-slot="thinking-state" className="min-w-0" open={open} onOpenChange={onOpenChange}>
    <CollapsibleTrigger className="execution-thinking-trigger -mx-1.5 flex max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left" aria-label="思考过程" data-working={working && active}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-muted-foreground/70"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
      <span className="execution-state-label text-[11px] font-normal text-muted-foreground">{working ? '思考中' : '思考过程'}</span>
      <Icon name="ChevronDown" className={`size-3 shrink-0 text-muted-foreground/70 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </CollapsibleTrigger>
    <CollapsibleContent><div className="mt-1 ml-2 border-l border-border py-1 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div></CollapsibleContent>
  </Collapsible>
}
