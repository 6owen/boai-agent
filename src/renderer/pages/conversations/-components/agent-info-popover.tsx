/*
 * [INPUT]: 当前员工与已绑定资料快照、头像所在位置、共享 Avatar/Popover/Badge/Separator。
 * [OUTPUT]: 点击消息或标题头像查看姓名、职责、启用状态和技能/知识资料；标题采用原尺寸无按钮底色的重叠头像并向下打开浮层，只读不改变会话状态。
 * [POS]: 群聊消息与标题共用的员工资料浮层，复用系统 Soft 皮肤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent, Resource } from '@shared/domain'
import { Avatar } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export function AgentInfoPopover({ agent, resources, placement = 'message' }: { agent: DigitalAgent; resources: Resource[]; placement?: 'message' | 'header' }) {
  const header = placement === 'header'
  const names = (ids: string[]) => ids.map(id => resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  return <Popover>
    <PopoverTrigger render={<Button variant={header ? 'link' : 'ghost'} size={header ? 'icon-xs' : 'icon'} round className={header ? 'chat-member-avatar' : 'message-avatar-trigger'} aria-label={`查看 ${agent.name} 的资料`} title={agent.name} />}>
      <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />
    </PopoverTrigger>
    <PopoverContent side={header ? 'bottom' : 'right'} align={header ? 'end' : 'start'} className="agent-info-popover w-72 max-w-[calc(100vw-24px)] gap-3 p-4">
      <div className="agent-info-heading">
        <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />
        <div className="agent-info-identity"><PopoverTitle>{agent.name}</PopoverTitle><Badge variant="secondary">{agent.active ? '已启用' : '已停用'}</Badge></div>
      </div>
      <PopoverDescription>{agent.role || 'AI 员工'}</PopoverDescription>
      <Separator />
      <dl className="agent-info-facts">
        <div><dt>技能</dt><dd>{names(agent.skillIds)}</dd></div>
        <div><dt>知识库</dt><dd>{names(agent.knowledgeIds)}</dd></div>
      </dl>
    </PopoverContent>
  </Popover>
}
