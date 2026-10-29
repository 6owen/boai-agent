/*
 * [INPUT]: Real isolated Git repositories and a controlled GitHub CLI transport.
 * [OUTPUT]: Staged-only commits, exact-head merge, restoration on failure/interruption and durable recovery.
 * [POS]: git cpf command integration tests; no real GitHub writes or protection changes.
 * [PROTOCOL]: Update this Header and tests/.folder.md when changed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCpf } from '../scripts/git-cpf.mjs'

const execute = promisify(execFile)
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai cpf ')); roots.push(root)
  const cwd = join(root, 'checkout'), remote = join(root, 'remote.git'), hooks = join(root, 'hooks')
  await mkdir(cwd); await mkdir(hooks)
  const environment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  const git = async (...args: string[]) => (await execute('git', args, { cwd, env: environment })).stdout.trim()
  await git('init', '--bare', remote)
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'CPF Fixture'); await git('config', 'user.email', 'cpf@example.invalid')
  await git('config', 'core.hooksPath', hooks)
  await writeFile(join(cwd, 'base.txt'), 'base\n')
  await git('add', '--', 'base.txt'); await git('commit', '-m', 'base')
  await git('remote', 'add', 'origin', remote); await git('push', '-u', 'origin', 'main')
  const state = { enabled: true, admin: true, merged: false, created: false, stale: false, conflict: false, failMerge: false, failDisable: false, failRestore: false, abort: undefined as AbortController | undefined }
  const calls: { program: string; args: string[]; signal?: AbortSignal }[] = []
  const fail = (message: string) => { throw Object.assign(new Error(message), { code: 1, stderr: message }) }
  const exec = async (program: string, args: string[], options: { signal?: AbortSignal }) => {
    calls.push({ program, args, signal: options.signal })
    if (program === 'git') {
      if (args.join(' ') === 'remote get-url origin') return { stdout: 'https://github.com/example/cpf.git\n' }
      return execute(program, args, { ...options, cwd, env: environment })
    }
    const response = (value: unknown) => ({ stdout: JSON.stringify(value) })
    if (args[0] === 'api') {
      const path = args.at(-1)!
      if (args[1] === '--method') {
        if (args[2] === 'DELETE') { state.enabled = false; if (state.failDisable) fail('lost disable response') }
        if (args[2] === 'POST') { if (state.failRestore) fail('restore offline'); state.enabled = true }
        return response({ enabled: state.enabled })
      }
      if (path.endsWith('/enforce_admins')) return response({ enabled: state.enabled })
      if (path.endsWith('/protection')) return response({ enforce_admins: { enabled: state.enabled }, required_status_checks: { strict: true, contexts: ['Required checks'] } })
      return response({ permissions: { admin: state.admin } })
    }
    if (args[1] === 'list') return response(state.created ? [{ number: 7 }] : [])
    if (args[1] === 'create') { state.created = true; return { stdout: 'https://github.com/example/cpf/pull/7\n' } }
    if (args[1] === 'view') return response({ state: state.merged ? 'MERGED' : 'OPEN', headRefOid: state.stale ? 'other-head' : await git('rev-parse', 'HEAD'), baseRefName: 'main', mergeable: state.conflict ? 'CONFLICTING' : 'MERGEABLE', isDraft: false, mergedAt: state.merged ? '2026-10-29T00:00:00Z' : null, mergeCommit: state.merged ? { oid: await git('rev-parse', 'HEAD') } : null, url: 'https://github.com/example/cpf/pull/7' })
    if (args[1] === 'merge') {
      if (state.enabled) fail('Required status check is expected')
      if (state.abort) { state.abort.abort(); throw new Error('interrupted') }
      if (state.failMerge) fail('merge rejected')
      expect(args[args.indexOf('--match-head-commit') + 1]).toBe(await git('rev-parse', 'HEAD'))
      state.merged = true
      await git('--git-dir', remote, 'update-ref', 'refs/heads/main', await git('rev-parse', 'HEAD'))
      return { stdout: '' }
    }
    throw new Error(`Unexpected gh command: ${args.join(' ')}`)
  }
  const stage = async () => { await writeFile(join(cwd, 'selected.txt'), 'selected\n'); await git('add', '--', 'selected.txt') }
  const options = { cwd, exec, log: () => {} }
  return { cwd, git, state, calls, stage, options, recovery: join(cwd, '.git', 'boai', 'cpf-protection.json') }
}

describe('explicit git cpf', () => {
  it('commits only staged files, pushes a branch, matches the head and restores protection', async () => {
    const f = await fixture(); await f.stage()
    await writeFile(join(f.cwd, 'base.txt'), 'unstaged edit\n'); await writeFile(join(f.cwd, 'private.txt'), 'not selected\n')
    const message = 'fix: literal $(touch unwanted) `text`'
    await runCpf([message], f.options)
    expect(await f.git('log', '-1', '--format=%s')).toBe(message)
    expect(await f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('selected.txt')
    expect(await f.git('diff', '--name-only')).toBe('base.txt')
    expect(await readFile(join(f.cwd, 'base.txt'), 'utf8')).toBe('unstaged edit\n')
    expect(await readFile(join(f.cwd, 'private.txt'), 'utf8')).toBe('not selected\n')
    const push = f.calls.find(call => call.program === 'git' && call.args[0] === 'push')!
    expect(push.args.join(' ')).toContain(':refs/heads/cpf/')
    expect(push.args).not.toContain('--force')
    expect(f.state).toMatchObject({ merged: true, enabled: true })
    await expect(access(f.recovery)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('accepts existing commits without creating another commit or synchronizing the PR branch with main', async () => {
    const f = await fixture(); await f.stage(); await f.git('commit', '-m', 'existing')
    const head = await f.git('rev-parse', 'HEAD')
    await runCpf([], f.options)
    expect(await f.git('rev-parse', 'HEAD')).toBe(head)
    expect(f.calls.some(call => call.args[0] === 'commit' || call.args.includes('update-branch'))).toBe(false)
    expect(await f.git('rev-parse', 'origin/main')).toBe(head)
  })
  it.each(['failMerge', 'failDisable'] as const)('restores protection when %s occurs', async failure => {
    const f = await fixture(); await f.stage(); f.state[failure] = true
    await expect(runCpf(['failure'], f.options)).rejects.toThrow()
    expect(f.state.enabled).toBe(true)
    expect(f.state.merged).toBe(false)
    await expect(access(f.recovery)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('restores protection after interruption without passing the aborted signal to recovery', async () => {
    const f = await fixture(); await f.stage(); f.state.abort = new AbortController()
    await expect(runCpf(['interrupted'], { ...f.options, signal: f.state.abort.signal })).rejects.toThrow('interrupted')
    expect(f.state.enabled).toBe(true)
    const restore = f.calls.find(call => call.args.includes('POST'))!
    expect(restore.signal).toBeUndefined()
  })
  it('retains a durable receipt on restoration failure and supports recovery without another merge', async () => {
    const f = await fixture(); await f.stage(); f.state.failRestore = true
    await expect(runCpf(['recovery'], f.options)).rejects.toThrow('git cpf --restore-protection')
    expect(JSON.parse(await readFile(f.recovery, 'utf8'))).toMatchObject({ repo: 'example/cpf', enforceAdmins: true })
    f.state.failRestore = false
    const count = f.calls.filter(call => call.args[1] === 'merge').length
    await runCpf(['--restore-protection'], f.options)
    expect(f.state.enabled).toBe(true)
    expect(f.calls.filter(call => call.args[1] === 'merge')).toHaveLength(count)
    await expect(access(f.recovery)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it.each(['stale', 'conflict'] as const)('does not relax protection for a %s PR', async condition => {
    const f = await fixture(); await f.stage(); f.state[condition] = true
    await expect(runCpf(['do not merge'], f.options)).rejects.toThrow()
    expect(f.calls.some(call => call.args.includes('DELETE'))).toBe(false)
  })
  it('refuses before committing when the account lacks administrator access', async () => {
    const f = await fixture(); await f.stage(); f.state.admin = false
    await expect(runCpf(['no access'], f.options)).rejects.toThrow('管理员权限')
    expect(await f.git('log', '-1', '--format=%s')).toBe('base')
    expect(await f.git('diff', '--cached', '--name-only')).toBe('selected.txt')
  })
  it('installs a local alias that works from a subdirectory without changing global config', async () => {
    const f = await fixture()
    await runCpf(['--install'], f.options)
    await mkdir(join(f.cwd, 'subdir'))
    const result = await execute('git', ['cpf', '-h'], { cwd: join(f.cwd, 'subdir') })
    expect(result.stdout).toContain('git cpf "提交说明"')
    expect(await f.git('config', '--local', '--get', 'alias.cpf')).toContain('--git-common-dir')
    expect(f.calls.some(call => call.program === 'gh')).toBe(false)
  })
})
