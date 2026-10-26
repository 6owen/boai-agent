/*
 * [OUTPUT]: 共享聊天发送可回到渠道最新窗口，清除旧定位/分页；迟到响应不能覆盖后续手动阅读位置。
 * [OUTPUT]: 共享ChatView允许主列表历史加载中保持固定布局，渠道ChatWindow仍显式要求真实ConversationView。
 * [OUTPUT]: 渠道列表Popover省略重复标题，清除外层padding/gap以统一紧凑8px内边距。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 同一有界阅读生命周期用于渠道镜像与独立内部讨论，后者不显示渠道列表或嵌套入口。
 * [OUTPUT]: 未选渠道/不可用复用IllustratedEmpty和会话标题布局，ScrollArea正文保留标题渐隐；列表入口始终可用。
 * [OUTPUT]: 渠道聊天占满右侧，列表位于标题按钮Popover；选择关闭、搜索/折叠状态保留，隐藏渠道详情时停止阅读。
 * [INPUT]: 员工渠道标签的固定会话/消息目标、快照及共用列表/聊天渲染回调。
 * [OUTPUT]: 右侧渠道列表与聊天独立选中/滚动/有界阅读；隐藏停读，迟到响应与清理隔离，不改主聊天路由或复制发送逻辑。
 * [POS]: 员工渠道详情标签的阅读生命周期，业务操作仍由AppShell共用入口处理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DigitalAgent, Message } from '@boai/shared/domain'
import { isChannelConversation } from '@boai/shared/domain/conversation-list'
import { READING_LIMITS, type ConversationView } from '@boai/shared/domain/reading'
import { mergeMessagePages, mergeReadingState, updateLiveMessage } from '@/pages/conversations/reading-state'
import { ConversationList } from '@/pages/conversations/-components/conversation-list'
import { ChatView } from '@/pages/conversations/-components/chat-view'
import { Banner, errorText, Loading } from '@/components/common'
import type { DetailTarget } from './tabs-state'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { ConversationHeaderLayout } from '@/pages/conversations/-components/conversation-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { List } from '@/components/icons'

type ChatProps = ComponentProps<typeof ChatView>
export type ChannelChatWindow = Pick<ChatProps, 'detail' | 'onReading' | 'onLocation' | 'onPage' | 'onLatest' | 'paging' | 'pageEdges' | 'restoreAnchor' | 'scrollPosition' | 'onScrollPosition' | 'pageActive' | 'focusMessage' | 'focusApproval'> & { detail: ConversationView }
type Location = { initialized: boolean; messageId?: string; offset?: number; focusRequestId?: string; scrollPosition?: number }
export function ChannelsTab({ api, agent, target, active, chatActive, listProps, renderChat, onMaterials, internal = false }: {
  internal?: boolean
  api: DesktopApi; agent: DigitalAgent; target: Extract<DetailTarget, { type: 'channels' }>; active: boolean; chatActive: boolean
  listProps: ComponentProps<typeof ConversationList>
  renderChat(window: ChannelChatWindow, headerActions: ReactNode): ReactNode
  onMaterials: (id: string, materials: NonNullable<ConversationView['materials']>) => void
}) {
  const id = target.conversationId
  const available = listProps.snapshot.conversations.some(room => room.id === id && (internal ? room.purpose === 'channel-internal' : isChannelConversation(room)) && !room.list?.hidden && room.agentIds.includes(agent.id))
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => { setPickerOpen(false) }, [active, target.requestId])
  const [detail, setDetail] = useState<ConversationView | null>(null), [error, setError] = useState('')
  const [paging, setPaging] = useState(false), [pageEdges, setPageEdges] = useState({ before: true, after: true })
  const locations = useRef(new Map<string, Location>()), request = useRef(0), flight = useRef(0)
  const detailRef = useRef(detail); detailRef.current = detail
  const state = useRef({ id, active, chatActive, available, target, onMaterials }); state.current = { id, active, chatActive, available, target, onMaterials }
  const incoming = useRef(new Map<string, { revision: number; message: Message }>()), revision = useRef(0)
  const location = () => id ? locations.current.get(id) : undefined
  const refresh = async (isCurrent: () => boolean = () => true) => {
    const currentState = state.current, conversationId = currentState.id
    if (!conversationId || !currentState.active || !currentState.available || !currentState.chatActive && detailRef.current?.conversation.id === conversationId) return
    const token = ++request.current, started = revision.current
    const valid = () => request.current === token && state.current.active && state.current.available && state.current.id === conversationId && isCurrent()
    try {
      let position = locations.current.get(conversationId) ?? { initialized: false }
      const focus = currentState.target.focusMessage
      if (focus && focus.requestId !== position.focusRequestId) position = { initialized: true, messageId: focus.id, focusRequestId: focus.requestId }
      if (!position.initialized) {
        const reading = await api.request('getConversationReading', { conversationId })
        if (!valid()) return
        position = { initialized: true, messageId: reading.anchor?.messageId, offset: reading.anchor?.offset }
      }
      locations.current.set(conversationId, position)
      const result = await api.request('getConversationView', { conversationId, limit: READING_LIMITS.maxPage, aroundMessageId: position.messageId })
      if (!valid()) return
      const anchor = locations.current.get(conversationId)?.messageId
      if (anchor && anchor !== position.messageId && !result.messagePage.items.some(item => item.messageId === anchor)) return
      let messagePage = result.messagePage
      for (const entry of incoming.current.values()) if (entry.revision > started) messagePage = updateLiveMessage(messagePage, entry.message, !position.messageId)
      const previous = detailRef.current
      setDetail({ ...result, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []), reading: previous?.conversation.id === conversationId ? mergeReadingState(previous.reading, result.reading) : result.reading })
      state.current.onMaterials(conversationId, result.materials ?? [])
      setError(''); setPageEdges({ before: true, after: true })
      return true
    } catch (reason) { if (valid()) { setDetail(null); setError(errorText(reason)) } }
  }
  const showLatest = async (isCurrent: () => boolean) => {
    if (!id || !active || !chatActive || !available || !isCurrent()) return false
    request.current++; flight.current = 0; setPaging(false)
    locations.current.set(id, { initialized: true, focusRequestId: target.focusMessage?.requestId })
    return Boolean(await refresh(isCurrent))
  }
  useEffect(() => {
    request.current++; flight.current = 0; setPaging(false); setError('')
    if (!available) setDetail(null)
    if (active) void refresh()
    return () => { request.current++ }
  }, [api, id, active, chatActive, available, target.requestId])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (!state.current.active || !state.current.chatActive || timer) return
      timer = setTimeout(() => { timer = undefined; if (!flight.current) void refresh() }, 100)
    }
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
        locations.current.delete(event.conversationId)
        for (const [key, entry] of incoming.current) if (entry.message.conversationId === event.conversationId) incoming.current.delete(key)
        if (event.conversationId === state.current.id) { request.current++; setDetail(null); schedule() }
      } else if (event.type === 'changed') schedule()
      else if (event.type === 'message' && state.current.active && state.current.chatActive && event.message.conversationId === state.current.id) {
        incoming.current.set(event.message.id, { revision: ++revision.current, message: event.message })
        if (incoming.current.size > READING_LIMITS.maxPage) incoming.current.delete(incoming.current.keys().next().value!)
        setDetail(previous => {
          if (!previous || previous.conversation.id !== event.message.conversationId) return previous
          const messagePage = updateLiveMessage(previous.messagePage, event.message, !locations.current.get(event.message.conversationId)?.messageId)
          return { ...previous, messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }
        })
        if (event.message.status !== 'streaming') schedule()
      }
    })
    return () => { unsubscribe(); if (timer) clearTimeout(timer) }
  }, [api])
  const loadPage = async (direction: 'before' | 'after') => {
    const previous = detailRef.current
    if (!active || !chatActive || !available || !id || flight.current || previous?.conversation.id !== id) return
    const cursor = direction === 'before' ? previous.messagePage.beforeCursor : previous.messagePage.afterCursor
    if (!cursor) return
    const token = ++request.current, started = revision.current; flight.current = token; setPaging(true)
    const valid = () => token === request.current && state.current.id === id && state.current.active && state.current.chatActive && state.current.available
    try {
      const next = await api.request('getConversationView', { conversationId: id, limit: READING_LIMITS.page, [direction]: cursor })
      if (!valid()) return
      if (!next.messagePage.items.length) { setPageEdges(value => ({ ...value, [direction]: false })); return }
      let messagePage = mergeMessagePages(previous.messagePage, next.messagePage, direction)
      for (const entry of incoming.current.values()) if (entry.revision > started) messagePage = updateLiveMessage(messagePage, entry.message, false)
      const anchor = locations.current.get(id)?.messageId
      if (anchor && !messagePage.items.some(item => item.messageId === anchor)) return
      setDetail({ ...next, reading: mergeReadingState(detailRef.current?.reading ?? previous.reading, next.reading), messagePage, messages: messagePage.items.flatMap(item => item.message ? [item.message] : []) }); setPageEdges({ before: true, after: true })
    } catch (reason) { if (valid()) setError(errorText(reason)) }
    finally { if (flight.current === token) { flight.current = 0; setPaging(false) } }
  }
  const current = available && detail?.conversation.id === id ? detail : null
  const picker = internal ? null : <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="选择渠道会话" title="渠道会话" />}><List /></PopoverTrigger>
  return <Popover open={active && pickerOpen} onOpenChange={setPickerOpen}>
    <div className="channel-workspace" aria-label={`${agent.name}的渠道面板`} hidden={!active}>
    <div className="conversation-stage channel-chat-stage">
      {current ? renderChat({ detail: current, pageActive: active && chatActive, focusMessage: target.focusMessage, focusApproval: target.focusApproval, paging, pageEdges,
        onReading: reading => setDetail(previous => previous?.conversation.id === reading.conversationId ? { ...previous, reading: mergeReadingState(previous.reading, reading) } : previous),
        onLocation: (messageId, following, offset) => { locations.current.set(current.conversation.id, { ...location(), initialized: true, messageId: following ? undefined : messageId, offset }) },
        onPage: direction => { void loadPage(direction) }, onLatest: showLatest, restoreAnchor: location()?.messageId ? { messageId: location()!.messageId!, offset: location()?.offset } : undefined,
        scrollPosition: location()?.scrollPosition, onScrollPosition: scrollPosition => { locations.current.set(current.conversation.id, { ...location(), initialized: true, scrollPosition }) },
      }, picker) : <div className="chat-panel channel-empty-panel">
        <ConversationHeaderLayout title={`${agent.name}的渠道`}>{picker}</ConversationHeaderLayout>
        <ScrollArea className="channel-empty-scroll" viewportProps={{ className: 'scroll-fade-t scroll-fade-6', 'aria-label': '渠道内容' }} contentProps={{ className: 'flex flex-col' }}>
          {error && <div className="px-6 pt-8"><Banner>{error}</Banner></div>}
          {available && !error ? <div className="flex flex-1 items-center justify-center"><Loading>正在载入渠道会话…</Loading></div> : <IllustratedEmpty kind="conversations" title={id ? '该渠道会话已不可用' : '暂无渠道会话'} />}
        </ScrollArea>
      </div>}
      {current && error && <Banner>{error}</Banner>}
    </div>
    </div>
    {!internal && <PopoverContent keepMounted align="end" className="channel-picker p-0 gap-0" aria-label="选择渠道会话" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}>
      <ConversationList {...listProps} showHeading={false} onBack={undefined} channelAgent={agent} selectedId={id ?? null} selectionRequest={target.requestId}
        onSelect={id => { listProps.onSelect(id); setPickerOpen(false) }} />
    </PopoverContent>}
  </Popover>
}
