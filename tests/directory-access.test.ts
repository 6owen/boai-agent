/*
 * [INPUT]: 隔离真实业务目录、符号链接、员工配置及SQLite持久化。
 * [OUTPUT]: 目录许可不变成cwd限制；批准前判定、完全访问、只读上限、链接真实目标、旧配置与失联磁盘兼容回归。
 * [POS]: 目录授权基础模块与真实AppService保存验收；不替代原生进程、审批UI或模型实测。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AgentInput, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import { directoryGrantsSchema } from '../packages/shared/src/domain/directory-access'
import { assertDirectoryTargetCurrent, decideDirectoryAccess, normalizeDirectoryGrants, resolveDirectoryTarget } from '../packages/runtime/src/modules/workspaces/directory-access'
import { AppService } from '../packages/runtime/src/service'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'boai-directory-'))); roots.push(root)
  const a = path.join(root, 'coding'), b = path.join(root, 'reports'), sibling = path.join(root, 'coding-other')
  for (const directory of [a, b, sibling]) { await mkdir(directory); await writeFile(path.join(directory, 'original.txt'), directory) }
  return { root, a, b, sibling }
}
const permission = (directory: string, executionPermission: DigitalAgent['executionPermission'] = 'ask') => ({ executionPermission, directoryGrants: [{ path: directory, access: 'read-write' as const }] })

describe('员工目录许可按真实业务目标判断', () => {
  it('已授权目录允许读写；相同文本前缀的兄弟目录仍先申请', async () => {
    const { a, sibling } = await fixture()
    expect(await decideDirectoryAccess(permission(a), path.join(a, 'original.txt'), 'read')).toMatchObject({ kind: 'allowed', source: 'employee' })
    expect(await decideDirectoryAccess(permission(a), path.join(a, 'new/sub/file.txt'), 'write')).toMatchObject({ kind: 'allowed', target: { path: path.join(a, 'new/sub/file.txt'), directory: a, exists: false } })
    expect(await decideDirectoryAccess(permission(a), path.join(sibling, 'original.txt'), 'read')).toMatchObject({ kind: 'approval', access: 'read-only', target: { directory: sibling } })
  })
  it('其他目录读取和写入分别申请最小实际目录，批准不串员工', async () => {
    const { a, b } = await fixture(), target = path.join(b, 'original.txt')
    expect(await decideDirectoryAccess(permission(a), target, 'read')).toMatchObject({ kind: 'approval', access: 'read-only', target: { directory: b } })
    expect(await decideDirectoryAccess(permission(a), target, 'write', [{ path: b, access: 'read-only' }])).toMatchObject({ kind: 'approval', access: 'read-write' })
    expect(await decideDirectoryAccess(permission(a), target, 'write', [{ path: b, access: 'read-write' }])).toMatchObject({ kind: 'allowed', source: 'run' })
    expect(await decideDirectoryAccess(permission(a), target, 'write')).toMatchObject({ kind: 'approval' })
  })
  it('完全访问不被预授权列表锁在coding，也不需要把其他目录写入配置', async () => {
    const { a, b, sibling } = await fixture(), agent = permission(a, 'full-access')
    for (const directory of [b, sibling]) for (const operation of ['read', 'write'] as const) expect(await decideDirectoryAccess(agent, path.join(directory, 'original.txt'), operation)).toMatchObject({ kind: 'allowed', source: 'full-access' })
    expect(agent.directoryGrants).toEqual([{ path: a, access: 'read-write' }])
  })
  it('只读上限拒绝写和删除，即使持久/本次目录已允许读写', async () => {
    const { a, b } = await fixture(), agent = permission(a, 'read-only')
    expect(await decideDirectoryAccess(agent, path.join(a, 'original.txt'), 'read')).toMatchObject({ kind: 'allowed' })
    expect(await decideDirectoryAccess(agent, path.join(b, 'original.txt'), 'read')).toMatchObject({ kind: 'approval', access: 'read-only' })
    for (const operation of ['write', 'delete-entry'] as const) expect(await decideDirectoryAccess(agent, path.join(b, 'original.txt'), operation, [{ path: b, access: 'read-write' }])).toMatchObject({ kind: 'denied' })
  })
  it('省略字段保留旧门禁；显式空列表启用其他目录申请', async () => {
    const { a } = await fixture()
    expect(await decideDirectoryAccess({ executionPermission: 'ask' }, a, 'read')).toEqual({ kind: 'legacy' })
    expect(await decideDirectoryAccess({ executionPermission: 'ask', directoryGrants: [] }, a, 'read')).toMatchObject({ kind: 'approval' })
  })
  it('重叠许可为累加；嵌套只读项不伪装成撤销父目录写入', async () => {
    const { a } = await fixture(), child = path.join(a, 'child'); await mkdir(child)
    const agent = { ...permission(a), directoryGrants: [...permission(a).directoryGrants, { path: child, access: 'read-only' as const }] }
    expect(await decideDirectoryAccess(agent, path.join(child, 'new.txt'), 'write')).toMatchObject({ kind: 'allowed' })
    expect(await decideDirectoryAccess({ ...agent, directoryGrants: agent.directoryGrants.slice(1) }, path.join(child, 'new.txt'), 'write')).toMatchObject({ kind: 'approval', access: 'read-write' })
  })
  it('读取/写入链接按实际目标申请；完全访问仍可读实际目标', async () => {
    const { a, b } = await fixture(), link = path.join(a, 'linked'); await symlink(b, link)
    for (const operation of ['read', 'write'] as const) expect(await decideDirectoryAccess(permission(a), path.join(link, 'original.txt'), operation)).toMatchObject({ kind: 'approval', target: { path: path.join(b, 'original.txt'), directory: b } })
    const decision = await decideDirectoryAccess(permission(a, 'full-access'), path.join(link, 'original.txt'), 'read')
    expect(decision.kind).toBe('allowed'); if (decision.kind !== 'allowed') throw new Error('expected allowed')
    expect(await readFile(decision.target.path, 'utf8')).toBe(b)
  })
  it('删除链接只授权并删除该目录项，外部原件保持', async () => {
    const { a, b } = await fixture(), link = path.join(a, 'linked'); await symlink(b, link)
    const decision = await decideDirectoryAccess(permission(a), link, 'delete-entry')
    expect(decision.kind).toBe('allowed'); if (decision.kind !== 'allowed') throw new Error('expected allowed')
    await assertDirectoryTargetCurrent(decision.target); await unlink(decision.target.path)
    expect(await readFile(path.join(b, 'original.txt'), 'utf8')).toBe(b)
  })
  it('保存目录别名固定真实路径；同一真实目录不能重复保存', async () => {
    const { root, a } = await fixture(), alias = path.join(root, 'alias'); await symlink(a, alias)
    expect(await normalizeDirectoryGrants([{ path: alias, access: 'read-only' }])).toEqual([{ path: a, access: 'read-only' }])
    await expect(normalizeDirectoryGrants([{ path: a, access: 'read-only' }, { path: alias, access: 'read-write' }])).rejects.toThrow('重复')
  })
  it('目录不在线时不阻止其他配置保存；新增/升级许可仍需重新核对', async () => {
    const { a } = await fixture(), previous = permission(a).directoryGrants; await rm(a, { recursive: true })
    expect(await normalizeDirectoryGrants(undefined, previous)).toEqual(previous)
    expect(await normalizeDirectoryGrants(previous, previous)).toEqual(previous)
    await expect(normalizeDirectoryGrants([{ path: a, access: 'read-only' }], previous)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('新文件审批期间父目录被替换为链接时失效，不跟随新的目标', async () => {
    const { a, b } = await fixture(), child = path.join(a, 'child'); await mkdir(child)
    const target = await resolveDirectoryTarget(path.join(child, 'new.txt'), 'write')
    await rename(child, `${child}-old`); await symlink(b, child)
    await expect(assertDirectoryTargetCurrent(target)).rejects.toThrow('已变化')
  })
  it('原本缺失的子目录在审批中变成链接时也失效', async () => {
    const { a, b } = await fixture(), child = path.join(a, 'child')
    const target = await resolveDirectoryTarget(path.join(child, 'new.txt'), 'write'); await symlink(b, child)
    await expect(assertDirectoryTargetCurrent(target)).rejects.toThrow('已变化')
  })
  it('悬空链接不被当作新建文件，相对路径/上级跳转/控制符拒绝', async () => {
    const { a, b } = await fixture(), link = path.join(a, 'dangling'); await symlink(path.join(b, 'missing'), link)
    await expect(resolveDirectoryTarget(link, 'write')).rejects.toMatchObject({ code: 'ENOENT' })
    for (const invalid of ['relative/file', `${a}/../reports/original.txt`, `${a}/bad\u0000file`]) await expect(resolveDirectoryTarget(invalid, 'read')).rejects.toThrow('绝对目录')
    expect(directoryGrantsSchema.safeParse([{ path: a, access: 'read-write', autoApprove: true }]).success).toBe(false)
    await expect(normalizeDirectoryGrants([{ path: path.join(a, 'original.txt'), access: 'read-only' }])).rejects.toThrow('必须是目录')
  })
})

describe('员工目录配置沿原业务保存及重启', () => {
  it('真实IPC/SQLite持久化，保持受管工作区；移除许可不删除业务原件', async () => {
    const { root, a } = await fixture(), dataPath = path.join(root, 'data')
    const run = vi.fn(async () => {}), secrets = { get: async () => undefined, set: async () => {}, delete: async () => {} }
    const open = async () => { const service = new AppService({ dataPath, secrets, engine: { run, test: async () => 'unused' }, emit: () => {} }); services.push(service); await service.init(); return service }
    let service = await open()
    const snapshot = () => service.handle('snapshot', undefined) as Promise<Snapshot>
    let agent = (await snapshot()).agents.find(item => item.id === 'researcher')!
    const originalWorkspace = agent.workspaceRef
    const save = async (patch: Partial<AgentInput>) => {
      const { configVersion, directoryRevision, workspaceRef: _, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...input } = agent
      agent = await service.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, ...patch }) as DigitalAgent
      return agent
    }
    await save({ directoryGrants: [{ path: a, access: 'read-write' }], executionPermission: 'ask' })
    expect(agent.directoryGrants).toEqual([{ path: a, access: 'read-write' }]); expect(agent.workspaceRef).toBe(originalWorkspace)
    const savedVersion = agent.configVersion
    await service.close(); services.splice(services.indexOf(service), 1); service = await open()
    agent = (await snapshot()).agents.find(item => item.id === agent.id)!
    expect(agent.configVersion).toBe(savedVersion); expect(agent.directoryGrants).toEqual([{ path: a, access: 'read-write' }])
    await expect(service.handle('saveAgent', { name: 'invalid', directoryGrants: [{ path: a, access: 'all' }] })).rejects.toThrow()
    await save({ directoryGrants: [], name: '目录员工' })
    expect(await readFile(path.join(a, 'original.txt'), 'utf8')).toBe(a); expect(run).not.toHaveBeenCalled()
  })
})
