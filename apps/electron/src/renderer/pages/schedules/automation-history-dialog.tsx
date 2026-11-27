/*
 * [OUTPUT]: 2026-11-27 全局执行记录改为单列；直接指向某次运行的通知仍可打开对应详情。
 * [OUTPUT]: 2026-11-27 记录行可定位原会话，独立入口保留运行详情。
 * [INPUT]: Fixed occurrence identity, current snapshot and existing history/detail readers.
 * [OUTPUT]: History list or a directly addressed occurrence; hidden readers stop.
 * [POS]: Schedule execution history presentation; no scheduling or execution mutations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useContext, useEffect, useState } from 'react'
import type { Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
    <DialogContent className="contact-manager flex flex-col gap-0 overflow-hidden p-0" aria-label="执行记录"
      style={{ width: selected ? 'var(--contact-manager-width)' : 'min(440px, calc(100vw - 48px))', maxWidth: 'none', height: 'var(--contact-manager-height)' }} showCloseButton={false}>
      <header className="contact-manager-header"><DialogTitle>{selected ? '运行详情' : '执行记录'}</DialogTitle><Button variant="ghost" size="icon-sm" aria-label="关闭执行记录" onClick={onClose}><X /></Button></header>
      <DialogDescription className="sr-only">{selected ? '本次定时运行的信息。' : '浏览执行记录并定位对应会话。'}</DialogDescription>
      {selected ? <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <ScheduleNavigationContext.Provider value={id => { onClose(); openTask(id) }}>
          <AutomationOccurrenceView key={selected} api={api} id={selected} active={active} snapshot={snapshot} onNavigateMessage={onNavigateMessage} />
        </ScheduleNavigationContext.Provider>
      </div> : <AutomationHistory api={api} active={active} attentionOnly={attentionOnly} conversations={snapshot.conversations} onConversation={onConversation} grouped />}
    </DialogContent>
  </Dialog>
}
