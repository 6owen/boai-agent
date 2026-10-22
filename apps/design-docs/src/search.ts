/*
 * [INPUT]: 公开页面与用户检索文本。
 * [OUTPUT]: 优先标题、其次说明和正文的确定性搜索结果。
 * [POS]: 设计站本地检索，不访问网络或产品数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { DesignPage } from 'virtual:boai-design-content'

export function searchPages(pages: DesignPage[], query: string, limit = 8): DesignPage[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const normalized = words.join(' ')
  return pages.flatMap((page, index) => {
    const title = page.title.toLocaleLowerCase(), description = page.description.toLocaleLowerCase(), body = page.body.toLocaleLowerCase()
    if (!words.every(word => `${title} ${description} ${body}`.includes(word))) return []
    const rank = title === normalized ? 0 : title.includes(normalized) ? 1 : description.includes(normalized) ? 2 : 3
    return [{ page, rank, index }]
  }).sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, limit).map(value => value.page)
}
