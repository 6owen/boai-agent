/*
 * [OUTPUT]: 最后视图关闭且提交结束后释放全局store；持久原请求重开只恢复/核对，不重发。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 按去重的真实执行会话有界读取内部修改结果；当前提交完成后自动预览一次，历史请求不抢阅读位置，清理均失效。
 * [INPUT]: 文件身份、显式提交/核对动作和已有员工IPC；活跃文件视图。
 * [OUTPUT]: 独立持久修改请求、真实来源回执与有界结果读取；隐藏停读、清理隔离、未知不重放。
 * [POS]: 文件编辑生命周期，与主聊天草稿和路由解耦。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Artifact, Message } from '@boai/shared/domain'
import { errorText } from '@/components/common'
import { readDetailMessages } from '@/pages/conversations/detail-reading'
import { FILE_EDIT_STORAGE, completedFileEditArtifact, fileEditReceiptMatches, fileEditResults, materialEditInput, restoreFileEdits, revisionInput, type FileEditRequest, type FileEditSource } from './file-edit-state'

interface State { requests: FileEditRequest[]; error: string; unavailable: boolean }
interface Store { state: State; listeners: Set<() => void>; flights: Set<string>; epoch: number }
const stores = new Map<string, Store>()
function getStore(key: string): Store {
  const existing = stores.get(key)
  if (existing) return existing
  let requests: FileEditRequest[] = [], error = ''
  try { const value = localStorage.getItem(FILE_EDIT_STORAGE + key); if (value) requests = restoreFileEdits(JSON.parse(value), key) }
  catch { error = '文件修改记录无法读取，请保留本地记录并核对，暂不能发送新要求。' }
  const store: Store = { state: { requests, error, unavailable: false }, listeners: new Set(), flights: new Set(), epoch: 0 }
  stores.set(key, store); return store
}
function publish(store: Store, patch: Partial<State>) { store.state = { ...store.state, ...patch }; for (const listener of store.listeners) listener() }
function releaseStore(key: string, store: Store) {
  // React can unsubscribe/resubscribe within one commit. Wait until all view
  // subscriptions settle, and retain an unfinished submission across closing.
  queueMicrotask(() => { if (!store.listeners.size && !store.flights.size && stores.get(key) === store) stores.delete(key) })
}
function persist(key: string, store: Store, request: FileEditRequest) {
  const previous = store.state.requests
  const requests = previous.some(item => item.id === request.id) ? previous.map(item => item.id === request.id ? request : item) : [...previous, request]
  // Keep all unsettled identities; bound completed UI history without touching host records.
  const accepted = requests.filter(item => item.status === 'accepted').slice(-20)
  const retained = requests.filter(item => item.status !== 'accepted' || accepted.includes(item))
  localStorage.setItem(FILE_EDIT_STORAGE + key, JSON.stringify({ version: 1, requests: retained }))
  publish(store, { requests: retained })
}
export function useFileEdits(api: DesktopApi, key: string, conversationId: string, active: boolean) {
  const store = getStore(key)
  const submittedRequest = useRef<{ key: string; id: string } | undefined>(undefined)
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener)
    return () => { store.listeners.delete(listener); releaseStore(key, store) }
  }, [key, store])
  const state = useSyncExternalStore(subscribe, () => store.state)
  const [results, setResults] = useState<ReturnType<typeof fileEditResults>>([]), [messages, setMessages] = useState<Message[]>([]), [readError, setReadError] = useState('')
  useEffect(() => api.subscribe(event => {
    if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && (event.conversationId === conversationId || store.state.requests.some(request => request.executionConversationId === event.conversationId))) {
      store.epoch++
      try { localStorage.removeItem(FILE_EDIT_STORAGE + key) } catch { /* Keep the source unavailable even if storage cleanup fails. */ }
      publish(store, { requests: [], unavailable: true, error: '来源聊天已清理或移除，原修改请求不可重发。' })
      setResults([]); setMessages([])
    }
  }), [api, key, conversationId, store])
  useEffect(() => {
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      if (!active || store.state.unavailable || !state.requests.some(request => request.status === 'accepted')) return
      const token = ++sequence, epoch = store.epoch
      const current = () => !disposed && sequence === token && store.epoch === epoch && !store.state.unavailable
      try {
        const ids = [...new Set(state.requests.filter(request => request.status === 'accepted').map(request => request.executionConversationId ?? request.source.conversationId))]
        const next: ReturnType<typeof fileEditResults> = [], loaded: Awaited<ReturnType<typeof readDetailMessages>> = []
        for (const id of ids) {
          const detail = await api.request('getConversationMetadata', { id })
          if (!current()) return
          const results = fileEditResults(detail, state.requests)
          next.push(...results)
          loaded.push(...await readDetailMessages(api, id, results.flatMap(result => result.messageIds).slice(-40), current))
          if (!current()) return
        }
        setResults(next); setMessages(loaded.flatMap(item => item.status === 'available' && item.message ? [item.message] : [])); setReadError(loaded.some(item => item.status === 'unavailable') ? '部分原回复暂不可用，请重新核对。' : '')
      } catch (failure) { if (current()) { setResults([]); setMessages([]); setReadError(errorText(failure)) } }
    }
    void read()
    const unsubscribe = api.subscribe(event => {
      if (!active || store.state.unavailable) return
      if (event.type === 'message' && (event.message.conversationId === conversationId || state.requests.some(request => request.executionConversationId === event.message.conversationId))) {
        setMessages(previous => previous.some(message => message.id === event.message.id) ? previous.map(message => message.id === event.message.id ? event.message : message) : previous)
      }
      if (event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId || state.requests.some(request => request.executionConversationId === event.conversationId)) || event.type === 'message' && (event.message.conversationId === conversationId || state.requests.some(request => request.executionConversationId === event.message.conversationId)) && event.message.status !== 'streaming') {
        if (!timer) timer = setTimeout(() => { timer = undefined; void read() }, 150)
      }
    })
    return () => { disposed = true; sequence++; clearTimeout(timer); unsubscribe() }
  }, [api, active, conversationId, state.requests, store])

  const execute = async (request: FileEditRequest, mode: 'send' | 'check' | 'retry') => {
    if (store.state.unavailable || store.flights.has(request.id)) return false
    const existing = store.state.requests.find(item => item.id === request.id)
    if (mode === 'send' && (state.error || store.state.requests.some(item => item.status !== 'accepted')) || mode !== 'send' && !existing || mode === 'retry' && existing?.status !== 'not_accepted') return false
    const epoch = store.epoch, current = () => epoch === store.epoch && !store.state.unavailable
    const lookup = async () => {
      const receipt = await api.request('getMessageReceipt', { requestId: request.id })
      if (!current()) return true
      if (!receipt) return false
      if (!fileEditReceiptMatches(request, receipt)) throw new Error('修改回执与原文件或要求不一致，请保留请求核对。')
      persist(key, store, { ...request, status: 'accepted', messageId: receipt.id }); publish(store, { error: '' }); return true
    }
    store.flights.add(request.id); publish(store, {})
    try {
      if (mode !== 'send') {
        if (await lookup()) return current()
        if (!current()) return false
        persist(key, store, { ...request, status: 'not_accepted' })
        if (mode === 'check') { publish(store, { error: '原请求尚未受理，可重试原要求或放弃。' }); return false }
      }
      // Failure to durably freeze the request prevents all business mutations.
      persist(key, store, { ...request, status: 'pending' }); publish(store, { error: '' })
      submittedRequest.current = { key, id: request.id }
      try {
        const receipt = request.source.kind === 'artifact' ? await api.request('reviseArtifact', revisionInput(request)) : await api.request('sendMessage', materialEditInput(request))
        if (!current()) return false
        if (!fileEditReceiptMatches(request, receipt)) throw new Error('修改回执与原文件或要求不一致。')
        persist(key, store, { ...request, status: 'accepted', messageId: receipt.id }); return true
      } catch (failure) {
        if (!current()) return false
        try { persist(key, store, { ...request, status: 'unknown' }) } catch { publish(store, { requests: store.state.requests.map(item => item.id === request.id ? { ...item, status: 'unknown' } : item) }) }
        try { if (await lookup()) return current() } catch { /* Keep the frozen original identity until explicit lookup. */ }
        throw failure
      }
    } catch (failure) { if (current()) publish(store, { error: errorText(failure) }); return false }
    finally { store.flights.delete(request.id); publish(store, {}); releaseStore(key, store) }
  }
  const discard = (request: FileEditRequest) => {
    if (store.flights.has(request.id) || request.status !== 'not_accepted') return
    try {
      const requests = store.state.requests.filter(item => item.id !== request.id)
      localStorage.setItem(FILE_EDIT_STORAGE + key, JSON.stringify({ version: 1, requests })); publish(store, { requests, error: '' })
    } catch (failure) { publish(store, { error: errorText(failure) }) }
  }
  return { ...state, results, messages, readError, submittedRequestId: submittedRequest.current?.key === key ? submittedRequest.current.id : undefined, busy: store.flights.size > 0, execute, discard }
}

export function useFileEditAutoPreview(edits: ReturnType<typeof useFileEdits>, source: FileEditSource | undefined, active: boolean, onResult: (artifact: Artifact) => void) {
  const opened = useRef(new Set<string>())
  useEffect(() => {
    const requestId = edits.submittedRequestId
    if (!active || !requestId || opened.current.has(requestId) || edits.unavailable) return
    const artifact = completedFileEditArtifact(edits.results, source, requestId)
    if (!artifact) return
    opened.current.add(requestId)
    onResult(artifact)
  }, [active, edits.results, edits.submittedRequestId, edits.unavailable, source, onResult])
}
