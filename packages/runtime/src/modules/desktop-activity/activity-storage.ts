/*
 * [INPUT]: Explicitly enabled JPEG payloads and source-owned sample identifiers.
 * [OUTPUT]: Private atomic screenshot files and safe deletion confined to owned UUID filenames.
 * [POS]: Activity file persistence; never accepts an arbitrary path from a model or renderer.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { constants } from 'node:fs'
import { mkdir, lstat, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export class ActivityStorage {
  readonly directory: string
  constructor(dataPath: string) { this.directory = join(dataPath, 'activity-records') }
  private path(id: string) { if (!idPattern.test(id)) throw new Error('无效活动记录'); return join(this.directory, `${id}.jpg`) }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    if (!(await lstat(this.directory)).isDirectory() || (await lstat(this.directory)).isSymbolicLink()) throw new Error('活动存储目录不可为符号链接')
  }
  async save(id: string, image: string) {
    const bytes = Buffer.from(image, 'base64')
    if (bytes.length > 6_000_000 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('桌面截图不是有效的 JPEG')
    await this.init()
    const path = this.path(id), temporary = `${path}.tmp`
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    try { await handle.writeFile(bytes) } finally { await handle.close() }
    try { await rename(temporary, path) } finally { await rm(temporary, { force: true }) }
    return { bytes: bytes.length }
  }
  async read(id: string) {
    await this.init()
    const handle = await open(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW)
    try { if ((await handle.stat()).size > 6_000_000) throw new Error('截图文件过大'); return `data:image/jpeg;base64,${(await handle.readFile()).toString('base64')}` } finally { await handle.close() }
  }
  async exportTo(destination: string, ids: string[]) {
    const target = new ActivityStorage(destination)
    await target.init()
    for (const id of ids) await target.save(id, (await this.read(id)).split(',')[1]!)
  }
  async remove(id: string) { await this.init(); await rm(this.path(id), { force: true }) }
  async reconcile(ids: Set<string>) {
    await this.init()
    const existing = new Map<string, number>()
    for (const name of await readdir(this.directory)) {
      if (!/\.jpg(?:\.tmp)?$/.test(name)) continue
      const id = name.replace(/\.jpg(?:\.tmp)?$/, '')
      if (!idPattern.test(id)) continue
      const path = join(this.directory, name), stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      if (name.endsWith('.tmp') || !ids.has(id)) await rm(path, { force: true })
      else existing.set(id, stat.size)
    }
    return existing
  }
}
