/*
 * [OUTPUT]: 计划/数据源共用回执核对；标题操作包入chat-header-actions，确保新对话按钮可点击。
 * [INPUT]: bobo真实核心会话/消息IPC、固定请求回执、共用聊天组件和已保存计划投影。
 * [OUTPUT]: 计划/数据源页共用持续对话与真实结果卡插槽；首发/续聊未知回执持久核对，隐藏停读、清理失效。
 * [POS]: 两类专用bobo创建会话，各自持久请求身份，不调用独立草稿模型，不从回复文本猜测保存成功。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Snapshot } from '@boai/shared/domain'
import type { ConversationView } from '@boai/shared/domain/reading'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DesktopApi } from '@boai/shared/ipc'
import { Avatar, Banner, errorText, Loading } from '@/components/common'
import { Markdown } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { ChatComposer, ChatComposerInput, ChatComposerFooter } from '@/components/ui/chat-composer'
import { ArrowUp } from '@/components/icons'


type Pending = { requestId: string; content: string; conversationId?: string }
type Session = { conversationId?: string; pending?: Pending; draft: string }
function readSession(storageKey: string): Session {
  try { const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (value && typeof value.draft === 'string') return value } catch { /* A new draft can be used when no submitted identity exists. */ }
  return { draft: '' }
}
export function CreationAssistant({ api, snapshot, active, kind, renderResults }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; kind: 'automation' | 'source'; renderResults(conversationId?: string): ReactNode
}) {
  const storageKey = kind === 'source' ? 'boai:source:assistant' : 'boai:schedule:assistant'
  const copy = kind === 'source' ? { title: '添加数据源', empty: '想连接什么数据源？', hint: '描述用途、粘贴 API / MCP 配置，或提供本地文件夹路径。', label: '数据源创建要求', placeholder: '例如：添加这个 MCP，或粘贴 JSON 配置…' } : { title: '创建定时任务', empty: '想安排什么任务？', hint: '告诉 bobo 让哪位员工、在什么时间、完成什么工作。', label: '定时任务创建要求', placeholder: '例如：让研究员每个工作日早上九点整理行业简报' }
  const [session, setSession] = useState(() => readSession(storageKey)), [view, setView] = useState<ConversationView>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const state = useRef(session), alive = useRef(true), sending = useRef(false), scroller = useRef<HTMLDivElement>(null), following = useRef(true)
  const [revision, setRevision] = useState(0)
  const core = snapshot.agents.find(isCoreAgent), name = core?.name ?? 'bobo'
  const persist = (value: Session) => { localStorage.setItem(storageKey, JSON.stringify(value)); state.current = value; if (alive.current) setSession(value) }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!active || !session.conversationId) return
    let live = true, epoch = 0, reading = false, again = false, timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      if (reading) { again = true; return }
      reading = true
      const version = epoch
      try { const result = await api.request('getConversationView', { conversationId: session.conversationId!, limit: 80 }); if (live && version === epoch) { setView(result); setError('') } }
      catch (cause) { if (live && version === epoch) { setView(undefined); setError(errorText(cause)) } }
      finally { reading = false; if (live && again) { again = false; void read() } }
    }
    void read()
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' && event.conversationId === session.conversationId) { epoch++; setView(undefined); setError('此对话记录已清理。可以开始新的对话。'); return }
      if ((event.type === 'changed' || event.type === 'message' && event.message.conversationId === session.conversationId) && !timer) timer = setTimeout(() => { timer = undefined; if (live) void read() }, 80)
    })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, active, session.conversationId, revision])
  useEffect(() => { if (active && following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight }, [active, view])
  const accepted = (conversationId: string) => { persist({ conversationId, draft: '' }); if (alive.current) { setRevision(v => v + 1); setError('') } }
  const reconcile = async (pending: Pending) => {
    const receipt = pending.conversationId ? await api.request('getMessageReceipt', { requestId: pending.requestId }) : await api.request('getCoreConversationStart', { requestId: pending.requestId })
    if (receipt) { const id = 'conversationId' in receipt ? receipt.conversationId : receipt.id; accepted(id); return true }
    return false
  }
  const check = async () => {
    if (!state.current.pending || sending.current) return
    sending.current = true; setBusy(true)
    try { const pending = state.current.pending; if (!await reconcile(pending)) setError('尚未收到发送回执。可使用原请求重试。') }
    catch (cause) { setError(errorText(cause)) }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  useEffect(() => { if (active && state.current.pending) void check() }, [active])
  const send = async () => {
    if (sending.current || !active) return
    const current = state.current
    if (!current.pending && !current.draft.trim()) return
    sending.current = true; setBusy(true); setError(''); following.current = true
    const pending = current.pending ?? { requestId: crypto.randomUUID(), content: current.draft.trim(), conversationId: current.conversationId }
    try {
      // Persist before IPC. An unknown result is never silently replayed.
      persist({ ...current, pending })
      if (current.pending && await reconcile(pending)) return
      if (pending.conversationId) { await api.request('sendMessage', { ...pending, conversationId: pending.conversationId, mentionIds: [] }); accepted(pending.conversationId) }
      else { const conversation = await api.request('startCoreConversation', { requestId: pending.requestId, content: pending.content, ...(kind === 'source' ? { sourceCreation: true } : { automationCreation: true }) }); accepted(conversation.id) }
    } catch (cause) {
      if (alive.current) setError(errorText(cause))
      if (state.current.pending) try { await reconcile(pending) } catch { /* Retain the exact submitted identity for read-only lookup. */ }
    } finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  const messages = view?.messages.filter(m => m.senderType === 'user' || m.senderType === 'agent') ?? []
  const processing = view?.runs.some(run => (!run.phase || run.phase === 'execution') && ['queued', 'running', 'waiting_approval'].includes(run.status))
  return <div className="chat-panel schedule-assistant-chat">
    <header className="chat-header"><div className="chat-heading"><h2 className="chat-title">与 {name} {copy.title}</h2></div><div className="chat-header-actions">{session.conversationId && <Button variant="ghost" size="sm" disabled={busy || !!session.pending} onClick={() => { persist({ draft: '' }); setView(undefined); setError('') }}>新对话</Button>}</div></header>
    <div ref={scroller} className="messages schedule-assistant-messages" onScroll={e => { const el = e.currentTarget; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
      {!session.conversationId && <div className="chat-empty"><div className="avatar-stack">{core && <Avatar name={name} seed={core.id} avatar={core.avatar} color={core.color} />}</div><h2>{copy.empty}</h2><p>{copy.hint.replace('bobo', name)}</p></div>}
      {messages.map(message => <article key={message.id} className={`schedule-chat-message ${message.senderType === 'user' ? 'is-user' : ''}`}><Markdown>{message.content}</Markdown></article>)}
      {processing && <Loading>{name} 正在回复…</Loading>}
      {renderResults(session.conversationId)}
    </div>
    <div className="composer-wrap">
      {error && <Banner>{error}</Banner>}
      {session.pending && !busy && <Banner kind="notice">发送结果待核对，原请求已保留。<Button variant="ghost" size="sm" disabled={busy} onClick={() => void check()}>核对结果</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void send()}>重试原请求</Button></Banner>}
      <ChatComposer><ChatComposerInput aria-label={copy.label} placeholder={copy.placeholder} value={session.draft} disabled={busy || !!session.pending} onChange={e => { try { persist({ ...state.current, draft: e.target.value }) } catch (cause) { setError(errorText(cause)) } }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} /><ChatComposerFooter><span className="field-hint">{name}</span><Button size="icon" aria-label="发送创建要求" disabled={busy || !!session.pending || !session.draft.trim()} onClick={() => void send()}><ArrowUp /></Button></ChatComposerFooter></ChatComposer>
    </div>
  </div>
}
