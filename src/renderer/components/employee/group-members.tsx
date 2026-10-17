/*
 * [OUTPUT]: Claude普通员工可在原群成员入口选择；核心组织群候选边界由调用方与宿主核对。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 普通群候选包含API与本机Codex员工，旧ACP仍不参与自主群聊。
 * [INPUT]: 员工快照、群成员草稿、选择变更和可选的资料入口。
 * [OUTPUT]: 紧凑头像网格，成员头像及添加均打开共用双栏成员选择器，已有成员回填；完成后更新草稿，由群编辑器保存。
 * [POS]: employee 群配置中的成员编辑组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { DigitalAgent } from '@shared/domain'
import { Avatar } from '@/components/common'
import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { GroupMemberDialog } from './group-member-selection'

export function GroupMembers({ agents, ids, disabled, onChange }: {
  agents: DigitalAgent[]; ids: string[]; disabled: boolean; onChange(ids: string[]): void
}) {
  const [editing, setEditing] = useState(false)
  const members = ids.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
  return <section className="group-members" aria-label="群成员">
    <div className="group-member-grid">
      {members.map(agent => <Button key={agent.id} variant="ghost" size="content" className="group-member-profile" aria-label={`配置群成员 ${agent.name}`} disabled={disabled} onClick={() => setEditing(true)}>
        <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span>{agent.name}</span>
      </Button>)}
      <Button variant="ghost" size="content" className="group-member-profile group-member-add" aria-label="添加群成员" disabled={disabled} onClick={() => setEditing(true)}><span className="group-member-add-icon"><Plus /></span><span>添加</span></Button>
    </div>
    {editing && <GroupMemberDialog agents={agents} ids={ids} busy={disabled} onClose={() => setEditing(false)} onConfirm={next => { onChange(next); setEditing(false) }} />}
  </section>
}
