/*
 * [INPUT]: 本地十二生肖与毛绒角色透明 WebP 及共享员工/个人头像合同。
 * [OUTPUT]: 21 款预设图片映射、历史 ID 兼容、员工默认头像及个人默认小老虎/旧文字/无效图片的统一来源解析。
 * [POS]: 离线头像素材入口，不请求网络图片。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AVATAR_IMAGE_MAX_LENGTH, defaultAvatar, type AgentAvatar, type AvatarPresetId } from '@shared/domain/avatars'
import { defaultUserAvatar, type UserAvatar } from '@shared/domain/profile'
import rat from './rat.webp'
import ox from './ox.webp'
import tiger from './tiger.webp'
import rabbit from './rabbit.webp'
import dragon from './dragon.webp'
import snake from './snake.webp'
import horse from './horse.webp'
import goat from './goat.webp'
import monkey from './monkey.webp'
import rooster from './rooster.webp'
import dog from './dog.webp'
import pig from './pig.webp'
import mintCap from './mint-cap.webp'
import coralHeadphones from './coral-headphones.webp'
import purpleStar from './purple-star.webp'
import yellowSquare from './yellow-square.webp'
import blueMoon from './blue-moon.webp'
import redMushroom from './red-mushroom.webp'
import mintRing from './mint-ring.webp'
import pinkBeret from './pink-beret.webp'
import purpleScarf from './purple-scarf.webp'
export const avatarImages: Record<AvatarPresetId, string> = {
  owl: rat, fox: ox, cat: tiger, rabbit, bear: dragon, panda: snake, dog, koala: horse, frog: goat, penguin: monkey, hamster: rooster, robot: pig,
  'mint-cap': mintCap, 'coral-headphones': coralHeadphones, 'purple-star': purpleStar, 'yellow-square': yellowSquare,
  'blue-moon': blueMoon, 'red-mushroom': redMushroom, 'mint-ring': mintRing, 'pink-beret': pinkBeret, 'purple-scarf': purpleScarf,
}
export function avatarSource(avatar: AgentAvatar | undefined, seed: string) {
  return avatar?.kind === 'image' ? avatar.dataUrl : avatarImages[avatar?.kind === 'preset' ? avatar.id : defaultAvatar(seed)]
}
export function userAvatarSource(avatar?: UserAvatar) {
  if (avatar?.kind === 'preset') return avatarImages[avatar.id] ?? avatarImages[defaultUserAvatar.id]
  if (avatar?.kind === 'image' && avatar.dataUrl.length <= AVATAR_IMAGE_MAX_LENGTH && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar.dataUrl)) return avatar.dataUrl
  return avatarImages[defaultUserAvatar.id]
}
