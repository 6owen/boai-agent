/*
 * [OUTPUT]: 2026-10-10 消息卡支持外侧接收回执插槽，原工具条/表情/复制和引用语义保持。
 * [INPUT]: 公开消息、当前个人资料、共享表情目录、真实引用/Trace 回调、桌面请求封装与 Sonner 错误反馈。
 * [OUTPUT]: 复制/表情失败使用 Sonner，已知剪贴板权限错误使用简短中文，未知错误保留真实信息，复制标记仅在本次写入成功后显示；本人操作与表情回应统一显示当前配置名称，不重写历史名称；共用 Soft Card 边缘的消息/工具条、实测宽度定位、保持焦点和亮度的持久表情操作及本机常用偏好；表情浮层开关不控制工具条显示。
 * [POS]: 单聊与群聊共用的消息交互；不改变模型上下文、轮次或工作状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defaultUserProfile, messageDisplayName, type LocalUserProfile } from '@shared/domain/profile'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Message } from '@shared/domain'
import { reactionEmojis, type ReactionEmoji } from '@shared/domain/message-reactions'
import { Check, Copy, Reply, ThumbsUp, Workflow } from '@/components/icons'
import { useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { getDesktopClient } from '@/services/request/desktop-client'

const REACTION_USAGE_KEY = 'boai.message-reaction-usage'
const TOOLBAR_GAP = 8
const LONG_MESSAGE_WIDTH = 480
const LONG_MESSAGE_RATIO = 0.7
function reactionUsage(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(REACTION_USAGE_KEY) ?? '{}')
    return Object.fromEntries(reactionEmojis.map(([emoji]) => [emoji, Number.isSafeInteger(value?.[emoji]) && value[emoji] > 0 ? value[emoji] : 0]))
  } catch { return {} }
}
function rememberReaction(emoji: ReactionEmoji) {
  try { const usage = reactionUsage(); usage[emoji] = Math.min((usage[emoji] ?? 0) + 1, 1_000_000); localStorage.setItem(REACTION_USAGE_KEY, JSON.stringify(usage)) } catch { /* Optional local presentation preference. */ }
}

export function MessageCard({ message, profile = defaultUserProfile, children, receipt, onReply, onTrace }: { message: Message; profile?: Pick<LocalUserProfile, 'displayName'>; children: ReactNode; receipt?: ReactNode; onReply(): void; onTrace(): void }) {
  const sender = messageDisplayName(message, profile)
  const space = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), toolbar = useRef<HTMLDivElement>(null)
  const reactionTrigger = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<'beside' | 'corner'>('corner')
  const [open, setOpen] = useState(false), [usage, setUsage] = useState<Record<string, number>>({}), [copied, setCopied] = useState(false)
  const { busy, run } = useMutation({ errorFeedback: 'toast' })
  useLayoutEffect(() => {
    const measure = () => {
      const available = space.current?.clientWidth ?? 0, width = content.current?.offsetWidth ?? 0, tools = toolbar.current?.offsetWidth ?? 0
      if (available) setPlacement(width > Math.min(LONG_MESSAGE_WIDTH, available * LONG_MESSAGE_RATIO) || width + tools + TOOLBAR_GAP > available ? 'corner' : 'beside')
    }
    const observer = new ResizeObserver(measure)
    for (const element of [space.current, content.current, toolbar.current]) if (element) observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])
  const reactions = message.reactions ?? []
  const groups = reactionEmojis.flatMap(([emoji, label]) => {
    const people = reactions.filter(item => item.emoji === emoji)
    return people.length ? [{ emoji, label, names: people.map(person => person.senderId === 'user' ? profile.displayName : person.senderName).join('、'), selected: people.some(person => person.senderId === 'user') }] : []
  })
  const frequent = [...reactionEmojis].filter(([emoji]) => usage[emoji] > 0).sort((a, b) => usage[b[0]] - usage[a[0]]).slice(0, 9)
  const react = (emoji: ReactionEmoji) => void run(async () => {
    const active = !reactions.some(item => item.emoji === emoji && item.senderId === 'user')
    const focused = document.activeElement
    await getDesktopClient()!.request('setMessageReaction', { conversationId: message.conversationId, messageId: message.id, emoji, active })
    if (active) rememberReaction(emoji)
    // A removed pill must not drop keyboard focus onto the page or scroll the chat.
    if (!active && !open && focused === document.activeElement && focused?.classList.contains('message-reaction')) reactionTrigger.current?.focus({ preventScroll: true })
    setOpen(false)
  })
  const copy = () => void run(async () => {
    setCopied(false)
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('复制失败：当前无法使用剪贴板。')
    try { await navigator.clipboard.writeText(message.content) }
    catch (failure) {
      if ((failure instanceof DOMException || failure instanceof Error) && failure.name === 'NotAllowedError') throw new Error('复制失败：未获得剪贴板权限。')
      throw failure
    }
    setCopied(true)
  })
  const pick = ([emoji, label]: typeof reactionEmojis[number]) => <Button key={emoji} variant="ghost" size="icon" className="reaction-choice" aria-label={`回应：${label}`} title={label} aria-pressed={reactions.some(item => item.emoji === emoji && item.senderId === 'user')} disabled={busy} focusableWhenDisabled onClick={() => react(emoji)}><span className="reaction-emoji" aria-hidden="true">{emoji}</span></Button>
  return <div className="message-content-space" ref={space}>
    <div className="message-content" ref={content} data-toolbar-placement={placement}>
      <div className="message-card soft-card">
        {children}
        {!!groups.length && <div className="message-reactions" aria-label="消息表情回应" aria-busy={busy}>{groups.map(({ emoji, label, names, selected }) => <Button variant="ghost" size="content" className="message-reaction" key={emoji} aria-label={`${selected ? '取消' : '添加'}${label}回应，${names}`} aria-pressed={selected} disabled={busy} focusableWhenDisabled onClick={() => react(emoji)}><span className="reaction-emoji" aria-hidden="true">{emoji}</span><span className="reaction-people">{names}</span></Button>)}</div>}
      </div>
      {receipt}
      <div className="message-tools soft-card" ref={toolbar} role="toolbar" aria-label={`${sender} 的消息操作`}>
        <Popover open={open} onOpenChange={value => { setOpen(value); if (value) setUsage(reactionUsage()) }}>
          <PopoverTrigger render={<Button ref={reactionTrigger} variant="ghost" size="icon-sm" className="reaction-action" aria-label={`回应 ${sender} 的消息`} title="表情回应" disabled={message.status === 'streaming'} />}><ThumbsUp /></PopoverTrigger>
          <PopoverContent side="top" align={message.senderType === 'user' ? 'end' : 'start'} className="message-emoji-picker" aria-busy={busy} style={{ width: 360, maxWidth: 'calc(100vw - 24px)', padding: 0, gap: 0 }}>
            <PopoverTitle>默认表情</PopoverTitle>
            <div className="reaction-grid">{reactionEmojis.map(pick)}</div>
            {!!frequent.length && <section className="reaction-frequent"><h4>最常使用</h4><div className="reaction-grid">{frequent.map(pick)}</div></section>}
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${sender} 的消息`} title="引用回复" onClick={onReply}><Reply /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`复制 ${sender} 的消息`} title={copied ? '已复制' : '复制消息'} onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
        {message.senderType === 'agent' && <Button variant="ghost" size="icon-sm" className="trace-action" aria-label={`查看 ${sender} 的执行过程`} title="查看执行过程" onClick={onTrace}><Workflow /></Button>}
      </div>
    </div>
  </div>
}
