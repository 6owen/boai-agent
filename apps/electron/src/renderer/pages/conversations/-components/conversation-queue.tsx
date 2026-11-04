/*
 * [INPUT]: Foreground conversation and original backend queue projection/actions.
 * [OUTPUT]: Composer-adjacent collapsible pending messages with send-now/remove controls.
 * [POS]: AI Elements Queue interaction composed with the existing shared shadcn/Base UI primitives.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ConversationQueueAction, ConversationQueueItem } from '@boai/shared/domain/message-queue'
import { ArrowUp, ChevronRight, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { errorText, showErrorToast } from '@/components/common'

export function ConversationQueue({ api, conversationId, active }: { api: DesktopApi; conversationId: string; active: boolean }) {
  const [items, setItems] = useState<ConversationQueueItem[]>([]), [revision, refresh] = useState(0), [busy, setBusy] = useState(false)
  const locked = useRef(false), requests = useRef(new Map<string, ConversationQueueAction>())
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void api.request('listConversationQueue', { conversationId }).then(result => { if (live) setItems(result.items) }).catch(error => { if (live) showErrorToast(errorText(error)) })
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId) && !timer) timer = setTimeout(() => refresh(value => value + 1), 80)
    })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, conversationId, active, revision])
  const act = async (item: ConversationQueueItem, action: ConversationQueueAction['action']) => {
    if (!active || locked.current) return
    locked.current = true; setBusy(true)
    const key = `${item.id}:${action}`
    let request = requests.current.get(key)
    if (!request) { request = { conversationId, id: item.id, expectedRevision: item.revision, action, requestId: crypto.randomUUID() }; requests.current.set(key, request) }
    try {
      await api.request('actOnConversationQueue', request)
      requests.current.delete(key)
      refresh(value => value + 1)
    } catch (error) { if (errorText(error).includes('消息已开始执行或队列已变化')) requests.current.delete(key); showErrorToast(errorText(error)); refresh(value => value + 1) }
    finally { locked.current = false; setBusy(false) }
  }
  if (!items.length) return null
  return <Collapsible defaultOpen className="mb-2 overflow-hidden rounded-xl border bg-background/80" aria-label="待发送消息队列">
    <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-3 text-muted-foreground" />}><ChevronRight size={14} /><span>排队消息</span><span className="tabular-nums">{items.length}</span></CollapsibleTrigger>
    <CollapsibleContent><ScrollArea className="max-h-40" viewportProps={{ className: 'max-h-40' }}><ul className="m-0 list-none space-y-1 px-2 pb-2">
      {items.map(item => <li key={item.id} data-queued-message-id={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="min-w-0 flex-1 text-sm"><p className="m-0 line-clamp-2 whitespace-pre-wrap break-words">{item.content || '附件消息'}</p>{item.attachmentCount > 0 && <span className="text-xs text-muted-foreground">{item.attachmentCount} 个附件</span>}</div>
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="立即发送" disabled={busy || !active} onClick={() => { void act(item, 'send-now') }}><ArrowUp /></Button>} /><TooltipContent>中断当前执行并发送此消息</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="移除排队消息" disabled={busy || !active} onClick={() => { void act(item, 'remove') }}><X /></Button>} /><TooltipContent>移除</TooltipContent></Tooltip>
      </li>)}
    </ul></ScrollArea></CollapsibleContent>
  </Collapsible>
}
