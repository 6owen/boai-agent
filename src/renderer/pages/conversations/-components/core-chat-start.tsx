/*
 * [OUTPUT]: 首发使用当前连接模型菜单与已绑定技能提及，尚无会话时不查询文件。
 * [OUTPUT]: 核心首发与已有聊天共用当前连接内的模型和推理选项，保存沿真实回执并区分未提交/未知，原首发草稿和发送语义保持。
 * [INPUT]: 核心助手和连接快照、仅保留在页面中的输入与首次发送回调。
 * [OUTPUT]: 可反复打开的空白核心聊天；复用仅发送消息的 composer/模型设置，无停止按钮，首次发送前没有会话身份、工作目录或会话管理操作。
 * [POS]: 会话页首发入口；持久化及请求回执由 AppShell 和宿主负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Snapshot, DigitalAgent } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '@shared/domain/core-agent'
import { Avatar } from '@/components/common'
import { PromptBar } from './prompt-bar'
import { ComposerToolbar, type ComposerAgentPatch, type ComposerAgentSaveResult } from './composer-toolbar'
import type { ChatDraft } from '../presentation'
import { draftContent } from '../inline-mentions'

interface Props {
  api: DesktopApi; snapshot: Snapshot; draft: ChatDraft; setDraft(value: ChatDraft): void; busy: boolean; configurationLocked: boolean
  onSend(): void; onSettings(agent?: DigitalAgent): void; onConfigureAgent(agent: DigitalAgent): void; onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): Promise<ComposerAgentSaveResult>
}
export function CoreChatStart({ api, snapshot, draft, setDraft, busy, configurationLocked, onSend, onSettings, onConfigureAgent, onChangeAgent }: Props) {
  const members = snapshot.agents.filter(isCoreAgent)
  const core = members[0]
  const name = core?.name ?? CORE_AGENT_DEFAULT_NAME
  const noConversation = () => undefined
  return <div className="chat-panel core-chat-start">
    <header className="chat-header"><div className="chat-heading"><h2 className="chat-title">{name}</h2></div></header>
    <div className="messages"><div className="chat-empty">
      <div className="avatar-stack">{core && <Avatar name={core.name} seed={core.id} avatar={core.avatar} color={core.color} />}</div>
      <h2>与{name}聊一聊</h2><p>从日常交流到具体工作，都可以直接提出。</p>
    </div></div>
    <div className="composer-wrap"><PromptBar api={api} resources={snapshot.resources} draft={draft} setDraft={setDraft} members={members} group={false} external={false} conversationReady={false} placeholder="说说你想完成什么，/ 查看命令…" onSend={onSend} onActivity={noConversation} onOpenWorkspace={noConversation}>
      {(openMenu, menu) => <ComposerToolbar api={api} members={members} snapshot={snapshot} group={false} external={false} conversationReady={false} busy={busy} active={false} canSend={Boolean(draftContent(draft))} configurationLocked={configurationLocked} mentionsVisible={menu === 'at'} commandsVisible={menu === 'slash'} onOpenWorkspace={noConversation} onMentions={() => openMenu('at')} onCommands={() => openMenu('slash')} onSettings={onSettings} onConfigureAgent={onConfigureAgent} onChangeAgent={onChangeAgent} onSend={onSend} />}
    </PromptBar></div>
  </div>
}
