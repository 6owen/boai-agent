/*
 * [INPUT]: Fixed occurrence identity, current snapshot and existing history/detail readers.
 * [OUTPUT]: Manager-style two-column history dialog; hidden readers stop and navigation closes the dialog.
 * [POS]: Schedule execution history presentation; no scheduling or execution mutations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useContext, useEffect, useState } from 'react'
import type { Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Clock, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { ExecutionMessageNavigation } from '@/components/detail-panel/execution-message-button'
import { AutomationHistory } from './automation-history-list'
import { AutomationOccurrenceView } from './automation-history'
import { ScheduleNavigationContext } from './owner-automations'

export function AutomationHistoryDialog({ api, snapshot, active, initialId, attentionOnly, onClose, onNavigateMessage }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; initialId?: string; attentionOnly?: boolean
  onClose(): void; onNavigateMessage: ExecutionMessageNavigation
}) {
  const [selected, setSelected] = useState(initialId)
  useEffect(() => { setSelected(initialId) }, [initialId])
  const openTask = useContext(ScheduleNavigationContext)
  useEffect(() => { if (active) return api.subscribe(event => { if (event.type === 'automation:history-deleted' && event.occurrenceId === selected) setSelected(undefined) }) }, [api, active, selected])
  return <Dialog open={active} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="contact-manager schedule-manager" aria-label="执行记录" style={{ display: 'flex', gap: 0, width: 'var(--contact-manager-width)', maxWidth: 'calc(100vw - 24px)', height: 'var(--contact-manager-height)', padding: 0, overflow: 'hidden' }} showCloseButton={false}>
      <DialogDescription className="sr-only">在左侧选择执行记录，在右侧查看本次运行信息。</DialogDescription>
      <aside className="contact-manager-sidebar" style={{ width: '42%', minWidth: 240, maxWidth: 420 }} aria-label="执行记录列表">
        <div className="contact-manager-sidebar-heading"><Clock /><DialogTitle>执行记录</DialogTitle></div>
        <AutomationHistory api={api} active={active} attentionOnly={attentionOnly} selectedId={selected} onOccurrence={setSelected} grouped />
      </aside>
      <section className="contact-manager-main min-w-0">
        <header className="contact-manager-header"><h2 className="m-0 text-base">运行详情</h2><Button className="ml-auto" variant="ghost" size="icon-sm" aria-label="关闭执行记录" onClick={onClose}><X /></Button></header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <ScheduleNavigationContext.Provider value={id => { onClose(); openTask(id) }}>
            {selected ? <AutomationOccurrenceView key={selected} api={api} id={selected} active={active} snapshot={snapshot} onNavigateMessage={onNavigateMessage} /> : <p className="m-auto text-sm text-muted-foreground">选择一条执行记录</p>}
          </ScheduleNavigationContext.Provider>
        </div>
      </section>
    </DialogContent>
  </Dialog>
}
