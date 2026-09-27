/*
 * [INPUT]: 会话领域类型、草稿、活动投影、共用 Soft 输入框与按钮、统一 UI 基础组件。
 * [OUTPUT]: 统一员工头像；聊天消息和任务交互；紧凑两行 composer 接入加号、权限和模型菜单，底部无提示栏；保留发送/停止/提及行为。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { ChatComposer, ChatComposerInput } from '@/components/ui/chat-composer'
import { ExternalFiles } from './external-files'
import { ComposerToolbar, type ComposerAgentPatch } from './composer-toolbar'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ChevronRight, FolderOpen, LoaderCircle, MoreHorizontal, Reply, ShieldCheck, X } from '@/components/icons/index'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Approval, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import { Avatar, timeText } from '@/components/common/index'
import { activityRounds } from '@/pages/conversations/activity'

import { deliveryLabels, turnLabels, liveTurn, latestMemberDeliveries, type ChatDraft } from '../presentation'
export function ChatView({ detail, snapshot, draft, setDraft, busy, onSend, onStop, onDetails, onEmployee, onActivity, onSettings, onChangeAgent, configurationLocked, onApprove, onOpenPath, scrollPosition, onScrollPosition }: { detail: ConversationDetail; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: (stopPrevious?: boolean) => void; onStop: () => void; onDetails: () => void; onEmployee: (agent: DigitalAgent) => void; onActivity: () => void; onSettings: () => void; onChangeAgent: (agent: DigitalAgent, patch: ComposerAgentPatch) => void; configurationLocked: boolean; onApprove: (id: string, approved: boolean) => void; onOpenPath: (path: string) => void; scrollPosition?: number; onScrollPosition: (position: number) => void }) {
  const conversation = detail.conversation
  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const [mentionsVisible, setMentionsVisible] = useState(false), [newMessages, setNewMessages] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), following = useRef(scrollPosition === undefined), initialized = useRef(false)
  const approvals = snapshot.approvals.filter(a => a.conversationId === conversation.id)
  const activeRuns = detail.runs.filter(run => ['queued','running','waiting_approval'].includes(run.status))
  const activeTurns = detail.turns?.filter(turn => liveTurn(turn.status)) ?? []
  const active = activeRuns.length > 0 || activeTurns.length > 0
  const currentRound = activityRounds(detail)[0]
  const turn = currentRound?.turn
  const deliveries = (detail.deliveries ?? []).filter(d => d.turnId === turn?.id)
  const latestByMember = latestMemberDeliveries(deliveries)
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
  return <div className="chat-panel"><header className="chat-header"><Button variant="ghost" size="content" className="chat-title" onClick={onDetails}><strong>{conversation.title}</strong><small>{conversation.kind === 'group' ? `${members.length} 位员工 · 独立思考，自然协作` : members[0]?.role || '独立会话'}</small></Button><div className="chat-header-actions"><div className="member-avatars">{members.slice(0,4).map(agent => <Button variant="ghost" size="content" aria-label={`查看 ${agent.name}`} key={agent.id} onClick={() => onEmployee(agent)}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} small /></Button>)}</div><Button variant="ghost" size="icon-sm" aria-label="任务与产物" onClick={onActivity}><FolderOpen /></Button><Button variant="ghost" size="icon-sm" aria-label={conversation.kind === 'group' ? '群聊设置' : '员工设置'} onClick={onDetails}><MoreHorizontal /></Button></div></header>
    <div className="messages" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (following.current) setNewMessages(false); onScrollPosition(el.scrollTop) }}>
      {!detail.messages.length && <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} seed={a.id} avatar={a.avatar} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>}
      {detail.messages.map(message => { const agent = snapshot.agents.find(a => a.id === message.senderId); const quoted = detail.messages.find(m => m.id === message.replyToMessageId); return <article className={`message-row ${message.senderType}`} key={message.id} id={`message-${message.id}`}><div className="message-avatar">{message.senderType === 'user' ? <span className="avatar user-avatar">{message.origin?'定':'我'}</span> : <Avatar name={message.senderName || '系统'} seed={message.senderId} avatar={agent?.avatar} color={agent?.color} />}</div><div className="message-main"><div className="message-meta"><strong>{message.origin?message.senderName:message.senderType === 'user' ? '你' : message.senderName}</strong><time>{timeText(message.createdAt)}</time><Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${message.senderName} 的消息`} onClick={() => setDraft({ ...draft, replyId: message.id })}><Reply size={14} /></Button></div>{quoted && <div className="quoted-message">{quoted.senderName}：{quoted.content.slice(0,120)}</div>}<div className="message-bubble markdown">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <span title={href} className="markdown-link">{children}</span>, img: ({ alt }) => <span className="muted">[图片：{alt || '外部图片未加载'}]</span> }}>{message.content}</ReactMarkdown> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : <span className="muted">暂无公开内容</span>}</div>{message.status==='completed'&&message.runId&&detail.runs.find(r=>r.id===message.runId)?.backend&&<ExternalFiles runId={message.runId}/>} {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在任务记录中重试' : '回复失败，请查看任务记录'}</small>}</div></article> })}
      {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy} onApprove={onApprove} />)}
    </div>{newMessages && <Button variant="outline" size="sm" className="new-messages" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; following.current = true; setNewMessages(false) }}><ArrowDown size={14} />有新消息 · 返回最新</Button>}
    <div className="composer-wrap">{turn && <Button variant="ghost" size="content" className="turn-status" onClick={onActivity}>{active ? <LoaderCircle size={13} className="spinner" /> : <span className={`status-dot ${turn.status}`} />}<span>{turnLabels[turn.status]}</span>{latestByMember.size > 0 && <small>{[...latestByMember.values()].filter(d => ['evaluating','responding','waiting'].includes(d.status)).map(d => `${members.find(a => a.id === d.agentId)?.name ?? '员工'}${deliveryLabels[d.status]}`).join(' · ').slice(0,100)}</small>}<ChevronRight size={13} /></Button>}
      {(mentionsVisible || selectedMentions.length > 0) && conversation.kind === 'group' && <div className="mention-bar"><span>可选点名</span>{members.filter(a => a.active).map(a => <Button variant="secondary" size="content" key={a.id} className={`mention-chip${selectedMentions.includes(a.id) ? ' selected' : ''}`} aria-pressed={selectedMentions.includes(a.id)} onClick={() => setDraft({ ...draft, mentionIds: selectedMentions.includes(a.id) ? selectedMentions.filter(id => id !== a.id) : [...selectedMentions, a.id] })}>@{a.name}</Button>)}</div>}
      {reply && <div className="reply-preview"><Reply size={14} /><span>回复 {reply.senderName}：{reply.content.slice(0,100)}</span><Button variant="ghost" size="icon-sm" aria-label="取消引用" onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></Button></div>}
      <ChatComposer><ChatComposerInput aria-label="消息内容" placeholder={external?"描述明确任务，然后点击执行外部任务…":"说说你想完成什么，也可以简单打个招呼…"} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => { if (!external && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() } }} /><ComposerToolbar members={members} snapshot={snapshot} group={conversation.kind === 'group'} external={external} busy={busy} active={active} canSend={Boolean(draft.text.trim())} configurationLocked={configurationLocked} mentionsVisible={mentionsVisible} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)} onMentions={() => setMentionsVisible(!mentionsVisible)} onSettings={onSettings} onEmployee={onEmployee} onChangeAgent={onChangeAgent} onSend={onSend} onStop={onStop} /></ChatComposer>
    </div></div>
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean) => void; busy: boolean }) { return <Card className="approval-card gap-0 p-4"><CardContent className="p-0"><div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} 申请运行命令</strong></div><pre>{approval.command}</pre><p className="field-hint">工作目录：{approval.cwd}</p><p className="field-hint">命令使用应用的主机权限，请核对实际操作范围。</p><div className="button-row"><Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</Button><Button size="sm" disabled={busy} onClick={() => onApprove(approval.id, true)}>允许这次执行</Button></div></CardContent></Card> }

