/*
 * [INPUT]: 有大小上限的 ZIP 字节、受管 staging 根与取消信号。
 * [OUTPUT]: 逐项校验和流式解包的临时目录；不执行文件，失败删除本次临时副本。
 * [POS]: Skills 安装/便携库共用的归档边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { fromBufferPromise, type Entry } from 'yauzl'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { crc32 } from 'node:zlib'
import { join } from 'node:path'
import { RESOURCE_LIMITS } from '../../modules/resources/local-resources'
import { workspaceTarget, restrictedPath } from '../../modules/workspaces/file-access'
import { SKILL_DOWNLOAD_LIMITS } from './download'

export function archivePath(name: string) {
  const path = name.endsWith('/') ? name.slice(0, -1) : name
  const segments = path.split('/')
  if (!path || /[\\:\x00-\x1f\x7f]/.test(path) || segments.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || segments.length > RESOURCE_LIMITS.depth) throw new Error(`ZIP 路径无效：${name.slice(0, 120)}`)
  return path
}
function validateEntry(entry: Entry) {
  const name = archivePath(entry.fileName), directory = entry.fileName.endsWith('/')
  const kind = (entry.externalFileAttributes >>> 16) & 0o170000
  if (kind && kind !== (directory ? 0o040000 : 0o100000)) throw new Error('ZIP 不能包含符号链接或特殊文件')
  if (entry.extraFields.some(field => field.id === 0x000d || field.id === 0x756e)) throw new Error('ZIP 不能包含 Unix 链接扩展')
  if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) throw new Error('ZIP 不支持加密或此压缩方式')
  if (directory && entry.uncompressedSize) throw new Error('ZIP 目录不能包含文件内容')
  return { name, directory }
}

export async function extractSkillArchive(bytes: Buffer, stagingParent: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (bytes.length > SKILL_DOWNLOAD_LIMITS.bytes) throw new Error('ZIP 输入超过 100 MB 上限')
  const zip = await fromBufferPromise(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true })
  let root: string | undefined
  try {
    if (zip.entryCount > RESOURCE_LIMITS.entries) throw new Error('ZIP 文件和目录数量超过 2000 项')
    await mkdir(stagingParent, { recursive: true })
    await restrictedPath([stagingParent], stagingParent)
    root = await mkdtemp(join(stagingParent, 'extract-'))
    const entries = new Map<string, { path: string; directory: boolean; explicit: boolean }>()
    let size = 0, declaredSize = 0, files = 0
    for await (const entry of zip.eachEntry()) {
      signal?.throwIfAborted()
      const { name, directory } = validateEntry(entry)
      const parts = name.split('/')
      for (let index = 1; index <= parts.length; index++) {
        const path = parts.slice(0, index).join('/'), key = path.normalize('NFC').toLowerCase()
        const isDirectory = index < parts.length || directory, explicit = index === parts.length, existing = entries.get(key)
        if (existing && (existing.path !== path || existing.directory !== isDirectory || (existing.explicit && explicit))) throw new Error(`ZIP 包含重复路径、大小写或文件/目录冲突：${name}`)
        entries.set(key, { path, directory: isDirectory, explicit: explicit || existing?.explicit || false })
        if (entries.size > RESOURCE_LIMITS.entries) throw new Error('ZIP 文件和目录数量超过 2000 项')
      }
      declaredSize += entry.uncompressedSize
      if (declaredSize > RESOURCE_LIMITS.bytes) throw new Error('ZIP 解压内容超过 100 MB 上限')
      const target = await workspaceTarget(root, directory ? `${name}/.probe` : name, true)
      if (directory) continue
      const input = await zip.openReadStreamPromise(entry)
      let checksum = 0
      const measure = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > RESOURCE_LIMITS.bytes) { callback(new Error('ZIP 实际解压内容超过 100 MB 上限')); return }
        checksum = crc32(chunk, checksum)
        callback(null, chunk)
      } })
      await pipeline(input, measure, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal })
      if ((checksum >>> 0) !== entry.crc32) throw new Error(`ZIP 文件校验失败：${name}`)
      files++
    }
    return { directory: root, files, bytes: size }
  } catch (error) {
    if (root) await rm(root, { recursive: true, force: true })
    throw error
  } finally { zip.close() }
}
