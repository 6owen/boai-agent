import { readVersionedText, type ResourceVersion } from '../workspaces/environment-plan'
import path from 'node:path'
import { lstat, readdir } from 'node:fs/promises'
import type { Resource } from '../../../shared/domain'
import { restrictedPath, MAX_FILE_BYTES } from '../workspaces/file-access'
const check = (signal: AbortSignal) => signal.throwIfAborted()

async function collectKnowledge(resources: Resource[], signal: AbortSignal, versions: ResourceVersion[]) {
  const files: { resource: Resource; file: string; content: string }[] = []
  let scanned = 0
  let bytes = 0
  for (const resource of resources) {
    const root = path.resolve(resource.path)
    const visit = async (file: string, depth: number): Promise<void> => {
      check(signal)
      if (files.length >= 256 || scanned >= 1024 || depth > 12 || bytes >= 8 * MAX_FILE_BYTES) return
      scanned++
      const safe = await restrictedPath([root], file)
      const stat = await lstat(safe)
      if (stat.isDirectory()) {
        for (const entry of await readdir(safe, { withFileTypes: true })) {
          if (!entry.isSymbolicLink()) await visit(path.join(safe, entry.name), depth + 1)
        }
      } else if (/\.(md|txt|markdown)$/i.test(file) && stat.size <= MAX_FILE_BYTES) {
        const content = await readVersionedText(safe, versions)
        bytes += Buffer.byteLength(content)
        files.push({ resource, file: safe, content })
      }
    }
    await visit(root, 0)
  }
  return files
}

export async function searchKnowledge(resources: Resource[], query: string, signal: AbortSignal, versions: ResourceVersion[]) {
  const parts = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const tokens = [...new Set(parts.flatMap(part => /[\u3400-\u9fff]/u.test(part) && part.length > 2 ? [part, ...Array.from({ length: part.length - 1 }, (_, index) => part.slice(index, index + 2))] : [part]))].slice(0, 32)
  if (!tokens.length) return { results: [], note: '请输入检索关键词' }
  const hits: { name: string; path: string; line: number; excerpt: string; citation: string; score: number }[] = []
  for (const file of await collectKnowledge(resources, signal, versions)) {
    const lines = file.content.split('\n')
    for (let index = 0; index < lines.length; index += 8) {
      const excerpt = lines.slice(index, index + 12).join('\n').slice(0, 2500)
      const text = excerpt.toLowerCase()
      const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0)
      if (score) hits.push({ name: file.resource.name, path: file.file, line: index + 1, excerpt, citation: `[${file.resource.name.replaceAll(']', '')}:${index + 1}](<${file.file}:${index + 1}>)`, score })
    }
  }
  return { results: hits.sort((a, b) => b.score - a.score).slice(0, 6), note: '本地关键词检索，仅扫描已绑定的 Markdown/TXT；最多 256 个文件 / 8 MiB。引用结果提供的文件和行号。' }
}

