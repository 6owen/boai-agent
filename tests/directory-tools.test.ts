/*
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [INPUT]: 原生产品工具、运行目录授权与真实临时目录/符号链接。
 * [OUTPUT]: 独立申请不认领Work，等待/拒绝/取消/只读/完全权限及目标替换不扩大授权。
 * [POS]: 共用目录工具与原生产品装配回归；宿主持久事务及安装CLI分别验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { DigitalAgent } from '../packages/shared/src/domain'
import type { DirectoryAccessRequest } from '../packages/shared/src/domain/directory-access'
import { createNativeProducts } from '../packages/runtime/src/adapters/native-products'
import { createDirectoryRequestOperation } from '../packages/runtime/src/modules/workspaces/directory-tool'
import { RunDirectoryAccess } from '../packages/runtime/src/modules/workspaces/directory-run'
import { isWithinDirectory, type DirectoryTarget } from '../packages/runtime/src/modules/workspaces/directory-access'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture(permission: DigitalAgent['executionPermission'] = 'ask') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-directory-tool-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const coding = join(root, 'coding'), reports = join(root, 'reports'), data = join(root, 'data')
  for (const dir of [coding, reports, data]) await mkdir(dir)
  await writeFile(join(reports, 'original.txt'), 'original')
  const controller = new AbortController(), agent = { id: 'employee-a', configVersion: 1, skillIds: [], knowledgeIds: [], executionPermission: permission, allowCommands: false, directoryGrants: [{ path: coding, access: 'read-write' }] } as unknown as DigitalAgent
  const request = vi.fn(async (_request: DirectoryAccessRequest, _target: DirectoryTarget, _signal: AbortSignal) => true), validate = vi.fn(async () => {})
  const access = new RunDirectoryAccess(agent, { signal: controller.signal, request, validate, protectedRoots: [data], assertTarget: async target => { if (isWithinDirectory(data, target.path)) throw new Error('BOAI受管文件未授权') } })
  const ensureNativeWork = vi.fn(async () => { throw new Error('Permission-only request must not claim Work') }), onTool = vi.fn<EngineContext['onTool']>(async () => {}), onExecutionEvent = vi.fn(async () => {})
  const context = { agent, signal: controller.signal, directoryAccess: access, resources: [], messages: [], conversation: { id: 'chat-a', kind: 'direct', resourceIds: [] }, ensureNativeWork, onTool, onExecutionEvent } as unknown as EngineContext
  const products = createNativeProducts(context), tool = products.tools.find(tool => tool.name === 'request_directory')!
  cleanups.push(async () => { controller.abort(); access.close(); await products.dispose() })
  const call = (directory = reports, requested: 'read-only' | 'read-write' = 'read-only') => tool.execute({ directory, access: requested, reason: '查阅本次报告' }, `call-${onTool.mock.calls.length}`)
  return { root, coding, reports, data, agent, controller, access, request, validate, context, tool, call, ensureNativeWork, onTool, onExecutionEvent }
}

it('未配置目录的旧员工或缺少运行授权不提供工具，完全权限仍可使用', async () => {
  const f = await fixture()
  f.agent.directoryGrants = undefined
  expect(createDirectoryRequestOperation(f.context)).toBeUndefined()
  f.agent.executionPermission = 'full-access'
  expect(createDirectoryRequestOperation(f.context)).toBeDefined()
  expect(createDirectoryRequestOperation({ ...f.context, directoryAccess: undefined })).toBeUndefined()
})

it.each(['ask', 'full-access'] as const)('已有或完全权限直接返回核验结果，不认领Work或给予命令许可：%s', async permission => {
  const f = await fixture(permission), directory = permission === 'ask' ? f.coding : f.reports
  expect(f.tool.inputSchema).toMatchObject({ type: 'object', required: ['directory', 'access', 'reason'] })
  expect(await f.call(directory, 'read-write')).toEqual({ directory, access: 'read-write', authorized: true })
  expect(f.request).not.toHaveBeenCalled(); expect(f.ensureNativeWork).not.toHaveBeenCalled()
  expect(f.context.work).toBeUndefined(); expect(f.agent.allowCommands).toBe(false)
  expect(f.onTool.mock.calls).toHaveLength(2); expect(f.onTool.mock.calls[1]?.[0]).toMatchObject({ name: 'request_directory', status: 'completed' })
})

it('批准前没有新许可；只读批准后升级读写须单独批准，其他运行不继承', async () => {
  const f = await fixture()
  let release!: (allowed: boolean) => void
  f.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const pending = f.call()
  await expect.poll(() => f.request.mock.calls.length).toBe(1)
  expect(await f.access.allows(f.reports, 'read')).toBe(false)
  expect(f.onTool.mock.calls).toHaveLength(1)
  release(true); await expect(pending).resolves.toMatchObject({ authorized: true })
  await f.call(); expect(f.request).toHaveBeenCalledOnce()
  expect(await f.access.allows(f.reports, 'write')).toBe(false)
  await f.call(f.reports, 'read-write'); expect(f.request).toHaveBeenCalledTimes(2)
  expect(f.access.temporaryGrants).toEqual([{ path: f.reports, access: 'read-write' }])
  const next = new RunDirectoryAccess(f.agent, { signal: f.controller.signal, request: f.request, validate: f.validate, assertTarget: async () => {} })
  expect(await next.allows(f.reports, 'read')).toBe(false); next.close()
  expect(f.agent.directoryGrants).toEqual([{ path: f.coding, access: 'read-write' }]); expect(f.ensureNativeWork).not.toHaveBeenCalled()
})

it('只读员工可申请读取但不能通过目录申请取得写权限', async () => {
  const f = await fixture('read-only')
  await f.call(); await expect(f.call(f.reports, 'read-write')).rejects.toThrow('只读')
  expect(f.request).toHaveBeenCalledOnce(); expect(await f.access.allows(f.reports, 'write')).toBe(false)
  expect(f.ensureNativeWork).not.toHaveBeenCalled()
})

it.each(['deny', 'cancel', 'closed'] as const)('拒绝或运行退出不能返回成功或保留临时授权：%s', async kind => {
  const f = await fixture()
  f.request.mockImplementationOnce(async () => {
    if (kind === 'cancel') f.controller.abort(new Error('用户停止'))
    if (kind === 'closed') f.access.close()
    return kind !== 'deny'
  })
  await expect(f.call()).rejects.toThrow(kind === 'deny' ? '拒绝' : kind === 'cancel' ? '用户停止' : '结束')
  expect(f.access.temporaryGrants).toEqual([]); expect(f.ensureNativeWork).not.toHaveBeenCalled()
  expect(f.onTool.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'failed' })
})

it('链接按真实目录批准，受管数据不能借业务目录申请扩权', async () => {
  const f = await fixture(), alias = join(f.coding, 'alias')
  await symlink(f.reports, alias)
  expect(await f.call(alias)).toMatchObject({ directory: f.reports })
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({ directory: f.reports, target: f.reports })
  await expect(f.call(f.data)).rejects.toThrow('BOAI受管')
  expect(f.request).toHaveBeenCalledOnce()
})

it('文件、缺失路径和队列中被换成文件的目标不会申请父目录', async () => {
  const f = await fixture()
  for (const target of ['relative', join(f.reports, 'original.txt'), join(f.reports, 'missing')]) await expect(f.call(target, 'read-write')).rejects.toThrow()
  f.validate.mockImplementationOnce(async () => { await rename(f.reports, `${f.reports}-old`); await writeFile(f.reports, 'replacement-file') })
  await expect(f.call(f.reports, 'read-write')).rejects.toThrow('实际存在')
  expect(f.request).not.toHaveBeenCalled(); expect(f.access.temporaryGrants).toEqual([])
})

it('审批期间目标替换后拒绝旧批准，不把新目录当成原授权', async () => {
  const f = await fixture()
  f.request.mockImplementationOnce(async () => { await rename(f.reports, `${f.reports}-old`); await mkdir(f.reports); return true })
  await expect(f.call()).rejects.toThrow('变化')
  expect(f.access.temporaryGrants).toEqual([]); expect(f.ensureNativeWork).not.toHaveBeenCalled()
})


it.each(['codex-local','claude-local','runtime-plugin'] as const)('本机%s不装配BOAI目录申请工具，即使保留API目录字段', async kind=>{
 const f=await fixture();f.agent.executionBackend=kind==='runtime-plugin'?{kind,profileId:'native',pluginId:'test.native',providerId:'native'}:{kind,profileId:'native'}
 expect(createDirectoryRequestOperation(f.context)).toBeUndefined()
 const products=createNativeProducts(f.context)
 try {expect(products.tools.some(tool=>tool.name==='request_directory')).toBe(false)}finally{await products.dispose()}
 expect(f.request).not.toHaveBeenCalled()
})
