/*
 * [OUTPUT]: 2026-11-24 第三阶段：知识排名使用官方 Workspace BM25，保留冻结来源和引用身份。
 * [INPUT]: 获准知识资源的冻结文件清单、关键词和取消信号。
 * [OUTPUT]: 有界UTF-8检索、内容身份/行号引用与扫描限制；不扩大到运行后新增文件。
 * [POS]: 知识资料共用官方 Workspace BM25 检索，原件读取由版本边界核验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { readVersionedText, type ResourceVersion } from '../workspaces/environment-plan'
import type { Resource } from '@boai/shared/domain'
import { MAX_FILE_BYTES } from '../workspaces/file-access'
const check = (signal: AbortSignal) => signal.throwIfAborted()

export const knowledgeCitation = (name: string, file: string, line: number) => `[${name.replaceAll(']', '')}:${line}](<${file}:${line}>)`

async function collectKnowledge(resources: Resource[], signal: AbortSignal, versions: ResourceVersion[]) {
  const files: { resource: Resource; file: string; content: string; hash: string }[] = []
  let bytes = 0, omitted = 0
  const ids = new Set(resources.map(resource => resource.id))
  for (const version of versions.filter(version => ids.has(version.resource.id))) {
    for (const file of version.files) {
      check(signal)
      if (files.length >= 256 || !/\.(md|txt|markdown)$/i.test(file.path) || file.size > MAX_FILE_BYTES || bytes + file.size > 8 * MAX_FILE_BYTES) { omitted++; continue }
      const content = await readVersionedText(file.path, [version])
      bytes += file.size
      files.push({ resource: version.resource, file: file.path, content, hash: file.hash })
    }
  }
  check(signal)
  return { files, omitted }
}

export async function searchKnowledge(resources: Resource[], query: string, signal: AbortSignal, versions: ResourceVersion[]) {
  if (!query.trim()) return { results: [], note: '请输入检索关键词' }
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const workspace = new Workspace({ id: 'authorized-knowledge', filesystem: new LocalFilesystem({ basePath: '/', readOnly: true }), tools: { enabled: false }, bm25: { tokenize: {
    tokenizer: text => [...segmenter.segment(text.toLowerCase())].filter(part => part.isWordLike).map(part => part.segment),
  } } })
  try {
    const scanned = await collectKnowledge(resources, signal, versions)
    for (const file of scanned.files) {
      check(signal)
      await workspace.index(file.file, file.content, { metadata: { resourceId: file.resource.id, contentHash: file.hash, revision: file.resource.knowledge?.revision, name: file.resource.name, path: file.file } })
    }
    const hits = await workspace.search(query, { mode: 'bm25', topK: 6 })
    check(signal)
    const results = hits.map(hit => {
      const file = scanned.files.find(file => file.file === hit.metadata?.path)!
      const line = hit.lineRange?.start ?? 1
      return { resourceId: file.resource.id, contentHash: file.hash, revision: file.resource.knowledge?.revision, name: file.resource.name, path: file.file, line, excerpt: hit.content, score: hit.score, citation: knowledgeCitation(file.resource.name, file.file, line) }
    })
    return { results, scannedFiles: scanned.files.length, omittedFiles: scanned.omitted, note: 'Mastra BM25 检索，仅扫描本次已授权的 Markdown/TXT 版本；最多 256 个文件 / 8 MiB。未命中不证明资料不存在。' }
  } finally { await workspace.destroy() }
}
