/*
 * [INPUT]: 左栏执行记录读取当前员工与会话快照。
 * [OUTPUT]: 左上角执行记录沿用可调整宽度的双栏 Dialog，左侧选记录，右侧展示时间、员工及会话入口。
 * [INPUT]: Fixed occurrence identity, current snapshot and existing history/detail readers.
 * [OUTPUT]: Resizable history dialog with manager titles, fixed inset controls and an edge-to-edge scrolling sidebar; hidden readers stop.
 * [POS]: Schedule execution history presentation; no scheduling or execution mutations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useState } from 'react'
import type { AutomationOccurrence, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Clock, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Banner, errorText, Loading } from '@/components/common'
import { AutomationHistory, automationRecordConversation, automationRecordEmployees } from './automation-history-list'

export function AutomationHistoryDialog({ api, snapshot, active, initialId, onClose, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; initialId?: string
  onClose(): void; onConversation(id: string, messageId?: string, navigated?: () => void): void
}) {
  const [selected, setSelected] = useState(initialId)
  useEffect(() => { setSelected(initialId) }, [initialId])
  useEffect(() => { if (active) return api.subscribe(event => { if (event.type === 'automation:history-deleted' && event.occurrenceId === selected) setSelected(undefined) }) }, [api, active, selected])
  return <Dialog open={active} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="contact-manager schedule-manager" aria-label="执行记录" style={{ display: 'flex', gap: 0, width: 'var(--contact-manager-width)', maxWidth: 'none', height: 'var(--contact-manager-height)', padding: 0, overflow: 'hidden' }} showCloseButton={false}>
      <DialogDescription className="sr-only">在左侧选择执行记录，在右侧查看触发时间和关联会话。</DialogDescription>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
        <ResizablePanel defaultSize="190px" minSize="180px" maxSize="45%">
          <aside className="contact-manager-sidebar flex h-full min-w-0 flex-col overflow-hidden p-0" style={{ width: '100%' }} aria-label="执行记录列表">
            <div className="shrink-0 px-[12px] pt-[22px]"><div className="contact-manager-sidebar-heading"><Clock /><span>执行记录</span></div></div>
            <AutomationHistory api={api} snapshot={snapshot} active={active} selectedId={selected} onOccurrence={setSelected} grouped />
          </aside>
        </ResizablePanel>
        <ResizableHandle className="resize-handle bg-transparent hover:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring" aria-label="调整执行记录列表宽度" />
        <ResizablePanel minSize="55%">
          <section className="contact-manager-main h-full min-w-0">
            <header className="contact-manager-header"><DialogTitle>运行详情</DialogTitle><Button variant="ghost" size="icon-sm" aria-label="关闭执行记录" onClick={onClose}><X /></Button></header>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              {selected
                ? <RecordDetail key={selected} api={api} id={selected} snapshot={snapshot} onOpen={(conversationId, messageId) => onConversation(conversationId, messageId, onClose)} />
                : <p className="m-auto text-sm text-muted-foreground">选择一条执行记录</p>}
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </DialogContent>
  </Dialog>
}


function RecordDetail({ api, id, snapshot, onOpen }: { api: DesktopApi; id: string; snapshot: Snapshot; onOpen(id: string, messageId?: string): void }) {
  const [record, setRecord] = useState<AutomationOccurrence>()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    api.request('getAutomationOccurrence', { id }).then(value => {
      if (live) setRecord(value)
    }).catch(cause => { if (live) setError(errorText(cause)) })
    return () => { live = false }
  }, [api, id])
  if (error) return <Banner>{error}</Banner>
  if (!record) return <Loading>正在读取执行记录…</Loading>
  const room = automationRecordConversation(record, snapshot.conversations)
  return <div className="flex flex-col items-start gap-3 p-4" data-occurrence-detail-id={id}>
    <dl className="m-0 flex flex-col gap-2 text-sm">
      <div><dt className="text-muted-foreground">触发时间</dt><dd className="m-0"><time dateTime={record.scheduledFor}>{new Date(record.scheduledFor).toLocaleString('zh-CN', { hour12: false })}</time></dd></div>
      <div><dt className="text-muted-foreground">执行员工</dt><dd className="m-0">{automationRecordEmployees(record, snapshot)}</dd></div>
    </dl>
    {room && <Button variant="secondary" size="sm" onClick={() => onOpen(room.id, record.messageId)}>打开会话</Button>}
  </div>
}
