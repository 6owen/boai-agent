/*
 * [INPUT]: 任务独占锁内的阶段、原始文件/日志与精确补丁，以及原生进程监督账本。
 * [OUTPUT]: 状态锚定的回执字节/历史原件、断点补写与重命名双方范围核对；未知模型不重放。
 * [POS]: 开发控制器本地恢复，不改变BOAI运行时或远程交付规则。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { digest, git, relativePath, type TaskState } from './task'

export const WORKFLOW_VERSION = 3
export const cursors = ['prepare', 'setup', 'baseline', 'develop', 'apply', 'checks', 'candidate-checks', 'review', 'decide', 'done'] as const
export type Cursor = typeof cursors[number]
type Claim = { state: TaskState; directory: string; save(): void }
export const writeEvidence = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
export async function evidenceFiles(directory: string, base = directory): Promise<{ path: string; sha256: string }[]> {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === base && entry.name === 'checkpoint.json') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await evidenceFiles(path, base))
    else {
      if (!entry.isFile()) throw new Error('恢复原件不能包含符号链接或特殊文件')
      files.push({ path: relative(base, path), sha256: digest(await readFile(path)) })
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
const projection = (state: TaskState) => JSON.stringify(Object.fromEntries(['taskHash', 'base', 'branch', 'worktree', 'head', 'attempt', 'codexCalls', 'knownTokens', 'usageComplete', 'baseline', 'checks', 'review', 'proposal', 'deadline', 'workflowVersion', 'cursor'].map(key => [key, state[key as keyof TaskState]])))
const appendCheckpoint = (state: TaskState, id: string, kind: string, sha256: string) => {
  state.checkpoints ??= []
  const existing = state.checkpoints.find(item => item.id === id)
  if (existing && (existing.kind !== kind || existing.sha256 !== sha256)) throw new Error('完成回执与原历史登记冲突')
  if (!existing) state.checkpoints.push({ id, kind, sha256 })
}
async function verifyReceipt(claim: Claim, id: string, kind: string, sha256: string, anchoredBytes?: Buffer) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('恢复步骤身份不匹配')
  const directory = join(claim.directory, id), bytes = anchoredBytes ?? await readFile(join(directory, 'checkpoint.json'))
  if (digest(bytes) !== sha256) throw new Error('完成检查点自身hash不匹配，拒绝旧结论')
  const receipt = JSON.parse(bytes.toString('utf8'))
  if (receipt.version !== WORKFLOW_VERSION || receipt.id !== id || receipt.kind !== kind || receipt.taskHash !== claim.state.taskHash || receipt.base !== claim.state.base || !cursors.includes(receipt.next)) throw new Error('恢复检查点身份或格式不匹配')
  if (JSON.stringify(receipt.files) !== JSON.stringify(await evidenceFiles(directory))) throw new Error('恢复原始文件/日志已变化，不能使用旧结论')
  return receipt
}
export async function verifyCheckpointReceipts(claim: Claim) {
  for (const receipt of claim.state.checkpoints ?? []) await verifyReceipt(claim, receipt.id, receipt.kind, receipt.sha256)
}
export async function checkpoint(claim: Claim, next: Cursor, beforeSave?: () => Promise<void>, afterAnchor?: () => Promise<void>) {
  const { state } = claim
  if (!state.pending) throw new Error('缺少当前恢复步骤')
  const receipt = { version: WORKFLOW_VERSION, id: state.pending.id, kind: state.pending.kind, taskHash: state.taskHash, base: state.base, stateHash: digest(projection(state)), next, executor: { node: process.version, platform: process.platform, arch: process.arch, codex: state.environment?.codex, controllerHash: state.controllerHash }, files: await evidenceFiles(state.pending.directory) }
  const bytes = JSON.stringify(receipt, null, 2) + '\n'
  state.pending.checkpointHash = digest(bytes); state.pending.checkpointBytes = bytes; claim.save() // 原字节同状态锚定，完成标记未写也能只读核验后补写。
  await afterAnchor?.()
  await writeFile(join(state.pending.directory, 'checkpoint.json'), bytes, { flag: 'wx', mode: 0o600 })
  await beforeSave?.()
  appendCheckpoint(state, state.pending.id, state.pending.kind, state.pending.checkpointHash)
  state.cursor = next; delete state.pending; delete state.reason; claim.save()
}
export async function recoverCheckpoint(claim: Claim) {
  const { state } = claim, pending = state.pending
  if (!pending) return false
  if (join(claim.directory, pending.id) !== pending.directory || !/^[a-z0-9-]+$/.test(pending.id)) throw new Error('待恢复步骤目录与原任务不匹配')
  if (!pending.checkpointHash) return false
  let bytes: Buffer, missing = false
  try { bytes = await readFile(join(pending.directory, 'checkpoint.json')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (!pending.checkpointBytes) return false
    bytes = Buffer.from(pending.checkpointBytes); missing = true
  }
  const receipt = await verifyReceipt(claim, pending.id, pending.kind, pending.checkpointHash, bytes)
  if (receipt.stateHash !== digest(projection(state))) throw new Error('恢复状态的期限、预算或资格已变化，拒绝接续')
  if (missing) await writeFile(join(pending.directory, 'checkpoint.json'), bytes, { flag: 'wx', mode: 0o600 })
  appendCheckpoint(state, pending.id, pending.kind, pending.checkpointHash)
  state.cursor = receipt.next; delete state.pending; delete state.reason; claim.save()
  return true
}
export async function drainPendingProcesses(directory: string, guard: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.endsWith('processes')) continue
    if (!entry.isDirectory()) throw new Error('进程恢复目录不是普通目录')
    const path = join(directory, entry.name)
    execFileSync(guard, ['--recover', path], { timeout: 10_000, maxBuffer: 65536 })
    // 原guard仍持有身份时--recover不会信号它；账本仍在就不能继续执行。
    if ((await readdir(path)).some(name => name.endsWith('.json'))) throw new Error('原执行进程尚未确认退出，保留现场')
  }
}
export async function acceptController(claim: Claim, hash?: string, file?: string, previous?: string) {
  const { state, directory } = claim
  if (!hash) return
  if (!file || digest(await readFile(file)) !== hash) throw new Error('控制器原字节身份不匹配')
  if (state.controllerHash && state.controllerHash !== hash) {
    if (previous !== state.controllerHash || state.workflowVersion !== WORKFLOW_VERSION || !state.controllerArtifact || digest(await readFile(state.controllerArtifact)) !== previous) throw new Error('控制器身份已变化；恢复需明确原hash、完整原件及兼容流程版本')
    state.controllerHistory ??= []
    state.controllerHistory.push({ from: previous, to: hash, at: new Date().toISOString() })
  }
  const artifact = join(directory, `controller-${hash}.mjs`)
  const bytes = await readFile(file)
  try { if (digest(await readFile(artifact)) !== hash) throw new Error('控制器原件被改写') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(artifact, bytes, { flag: 'wx', mode: 0o600 }) }
  state.controllerHash = hash; state.controllerArtifact = artifact; claim.save()
}
export interface FileChange { path: string; before: string | null; after: string | null; executable: boolean }
const bytesAt = async (path: string) => readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
export async function applyJournal(worktree: string, beforeHead: string, changes: FileChange[], signal: AbortSignal, afterFile?: () => Promise<void>) {
  signal.throwIfAborted()
  const head = git(worktree, 'rev-parse', 'HEAD')
  const changed = git(worktree, 'diff', '--no-renames', '--name-only', '-z', beforeHead).split('\0').filter(Boolean)
  const staged = git(worktree, 'diff', '--cached', '--no-renames', '--name-only', '-z', beforeHead).split('\0').filter(Boolean)
  const untracked = git(worktree, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
  if ([...changed, ...staged, ...untracked].some(path => !changes.some(change => change.path === path))) throw new Error('补丁恢复发现范围外修改或暂存改动，拒绝继续')
  if (head !== beforeHead) {
    if (git(worktree, 'rev-list', '--parents', '-n', '1', head) !== `${head} ${beforeHead}`) throw new Error('补丁恢复发现未知提交，拒绝继续')
  }
  const pending: FileChange[] = []
  for (const change of changes) {
    relativePath.parse(change.path)
    const entry = git(worktree, 'ls-files', '--stage', '-z', '--', change.path)
    let stagedValue = null
    if (entry) {
      const match = /^(100644|100755) ([a-f0-9]{40}) 0\t([^\0]+)\0$/.exec(entry)
      if (!match || match[3] !== change.path || (match[1] === '100755') !== change.executable) throw new Error(`补丁恢复发现未知索引条目：${change.path}`)
      stagedValue = execFileSync('git', ['cat-file', 'blob', match[2]], { cwd: worktree, maxBuffer: 16 * 1024 * 1024 }).toString('base64')
    }
    if (stagedValue !== change.before && stagedValue !== change.after) throw new Error(`补丁恢复发现未知暂存内容：${change.path}`)
    let current = worktree
    for (const part of change.path.split('/')) { current = join(current, part); if ((await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error }))?.isSymbolicLink()) throw new Error('补丁恢复不能经过符号链接') }
    const bytes = await bytesAt(join(worktree, change.path)), value = bytes?.toString('base64') ?? null
    if (bytes && Boolean((await lstat(join(worktree, change.path))).mode & 0o111) !== change.executable) throw new Error(`补丁恢复发现未知执行权限：${change.path}`)
    if (value === change.after) continue
    if (head !== beforeHead || value !== change.before) throw new Error(`补丁恢复发现未知文件内容：${change.path}`)
    pending.push(change)
  }
  // 全部路径、当前字节及索引先核对；迟到外改不被当成未完成补丁覆盖。
  for (const change of pending) {
    signal.throwIfAborted()
    const path = join(worktree, change.path)
    if (change.after === null) await rm(path)
    else { await mkdir(join(path, '..'), { recursive: true }); signal.throwIfAborted(); await writeFile(path, Buffer.from(change.after, 'base64')) }
    await afterFile?.()
  }
  return head
}
