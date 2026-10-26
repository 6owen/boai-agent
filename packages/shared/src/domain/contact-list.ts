/*
 * [INPUT]: 通讯录员工/群聊身份、兼容旧分类的标签及排序操作。
 * [OUTPUT]: 多标签、原子批量标签/员工删除和统一员工排序合同；旧分类 ID、名称及单归属可无损读取。
 * [POS]: shared/domain 的通讯录展示合同，不改变员工配置或聊天状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export interface ContactListPreferences {
  revision: number
  categories: { id: string; name: string }[]
  categoryByAgentId: Record<string, string>
  tagIdsByAgentId?: Record<string, string[]>
  agentOrder: string[]
  groupOrder: string[]
}

export type ContactListAction =
  | { kind: 'create-category'; name: string }
  | { kind: 'rename-category'; categoryId: string; name: string }
  | { kind: 'delete-category'; categoryId: string }
  | { kind: 'delete-category-agents'; categoryId: string }
  | { kind: 'move-category'; categoryId: string; targetId: string; placement: 'before' | 'after' }
  | { kind: 'assign-category'; agentId: string; categoryId?: string }
  | { kind: 'set-agent-tags'; agentIds: string[]; tagIds: string[]; mode: 'replace' | 'add' | 'remove' }
  | { kind: 'delete-agents'; agentIds: string[] }
  | { kind: 'move'; itemKind: 'agent' | 'group'; id: string; targetId: string; placement: 'before' | 'after' }

export const emptyContactList = (): ContactListPreferences => ({ revision: 0, categories: [], categoryByAgentId: {}, agentOrder: [], groupOrder: [] })

export function contactTagIds(value: Pick<ContactListPreferences, 'categoryByAgentId' | 'tagIdsByAgentId'> | null | undefined, agentId: string): string[] {
  const tags = value?.tagIdsByAgentId?.[agentId]
  if (tags) return [...new Set(tags)]
  const categoryId = value?.categoryByAgentId[agentId]
  return categoryId ? [categoryId] : []
}

export function sortedContacts<T extends { id: string }>(items: T[], order: string[], name: (item: T) => string): T[] {
  const positions = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length) || name(a).localeCompare(name(b), 'zh-CN') || a.id.localeCompare(b.id))
}
