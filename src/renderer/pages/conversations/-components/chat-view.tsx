/*
 * [INPUT]: 会话领域类型、草稿、活动投影、会话标题菜单、共享 ScrollFade/Markdown/Shiki 与统一 UI 基础组件。
 * [OUTPUT]: 核心会话接入按工作身份隔离的团队交付/显式恢复卡片，隐藏主页面暂停读取；按稳定 user 身份展示当前个人头像，自动化来源独立，引用本人显示你；标题成员资料接入同一资料快照与群配置入口；姓名/消息提及插入实际行内标签，无独立提及栏；头像资料与悬停时间、Prompt Bar @ /、镜像卡片与共享 Soft 输入/渐隐。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { UserAvatar } from '@/components/common/user-avatar'
import { isPersonalMessage, messageDisplayName } from '@shared/domain/profile'
import { Card, CardContent } from '@/components/ui/card'
import { isCoreConversation } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { CoreTeamResults } from './core-team-results'

import { Button } from '@/components/ui/button'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { PromptBar, type PromptBarHandle } from './prompt-bar'
import { ExternalFiles } from './external-files'
import { ComposerToolbar, type ComposerAgentPatch } from './composer-toolbar'
import { ConversationHeader } from './conversation-header'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Workflow, Reply, ShieldCheck, X } from '@/components/icons/index'
import { Markdown } from '@/components/common/markdown'
import type { Approval, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common/index'

import { liveTurn, type ChatDraft } from '../presentation'
import { artifactsByMessage, approvalsByMessage, continuesMessage, groupMessages } from '../group-chat'
import { ArtifactList } from './artifact-list'
import { MessageCard } from './message-card'
import { AgentInfoPopover } from './agent-info-popover'
import { draftContent } from '../inline-mentions'
export function ChatView({ api, pageActive, onTeamGroup, detail, snapshot, draft, setDraft, busy, onSend, onStop, onDetails, onChangeConversationList, onClear, onActivity, onTrace, onSettings, onChangeAgent, configurationLocked, onApprove, onOpenPath, focusMessage, scrollPosition, onScrollPosition }: { api: DesktopApi; pageActive: boolean; onTeamGroup(id: string): void; detail: ConversationDetail; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: (stopPrevious?: boolean) => void; onStop: () => void; onDetails: () => void; onChangeConversationList: (change: ConversationListChange) => void; onClear: (id: string, hide: boolean) => Promise<void>; onActivity: () => void; onTrace: (message?: ConversationDetail['messages'][number]) => void; onSettings: () => void; onChangeAgent: (agent: DigitalAgent, patch: ComposerAgentPatch) => void; configurationLocked: boolean; onApprove: (id: string, approved: boolean) => void; onOpenPath: (path: string) => void; focusMessage?: { id: string; requestId: string }; scrollPosition?: number; onScrollPosition: (position: number) => void }) {
  const conversation = detail.conversation
  const group = conversation.kind === 'group'
  const messages = group ? groupMessages(detail) : detail.messages
  const files = artifactsByMessage(detail)
  const approvalGroups = approvalsByMessage(detail, snapshot.approvals)
  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const [newMessages, setNewMessages] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), following = useRef(scrollPosition === undefined), initialized = useRef(false), focusedRequest = useRef<string | undefined>(undefined)
  const approvals = snapshot.approvals.filter(a => a.conversationId === conversation.id)
  const activeRuns = detail.runs.filter(run => ['queued','running','waiting_approval'].includes(run.status))
  const activeTurns = detail.turns?.filter(turn => liveTurn(turn.status)) ?? []
  const active = activeRuns.length > 0 || activeTurns.length > 0
  const composerRef = useRef<PromptBarHandle>(null)
  const mention = (id: string) => composerRef.current?.mention(id)
  const reply = detail.messages.find(m => m.id === draft.replyId)
  const last = detail.messages.at(-1)
  const external=conversation.kind==='direct'&&members[0]?.executionBackend?.kind==='acp-local'
  useLayoutEffect(() => { if (!scrollRef.current || initialized.current) return; const el = scrollRef.current; el.scrollTop = scrollPosition ?? el.scrollHeight; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; initialized.current = true }, [])
  useLayoutEffect(() => {
    if (!focusMessage || focusedRequest.current === focusMessage.requestId) return
    const message = document.getElementById(`message-${focusMessage.id}`)
    if (!message || !scrollRef.current?.contains(message)) return
    focusedRequest.current = focusMessage.requestId
    following.current = false; setNewMessages(false)
    message.scrollIntoView({ block: 'center' }); message.focus({ preventScroll: true })
  }, [focusMessage, detail.messages])
  useEffect(() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; if (following.current) { el.scrollTop = el.scrollHeight; setNewMessages(false) } else if (last) setNewMessages(true) }, [last?.content, last?.status, detail.messages.length, approvals.length])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => { if (el.clientHeight > 0 && following.current) el.scrollTop = el.scrollHeight })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div className={`chat-panel${group ? ' group-chat' : ''}`}>
    <ConversationHeader members={members} resources={snapshot.resources} conversation={snapshot.conversations.find(item => item.id === conversation.id) ?? conversation} busy={busy} onDetails={onDetails} onActivity={onActivity} onTrace={() => onTrace()} onChange={onChangeConversationList} onClear={onClear} />
    {focusMessage && !detail.messages.some(message => message.id === focusMessage.id) && <p role="status" className="field-hint">这条结果消息已被清理或不可用。当前显示保留的聊天记录。</p>}
    <ScrollFade className="messages" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (following.current) setNewMessages(false); onScrollPosition(el.scrollTop) }}>
      {!detail.messages.length && <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} seed={a.id} avatar={a.avatar} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>}
      {messages.map((message, index) => {
        const agent = snapshot.agents.find(value => value.id === message.senderId)
        const quoted = detail.messages.find(value => value.id === message.replyToMessageId)
        const previous = messages[index - 1]
        const attachedApprovals = group ? approvalGroups.byMessage.get(message.id) ?? [] : []
        const continued = group && continuesMessage(previous, message, Boolean(attachedApprovals.length || previous && approvalGroups.byMessage.has(previous.id)))
        const sender = messageDisplayName(message)
        const useCard = group && message.senderType !== 'system'
        const canMention = group && message.senderType === 'agent' && agent?.active && members.some(member => member.id === agent.id)
        const mentioned = members.filter(member => message.mentionIds?.includes(member.id))
        const body = <>
            {message.replyToMessageId && <div className="quoted-message">{quoted ? <><strong>{group ? '回复 ' : ''}{messageDisplayName(quoted)}：</strong><span>{(group ? quoted.content.trim().split('\n')[0] : quoted.content).slice(0, 120)}</span></> : '原消息已不可用'}</div>}
            <div className="message-bubble markdown">{group && !!mentioned.length && <span className="message-mentions">{mentioned.map(member => <button type="button" className="message-mention" key={member.id} onClick={() => mention(member.id)}>@{member.name}</button>)}</span>}{message.content ? <Markdown>{message.content}</Markdown> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : <span className="muted">暂无公开内容</span>}</div>
            {group && !!files.get(message.id)?.length && <ArtifactList artifacts={files.get(message.id)!} onOpenPath={onOpenPath} />}
            {message.status === 'completed' && message.runId && detail.runs.find(run => run.id === message.runId)?.backend && <ExternalFiles runId={message.runId} />}
            {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在执行过程中查看' : '回复失败，请查看执行过程'}</small>}
        </>
        return <article className={`message-row ${message.senderType}${continued ? ' message-continuation' : ''}${focusMessage?.id === message.id ? ' message-target' : ''}`} aria-label={`${sender} ${timeText(message.createdAt)}`} tabIndex={-1} key={message.id} id={`message-${message.id}`}>
          <div className="message-avatar">{isPersonalMessage(message) ? <UserAvatar profile={snapshot.userProfile} /> : message.senderType === 'user' ? <span className="avatar automation-avatar" aria-hidden="true">定</span> : group && message.senderType === 'system' ? <span className="avatar system-avatar" aria-hidden="true">·</span> : group && agent ? <AgentInfoPopover agent={agent} resources={snapshot.resources} /> : <Avatar name={message.senderName || '系统'} seed={message.senderId} avatar={agent?.avatar} color={agent?.color} />}</div>
          <div className="message-main">
            <div className="message-meta">
              {canMention ? <Button variant="ghost" size="content" className="message-author" aria-label={`提及 ${sender}`} onClick={() => mention(agent!.id)}><span className="message-author-at" aria-hidden="true">@</span><strong>{sender}</strong></Button> : <strong>{sender}</strong>}
              <time dateTime={message.createdAt}>{timeText(message.createdAt)}</time>
              {!useCard && message.senderType === 'agent' && <Button variant="ghost" size="icon-sm" className="trace-action" aria-label={`查看 ${messageDisplayName(message)} 的执行过程`} title="查看执行过程" onClick={() => onTrace(message)}><Workflow size={14} /></Button>}
              {!useCard && <Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${messageDisplayName(message)} 的消息`} onClick={() => setDraft({ ...draft, replyId: message.id })}><Reply size={14} /></Button>}
            </div>
            {useCard ? <MessageCard message={message} onReply={() => setDraft({ ...draft, replyId: message.id })} onTrace={() => onTrace(message)}>{body}</MessageCard> : body}
            {attachedApprovals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy} onApprove={onApprove} />)}
          </div>
        </article>
      })}
      {isCoreConversation(conversation) && <CoreTeamResults api={api} detail={detail} snapshot={snapshot} active={pageActive} busy={busy} onGroup={onTeamGroup} />}
      {(group ? approvalGroups.pending : approvals).map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy} onApprove={onApprove} />)}
    </ScrollFade>{newMessages && <Button variant="outline" size="sm" className="new-messages" onClick={() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; following.current = true; setNewMessages(false) }}><ArrowDown size={14} />有新消息 · 返回最新</Button>}
    <div className="composer-wrap">
      {reply && <div className="reply-preview">{!group && <Reply size={14} />}<Button variant="ghost" size="icon-sm" className={!group ? 'order-last' : undefined} aria-label="取消引用" onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></Button><span>回复 {messageDisplayName(reply)}：{reply.content.trim().replace(/\s+/g, ' ').slice(0, 160)}</span></div>}
      <PromptBar ref={composerRef} draft={draft} setDraft={setDraft} members={members} group={group} external={external} placeholder={group ? `发消息给 ${conversation.title}，@ 提及 · / 命令` : external ? '描述明确任务，然后点击执行外部任务…' : '说说你想完成什么，/ 查看命令…'} onSend={onSend} onActivity={onActivity} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)}>
        {(openMenu, menu) => <ComposerToolbar members={members} snapshot={snapshot} group={group} external={external} busy={busy} active={active} canSend={Boolean(draftContent(draft))} configurationLocked={configurationLocked} mentionsVisible={menu === 'at'} commandsVisible={menu === 'slash'} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)} onMentions={() => openMenu('at')} onCommands={() => openMenu('slash')} onSettings={onSettings} onChangeAgent={onChangeAgent} onSend={onSend} onStop={onStop} />}
      </PromptBar>
    </div></div>
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean) => void; busy: boolean }) { return <Card className="approval-card gap-0 p-4" data-approval-id={approval.id} role="region" aria-label={`${approval.agentName} 的命令审批`}><CardContent className="p-0"><div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} 申请运行命令</strong><small className="approval-status">待确认</small></div><pre>{approval.command}</pre><p className="field-hint">工作目录：{approval.cwd}</p><p className="field-hint">命令使用应用的主机权限，请核对实际操作范围。</p><div className="button-row"><Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</Button><Button size="sm" disabled={busy} onClick={() => onApprove(approval.id, true)}>允许这次执行</Button></div></CardContent></Card> }
