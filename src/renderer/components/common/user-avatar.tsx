/*
 * [INPUT]: 唯一已提交资料或编辑草稿及离线预设。
 * [OUTPUT]: 共用圆角方形本人头像；透明预设及旧文字/无效/损坏图片的小老虎回退不叠加底色，上传图片保留既有底色，不请求远程地址。
 * [POS]: 导航、资料和单聊/群聊共用头像。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { userAvatarSource } from '@/assets/avatars'
import { defaultUserProfile, type LocalUserProfile } from '@shared/domain/profile'

export function UserAvatar({ profile = defaultUserProfile }: { profile?: Pick<LocalUserProfile, 'displayName' | 'avatar'> }) {
  const source = userAvatarSource(profile.avatar)
  const [failed, setFailed] = useState<string>()
  const preset = profile.avatar.kind !== 'image' || source === userAvatarSource() || failed === source
  return <span className="avatar user-avatar" style={preset ? { background: 'transparent' } : undefined} aria-hidden="true"><img src={failed === source ? userAvatarSource() : source} alt="" draggable={false} onError={() => setFailed(source)} /></span>
}
