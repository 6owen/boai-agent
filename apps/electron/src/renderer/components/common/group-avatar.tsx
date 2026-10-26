/*
 * [OUTPUT]: 群成员领域映射保留，拼图DOM共用公共GroupAvatarView。
 * [INPUT]: 按群成员顺序排列的员工及各自头像。
 * [OUTPUT]: 最多九位成员的居中拼图头像，复用员工头像回退规则。
 * [POS]: 会话与通讯录共享群头像。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DigitalAgent } from '@boai/shared/domain'
import { GroupAvatarView } from '@boai/ui/group-avatar'
import { Avatar } from './index'
export function GroupAvatar({ members }: { members: DigitalAgent[] }) {
  return <GroupAvatarView members={members.map(member => ({ id: member.id, content: <Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /> }))} />
}
