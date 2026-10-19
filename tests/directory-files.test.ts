/*
 * [INPUT]: 实际业务文件与RunDirectoryAccess、确定性IO故障/取消注入、原文件工具锁。
 * [OUTPUT]: 移动的独占目标、取消/外改后源保留、链接原件隔离与搜索上限；不重放副作用。
 * [POS]: 目录文件操作的负例回归，服务/发布生命周期另见directory-approval。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, open, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DigitalAgent } from '../src/shared/domain'
import { RunDirectoryAccess } from '../src/runtime/modules/workspaces/directory-run'
import { moveBusinessFile } from '../src/runtime/modules/workspaces/directory-files'
import { searchTaskFiles } from '../src/runtime/modules/workspaces/file-search'

const hooks = vi.hoisted(() => ({ beforeOpen: undefined as ((path: string) => Promise<void>) | undefined, afterWrite: undefined as ((path: string) => Promise<void>) | undefined }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    const path = String(args[0]); await hooks.beforeOpen?.(path)
    const handle = await actual.open(...args)
    const originalWrite = handle.write.bind(handle)
    handle.write = (async (...writeArgs: any[]) => { const result = await (originalWrite as any)(...writeArgs); await hooks.afterWrite?.(path); return result }) as typeof handle.write
    return handle
  } }
})
const roots: string[] = []
afterEach(async () => { hooks.beforeOpen = undefined; hooks.afterWrite = undefined; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-directory-files-'))); roots.push(root)
  const allowed = join(root, 'allowed'), other = join(root, 'other'); await mkdir(allowed); await mkdir(other)
  const source = join(allowed, 'source.bin'), destination = join(allowed, 'target.bin'), controller = new AbortController()
  await writeFile(source, Buffer.alloc(150_000, 65)); await writeFile(join(other, 'secret'), 'UNAUTHORIZED')
  const agent = { id: 'employee', configVersion: 1, executionPermission: 'ask', directoryGrants: [{ path: allowed, access: 'read-write' }] } as DigitalAgent
  const access = new RunDirectoryAccess(agent, { signal: controller.signal, validate: async () => controller.signal.throwIfAborted(), assertTarget: async () => {}, request: async () => { throw new Error('Unexpected approval') } })
  return { root, allowed, other, source, destination, controller, context: { signal: controller.signal, directoryAccess: access } }
}
describe('业务文件移动不覆盖或盲删原件', () => {
  it('真实文件分块复制后移除源，字节和权限保留', async () => {
    const f = await fixture(), input = await open(f.source, 'r+'); await input.chmod(0o640); await input.close()
    expect(await moveBusinessFile(f.context, f.source, f.destination)).toMatchObject({ moved: true, sourceRetained: false })
    expect(await readFile(f.destination)).toEqual(Buffer.alloc(150_000, 65)); await expect(readFile(f.source)).rejects.toMatchObject({ code: 'ENOENT' })
    const output = await open(f.destination, 'r'); expect((await output.stat()).mode & 0o777).toBe(0o640); await output.close()
  })
  it('创建目标瞬间出现竞争文件时拒绝覆盖，源和竞争原件都保持', async () => {
    const f = await fixture()
    hooks.beforeOpen = async path => { if (path === f.destination) { hooks.beforeOpen = undefined; await writeFile(path, 'OTHER') } }
    await expect(moveBusinessFile(f.context, f.source, f.destination)).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(f.destination, 'utf8')).toBe('OTHER'); expect((await readFile(f.source)).length).toBe(150_000)
  })
  it('打开源瞬间被换成外部符号链接时不跟随读取或创建目标', async () => {
    const f = await fixture()
    hooks.beforeOpen = async path => { if (path === f.source) { hooks.beforeOpen = undefined; await rename(path, `${path}.old`); await symlink(join(f.other, 'secret'), path) } }
    await expect(moveBusinessFile(f.context, f.source, f.destination)).rejects.toThrow()
    await expect(readFile(f.destination)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(join(f.other, 'secret'), 'utf8')).toBe('UNAUTHORIZED')
  })
  it('复制中取消返回部分状态并保留源，不把已创建的目标当作不存在重试', async () => {
    const f = await fixture()
    hooks.afterWrite = async path => { if (path === f.destination) { hooks.afterWrite = undefined; f.controller.abort(new Error('用户停止')) } }
    expect(await moveBusinessFile(f.context, f.source, f.destination)).toMatchObject({ moved: false, destinationCreated: true, sourceRetained: true })
    expect((await readFile(f.source)).length).toBe(150_000); expect((await readFile(f.destination)).length).toBe(65_536)
  })
  it('复制中源被编辑时保留新源及实际目标，不能报告移动成功', async () => {
    const f = await fixture()
    hooks.afterWrite = async path => { if (path === f.destination) { hooks.afterWrite = undefined; await writeFile(f.source, 'NEW-SOURCE') } }
    expect(await moveBusinessFile(f.context, f.source, f.destination)).toMatchObject({ moved: false, sourceRetained: true })
    expect(await readFile(f.source, 'utf8')).toBe('NEW-SOURCE'); expect((await readFile(f.destination)).length).toBeGreaterThan(0)
  })
  it('复制中目标目录项被替换时不删除源或覆盖替换后的文件', async () => {
    const f = await fixture()
    hooks.afterWrite = async path => { if (path === f.destination) { hooks.afterWrite = undefined; await rename(path, `${path}.partial`); await writeFile(path, 'OTHER') } }
    expect(await moveBusinessFile(f.context, f.source, f.destination)).toMatchObject({ moved: false, sourceRetained: true })
    expect((await readFile(f.source)).length).toBe(150_000); expect(await readFile(f.destination, 'utf8')).toBe('OTHER')
  })
  it('搜索使用宿主已经核对的成果字节，不在返回前重新打开被外改原件', async () => {
    const f = await fixture(), file = join(f.allowed, 'artifact.txt'); await writeFile(file, 'needle TRUSTED')
    let changed = false
    const context = { signal: f.controller.signal,
      canAccessTaskPath: async (path: string) => path !== file || !changed,
      readTaskFile: async (path: string) => {
        if (path !== file) return null
        await writeFile(file, 'needle UNTRUSTED'); changed = true
        return { content: 'needle TRUSTED' }
      },
    }
    const result = await searchTaskFiles(context, f.allowed, 'needle', { business: false, recursive: true, caseSensitive: false, logicalPath: 'shared:/artifacts' })
    expect(result.matches).toMatchObject([{ path: 'shared:/artifacts/artifact.txt', excerpt: 'needle TRUSTED' }])
    expect(JSON.stringify(result)).not.toContain('UNTRUSTED'); expect(await readFile(file, 'utf8')).toBe('needle UNTRUSTED')
  })
  it('搜索报告真实截断/二进制跳过且不绕过逐路径授权', async () => {
    const f = await fixture(); await writeFile(join(f.allowed, 'matches.md'), Array.from({ length: 120 }, (_, index) => `needle ${index}`).join('\n'))
    await writeFile(join(f.allowed, 'binary.bin'), Buffer.from([0, 255, 10])); await writeFile(join(f.allowed, 'denied.md'), 'needle PRIVATE')
    const context = { signal: f.controller.signal, canAccessTaskPath: async (path: string) => !path.endsWith('/denied.md') }
    const result = await searchTaskFiles(context, f.allowed, 'needle', { business: true, recursive: true, caseSensitive: false, logicalPath: f.allowed })
    expect(result).toMatchObject({ truncated: true, skippedFiles: 1, skippedUnauthorized: 1 }); expect(result.matches).toHaveLength(100)
    expect(result.matches.some(match => match.excerpt.includes('PRIVATE'))).toBe(false)
  })
})
