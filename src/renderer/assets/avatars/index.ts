/*
 * [INPUT]: 本地 SVG 小伙伴及共享员工头像合同。
 * [OUTPUT]: 预设图片映射与自定义图片/默认头像解析。
 * [POS]: 离线头像素材入口，不请求网络图片。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defaultAvatar, type AgentAvatar, type AvatarPresetId } from '@shared/domain/avatars'
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
