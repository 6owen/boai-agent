/*
 * [INPUT]: 本次绑定独占 UUID、冻结文件 hash 清单和受管数据根。
 * [OUTPUT]: 不执行脚本的有界普通文件复制；持久所有权标记、完整 hash 复核及仅匹配原件的失败/重启清理，外改保留并显性报错。
 * [POS]: resources 的显式员工技能绑定文件边界；状态仍归 skillOperations。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Resource } from '../../../shared/domain'
import type { SkillFile } from '../../../shared/domain/skills'
import { restrictedPath, workspaceRelative, workspaceTarget } from '../workspaces/file-access'
import { inspectResourceTree } from './local-resources'

const marker = '.boai-binding-owner'
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
export interface BindingFiles { resourceId: string; name: string; contentHash: string; files: SkillFile[]; ownership: string }

/** Uses the existing validated resource tree format; no second import state or external program. */
export class SkillBindingFiles {
  constructor(private readonly dataPath: string) {}
  private root(value: BindingFiles, temporary = false) {
    if (!/^[a-f0-9-]{36}$/.test(value.resourceId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.name)) throw new Error('无效的技能绑定副本身份')
    return join(this.dataPath, 'skills', temporary ? `.binding-${value.resourceId}` : value.resourceId)
  }
  async prepare(source: string, value: BindingFiles, description: string, signal: AbortSignal): Promise<Resource> {
    signal.throwIfAborted()
    if ((await inspectResourceTree(source, signal)).hash !== value.contentHash) throw new Error('源内容已变更，请重新准备')
    const parent = join(this.dataPath, 'skills'), stage = this.root(value, true), destination = this.root(value)
    await mkdir(parent, { recursive: true }); await restrictedPath([this.dataPath], parent)
    try { await lstat(destination); throw new Error('本次绑定副本目录已存在，请核对原回执') } catch (error) { if (!missing(error)) throw error }
    await mkdir(stage)
    await writeFile(join(stage, marker), value.ownership, { flag: 'wx' })
    for (const file of value.files) {
      signal.throwIfAborted()
      const name = workspaceRelative(file.path)
      const input = await restrictedPath([source], join(source, name))
      const handle = await open(input, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      let bytes: Buffer
      try {
        const before = await handle.stat()
        if (!before.isFile() || before.nlink !== 1 || before.size !== file.size) throw new Error('源内容已变更，请重新准备')
        const buffer = Buffer.alloc(file.size + 1)
        let size = 0
        while (size < buffer.length) {
          signal.throwIfAborted()
          const result = await handle.read(buffer, size, buffer.length - size, null)
          if (!result.bytesRead) break
          size += result.bytesRead
        }
        bytes = buffer.subarray(0, size)
        const after = await handle.stat()
        if (bytes.length !== file.size || digest(bytes) !== file.hash || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('源内容已变更，请重新准备')
      } finally { await handle.close() }
      signal.throwIfAborted()
      const output = await workspaceTarget(stage, `${value.name}/${name}`, true)
      await writeFile(output, bytes, { flag: 'wx' })
    }
    signal.throwIfAborted()
    if ((await inspectResourceTree(join(stage, value.name), signal)).hash !== value.contentHash || (await inspectResourceTree(source, signal)).hash !== value.contentHash) throw new Error('复制期间内容已变更，请重新准备')
    await restrictedPath([this.dataPath], stage)
    await rename(stage, destination)
    return { id: value.resourceId, kind: 'skill', name: value.name, description, path: join(destination, value.name), createdAt: new Date().toISOString() }
  }
  /** Partial copies are safe to delete only when every present file matches the frozen manifest. */
  async cleanup(value: BindingFiles): Promise<void> {
    for (const root of [this.root(value, true), this.root(value)]) {
      try {
        await lstat(root); await restrictedPath([this.dataPath], root)
        const tree = await inspectResourceTree(root)
        const expected = new Map<string, string>([[marker, digest(value.ownership)], ...value.files.map(file => [`${value.name}/${file.path}`, file.hash] as [string, string])])
        if (!tree.files.some(file => file.path === marker && file.hash === expected.get(marker)) || tree.files.some(file => expected.get(file.path) !== file.hash)) throw new Error('技能绑定副本已发生外部修改，文件已保留，请先核对：' + root)
        // Never recursively delete directories: unknown files or late edits keep the owned root visible.
        for (const file of tree.files.filter(file => file.path !== marker)) {
          const path = await restrictedPath([root], join(root, workspaceRelative(file.path)))
          const current = await inspectResourceTree(path)
          if (current.files[0]?.hash !== file.hash) throw new Error('技能绑定副本已发生外部修改，文件已保留：' + path)
          await unlink(path)
        }
        const removeEmpty = async (path: string): Promise<void> => {
          for (const entry of await readdir(path, { withFileTypes: true })) {
            if (entry.isDirectory()) { await restrictedPath([root], join(path, entry.name)); await removeEmpty(join(path, entry.name)); await rmdir(join(path, entry.name)) }
            else if (path !== root || entry.name !== marker) throw new Error('技能绑定副本存在未核对文件，已保留：' + path)
          }
        }
        await removeEmpty(root)
        const owner = await inspectResourceTree(join(root, marker))
        if (owner.files[0]?.hash !== digest(value.ownership)) throw new Error('技能绑定所有权标记已变化，文件已保留：' + root)
        await unlink(join(root, marker)); await rmdir(root)
      } catch (error) { if (!missing(error)) throw error }
    }
  }
}
