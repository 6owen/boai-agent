/*
 * [INPUT]: Fixed conversation identity, visible reading scope and material reconciliation.
 * [OUTPUT]: Shared bounded history, streaming, paging and stale-response protection for channels and task sessions.
 * [POS]: Conversation reader; never starts or copies employee execution.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Message } from '@boai/shared/domain'
import { READING_LIMITS, type ConversationView } from '@boai/shared/domain/reading'
import { mergeMessagePages, mergeReadingState, updateLiveMessage } from '@/pages/conversations/reading-state'
import { errorText } from '@/components/common'
import type { ChannelChatWindow } from './channels-tab'
type Location = { initialized: boolean; messageId?: string; offset?: number; focusRequestId?: string; scrollPosition?: number }
export function useConversationWindow({ api, id, active, chatActive, available, target, onMaterials }: {
  api: DesktopApi; id?: string; active: boolean; chatActive: boolean; available: boolean
  target: { requestId: string; focusMessage?: { id: string; requestId: string }; focusApproval?: { id: string; requestId: string } }
  onMaterials(id: string, materials: NonNullable<ConversationView['materials']>): void
}) {
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
  const window: ChannelChatWindow | undefined = current ? { detail: current, pageActive: active && chatActive, focusMessage: target.focusMessage, focusApproval: target.focusApproval, paging, pageEdges,
        onReading: reading => setDetail(previous => previous?.conversation.id === reading.conversationId ? { ...previous, reading: mergeReadingState(previous.reading, reading) } : previous),
        onLocation: (messageId, following, offset) => { locations.current.set(current.conversation.id, { ...location(), initialized: true, messageId: following ? undefined : messageId, offset }) },
        onPage: direction => { void loadPage(direction) }, onLatest: showLatest, restoreAnchor: location()?.messageId ? { messageId: location()!.messageId!, offset: location()?.offset } : undefined,
        scrollPosition: location()?.scrollPosition, onScrollPosition: scrollPosition => { locations.current.set(current.conversation.id, { ...location(), initialized: true, scrollPosition }) },
      } : undefined
  return { window, error }
}
