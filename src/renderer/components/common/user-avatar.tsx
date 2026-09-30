/*
 * [INPUT]: 唯一已提交资料或编辑草稿及离线预设。
 * [OUTPUT]: 本人圆形头像；旧文字/无效/损坏图片统一回退预置 SVG，不请求远程地址。
 * [POS]: 导航、资料和单聊/群聊共用头像。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { userAvatarSource } from '@/assets/avatars'
import { defaultUserProfile, type LocalUserProfile } from '@shared/domain/profile'

export function UserAvatar({ profile = defaultUserProfile }: { profile?: Pick<LocalUserProfile, 'displayName' | 'avatar'> }) {
  const source = userAvatarSource(profile.avatar)
  const [failed, setFailed] = useState<string>()
  return <span className="avatar user-avatar" aria-hidden="true"><img src={failed === source ? userAvatarSource() : source} alt="" draggable={false} onError={() => setFailed(source)} /></span>
}
