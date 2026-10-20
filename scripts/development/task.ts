/*
 * [INPUT]: 冻结任务、原仓库Git公共目录和实际进程身份。
 * [OUTPUT]: 唯一领取及冻结任务；保存流程版本/游标、绝对期限和恢复原件身份，不复用变化的输入。
 * [POS]: 开发控制器持久合同；不接BOAI产品任务/员工状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error Plain Node ESM resource helper intentionally has no declaration file.
import { acquireResourceLock } from '../resource-lock.mjs'

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export const relativePath = z.string().min(1).refine(value => {
  const path = value.endsWith('/') ? value.slice(0, -1) : value
  return !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && !['..', '.', '.git', '.local'].includes(part.toLowerCase()))
}, '必须为仓库内规范明确路径，不允许空路径段或保留目录')
const checkSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), command: z.string().min(1), args: z.array(z.string()), timeoutMs: z.number().int().min(1000).max(900_000), report: z.object({ path: relativePath, requiredTests: z.array(z.string().min(1)).min(1) }).strict().optional() }).strict()
export const taskSchema = z.object({
  version: z.literal(1), taskId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  goal: z.string().min(10), acceptance: z.array(z.string().min(5)).min(1), source: z.string().min(1),
  base: z.string().regex(/^[a-f0-9]{40}$/), targetBranch: z.string().min(1), paths: z.array(relativePath).min(1),
  setup: z.array(checkSchema).default([]), checks: z.array(checkSchema).min(1),
  maxAttempts: z.number().int().min(1).max(3).default(2), maxCodexCalls: z.number().int().min(1).max(6).default(4),
  maxTokens: z.number().int().min(1000).default(200_000), timeoutMs: z.number().int().min(1000).max(3_600_000).default(1_800_000),
  model: z.string().min(1).optional(), references: z.array(z.string()).default([]),
}).strict().refine(value => new Set(value.checks.map(check => check.id)).size === value.checks.length, '检查ID不能重复')
export type Task = z.infer<typeof taskSchema>
export interface TaskState {
  version: 1; taskHash: string; phase: string; base: string; worktree: string; branch: string;
  attempt: number; codexCalls: number; knownTokens: number; usageComplete: boolean;
  head?: string; pending?: { id: string; kind: string; directory: string; started: boolean; journalHash?: string; checkpointHash?: string }; reason?: string;
  lease?: { owner: string; pid: number; hostname: string; expiresAt: string };
  baseline?: unknown; checks?: unknown; review?: unknown;
  delivery?: { head: string; base: string; url?: string; number?: number };
  controllerHash?: string; controllerArtifact?: string; environment?: { node: string; platform: string; arch: string; codex?: string };
  workflowVersion?: number; cursor?: string; deadline?: number; proposal?: { path: string; sha256: string };
  controllerHistory?: { from: string; to: string; at: string }[];
  checkpoints?: { id: string; kind: string; sha256: string }[];
}
export const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
export function taskDirectory(repository: string, taskId: string) {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(taskId)) throw new Error('非法taskId')
  return join(resolve(repository, git(repository, 'rev-parse', '--git-common-dir')), 'boai-development/tasks', taskId)
}
export function claimTask(repository: string, raw: unknown) {
  const task = taskSchema.parse(raw), directory = taskDirectory(repository, task.taskId), taskHash = digest(JSON.stringify(task))
  mkdirSync(directory, { recursive: true })
  const release = acquireResourceLock(join(directory, 'claim.sqlite'))
  let state: TaskState
  const save = () => { const temporary = join(directory, `state-${randomUUID()}.tmp`); writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n'); renameSync(temporary, join(directory, 'state.json')) }
  try {
    try { state = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')); if (state.taskHash !== taskHash) throw new Error('同一taskId的冻结输入已变化，请建立新任务修订') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      try {
        const registered = taskSchema.parse(JSON.parse(readFileSync(join(directory, 'task.json'), 'utf8')))
        if (digest(JSON.stringify(registered)) !== taskHash) throw new Error('登记中断后的冻结任务不匹配，拒绝覆盖')
      } catch (registrationError) {
        if ((registrationError as NodeJS.ErrnoException).code !== 'ENOENT') throw registrationError
        writeFileSync(join(directory, 'task.json'), JSON.stringify(task, null, 2) + '\n', { flag: 'wx' })
      }
      state = { version: 1, taskHash, phase: 'registered', base: task.base, worktree: '', branch: `dev/${task.taskId}`, attempt: 0, codexCalls: 0, knownTokens: 0, usageComplete: true }
    }
    const heartbeat = () => { state.lease = { owner, pid: process.pid, hostname: hostname(), expiresAt: new Date(Date.now() + 15_000).toISOString() }; save() }
    const owner = randomUUID(); heartbeat()
    const timer = setInterval(heartbeat, 5000)
    return { task, state, directory, save, release: () => { clearInterval(timer); delete state.lease; try { save() } finally { release() } } }
  } catch (error) { release(); throw error }
}
export function taskStatus(repository: string, id: string) {
  const directory = taskDirectory(repository, id)
  const task = taskSchema.parse(JSON.parse(readFileSync(join(directory, 'task.json'), 'utf8')))
  let state: TaskState | { phase: string; reason: string }
  try { state = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = { phase: 'registration-interrupted', reason: '冻结任务已保存，状态登记中断；重新领取时只补注册态' } }
  if ('pending' in state && state.pending?.started && ['develop', 'review'].includes(state.pending.kind)) state.usageComplete = false
  return { directory, task, state }
}
