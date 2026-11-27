/*
 * [OUTPUT]: Claude普通员工可在原群成员入口选择；核心组织群候选边界由调用方与宿主核对。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 普通群候选包含API与本机Codex员工，旧ACP仍不参与自主群聊。
 * [INPUT]: 员工快照、群成员草稿、选择变更和资料导航。
 * [OUTPUT]: 共用头像姓名宫格；编辑模式打开双栏选择器，资料页进入员工配置。
 * [POS]: employee 群配置中的成员编辑组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { DigitalAgent } from '@boai/shared/domain'
import { Avatar } from '@/components/common'
import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { GroupMemberDialog } from './group-member-selection'

export function GroupMemberGrid({ members, disabled, onMemberClick, memberLabel, onAdd }: {
  members: DigitalAgent[]; disabled: boolean; onMemberClick(id: string): void
  memberLabel(name: string): string; onAdd?(): void
}) {
  return <div className="group-member-grid">
    {members.map(agent => <Button key={agent.id} type="button" variant="ghost" size="content" className="group-member-profile" aria-label={memberLabel(agent.name)} disabled={disabled} onClick={() => onMemberClick(agent.id)}>
      <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span>{agent.name}</span>
    </Button>)}
    {onAdd && <Button type="button" variant="ghost" size="content" className="group-member-profile group-member-add" aria-label="添加群成员" disabled={disabled} onClick={onAdd}><span className="group-member-add-icon"><Plus /></span><span>添加</span></Button>}
  </div>
}

export function GroupMembers({ agents, ids, disabled, onChange }: {
  agents: DigitalAgent[]; ids: string[]; disabled: boolean; onChange(ids: string[]): void
}) {
  const [editing, setEditing] = useState(false)
  const members = ids.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
  return <section className="group-members" aria-label="群成员">
    <GroupMemberGrid members={members} disabled={disabled} memberLabel={name => `配置群成员 ${name}`} onMemberClick={() => setEditing(true)} onAdd={() => setEditing(true)} />
    {editing && <GroupMemberDialog agents={agents} ids={ids} busy={disabled} onClose={() => setEditing(false)} onConfirm={next => { onChange(next); setEditing(false) }} />}
  </section>
}
