/*
 * [INPUT]: Selected marketplace identity and actual POSIX shell argument parsing.
 * [OUTPUT]: Idempotent requests and invalidated pages cannot launch again. Fixed global installation arguments; malformed/injected sources cannot execute shell text.
 * [POS]: Installation boundary regression, without network or personal skill writes.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { WorkspaceTerminalService } from '../apps/electron/src/main/workspace-terminal/service'
import { SkillInstallationTerminal, skillInstallCommand } from '../apps/electron/src/main/skill-installation-terminal'

it('installs the exact selected skill to the canonical global path through a fixed CLI', () => {
  const command = skillInstallCommand('vercel-labs/skills/find-skills')
  const output = execFileSync('/bin/sh', ['-c', `npx() { printf '%s\n' "$@"; }; ${command}`], { encoding: 'utf8' })
  expect(output.trim().split('\n')).toEqual(['--yes', 'skills@1.8.1', 'add', 'vercel-labs/skills', '--skill', 'find-skills', '--global', '--agent', 'codex', '--yes'])
})
it.each(["a/b/c'; touch /tmp/injected", 'a/b/$(id)', 'a/b/c\nexit', '-x/b/c', 'a/../c', 'a/b', 'https://github.com/a/b', 'a/b/--yes'])('rejects untrusted shell or ambiguous marketplace sources: %s', source => {
  expect(() => skillInstallCommand(source)).toThrow('技能来源')
})

afterEach(() => vi.restoreAllMocks())
it('相同安装请求的回执查询不会重复启动CLI，身份冲突被拒绝', async () => {
  vi.spyOn(WorkspaceTerminalService.prototype, 'recover').mockResolvedValue(undefined)
  const start = vi.spyOn(WorkspaceTerminalService.prototype, 'startCommand').mockResolvedValue({ kind: 'created', terminal: { id: 'terminal', employeeId: 'skill-installer', conversationId: 'request', title: '终端', cwd: '/tmp', createdAt: '', status: 'running' } })
  const installer = new SkillInstallationTerminal('/tmp/unused-skill-installation-fixture')
  const input = { action: 'install', requestId: randomUUID(), source: 'vercel-labs/skills/find-skills' } as const
  try {
    const [first, second] = await Promise.all([installer.handle(1, input), installer.handle(1, input)])
    expect(first).toEqual(second)
    expect(start).toHaveBeenCalledTimes(1)
    await expect(installer.handle(1, { ...input, source: 'owner/repo/other' })).rejects.toThrow('身份已被使用')
  } finally { await installer.close() }
})
it('页面在监督器准备时被释放，迟到就绪不能启动安装', async () => {
  let ready!: () => void
  vi.spyOn(WorkspaceTerminalService.prototype, 'recover').mockImplementation(() => new Promise<void>(resolve => { ready = resolve }))
  const start = vi.spyOn(WorkspaceTerminalService.prototype, 'startCommand')
  const installer = new SkillInstallationTerminal('/tmp/unused-skill-installation-fixture')
  try {
    const operation = installer.handle(3, { action: 'install', requestId: randomUUID(), source: 'vercel-labs/skills/find-skills' })
    await Promise.resolve()
    installer.releaseClient(3)
    ready()
    await expect(operation).rejects.toThrow('原安装页面已失效')
    expect(start).not.toHaveBeenCalled()
  } finally { await installer.close() }
})
