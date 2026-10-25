/*
 * [INPUT]: bobo普通会话中的实际目录操作回执。
 * [OUTPUT]: 同一用户消息、资源类型和目标合并为一条结果；不同轮次保留，不保存配置或凭据。
 * [POS]: 技能/数据源管理的聊天导航合同。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
export interface CatalogActivity {
  id: string; conversationId: string; messageId: string
  kind: 'skill' | 'source'; action: string; createdAt: string
  targetId?: string; name: string; operationId?: string; removed?: boolean
}
export interface CatalogResult extends CatalogActivity { status?: string; available: boolean }

export function mergeCatalogResults(results: CatalogResult[]): CatalogResult[] {
  const byTarget = new Map<string, CatalogResult>()
  for (const item of results) {
    const id = JSON.stringify([item.messageId, item.kind, item.targetId ?? item.operationId ?? item.id])
    const previous = byTarget.get(id)
    if (!previous || item.createdAt > previous.createdAt || item.createdAt === previous.createdAt && (!previous.removed || item.removed)) byTarget.set(id, { ...item, id })
  }
  return [...byTarget.values()]
}
