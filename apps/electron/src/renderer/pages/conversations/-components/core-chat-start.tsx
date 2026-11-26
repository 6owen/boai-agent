/*
 * [OUTPUT]: 首条消息的所选附件保存在草稿，发送前可移除。
 * [OUTPUT]: 2026-11-09 bobo首发不配置项目目录，使用默认工作区。
 * [OUTPUT]: 首发显示员工默认项目并沿原配置版本编辑；不提前创建空会话，首次发送由宿主固定目录。
 * [OUTPUT]: 2026-11-06 首发继续隐藏文件上传，不再向工具栏传递已移除的目录菜单回调。
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: 首发恢复原有$菜单，保留/命令、数据源选择及已有引用发送。
 * [OUTPUT]: 首发使用当前连接模型菜单、核心管理命令与全部启用数据源指定。
 * [OUTPUT]: 核心首发与已有聊天共用当前连接内的模型和推理选项，保存沿真实回执并区分未提交/未知，原首发草稿和发送语义保持。
 * [OUTPUT]: 复用同一首发输入器打开任意员工的新话题草稿。
 * [INPUT]: 核心助手和连接快照、仅保留在页面中的输入与首次发送回调。
 * [OUTPUT]: 可反复打开的空白核心聊天；复用仅发送消息的 composer/模型设置，无停止按钮，首次发送前没有会话身份、工作目录或会话管理操作。
 * [POS]: 会话页首发入口；持久化及请求回执由 AppShell 和宿主负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef } from 'react'
import type { Snapshot, DigitalAgent } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '@boai/shared/domain/core-agent'
import { Avatar, showErrorToast } from '@/components/common'
import { MATERIAL_LIMITS } from '@boai/shared/domain/materials'
import { FileText, X } from '@/components/icons'
import { Attachment, AttachmentContent, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { PromptBar } from './prompt-bar'
import { ComposerToolbar, type ComposerAgentPatch, type ComposerAgentSaveResult } from './composer-toolbar'
import type { ChatDraft } from '../presentation'
import { draftContent } from '../inline-mentions'

interface Props {
  employeeId?: string; topic?: boolean
  pageActive: boolean
  api: DesktopApi; snapshot: Snapshot; draft: ChatDraft; setDraft(value: ChatDraft): void; busy: boolean; configurationLocked: boolean; materialsLocked: boolean
  onSend(): void; onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void; onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult>
}
export function CoreChatStart({ pageActive, api, snapshot, draft, setDraft, busy, configurationLocked, onSend, onSettings, onConfigureAgent, onChangeAgent, employeeId, topic, materialsLocked }: Props) {
  const employee = employeeId ? snapshot.agents.find(agent => agent.id === employeeId) : snapshot.agents.find(isCoreAgent)
  const members = employee ? [employee] : []
  const name = employee?.name ?? CORE_AGENT_DEFAULT_NAME
  const noConversation = () => undefined
  const fileInput = useRef<HTMLInputElement>(null)
  const files = draft.firstMessageFiles ?? []
  const supportsAttachments = Boolean(employee?.active && employee.executionBackend?.kind !== 'acp-local' && (!topic || isCoreAgent(employee)))
  const canChooseFiles = supportsAttachments && pageActive && !busy && !materialsLocked && files.length < MATERIAL_LIMITS.perMessage
  const addFiles = (selected: File[]) => {
    if (!canChooseFiles || !selected.length) return
    if (files.length + selected.length > MATERIAL_LIMITS.perMessage) {
      showErrorToast(`每条消息最多添加 ${MATERIAL_LIMITS.perMessage} 份材料。`)
      return
    }
    const tooLarge = selected.find(file => file.size > MATERIAL_LIMITS.attachmentBytes)
    if (tooLarge) {
      showErrorToast(`「${tooLarge.name}」超过单个附件的大小限制。`)
      return
    }
    setDraft({ ...draft, firstMessageFiles: [...files, ...selected] })
  }
  const attachments = files.length > 0 && <section className="flex flex-wrap gap-2" aria-label="待发送材料">
    {files.map((file, index) => <Attachment key={index} className="max-w-64">
      <AttachmentMedia><FileText /></AttachmentMedia>
      <AttachmentContent><AttachmentTitle title={file.name}>{file.name}</AttachmentTitle></AttachmentContent>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`移除 ${file.name}`} disabled={busy || materialsLocked} onClick={() => {
        setDraft({ ...draft, firstMessageFiles: files.filter((_, current) => current !== index) })
      }}><X /></Button>
    </Attachment>)}
  </section>
  return <div className="chat-panel core-chat-start">
    <header className="chat-header"><div className="chat-heading"><h2 className="chat-title">{topic ? `与${name}的新话题` : name}</h2></div></header>
    <div className="messages"><div className="chat-empty">
      <div className="avatar-stack">{employee && <Avatar name={employee.name} seed={employee.id} avatar={employee.avatar} color={employee.color} />}</div>
      {!topic && <h2>与{name}聊一聊</h2>}
    </div></div>
    <div className="composer-wrap">
      {supportsAttachments && <input ref={fileInput} type="file" multiple hidden aria-label="选择图片或文件" onChange={event => {
        const selected = Array.from(event.currentTarget.files ?? [])
        event.currentTarget.value = ''
        addFiles(selected)
      }} />}
      <PromptBar attachments={attachments} pageActive={pageActive} api={api} resources={snapshot.resources} draft={draft} setDraft={setDraft} members={members} group={false} external={false} conversationReady={false} placeholder={topic ? `给${name}发送新话题的第一条消息` : "说说你想完成什么，/ 查看命令…"} onSend={onSend} onActivity={noConversation} onOpenWorkspace={noConversation}>
      {(choices, voice) => <ComposerToolbar choices={choices} key={employeeId ?? name} voice={voice.controls} pageActive={pageActive} api={api} members={members} snapshot={snapshot} group={false} external={false} busy={busy} active={false} canSend={Boolean(draftContent(draft) || files.length)} configurationLocked={configurationLocked} onAddMaterial={supportsAttachments ? () => fileInput.current?.click() : undefined} materialsDisabled={!canChooseFiles} sourcesDisabled={Boolean(draft.submission)} onSettings={onSettings} onConfigureAgent={onConfigureAgent} onChangeAgent={onChangeAgent} onSend={voice.onSend} />}
    </PromptBar></div>
  </div>
}
