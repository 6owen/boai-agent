/*
 * [INPUT]: 当前有界消息/真实完成快照、已提交阅读状态、消息滚动容器和主页面/窗口可见性。
 * [OUTPUT]: 只观测实际可见完成身份，阅读与稳定消息锚点独立 CAS；页面位置保留有符号小数偏移，仅持久提交归一为原非负整数合同；沿用消息窗口确认的跟随状态，旧页底部不误当最新；失联只核对，显式核对成功仅开放下一次实际交互的新快照，隐藏/失焦/迟到不污染另一窗口。
 * [POS]: ChatView 的 D6 个人阅读宿主接线；不改变工作、审批、采用或模型上下文。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { READING_LIMITS, type ConversationReadingState, type ConversationView } from '@shared/domain/reading'
import type { DesktopApi } from '@shared/ipc'
import { errorText } from '@/components/common'
import { READING_UI_LIMITS, visibleCompletions } from '../reading-state'

export function useConversationReading({ api, active, view, root, following, onReading, onLocation }: {
  api: DesktopApi; active: boolean; view: ConversationView; root: RefObject<HTMLDivElement | null>
  following?: RefObject<boolean>
  onReading(state: ConversationReadingState): void; onLocation(messageId: string | undefined, following: boolean, offset?: number): void
}) {
  const [error, setError] = useState(''), generation = useRef(0), observing = useRef(false), anchoring = useRef(false), observed = useRef(''), anchored = useRef('')
  const current = useRef({ active, view, following, onReading, onLocation }); current.current = { active, view, following, onReading, onLocation }
  const allowed = () => current.current.active && document.visibilityState === 'visible' && document.hasFocus() && Boolean(root.current?.clientHeight)
  const measure = () => {
    const element = root.current, ids = new Set<string>(); let anchor: { messageId: string; offset: number } | undefined
    if (!element) return { ids, anchor }
    const viewport = element.getBoundingClientRect()
    for (const row of element.querySelectorAll<HTMLElement>('[data-reading-message-id]')) {
      const bounds = row.getBoundingClientRect(), id = row.dataset.readingMessageId
      if (!id || bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue
      ids.add(id)
      if (!anchor) anchor = { messageId: id, offset: viewport.top - bounds.top }
    }
    return { ids, anchor }
  }
  const reconcile = async (token: number) => {
    const state = await api.request('getConversationReading', { conversationId: view.conversation.id })
    if (token === generation.current && current.current.view.conversation.id === state.conversationId && current.current.active) current.current.onReading(state)
  }
  const observe = useCallback(async () => {
    if (!allowed() || observing.current) return
    const captured = current.current.view, completions = visibleCompletions(captured.messagePage, captured.reading, measure().ids, true, true, true)
    if (!completions.length) return
    const signature = JSON.stringify([captured.reading.epoch, completions])
    if (observed.current === signature) return
    observed.current = signature; observing.current = true
    const token = generation.current, input = { conversationId: captured.conversation.id, epoch: captured.reading.epoch, expectedRevision: captured.reading.revision, completions }
    try {
      const state = await api.request('observeConversationReading', input)
      if (token === generation.current && allowed()) { current.current.onReading(state); setError('') }
    } catch (cause) {
      if (token === generation.current && current.current.active) { setError(`阅读记录尚未确认：${errorText(cause)}`); try { await reconcile(token) } catch (failure) { if (token === generation.current) setError(`阅读记录核对失败：${errorText(failure)}`) } }
    } finally { if (token === generation.current) observing.current = false }
  }, [api, view.conversation.id])
  const saveAnchor = useCallback(async () => {
    if (!allowed() || anchoring.current) return
    const captured = current.current.view, measured = measure().anchor
    if (!measured) return
    const anchor = { ...measured, offset: Math.min(READING_LIMITS.anchorOffset, Math.max(0, Math.round(measured.offset))) }
    const signature = JSON.stringify([captured.reading.epoch, anchor])
    if (anchored.current === signature || captured.reading.anchor?.messageId === anchor.messageId && captured.reading.anchor.offset === anchor.offset) return
    anchored.current = signature; anchoring.current = true
    const token = generation.current, input = { conversationId: captured.conversation.id, epoch: captured.reading.epoch, expectedAnchorRevision: captured.reading.anchor?.revision ?? 0, ...anchor }
    try {
      const state = await api.request('saveConversationAnchor', input)
      if (token === generation.current && allowed()) { current.current.onReading(state); setError('') }
    } catch (cause) {
      if (token === generation.current && current.current.active) { setError(`阅读位置尚未确认：${errorText(cause)}`); try { await reconcile(token) } catch (failure) { if (token === generation.current) setError(`阅读位置核对失败：${errorText(failure)}`) } }
    } finally { if (token === generation.current) anchoring.current = false }
  }, [api, view.conversation.id])
  useEffect(() => {
    generation.current++; observing.current = false; anchoring.current = false
    if (!active) return
    let observeTimer: ReturnType<typeof setTimeout> | undefined, anchorTimer: ReturnType<typeof setTimeout> | undefined
    const schedule = (scroll = false) => {
      if (!allowed()) return
      clearTimeout(observeTimer); observeTimer = setTimeout(() => { void observe() }, READING_UI_LIMITS.observeDelay)
      if (scroll) {
        const element = root.current!, following = current.current.following?.current ?? element.scrollHeight - element.scrollTop - element.clientHeight < READING_UI_LIMITS.historyEdgeDistance
        const anchor = measure().anchor
        current.current.onLocation(anchor?.messageId, following, anchor?.offset)
        clearTimeout(anchorTimer); anchorTimer = setTimeout(() => { void saveAnchor() }, READING_UI_LIMITS.anchorDelay)
      }
    }
    const scroll = () => schedule(true), visibility = () => schedule()
    root.current?.addEventListener('scroll', scroll); window.addEventListener('focus', visibility); document.addEventListener('visibilitychange', visibility)
    schedule()
    return () => { generation.current++; observing.current = false; anchoring.current = false; clearTimeout(observeTimer); clearTimeout(anchorTimer); root.current?.removeEventListener('scroll', scroll); window.removeEventListener('focus', visibility); document.removeEventListener('visibilitychange', visibility) }
  }, [active, view.conversation.id, root, observe, saveAnchor])
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => { void observe() }, READING_UI_LIMITS.observeDelay)
    return () => clearTimeout(timer)
  }, [active, view.messagePage, view.reading.epoch, observe])
  const check = async () => {
    const token = generation.current
    try { await reconcile(token); if (token === generation.current) { observed.current = ''; anchored.current = ''; setError('已核对阅读状态；继续滚动时记录当前可见内容。') } }
    catch (cause) { if (token === generation.current) setError(errorText(cause)) }
  }
  return { error, check }
}
