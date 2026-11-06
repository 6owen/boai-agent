/*
 * [INPUT]: Frozen package file manifest and a private application data root.
 * [OUTPUT]: Staged verified copies and ownership/hash protected local cleanup; changed files are preserved.
 * [POS]: Capability package filesystem commit boundary; no installers or package code execute here.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CapabilityInstallation } from '@boai/shared/domain/capability-packages'
import { restrictedPath } from '../workspaces/file-access'
import { capabilityRelativePath } from './capability-package-inspection'
import { inspectResourceTree, isWithin } from './local-resources'

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const ownerName = '.boai-capability-owner'
export class CapabilityPackageFiles {
  constructor(private dataPath: string) {}
  private root(value: CapabilityInstallation, staged = false) {
    if (!/^[a-f0-9-]{36}$/.test(value.id) || !/^[a-f0-9]{64}$/.test(value.contentHash)) throw new Error('无效的能力包文件身份')
    return join(this.dataPath, 'capability-packages', value.id, `${staged ? '.staging-' : ''}${value.contentHash}`)
  }
  directory(value: CapabilityInstallation) { return join(this.root(value), 'package') }
  private owner(value: CapabilityInstallation) { return JSON.stringify({ installationId: value.id, contentHash: value.contentHash }) }
  async prepare(value: CapabilityInstallation) {
    const stage = this.root(value, true), destination = this.root(value)
    if (isWithin(value.source.path, destination)) throw new Error('不能把能力包复制到其自身目录')
    await mkdir(join(this.dataPath, 'capability-packages', value.id), { recursive: true })
    await restrictedPath([this.dataPath], join(this.dataPath, 'capability-packages', value.id))
    try { await lstat(destination); throw new Error('能力包版本目录已存在，请核对原回执') } catch (error) { if (!missing(error)) throw error }
    await mkdir(stage)
    await writeFile(join(stage, ownerName), this.owner(value), { flag: 'wx' })
    const output = join(stage, 'package'); await mkdir(output)
    for (const file of value.files) {
      const name = capabilityRelativePath(file.path)
      const input = await restrictedPath([value.source.path], join(value.source.path, name))
      const handle = await open(input, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      let bytes: Buffer
      try {
        const before = await handle.stat()
        if (!before.isFile() || before.nlink !== 1 || before.size !== file.size) throw new Error('能力包内容已变化，请重新预检')
        bytes = Buffer.alloc(file.size + 1)
        let size = 0
        while (size < bytes.length) { const result = await handle.read(bytes, size, bytes.length - size, null); if (!result.bytesRead) break; size += result.bytesRead }
        bytes = bytes.subarray(0, size)
        const after = await handle.stat()
        if (size !== file.size || digest(bytes) !== file.hash || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('能力包内容已变化，请重新预检')
      } finally { await handle.close() }
      const parts = name.split('/'); parts.pop()
      if (parts.length) await mkdir(join(output, ...parts), { recursive: true })
      await writeFile(join(output, name), bytes, { flag: 'wx' })
    }
    if ((await inspectResourceTree(output)).hash !== value.contentHash || (await inspectResourceTree(value.source.path)).hash !== value.contentHash) throw new Error('能力包复制期间内容已变化')
    await rename(stage, destination)
    return this.directory(value)
  }
  async cleanup(value: CapabilityInstallation): Promise<string[]> {
    const retained: string[] = []
    for (let root of [this.root(value, true), this.root(value)]) {
      try { await lstat(root) } catch (error) { if (missing(error)) continue; retained.push(root); continue }
      try {
        root = await restrictedPath([this.dataPath], root)
        const marker = join(root, ownerName)
        if (await readFile(marker, 'utf8') !== this.owner(value)) throw new Error('能力包所有权标记已变化')
        const tree = await inspectResourceTree(root)
        const expected = new Map([[ownerName, digest(this.owner(value))], ...value.files.map(file => [`package/${file.path}`, file.hash] as [string, string])])
        if (tree.files.some(file => expected.get(file.path) !== file.hash)) throw new Error('能力包包含修改或未知文件')
        for (const file of tree.files.filter(file => file.path !== ownerName)) {
          const path = await restrictedPath([root], join(root, file.path))
          if ((await inspectResourceTree(path)).files[0]?.hash !== file.hash) throw new Error('能力包文件已变化')
          await unlink(path)
        }
        const empty = async (path: string): Promise<void> => {
          for (const entry of await readdir(path, { withFileTypes: true })) {
            if (entry.isDirectory()) { const child = await restrictedPath([root], join(path, entry.name)); await empty(child); await rmdir(child) }
            else if (path !== root || entry.name !== ownerName) throw new Error('能力包存在新增文件')
          }
        }
        await empty(root)
        if (await readFile(marker, 'utf8') !== this.owner(value)) throw new Error('能力包所有权标记已变化')
        await unlink(marker); await rmdir(root)
      } catch { retained.push(root) }
    }
    return retained
  }
}
