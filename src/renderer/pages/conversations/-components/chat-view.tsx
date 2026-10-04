/*
 * [OUTPUT]: 原员工交付消息直接采用/稍后验收并核对未知结果；要求修改进入同一composer固定文件版本与员工，审批保留员工身份，右侧只读预览。
 * [INPUT]: 会话领域类型、原问题关联/未决补充、草稿、活动投影、会话标题菜单、共享 ScrollFade/Markdown/Shiki 与统一 UI 基础组件。
 * [OUTPUT]: 失败判断沿原触发消息展示可读原因及执行入口；同会话固定定位清除最新页资格并恢复双向分页。
 * [OUTPUT]: 失效原消息仅展示已关联材料名称和核对入口，不展示失效正文；同原件恢复沿固定材料详情显式核对。
 * [OUTPUT]: core 原讨论展示真实群协作/独立员工入口，显式恢复只核对原操作，不自动导航或续行。
 * [OUTPUT]: 按真实 Approval.kind 展示网页审批目标/页面变化说明，主机命令仍显示工作目录和权限。
 * [OUTPUT]: 聊天标题下不再挂载浏览器窗口条或 New Tab 按钮；打开/查看统一使用全局 header 浏览器图标，控制保留在独立浏览器窗口。
 * [OUTPUT]: 原问题消息卡/引用共用现有composer定向补充，未知请求在原聊天只读核对，材料/成员提及不得隐式丢失；composer不展示停止按钮，发送仅提交消息；核心会话标题菜单传递明确会话编辑入口、普通会话保留置顶；缺失固定消息窗口保持空态，不展示定位诊断提示；消息成果接入固定版本应用内预览，打开不采用；材料草稿/原生drop/真实消息附件随当前聊天发送、未知发送核对和仅可检查来源行引用；单聊与群聊共用消息卡片、无状态标签并可跳转对应员工配置的头像资料浮层、工具条、引用预览及按明确归属展示的文件/审批/连续发言；滚动边界自动有界加载、同游标单次请求和失败不循环，滚动同步本机锚点、补页保持当前位置且旧页底部不误跟随最新，空更早页保留原最新资格并仅在仍贴底时恢复跟随；保留手动滚动/自动跟随，局部有符号锚点保留顶部留白，宿主持久锚点仍使用非负偏移；标题栏不展示阅读状态、说明或上下跳转按钮，不挤移消息渐隐；真实完成可见观测和独立稳定锚点；旧历史保留原阅读状态语义；核心会话接入按工作身份隔离的团队交付/显式恢复卡片，隐藏主页面暂停读取；按稳定 user 身份展示当前配置姓名和可点击圆角方形个人头像，自动化来源独立，引用和工具条共用当前姓名；群聊姓名/消息提及插入实际行内标签，单聊保留模型/权限与输入边界。
 * [OUTPUT]: 图片/文件粘贴与拖拽沿当前聊天发送范围和稳定回执，草稿/消息显示宿主核对的缩略图与文件卡；不按模型视觉能力筛选。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [OUTPUT]: 图片附件位于composer内部文本上方，悬停/键盘焦点右上角删除，点击与消息图片共用全屏预览；移除常驻容量说明。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { UserInfoPopover } from './user-info-popover'
import { isPersonalMessage, messageDisplayName } from '@shared/domain/profile'
import { Card, CardContent } from '@/components/ui/card'
import { isCoreConversation } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { CoreTeamResults } from './core-team-results'
import { CoreCollaborationResults } from './core-collaboration-results'

import { Button } from '@/components/ui/button'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { PromptBar, type PromptBarHandle } from './prompt-bar'
import { ExternalFiles } from './external-files'
import { ComposerToolbar, type ComposerAgentPatch } from './composer-toolbar'
import { ConversationHeader } from './conversation-header'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Reply, ShieldCheck, X } from '@/components/icons/index'
import type { Approval, Artifact, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@shared/domain/materials'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common/index'

import { failureSummary, liveTurn, type ChatDraft } from '../presentation'
import { artifactsByMessage, approvalsByMessage, continuesMessage, groupMessages } from '../group-chat'
import { ChatArtifactCard, PendingArtifactActions } from './chat-artifact-card'
import type { ChatArtifacts, ChatArtifactRevisionTarget } from '../use-chat-artifacts'
import { artifactRevisionTarget } from '@/components/detail-panel/artifact-state'
import { SelectField } from '@/components/ui/select-field'
import type { ArtifactRevisionInput } from '@shared/domain/artifacts'
import { MessageCard } from './message-card'
import { AgentInfoPopover } from './agent-info-popover'
import { draftContent } from '../inline-mentions'
import { MaterialDraftBar, SentMaterialList, type MaterialDraftItem } from './material-list'
import { MaterialMarkdown } from './material-citations'
import { materialDisplayName } from './material-draft'
import type { ConversationReadingState, ConversationView } from '@shared/domain/reading'
import { Banner } from '@/components/common'
import { useConversationReading } from './use-conversation-reading'
import { READING_UI_LIMITS } from '../reading-state'
import { chatQuestions, questionRequestTarget, type ChatQuestionTarget } from '../question-state'
import { ChatQuestionCard, PendingQuestionReplies, type ChatQuestionReplies } from '../question-reply'
export function ChatView({ api, pageActive, questionReplies, artifactActions, onTeamGroup, detail, snapshot, draft, setDraft, busy, onSend, onDetails, onConfigureAgent, onChangeConversationList, onEditTitle, onClear, onActivity, onTrace, onSettings, onProfile, onChangeAgent, configurationLocked, onApprove, onOpenPath, onPreviewArtifact, onAddMaterial, onDropMaterials, onPasteMaterials, onRemoveMaterial, onRetryMaterial, onPreviewMaterial, onDiscardSubmission, focusMessage, scrollPosition, onScrollPosition, onSearch, onReading, onLocation, onPage, paging, pageEdges, restoreAnchor }: { api: DesktopApi; pageActive: boolean; questionReplies: ChatQuestionReplies; artifactActions: ChatArtifacts; onTeamGroup(id: string): void; detail: ConversationView; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: () => void; onDetails: () => void; onConfigureAgent: (agent: DigitalAgent) => void; onChangeConversationList: (change: ConversationListChange) => void; onEditTitle: (conversation: Conversation) => void; onClear: (id: string, hide: boolean) => Promise<void>; onActivity: () => void; onTrace: (message?: ConversationDetail['messages'][number]) => void; onSettings: () => void; onProfile: () => void; onChangeAgent: (agent: DigitalAgent, patch: ComposerAgentPatch) => void; configurationLocked: boolean; onApprove: (id: string, approved: boolean) => void; onOpenPath: (path: string) => void; onPreviewArtifact(artifact: Artifact): void; onAddMaterial(): void; onDropMaterials(files: File[]): void; onPasteMaterials(files?: File[]): void; onRemoveMaterial(item: MaterialDraftItem): void; onRetryMaterial(item: MaterialDraftItem): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void; onDiscardSubmission(): void; focusMessage?: { id: string; requestId: string }; scrollPosition?: number; onScrollPosition: (position: number) => void; onSearch(): void; onReading(state: ConversationReadingState): void; onLocation(messageId: string | undefined, following: boolean, offset?: number): void; onPage(direction: 'before' | 'after'): void; paging: boolean; pageEdges: { before: boolean; after: boolean }; restoreAnchor?: { messageId: string; offset?: number } }) {
  const conversation = detail.conversation
  const group = conversation.kind === 'group'
  const questions = chatQuestions(detail)
  const questionPending = Object.values(questionReplies.values).some(request => request.conversationId === conversation.id)
  const artifactRequests = Object.values(artifactActions.values).filter(value => value.conversationId === conversation.id && (value.revision || value.adoption || value.acceptance))
  const artifactRevisionPending = artifactRequests.some(value => value.revision)
  const replyMode = Boolean(draft.questionReply || questionPending || draft.artifactRevision || artifactRevisionPending)
  const sendingLocked = busy || questionReplies.busy || questionPending || artifactRevisionPending || Boolean(draft.submission)
  const messages = groupMessages(detail)
  const messageRows = detail.messagePage.items.map(item => ({ item, message: messages.find(message => message.id === item.messageId) }))
  const files = artifactsByMessage(detail)
  const approvalGroups = approvalsByMessage(detail, snapshot.approvals)
  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const materialsAllowed = !replyMode && !members.some(member => member.executionBackend?.kind === 'acp-local') && members.length > 0
  const materialDrafts = draft.materials ?? []
  const canSend = !questionPending && !artifactRevisionPending && (!draft.artifactRevision || Boolean(artifactRevisionTarget(members.find(value => value.id === draft.artifactRevision!.targetAgentId), snapshot.connections))) && (!draft.questionReply || !questionReplies.storageError) && !draft.submission && materialDrafts.every(item => item.status === 'ready' && item.material?.status === 'ready' && !item.busy) && Boolean(draftContent(draft) || materialDrafts.length)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), following = useRef(!restoreAnchor), initialized = useRef(false), focusedRequest = useRef<string | undefined>(undefined), localAnchor = useRef<{ messageId: string; offset?: number } | undefined>(restoreAnchor)
  const latestPage = useRef(!restoreAnchor && !focusMessage), beforeLatestPage = useRef(false), lastScrollTop = useRef(0), pageRequests = useRef({ before: '', after: '' }), touchY = useRef<number | undefined>(undefined)
  const reading = useConversationReading({ api, active: pageActive, view: detail, root: scrollRef, following, onReading, onLocation })
  const approvals = snapshot.approvals.filter(a => a.conversationId === conversation.id)
  const activeRuns = detail.runs.filter(run => ['queued','running','waiting_approval'].includes(run.status))
  const activeTurns = detail.turns?.filter(turn => liveTurn(turn.status)) ?? []
  const active = activeRuns.length > 0 || activeTurns.length > 0
  const composerRef = useRef<PromptBarHandle>(null)
  const mention = (id: string) => { if (!replyMode && !sendingLocked) composerRef.current?.mention(id) }
  const answer = (target: ChatQuestionTarget) => { if (!sendingLocked && pageActive) { setDraft({ ...draft, replyId: target.questionMessageId, questionReply: target, artifactRevision: undefined }); composerRef.current?.focus() } }
  const quote = (messageId: string) => {
    if (sendingLocked || !pageActive) return
    const question = questions.find(question => question.questionMessageId === messageId && !question.answeredMessageId)
    if (question) answer(question)
    else { setDraft({ ...draft, replyId: messageId, questionReply: undefined, artifactRevision: undefined }); composerRef.current?.focus() }
  }
  const revise = (target: ChatArtifactRevisionTarget) => {
    if (sendingLocked || !pageActive) return
    const author = members.find(member => member.id === target.targetAgentId)
    setDraft({ ...draft, replyId: undefined, questionReply: undefined, artifactRevision: { ...target, targetAgentId: artifactRevisionTarget(author, snapshot.connections) ? target.targetAgentId : '' } })
    composerRef.current?.focus()
  }
  const restoreRevision = (input: ArtifactRevisionInput, logicalArtifactId: string) => {
    const artifact = detail.artifacts.find(value => value.id === input.artifactId)
    setDraft({ ...draft, text: draft.text.trim() ? draft.text : input.content, replyId: undefined, questionReply: undefined, artifactRevision: { artifactId: input.artifactId, logicalArtifactId, contentHash: input.contentHash, contentVersion: artifact?.contentVersion, name: artifact?.name ?? '原成果', targetAgentId: artifactRevisionTarget(members.find(member => member.id === input.targetAgentId), snapshot.connections) ? input.targetAgentId : '' } })
    composerRef.current?.focus()
  }
  const visibleArtifactIds = new Set([...files.values()].flat().map(value => value.id))
  const pendingArtifactId = (value: typeof artifactRequests[number]) => value.revision?.input.artifactId ?? value.adoption?.input.artifactId ?? value.acceptance?.input.artifactId
  const reply = detail.messages.find(m => m.id === draft.replyId)
  const last = detail.messages.at(-1)
  const external=conversation.kind==='direct'&&members[0]?.executionBackend?.kind==='acp-local'
  const captureAnchor = (el: HTMLDivElement) => {
    const viewport = el.getBoundingClientRect()
    const row = [...el.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.getBoundingClientRect().bottom > viewport.top)
    if (row?.dataset.readingMessageId) localAnchor.current = { messageId: row.dataset.readingMessageId, offset: Math.round(viewport.top - row.getBoundingClientRect().top) }
  }
  const loadAtEdge = (direction: 'before' | 'after') => {
    const el = scrollRef.current
    if (!el || !pageActive || document.visibilityState !== 'visible' || !document.hasFocus() || paging || !pageEdges[direction]) return
    if (direction === 'after' && latestPage.current) return
    const distance = direction === 'before' ? el.scrollTop : el.scrollHeight - el.scrollTop - el.clientHeight
    const cursor = direction === 'before' ? detail.messagePage.beforeCursor : detail.messagePage.afterCursor
    if (distance > READING_UI_LIMITS.historyEdgeDistance || !cursor) return
    const key = `${detail.reading.epoch}:${cursor.sequence}:${cursor.id}`
    if (pageRequests.current[direction] === key) return
    pageRequests.current[direction] = key
    if (direction === 'before') beforeLatestPage.current = latestPage.current
    captureAnchor(el); following.current = false; latestPage.current = false
    onLocation(localAnchor.current?.messageId, false, localAnchor.current?.offset)
    onPage(direction)
  }
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !pageActive) return
    if (focusMessage && focusedRequest.current !== focusMessage.requestId) return
    const anchor = localAnchor.current
    const row = anchor && [...el.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.dataset.readingMessageId === anchor.messageId)
    if (row && !following.current) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top + (anchor?.offset ?? 0)
    else if (!initialized.current || following.current) el.scrollTop = el.scrollHeight
    initialized.current = true
    lastScrollTop.current = el.scrollTop
  }, [pageActive, detail.messagePage, focusMessage])
  useLayoutEffect(() => {
    if (!pageActive || !focusMessage || focusedRequest.current === focusMessage.requestId) return
    const message = document.getElementById(`message-${focusMessage.id}`)
    if (!message || !scrollRef.current?.contains(message)) return
    focusedRequest.current = focusMessage.requestId
    latestPage.current = false; beforeLatestPage.current = false; pageRequests.current = { before: '', after: '' }
    following.current = false
    message.scrollIntoView({ block: 'center' }); message.focus({ preventScroll: true })
    lastScrollTop.current = scrollRef.current.scrollTop
  }, [focusMessage, detail.messagePage, pageActive])
  useEffect(() => {
    const noNewer = !pageEdges.after && pageRequests.current.after
    const noOlderAtLatest = !pageEdges.before && pageRequests.current.before && beforeLatestPage.current
    if (paging || !pageActive || !(noNewer || noOlderAtLatest)) return
    latestPage.current = true
    const el = scrollRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < READING_UI_LIMITS.historyEdgeDistance) { following.current = true; onLocation(undefined, true) }
  }, [paging, pageEdges.before, pageEdges.after, pageActive, onLocation])
  useEffect(() => { const el = scrollRef.current; if (!el || el.clientHeight === 0) return; if (following.current) { el.scrollTop = el.scrollHeight; lastScrollTop.current = el.scrollTop } }, [last?.content, last?.status, detail.messages.length, approvals.length])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => { if (el.clientHeight > 0 && following.current) { el.scrollTop = el.scrollHeight; lastScrollTop.current = el.scrollTop } })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div className={`chat-panel${group ? ' group-chat' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}>
    <ConversationHeader members={members} resources={snapshot.resources} conversation={snapshot.conversations.find(item => item.id === conversation.id) ?? conversation} busy={busy} onDetails={onDetails} onConfigureAgent={onConfigureAgent} onActivity={onActivity} onTrace={() => onTrace()} onSearch={onSearch} onChange={onChangeConversationList} onEditTitle={onEditTitle} onClear={onClear} />
    {reading.error && <Banner>{reading.error}<Button variant="link" size="sm" onClick={() => void reading.check()}>核对阅读状态</Button></Banner>}
    <ScrollFade className="messages" ref={scrollRef} aria-busy={paging}
      onScroll={() => {
        const el = scrollRef.current
        if (!el || el.clientHeight === 0) return
        const delta = el.scrollTop - lastScrollTop.current
        lastScrollTop.current = el.scrollTop
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (el.scrollTop > READING_UI_LIMITS.historyEdgeDistance) pageRequests.current.before = ''
        if (bottom > READING_UI_LIMITS.historyEdgeDistance) pageRequests.current.after = ''
        following.current = latestPage.current && bottom < READING_UI_LIMITS.historyEdgeDistance
        onScrollPosition(el.scrollTop); captureAnchor(el)
        onLocation(localAnchor.current?.messageId, following.current, localAnchor.current?.offset)
        if (delta < 0) loadAtEdge('before')
        else if (delta > 0) loadAtEdge('after')
      }}
      onWheel={event => { if (event.deltaY < 0) loadAtEdge('before'); else if (event.deltaY > 0) loadAtEdge('after') }}
      onTouchStart={event => { touchY.current = event.touches[0]?.clientY }}
      onTouchMove={event => { const y = event.touches[0]?.clientY, previous = touchY.current; touchY.current = y; if (y === undefined || previous === undefined) return; if (y > previous) loadAtEdge('before'); else if (y < previous) loadAtEdge('after') }}
      onKeyDown={event => { if (event.defaultPrevented) return; if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) loadAtEdge('before'); else if (['ArrowDown', 'PageDown', 'End'].includes(event.key)) loadAtEdge('after') }}>
      {!detail.messagePage.items.length && <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} seed={a.id} avatar={a.avatar} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>}
      {messageRows.map(({ item, message }, index) => {
        if (!message) return <article key={item.messageId} id={`message-${item.messageId}`} data-reading-message-id={item.messageId} className={focusMessage?.id === item.messageId ? 'message-target' : undefined} tabIndex={-1}>
          <Banner>{item.reason ?? '这条内容已被清理或不可用。'}</Banner>
          {(detail.materials ?? []).filter(material => material.messageId === item.messageId && ['ready', 'unavailable'].includes(material.status)).map(material => <Button key={material.id} variant="link" size="sm" aria-label={`核对材料 ${materialDisplayName(material.name)}`} onClick={() => onPreviewMaterial(material)}>核对材料：{materialDisplayName(material.name)}</Button>)}
        </article>
        const agent = snapshot.agents.find(value => value.id === message.senderId)
        const quoted = detail.messages.find(value => value.id === message.replyToMessageId)
        const previous = messageRows[index - 1]?.message
        const attachedApprovals = approvalGroups.byMessage.get(message.id) ?? []
        const continued = continuesMessage(previous, message, Boolean(attachedApprovals.length || previous && approvalGroups.byMessage.has(previous.id)))
        const sender = messageDisplayName(message, snapshot.userProfile)
        const useCard = message.senderType !== 'system'
        const canMention = !replyMode && !sendingLocked && group && message.senderType === 'agent' && agent?.active && members.some(member => member.id === agent.id)
        const mentioned = members.filter(member => message.mentionIds?.includes(member.id))
        const body = <>
            {message.replyToMessageId && <div className="quoted-message">{quoted ? <><strong>回复 {messageDisplayName(quoted, snapshot.userProfile)}：</strong><span>{quoted.content.trim().split('\n')[0].slice(0, 120)}</span></> : '原消息已不可用'}</div>}
            <div className="message-bubble markdown">{group && !!mentioned.length && <span className="message-mentions">{mentioned.map(member => <button type="button" className="message-mention" key={member.id} onClick={() => mention(member.id)}>@{member.name}</button>)}</span>}{message.content ? <MaterialMarkdown message={message} detail={detail} onPreview={onPreviewMaterial} /> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : !message.materialIds?.length && <span className="muted">暂无公开内容</span>}</div>
            {!!message.materialIds?.length && <><SentMaterialList api={api} pageActive={pageActive} materials={(detail.materials ?? []).filter(material => message.materialIds?.includes(material.id))} onPreview={onPreviewMaterial} />{message.materialIds.some(id => !detail.materials?.some(material => material.id === id)) && <p role="status" className="field-hint">部分材料已清理或不可用。</p>}</>}
            {files.get(message.id)?.map(artifact => <ChatArtifactCard key={artifact.id ?? artifact.path} api={api} artifact={artifact} conversationId={conversation.id} active={pageActive} actions={artifactActions} busy={sendingLocked} onOpenPath={onOpenPath} onPreview={onPreviewArtifact} onRevise={revise} />)}
            {artifactRequests.filter(value => files.get(message.id)?.some(artifact => artifact.id === pendingArtifactId(value))).map(value => <PendingArtifactActions key={JSON.stringify([value.scope, value.logicalArtifactId])} pending={value} artifacts={detail.artifacts} actions={artifactActions} active={pageActive} onRestoreRevision={restoreRevision} />)}
            {message.status === 'completed' && message.runId && detail.runs.find(run => run.id === message.runId)?.backend && <ExternalFiles runId={message.runId} />}
            {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在执行过程中查看' : '回复失败，请查看执行过程'}</small>}
        </>
        return <article className={`message-row ${message.senderType}${continued ? ' message-continuation' : ''}${focusMessage?.id === message.id ? ' message-target' : ''}`} aria-label={`${sender} ${timeText(message.createdAt)}`} tabIndex={-1} key={message.id} id={`message-${message.id}`} data-reading-message-id={message.id}>
          <div className="message-avatar">{isPersonalMessage(message) ? <UserInfoPopover profile={snapshot.userProfile} onProfile={onProfile} /> : message.senderType === 'user' ? <span className="avatar automation-avatar" aria-hidden="true">定</span> : message.senderType === 'system' ? <span className="avatar system-avatar" aria-hidden="true">·</span> : agent ? <AgentInfoPopover agent={agent} resources={snapshot.resources} onConfigure={() => onConfigureAgent(agent)} /> : <Avatar name={message.senderName || '系统'} seed={message.senderId} />}</div>
          <div className="message-main">
            <div className="message-meta">
              {canMention ? <Button variant="ghost" size="content" className="message-author" aria-label={`提及 ${sender}`} onClick={() => mention(agent!.id)}><span className="message-author-at" aria-hidden="true">@</span><strong>{sender}</strong></Button> : <strong>{sender}</strong>}
              <time dateTime={message.createdAt}>{timeText(message.createdAt)}</time>
              {!useCard && <Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${messageDisplayName(message, snapshot.userProfile)} 的消息`} disabled={sendingLocked} onClick={() => quote(message.id)}><Reply size={14} /></Button>}
            </div>
            {useCard ? <MessageCard message={message} profile={snapshot.userProfile} onReply={() => quote(message.id)} onTrace={() => onTrace(message)}>{body}</MessageCard> : body}
            {message.senderType === 'user' && detail.runs.filter(run => run.triggerMessageId === message.id && run.phase === 'decision' && ['failed', 'interrupted'].includes(run.status) && !detail.runs.some(next => next.triggerMessageId === message.id && next.agentId === run.agentId && next.phase === run.phase && next.createdAt > run.createdAt)).map(run => <div key={run.id} role="status" className="field-hint"><span>{run.agentName}：{run.error ? failureSummary(run.error) : '处理已中断，请查看执行过程。'}</span><Button variant="link" size="sm" onClick={() => onTrace(message)}>查看执行过程</Button></div>)}
            {questions.filter(question => question.questionMessageId === message.id).map(question => <ChatQuestionCard key={question.questionId} question={question} busy={sendingLocked} active={pageActive} pending={questionReplies.values[question.itemId]} unavailableReason={!agent?.active || !members.some(member => member.id === agent.id) ? '原员工已停用或移出聊天，请核对员工设置。' : undefined} onReply={answer} />)}
            {attachedApprovals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy || !pageActive} onApprove={onApprove} />)}
          </div>
        </article>
      })}
      {isCoreConversation(conversation) && <CoreTeamResults api={api} detail={detail} snapshot={snapshot} active={pageActive} busy={busy} onGroup={onTeamGroup} />}
      {isCoreConversation(conversation) && <CoreCollaborationResults api={api} conversationId={conversation.id} snapshot={snapshot} active={pageActive} busy={busy} onGroup={onTeamGroup} onAgent={onConfigureAgent} />}
      {approvalGroups.pending.map(approval => <article key={approval.id} className="message-row agent"><div className="message-avatar"><Avatar name={approval.agentName} seed={detail.runs.find(run => run.id === approval.runId)?.agentId ?? approval.id} avatar={snapshot.agents.find(agent => agent.id === detail.runs.find(run => run.id === approval.runId)?.agentId)?.avatar} color={snapshot.agents.find(agent => agent.id === detail.runs.find(run => run.id === approval.runId)?.agentId)?.color} /></div><div className="message-main"><div className="message-meta"><strong>{approval.agentName}</strong></div><ApprovalCard approval={approval} busy={busy || !pageActive} onApprove={onApprove} /></div></article>)}
      {artifactRequests.filter(value => !visibleArtifactIds.has(pendingArtifactId(value))).map(value => <PendingArtifactActions key={JSON.stringify([value.scope, value.logicalArtifactId])} pending={value} artifacts={detail.artifacts} actions={artifactActions} active={pageActive} onRestoreRevision={restoreRevision} />)}
      <PendingQuestionReplies conversationId={conversation.id} replies={questionReplies} active={pageActive} onDiscard={request => { setDraft({ ...draft, text: draft.text.trim() ? draft.text : request.input.content, replyId: request.questionMessageId, questionReply: questionRequestTarget(request) }); composerRef.current?.focus() }} />
    </ScrollFade>
    <div className="composer-wrap" onDragEnter={event => { if (materialsAllowed && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingFiles(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false) }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = materialsAllowed && !busy && !draft.submission ? 'copy' : 'none' } }} onDropCapture={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); setDraggingFiles(false); if (materialsAllowed && !busy && !draft.submission) onDropMaterials(Array.from(event.dataTransfer.files)) }}>
      {draggingFiles && materialsAllowed && <p role="status" className="field-hint">拖入这里，将材料添加到当前会话草稿。</p>}
      {draft.submission && draft.submission.status !== 'pending' && <div role="status" className="field-hint"><span>{draft.submission.status === 'unknown' ? '发送结果尚未确认，请先核对原消息。' : '原消息尚未受理，重试将提交原消息；之后的草稿修改会保留。'}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => onSend()}>{draft.submission.status === 'unknown' ? '核对发送结果' : '重试原消息'}</Button>{draft.submission.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscardSubmission}>放弃未受理发送</Button>}</div>}
      {draft.artifactRevision && <div className="reply-preview flex flex-wrap items-center gap-2" aria-label="修改交付文件"><Button variant="ghost" size="icon-sm" aria-label="取消成果修改" disabled={sendingLocked} onClick={() => setDraft({ ...draft, artifactRevision: undefined })}><X size={14} /></Button><span>要求修改：{draft.artifactRevision.name}{draft.artifactRevision.contentVersion ? ` · 第 ${draft.artifactRevision.contentVersion} 版` : ' · 原版本'}</span><SelectField aria-label="修改执行员工" className="w-auto max-w-48" size="sm" value={draft.artifactRevision.targetAgentId} disabled={sendingLocked} onValueChange={targetAgentId => setDraft({ ...draft, artifactRevision: { ...draft.artifactRevision!, targetAgentId } })} options={[{ value: '', label: '选择执行员工' }, ...members.map(member => ({ value: member.id, label: member.name, disabled: !artifactRevisionTarget(member, snapshot.connections) }))]} /></div>}
      {draft.questionReply ? <div className="reply-preview"><Button variant="ghost" size="icon-sm" aria-label="取消问题关联" disabled={sendingLocked} onClick={() => setDraft({ ...draft, replyId: undefined, questionReply: undefined })}><X size={14} /></Button><span>{draft.questionReply.occurrenceId ? '正在补充这一次定时任务' : '正在回复原问题'}{reply && `：${reply.content.trim().replace(/\s+/g, ' ').slice(0, 160)}`}</span></div> : reply && <div className="reply-preview"><Button variant="ghost" size="icon-sm" aria-label="取消引用" disabled={sendingLocked} onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></Button><span>回复 {messageDisplayName(reply, snapshot.userProfile)}：{reply.content.trim().replace(/\s+/g, ' ').slice(0, 160)}</span></div>}
      {(draft.questionReply || draft.artifactRevision) && Boolean(materialDrafts.length || draft.mentionIds.length) && <Banner>请先移除材料或成员点名，再发送这条明确回复；也可以取消关联后作为普通消息发送。</Banner>}
      <PromptBar ref={composerRef} attachments={<MaterialDraftBar api={api} pageActive={pageActive} items={materialDrafts} disabled={busy || questionPending || Boolean(draft.submission)} onRemove={onRemoveMaterial} onRetry={onRetryMaterial} onPreview={onPreviewMaterial} />} onPasteMaterials={materialsAllowed ? files => { if (pageActive && !busy && !draft.submission) onPasteMaterials(files) } : undefined} draft={draft} setDraft={setDraft} members={members} group={group} external={external} mentionsAllowed={!replyMode} disabled={questionPending || artifactRevisionPending} placeholder={draft.artifactRevision ? '告诉这位员工，需要怎样修改这份文件…' : draft.questionReply ? '补充这个原问题，接续同一件事…' : group ? `发消息给 ${conversation.title}，@ 提及 · / 命令` : external ? '描述明确任务，然后点击执行外部任务…' : '说说你想完成什么，/ 查看命令…'} onSend={onSend} onActivity={onActivity} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)}>
        {(openMenu, menu) => <ComposerToolbar members={members} snapshot={snapshot} group={group} external={external} replyMode={replyMode} busy={busy || questionReplies.busy} active={active} canSend={canSend} configurationLocked={configurationLocked} mentionsVisible={menu === 'at'} commandsVisible={menu === 'slash'} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)} onAddMaterial={materialsAllowed ? onAddMaterial : undefined} materialsDisabled={Boolean(draft.submission) || materialDrafts.length >= MATERIAL_LIMITS.perMessage} onMentions={() => openMenu('at')} onCommands={() => openMenu('slash')} onSettings={onSettings} onChangeAgent={onChangeAgent} onSend={onSend} />}
      </PromptBar>
    </div></div>
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean) => void; busy: boolean }) {
  const browser = approval.kind === 'browser'
  return <Card className="approval-card gap-0 p-4" data-approval-id={approval.id} role="region" aria-label={`${approval.agentName} 的${browser ? '网页操作' : '命令'}审批`}><CardContent className="p-0"><div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} {browser ? '申请操作网页' : '申请运行命令'}</strong><small className="approval-status">待确认</small></div><pre>{approval.command}</pre>{!browser && <p className="field-hint">工作目录：{approval.cwd}</p>}<p className="field-hint">{browser ? '请核对当前网页和操作内容；网页变化后需要重新确认。' : '命令使用应用的主机权限，请核对实际操作范围。'}</p><div className="button-row"><Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</Button><Button size="sm" disabled={busy} onClick={() => onApprove(approval.id, true)}>允许这次执行</Button></div></CardContent></Card>
}
