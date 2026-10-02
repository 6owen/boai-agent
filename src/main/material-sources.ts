/*
 * [INPUT]: 用户真实选取的普通文件或 preload 有界上传的 File 字节。
 * [OUTPUT]: 不公开路径的来源 token；私有临时副本只在实际准备退出或未使用过期后按归属/hash 清理。
 * [POS]: main 的聊天附件来源管理；本地路径保持原准备请求指纹。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { MATERIAL_LIMITS } from '../shared/domain/materials'

const SOURCE_LIFETIME_MS = 10 * 60_000
type Source = { path: string; name?: string; directory?: string; hash?: string; ino?: number; dev?: number; timer?: ReturnType<typeof setTimeout>; uses: number }

export class MaterialSources {
  private readonly sources = new Map<string, Source>()
  private readonly active = new Set<Promise<unknown>>()
  private closing = false
  constructor(private readonly directory: string, private readonly cleanupError: (error: unknown) => void) {}

  async selectPath(path: string) {
    if (this.closing) throw new Error('附件来源服务正在退出')
    if (!isAbsolute(path)) throw new Error('无法读取所选文件')
    if ((await lstat(path)).isSymbolicLink()) throw new Error('不支持作为材料导入的符号链接')
    const selected = await realpath(path)
    if (!(await stat(selected)).isFile()) throw new Error('请选择普通文件')
    const id = randomUUID()
    this.sources.set(id, { path: resolve(path), uses: 0 })
    return { id, name: basename(selected) }
  }

  async selectBytes(name: string, bytes: Uint8Array) {
    if (this.closing) throw new Error('附件来源服务正在退出')
    const completion = this.storeBytes(name, bytes)
    this.active.add(completion)
    try { return await completion } finally { this.active.delete(completion) }
  }

  private async storeBytes(name: string, bytes: Uint8Array) {
    if (!name || name.length > 200 || name.includes('\0')) throw new Error('附件名称无效')
    if (bytes.byteLength > MATERIAL_LIMITS.attachmentBytes) throw new Error('附件大小不能超过 20 MiB')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const id = randomUUID(), directory = join(await realpath(this.directory), id)
    const extension = extname(name).toLowerCase()
    const path = join(directory, `source${/^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ''}`)
    await mkdir(directory, { mode: 0o700 })
    const source: Source = { path, directory, name, hash: createHash('sha256').update(bytes).digest('hex'), uses: 0 }
    try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }) }
    catch (error) { await rmdir(directory).catch(() => {}); throw error }
    const identity = await lstat(path)
    source.ino = identity.ino; source.dev = identity.dev
    this.sources.set(id, source)
    source.timer = setTimeout(() => {
      this.sources.delete(id)
      void this.cleanup(source).catch(this.cleanupError)
    }, SOURCE_LIFETIME_MS)
    source.timer.unref()
    return { id, name }
  }

  has(id: string) { return this.sources.has(id) }

  async prepare<T>(id: string, run: (source: { path: string; name?: string }, temporary: boolean) => Promise<T>): Promise<T> {
    if (this.closing) throw new Error('附件来源服务正在退出')
    const source = this.sources.get(id)
    if (!source) throw new Error('材料来源已过期，请先核对原准备结果')
    clearTimeout(source.timer)
    source.uses++
    const completion = (async () => {
      try { return await run({ path: source.path, ...(source.name !== undefined ? { name: source.name } : {}) }, Boolean(source.directory)) }
      finally {
        source.uses--
        if (source.directory && source.uses === 0) {
          this.sources.delete(id)
          await this.cleanup(source).catch(this.cleanupError)
        }
      }
    })()
    this.active.add(completion)
    try { return await completion } finally { this.active.delete(completion) }
  }

  async close() {
    this.closing = true
    await Promise.allSettled([...this.active])
    for (const [id, source] of this.sources) {
      clearTimeout(source.timer)
      this.sources.delete(id)
      await this.cleanup(source).catch(this.cleanupError)
    }
  }

  private async cleanup(source: Source) {
    if (!source.directory || !source.hash) return
    if ((await realpath(source.directory)) !== source.directory) throw new Error('临时附件目录已改变，已保留副本')
    const handle = await open(source.path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (handle) {
      try {
        const info = await handle.stat()
        if (!info.isFile() || info.dev !== source.dev || info.ino !== source.ino || info.size > MATERIAL_LIMITS.attachmentBytes) throw new Error('临时附件已被外部修改，已保留副本')
        const bytes = Buffer.alloc(info.size)
        let offset = 0
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
          if (!bytesRead) break
          offset += bytesRead
        }
        if (offset !== info.size || (await handle.stat()).size !== info.size || createHash('sha256').update(bytes).digest('hex') !== source.hash) throw new Error('临时附件已被外部修改，已保留副本')
        const current = await lstat(source.path)
        if (!current.isFile() || current.dev !== info.dev || current.ino !== info.ino) throw new Error('临时附件来源已改变，已保留副本')
        await unlink(source.path)
      } finally { await handle.close() }
    }
    await rmdir(source.directory)
  }
}
