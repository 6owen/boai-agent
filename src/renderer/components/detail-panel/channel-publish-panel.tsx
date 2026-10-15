/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [INPUT]: 固定渠道来源、可选内部答复/固定文件与真实宿主回执。
 * [OUTPUT]: 同容器内显式发送、持久冻结请求、未知只读核对；不调用员工或自动重发。
 * [POS]: 渠道人工发布表单。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Message, Snapshot } from '@shared/domain'
import { CHANNEL_NAMES, type ChannelPublishInput } from '@shared/domain/channels'
import type { ConversationMessageCursor } from '@shared/domain/reading'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChannelDeliveries } from '@/pages/conversations/-components/channel-message-status'
import type { DetailTarget } from './tabs-state'

const fixedFile = z.object({ id: z.string(), conversationId: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), name: z.string() }).strict()
const draftSchema = z.object({ content: z.string().max(12000), sourceMessageId: z.string(), artifact: fixedFile.optional(), requestId: z.string().optional(), messageId: z.string().optional(), status: z.enum(['draft', 'unknown', 'not_accepted', 'accepted']) }).strict()
type Draft = z.infer<typeof draftSchema>
const storageKey = (id: string) => 'boai:channel-publication:v1:' + id
export function channelPublicationMatches(input: ChannelPublishInput, message: Message) {
  const publication = message.channelPublication
  return message.conversationId === input.conversationId && message.senderType === 'agent' && message.status === 'completed' && message.content === input.content && publication?.actor === 'user' && publication.sourceMessageId === input.sourceMessageId && publication.artifacts.length === input.artifacts.length && input.artifacts.every((ref, index) => { const actual = publication.artifacts[index]; return actual?.id === ref.id && actual.conversationId === ref.conversationId && actual.contentHash === ref.contentHash })
}
export function ChannelPublishPanel({ api, snapshot, target, active }: { api: DesktopApi; snapshot: Snapshot; target: Extract<DetailTarget, { type: 'channel-publish' }>; active: boolean }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [unavailable, setUnavailable] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => {
    try { const stored = localStorage.getItem(storageKey(target.id)); if (stored) { const restored = draftSchema.parse(JSON.parse(stored)); if (restored.status === 'draft') return { ...restored, sourceMessageId: target.sourceMessageId ?? restored.sourceMessageId, content: restored.content || target.content || '', artifact: target.artifact ?? restored.artifact }; if (restored.status !== 'accepted') return { ...restored, status: 'unknown' } } } catch { /* Report unreadable storage below before submitting. */ }
    return { content: target.content ?? '', sourceMessageId: target.sourceMessageId ?? '', artifact: target.artifact, status: 'draft' }
  })
  const [sources, setSources] = useState<Message[]>([]), [before, setBefore] = useState<ConversationMessageCursor>(), [loading, setLoading] = useState(false)
  const mounted = useRef(true), epoch = useRef(0)
  const room = snapshot.conversations.find(room => room.id === target.id)
  const employee = snapshot.agents.find(agent => agent.id === room?.agentIds[0])
  const frozen = draft.status !== 'draft'
  const persist = (next: Draft) => { localStorage.setItem(storageKey(target.id), JSON.stringify(next)); setDraft(next) }
  const edit = (patch: Partial<Draft>) => { try { persist({ ...draft, ...patch }) } catch { setError('草稿无法保存，暂不能发送。') } }
  useEffect(() => {
    mounted.current = true
    try { const stored = localStorage.getItem(storageKey(target.id)); if (stored) draftSchema.parse(JSON.parse(stored)) } catch { setUnavailable(true); setError('原发送记录无法读取，请保留记录核对。') }
    return () => { mounted.current = false; epoch.current++ }
  }, [target.id])
  const read = async (cursor?: ConversationMessageCursor) => {
    if (loading || !active || unavailable) return
    const token = epoch.current; setLoading(true)
    try {
      const page = (await api.request('getConversationView', { conversationId: target.id, limit: 80, before: cursor })).messagePage
      if (!mounted.current || token !== epoch.current) return
      setSources(previous => [...new Map([...(cursor ? previous : []), ...page.items.flatMap(item => item.message?.channel ? [item.message] : [])].map(message => [message.id, message])).values()]); setBefore(page.beforeCursor)
      if (draft.sourceMessageId && !cursor && !page.items.some(item => item.messageId === draft.sourceMessageId)) {
        const selected = await api.request('getConversationView', { conversationId: target.id, aroundMessageId: draft.sourceMessageId, limit: 1 })
        if (mounted.current && token === epoch.current) setSources(previous => [...new Map([...previous, ...selected.messages.filter(message => message.id === draft.sourceMessageId && message.channel)].map(message => [message.id, message])).values()])
      }
    } catch (failure) { if (mounted.current && token === epoch.current) setError(errorText(failure)) }
    finally { if (mounted.current && token === epoch.current) setLoading(false) }
  }
  useEffect(() => { if (active) void read() }, [api, target.id, active])
  useEffect(() => api.subscribe(event => {
    if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === target.id) { epoch.current++; setUnavailable(true); setSources([]); setError('原渠道会话已清理，不能继续发送。'); try { localStorage.removeItem(storageKey(target.id)) } catch { /* Keep source blocked. */ } }
  }), [api, target.id])
  const receiptMessage = draft.messageId ? [{ id: draft.messageId, senderType: 'agent' } as Message] : []
  const deliveries = useChannelDeliveries(api, target.id, receiptMessage, active)
  const submit = async (check: boolean) => {
    if (busy || unavailable || !draft.sourceMessageId || !draft.content.trim() && !draft.artifact) return
    const requestId = draft.requestId ?? crypto.randomUUID()
    const input: ChannelPublishInput = { conversationId: target.id, sourceMessageId: draft.sourceMessageId, content: draft.content.trim(), artifacts: draft.artifact ? [{ id: draft.artifact.id, conversationId: draft.artifact.conversationId, contentHash: draft.artifact.contentHash }] : [], requestId }
    const token = epoch.current, current = () => mounted.current && token === epoch.current
    setBusy(true); setError('')
    try {
      if (check) {
        const message = await api.request('getMessageReceipt', { requestId })
        if (!current()) return
        if (!message) { persist({ ...draft, requestId, status: 'not_accepted' }); return }
        if (!channelPublicationMatches(input, message)) throw new Error('原发送回执与冻结请求不一致，请保留记录核对。')
        persist({ ...draft, requestId, status: 'accepted', messageId: message.id }); return
      }
      persist({ ...draft, requestId, status: 'unknown' })
      const message = await api.request('publishChannelMessage', input)
      if (!current()) return
      if (!channelPublicationMatches(input, message)) throw new Error('发送回执与原请求不一致。')
      persist({ ...draft, requestId, status: 'accepted', messageId: message.id })
    } catch (failure) { if (current()) setError(errorText(failure)) }
    finally { if (current()) setBusy(false) }
  }
  const source = sources.find(message => message.id === draft.sourceMessageId)
  const status = deliveries.find(item => item.messageId === draft.messageId)
  const labels = { sending: '正在发送到渠道', sent: '已送达渠道', failed: '未送达渠道', unknown: '送达结果待核对，请到原平台确认。' }
  return <ScrollArea className="h-full" viewportProps={{ className: 'scroll-fade-t scroll-fade-6' }}><div className="flex flex-col gap-4 p-6" aria-label="发送到渠道">
    <p className="text-sm text-muted-foreground">以{employee?.name ?? '该员工'}的机器人身份发送到{room?.channel ? CHANNEL_NAMES[room.channel.platform] : '原渠道'}，回复所选原消息。</p>
    {error && <Banner>{error}</Banner>}
    <SelectField aria-label="渠道回复目标" value={draft.sourceMessageId} onValueChange={sourceMessageId => edit({ sourceMessageId })} disabled={frozen || unavailable} options={[{ value: '', label: '选择要回复的渠道消息' }, ...sources.map(message => ({ value: message.id, label: `${message.senderName} · ${message.content.slice(0, 80) || '附件消息'}` }))]} />
    {before && !frozen && <Button variant="ghost" size="sm" disabled={loading} onClick={() => void read(before)}>载入更早的渠道消息</Button>}
    {source && <blockquote className="m-0 border-l-2 pl-3 text-sm text-muted-foreground">{source.senderName}：{source.content.slice(0, 500) || '附件消息'}</blockquote>}
    <Textarea aria-label="发送到渠道的内容" placeholder="填写准备发送的内容…" value={draft.content} maxLength={12000} disabled={frozen || unavailable} onChange={event => edit({ content: event.target.value })} />
    {draft.artifact && <div className="flex items-center gap-2 text-sm"><span>{draft.artifact.name} · 固定版本</span>{!frozen && <Button variant="ghost" size="sm" onClick={() => edit({ artifact: undefined })}>移除</Button>}</div>}
    <div className="flex flex-wrap items-center gap-2">
      {draft.status === 'draft' && <Button disabled={busy || unavailable || !source || !draft.content.trim() && !draft.artifact} onClick={() => void submit(false)}>发送到渠道</Button>}
      {draft.status === 'unknown' && <><span role="status">发送受理结果待核对</span><Button disabled={busy || unavailable} variant="secondary" onClick={() => void submit(true)}>核对原发送结果</Button></>}
      {draft.status === 'not_accepted' && <><span>原请求尚未受理</span><Button disabled={busy || unavailable} onClick={() => void submit(false)}>重试原发送</Button><Button variant="ghost" disabled={busy} onClick={() => edit({ requestId: undefined, status: 'draft' })}>返回编辑</Button></>}
      {draft.status === 'accepted' && <><span role="status">{status ? labels[status.status] : '已受理，尚无渠道发送回执'}</span><Button variant="ghost" onClick={() => edit({ content: '', artifact: undefined, requestId: undefined, messageId: undefined, status: 'draft' })}>准备另一条消息</Button></>}
    </div>
    {status?.detail && <p className="text-xs text-muted-foreground">{status.detail}</p>}
  </div></ScrollArea>
}
