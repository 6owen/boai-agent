/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [INPUT]: Multi-level directory pages, expansion state and filename edge cases.
 * [OUTPUT]: Lazy tree projection, hidden-file filtering, pagination and extension preservation.
 * [POS]: Official file explorer model tests, independent of DOM and model providers.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { treeRows, splitNameTail } from '../packages/file-explorer-plugin/src/tree'
import type { WorkspaceDirectoryPage } from '../packages/shared/src/ipc/workspace-files'
const page = (relativePath: string, entries: WorkspaceDirectoryPage['entries'], nextCursor?: string): WorkspaceDirectoryPage => ({ rootPath: '/project', path: `/project/${relativePath}`, relativePath, entries, nextCursor })
it('only expands cached children of open directories and preserves per-directory pagination', () => {
  const cache = new Map([
    ['', page('', [{ name: 'src', kind: 'directory', relativePath: 'src' }, { name: '.secret', kind: 'file', relativePath: '.secret' }])],
    ['src', page('src', [{ name: 'main.ts', kind: 'file', relativePath: 'src/main.ts' }], 'page-2')],
  ])
  expect(treeRows(cache, new Set(), false).map(row => row.entry.relativePath)).toEqual(['src'])
  const rows = treeRows(cache, new Set(['src']), false)
  expect(rows.map(row => [row.entry.name, row.depth, row.more ?? false])).toEqual([['src',1,false],['main.ts',2,false],['加载更多',2,true]])
  expect(treeRows(cache, new Set(), true).map(row => row.entry.name)).toEqual(['src', '.secret'])
})
it('keeps meaningful suffixes and dotfiles intact', () => {
  expect(splitNameTail('a.long.name.ts')).toEqual({ head: 'a.long.name', tail: '.ts' })
  expect(splitNameTail('.env')).toEqual({ head: '.env', tail: '' })
  expect(splitNameTail('Makefile')).toEqual({ head: 'Makefile', tail: '' })
})
