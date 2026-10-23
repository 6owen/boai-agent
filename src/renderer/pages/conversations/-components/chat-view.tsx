/*
 * [OUTPUT]: 有效发送恢复最新页与贴底，手动上滚取消跟随和未完成跳转；布局高度变化不取消跟随，原分页/阅读边界保持。
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: 主聊天固定header/composer，仅消息历史按会话身份换载；骨架复用消息布局、通讯录同款Panel reveal、240px边缘预取/游标去重和有界窗口，原锚点/跟随/执行镜像保持。
 * [OUTPUT]: 传递同会话终端与预览入口。
 * [OUTPUT]: Composer以@提及员工、$引用技能/文件/提示词，沿原消息正文与引用发送。
 * [OUTPUT]: 定时任务指令沿本人原头像与资料入口，仅在头像右下角添加小尺寸“定”角标；消息来源身份保持。
 * [OUTPUT]: 已发布知识引用按宿主实际读取身份打开原全局预览；明确重开更新定位，失效不跳到新内容。
 * [OUTPUT]: 命令与多目录同卡审批，明确一次命令与本次/持久目录范围，沿原三选项交互。
 * [OUTPUT]: 目录访问审批展示真实目标、只读/读写范围与本次运行/持久授权选择，复用原审批操作入口。
 * [OUTPUT]: 宿主执行审批按命令/文件/数据源/网页/配置展示真实操作类型，旧命令永久授权保留。
 * [OUTPUT]: 目录结果按所属用户轮次锚定至bobo回复后，单独消息行展示，不堆积在聊天底部。
 * [OUTPUT]: 定时任务公开消息旁展示同一原Run的ExecutionFeed；定位该消息仍显示过程，流式正文不重复，隐藏页停读。
 * [OUTPUT]: 资源管理结果导航携已保存名称，数据源打开全局右侧配置标签。
 * [OUTPUT]: 普通核心会话投影真实技能/数据源操作结果卡，点击定位全局目录；单员工输入框可明确指定已获准数据源，隐藏/未决发送停用选择。
 * [OUTPUT]: 可记住的宿主命令审批显示“始终允许此类操作”，明确授权只提交当前员工。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: Composer管理模型、消息与群标题头像配置统一使用通讯录导航回调，定位实际员工。
 * [OUTPUT]: Composer提及读取当前员工绑定技能/当前会话文件，模型菜单沿当前连接。
 * [OUTPUT]: 聊天正文与输入框始终挂载可见，任务/文件改为右侧面板回调，打开后不暂停主聊天执行流和阅读。
 * [OUTPUT]: 移除旧任务与产物回调；输入区文件入口打开当前文件视图或渠道文件。
 * [OUTPUT]: 标题配置跳转通讯录，执行/渠道共用操作菜单；删除标题置顶和搜索的透传回调。
 * [OUTPUT]: 消息先于Run到达时不渲染无正文占位泡，避免旧typing卡闪过后换为执行loading；已有正文/附件保持。
 * [OUTPUT]: 活动执行以员工消息卡实时呈现文本、思考和工具；最终发布替换活动卡，历史页/隐藏页停止读取。
 * [OUTPUT]: 渠道消息移除重复来源/处理/送达正文，回执归悬停工具条；发布文件归消息正文，已有文件卡不重复显示。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 文件展示不再附加版号，预览/修改沿文件身份办理。
 * [OUTPUT]: 渠道底部仅保留内部讨论，外发入口归具体消息/文件，避免两种发送方式并列。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道默认只读镜像，内部讨论/明确外发分开入口；执行摘要折叠，生成/送达分别显示。
 * [OUTPUT]: 主/渠道聊天共用ScrollArea真实viewport与上下沿渐隐，消息在header和composer边缘淡出，滚到底部恢复完整显示；ref/分页/锚点保持。
 * [OUTPUT]: 透传headerActions让渠道列表在侧边聊天标题Popover内显示，正文与composer占满同一面板。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 当前网页引用附于原消息草稿；固定实例/页面版本随发送回执持久，标题URL只展示宿主核验来源，原附件工具栏保持。
 * [OUTPUT]: 2026-10-14现行分离合同：主私聊透传渠道入口，独立渠道页仍沿原聊天/任务/文件与实际阅读生命周期；空渠道提示平台来信，不沿BOAI群协作文案。
 * [OUTPUT]: 单员工渠道本地输入明确不投递平台；旧多员工渠道历史禁止新输入，原任务/文件阅读保持。
 * [OUTPUT]: 2026-10-14 本人已关联渠道消息展示当前本人名称/头像与平台来源，外部权限身份保持。
 * [OUTPUT]: 外部渠道消息显示实际平台/发送者与独立头像，不冒充本机本人或定时任务。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 2026-10-10 单聊仅头像/消息及绝对定位悬停时间，原消息接收标记与员工执行卡按真实Run投影；原引用和旧固定版本未决请求保持。
 * [OUTPUT]: 现有聊天传递宿主API供统一两级模型配置读取实际本机连接，保存结果区分已保存、未提交和未确认，未知结果只读核对。
 * [OUTPUT]: 本机来源菜单复用当前员工设置与准确本机连接导航，原聊天/首发草稿和发送语义保持。
 * [OUTPUT]: 原用户消息按持久轮次显示中断与执行记录入口，零run亦可核对；不伪造回复/Work、不自动续跑，原结果保留。
 * [OUTPUT]: 阅读核对错误归消息滚动区，避开悬浮标题和切页控件；原材料/工作状态独立保留。
 * [OUTPUT]: 重启恢复的未决普通发送显示固定材料引用数量；只沿原请求核对/重试，不虚构材料预览。
 * [OUTPUT]: 原生Codex复用同一composer文本/图片附件入口，旧ACP仍按显式任务范围。
 * [OUTPUT]: 原生Codex仅使用原Work成果；旧ACP手动文件入口按明确后端隔离。
 * [OUTPUT]: 本机Codex使用普通IM发送，材料能力未接入时不展示可用入口。
 * [OUTPUT]: 页面内消息锚点保留有符号小数偏移，同屏与跨会话恢复使用同一测量口径；宿主持久锚点仍为原非负整数。
 * [OUTPUT]: 明确审批定位按真实approval身份聚焦原聊天卡，支持公开消息附件和待发布请求卡，不猜其他消息。
 * [OUTPUT]: 会话三视图共用常驻标题；原聊天DOM/composer保持，隐藏时停止阅读、材料和业务卡片主动读取，任务/文件通过主区域插槽展示。
 * [OUTPUT]: 原员工交付消息仅预览；修改继续在聊天提出，旧固定版本未知请求仍核对，审批保留员工身份。
 * [INPUT]: 会话领域类型、原问题关联/未决补充、草稿、活动投影、会话标题菜单、共享 ScrollArea 与顶部渐隐/Markdown/Shiki 与统一 UI 基础组件。
 * [OUTPUT]: 失败判断沿原触发消息展示可读原因及执行入口；同会话固定定位清除最新页资格并恢复双向分页。
 * [OUTPUT]: 失效原消息仅展示已关联材料名称和核对入口，不展示失效正文；同原件恢复沿固定材料详情显式核对。
 * [OUTPUT]: core 原讨论展示真实群协作/独立员工入口，显式恢复只核对原操作，不自动导航或续行。
 * [OUTPUT]: 按真实 Approval.kind 展示网页审批目标/页面变化说明，主机命令仍显示工作目录和权限。
 * [OUTPUT]: 聊天标题下不再挂载浏览器窗口条或 New Tab 按钮；打开/查看统一使用全局 header 浏览器图标，控制保留在独立浏览器窗口。
 * [OUTPUT]: 原问题消息卡/引用共用现有composer定向补充，未知请求在原聊天只读核对，材料/成员提及不得隐式丢失；composer不展示停止按钮，发送仅提交消息；核心会话标题菜单传递明确会话编辑入口，置顶仅归会话列表；缺失固定消息窗口保持空态，不展示定位诊断提示；消息成果接入固定版本应用内预览，打开不采用；材料草稿/原生drop/真实消息附件随当前聊天发送、未知发送核对和仅可检查来源行引用；单聊与群聊共用消息卡片、无状态标签并可跳转对应员工配置的头像资料浮层、工具条、引用预览及按明确归属展示的文件/审批/连续发言；滚动边界自动有界加载、同游标单次请求和失败不循环，滚动同步本机锚点、补页保持当前位置且旧页底部不误跟随最新，空更早页保留原最新资格并仅在仍贴底时恢复跟随；保留手动滚动/自动跟随，局部有符号锚点保留顶部留白，宿主持久锚点仍使用非负偏移；标题栏不展示阅读状态、说明或上下跳转按钮，不挤移消息渐隐；真实完成可见观测和独立稳定锚点；旧历史保留原阅读状态语义；核心会话接入按工作身份隔离的团队交付/显式恢复卡片，隐藏主页面暂停读取；按稳定 user 身份展示当前配置姓名和可点击圆角方形个人头像，自动化来源独立，引用和工具条共用当前姓名；群聊姓名/消息提及插入实际行内标签，单聊保留模型/权限与输入边界。
 * [OUTPUT]: 图片/文件粘贴与拖拽沿当前聊天发送范围和稳定回执，草稿/消息显示宿主核对的缩略图与文件卡；不按模型视觉能力筛选。
 * [POS]: src/renderer/pages/conversations/-components/chat-view.tsx。
 * [OUTPUT]: 图片附件位于composer内部文本上方，悬停/键盘焦点右上角删除，点击与消息图片共用全屏预览；移除常驻容量说明。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { toast } from 'sonner'
import { errorText } from '@/components/common'
import { channelDeliveryDescription, useChannelDeliveries } from './channel-message-status'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { UserInfoPopover } from './user-info-popover'
import { isPersonalMessage, messageDisplayName } from '@shared/domain/profile'
import { Card, CardContent } from '@/components/ui/card'
import { isCoreAgent, isCoreConversation } from '@shared/domain/core-agent'
import type { DesktopApi } from '@shared/ipc'
import { CoreTeamResults } from './core-team-results'
import { CatalogResults, catalogResultsByMessage, useCatalogResults } from './catalog-results'
import { CoreCollaborationResults } from './core-collaboration-results'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PromptBar, type PromptBarHandle } from './prompt-bar'
import { ExternalFiles } from './external-files'
import { ComposerToolbar, type ComposerAgentPatch, type ComposerAgentSaveResult } from './composer-toolbar'
import { ConversationHeader } from './conversation-header'
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { LoaderCircle, Reply, ShieldCheck, X } from '@/components/icons/index'
import type { Approval, Artifact, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '@shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@shared/domain/materials'
import { isChannelConversation } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common/index'

import { failureSummary, liveTurn, type ChatDraft } from '../presentation'
import { interruptedTriggerTurn } from '../activity'
import { artifactsByMessage, approvalsByMessage, continuesMessage, groupMessages } from '../group-chat'
import { ChatArtifactCard, PendingArtifactActions } from './chat-artifact-card'
import type { ChatArtifacts } from '../use-chat-artifacts'
import { artifactRevisionTarget } from '@/components/detail-panel/artifact-state'
import { FileEditNote } from './file-edit-note'
import { SelectField } from '@/components/ui/select-field'
import type { ArtifactRevisionInput } from '@shared/domain/artifacts'
import { MessageCard } from './message-card'
import { ChatExecutionCard, MessageReceipt } from './execution-progress'
import { AgentInfoPopover } from './agent-info-popover'
import { draftContent } from '../inline-mentions'
import { MaterialDraftBar, SentMaterialList, type MaterialDraftItem } from './material-list'
import { MaterialMarkdown } from './material-citations'
import { materialDisplayName } from './material-draft'
import type { ConversationReadingState, ConversationView } from '@shared/domain/reading'
import { Banner } from '@/components/common'
import { useConversationReading } from './use-conversation-reading'
import { ChatMessagesTransition } from './chat-messages-transition'
import { READING_UI_LIMITS } from '../reading-state'
import { type ChatQuestionReplies } from '../question-reply'
export type ChatViewProps = { headerActions?: ReactNode; onPublish?(message?: ConversationDetail['messages'][number]): void; onWorkspace?(): void; onFiles?(): void; onTasks?(): void; api: DesktopApi; pageActive: boolean; questionReplies: ChatQuestionReplies; artifactActions: ChatArtifacts; onTeamGroup(id: string): void; onOpenCatalog?(kind: 'skill' | 'source', id: string, name?: string): void; detail: ConversationView | null; conversation?: Conversation; loading?: boolean; onRetry?(): void; snapshot: Snapshot; draft: ChatDraft; setDraft: (value: ChatDraft) => void; busy: boolean; onSend: (onDispatch?: () => void) => void; onDetails: () => void; onChannels?: () => void; onConfigureAgent: (agent: DigitalAgent) => void; onManageModels: (agent: DigitalAgent) => void; onEditTitle: (conversation: Conversation) => void; onClear: (id: string, hide: boolean) => Promise<void>; onTrace: (message?: ConversationDetail['messages'][number]) => void; onSettings: (agent?: DigitalAgent) => void; onProfile: () => void; onChangeAgent: (agent: DigitalAgent, patch: ComposerAgentPatch) => Promise<ComposerAgentSaveResult>; configurationLocked: boolean; onApprove: (id: string, approved: boolean, always?: boolean) => void; onOpenPath: (path: string) => void; onPreviewArtifact(artifact: Artifact): void; onAddMaterial(): void; onDropMaterials(files: File[]): void; onPasteMaterials(files?: File[]): void; onRemoveMaterial(item: MaterialDraftItem): void; onRetryMaterial(item: MaterialDraftItem): void; onPreviewMaterial(material: ConversationMaterial, line?: number): void; onKnowledgePreview?(target: import('@shared/domain/knowledge').KnowledgeCitationInput, reference: import('@shared/domain/knowledge').KnowledgeReadRef, agentId: string): void; onDiscardSubmission(): void; focusMessage?: { id: string; requestId: string }; focusApproval?: { id: string; requestId: string }; scrollPosition?: number; onScrollPosition: (position: number) => void; onReading(state: ConversationReadingState): void; onLocation(messageId: string | undefined, following: boolean, offset?: number): void; onPage(direction: 'before' | 'after'): void; onLatest(isCurrent: () => boolean): Promise<boolean>; paging: boolean; pageEdges: { before: boolean; after: boolean }; restoreAnchor?: { messageId: string; offset?: number } }

export function ChatView(props: ChatViewProps) {
  const { detail, conversation: selectedConversation } = props
  const conversation = selectedConversation ?? detail?.conversation
  if (!conversation) return null
  return <ChatLayout {...props} detail={detail?.conversation.id === conversation.id ? detail : null} conversation={conversation} />
}

function ChatLayout(props: ChatViewProps & { conversation: Conversation }) {
  const { api, pageActive, questionReplies, artifactActions, detail, loading = false, onRetry, snapshot, draft, setDraft, busy, onSend, onDetails, onChannels, headerActions, onWorkspace, onFiles, onTasks, onConfigureAgent, onManageModels, onEditTitle, onClear, onSettings, onProfile, onChangeAgent, configurationLocked, onOpenPath, onAddMaterial, onDropMaterials, onPasteMaterials, onRemoveMaterial, onRetryMaterial, onPreviewMaterial, onDiscardSubmission, conversation } = props
  const referenceState=useRef({id:conversation.id,draft,pageActive})
  referenceState.current={id:conversation.id,draft,pageActive}
  const [referencingBrowser,setReferencingBrowser]=useState(false)
  const referenceBrowser=async()=>{
    if(referencingBrowser || draft.submission) return
    const id=conversation.id;setReferencingBrowser(true)
    try {
      const reference=await api.request('referenceBrowserPage',{})
      const current=referenceState.current
      if(current.id===id && current.pageActive && !current.draft.submission) setDraft({...current.draft,browserReference:reference})
    } catch(error) { toast.error(errorText(error)) }
    finally {if(referenceState.current.id===id)setReferencingBrowser(false)}
  }
  const channel = isChannelConversation(conversation)
  const historicalChannel = channel && conversation.agentIds.length !== 1
  const group = conversation.kind === 'group'
  const questionPending = Object.values(questionReplies.values).some(request => request.conversationId === conversation.id)
  const artifactRequests = Object.values(artifactActions.values).filter(value => value.conversationId === conversation.id && (value.revision || value.adoption || value.acceptance))
  const artifactRevisionPending = artifactRequests.some(value => value.revision)
  const replyMode = Boolean(draft.questionReply || questionPending || draft.artifactRevision || draft.materialEdit || artifactRevisionPending)
  const sendingLocked = !detail || busy || questionReplies.busy || questionPending || artifactRevisionPending || Boolean(draft.submission)

  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const materialsAllowed = Boolean(detail) && !historicalChannel && !replyMode && !members.some(member => member.executionBackend?.kind === 'acp-local') && members.length > 0
  const materialDrafts = draft.materials ?? []
  const canSend = Boolean(detail) && !historicalChannel && !questionPending && !artifactRevisionPending && (!draft.artifactRevision || Boolean(artifactRevisionTarget(members.find(value => value.id === draft.artifactRevision!.targetAgentId), snapshot.connections))) && (!draft.materialEdit || Boolean(artifactRevisionTarget(members.find(value => value.id === draft.materialEdit!.targetAgentId), snapshot.connections))) && (!draft.questionReply || !questionReplies.storageError) && !draft.submission && materialDrafts.every(item => item.status === 'ready' && item.material?.status === 'ready' && !item.busy) && Boolean(draftContent(draft) || materialDrafts.length)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const composerRef = useRef<PromptBarHandle>(null)
  const historyRef = useRef<ChatHistoryHandle>(null)
  const sendFromComposer = () => {
    const id = conversation.id
    onSend(() => {
      if (referenceState.current.id === id && referenceState.current.pageActive) historyRef.current?.followLatest()
    })
  }
  const active = Boolean(detail?.runs.some(run => ['queued','running','waiting_approval'].includes(run.status)) || detail?.turns?.some(turn => liveTurn(turn.status)))
  const reply = detail?.messages.find(message => message.id === draft.replyId)
  const external = conversation.kind === 'direct' && members[0]?.executionBackend?.kind === 'acp-local'
  useLayoutEffect(() => { setDraggingFiles(false); setReferencingBrowser(false) }, [conversation.id])
  return <div data-conversation-view="chat" data-conversation-id={conversation.id} className={`chat-panel${group ? ' group-chat' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}>
    <ConversationHeader onWorkspace={onWorkspace} onFiles={onFiles} headerActions={headerActions} onChannels={onChannels} onTasks={onTasks} members={members} resources={snapshot.resources} conversation={snapshot.conversations.find(item => item.id === conversation.id) ?? conversation} busy={busy} onDetails={onDetails} onConfigureAgent={onConfigureAgent} onTrace={() => props.onTrace()} onEditTitle={onEditTitle} onClear={onClear} />
    <div className="conversation-chat-body">
      <ChatMessagesTransition conversationId={conversation.id} loading={!detail && loading} active={pageActive}>
        {detail ? <ChatHistory {...props} key={conversation.id} detail={detail} composerRef={composerRef} historyRef={historyRef} /> : !loading && <div className="chat-history-retry"><Button variant="ghost" onClick={onRetry}>重新载入消息</Button></div>}
      </ChatMessagesTransition>
    <div className="composer-wrap" onDragEnter={event => { if (materialsAllowed && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingFiles(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false) }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = materialsAllowed && !busy && !draft.submission ? 'copy' : 'none' } }} onDropCapture={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); setDraggingFiles(false); if (materialsAllowed && !busy && !draft.submission) onDropMaterials(Array.from(event.dataTransfer.files)) }}>
      {draggingFiles && materialsAllowed && <p role="status" className="field-hint">拖入这里，将材料添加到当前会话草稿。</p>}
      {draft.submission && draft.submission.status !== 'pending' && <div role="status" className="field-hint"><span>{draft.submission.status === 'unknown' ? '发送结果尚未确认，请先核对原消息。' : '原消息尚未受理，重试将提交原消息；之后的草稿修改会保留。'}</span>{!!draft.submission.input.materialSelections?.length && <span>本次发送包含 {draft.submission.input.materialSelections.length} 份材料。</span>}<Button variant="ghost" size="sm" disabled={busy} onClick={sendFromComposer}>{draft.submission.status === 'unknown' ? '核对发送结果' : '重试原消息'}</Button>{draft.submission.status === 'not_accepted' && <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscardSubmission}>放弃未受理发送</Button>}</div>}
      {draft.channelReference && <div className="reply-preview"><Button variant="ghost" size="icon-sm" aria-label="移除渠道引用" disabled={sendingLocked} onClick={() => setDraft({ ...draft, channelReference: undefined })}><X size={14} /></Button><span>已引用渠道消息</span></div>}
      {draft.artifactRevision && <div className="reply-preview flex flex-wrap items-center gap-2" aria-label="修改交付文件"><Button variant="ghost" size="icon-sm" aria-label="取消成果修改" disabled={sendingLocked} onClick={() => setDraft({ ...draft, artifactRevision: undefined })}><X size={14} /></Button><span>要求修改：{draft.artifactRevision.name}</span><SelectField aria-label="修改执行员工" className="w-auto max-w-48" size="sm" value={draft.artifactRevision.targetAgentId} disabled={sendingLocked} onValueChange={targetAgentId => setDraft({ ...draft, artifactRevision: { ...draft.artifactRevision!, targetAgentId } })} options={[{ value: '', label: '选择执行员工' }, ...members.map(member => ({ value: member.id, label: member.name, disabled: !artifactRevisionTarget(member, snapshot.connections) }))]} /></div>}
      {draft.questionReply ? <div className="reply-preview"><Button variant="ghost" size="icon-sm" aria-label="取消问题关联" disabled={sendingLocked} onClick={() => setDraft({ ...draft, replyId: undefined, questionReply: undefined })}><X size={14} /></Button><span>{draft.questionReply.occurrenceId ? '正在补充这一次定时任务' : '正在回复原问题'}{reply && `：${reply.content.trim().replace(/\s+/g, ' ').slice(0, 160)}`}</span></div> : reply && <div className="reply-preview"><Button variant="ghost" size="icon-sm" aria-label="取消引用" disabled={sendingLocked} onClick={() => setDraft({ ...draft, replyId: undefined })}><X size={14} /></Button><span>回复 {messageDisplayName(reply, snapshot.userProfile)}：{reply.content.trim().replace(/\s+/g, ' ').slice(0, 160)}</span></div>}
      {draft.materialEdit && <div className="reply-preview flex flex-wrap items-center gap-2" aria-label="修改聊天文件"><Button variant="ghost" size="icon-sm" aria-label="取消附件修改" disabled={sendingLocked} onClick={() => setDraft({ ...draft, materialEdit: undefined })}><X size={14} /></Button><span>要求修改：{draft.materialEdit.name} · 原附件</span><SelectField aria-label="修改执行员工" className="w-auto max-w-48" size="sm" value={draft.materialEdit.targetAgentId} disabled={sendingLocked} onValueChange={targetAgentId => setDraft({ ...draft, materialEdit: { ...draft.materialEdit!, targetAgentId } })} options={[{ value: '', label: '选择执行员工' }, ...members.map(member => ({ value: member.id, label: member.name, disabled: !artifactRevisionTarget(member, snapshot.connections) }))]} /></div>}
      {(draft.artifactRevision || draft.materialEdit) && <FileEditNote annotation={(draft.artifactRevision ?? draft.materialEdit)?.annotation} disabled={sendingLocked} onChange={annotation => setDraft(draft.artifactRevision ? { ...draft, artifactRevision: { ...draft.artifactRevision, annotation } } : { ...draft, materialEdit: { ...draft.materialEdit!, annotation } })} />}
      {(draft.questionReply || draft.artifactRevision || draft.materialEdit) && Boolean(materialDrafts.length || draft.mentionIds.length) && <Banner>请先移除材料或成员点名，再发送这条明确回复；也可以取消关联后作为普通消息发送。</Banner>}
      {draft.browserReference && <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm" aria-label="已引用网页"><div className="min-w-0 flex-1"><div className="truncate">{draft.browserReference.title || '网页'}</div><div className="truncate text-xs text-muted-foreground">{draft.browserReference.url}</div></div><Button variant="ghost" size="icon-sm" disabled={sendingLocked} aria-label="移除网页引用" onClick={()=>setDraft({...draft,browserReference:undefined})}><X /></Button></div>}
      <PromptBar api={api} resources={snapshot.resources} conversationId={conversation.id} ref={composerRef} attachments={<MaterialDraftBar api={api} pageActive={pageActive} items={materialDrafts} disabled={busy || questionPending || Boolean(draft.submission)} onRemove={onRemoveMaterial} onRetry={onRetryMaterial} onPreview={onPreviewMaterial} />} onPasteMaterials={materialsAllowed ? files => { if (pageActive && !busy && !draft.submission) onPasteMaterials(files) } : undefined} draft={draft} setDraft={setDraft} members={members} group={group} external={external} mentionsAllowed={!replyMode} disabled={!detail || historicalChannel || questionPending || artifactRevisionPending} placeholder={historicalChannel ? '旧渠道会话仅保留历史' : draft.artifactRevision || draft.materialEdit ? '告诉这位员工，需要怎样修改这份文件…' : draft.questionReply ? '补充这个原问题，接续同一件事…' : channel ? '继续这条会话，消息仅保留在 BOAI…' : group ? `发消息给 ${conversation.title}，@ 提及 · / 命令` : external ? '描述明确任务，然后点击执行外部任务…' : '说说你想完成什么，/ 查看命令…'} onSend={sendFromComposer} onActivity={() => onFiles?.()} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)}>
        {(openMenu, menu, reference) => <ComposerToolbar pageActive={pageActive} sourcesDisabled={sendingLocked || historicalChannel} onSelectSource={reference} runs={detail?.runs ?? []} api={api} members={members} snapshot={snapshot} group={group} external={external} replyMode={replyMode} busy={busy || questionReplies.busy} active={active} canSend={canSend} configurationLocked={configurationLocked} mentionsVisible={menu === 'at'} referencesVisible={menu === 'dollar'} onReferences={() => openMenu('dollar')} commandsVisible={menu === 'slash'} onOpenWorkspace={() => onOpenPath(conversation.workspacePath)} onReferenceBrowser={!channel && !isCoreConversation(conversation) && !external && !replyMode ? ()=>void referenceBrowser():undefined} browserReferenceBusy={referencingBrowser} onAddMaterial={materialsAllowed ? onAddMaterial : undefined} materialsDisabled={Boolean(draft.submission) || materialDrafts.length >= MATERIAL_LIMITS.perMessage} onMentions={() => openMenu('at')} onCommands={() => openMenu('slash')} onSettings={onSettings} onConfigureAgent={onManageModels} onChangeAgent={onChangeAgent} onSend={sendFromComposer} />}
      </PromptBar>
    </div>
    </div>
  </div>
}

type ChatHistoryHandle = { followLatest(): void }

function ChatHistory({ api, pageActive, questionReplies, artifactActions, onTeamGroup, onOpenCatalog, detail, snapshot, draft, setDraft, busy, onPublish, onConfigureAgent, onTrace, onProfile, onApprove, onOpenPath, onPreviewArtifact, onPreviewMaterial, onKnowledgePreview, focusMessage, focusApproval, onScrollPosition, onReading, onLocation, onPage, onLatest, paging, pageEdges, restoreAnchor, composerRef, historyRef }: Omit<ChatViewProps, 'detail'> & { detail: ConversationView; composerRef: RefObject<PromptBarHandle | null>; historyRef: RefObject<ChatHistoryHandle | null> }) {
  const conversation = detail.conversation
  const channel = isChannelConversation(conversation)
  const historicalChannel = channel && conversation.agentIds.length !== 1
  const deliveries = useChannelDeliveries(api, conversation.id, detail.messages, pageActive && channel)
  const group = conversation.kind === 'group'
  const questionPending = Object.values(questionReplies.values).some(request => request.conversationId === conversation.id)
  const artifactRequests = Object.values(artifactActions.values).filter(value => value.conversationId === conversation.id && (value.revision || value.adoption || value.acceptance))
  const artifactRevisionPending = artifactRequests.some(value => value.revision)
  const replyMode = Boolean(draft.questionReply || questionPending || draft.artifactRevision || draft.materialEdit || artifactRevisionPending)
  const sendingLocked = busy || questionReplies.busy || questionPending || artifactRevisionPending || Boolean(draft.submission)
  const messages = groupMessages(detail)
  const messagesById = new Map(messages.map(message => [message.id, message]))
  const messageRows = detail.messagePage.items.map(item => ({ item, message: messagesById.get(item.messageId) }))
  const catalogItems = useCatalogResults(api, conversation.id, pageActive && isCoreConversation(conversation) && !!onOpenCatalog)
  const catalogByMessage = catalogResultsByMessage(catalogItems, detail)
  const files = artifactsByMessage(detail)
  const approvalGroups = approvalsByMessage(detail, snapshot.approvals)
  const members = snapshot.agents.filter(agent => conversation.agentIds.includes(agent.id))
  const scrollRef = useRef<HTMLDivElement>(null), following = useRef(!restoreAnchor), initialized = useRef(false), focusedRequest = useRef<string | undefined>(undefined), focusedApprovalRequest = useRef<string | undefined>(undefined), localAnchor = useRef<{ messageId: string; offset?: number } | undefined>(restoreAnchor)
  const latestPage = useRef(!restoreAnchor && !focusMessage), beforeLatestPage = useRef(false), lastScrollTop = useRef(0), pageRequests = useRef({ before: '', after: '' }), touchY = useRef<number | undefined>(undefined)
  const scrollSize = useRef({ height: 0, content: 0 }), followRequest = useRef(0), pendingLatest = useRef(false), activeRef = useRef(pageActive)
  activeRef.current = pageActive
  const reading = useConversationReading({ api, active: pageActive, view: detail, root: scrollRef, following, onReading, onLocation })
  const approvals = snapshot.approvals.filter(a => a.conversationId === conversation.id)
  const activeRuns = detail.runs.filter(run => ['queued','running','waiting_approval'].includes(run.status))
  const executionRuns = latestPage.current || !pageEdges.after ? activeRuns.filter(run => run.phase === 'execution') : []
  const streamingRunIds = new Set(executionRuns.map(run => run.id))
  const mirrors = (detail.executionMirrors ?? []).map(mirror => ({ ...mirror, messageId: detail.messages.find(message => message.automationPublication?.sourceConversationId === mirror.run.conversationId && message.automationPublication.sourceMessageId === mirror.run.messageId)?.id ?? mirror.messageId })).filter(({ run, triggerMessage, messageId }) =>
    ['queued', 'running', 'waiting_approval'].includes(run.status) && (latestPage.current || !pageEdges.after || detail.messages.some(message => message.id === triggerMessage.id || message.id === messageId)))
  const mirrorAnchor = (mirror: typeof mirrors[number]) => detail.messages.some(message => message.id === mirror.triggerMessage.id) ? mirror.triggerMessage.id : mirror.messageId
  const mirroredMessageIds = new Set(mirrors.map(mirror => mirror.messageId).filter(Boolean))
  const executionCard = (run: typeof activeRuns[number], trigger?: ConversationDetail['messages'][number]) => {
    const agent = members.find(member => member.id === run.agentId)
    return <article key={run.id} className="message-row agent">
      <div className="message-avatar"><Avatar name={run.agentName} seed={run.agentId} avatar={agent?.avatar} color={agent?.color} /></div>
      <div className="message-main min-w-0">{group && <div className="message-meta"><strong>{run.agentName}</strong></div>}
        <ChatExecutionCard api={api} run={run} active={pageActive} onOpen={() => onTrace(trigger)} />
      </div>
    </article>
  }
  const mention = (id: string) => { if (!replyMode && !sendingLocked) composerRef.current?.mention(id) }
  const quote = (messageId: string) => {
    if (sendingLocked || !pageActive) return
    setDraft({ ...draft, replyId: messageId, questionReply: undefined, artifactRevision: undefined, materialEdit: undefined }); composerRef.current?.focus()
  }
  const restoreRevision = (input: ArtifactRevisionInput, logicalArtifactId: string) => {
    const artifact = detail.artifacts.find(value => value.id === input.artifactId)
    setDraft({ ...draft, text: draft.text.trim() ? draft.text : input.content, replyId: undefined, questionReply: undefined, materialEdit: undefined, artifactRevision: { artifactId: input.artifactId, logicalArtifactId, contentHash: input.contentHash, contentVersion: artifact?.contentVersion, name: artifact?.name ?? '原成果', targetAgentId: artifactRevisionTarget(members.find(member => member.id === input.targetAgentId), snapshot.connections) ? input.targetAgentId : '' } })
    composerRef.current?.focus()
  }
  const visibleArtifactIds = new Set([...files.values()].flat().map(value => value.id))
  const pendingArtifactId = (value: typeof artifactRequests[number]) => value.revision?.input.artifactId ?? value.adoption?.input.artifactId ?? value.acceptance?.input.artifactId
  const last = detail.messages.at(-1)
  const captureAnchor = (el: HTMLDivElement) => {
    const viewport = el.getBoundingClientRect()
    const row = [...el.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.getBoundingClientRect().bottom > viewport.top)
    if (row?.dataset.readingMessageId) localAnchor.current = { messageId: row.dataset.readingMessageId, offset: viewport.top - row.getBoundingClientRect().top }
  }
  const rememberScroll = (el: HTMLDivElement) => {
    lastScrollTop.current = el.scrollTop
    scrollSize.current = { height: el.clientHeight, content: el.scrollHeight }
  }
  const pinBottom = (el: HTMLDivElement) => { el.scrollTop = el.scrollHeight; rememberScroll(el) }
  const pauseFollowing = () => {
    following.current = false
    // Until the tail is loaded, the current DOM can still be an old history page.
    if (pendingLatest.current) latestPage.current = false
    pendingLatest.current = false
    followRequest.current++
    if (scrollRef.current) captureAnchor(scrollRef.current)
    onLocation(localAnchor.current?.messageId, false, localAnchor.current?.offset)
  }
  useImperativeHandle(historyRef, () => ({ followLatest() {
    if (!pageActive) return
    const request = ++followRequest.current
    following.current = true; latestPage.current = true; beforeLatestPage.current = false
    pendingLatest.current = true
    localAnchor.current = undefined; pageRequests.current = { before: '', after: '' }
    // Sending supersedes an earlier search/approval focus, including one still loading.
    focusedRequest.current = focusMessage?.requestId; focusedApprovalRequest.current = focusApproval?.requestId
    onLocation(undefined, true)
    if (scrollRef.current) pinBottom(scrollRef.current)
    void onLatest(() => request === followRequest.current && following.current && activeRef.current).then(loaded => {
      if (loaded && request === followRequest.current) pendingLatest.current = false
    })
  } }))
  useEffect(() => () => { followRequest.current++ }, [])
  const loadAtEdge = (direction: 'before' | 'after') => {
    const el = scrollRef.current
    if (!el || !pageActive || document.visibilityState !== 'visible' || !document.hasFocus() || paging || !pageEdges[direction]) return
    if (direction === 'after' && latestPage.current) return
    const distance = direction === 'before' ? el.scrollTop : el.scrollHeight - el.scrollTop - el.clientHeight
    const cursor = direction === 'before' ? detail.messagePage.beforeCursor : detail.messagePage.afterCursor
    if (distance > READING_UI_LIMITS.historyPrefetchDistance || !cursor) return
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
    if (focusMessage && focusedRequest.current !== focusMessage.requestId || focusApproval && focusedApprovalRequest.current !== focusApproval.requestId) return
    const anchor = localAnchor.current
    const row = anchor && [...el.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.dataset.readingMessageId === anchor.messageId)
    if (row && !following.current) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top + (anchor?.offset ?? 0)
    else if (!initialized.current || following.current) el.scrollTop = el.scrollHeight
    initialized.current = true
    rememberScroll(el)
  }, [pageActive, detail.messagePage, focusMessage, focusApproval])
  useLayoutEffect(() => {
    if (!pageActive || !focusMessage || focusedRequest.current === focusMessage.requestId) return
    const message = document.getElementById(`message-${focusMessage.id}`)
    if (!message || !scrollRef.current?.contains(message)) return
    focusedRequest.current = focusMessage.requestId
    followRequest.current++; pendingLatest.current = false
    latestPage.current = false; beforeLatestPage.current = false; pageRequests.current = { before: '', after: '' }
    following.current = false
    message.scrollIntoView({ block: 'center' }); message.focus({ preventScroll: true })
    rememberScroll(scrollRef.current)
  }, [focusMessage, detail.messagePage, pageActive])
  useLayoutEffect(() => {
    if (!pageActive || !focusApproval || focusedApprovalRequest.current === focusApproval.requestId) return
    const approval = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-approval-id]') ?? [])].find(element => element.dataset.approvalId === focusApproval.id)
    if (!approval) { if (!snapshot.approvals.some(value => value.id === focusApproval.id)) focusedApprovalRequest.current = focusApproval.requestId; return }
    focusedApprovalRequest.current = focusApproval.requestId
    followRequest.current++; pendingLatest.current = false
    following.current = false
    approval.scrollIntoView({ block: 'center' }); approval.focus({ preventScroll: true })
    if (scrollRef.current) rememberScroll(scrollRef.current)
  }, [focusApproval, pageActive, detail.messagePage, snapshot.approvals])
  useEffect(() => {
    const noNewer = !pageEdges.after && pageRequests.current.after
    const noOlderAtLatest = !pageEdges.before && pageRequests.current.before && beforeLatestPage.current
    if (paging || !pageActive || !(noNewer || noOlderAtLatest)) return
    latestPage.current = true
    const el = scrollRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < READING_UI_LIMITS.historyEdgeDistance) { following.current = true; onLocation(undefined, true) }
  }, [paging, pageEdges.before, pageEdges.after, pageActive, onLocation])
  useEffect(() => { const el = scrollRef.current; if (el && el.clientHeight > 0 && following.current) pinBottom(el) }, [last?.content, last?.status, detail.messages.length, approvals.length, detail.runs])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => { if (el.clientHeight > 0 && following.current) pinBottom(el) })
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    <ScrollArea className="messages-scroll-area" contentProps={{ className: channel && !detail.messagePage.items.length ? 'flex flex-col' : undefined }} viewportProps={{ className: 'messages scroll-fade-y scroll-fade-6', ref: scrollRef, 'aria-busy': paging,
      onScroll: () => {
        const el = scrollRef.current
        if (!el || el.clientHeight === 0) return
        const delta = el.scrollTop - lastScrollTop.current
        const resized = el.clientHeight !== scrollSize.current.height || el.scrollHeight !== scrollSize.current.content
        rememberScroll(el)
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (el.scrollTop > READING_UI_LIMITS.historyPrefetchDistance) pageRequests.current.before = ''
        if (bottom > READING_UI_LIMITS.historyPrefetchDistance) pageRequests.current.after = ''
        // Content/viewport resizing is not an instruction to stop following.
        // Wheel/touch/keyboard intent is handled below; this also covers dragging the scrollbar.
        if (delta < 0 && !resized) pauseFollowing()
        else if (delta > 0 && !resized && latestPage.current && bottom < READING_UI_LIMITS.historyEdgeDistance) following.current = true
        onScrollPosition(el.scrollTop); captureAnchor(el)
        onLocation(localAnchor.current?.messageId, following.current, localAnchor.current?.offset)
        if (!following.current && delta < 0) loadAtEdge('before')
        else if (!following.current && delta > 0) loadAtEdge('after')
      },
      onWheel: event => { if (event.deltaY < 0) { pauseFollowing(); loadAtEdge('before') } else if (event.deltaY > 0) loadAtEdge('after') },
      onTouchStart: event => { touchY.current = event.touches[0]?.clientY },
      onTouchMove: event => { const y = event.touches[0]?.clientY, previous = touchY.current; touchY.current = y; if (y === undefined || previous === undefined) return; if (y > previous) { pauseFollowing(); loadAtEdge('before') } else if (y < previous) loadAtEdge('after') },
      onKeyDown: event => { if (event.defaultPrevented) return; if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) { pauseFollowing(); loadAtEdge('before') } else if (['ArrowDown', 'PageDown', 'End'].includes(event.key)) loadAtEdge('after') } }}>
      {paging && <div className="chat-history-page-loading" role="status"><span><LoaderCircle size={12} className="spinner" />正在载入更多消息…</span></div>}
      {reading.error && <><Banner>{reading.error}</Banner><Button variant="link" size="sm" onClick={() => void reading.check()}>核对阅读状态</Button></>}
      {!detail.messagePage.items.length && !executionRuns.length && !mirrors.length && (channel ? <IllustratedEmpty kind="conversations" title="暂无渠道消息" /> : <div className="chat-empty"><div className="avatar-stack">{members.map(a => <Avatar key={a.id} name={a.name} seed={a.id} avatar={a.avatar} color={a.color} />)}</div><h2>{conversation.kind === 'group' ? '同事们已在这里' : `与${members[0]?.name ?? '数字员工'}聊一聊`}</h2><p>{conversation.kind === 'group' ? '直接开始交流。每位员工会根据自己的角色判断是否回应。' : '从日常交流到具体工作，都可以直接提出。'}</p></div>)}
      {messageRows.map(({ item, message }, index) => {
        if (!message) return <article key={item.messageId} id={`message-${item.messageId}`} data-reading-message-id={item.messageId} className={focusMessage?.id === item.messageId ? 'message-target' : undefined} tabIndex={-1}>
          <Banner>{item.reason ?? '这条内容已被清理或不可用。'}</Banner>
          {(detail.materials ?? []).filter(material => material.messageId === item.messageId && ['ready', 'unavailable'].includes(material.status)).map(material => <Button key={material.id} variant="link" size="sm" aria-label={`核对材料 ${materialDisplayName(material.name)}`} onClick={() => onPreviewMaterial(material)}>核对材料：{materialDisplayName(material.name)}</Button>)}
        </article>
        const attachedMirrors = mirrors.filter(mirror => mirrorAnchor(mirror) === message.id)
        if (message.status === 'streaming' && mirroredMessageIds.has(message.id)) return <Fragment key={message.id}>{attachedMirrors.map(mirror => executionCard(mirror.run, mirror.triggerMessage))}</Fragment>
        if (message.status === 'streaming' && message.automationPublication && message.senderType === 'agent' && !message.content) return null
        // Message events can arrive before the run snapshot; do not flash the old empty typing bubble.
        if (message.status === 'streaming' && message.runId) {
          if (streamingRunIds.has(message.runId)) return null
          if ((latestPage.current || !pageEdges.after) && message.senderType === 'agent' && !message.content
            && !message.materialIds?.length && !files.get(message.id)?.length && !message.channelPublication?.artifacts.length
            && !detail.runs.some(run => run.id === message.runId)) return null
        }
        const agent = snapshot.agents.find(value => value.id === message.senderId)
        const quoted = message.replyToMessageId ? messagesById.get(message.replyToMessageId) : undefined
        const previous = messageRows[index - 1]?.message
        const attachedApprovals = approvalGroups.byMessage.get(message.id) ?? []
        const continued = continuesMessage(previous, message, Boolean(attachedApprovals.length || previous && approvalGroups.byMessage.has(previous.id)))
        const sender = message.channel?.owner ? snapshot.userProfile?.displayName ?? '我' : messageDisplayName(message, snapshot.userProfile)
        const useCard = message.senderType !== 'system'
        const canMention = !replyMode && !sendingLocked && group && message.senderType === 'agent' && agent?.active && members.some(member => member.id === agent.id)
        const mentioned = members.filter(member => message.mentionIds?.includes(member.id))
        const interruptedTurn = interruptedTriggerTurn(detail, message)
        const sourceRuns = message.senderType === 'user' ? detail.runs.filter(run => run.triggerMessageId === message.id && (!message.turnId || run.turnId === message.turnId)) : []
        const receipts = deliveries.filter(delivery => delivery.messageId === message.id)
        const body = <>
            {message.replyToMessageId && <div className="quoted-message">{quoted ? <><strong>回复 {messageDisplayName(quoted, snapshot.userProfile)}：</strong><span>{quoted.content.trim().split('\n')[0].slice(0, 120)}</span></> : '原消息已不可用'}</div>}
            <div className="message-bubble markdown">{message.browserReference && <div className="mb-2 min-w-0 text-sm" aria-label="消息引用网页"><div>{message.browserReference.title}</div><div className="truncate text-xs text-muted-foreground" title={message.browserReference.url}>{message.browserReference.url}</div></div>}{group && !!mentioned.length && <span className="message-mentions">{mentioned.map(member => <button type="button" className="message-mention" key={member.id} onClick={() => mention(member.id)}>@{member.name}</button>)}</span>}{message.content ? <MaterialMarkdown message={message} detail={detail} onPreview={onPreviewMaterial} onKnowledgePreview={onKnowledgePreview} /> : message.status === 'streaming' ? <span className="typing-indicator"><i /><i /><i /></span> : !message.materialIds?.length && !message.channelPublication?.artifacts.length && <span className="muted">暂无公开内容</span>}</div>
            {!!message.materialIds?.length && <><SentMaterialList api={api} pageActive={pageActive} materials={(detail.materials ?? []).filter(material => message.materialIds?.includes(material.id))} onPreview={onPreviewMaterial} />{message.materialIds.some(id => !detail.materials?.some(material => material.id === id)) && <p role="status" className="field-hint">部分材料已清理或不可用。</p>}</>}
            {files.get(message.id)?.map(artifact => <ChatArtifactCard key={artifact.id ?? artifact.path} artifact={artifact} onOpenPath={onOpenPath} onPreview={onPreviewArtifact} />)}
            {message.channelPublication?.artifacts.filter(ref => !files.get(message.id)?.some(artifact => artifact.id === ref.id)).map(ref => <Button key={ref.id} size="sm" variant="secondary" onClick={() => onPreviewArtifact({ ...ref, path: '', size: 0 })}>{ref.name}</Button>)}
            {artifactRequests.filter(value => files.get(message.id)?.some(artifact => artifact.id === pendingArtifactId(value))).map(value => <PendingArtifactActions key={JSON.stringify([value.scope, value.logicalArtifactId])} pending={value} artifacts={detail.artifacts} actions={artifactActions} active={pageActive} onRestoreRevision={restoreRevision} />)}
            {message.status === 'completed' && message.runId && detail.runs.find(run => run.id === message.runId)?.backend?.kind === 'acp-local' && <ExternalFiles runId={message.runId} />}
            {message.status !== 'completed' && <small className={`message-status ${message.status}`}>{message.status === 'streaming' ? '正在回复' : message.status === 'cancelled' ? '已取消 · 已有内容保留' : message.status === 'interrupted' ? '执行中断，可在执行过程中查看' : '回复失败，请查看执行过程'}</small>}
        </>
        return <Fragment key={message.id}><article className={`message-row ${message.senderType}${continued ? ' message-continuation' : ''}${focusMessage?.id === message.id ? ' message-target' : ''}`} aria-label={`${sender} ${timeText(message.createdAt)}`} tabIndex={-1} key={message.id} id={`message-${message.id}`} data-reading-message-id={message.id}>
          <div className="message-avatar">{isPersonalMessage(message) || message.channel?.owner ? <UserInfoPopover profile={snapshot.userProfile} onProfile={onProfile} /> : message.channel ? <Avatar name={message.senderName} seed={message.senderId} />: message.senderType === 'user' ? <span className="relative inline-flex"><UserInfoPopover profile={snapshot.userProfile} onProfile={onProfile} />{message.origin?.kind === 'automation' && <span aria-label="定时任务" className="pointer-events-none absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-sm bg-background text-[length:var(--text-ui-micro)] leading-none font-medium text-muted-foreground ring-1 ring-border">定</span>}</span> : message.senderType === 'system' ? <span className="avatar system-avatar" aria-hidden="true">·</span> : agent ? <AgentInfoPopover agent={agent} resources={snapshot.resources} onConfigure={() => onConfigureAgent(agent)} /> : <Avatar name={message.senderName || '系统'} seed={message.senderId} />}</div>
          <div className="message-main">
            <div className={`message-meta${!group ? ' message-meta-direct' : ''}`}>
              {group && <>
              {canMention ? <Button variant="ghost" size="content" className="message-author" aria-label={`提及 ${sender}`} onClick={() => mention(agent!.id)}><span className="message-author-at" aria-hidden="true">@</span><strong>{sender}</strong></Button> : <strong>{sender}</strong>}
              </>}
              <time dateTime={message.createdAt}>{timeText(message.createdAt)}</time>
              {!useCard && <Button variant="ghost" size="icon-sm" className="reply-action" aria-label={`引用 ${messageDisplayName(message, snapshot.userProfile)} 的消息`} disabled={sendingLocked} onClick={() => quote(message.id)}><Reply size={14} /></Button>}
            </div>
            {useCard ? <MessageCard message={message} profile={snapshot.userProfile} receipt={!group && isPersonalMessage(message) ? <MessageReceipt runs={sourceRuns} /> : undefined} onReply={() => quote(message.id)} onTrace={() => onTrace(message)} onPublish={channel && !historicalChannel && message.senderType === 'agent' && message.status === 'completed' && onPublish ? () => onPublish(message) : undefined} publishDisabled={busy || receipts.some(delivery => ['sent', 'sending'].includes(delivery.status))} publishDescription={channelDeliveryDescription(receipts)}>{body}</MessageCard> : body}

            {interruptedTurn && <div role="status" className="field-hint" data-interrupted-turn-id={interruptedTurn.id}><span>该轮处理已中断，已有回复和成果保留；未自动重新执行。</span><Button variant="link" size="sm" onClick={() => onTrace(message)}>查看执行过程</Button></div>}
            {!interruptedTurn && message.senderType === 'user' && detail.runs.filter(run => run.triggerMessageId === message.id && run.phase === 'decision' && ['failed', 'interrupted'].includes(run.status) && !detail.runs.some(next => next.triggerMessageId === message.id && next.agentId === run.agentId && next.phase === run.phase && next.createdAt > run.createdAt)).map(run => <div key={run.id} role="status" className="field-hint"><span>{run.agentName}：{run.error ? failureSummary(run.error) : '处理已中断，请查看执行过程。'}</span><Button variant="link" size="sm" onClick={() => onTrace(message)}>查看执行过程</Button></div>)}
            {attachedApprovals.map(approval => <ApprovalCard key={approval.id} approval={approval} busy={busy || !pageActive} onApprove={onApprove} />)}
          </div>
        </article>
        {attachedMirrors.map(mirror => executionCard(mirror.run, mirror.triggerMessage))}
        {onOpenCatalog && catalogByMessage.has(message.id) && <CatalogResults items={catalogByMessage.get(message.id)!} agent={snapshot.agents.find(isCoreAgent)} onOpen={onOpenCatalog} />}
        </Fragment>
      })}
      {isCoreConversation(conversation) && <CoreTeamResults api={api} detail={detail} snapshot={snapshot} active={pageActive} busy={busy} onGroup={onTeamGroup} />}
      {isCoreConversation(conversation) && <CoreCollaborationResults api={api} conversationId={conversation.id} snapshot={snapshot} active={pageActive} busy={busy} onGroup={onTeamGroup} onAgent={onConfigureAgent} />}
      {executionRuns.map(run => executionCard(run, detail.messages.find(message => message.id === run.triggerMessageId)))}
      {mirrors.filter(mirror => !detail.messages.some(message => message.id === mirrorAnchor(mirror))).map(mirror => executionCard(mirror.run, mirror.triggerMessage))}
      {approvalGroups.pending.map(approval => <article key={approval.id} className="message-row agent"><div className="message-avatar"><Avatar name={approval.agentName} seed={detail.runs.find(run => run.id === approval.runId)?.agentId ?? approval.id} avatar={snapshot.agents.find(agent => agent.id === detail.runs.find(run => run.id === approval.runId)?.agentId)?.avatar} color={snapshot.agents.find(agent => agent.id === detail.runs.find(run => run.id === approval.runId)?.agentId)?.color} /></div><div className="message-main"><div className="message-meta">{group && <strong>{approval.agentName}</strong>}</div><ApprovalCard approval={approval} busy={busy || !pageActive} onApprove={onApprove} /></div></article>)}
      {artifactRequests.filter(value => !visibleArtifactIds.has(pendingArtifactId(value))).map(value => <PendingArtifactActions key={JSON.stringify([value.scope, value.logicalArtifactId])} pending={value} artifacts={detail.artifacts} actions={artifactActions} active={pageActive} onRestoreRevision={restoreRevision} />)}
    </ScrollArea>
  )
}

export function ApprovalCard({ approval, onApprove, busy }: { approval: Approval; onApprove: (id: string, approved: boolean, always?: boolean) => void; busy: boolean }) {
  const kind = approval.kind ?? 'command'
  const combined = kind === 'command' && !!approval.commandDirectories?.length
  const directories = combined ? approval.commandDirectories! : kind === 'directory' && approval.directory ? [approval.directory] : []
  const labels = { command: '运行命令', browser: '操作网页', file: '修改或发布文件', source: '写入数据源', configuration: '修改配置或委派工作', directory: '访问目录' }
  const label = combined ? '运行命令并授权目录' : labels[kind]
  return <Card className="approval-card gap-0 p-4" data-approval-id={approval.id} tabIndex={-1} role="region" aria-label={`${approval.agentName} 的${label}审批`}><CardContent className="p-0">
    <div className="approval-topline"><ShieldCheck size={17} /><strong>{approval.agentName} 申请{label}</strong><small className="approval-status">待确认</small></div>
    <pre>{approval.command}</pre>
    {directories.map(directory => <div key={directory.directory}>
      <p className="field-hint">授权目录：{directory.directory}</p>
      {directory.target !== directory.directory && <p className="field-hint">目标：{directory.target}</p>}
      <p className="field-hint">权限：{directory.access === 'read-only' ? '只读' : '读取、编辑、创建和删除文件'}</p>
    </div>)}
    {kind === 'command' && <p className="field-hint">工作目录：{approval.cwd}</p>}
    <p className="field-hint">{combined ? '命令仅批准这一次；目录可仅本次运行使用或保留到员工配置。后续命令仍按员工权限审批。' : kind === 'directory' ? '本次运行授权在任务结束后失效；始终允许的目录可在员工配置中移除。' : kind === 'browser' ? '请核对当前网页和操作内容；网页变化后需要重新确认。' : kind === 'command' ? '命令使用应用的主机权限，请核对实际操作范围。' : '请核对本次操作，批准仅用于这一次执行。'}</p>
    <div className="button-row">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, false)}>拒绝</Button>
      <Button size="sm" disabled={busy} onClick={() => onApprove(approval.id, true)}>{combined ? '允许命令及本次目录访问' : kind === 'directory' ? '允许本次运行' : '允许这次执行'}</Button>
      {approval.rememberAllowed && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(approval.id, true, true)}>{combined ? '运行命令并保留目录授权' : kind === 'directory' ? '始终允许此目录' : '始终允许此类操作'}</Button>}
    </div>
  </CardContent></Card>
}
