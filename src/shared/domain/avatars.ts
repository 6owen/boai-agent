/*
 * [INPUT]: 内置员工头像标识及上传图片的数据约束。
 * [OUTPUT]: 员工头像类型、离线预设目录和稳定默认选择。
 * [POS]: 跨进程头像合同；不包含浏览器 API 或图片二进制。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const avatarPresets = [
  { id: 'owl', name: '小猫头鹰' }, { id: 'fox', name: '小狐狸' },
  { id: 'cat', name: '小猫' }, { id: 'rabbit', name: '小兔子' },
  { id: 'bear', name: '小熊' }, { id: 'panda', name: '小熊猫' },
  { id: 'dog', name: '小狗' }, { id: 'koala', name: '小考拉' },
  { id: 'frog', name: '小青蛙' }, { id: 'penguin', name: '小企鹅' },
  { id: 'hamster', name: '小仓鼠' }, { id: 'robot', name: '小机器人' },
] as const
export type AvatarPresetId = typeof avatarPresets[number]['id']
export type AgentAvatar = { kind: 'preset'; id: AvatarPresetId } | { kind: 'image'; dataUrl: string }
export const AVATAR_IMAGE_MAX_LENGTH = 400_000
export function defaultAvatar(seed: string): AvatarPresetId {
  if (seed === 'researcher') return 'owl'
  if (seed === 'writer') return 'fox'
  if (seed === 'reviewer') return 'cat'
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return avatarPresets[hash % avatarPresets.length].id
}
