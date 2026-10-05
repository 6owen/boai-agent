/*
 * [INPUT]: 宿主有界页、先前已加载页数与当前查询资格。
 * [OUTPUT]: 返回页面时重新核对同范围页数；迟到结果停止后续分页，重复游标显性失败，不复用旧代际游标。
 * [POS]: 工作/文件读取的可测生命周期核心；不保留正文或进行业务突变。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { appendUnique } from './model'

export async function readFreshPages<T, C, P extends { items: T[]; nextCursor?: C; total: number }>(read: (cursor?: C) => Promise<P>, pages: number, current: () => boolean, identity: (item: T) => string): Promise<P | undefined> {
  let value: P | undefined, cursor: C | undefined
  const seen = new Set<string>()
  for (let index = 0; index < Math.max(1, pages); index++) {
    if (!current()) return undefined
    let page: P
    try { page = await read(cursor) } catch (cause) { if (!current()) return undefined; throw cause }
    if (!current()) return undefined
    value = value ? { ...page, items: appendUnique(value.items, page.items, identity) } : page
    if (!page.nextCursor) return value
    const key = JSON.stringify(page.nextCursor)
    if (seen.has(key)) throw new Error('分页位置重复，请重新读取当前清单。')
    seen.add(key); cursor = page.nextCursor
  }
  return value
}
