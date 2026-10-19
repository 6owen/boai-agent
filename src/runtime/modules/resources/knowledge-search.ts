/*
 * [INPUT]: 获准知识资源的冻结文件清单、关键词和取消信号。
 * [OUTPUT]: 有界UTF-8检索、内容身份/行号引用与扫描限制；不扩大到运行后新增文件。
 * [POS]: 知识资料共用关键词检索，原件读取由版本边界核验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { readVersionedText, type ResourceVersion } from '../workspaces/environment-plan'
import type { Resource } from '../../../shared/domain'
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
  const parts = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const tokens = [...new Set(parts.flatMap(part => /[\u3400-\u9fff]/u.test(part) && part.length > 2 ? [part, ...Array.from({ length: part.length - 1 }, (_, index) => part.slice(index, index + 2))] : [part]))].slice(0, 32)
  if (!tokens.length) return { results: [], note: '请输入检索关键词' }
  const hits: { resourceId: string; contentHash: string; revision?: number; name: string; path: string; line: number; excerpt: string; citation: string; score: number }[] = []
  const scanned = await collectKnowledge(resources, signal, versions)
  for (const file of scanned.files) {
    const lines = file.content.split('\n')
    for (let index = 0; index < lines.length; index += 8) {
      const excerpt = lines.slice(index, index + 12).join('\n').slice(0, 2500)
      const text = excerpt.toLowerCase()
      const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0)
      if (score) hits.push({ resourceId: file.resource.id, contentHash: file.hash, revision: file.resource.knowledge?.revision, name: file.resource.name, path: file.file, line: index + 1, excerpt, citation: knowledgeCitation(file.resource.name, file.file, index + 1), score })
    }
  }
  return { results: hits.sort((a, b) => b.score - a.score).slice(0, 6), scannedFiles: scanned.files.length, omittedFiles: scanned.omitted, note: '本地关键词检索，仅扫描已授权的 Markdown/TXT；最多 256 个文件 / 8 MiB。未命中不证明资料不存在；可用inspect_knowledge和read_knowledge查阅。引用实际文件和行号。' }
}

