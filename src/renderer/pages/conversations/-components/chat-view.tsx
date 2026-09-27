/*
 * [INPUT]: 会话领域类型、草稿、活动投影与消息组件。
 * [OUTPUT]: 聊天消息、输入和任务交互界面；普通发送与外部任务使用独立按钮样式。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ExternalFiles } from './external-files'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, AtSign, ChevronRight, FolderOpen, LoaderCircle, MoreHorizontal, Reply, ShieldCheck, Square, X } from '@/components/icons/index'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Approval, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import { Avatar, timeText } from '@/components/common/index'
import { activityRounds } from '@/pages/conversations/activity'

import { deliveryLabels, turnLabels, liveTurn, latestMemberDeliveries, type ChatDraft } from '../presentation'
export function ChatView({ detail, snapshot, draft, setDraft, busy, onSend, onStop, onDetails, onEmployee, onActivity, onSettings, onApprove, onOpenPath, scrollPosition, onScrollPosition }: { detail: ConversationDetail; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: (stopPrevious?: boolean) => void; onStop: () => void; onDetails: () => void; onEmployee: (agent: DigitalAgent) => void; onActivity: () => void; onSettings: () => void; onApprove: (id: string, approved: boolean) => void; onOpenPath: (path: string) => void; scrollPosition?: number; onScrollPosition: (position: number) => void }) {
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
  const missingModel = members.filter(a => a.active && a.executionBackend?.kind!=='acp-local' && !snapshot.connections.some(c => c.id === a.connectionId && (a.modelId || c.defaultModel) && (c.provider === 'openai-compatible' ? c.baseUrl : c.hasApiKey)))
  useLayoutEffect(() => { if (!scrollRef.current || initialized.current) return; const el = scrollRef.current; el.scrollTop = scrollPosition ?? el.scrollHeight; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; initialized.current = true }, [])
  useEffect(() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; if (following.current) { el.scrollTop = el.scrollHeight; setNewMessages(false) } else if (last) setNewMessages(true) }, [last?.content, last?.status, detail.messages.length, approvals.length])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => { if (el.clientHeight > 0 && following.current) el.scrollTop = el.scrollHeight })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div className="chat-panel"><header className="chat-header"><button className="chat-title" onClick={onDetails}><strong>{conversation.title}</strong><small>{conversation.kind === 'group' ? `${members.length} 位员工 · 独立思考，自然协作` : members[0]?.role || '独立会话'}</small></button><div className="chat-header-actions"><div className="member-avatars">{members.slice(0,4).map(agent => <button aria-label={`查看 ${agent.name}`} key={agent.id} onClick={() => onEmployee(agent)}><Avatar name={agent.name} color={agent.color} small /></button>)}</div><button className="icon-button" aria-label="任务与产物" onClick={onActivity}><FolderOpen size={19} /></button><button className="icon-button" aria-label={conversation.kind === 'group' ? '群聊设置' : '员工设置'} onClick={onDetails}><MoreHorizontal size={20} /></button></div></header>
    <div className="messages" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (following.current) setNewMessages(false); onScrollPosition(el.scrollTop) }}>
      {!detail.messages.length && <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>}
      {detail.messages.map(message => { const agent = members.find(a => a.id === message.senderId); const quoted = detail.messages.find(m => m.id === message.replyToMessageId); return <article className={`message-row ${message.senderType}`} key={message.id} id={`message-${message.id}`}><div className="message-avatar">{message.senderType === 'user' ? <span className="avatar user-avatar">{message.origin?'定':'我'}</span> : <Avatar name={message.senderName || '系统'} color={agent?.color} />}</div><div className="message-main"><div className="message-meta"><strong>{message.origin?message.senderName:message.senderType === 'user' ? '你' : message.senderName}</strong><time>{timeText(message.createdAt)}</time><button className="icon-button reply-action" aria-label={`引用 ${message.senderName} 的消息`} onClick={() => setDraft({ ...draft, replyId: message.id })}><Reply size={14} /></button></div>{quoted && <div className="quoted-message">{quoted.senderName}：{quoted.content.slice(0,120)}</div>}<div className="message-bubble markdown">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <span title={href} className="markdown-link">{children}</span>, img: ({ alt }) => <span className="muted">[图片：{alt || '外部图片未加载'}]</span> }}>{message.content}</ReactMarkdown> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : <span className="muted">暂无公开内容</span>}</div>{message.status==='completed'&&message.runId&&detail.runs.find(r=>r.id===message.runId)?.backend&&<ExternalFiles runId={message.runId}/>} {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在任务记录中重试' : '回复失败，请查看任务记录'}</small>}</div></article> })}
      {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy} onApprove={onApprove} />)}
    </div>{newMessages && <button className="new-messages" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; following.current = true; setNewMessages(false) }}><ArrowDown size={14} />有新消息 · 返回最新</button>}
    <div className="composer-wrap">{turn && <button className="turn-status" onClick={onActivity}>{active ? <LoaderCircle size={13} className="spinner" /> : <span className={`status-dot ${turn.status}`} />}<span>{turnLabels[turn.status]}</span>{latestByMember.size > 0 && <small>{[...latestByMember.values()].filter(d => ['evaluating','responding','waiting'].includes(d.status)).map(d => `${members.find(a => a.id === d.agentId)?.name ?? '员工'}${deliveryLabels[d.status]}`).join(' · ').slice(0,100)}</small>}<ChevronRight size={13} /></button>}
      {missingModel.length > 0 && <button className="composer-setup" onClick={onSettings}>需要配置模型：{missingModel.map(a => a.name).join('、')}<ChevronRight size={14} /></button>}
      {(mentionsVisible || selectedMentions.length > 0) && conversation.kind === 'group' && <div className="mention-bar"><span>可选点名</span>{members.filter(a => a.active).map(a => <button key={a.id} className={`mention-chip${selectedMentions.includes(a.id) ? ' selected' : ''}`} aria-pressed={selectedMentions.includes(a.id)} onClick={() => setDraft({ ...draft, mentionIds: selectedMentions.includes(a.id) ? selectedMentions.filter(id => id !== a.id) : [...selectedMentions, a.id] })}>@{a.name}</button>)}</div>}
      {reply && <div className="reply-preview"><Reply size={14} /><span>回复 {reply.senderName}：{reply.content.slice(0,100)}</span><button className="icon-button" aria-label="取消引用" onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></button></div>}
      <div className="composer"><textarea aria-label="消息内容" className="composer-input" rows={3} placeholder={external?"描述明确任务，然后点击执行外部任务…":"说说你想完成什么，也可以简单打个招呼…"} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => { if (!external && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() } }} /><div className="composer-footer"><div className="button-row"><button className="icon-button" aria-label="打开会话工作目录" onClick={() => onOpenPath(conversation.workspacePath)}><FolderOpen size={19} /></button>{conversation.kind === 'group' && <button className={`icon-button${mentionsVisible ? ' active' : ''}`} aria-label="提及成员" aria-expanded={mentionsVisible} onClick={() => setMentionsVisible(!mentionsVisible)}><AtSign size={19} /></button>}</div><div className="button-row">{active && <><button className="button subtle small" disabled={busy} onClick={onStop}><Square size={12} />停止本轮</button>{draft.text.trim() && <button className="text-button" disabled={busy} onClick={() => onSend(true)}>停止并发送</button>}</>}<button className={`send-button${external ? ' external' : ''}`} aria-label={external?"执行外部任务":"发送消息"} disabled={busy || !draft.text.trim()} onClick={() => onSend()}>{busy ? <LoaderCircle size={18} className="spinner" /> : external?'执行外部任务':<ArrowUp size={20} />}</button></div></div></div><div className="composer-hint"><span>{external?"仅显式任务 · 外部自有工具 · 点击按钮执行":"Enter 发送 · Shift + Enter 换行"}</span><button onClick={onActivity}>{currentRound?.runs.length ?? 0} 条本轮记录<ChevronRight size={12} /></button></div>
    </div></div>
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean) => void; busy: boolean }) { return <div className="approval-card"><div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} 申请运行命令</strong></div><pre>{approval.command}</pre><p className="field-hint">工作目录：{approval.cwd}</p><p className="field-hint">命令使用应用的主机权限，请核对实际操作范围。</p><div className="button-row"><button className="button subtle small" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</button><button className="button primary small" disabled={busy} onClick={() => onApprove(approval.id, true)}>允许这次执行</button></div></div> }

