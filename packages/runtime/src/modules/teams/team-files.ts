/*
 * [OUTPUT]: 模块化员工预设冻结包含workspace/prompts目录；团队/组织沿原归属hash和原子发布。
 * [INPUT]: 冻结创建操作的文件子集、宿主生成路径、工作区格式与每文件日志提交回调。
 * [OUTPUT]: 团队与 bobo 组织复用同一归属/hash、写入前内容复核、提交前目录完整性、暂存移动和仅清理本操作未发布文件。
 * [POS]: 团队文件一致性边界；调用者提供宿主生命周期互斥，不声称跨介质事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { TeamCreationOperation } from '@boai/shared/domain/team-creation'
import { WorkspaceService } from '../workspaces/workspace-service'
import { teamError } from './team-repository'

const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')
export type TeamFileOperation = Pick<TeamCreationOperation, 'id' | 'payloadHash' | 'createdAt' | 'agents' | 'conversationId' | 'files' | 'directories'>
export type TeamFileCheckpoint<T extends TeamFileOperation = TeamCreationOperation> = (phase: 'before-write' | 'after-write' | 'after-move' | 'before-commit' | 'after-commit', operation: T, path?: string) => Promise<void>
export function teamFileContents(operation: TeamFileOperation, homes: WorkspaceService) {
  const files: Record<string, string> = {}, directories: string[] = []
  const owner = JSON.stringify({ operationId: operation.id, payloadHash: operation.payloadHash })
  for (const agent of operation.agents) {
    const root = `agents/${agent.id}`
    for (const [name, content] of Object.entries(homes.initialFiles(agent, operation.createdAt))) files[`${root}/${name}`] = content
    files[`${root}/.team-creation.json`] = owner
    directories.push(root, ...['workspace', 'state', 'workspace/prompts', 'workspace/memory', 'workspace/skills', 'workspace/private', 'workspace/sessions'].map(name => `${root}/${name}`))
  }
  if (operation.conversationId) { const root = `workspaces/${operation.conversationId}`; directories.push(root); files[`${root}/.team-creation.json`] = owner }
  return { files, directories }
}
export function teamFileLog(operation: TeamFileOperation, homes: WorkspaceService) {
  const { files, directories } = teamFileContents(operation, homes)
  return { directories, files: Object.entries(files).map(([path, content]) => ({ path, hash: hash(content), status: 'pending' as const })) }
}
export class TeamFiles<T extends TeamFileOperation = TeamCreationOperation> {
  constructor(private readonly dataPath: string, private readonly homes: WorkspaceService, private readonly checkpoint?: TeamFileCheckpoint<T>) {}
  private roots(operation: T) { return [...operation.agents.map(agent => `agents/${agent.id}`), ...(operation.conversationId ? [`workspaces/${operation.conversationId}`] : [])] }
  private staging(operation: T) { return join(this.dataPath, 'team-creation', operation.id) }
  private async safe(path: string) {
    const parts = relative(this.dataPath, path).split(sep)
    if (parts.some(part => part === '..')) teamError('FILES_CONFLICT', '路径超出受管目录')
    let current = this.dataPath
    for (const part of ['', ...parts]) {
      current = join(current, part)
      try { const stat = await lstat(current); if (stat.isSymbolicLink()) teamError('FILES_CONFLICT', `路径存在链接：${relative(this.dataPath, current)}`) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }
  private async exists(path: string) { await this.safe(path); try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } }
  private async inspectTree(operation: T, root: string, base: string, partial: boolean) {
    const target = join(base, root), contents = teamFileContents(operation, this.homes).files
    if (!await this.exists(target)) return false
    const owner = join(target, '.team-creation.json')
    if (!await this.exists(owner) || hash(await readFile(owner)) !== hash(contents[`${root}/.team-creation.json`])) teamError('FILES_CONFLICT', `无法证明目录归属：${root}`)
    const walk = async (path: string): Promise<void> => {
      await this.safe(path)
      const stat = await lstat(path), key = relative(base, path).split(sep).join('/')
      if (stat.isDirectory()) {
        if (!operation.directories.includes(key)) teamError('FILES_CONFLICT', `存在未知目录：${key}`)
        for (const entry of await readdir(path)) await walk(join(path, entry))
      } else {
        const file = operation.files.find(value => value.path === key)
        if (!stat.isFile() || !file || stat.size > Buffer.byteLength(contents[key])) teamError('FILES_CONFLICT', `文件被替换或修改：${key}`)
        const bytes = await readFile(path)
        if (hash(bytes) !== file!.hash && !(partial && file!.status === 'writing' && Buffer.from(contents[key]).subarray(0, bytes.length).equals(bytes))) teamError('FILES_CONFLICT', `文件内容不匹配：${key}`)
      }
    }
    await walk(target)
    if (!partial) {
      for (const file of operation.files.filter(value => value.path.startsWith(root + '/'))) if (!await this.exists(join(base, file.path))) teamError('FILES_CONFLICT', `缺少已准备文件：${file.path}`)
      for (const directory of operation.directories.filter(value => value.startsWith(root + '/'))) if (!await this.exists(join(base, directory))) teamError('FILES_CONFLICT', `缺少已准备目录：${directory}`)
    }
    return true
  }
  /** Read-only audit on restart. Nothing is rewritten or moved here. */
  async inspect(operation: T, requirePrepared = false) {
    for (const root of this.roots(operation)) {
      const prepared = await this.inspectTree(operation, root, this.dataPath, false)
      if (requirePrepared && !prepared) teamError('FILES_CONFLICT', `已准备目录被移除：${root}`)
      await this.inspectTree(operation, root, this.staging(operation), true)
    }
  }
  async prepare(operation: T, signal: AbortSignal, persist: () => Promise<void>) {
    const stage = this.staging(operation), contents = teamFileContents(operation, this.homes).files
    for (const root of this.roots(operation)) {
      signal.throwIfAborted()
      if (await this.inspectTree(operation, root, this.dataPath, false)) continue
      const target = join(stage, root), owner = `${root}/.team-creation.json`
      if (!await this.exists(target)) {
        await this.safe(dirname(target)); await mkdir(dirname(target), { recursive: true }); await mkdir(target)
        await writeFile(join(stage, owner), contents[owner], { flag: 'wx', mode: 0o600 })
      }
      await this.inspectTree(operation, root, stage, true)
      for (const directory of operation.directories.filter(value => value.startsWith(root + '/'))) { signal.throwIfAborted(); await this.safe(join(stage, directory)); await mkdir(join(stage, directory), { recursive: true }) }
      for (const file of operation.files.filter(value => value.path.startsWith(root + '/'))) {
        signal.throwIfAborted()
        const path = join(stage, file.path)
        if (await this.exists(path) && hash(await readFile(path)) === file.hash) { file.status = 'ready'; continue }
        file.status = 'writing'; await persist(); await this.checkpoint?.('before-write', operation, path)
        // Only a recorded interrupted prefix in this owned staging tree is replaceable.
        const exists = await this.exists(path)
        if (exists) {
          const bytes = await readFile(path), expected = Buffer.from(contents[file.path])
          if (bytes.length > expected.length || !expected.subarray(0, bytes.length).equals(bytes)) teamError('FILES_CONFLICT', `写入前文件已变化：${file.path}`)
        }
        await writeFile(path, contents[file.path], { mode: 0o600, flag: exists ? 'w' : 'wx' })
        await this.checkpoint?.('after-write', operation, path)
        file.status = 'ready'; await persist()
      }
      await this.inspectTree(operation, root, stage, false); signal.throwIfAborted()
      const final = join(this.dataPath, root)
      await this.safe(dirname(final)); await mkdir(dirname(final), { recursive: true })
      if (await this.exists(final)) teamError('FILES_CONFLICT', `目标目录被占用：${root}`)
      await rename(target, final); await this.checkpoint?.('after-move', operation, final); await persist()
    }
    for (const root of this.roots(operation)) if (!await this.inspectTree(operation, root, this.dataPath, false)) teamError('INITIALIZATION_FAILED', '文件未全部准备完成')
  }
  async cleanup(operation: T) {
    // Audit every tree before deleting any tree. User modifications remain untouched.
    await this.inspect(operation)
    for (const root of this.roots(operation)) {
      for (const base of [this.dataPath, this.staging(operation)]) if (await this.exists(join(base, root))) await rm(join(base, root), { recursive: true })
    }
    // Only empty, host-named staging parents remain; never recursively remove unknown files.
    const stage = this.staging(operation)
    for (const path of [join(stage, 'agents'), join(stage, 'workspaces'), stage]) if (await this.exists(path)) { await this.safe(path); const { rmdir } = await import('node:fs/promises'); await rmdir(path) }
  }
}
