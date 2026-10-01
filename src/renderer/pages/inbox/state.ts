/*
 * [INPUT]: 待处理查询身份、原来源 ID 的分页投影与读取生命周期。
 * [OUTPUT]: 筛选/搜索稳定身份、跨页去重、严格连续游标及隐藏/换查询后的过期结果拒绝。
 * [POS]: inbox 纯查询状态；不持有业务解决状态，不提交动作或调用模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { InboxCursor } from '@shared/domain/inbox'
export interface InboxPageSlice<T> { items: T[]; nextCursor?: InboxCursor }
export function inboxQueryKey(kind: string | undefined, search: string) { return JSON.stringify([kind ?? 'all', search.trim()]) }

/** Refresh all pages already opened by the user; a hidden page stops before its next read. */
export async function readInboxPages<T extends { id: string }>(load: (before?: InboxCursor) => Promise<InboxPageSlice<T>>, count: number, current: () => boolean): Promise<InboxPageSlice<T> | undefined> {
  const items = new Map<string, T>(), cursors = new Set<string>()
  let before: InboxCursor | undefined
  for (let page = 0; page < count; page++) {
    if (!current()) return
    const result = await load(before)
    if (!current()) return
    for (const item of result.items) items.set(item.id, item)
    before = result.nextCursor
    if (!before) break
    const key = JSON.stringify([before.time, before.id])
    if (cursors.has(key)) throw new Error('待处理分页游标未前进，请刷新后重试。')
    cursors.add(key)
  }
  return { items: [...items.values()], nextCursor: before }
}
