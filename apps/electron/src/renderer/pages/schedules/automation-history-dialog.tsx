/*
 * [OUTPUT]: 2026-11-27 记录行可定位原会话，独立入口保留运行详情。
 * [INPUT]: Fixed occurrence identity, current snapshot and existing history/detail readers.
 * [OUTPUT]: Resizable history dialog with manager titles, fixed inset controls and an edge-to-edge scrolling sidebar; hidden readers stop.
 * [POS]: Schedule execution history presentation; no scheduling or execution mutations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useContext, useEffect, useState } from 'react'
import type { Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Clock, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { AutomationHistory } from './automation-history-list'
import { AutomationOccurrenceView } from './automation-history'
import { ScheduleNavigationContext } from './owner-automations'

export function AutomationHistoryDialog({ api, snapshot, active, initialId, attentionOnly, onClose, onNavigateMessage, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; initialId?: string; attentionOnly?: boolean
  onClose(): void; onNavigateMessage: ExecutionMessageNavigation; onConversation?(id: string, messageId?: string): void
}) {
  const [selected, setSelected] = useState(initialId)
  useEffect(() => { setSelected(initialId) }, [initialId])
  const openTask = useContext(ScheduleNavigationContext)
  useEffect(() => { if (active) return api.subscribe(event => { if (event.type === 'automation:history-deleted' && event.occurrenceId === selected) setSelected(undefined) }) }, [api, active, selected])
  return <Dialog open={active} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="contact-manager schedule-manager" aria-label="执行记录" style={{ display: 'flex', gap: 0, width: 'var(--contact-manager-width)', maxWidth: 'none', height: 'var(--contact-manager-height)', padding: 0, overflow: 'hidden' }} showCloseButton={false}>
      <DialogDescription className="sr-only">选择执行记录定位对应会话，或打开运行详情。</DialogDescription>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
      <ResizablePanel defaultSize="190px" minSize="180px" maxSize="45%">
      <aside className="contact-manager-sidebar flex h-full min-w-0 flex-col overflow-hidden p-0" style={{ width: '100%' }} aria-label="执行记录列表">
        <div className="shrink-0 px-[12px] pt-[22px]"><div className="contact-manager-sidebar-heading"><Clock /><span>执行记录</span></div></div>
        <AutomationHistory api={api} active={active} attentionOnly={attentionOnly} selectedId={selected} conversations={snapshot.conversations} onConversation={onConversation} onOccurrence={setSelected} grouped />
      </aside>
      </ResizablePanel>
      <ResizableHandle className="resize-handle bg-transparent hover:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring" aria-label="调整执行记录列表宽度" />
      <ResizablePanel minSize="55%">
      <section className="contact-manager-main h-full min-w-0">
        <header className="contact-manager-header"><DialogTitle>运行详情</DialogTitle><Button variant="ghost" size="icon-sm" aria-label="关闭执行记录" onClick={onClose}><X /></Button></header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <ScheduleNavigationContext.Provider value={id => { onClose(); openTask(id) }}>
            {selected ? <AutomationOccurrenceView key={selected} api={api} id={selected} active={active} snapshot={snapshot} onNavigateMessage={onNavigateMessage} /> : <p className="m-auto text-sm text-muted-foreground">选择一条执行记录</p>}
          </ScheduleNavigationContext.Provider>
        </div>
      </section>
      </ResizablePanel>
      </ResizablePanelGroup>
    </DialogContent>
  </Dialog>
}
