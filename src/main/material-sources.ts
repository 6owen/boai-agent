/*
 * [INPUT]: 用户真实选取的普通文件或 preload 有界上传的 File 字节。
 * [OUTPUT]: 不公开路径的来源 token；私有临时副本持久保存最小归属/hash，启动回收旧进程来源，实际准备退出/未使用过期后清理；外改保留并报告。
 * [POS]: main 的聊天附件来源管理；本地路径保持原准备请求指纹。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { MATERIAL_LIMITS } from '../shared/domain/materials'

const SOURCE_LIFETIME_MS = 10 * 60_000
const SOURCE_MANIFEST = '.source.json'
type Source = { path: string; name?: string; directory?: string; hash?: string; ino?: number; dev?: number; timer?: ReturnType<typeof setTimeout>; uses: number }

export class MaterialSources {
  private readonly sources = new Map<string, Source>()
  private readonly active = new Set<Promise<unknown>>()
  private closing = false
  private recovery?: Promise<void>
  constructor(private readonly directory: string, private readonly cleanupError: (error: unknown) => void) {}

  /** The single-instance host calls this before accepting imports; no old work is resumed. */
  recover() {
    return this.recovery ??= this.recoverSources()
  }
  private async recoverSources() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('临时附件根目录已改变，已保留副本')
    const root = await realpath(this.directory)
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const directory = join(root, entry.name)
      try {
        if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name) || await realpath(directory) !== directory) throw new Error('临时附件遗留目录归属无法核对，已保留副本')
        const handle = await open(join(directory, SOURCE_MANIFEST), constants.O_RDONLY | constants.O_NOFOLLOW)
        let value: { version?: number; filename?: string; hash?: string; ino?: number; dev?: number }
        try {
          const info = await handle.stat()
          if (!info.isFile() || info.nlink !== 1 || info.size > 2048) throw new Error('临时附件归属记录无效，已保留副本')
          value = JSON.parse(await handle.readFile('utf8'))
        } finally { await handle.close() }
        if (value.version !== 1 || typeof value.filename !== 'string' || !/^source(?:\.[a-z0-9]{1,12})?$/.test(value.filename) || value.filename === SOURCE_MANIFEST || typeof value.hash !== 'string' || !/^[0-9a-f]{64}$/.test(value.hash) || (value.ino !== undefined && !Number.isSafeInteger(value.ino)) || (value.dev !== undefined && !Number.isSafeInteger(value.dev))) throw new Error('临时附件归属记录无效，已保留副本')
        await this.cleanup({ path: join(directory, value.filename), directory, hash: value.hash, ino: value.ino, dev: value.dev, uses: 0 })
      } catch (error) {
        // A crash before the ownership record was written can leave an empty directory.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && entry.isDirectory() && await rmdir(directory).then(() => true, () => false)) continue
        this.cleanupError(error)
      }
    }
  }

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
    await this.recover()
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
    await writeFile(join(directory, SOURCE_MANIFEST), JSON.stringify({ version: 1, filename: basename(path), hash: source.hash }), { flag: 'wx', mode: 0o600 })
    try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }) }
    catch (error) { await this.cleanup(source).catch(this.cleanupError); throw error }
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
    await this.recovery
    await Promise.allSettled([...this.active])
    for (const [id, source] of this.sources) {
      clearTimeout(source.timer)
      this.sources.delete(id)
      await this.cleanup(source).catch(this.cleanupError)
    }
  }

  private async cleanup(source: Source) {
    if (!source.directory || !source.hash) return
    const directory = await realpath(source.directory).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error })
    if (!directory) return
    if (directory !== source.directory) throw new Error('临时附件目录已改变，已保留副本')
    const handle = await open(source.path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (handle) {
      try {
        const info = await handle.stat()
        if (!info.isFile() || info.nlink !== 1 || source.dev !== undefined && info.dev !== source.dev || source.ino !== undefined && info.ino !== source.ino || info.size > MATERIAL_LIMITS.attachmentBytes) throw new Error('临时附件已被外部修改，已保留副本')
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
    await unlink(join(source.directory, SOURCE_MANIFEST))
    await rmdir(source.directory)
  }
}
