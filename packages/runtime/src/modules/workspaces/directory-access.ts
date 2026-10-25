/*
 * [OUTPUT]: 移动创建目标与删除目录项不跟随叶子链接；审批保存原目录项身份，替换后拒绝旧批准。
 * [INPUT]: 当前员工目录配置、访问目的与真实文件系统元信息；不读取文件正文或执行命令。
 * [OUTPUT]: 规范目录保存、真实目标解析、员工只读上限和可追加授权判定；符号链接按实际目标授权，删除链接按目录项处理。
 * [POS]: 业务目录访问的宿主策略；不代替受管材料门禁、实际文件操作或原生/命令隔离。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { DigitalAgent } from '@boai/shared/domain'
import { directoryGrantsSchema, type DirectoryAccess, type DirectoryGrant } from '@boai/shared/domain/directory-access'

export type DirectoryOperation = 'read' | 'write' | 'delete-entry' | 'create-entry'
export type DirectoryTarget = {
  path: string
  operation: DirectoryOperation
  anchor: { path: string; device: number; inode: number }
  entry?: { device: number; inode: number }
  exists: boolean
  directory: string
}
export type DirectoryDecision =
  | { kind: 'legacy' }
  | { kind: 'denied'; reason: string }
  | { kind: 'allowed'; target: DirectoryTarget; source: 'full-access' | 'employee' | 'run' }
  | { kind: 'approval'; target: DirectoryTarget; access: DirectoryAccess }

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
export function isWithinDirectory(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
function absolutePath(value: string) {
  if (!path.isAbsolute(value) || /[\x00-\x1f\x7f]/u.test(value) || value.split(path.sep).includes('..')) throw new Error('请使用不含上级跳转的绝对目录路径')
  return path.normalize(value)
}

/** Explicit edits verify directories; omitted/unchanged entries remain saveable if a disk is offline. */
export async function normalizeDirectoryGrants(input: DirectoryGrant[] | undefined, previous?: DirectoryGrant[]): Promise<DirectoryGrant[] | undefined> {
  if (input === undefined) return previous && structuredClone(previous)
  const grants: DirectoryGrant[] = []
  for (const grant of directoryGrantsSchema.parse(input)) {
    const requested = absolutePath(grant.path)
    const unchanged = previous?.some(item => item.path === requested && item.access === grant.access)
    const canonical = unchanged ? requested : await realpath(requested)
    if (!unchanged && !(await stat(canonical)).isDirectory()) throw new Error('授权目标必须是目录')
    if (grants.some(item => item.path === canonical)) throw new Error('不能重复授权同一目录')
    grants.push({ path: canonical, access: grant.access })
  }
  return grants
}

/** Only metadata is inspected. A dangling link is not treated as a creatable missing file. */
export async function resolveDirectoryTarget(value: string, operation: DirectoryOperation): Promise<DirectoryTarget> {
  const requested = absolutePath(value)
  const entryOnly = (operation === 'delete-entry' || operation === 'create-entry') && requested !== path.parse(requested).root
  let existing = entryOnly ? path.dirname(requested) : requested
  const suffix: string[] = entryOnly ? [path.basename(requested)] : []
  while (true) {
    try { await lstat(existing); break }
    catch (error) {
      if (!isMissing(error) || existing === path.parse(existing).root) throw error
      suffix.unshift(path.basename(existing)); existing = path.dirname(existing)
    }
  }
  const canonical = await realpath(existing), info = await stat(canonical)
  if (suffix.length && !info.isDirectory()) throw new Error('目标的父路径不是目录')
  const target = path.join(canonical, ...suffix)
  let exists = suffix.length === 0
  let entry: DirectoryTarget['entry']
  if (entryOnly) {
    try { const state = await lstat(target); exists = true; entry = { device: state.dev, inode: state.ino } }
    catch (error) { if (operation === 'delete-entry' || !isMissing(error)) throw error }
  }
  if (operation === 'read' && !exists) throw Object.assign(new Error('目标文件或目录不存在'), { code: 'ENOENT' })
  return { path: target, operation, anchor: { path: canonical, device: info.dev, inode: info.ino }, ...(entry ? { entry } : {}), exists, directory: info.isDirectory() ? canonical : path.dirname(target) }
}

export async function assertDirectoryTargetCurrent(target: DirectoryTarget) {
  const canonical = await realpath(target.anchor.path), info = await stat(canonical)
  if (canonical !== target.anchor.path || info.dev !== target.anchor.device || info.ino !== target.anchor.inode) throw new Error('授权目标已变化，请重新核对目录')
  const current = await resolveDirectoryTarget(target.path, target.operation)
  if (current.path !== target.path) throw new Error('授权目标已变化，请重新核对目录')
  if (target.entry && (target.entry.device !== current.entry?.device || target.entry.inode !== current.entry?.inode)) throw new Error('授权文件已变化，请重新核对目录')
}

async function permits(grant: DirectoryGrant, target: string, write: boolean) {
  if ((write && grant.access !== 'read-write') || !isWithinDirectory(grant.path, target)) return false
  // Persisted grants are canonical. A replaced root must not silently follow a new link.
  try { return await realpath(grant.path) === grant.path && (await stat(grant.path)).isDirectory() }
  catch (error) { if (isMissing(error) || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return false; throw error }
}

/** Grants are additive; a nested read-only entry does not revoke a parent's read-write grant. */
export async function decideDirectoryAccess(agent: Pick<DigitalAgent, 'executionPermission' | 'directoryGrants'>, value: string, operation: DirectoryOperation, runGrants: readonly DirectoryGrant[] = []): Promise<DirectoryDecision> {
  const write = operation !== 'read'
  if (write && agent.executionPermission === 'read-only') return { kind: 'denied', reason: '当前员工为只读权限，目录授权不能允许写入或删除' }
  if (agent.directoryGrants === undefined && agent.executionPermission !== 'full-access') return { kind: 'legacy' }
  const target = await resolveDirectoryTarget(value, operation)
  if (agent.executionPermission === 'full-access') return { kind: 'allowed', target, source: 'full-access' }
  for (const grant of agent.directoryGrants ?? []) if (await permits(grant, target.path, write)) return { kind: 'allowed', target, source: 'employee' }
  for (const grant of runGrants) if (await permits(grant, target.path, write)) return { kind: 'allowed', target, source: 'run' }
  return { kind: 'approval', target, access: write ? 'read-write' : 'read-only' }
}
