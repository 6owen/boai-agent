/*
 * [INPUT]: 已复核的技能包、宿主 home 与安装操作身份。
 * [OUTPUT]: ~/.agents/skills 的同名检查、同盘暂存与发布；只清理本次暂存，不覆盖或删除已有技能。
 * [POS]: resources 的本地安装文件边界；不创建 Resource 或员工绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { cp, lstat, mkdir, realpath, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { workspaceTarget } from '../workspaces/file-access'
import { inspectResourceTree } from './local-resources'
import { localSkillId } from './local-skill-catalog'

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
export class LocalSkillInstallTarget {
  constructor(private readonly home = homedir()) {}
  private name(value: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error('无效的本地技能目录名')
    return value
  }
  private staging(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效的安装操作身份')
    return `.agents/skills/.boai-import-${id}`
  }
  async inspect(name: string, signal?: AbortSignal) {
    try {
      const path = await workspaceTarget(this.home, `.agents/skills/${this.name(name)}`)
      const tree = await inspectResourceTree(path, signal)
      return { id: localSkillId(await realpath(path)), path, hash: tree.hash }
    } catch (error) { if (missing(error)) return undefined; throw error }
  }
  async prepare(source: string, name: string, operationId: string, expectedHash: string, signal: AbortSignal) {
    const staging = await workspaceTarget(this.home, this.staging(operationId), true)
    await mkdir(staging)
    const path = join(staging, this.name(name))
    try {
      signal.throwIfAborted()
      await cp(source, path, { recursive: true, force: false, errorOnExist: true, dereference: false })
      if ((await inspectResourceTree(path, signal)).hash !== expectedHash) throw new Error('复制期间技能内容已变化，请重新扫描')
      const root = await realpath(join(this.home, '.agents/skills'))
      return { id: localSkillId(join(root, name)), path }
    } catch (error) { await this.discard(operationId); throw error }
  }
  async publish(name: string, operationId: string, expectedHash: string, signal: AbortSignal) {
    const destination = await workspaceTarget(this.home, `.agents/skills/${this.name(name)}`, true)
    try { await lstat(destination); throw new Error('本地已存在同名技能，请重新扫描') } catch (error) { if (!missing(error)) throw error }
    const staged = await workspaceTarget(this.home, `${this.staging(operationId)}/${name}`)
    if ((await inspectResourceTree(staged, signal)).hash !== expectedHash) throw new Error('待安装文件已变化，请重新扫描')
    signal.throwIfAborted()
    await rename(staged, destination)
  }
  async discard(operationId: string) {
    try { const path = await workspaceTarget(this.home, this.staging(operationId)); await rm(path, { recursive: true }) }
    catch (error) { if (!missing(error)) throw error }
  }
}
