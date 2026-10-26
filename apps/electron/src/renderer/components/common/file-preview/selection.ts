/*
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 当前预览 DOM 和用户浏览器选区。
 * [OUTPUT]: 只捕获正文内有界选区；源码真实行或 PDF 页码作为可编辑位置提示。
 * [POS]: common 文件预览选择辅助；不解析/写入文件，不读取页面外选择。
 * [PROTOCOL]: 修改时同步 Header 和所属 .folder.md。
 */
import { FILE_EDIT_QUOTE_LIMIT, type FileEditAnnotation } from '@boai/shared/domain/file-edit'

export function previewSelection(root: HTMLElement, selection: Selection | null): FileEditAnnotation | undefined {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
  const range = selection.getRangeAt(0)
  const element = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  const start = element(range.startContainer), end = element(range.endContainer)
  if (!start || !end || !root.contains(start) || !root.contains(end) || start.closest('[data-slot="file-preview-header"]') || end.closest('[data-slot="file-preview-header"]')) return
  const quote = selection.toString().trim()
  if (!quote || quote.length > FILE_EDIT_QUOTE_LIMIT) return
  const first = start.closest('[data-file-line]')?.getAttribute('data-file-line'), last = end.closest('[data-file-line]')?.getAttribute('data-file-line')
  const page = start.closest('.page[data-page-number]')?.getAttribute('data-page-number')
  const lastPage = end.closest('.page[data-page-number]')?.getAttribute('data-page-number')
  const location = first && last ? (first === last ? `第 ${first} 行` : `第 ${first}–${last} 行`) : page && lastPage ? (page === lastPage ? `第 ${page} 页` : `第 ${page}–${lastPage} 页`) : undefined
  return { quote, ...(location ? { location } : {}) }
}
