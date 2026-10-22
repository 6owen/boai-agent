/*
 * [INPUT]: React、BOAI共享组件及调用方传入的展示状态。
 * [OUTPUT]: 可在桌面与独立站点共用的展示组件。
 * [POS]: @boai/ui，无业务服务或桌面依赖。
 * [PROTOCOL]: 修改时同步Header和所属目录.folder.md。
 */
import type { CSSProperties, ReactNode } from 'react'
import { Users } from '../icons'
const rowsByCount = [[], [1], [2], [1, 2], [2, 2], [1, 2, 2], [3, 3], [1, 3, 3], [2, 3, 3], [3, 3, 3]]
export function GroupAvatarView({ members }: { members: readonly { id: string; content: ReactNode }[] }) {
  const shown = members.slice(0, 9), rows = rowsByCount[shown.length]!
  let offset = 0
  return <span className="group-avatar" data-count={shown.length} aria-hidden="true" style={{ '--avatar-grid-size': Math.max(rows.length, ...rows) || 1 } as CSSProperties}>
    {rows.length ? rows.map((count, index) => {
      const row = shown.slice(offset, offset += count)
      return <span className="group-avatar-row" key={index}>{row.map(member => <span className="group-avatar-tile" key={member.id}>{member.content}</span>)}</span>
    }) : <Users />}
  </span>
}
