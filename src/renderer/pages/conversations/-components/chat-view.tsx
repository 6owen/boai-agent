/*
 * [INPUT]: 会话领域类型、草稿、活动投影、会话标题菜单、shadcn Scroll Fade 与统一 UI 基础组件。
 * [OUTPUT]: 移除输入框上方状态条，回复旁图标打开对应员工/轮次的 Trace；悬浮名称/操作菜单与顶部渐隐消息；紧凑两行 composer 仅在单聊显示权限和模型菜单；保留发送/停止/提及、滚动跟随及位置恢复。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { ChatComposer, ChatComposerInput } from '@/components/ui/chat-composer'
import { ExternalFiles } from './external-files'
import { ComposerToolbar, type ComposerAgentPatch } from './composer-toolbar'
import { ConversationHeader } from './conversation-header'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Workflow, Reply, ShieldCheck, X } from '@/components/icons/index'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Approval, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common/index'

import { liveTurn, type ChatDraft } from '../presentation'
export function ChatView({ detail, snapshot, draft, setDraft, busy, onSend, onStop, onDetails, onChangeConversationList, onClear, onActivity, onTrace, onSettings, onChangeAgent, configurationLocked, onApprove, onOpenPath, scrollPosition, onScrollPosition }: { detail: ConversationDetail; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: (stopPrevious?: boolean) => void; onStop: () => void; onDetails: () => void; onChangeConversationList: (change: ConversationListChange) => void; onClear: (id: string, hide: boolean) => Promise<void>; onActivity: () => void; onTrace: (message?: ConversationDetail['messages'][number]) => void; onSettings: () => void; onChangeAgent: (agent: DigitalAgent, patch: ComposerAgentPatch) => void; configurationLocked: boolean; onApprove: (id: string, approved: boolean) => void; onOpenPath: (path: string) => void; scrollPosition?: number; onScrollPosition: (position: number) => void }) {
  const conversation = detail.conversation
  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const [mentionsVisible, setMentionsVisible] = useState(false), [newMessages, setNewMessages] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), following = useRef(scrollPosition === undefined), initialized = useRef(false)
  const approvals = snapshot.approvals.filter(a => a.conversationId === conversation.id)
  const activeRuns = detail.runs.filter(run => ['queued','running','waiting_approval'].includes(run.status))
  const activeTurns = detail.turns?.filter(turn => liveTurn(turn.status)) ?? []
  const active = activeRuns.length > 0 || activeTurns.length > 0
  const selectedMentions = draft.mentionIds.filter(id => members.some(a => a.id === id && a.active))
  const reply = detail.messages.find(m => m.id === draft.replyId)
  const last = detail.messages.at(-1)
  const external=conversation.kind==='direct'&&members[0]?.executionBackend?.kind==='acp-local'
  useLayoutEffect(() => { if (!scrollRef.current || initialized.current) return; const el = scrollRef.current; el.scrollTop = scrollPosition ?? el.scrollHeight; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; initialized.current = true }, [])
  useEffect(() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; if (following.current) { el.scrollTop = el.scrollHeight; setNewMessages(false) } else if (last) setNewMessages(true) }, [last?.content, last?.status, detail.messages.length, approvals.length])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => { if (el.clientHeight > 0 && following.current) el.scrollTop = el.scrollHeight })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div className="chat-panel">
    <ConversationHeader conversation={snapshot.conversations.find(item => item.id === conversation.id) ?? conversation} busy={busy} onDetails={onDetails} onActivity={onActivity} onTrace={() => onTrace()} onChange={onChangeConversationList} onClear={onClear} />
    <div className="messages scroll-fade-t scroll-fade-6" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (following.current) setNewMessages(false); onScrollPosition(el.scrollTop) }}>
      {!detail.messages.length && <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} seed={a.id} avatar={a.avatar} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>}
      {detail.messages.map(message => { const agent = snapshot.agents.find(a => a.id === message.senderId); const quoted = detail.messages.find(m => m.id === message.replyToMessageId); return <article className={`message-row ${message.senderType}`} key={message.id} id={`message-${message.id}`}><div className="message-avatar">{message.senderType === 'user' ? <span className="avatar user-avatar">{message.origin?'定':'我'}</span> : <Avatar name={message.senderName || '系统'} seed={message.senderId} avatar={agent?.avatar} color={agent?.color} />}</div><div className="message-main"><div className="message-meta"><strong>{message.origin?message.senderName:message.senderType === 'user' ? '你' : message.senderName}</strong><time>{timeText(message.createdAt)}</time>{message.senderType === 'agent' && <Button variant="ghost" size="icon-sm" className="trace-action" aria-label={`查看 ${message.senderName} 的执行过程`} title="查看执行过程" onClick={() => onTrace(message)}><Workflow size={14} /></Button>}<Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${message.senderName} 的消息`} onClick={() => setDraft({ ...draft, replyId: message.id })}><Reply size={14} /></Button></div>{quoted && <div className="quoted-message">{quoted.senderName}：{quoted.content.slice(0,120)}</div>}<div className="message-bubble markdown">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <span title={href} className="markdown-link">{children}</span>, img: ({ alt }) => <span className="muted">[图片：{alt || '外部图片未加载'}]</span> }}>{message.content}</ReactMarkdown> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : <span className="muted">暂无公开内容</span>}</div>{message.status==='completed'&&message.runId&&detail.runs.find(r=>r.id===message.runId)?.backend&&<ExternalFiles runId={message.runId}/>} {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在执行过程中查看' : '回复失败，请查看执行过程'}</small>}</div></article> })}
      {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy} onApprove={onApprove} />)}
    </div>{newMessages && <Button variant="outline" size="sm" className="new-messages" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; following.current = true; setNewMessages(false) }}><ArrowDown size={14} />有新消息 · 返回最新</Button>}
    <div className="composer-wrap">
      {(mentionsVisible || selectedMentions.length > 0) && conversation.kind === 'group' && <div className="mention-bar"><span>可选点名</span>{members.filter(a => a.active).map(a => <Button variant="secondary" size="content" key={a.id} className={`mention-chip${selectedMentions.includes(a.id) ? ' selected' : ''}`} aria-pressed={selectedMentions.includes(a.id)} onClick={() => setDraft({ ...draft, mentionIds: selectedMentions.includes(a.id) ? selectedMentions.filter(id => id !== a.id) : [...selectedMentions, a.id] })}>@{a.name}</Button>)}</div>}
      {reply && <div className="reply-preview"><Reply size={14} /><span>回复 {reply.senderName}：{reply.content.slice(0,100)}</span><Button variant="ghost" size="icon-sm" aria-label="取消引用" onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></Button></div>}
      <ChatComposer><ChatComposerInput aria-label="消息内容" placeholder={external?"描述明确任务，然后点击执行外部任务…":"说说你想完成什么，也可以简单打个招呼…"} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => { if (!external && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() } }} /><ComposerToolbar members={members} snapshot={snapshot} group={conversation.kind === 'group'} external={external} busy={busy} active={active} canSend={Boolean(draft.text.trim())} configurationLocked={configurationLocked} mentionsVisible={mentionsVisible} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)} onMentions={() => setMentionsVisible(!mentionsVisible)} onSettings={onSettings} onChangeAgent={onChangeAgent} onSend={onSend} onStop={onStop} /></ChatComposer>
    </div></div>
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean) => void; busy: boolean }) { return <Card className="approval-card gap-0 p-4"><CardContent className="p-0"><div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} 申请运行命令</strong></div><pre>{approval.command}</pre><p className="field-hint">工作目录：{approval.cwd}</p><p className="field-hint">命令使用应用的主机权限，请核对实际操作范围。</p><div className="button-row"><Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</Button><Button size="sm" disabled={busy} onClick={() => onApprove(approval.id, true)}>允许这次执行</Button></div></CardContent></Card> }

