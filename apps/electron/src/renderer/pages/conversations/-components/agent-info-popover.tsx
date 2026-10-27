/*
 * [OUTPUT]: 普通/执行消息共用资料卡与rounded-md头像触发器，不传独立round覆盖。
 * [INPUT]: 当前员工与已绑定资料快照、头像所在位置、配置导航回调、共享 Avatar/Popover/Separator。
 * [OUTPUT]: 点击消息或标题头像查看姓名、职责和技能/知识资料，不展示启用状态；底部配置按钮关闭浮层并通过稳定头像入口跳转该员工配置；标题保持原尺寸重叠头像。
 * [POS]: 单聊/群聊消息与群标题共用的员工资料浮层，复用系统 Soft 皮肤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent, Resource } from '@boai/shared/domain'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export function AgentInfoPopover({ agent, resources, onConfigure, placement = 'message' }: { agent: DigitalAgent; resources: Resource[]; onConfigure(): void; placement?: 'message' | 'header' }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const header = placement === 'header'
  const names = (ids: string[]) => ids.map(id => resources.find(resource => resource.id === id)?.name ?? '资料已移除').join('、') || '未绑定'
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button ref={trigger} variant={header ? 'link' : 'ghost'} size={header ? 'icon-xs' : 'icon'} className={header ? 'chat-member-avatar rounded-md' : 'message-avatar-trigger rounded-md'} aria-label={`查看 ${agent.name} 的资料`} title={agent.name} />}>
      <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />
    </PopoverTrigger>
    <PopoverContent side={header ? 'bottom' : 'right'} align={header ? 'end' : 'start'} className="agent-info-popover w-72 max-w-[calc(100vw-24px)] gap-3 p-4">
      <div className="agent-info-heading">
        <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />
        <div className="agent-info-identity"><PopoverTitle>{agent.name}</PopoverTitle></div>
      </div>
      <PopoverDescription>{agent.role || 'AI 员工'}</PopoverDescription>
      <Separator />
      <dl className="agent-info-facts">
        <div><dt>技能</dt><dd>{names(agent.skillIds)}</dd></div>
        <div><dt>知识库</dt><dd>{names(agent.knowledgeIds)}</dd></div>
      </dl>
      <Separator />
      <Button variant="secondary" size="sm" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); onConfigure() }}>配置 Agent</Button>
    </PopoverContent>
  </Popover>
}
