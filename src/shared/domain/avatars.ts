/*
 * [INPUT]: 历史员工头像标识、十二生肖与毛绒角色显示顺序及上传图片的数据约束。
 * [OUTPUT]: 员工头像类型、21 款预设名称和兼容旧索引的稳定默认选择。
 * [POS]: 跨进程头像合同；不包含浏览器 API 或图片二进制。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const avatarPresets = [
  { id: 'owl', name: '小老鼠' }, { id: 'fox', name: '小牛' },
  { id: 'cat', name: '小老虎' }, { id: 'rabbit', name: '小兔子' },
  { id: 'bear', name: '小龙' }, { id: 'panda', name: '小蛇' },
  { id: 'koala', name: '小马' }, { id: 'frog', name: '小羊' },
  { id: 'penguin', name: '小猴子' }, { id: 'hamster', name: '小鸡' },
  { id: 'dog', name: '小狗' }, { id: 'robot', name: '小猪' },
  { id: 'mint-cap', name: '帽子团子' }, { id: 'coral-headphones', name: '耳机团子' },
  { id: 'purple-star', name: '眼镜星星' }, { id: 'yellow-square', name: '眼镜方块' },
  { id: 'blue-moon', name: '小月亮' }, { id: 'red-mushroom', name: '小蘑菇' },
  { id: 'mint-ring', name: '薄荷圆环' }, { id: 'pink-beret', name: '贝雷团子' },
  { id: 'purple-scarf', name: '围巾团子' },
] as const
export type AvatarPresetId = typeof avatarPresets[number]['id']
export type AgentAvatar = { kind: 'preset'; id: AvatarPresetId } | { kind: 'image'; dataUrl: string }
export const AVATAR_IMAGE_MAX_LENGTH = 400_000
// 保留历史索引，选择器换序或追加素材不改变已有员工的默认头像 ID。
const defaultAvatarIds: readonly AvatarPresetId[] = ['owl', 'fox', 'cat', 'rabbit', 'bear', 'panda', 'dog', 'koala', 'frog', 'penguin', 'hamster', 'robot']
export function defaultAvatar(seed: string): AvatarPresetId {
  if (seed === 'researcher') return 'owl'
  if (seed === 'writer') return 'fox'
  if (seed === 'reviewer') return 'cat'
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return defaultAvatarIds[hash % defaultAvatarIds.length]
}
