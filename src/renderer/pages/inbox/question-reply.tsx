/*
 * [INPUT]: 当前原问题/获准补充状态、原消息关系回执、跨关闭/重启未决请求与页面活跃状态。
 * [OUTPUT]: 本人明确定向补充、固定原载荷/key、未知只读核对；原事项已消失仍可查回执，较晚响应不改变新请求。
 * [POS]: inbox 普通问题回复；自动化只导航至原 occurrence，不绕过原预算入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { InboxItem } from '@shared/domain/inbox'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Field, GuardContext } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { INBOX_QUESTION_PENDING_KEY, inboxQuestionReceiptMatches, restoreInboxQuestionRequests, updateInboxQuestionRequests, type InboxQuestionRequest, type InboxQuestionRequests } from './question-state'

export function useInboxQuestionRequests(api: DesktopApi | undefined) {
  const [restored] = useState(() => { try { return { values: restoreInboxQuestionRequests(JSON.parse(localStorage.getItem(INBOX_QUESTION_PENDING_KEY) ?? '{}')), error: '' } } catch { return { values: {} as InboxQuestionRequests, error: '补充请求记录无法读取，请恢复本地存储后核对原请求。' } } })
  const [values, setValues] = useState(restored.values), [error, setError] = useState(restored.error), current = useRef(restored.values)
  const save = useCallback((id: string, next?: InboxQuestionRequest, expectedRequestId?: string) => {
    const updated = updateInboxQuestionRequests(current.current, id, next, expectedRequestId)
    if (!updated) return false
    try { localStorage.setItem(INBOX_QUESTION_PENDING_KEY, JSON.stringify(updated)); current.current = updated; setValues(updated); setError(''); return true }
    catch { setError('未能保存补充请求身份，请恢复本地存储后核对，勿重新提交。'); return false }
  }, [])
  useEffect(() => api?.subscribe(event => {
    if (event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
    for (const value of Object.values(current.current)) if (value.conversationId === event.conversationId) save(value.itemId, undefined, value.input.requestId)
  }), [api, save])
  return { values, error, save }
}

export function InboxQuestionReply({ api, id, item, pending, storageError, onPending, active, onSubmitted }: {
  api: DesktopApi; id: string; item?: InboxItem; pending?: InboxQuestionRequest; storageError: string; active: boolean
  onPending(value?: InboxQuestionRequest, expectedRequestId?: string): boolean; onSubmitted(): void
}) {
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const guard = useContext(GuardContext), mounted = useRef(true), inFlight = useRef(0), generation = useRef(0), current = useRef({ active, pending }); current.current = { active, pending }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; const saved = current.current.pending; if (saved?.status === 'pending') onPending({ ...saved, status: 'unknown' }, saved.input.requestId) } }, [])
  useEffect(() => { guard.setDirty(Boolean(content.trim() && !pending)); return () => guard.setDirty(false) }, [content, pending, guard.setDirty])
  useEffect(() => { if (!active) { generation.current++; inFlight.current = 0; setBusy(false); if (pending?.status === 'pending') onPending({ ...pending, status: 'unknown' }, pending.input.requestId) } }, [active, pending])
  const valid = (token: number) => mounted.current && current.current.active && token === generation.current
  const ensure = (success: boolean) => { if (!success) throw new Error('原补充请求身份未能保存或已变化，请保留原请求核对。') }
  const accepted = (request: InboxQuestionRequest, message: Parameters<typeof inboxQuestionReceiptMatches>[1]) => {
    if (!inboxQuestionReceiptMatches(request, message)) throw new Error('补充回执与原问题/工作关系不一致，请保留原请求核对。')
    ensure(onPending(undefined, request.input.requestId))
    if (mounted.current) { setContent(''); guard.setDirty(false); if (current.current.active) setNotice('已向原问题提交补充。') }
    onSubmitted()
  }
  const lookup = async (request: InboxQuestionRequest, token: number) => {
    const message = await api.request('getMessageReceipt', { requestId: request.input.requestId })
    if (!valid(token)) return true
    if (message) { accepted(request, message); return true }
    ensure(onPending({ ...request, status: 'not_accepted' }, request.input.requestId)); return false
  }
  const act = async () => {
    if (inFlight.current || !active || storageError) return
    const saved = current.current.pending
    if (saved?.status === 'pending') return
    const question = item?.question
    let request = saved
    if (!request) {
      if (!item || !question?.canReply || item.occurrenceId || !content.trim()) return
      request = { itemId: id, conversationId: item.conversationId, questionMessageId: question.messageId, workId: item.workId, input: { questionId: question.id, expectedRevision: question.revision, content: content.trim(), requestId: crypto.randomUUID() }, status: 'pending' }
    }
    const token = ++generation.current; inFlight.current = token; setBusy(true); setError(''); setNotice('')
    try {
      if (saved?.status === 'unknown') { await lookup(saved, token); return }
      if (saved && await lookup(saved, token)) return
      ensure(onPending({ ...request, status: 'pending' }, saved?.input.requestId))
      const message = await api.request('replyInboxQuestion', request.input)
      if (valid(token)) accepted(request, message)
    } catch (failure) {
      if (valid(token)) { onPending({ ...request, status: 'unknown' }, request.input.requestId); setError(errorText(failure)) }
    } finally { if (inFlight.current === token) inFlight.current = 0; if (valid(token)) setBusy(false) }
  }
  const canReply = Boolean(item?.question?.canReply && !item.occurrenceId)
  return <>{error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}{storageError && <Banner>{storageError}</Banner>}
    {pending ? <section className="soft-card flex flex-col gap-2 p-3" aria-label="原补充请求"><strong>原补充请求</strong><p className="whitespace-pre-wrap break-words">{pending.input.content}</p><p className="field-hint">问题与工作身份已固定，核对前不能替换内容。</p><div className="button-row"><Button size="sm" disabled={busy || pending.status === 'pending' || Boolean(storageError)} onClick={() => void act()}>{pending.status === 'unknown' ? '核对补充结果' : pending.status === 'pending' ? '正在提交补充…' : '重试原补充请求'}</Button>{pending.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (onPending(undefined, pending.input.requestId)) { setContent(pending.input.content); setError(''); setNotice('原请求尚未受理，已明确放弃。') } }}>放弃未受理补充</Button>}</div></section> : canReply && <form data-edit-form className="form-grid" onSubmit={event => { event.preventDefault(); void act() }}><Field label="向原问题补充" full hint="只关联此问题和原工作，不作为普通聊天解除其他等待。"><Textarea required rows={4} maxLength={100000} disabled={busy || Boolean(storageError)} value={content} onChange={event => setContent(event.target.value)} /></Field><Button type="submit" size="sm" disabled={busy || !content.trim() || Boolean(storageError)}>提交补充</Button></form>}
  </>
}
