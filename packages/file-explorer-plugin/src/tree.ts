/*
 * [OUTPUT]: 2026-10-29 文件浏览器目录边界及真实回归覆盖；验证结果归第19组18。
 * [INPUT]: Scoped directory pages and the user's expanded/selected paths.
 * [OUTPUT]: Lazy tree rows and extension-preserving names, adapted from dsh-file-browser.
 * [POS]: Portable tree model; upstream MIT source pinned in ../source-manifest.json.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { WorkspaceDirectoryEntry, WorkspaceDirectoryPage } from '@boai/shared/ipc/workspace-files'
export interface TreeRow { entry: WorkspaceDirectoryEntry; depth: number; parent: string; more?: boolean }
// Adapted from lib/client.js splitNameTail and TreeNode's expanded/cache traversal.
export function splitNameTail(name: string) {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? { head: name, tail: '' } : { head: name.slice(0, dot), tail: name.slice(dot) }
}
export function treeRows(cache: ReadonlyMap<string, WorkspaceDirectoryPage>, expanded: ReadonlySet<string>, showHidden: boolean): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (parent: string, depth: number) => {
    const page = cache.get(parent)
    for (const entry of page?.entries ?? []) {
      if (!showHidden && entry.name.startsWith('.')) continue
      rows.push({ entry, depth, parent })
      if (entry.kind === 'directory' && expanded.has(entry.relativePath)) walk(entry.relativePath, depth + 1)
    }
    if (page?.nextCursor) rows.push({ entry: { name: '加载更多', relativePath: `${parent}/`, kind: 'other' }, depth, parent, more: true })
  }
  walk('', 1)
  return rows
}
