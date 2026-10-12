/*
 * [INPUT]: 运行时原始patch、可选文件路径与明确新增/删除语义；Pierre官方解析器。
 * [OUTPUT]: 完整文件/多文件patch的只读展示数据；保留hunk行号，不将缺失上下文补成完整文件。
 * [POS]: 全局diff预览的格式适配，不读取磁盘或修改原生事件。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs'

export type DiffPreviewInput = { diff: string; path?: string; changeKind?: 'add' | 'delete' | 'update' }
type DiffPreviewData =
  | { kind: 'patch'; files: FileDiffMetadata[] }
  | { kind: 'file'; path: string; oldText: string; newText: string }
  | { kind: 'raw' }

export function prepareDiffPreview({ diff, path, changeKind }: DiffPreviewInput): DiffPreviewData {
  // Codex reports the complete file body for add/delete, and a patch for update.
  if (path && (changeKind === 'add' || changeKind === 'delete')) {
    return { kind: 'file', path, oldText: changeKind === 'delete' ? diff : '', newText: changeKind === 'add' ? diff : '' }
  }
  const hasHeader = /^(?:diff --git |--- .+\r?\n\+\+\+ )/m.test(diff)
  const hasHunk = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(diff)
  // A hunk-only update has real line coordinates: add filenames, never guessed context.
  const patch = hasHeader ? diff : hasHunk && path && !/[\r\n]/.test(path) ? `--- ${path}\n+++ ${path}\n${diff}` : undefined
  if (patch) {
    try {
      const files = parsePatchFiles(patch).flatMap(value => value.files)
      // Keep non-text changes and incomplete patches readable as their original record.
      if (files.length && files.every(file => file.name && file.hunks.length && file.hunks.every(hunk => {
        const context = hunk.hunkContent.reduce((count, part) => count + (part.type === 'context' ? part.lines.length : 0), 0)
        return hunk.additionCount === hunk.additionLines + context && hunk.deletionCount === hunk.deletionLines + context
      }))) return { kind: 'patch', files }
    } catch { /* Unsupported provider formats remain available verbatim below. */ }
  }
  return { kind: 'raw' }
}
