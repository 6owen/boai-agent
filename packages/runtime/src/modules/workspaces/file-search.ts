/*
 * [INPUT]: 原宿主逐路径读/列授权、当前逻辑或业务目录、明确搜索文本与取消信号。
 * [OUTPUT]: 有界UTF-8文件内容命中、行号/hash及实际跳过/截断事实；不跟随链接或扩大读取范围。
 * [POS]: Mastra文件搜索实现；搜索摘录不登记为完整阅读，原精确编辑基线保持。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { EngineContext } from '../../contracts'
import { boundedRead, MAX_FILE_BYTES, RESERVED_SYSTEM_FILES, taskPathAllowed, workspaceTarget } from './file-access'
import { fileContentHash } from './file-editing'

export async function searchTaskFiles(context: Pick<EngineContext, 'signal' | 'canAccessTaskPath' | 'readTaskFile' | 'materialRefs'>, root: string, query: string, options: { business: boolean; recursive: boolean; caseSensitive: boolean; logicalPath: string; topLevel?: string[] }) {
  const matches: { path: string; line: number; excerpt: string; contentHash: string }[] = []
  const limits = { files: 500, entries: 2000, bytes: 24 * MAX_FILE_BYTES, matches: 100, depth: 20, outputCharacters: 48_000 }
  let scannedFiles = 0, entries = 0, bytes = 0, outputCharacters = 0, skippedFiles = 0, skippedSymlinks = 0, skippedUnauthorized = 0, truncated = false
  const needle = options.caseSensitive ? query : query.toLowerCase()
  const visit = async (directory: string, depth: number): Promise<void> => {
    context.signal.throwIfAborted()
    if (depth > limits.depth) { truncated = true; return }
    if (!await taskPathAllowed(context, directory, 'list')) { skippedUnauthorized++; return }
    const safe = await workspaceTarget(root, path.relative(root, directory))
    for (const entry of (await readdir(safe, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      context.signal.throwIfAborted()
      if (depth === 0 && options.topLevel && !options.topLevel.includes(entry.name)) continue
      if (++entries > limits.entries || scannedFiles >= limits.files || bytes >= limits.bytes || matches.length >= limits.matches) { truncated = true; return }
      if (entry.isSymbolicLink()) { skippedSymlinks++; continue }
      if (!options.business && RESERVED_SYSTEM_FILES.has(entry.name.toUpperCase())) continue
      const target = path.join(safe, entry.name)
      if (entry.isDirectory()) { if (options.recursive) await visit(target, depth + 1); continue }
      if (!entry.isFile()) { skippedFiles++; continue }
      if (!await taskPathAllowed(context, target, 'read')) { skippedUnauthorized++; continue }
      let content: string, verified = false
      try {
        const checked = await context.readTaskFile?.(target)
        verified = !!checked
        content = checked?.content ?? await boundedRead(await workspaceTarget(root, path.relative(root, target)), { strictUtf8: true })
      } catch (error) {
        context.signal.throwIfAborted()
        if (['ENOENT', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '') || /UTF-8|at most 1 MiB/.test(String(error))) { skippedFiles++; continue }
        throw error
      }
      context.signal.throwIfAborted()
      if (!verified && !await taskPathAllowed(context, target, 'read')) { skippedUnauthorized++; continue }
      scannedFiles++; bytes += Buffer.byteLength(content)
      const relative = path.relative(root, target).split(path.sep).join('/'), file = options.business ? target : `${options.logicalPath.replace(/\/$/, '')}/${relative}`
      const hash = fileContentHash(content), lines = content.split(/\r?\n/u)
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!, offset = (options.caseSensitive ? line : line.toLowerCase()).indexOf(needle)
        if (offset < 0) continue
        const match = { path: file, line: index + 1, excerpt: line.slice(Math.max(0, offset - 100), offset + Math.min(needle.length, 300) + 200), contentHash: hash }
        const length = JSON.stringify(match).length
        if (outputCharacters + length > limits.outputCharacters) { truncated = true; return }
        outputCharacters += length; matches.push(match)
        if (matches.length === limits.matches) { truncated = true; break }
      }
    }
  }
  await visit(root, 0)
  context.signal.throwIfAborted()
  return { matches, scannedFiles, skippedFiles, skippedSymlinks, skippedUnauthorized, truncated, limits, ...(truncated ? { continuation: '请缩小目录或搜索词以继续检索；本次结果未覆盖全部文件。' } : {}) }
}
