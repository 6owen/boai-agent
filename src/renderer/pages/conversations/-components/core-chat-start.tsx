/*
 * [INPUT]: 核心助手和连接快照、仅保留在页面中的输入与首次发送回调。
 * [OUTPUT]: 可反复打开的空白核心聊天；复用真实 composer/模型设置，首次发送前没有会话身份、工作目录或会话管理操作。
 * [POS]: 会话页首发入口；持久化及请求回执由 AppShell 和宿主负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Snapshot, DigitalAgent } from '@shared/domain'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '@shared/domain/core-agent'
import { Avatar } from '@/components/common'
import { PromptBar } from './prompt-bar'
import { ComposerToolbar, type ComposerAgentPatch } from './composer-toolbar'
import type { ChatDraft } from '../presentation'
import { draftContent } from '../inline-mentions'

interface Props {
  snapshot: Snapshot; draft: ChatDraft; setDraft(value: ChatDraft): void; busy: boolean; configurationLocked: boolean
  onSend(): void; onSettings(): void; onChangeAgent(agent: DigitalAgent, patch: ComposerAgentPatch): void
}
export function CoreChatStart({ snapshot, draft, setDraft, busy, configurationLocked, onSend, onSettings, onChangeAgent }: Props) {
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
    <div className="composer-wrap"><PromptBar draft={draft} setDraft={setDraft} members={members} group={false} external={false} conversationReady={false} placeholder="说说你想完成什么，/ 查看命令…" onSend={onSend} onActivity={noConversation} onOpenWorkspace={noConversation}>
      {(openMenu, menu) => <ComposerToolbar members={members} snapshot={snapshot} group={false} external={false} conversationReady={false} busy={busy} active={false} canSend={Boolean(draftContent(draft))} configurationLocked={configurationLocked} mentionsVisible={false} commandsVisible={menu === 'slash'} onOpenWorkspace={noConversation} onMentions={noConversation} onCommands={() => openMenu('slash')} onSettings={onSettings} onChangeAgent={onChangeAgent} onSend={onSend} onStop={noConversation} />}
    </PromptBar></div>
  </div>
}
