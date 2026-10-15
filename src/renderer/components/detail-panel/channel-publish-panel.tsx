/*
 * [OUTPUT]: 明确收件人/引用与可搜索原消息，编辑区和发送栏同容器；按内容保留草稿并优先核对旧未决发送。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [INPUT]: 固定渠道来源、可选内部答复/固定文件与真实宿主回执。
 * [OUTPUT]: 同容器内显式发送、持久冻结请求、未知只读核对；不调用员工或自动重发。
 * [POS]: 渠道人工发布表单。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import type { Message, Snapshot } from '@shared/domain'
import { CHANNEL_NAMES, type ChannelPublishInput } from '@shared/domain/channels'
import { READING_LIMITS, type ConversationMessageCursor } from '@shared/domain/reading'
import type { DesktopApi } from '@shared/ipc'
import { Avatar, Banner, errorText, timeText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ArrowUp, ChevronDownIcon as ChevronDown, FileText, LoaderCircle, MessageCircle, X } from '@/components/icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChannelDeliveries } from '@/pages/conversations/-components/channel-message-status'
import type { DetailTarget } from './tabs-state'

const fixedFile = z.object({ id: z.string(), conversationId: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), name: z.string() }).strict()
const draftSchema = z.object({ entryKey: z.string().optional(), content: z.string().max(12000), sourceMessageId: z.string(), artifact: fixedFile.optional(), requestId: z.string().optional(), messageId: z.string().optional(), status: z.enum(['draft', 'unknown', 'not_accepted', 'accepted']) }).strict()
type Draft = z.infer<typeof draftSchema>
const storageKey = (id: string, entryKey?: string) => entryKey ? `boai:channel-publication:v2:${id}:${entryKey}` : 'boai:channel-publication:v1:' + id
export function channelPublicationMatches(input: ChannelPublishInput, message: Message) {
  const publication = message.channelPublication
  return message.conversationId === input.conversationId && message.senderType === 'agent' && message.status === 'completed' && message.content === input.content && publication?.actor === 'user' && publication.sourceMessageId === input.sourceMessageId && publication.artifacts.length === input.artifacts.length && input.artifacts.every((ref, index) => { const actual = publication.artifacts[index]; return actual?.id === ref.id && actual.conversationId === ref.conversationId && actual.contentHash === ref.contentHash })
}
export function ChannelPublishPanel({ api, snapshot, target, active, onBack }: { api: DesktopApi; snapshot: Snapshot; target: Extract<DetailTarget, { type: 'channel-publish' }>; active: boolean; onBack(): void }) {
  const entryKey = target.originMessageId ? `message-${target.originMessageId}` : target.artifact ? `file-${target.artifact.id}` : target.sourceMessageId ? `reply-${target.sourceMessageId}` : 'compose'
  const editorId = useId(), editor = useRef<HTMLTextAreaElement>(null), submitting = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [unavailable, setUnavailable] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const legacy = localStorage.getItem(storageKey(target.id)), pending = legacy ? draftSchema.parse(JSON.parse(legacy)) : undefined
      // A previously submitted request must be checked before another entry can send.
      if (pending && (pending.status === 'unknown' || pending.status === 'not_accepted')) return { ...pending, entryKey: pending.entryKey ?? entryKey, status: 'unknown' }
      const stored = localStorage.getItem(storageKey(target.id, entryKey))
      if (stored) { const restored = draftSchema.parse(JSON.parse(stored)); return { ...restored, entryKey, status: restored.status === 'not_accepted' ? 'unknown' : restored.status } }
      if (pending?.status === 'draft' && entryKey === 'compose') return { ...pending, entryKey }
    } catch { /* Block sending below when saved records cannot be read. */ }
    return { entryKey, content: target.content ?? '', sourceMessageId: target.sourceMessageId ?? '', artifact: target.artifact, status: 'draft' }
  })
  const [sources, setSources] = useState<Message[]>([]), [before, setBefore] = useState<ConversationMessageCursor>(), [loading, setLoading] = useState(false)
  const mounted = useRef(true), epoch = useRef(0)
  const room = snapshot.conversations.find(room => room.id === target.id)
  const employee = snapshot.agents.find(agent => agent.id === room?.agentIds[0])
  const frozen = draft.status !== 'draft'
  const persist = (next: Draft) => {
    localStorage.setItem(storageKey(target.id, next.entryKey ?? entryKey), JSON.stringify(next))
    const legacy = localStorage.getItem(storageKey(target.id)), pending = legacy ? draftSchema.parse(JSON.parse(legacy)) : undefined
    if (next.status === 'unknown' || next.status === 'not_accepted') localStorage.setItem(storageKey(target.id), JSON.stringify(next))
    else if (pending?.requestId && (pending.requestId === next.requestId || pending.requestId === draft.requestId)) localStorage.removeItem(storageKey(target.id))
    setDraft(next)
  }
  const edit = (patch: Partial<Draft>) => { try { persist({ ...draft, ...patch }); setError('') } catch { setError('草稿无法保存，暂不能发送。') } }
  useEffect(() => {
    mounted.current = true
    try { for (const key of [storageKey(target.id), storageKey(target.id, entryKey)]) { const stored = localStorage.getItem(key); if (stored) draftSchema.parse(JSON.parse(stored)) } } catch { setUnavailable(true); setError('原发送记录无法读取，请保留记录核对。') }
    return () => { mounted.current = false; epoch.current++ }
  }, [target.id])
  useEffect(() => { if (active && draft.status === 'draft' && !unavailable) editor.current?.focus() }, [active, target.requestId, draft.status, unavailable])
  const read = async (cursor?: ConversationMessageCursor) => {
    if (loading || !active || unavailable) return
    const token = epoch.current; setLoading(true)
    try {
      const page = (await api.request('getConversationView', { conversationId: target.id, limit: READING_LIMITS.maxPage, before: cursor })).messagePage
      if (!mounted.current || token !== epoch.current) return
      setSources(previous => [...new Map([...(cursor ? previous : []), ...page.items.flatMap(item => item.message?.channel ? [item.message] : [])].map(message => [message.id, message])).values()]); setBefore(page.items.length === READING_LIMITS.maxPage ? page.beforeCursor : undefined)
      if (draft.sourceMessageId && !cursor && !page.items.some(item => item.messageId === draft.sourceMessageId)) {
        const selected = await api.request('getConversationView', { conversationId: target.id, aroundMessageId: draft.sourceMessageId, limit: 1 })
        if (mounted.current && token === epoch.current) setSources(previous => [...new Map([...previous, ...selected.messages.filter(message => message.id === draft.sourceMessageId && message.channel)].map(message => [message.id, message])).values()])
      }
    } catch (failure) { if (mounted.current && token === epoch.current) setError(errorText(failure)) }
    finally { if (mounted.current && token === epoch.current) setLoading(false) }
  }
  useEffect(() => { if (active) void read() }, [api, target.id, active])
  useEffect(() => api.subscribe(event => {
    if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === target.id) { epoch.current++; setUnavailable(true); setSources([]); setError('原渠道会话已清理，不能继续发送。'); try { localStorage.removeItem(storageKey(target.id)); for (const key of Object.keys(localStorage)) if (key.startsWith(`boai:channel-publication:v2:${target.id}:`)) localStorage.removeItem(key) } catch { /* Keep source blocked. */ } }
  }), [api, target.id])
  const receiptMessage = draft.messageId ? [{ id: draft.messageId, senderType: 'agent' } as Message] : []
  const deliveries = useChannelDeliveries(api, target.id, receiptMessage, active)
  const submit = async (check: boolean) => {
    if (submitting.current || busy || !active || unavailable || !draft.sourceMessageId || !draft.content.trim() && !draft.artifact) return
    const requestId = draft.requestId ?? crypto.randomUUID()
    const input: ChannelPublishInput = { conversationId: target.id, sourceMessageId: draft.sourceMessageId, content: draft.content.trim(), artifacts: draft.artifact ? [{ id: draft.artifact.id, conversationId: draft.artifact.conversationId, contentHash: draft.artifact.contentHash }] : [], requestId }
    const token = epoch.current, current = () => mounted.current && token === epoch.current
    submitting.current = true; setBusy(true); setError('')
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
    finally { submitting.current = false; if (current()) setBusy(false) }
  }
  const source = sources.find(message => message.id === draft.sourceMessageId)
  const status = deliveries.find(item => item.messageId === draft.messageId)
  const labels = { sending: '正在发送…', sent: '已发送到渠道', failed: '未送达，请查看原因', unknown: '送达结果待核对' }
  const canSend = active && !busy && !unavailable && draft.status === 'draft' && !!source && (!!draft.content.trim() || !!draft.artifact)
  const chooseSource = (sourceMessageId: string) => { edit({ sourceMessageId }); setPickerOpen(false); editor.current?.focus() }
  return <form className="channel-publish-compose" aria-label="发送到渠道" onSubmit={event => { event.preventDefault(); if (canSend) void submit(false) }}>
    <div className="channel-publish-destination">
      <Avatar name={employee?.name ?? '员工'} seed={employee?.id} avatar={employee?.avatar} color={employee?.color} small />
      <div className="min-w-0 flex-1"><div className="truncate" title={room?.title}>发给 {room?.title ?? '原渠道'}</div><p className="m-0 text-xs text-muted-foreground">通过 {employee?.name ?? '该员工'} · {room?.channel ? CHANNEL_NAMES[room.channel.platform] : '机器人'}</p></div>
    </div>
    <div className="channel-publish-reply">
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">回复消息</span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger render={<Button type="button" size="xs" variant="ghost" disabled={frozen || unavailable} aria-label="选择回复消息" />}>{source ? '更换' : '选择消息'}<ChevronDown data-icon="inline-end" /></PopoverTrigger>
          <PopoverContent align="end" className="channel-publish-picker" finalFocus={editor}>
            <PopoverTitle className="sr-only">选择回复消息</PopoverTitle>
            <Command><CommandInput placeholder="搜索发送者或消息内容…" aria-label="搜索渠道消息" /><CommandList className="max-h-none overflow-hidden"><ScrollArea className="channel-publish-options">
              <CommandEmpty>{loading ? '正在读取消息…' : '没有匹配的已载入消息'}</CommandEmpty>
              <CommandGroup>{[...sources].sort((a, b) => b.sequence - a.sequence).map(message => <CommandItem key={message.id} value={message.id} keywords={[message.senderName, message.content]} onSelect={() => chooseSource(message.id)} data-checked={message.id === draft.sourceMessageId}>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="truncate">{message.senderName}</span><time className="shrink-0 text-xs text-muted-foreground" dateTime={message.createdAt}>{timeText(message.createdAt)}</time></div><p className="m-0 line-clamp-2 text-xs text-muted-foreground">{message.content || '附件消息'}</p></div>
              </CommandItem>)}</CommandGroup>
            </ScrollArea></CommandList></Command>
            {before && <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void read(before)}>{loading ? '正在载入…' : '载入更早消息'}</Button>}
          </PopoverContent>
        </Popover>
      </div>
      {source ? <blockquote className="channel-publish-quote"><div className="flex min-w-0 items-center gap-2"><span className="truncate">{source.senderName}</span><time className="text-xs text-muted-foreground" dateTime={source.createdAt}>{timeText(source.createdAt)}</time></div><p className="m-0 line-clamp-2 text-muted-foreground" title={source.content}>{source.content || '附件消息'}</p></blockquote> : <p className="m-0 text-sm text-muted-foreground">{loading ? '正在读取原消息…' : draft.sourceMessageId ? '原消息暂不可用，请重新选择。' : '选择这条内容要回复的消息。'}</p>}
    </div>
    <FieldGroup className="channel-publish-fields"><Field className="channel-publish-field"><FieldLabel htmlFor={editorId} className="sr-only">发送到渠道的内容</FieldLabel>
      <InputGroup variant="composer" className="channel-publish-editor">
        <InputGroupTextarea ref={editor} id={editorId} rows={8} placeholder={draft.artifact ? '为文件添加说明（可选）…' : '写下要发送的内容…'} value={draft.content} maxLength={12000} readOnly={frozen} disabled={unavailable} onChange={event => edit({ content: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend) void submit(false) } }} />
        <InputGroupAddon align="block-end" className="channel-publish-actions">
          {draft.artifact && <div className="channel-publish-file"><FileText /><span className="truncate" title={draft.artifact.name}>{draft.artifact.name}</span>{!frozen && <Button type="button" variant="ghost" size="icon-xs" aria-label="移除待发送文件" onClick={() => edit({ artifact: undefined })}><X /></Button>}</div>}
          <div className="flex w-full items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{frozen ? '已保留本次发送内容' : draft.content.length > 11000 ? `${draft.content.length} / 12000` : '⌘ / Ctrl + Enter 发送'}</span>
            {draft.status === 'draft' && <Button type="submit" size="sm" disabled={!canSend}>发送<ArrowUp data-icon="inline-end" /></Button>}
            {busy && <LoaderCircle className="spinner" aria-label="正在核对发送" />}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </Field></FieldGroup>
    <div className="channel-publish-feedback" aria-live="polite">
      {error && <Banner>{error}</Banner>}
      {draft.status === 'unknown' && <><p role="status">{busy ? '正在提交发送…' : '发送结果待核对，内容已保留。'}</p><Button type="button" disabled={busy || unavailable} variant="secondary" size="sm" onClick={() => void submit(true)}>核对发送结果</Button></>}
      {draft.status === 'not_accepted' && <><p role="status">尚未发送，可以继续编辑或重试。</p><div className="flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={busy || unavailable} onClick={() => edit({ requestId: undefined, status: 'draft' })}>继续编辑</Button><Button type="button" size="sm" disabled={busy || unavailable} onClick={() => void submit(false)}>重试发送</Button></div></>}
      {draft.status === 'accepted' && <><p role="status">{status ? labels[status.status] : '已受理，等待渠道回执…'}</p><div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={onBack}><MessageCircle data-icon="inline-start" />查看渠道</Button><Button type="button" variant="ghost" size="sm" onClick={() => edit({ content: '', artifact: undefined, requestId: undefined, messageId: undefined, status: 'draft' })}>再写一条</Button></div></>}
      {status?.detail && <p className="text-xs text-muted-foreground">{status.detail}</p>}
    </div>
  </form>
}
