/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [INPUT]: 当前有界消息页、真实执行与渠道投递回执。
 * [OUTPUT]: 隐藏停读的批量回执读取；执行摘要和送达状态分开，固定发布文件可预览。
 * [POS]: 渠道镜像消息的轻量状态与动作。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { useEffect, useState } from 'react'
import type { ConversationDetail, Message } from '@shared/domain'
import type { ChannelArtifactReference, ChannelDelivery } from '@shared/domain/channels'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronRight, MoreHorizontal } from '@/components/icons'

export function useChannelDeliveries(api: DesktopApi, conversationId: string, messages: Message[], active: boolean) {
  const ids = JSON.stringify(messages.filter(message => message.senderType === 'agent').map(message => message.id).slice(-80))
  const [state, setState] = useState<{ conversationId: string; items: ChannelDelivery[] }>({ conversationId, items: [] })
  useEffect(() => {
    if (!active) return
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      const token = ++sequence
      try {
        const items = await api.request('listChannelMessageDeliveries', { conversationId, messageIds: JSON.parse(ids) as string[] })
        if (!disposed && token === sequence) setState({ conversationId, items })
      } catch { if (!disposed && token === sequence) setState({ conversationId, items: [] }) }
    }
    void read()
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' && event.conversationId === conversationId) { sequence++; setState({ conversationId, items: [] }) }
      if (event.type === 'changed' && !timer) timer = setTimeout(() => { timer = undefined; void read() }, 150)
    })
    return () => { disposed = true; clearTimeout(timer); unsubscribe() }
  }, [api, conversationId, ids, active])
  return state.conversationId === conversationId ? state.items : []
}
const deliveryLabels = { sending: '正在发送到渠道', sent: '已送达渠道', failed: '未送达渠道', unknown: '送达结果待核对' }
export function ChannelMessageStatus({ deliveries, message, runs, work, onTrace, onDiscuss, onPublish, onArtifact }: {
  deliveries: ChannelDelivery[]; message: Message; runs: ConversationDetail['runs']; work?: NonNullable<ConversationDetail['workItems']>[number]
  onTrace(): void; onDiscuss(): void; onPublish?(): void; onArtifact(ref: ChannelArtifactReference): void
}) {
  const receipts = deliveries.filter(item => item.messageId === message.id)
  const running = runs.some(run => ['running', 'queued', 'waiting_approval'].includes(run.status))
  const failed = runs.some(run => ['failed', 'interrupted', 'cancelled'].includes(run.status))
  const execution = work?.status === 'delivered' ? '处理已完成' : work && ['failed', 'cancelled', 'interrupted'].includes(work.status) ? '处理未完成' : work && ['running', 'ready'].includes(work.status) ? '正在处理' : work?.status === 'waiting' || work?.status === 'blocked' ? '等待补充或审批' : running ? '正在处理' : failed ? '处理未完成' : runs.length ? '处理已结束' : '已接收'
  return <div className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground" aria-label="渠道消息状态">
    {message.channel && <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="xs" className="text-muted-foreground" aria-label="查看执行过程" onClick={onTrace}>{execution}<ChevronRight /></Button><Button variant="ghost" size="xs" onClick={onDiscuss}>内部讨论</Button>{onPublish && <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="渠道消息操作" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onPublish}>发送到渠道…</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>}
    {message.senderType === 'agent' && message.status === 'completed' && <span role="status">{receipts.length ? receipts.map(item => deliveryLabels[item.status]).join(' · ') : '尚无渠道发送回执'}</span>}
    {receipts.filter(item => item.detail && item.status !== 'sent').map(item => <span key={item.id}>{item.detail}</span>)}
    {message.channelPublication?.artifacts.map(ref => <Button key={ref.id} size="sm" variant="secondary" className="self-start" onClick={() => onArtifact(ref)}>{ref.name}</Button>)}
  </div>
}
