/*
 * [INPUT]: 当前会话来源、员工快照及既有员工详情导航。
 * [OUTPUT]: 只读渠道来源与接入员工；不拉取远端成员，不提供BOAI群编辑/解散操作。
 * [POS]: 渠道会话详情，复用原右侧面板与员工配置入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { Conversation, Snapshot } from '@boai/shared/domain'
import { CHANNEL_NAMES } from '@boai/shared/domain/channels'
import { Avatar } from '@/components/common'
import { Button } from '@/components/ui/button'

export function ChannelConversationInfo({ conversation, snapshot, onOpenAgent }: { conversation: Conversation; snapshot: Snapshot; onOpenAgent(id: string): void }) {
  const source = conversation.channel!
  return <div className="detail-section" aria-label="渠道信息">
    <h3>渠道信息</h3>
    <p>{conversation.title}</p>
    <p className="field-hint">{CHANNEL_NAMES[source.platform]} · {source.kind === 'group' ? '外部群' : '外部私聊'}</p>
    <p className="field-hint break-all">{source.kind === 'group' ? '群 ID' : '会话 ID'}：{source.chatId}</p>
    {source.userId && <p className="field-hint break-all">平台用户：{source.userId}</p>}
    <h4>接入员工</h4>
    {conversation.agentIds.map(id => {
      const agent = snapshot.agents.find(item => item.id === id)
      return agent && <Button key={id} variant="ghost" className="justify-start" onClick={() => onOpenAgent(id)}><Avatar small name={agent.name} seed={id} avatar={agent.avatar} color={agent.color} />{agent.name}</Button>
    })}
    <p className="field-hint">机器人收到的消息由接入员工处理，回复回到原平台。BOAI 发起的消息仅保存在本地。</p>
    <p className="field-hint">{source.kind === 'group' ? '群成员和群名称由所属平台管理；其他员工通过各自的渠道会话交流。' : '该私聊独立于本人主私聊。'}渠道授权与连接在员工的渠道配置中管理。</p>
    {conversation.agentIds.length !== 1 && <p className="field-hint">旧多员工渠道会话仅保留历史。新的平台消息进入各员工独立的渠道会话。</p>}
  </div>
}
