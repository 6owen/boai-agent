/*
 * [INPUT]: 已核验的文件字节、知识resource/copy身份与受管根。
 * [OUTPUT]: 独立不可变知识副本、hash核读及仅删除匹配所有权/内容的清理，外部原件保持。
 * [POS]: knowledge资源的文件边界，复用材料的有界普通文件读取，不另建文件仓库。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { mkdir, readdir, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { KnowledgeContent } from '@boai/shared/domain/knowledge'
import { checkMaterialPath, readMaterialSource } from '@boai/shared/node/material-files'
import { createHash } from 'node:crypto'

const marker = '.boai-knowledge-owner'
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
export function knowledgePath(dataPath: string, resourceId: string, content: KnowledgeContent) {
  if (![resourceId, content.copyId].every(id => /^[a-f0-9-]{36}$/.test(id)) || !/^original(?:\.[a-z0-9]{1,16})?$/.test(content.fileName) || !/^[a-f0-9]{64}$/.test(content.contentHash)) throw new Error('知识资料副本身份无效')
  return join(dataPath, 'knowledge', resourceId, content.copyId, content.fileName)
}
export class KnowledgeFiles {
  constructor(private readonly dataPath: string) {}
  private async paths(resourceId: string, content: KnowledgeContent) {
    const root = await realpath(this.dataPath), file = knowledgePath(root, resourceId, content), parent = join(root, 'knowledge', resourceId), directory = join(parent, content.copyId)
    return { file, parent, directory, owner: join(directory, marker), ownership: JSON.stringify({ resourceId, copyId: content.copyId, contentHash: content.contentHash, fileName: content.fileName }) }
  }
  async prepare(resourceId: string, content: KnowledgeContent, bytes: Buffer) {
    if (hash(bytes) !== content.contentHash || bytes.length !== content.size) throw new Error('知识资料内容身份不一致')
    const paths = await this.paths(resourceId, content)
    await checkMaterialPath(paths.directory, true); await mkdir(paths.parent, { recursive: true }); await checkMaterialPath(paths.parent)
    await mkdir(paths.directory); await checkMaterialPath(paths.directory)
    await writeFile(paths.owner, paths.ownership, { flag: 'wx', mode: 0o600 })
    await writeFile(paths.file, bytes, { flag: 'wx', mode: 0o600 })
    await this.read(resourceId, content)
    return paths.file
  }
  async read(resourceId: string, content: KnowledgeContent) {
    const paths = await this.paths(resourceId, content), signal = new AbortController().signal
    const owner = await readMaterialSource(paths.owner, signal, resourceId)
    if (owner.bytes.toString('utf8') !== paths.ownership) throw new Error('知识资料副本归属已变化，原件已保留')
    const actual = await readMaterialSource(paths.file, signal, resourceId)
    if (actual.contentHash !== content.contentHash || actual.size !== content.size) throw new Error('知识资料副本已被外部修改，原件已保留')
    return actual
  }
  async cleanup(resourceId: string, content: KnowledgeContent) {
    const paths = await this.paths(resourceId, content)
    try { await checkMaterialPath(paths.directory); await readdir(paths.directory) } catch (error) { if (missing(error)) return; throw error }
    const entries = await readdir(paths.directory)
    if (!entries.length) { await rmdir(paths.directory); return }
    if (entries.some(name => ![marker, content.fileName].includes(name)) || !entries.includes(marker)) throw new Error('知识资料副本包含未核对文件，已保留')
    const owner = await readMaterialSource(paths.owner, new AbortController().signal, resourceId)
    if (owner.bytes.toString('utf8') !== paths.ownership) throw new Error('知识资料副本归属已变化，已保留')
    if (entries.includes(content.fileName)) { await this.read(resourceId, content); await unlink(paths.file) }
    await unlink(paths.owner); await rmdir(paths.directory)
    try { await rmdir(paths.parent) } catch (error) { if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error }
  }
}
