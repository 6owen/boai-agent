/*
 * [INPUT]: 原生patch/文件正文与全局diff格式适配，使用真实Pierre解析器。
 * [OUTPUT]: 多文件/真实行号/无末尾换行及新增删除正文保真；不完整差异回退原文。
 * [POS]: 全局diff预览数据测试，不调用模型或文件系统。
 * [PROTOCOL]: 修改同步Header及tests/.folder.md。
 */
import { expect, test } from 'vitest'
import { prepareDiffPreview } from '../src/renderer/components/common/file-preview/diff-preview-data'

const modified = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -120,2 +120,2 @@\n keep\n-before\n+after\n'
const added = 'diff --git a/需求.md b/需求.md\nnew file mode 100644\n--- /dev/null\n+++ b/需求.md\n@@ -0,0 +1 @@\n+# 需求\n'

test('renders every file in a patch with original line coordinates and no fabricated full source', () => {
  const result = prepareDiffPreview({ diff: modified + added })
  expect(result.kind).toBe('patch')
  if (result.kind !== 'patch') throw new Error('Expected parsed patch')
  expect(result.files.map(file => file.name)).toEqual(['src/a.ts', '需求.md'])
  expect(result.files[0].hunks[0]).toMatchObject({ additionStart: 120, deletionStart: 120 })
  expect(result.files[0].oldLines).toBeUndefined()
  expect(result.files[1]).toMatchObject({ type: 'new', hunks: [{ deletionCount: 0, additionCount: 1 }] })
})

test('hunk-only updates use the supplied path while preserving real offsets and EOF information', () => {
  const result = prepareDiffPreview({ path: '文档.md', changeKind: 'update', diff: '@@ -42 +42 @@\n-旧内容\n\\ No newline at end of file\n+新内容\n\\ No newline at end of file\n' })
  expect(result.kind).toBe('patch')
  if (result.kind !== 'patch') throw new Error('Expected parsed patch')
  expect(result.files[0]).toMatchObject({ name: '文档.md', hunks: [{ additionStart: 42, deletionStart: 42, hunkContent: [{ additions: ['新内容'], deletions: ['旧内容'], noEOFCRAdditions: true, noEOFCRDeletions: true }] }] })
})

test.each(['add', 'delete'] as const)('explicit %s file bodies retain Markdown markers and trailing blank lines', changeKind => {
  const diff = '# 标题\n\n- 列表项\n+ 另一行\n\n'
  expect(prepareDiffPreview({ path: '需求.md', changeKind, diff })).toEqual({ kind: 'file', path: '需求.md', oldText: changeKind === 'delete' ? diff : '', newText: changeKind === 'add' ? diff : '' })
})

test.each([
  '-before\n+after',
  'diff --git a/picture.png b/picture.png\nBinary files a/picture.png and b/picture.png differ\n',
  'diff --git a/old.md b/new.md\nsimilarity index 100%\nrename from old.md\nrename to new.md\n',
  modified.replace('@@ -120,2 +120,2 @@', '@@ -120,20 +120,20 @@'),
])('retains incomplete or non-text changes as original text instead of implying a complete visual diff: %s', diff => {
  expect(prepareDiffPreview({ path: 'file', changeKind: 'update', diff })).toEqual({ kind: 'raw' })
})

test('updated patches are parsed from their new content rather than a path-only cache', () => {
  const result = prepareDiffPreview({ diff: modified.replace('+after', '+latest') })
  if (result.kind !== 'patch') throw new Error('Expected parsed patch')
  expect(result.files[0].hunks[0].hunkContent.at(-1)).toMatchObject({ additions: ['latest\n'] })
})
