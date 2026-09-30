/*
 * [INPUT]: 本地 SVG 小伙伴及共享员工/个人头像合同。
 * [OUTPUT]: 预设图片映射、员工默认头像及个人 SVG 默认/旧文字/无效图片的统一来源解析。
 * [POS]: 离线头像素材入口，不请求网络图片。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AVATAR_IMAGE_MAX_LENGTH, defaultAvatar, type AgentAvatar, type AvatarPresetId } from '@shared/domain/avatars'
import { defaultUserAvatar, type UserAvatar } from '@shared/domain/profile'
import owl from './owl.svg'
import fox from './fox.svg'
import cat from './cat.svg'
import rabbit from './rabbit.svg'
import bear from './bear.svg'
import panda from './panda.svg'
import dog from './dog.svg'
import koala from './koala.svg'
import frog from './frog.svg'
import penguin from './penguin.svg'
import hamster from './hamster.svg'
import robot from './robot.svg'
export const avatarImages: Record<AvatarPresetId, string> = { owl, fox, cat, rabbit, bear, panda, dog, koala, frog, penguin, hamster, robot }
export function avatarSource(avatar: AgentAvatar | undefined, seed: string) {
  return avatar?.kind === 'image' ? avatar.dataUrl : avatarImages[avatar?.kind === 'preset' ? avatar.id : defaultAvatar(seed)]
}
export function userAvatarSource(avatar?: UserAvatar) {
  if (avatar?.kind === 'preset') return avatarImages[avatar.id] ?? avatarImages[defaultUserAvatar.id]
  if (avatar?.kind === 'image' && avatar.dataUrl.length <= AVATAR_IMAGE_MAX_LENGTH && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar.dataUrl)) return avatar.dataUrl
  return avatarImages[defaultUserAvatar.id]
}
