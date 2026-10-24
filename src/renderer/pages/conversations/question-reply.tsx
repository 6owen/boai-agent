/*
 * [OUTPUT]: 自动化补充不再因旧五分钟期限禁用，仍读取实际调用额度和等待状态。
 * [OUTPUT]: 2026-10-10 原问题仅紧凑回复按钮，已回答和成功补充不额外挂卡；未知/失败请求仍沿原身份核对。
 * [OUTPUT]: 主聊天与右侧渠道聊天共用未决请求账本，按实际可见会话集合核对来源；隐藏或切换仍使旧请求未知而不重放。
 * [INPUT]: 原问题/获准补充状态、本人原消息关系回执、跨关闭/重启未决请求与当前聊天活跃身份。
 * [OUTPUT]: 现有 composer 的定向问题补充、提交前来源核对、原 key/载荷冻结和未知只读核对；原问题不在历史页或已回答仍可核对，自动化沿原 occurrence 与预算入口。
 * [POS]: conversations 原问题消息卡与传输状态；不增加独立输入框或业务解决状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { INBOX_QUESTION_PENDING_KEY, inboxQuestionReceiptMatches, questionRequestTarget, restoreInboxQuestionRequests, updateInboxQuestionRequests, type ChatQuestion, type ChatQuestionTarget, type InboxQuestionRequest, type InboxQuestionRequests } from './question-state'

interface QuestionReplyOptions {
  conversationId?: string
  conversationIds?: string[]
  active: boolean
  onSubmitted?(message: Message, target: ChatQuestionTarget): void
}

export function useChatQuestionReplies(api: DesktopApi | undefined, options: QuestionReplyOptions) {
  const [restored] = useState(() => { try { return { values: restoreInboxQuestionRequests(JSON.parse(localStorage.getItem(INBOX_QUESTION_PENDING_KEY) ?? '{}')), error: '' } } catch { return { values: {} as InboxQuestionRequests, error: '补充请求记录无法读取，请恢复本地存储后核对原请求。' } } })
  const [values, setValues] = useState(restored.values), [storageError, setStorageError] = useState(restored.error), [error, setError] = useState(''), [busyIds, setBusyIds] = useState<string[]>([])
  const current = useRef(restored.values), latest = useRef(options), mounted = useRef(true), generation = useRef(0), inFlight = useRef(new Map<string, string>())
  const includes = (value: QuestionReplyOptions, id: string) => value.active && (value.conversationIds ?? [value.conversationId]).includes(id)
  const visibleKey = (value: QuestionReplyOptions) => (value.conversationIds ?? [value.conversationId]).join('|')
  if (visibleKey(latest.current) !== visibleKey(options) || latest.current.active !== options.active) generation.current++
  latest.current = options
  const save = useCallback((id: string, next?: InboxQuestionRequest, expectedRequestId?: string) => {
    const updated = updateInboxQuestionRequests(current.current, id, next, expectedRequestId)
    if (!updated) return false
    try { localStorage.setItem(INBOX_QUESTION_PENDING_KEY, JSON.stringify(updated)); current.current = updated; if (mounted.current) { setValues(updated); setStorageError('') } return true }
    catch { if (mounted.current) setStorageError('未能保存补充请求身份，请恢复本地存储后核对，勿重新提交。'); return false }
  }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; for (const request of Object.values(current.current)) if (request.status === 'pending') save(request.itemId, { ...request, status: 'unknown' }, request.input.requestId) } }, [save])
  useEffect(() => {
    setError('')
    for (const request of Object.values(current.current)) if (request.status === 'pending' && !includes(options, request.conversationId)) save(request.itemId, { ...request, status: 'unknown' }, request.input.requestId)
  }, [options.active, options.conversationId, options.conversationIds?.join('|'), save])
  useEffect(() => api?.subscribe(event => {
    if (event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
    if (includes(latest.current, event.conversationId)) generation.current++
    for (const request of Object.values(current.current)) if (request.conversationId === event.conversationId) save(request.itemId, undefined, request.input.requestId)
  }), [api, save])

  const perform = useCallback(async (target: ChatQuestionTarget, content: string, mode: 'submit' | 'check' | 'retry', expectedRequestId?: string): Promise<Message | undefined> => {
    if (!api || !includes(latest.current, target.conversationId) || inFlight.current.has(target.itemId)) return
    if (storageError) throw new Error(storageError)
    const token = generation.current
    const valid = () => mounted.current && token === generation.current && includes(latest.current, target.conversationId)
    const ensure = (success: boolean) => { if (!success) throw new Error('原补充请求身份未能保存或已变化，请保留原请求核对。') }
    const previous = current.current[target.itemId]
    if (expectedRequestId && previous?.input.requestId !== expectedRequestId) return
    if (!previous && Object.values(current.current).some(request => request.conversationId === target.conversationId)) throw new Error('请先核对这次已经提交的补充，再回复其他问题。')
    let request = previous
    if (previous?.status === 'pending') return
    const requireSource = async () => {
      const item = await api.request('getInboxItem', { id: target.itemId })
      if (!valid()) return
      const question = item?.question
      if (!item || !question || item.kind !== 'question' || item.conversationId !== target.conversationId || question.id !== target.questionId || question.messageId !== target.questionMessageId || item.workId !== target.workId || item.occurrenceId !== target.occurrenceId || item.automationId !== target.automationId || target.revision > 0 && question.revision !== target.revision) throw new Error('原问题已回答、变化或清理，请核对原消息后重新选择。')
      if (item.occurrenceId) {
        if (!question.content) throw new Error('原自动化提问来源已失效，请核对原记录。')
        const occurrence = await api.request('getAutomationOccurrence', { id: item.occurrenceId })
        if (!valid()) return
        if (occurrence.id !== item.occurrenceId || occurrence.automationId !== item.automationId || occurrence.conversationId !== target.conversationId || occurrence.status !== 'waiting_user' || occurrence.stateVersion !== question.revision || occurrence.cancellationRequestedAt || occurrence.taskKind === 'monitor') throw new Error('这一次自动化已经变化或停止，请核对原运行。')
        if (!occurrence.budget || occurrence.budget.exhausted) throw new Error('本次预算不可续用，请在定时任务的本次运行中明确核对或确认追加额度。')
      } else if (!question.canReply) throw new Error(question.unavailableReason ?? '原问题当前不能补充，请核对原记录。')
      return { ...target, revision: question.revision }
    }
    const accept = (saved: InboxQuestionRequest, message: Message) => {
      if (!inboxQuestionReceiptMatches(saved, message)) throw new Error('补充回执与原问题/工作关系不一致，请保留原请求核对。')
      ensure(save(saved.itemId, undefined, saved.input.requestId))
      latest.current.onSubmitted?.(message, questionRequestTarget(saved))
      return message
    }
    inFlight.current.set(target.itemId, target.conversationId); setBusyIds([...inFlight.current.keys()]); setError('')
    try {
      if (previous) {
        const receipt = await api.request('getMessageReceipt', { requestId: previous.input.requestId })
        if (!valid()) return
        if (receipt) return accept(previous, receipt)
        ensure(save(previous.itemId, { ...previous, status: 'not_accepted' }, previous.input.requestId))
        if (mode === 'check' || previous.status === 'unknown') return
      } else if (mode !== 'submit') return
      const source = await requireSource()
      if (!source || !valid()) return
      if (!request) {
        const text = content.trim()
        if (!text || text.length > 100_000) throw new Error('补充内容须为 1–100000 个字符。')
        request = { itemId: source.itemId, conversationId: source.conversationId, questionMessageId: source.questionMessageId, ...(source.workId ? { workId: source.workId } : {}), ...(source.occurrenceId ? { occurrenceId: source.occurrenceId, automationId: source.automationId } : {}), input: { questionId: source.questionId, expectedRevision: source.revision, content: text, requestId: crypto.randomUUID() }, status: 'pending' }
      }
      ensure(save(request.itemId, { ...request, status: 'pending' }, previous?.input.requestId))
      const message = request.occurrenceId
        ? await api.request('replyAutomation', { occurrenceId: request.occurrenceId, content: request.input.content, requestId: request.input.requestId, question: { expectedVersion: request.input.expectedRevision, questionMessageId: request.questionMessageId } })
        : await api.request('replyInboxQuestion', request.input)
      if (valid()) return accept(request, message)
    } catch (failure) {
      if (!valid()) return
      if (valid()) {
        if (request && current.current[request.itemId]?.status === 'pending') save(request.itemId, { ...request, status: 'unknown' }, request.input.requestId)
        setError(errorText(failure))
      }
      throw failure
    } finally {
      if (!valid() && request && current.current[request.itemId]?.input.requestId === request.input.requestId && current.current[request.itemId]?.status === 'pending') save(request.itemId, { ...request, status: 'unknown' }, request.input.requestId)
      inFlight.current.delete(target.itemId)
      if (mounted.current) setBusyIds([...inFlight.current.keys()])
    }
  }, [api, save, storageError])
  const submit = useCallback((target: ChatQuestionTarget, content: string) => perform(target, content, 'submit'), [perform])
  const check = useCallback((request: InboxQuestionRequest) => perform(questionRequestTarget(request), request.input.content, 'check', request.input.requestId), [perform])
  const retry = useCallback((request: InboxQuestionRequest) => perform(questionRequestTarget(request), request.input.content, 'retry', request.input.requestId), [perform])
  const discard = useCallback((request: InboxQuestionRequest) => {
    const saved = current.current[request.itemId]
    return includes(latest.current, request.conversationId) && saved?.status === 'not_accepted' && !inFlight.current.has(request.itemId) && save(request.itemId, undefined, request.input.requestId)
  }, [save])
  return { values, error: storageError || error, storageError, busy: busyIds.some(id => includes(options, inFlight.current.get(id) ?? '')), submit, check, retry, discard }
}
export type ChatQuestionReplies = ReturnType<typeof useChatQuestionReplies>

export function ChatQuestionCard({ question, busy, active, pending, unavailableReason, onReply }: { question: ChatQuestion; busy: boolean; active: boolean; pending?: InboxQuestionRequest; unavailableReason?: string; onReply(target: ChatQuestionTarget): void }) {
  if (question.answeredMessageId) return null
  return <section className="chat-question-action flex flex-col items-start gap-2" data-question-id={question.questionId} aria-label="原消息问题">
    <Button variant="secondary" size="sm" title={question.occurrenceId ? '补充只接续这一次定时任务' : '在下方输入框回复，员工会接着处理原问题'} disabled={busy || !active || Boolean(pending) || Boolean(unavailableReason)} onClick={() => onReply(question)}>回复此问题</Button>
    {unavailableReason && <p className="field-hint">{unavailableReason}</p>}
  </section>
}

export function PendingQuestionReplies({ conversationId, replies, active, onDiscard }: { conversationId: string; replies: ChatQuestionReplies; active: boolean; onDiscard(request: InboxQuestionRequest): void }) {
  const requests = Object.values(replies.values).filter(request => request.conversationId === conversationId)
  return <>{!requests.length && replies.error && <Banner>{replies.error}</Banner>}{requests.map((request, index) => <section className="soft-card flex flex-col gap-2 p-3" aria-label="待核对补充" key={request.itemId}>
    {index === 0 && replies.error && <Banner>{replies.error}</Banner>}
    <strong>{request.status === 'pending' ? '正在提交原问题的补充' : '原问题的补充等待核对'}</strong><p className="max-h-32 overflow-auto whitespace-pre-wrap break-words">{request.input.content}</p>
    <p className="field-hint">这次补充内容已保留，请先确认发送结果。{request.status === 'not_accepted' ? '已确认尚未受理，可以重试这次补充或放弃。' : '核对不会重新发送消息或执行工具。'}</p>
    <div className="button-row"><Button size="sm" disabled={!active || replies.busy || request.status === 'pending' || Boolean(replies.storageError)} onClick={() => { void (request.status === 'unknown' ? replies.check(request) : replies.retry(request)).catch(() => {}) }}>{request.status === 'unknown' ? '核对补充结果' : request.status === 'pending' ? '正在提交补充…' : '重试原补充请求'}</Button>{request.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={!active || replies.busy || Boolean(replies.storageError)} onClick={() => { if (replies.discard(request)) onDiscard(request) }}>放弃未受理补充</Button>}</div>
  </section>)}</>
}
