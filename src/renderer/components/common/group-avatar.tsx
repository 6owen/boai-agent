/*
 * [INPUT]: 按群成员顺序排列的员工及各自头像。
 * [OUTPUT]: 最多九位成员的居中拼图头像，复用员工头像回退规则。
 * [POS]: 会话与通讯录共享群头像。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { CSSProperties } from 'react'
import type { DigitalAgent } from '@shared/domain'
import { Avatar } from './index'
import { Users } from '@/components/icons'

const rowsByCount = [[], [1], [2], [1, 2], [2, 2], [1, 2, 2], [3, 3], [1, 3, 3], [2, 3, 3], [3, 3, 3]]
export function GroupAvatar({ members }: { members: DigitalAgent[] }) {
  const shown = members.slice(0, 9), rows = rowsByCount[shown.length]!
  let offset = 0
  return <span className="group-avatar" data-count={shown.length} aria-hidden="true" style={{ '--avatar-grid-size': Math.max(rows.length, ...rows) || 1 } as CSSProperties}>
    {rows.length ? rows.map((count, index) => {
      const row = shown.slice(offset, offset += count)
      return <span className="group-avatar-row" key={index}>{row.map(member => <span className="group-avatar-tile" key={member.id}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /></span>)}</span>
    }) : <Users />}
  </span>
}
