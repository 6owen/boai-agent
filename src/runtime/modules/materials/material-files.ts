/*
 * [INPUT]: 宿主已有受管根、获准源文件、受管材料身份与取消信号。
 * [OUTPUT]: 受管根系统别名规范化但源路径和根内链接仍拒绝、严格 UTF-8 的有界文本/行号/hash、排他原件写入与保留外部修改的安全清理。
 * [POS]: materials 的确定性文件边界，路径不进入持久材料或模型上下文。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rmdir, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { MATERIAL_LIMITS } from '../../../shared/domain/materials'

export type MaterialFileCheckpoint = 'source-opened' | 'source-read' | 'before-write' | 'after-write' | 'before-ready' | 'before-cleanup'
export type MaterialCheckpoint = (stage: MaterialFileCheckpoint, id: string) => Promise<void>
export interface MaterialText { bytes: Buffer; text: string; contentHash: string; size: number; characterCount: number; lineCount: number }
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const check = (signal?: AbortSignal) => signal?.throwIfAborted()
const safeId = (id: string) => { if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('无效材料标识'); return id }

export function materialDirectory(dataPath: string, conversationId: string, id: string) {
  return join(resolve(dataPath), 'materials', safeId(conversationId), safeId(id))
}

/** Only the host's existing managed root may use an OS alias; all descendants stay link-free. */
async function managedDirectory(dataPath: string, conversationId: string, id: string) {
  return materialDirectory(await realpath(dataPath), conversationId, id)
}

/** Reject links at every component, including a final link to an otherwise ordinary file. */
export async function checkMaterialPath(file: string, allowMissing = false) {
  if (!isAbsolute(file)) throw new Error('材料路径必须为宿主选取的绝对路径')
  let current = parse(file).root
  for (const part of relative(current, resolve(file)).split(sep).filter(Boolean)) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('材料路径不能包含符号链接') }
    catch (error) { if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  }
}

function decode(bytes: Buffer): Omit<MaterialText, 'bytes' | 'contentHash' | 'size'> {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n') }
  catch { throw new Error('材料必须是有效 UTF-8 文本') }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('材料含二进制或不支持的控制字符')
  if (!text.trim()) throw new Error('材料没有可供处理的文本')
  if (text.length > MATERIAL_LIMITS.characters) throw new Error(`材料最多 ${MATERIAL_LIMITS.characters} 个字符，请拆分文件`)
  return { text, characterCount: text.length, lineCount: text.split('\n').length }
}

async function readBytes(file: string, signal?: AbortSignal, checkpoint?: () => Promise<void>) {
  check(signal); await checkMaterialPath(file)
  const beforePath = await lstat(file)
  if (!beforePath.isFile() || beforePath.nlink > 1) throw new Error('材料只能使用普通文件，不能包含链接')
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink > 1 || before.ino !== beforePath.ino || before.dev !== beforePath.dev) throw new Error('材料文件身份已改变，请重新选择')
    if (before.size > MATERIAL_LIMITS.bytes) throw new Error('材料最多 128 KiB，请拆分文件')
    check(signal)
    await checkpoint?.(); check(signal)
    const buffer = Buffer.alloc(MATERIAL_LIMITS.bytes + 1)
    let size = 0
    for (;;) {
      check(signal)
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null)
      size += bytesRead
      if (size > MATERIAL_LIMITS.bytes) throw new Error('材料最多 128 KiB，请拆分文件')
      if (!bytesRead) break
    }
    return { bytes: buffer.subarray(0, size), before, handle, verify: async () => {
      const after = await handle.stat(), current = await lstat(file)
      await checkMaterialPath(file); check(signal)
      if (!current.isFile() || current.isSymbolicLink() || current.nlink > 1 || current.dev !== before.dev || current.ino !== before.ino || before.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('材料在读取时已变化，请重新选择')
    } }
  } catch (error) { await handle.close(); throw error }
}

export async function readMaterialSource(file: string, signal: AbortSignal, id: string, checkpoint?: MaterialCheckpoint): Promise<MaterialText> {
  const source = await readBytes(file, signal, () => checkpoint?.('source-opened', id) ?? Promise.resolve())
  try {
    await checkpoint?.('source-read', id); await source.verify()
    return { bytes: source.bytes, size: source.bytes.length, contentHash: hash(source.bytes), ...decode(source.bytes) }
  } finally { await source.handle.close() }
}

export async function writeMaterialOriginal(dataPath: string, conversationId: string, id: string, bytes: Buffer, signal: AbortSignal, checkpoint?: MaterialCheckpoint) {
  const directory = await managedDirectory(dataPath, conversationId, id)
  check(signal); await checkMaterialPath(directory, true)
  await mkdir(dirname(directory), { recursive: true }); await checkMaterialPath(dirname(directory))
  await mkdir(directory); await checkMaterialPath(directory)
  const file = join(directory, 'original')
  await checkpoint?.('before-write', id); check(signal)
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  await checkpoint?.('after-write', id); check(signal)
}

export async function readMaterialOriginal(dataPath: string, conversationId: string, id: string, expectedHash: string): Promise<MaterialText> {
  const source = await readBytes(join(await managedDirectory(dataPath, conversationId, id), 'original'))
  try {
    await source.verify()
    const contentHash = hash(source.bytes)
    if (contentHash !== expectedHash) throw new Error('受管材料已被外部修改，已保留文件')
    return { bytes: source.bytes, size: source.bytes.length, contentHash, ...decode(source.bytes) }
  } finally { await source.handle.close() }
}

/** Only remove the tracked original and an empty directory. Never recursively remove unknown files. */
export async function cleanupMaterialOriginal(dataPath: string, conversationId: string, id: string, expectedHash?: string, checkpoint?: MaterialCheckpoint) {
  const directory = await managedDirectory(dataPath, conversationId, id), file = join(directory, 'original')
  await checkMaterialPath(directory, true)
  let exists = true
  try { await lstat(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error }
  if (exists) {
    if (!expectedHash) throw new Error('材料清理缺少可信内容校验，已保留文件')
    await checkpoint?.('before-cleanup', id)
    await readMaterialOriginal(dataPath, conversationId, id, expectedHash)
    await unlink(file)
  }
  try { await rmdir(directory) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('材料目录含外部文件或无法清理，已保留文件') }
}

export function materialFileError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOENT') return '材料文件不存在或已被移走'
  if (code === 'EACCES' || code === 'EPERM') return '没有权限读取或清理材料文件'
  if (code === 'EEXIST') return '受管材料目录已存在，请核对文件状态'
  if (error instanceof Error && !code && !/[/\\]/.test(error.message)) return error.message
  return '材料文件处理失败，请重新选择或核对受管文件'
}
