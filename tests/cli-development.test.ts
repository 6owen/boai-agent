/*
 * [INPUT]: CLI开发入口与受控子进程事件。
 * [OUTPUT]: 显式范围/原参数/工作区目录/退出码及信号转发回归；不执行产品命令。
 * [POS]: CLI独立开发编排测试。
 * [PROTOCOL]: 修改同步tests/.folder.md及第26组03。
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const steps = vi.hoisted(() => ({ build: vi.fn(), spawn: vi.fn() }))
vi.mock('../scripts/build.mjs', () => ({ buildCli: steps.build }))
vi.mock('../scripts/workspace-packages.mjs', () => ({ workspaceRoot: '/fixture/workspace' }))
vi.mock('node:child_process', () => ({ spawn: steps.spawn }))
// @ts-expect-error Plain Node development entry intentionally has no declaration file.
import { cliDevelopmentArguments, runCliDevelopment } from '../scripts/dev-cli.mjs'

let child: EventEmitter & { kill: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.resetAllMocks()
  child = Object.assign(new EventEmitter(), { kill: vi.fn() })
  steps.spawn.mockReturnValue(child)
})
afterEach(() => { vi.restoreAllMocks() })

it('无参数只显示帮助，轻客户端标志不传入真实CLI，原参数保留', () => {
  expect(cliDevelopmentArguments([])).toEqual({ clientOnly: false, args: ['--help'] })
  expect(cliDevelopmentArguments(['--client-only'])).toEqual({ clientOnly: true, args: ['--help'] })
  expect(cliDevelopmentArguments(['--', 'serve', '--user-data-dir', '/profile path'])).toEqual({ clientOnly: false, args: ['serve', '--user-data-dir', '/profile path'] })
  expect(cliDevelopmentArguments(['--client-only', '--', 'status', '--json'])).toEqual({ clientOnly: true, args: ['status', '--json'] })
})

it('构建所选范围后从当前工作区启动原CLI，并保留失败退出码', async () => {
  const result = runCliDevelopment(['--client-only', '--', 'status', '--json'])
  await Promise.resolve()
  expect(steps.build).toHaveBeenCalledWith({ clientOnly: true })
  expect(steps.spawn).toHaveBeenCalledWith(process.execPath, ['/fixture/workspace/dist/cli/index.mjs', 'status', '--json'], { cwd: '/fixture/workspace', stdio: 'inherit', env: process.env })
  child.emit('exit', 7, null)
  await expect(result).resolves.toBe(7)
})

it('构建失败不启动CLI，不掩盖缺少服务资源', async () => {
  steps.build.mockRejectedValue(new Error('missing skill'))
  await expect(runCliDevelopment(['serve'])).rejects.toThrow('missing skill')
  expect(steps.spawn).not.toHaveBeenCalled()
})

it('信号只转发本入口子进程，退出后撤销监听并保留中断退出状态', async () => {
  const before = process.listeners('SIGTERM')
  const result = runCliDevelopment([])
  await Promise.resolve()
  const handler = process.listeners('SIGTERM').find(listener => !before.includes(listener))
  expect(handler).toBeDefined()
  handler?.('SIGTERM')
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  child.emit('exit', null, 'SIGTERM')
  await expect(result).resolves.toBe(143)
  expect(process.listeners('SIGTERM')).toEqual(before)
})

it('进程启动错误原样返回并移除监听器', async () => {
  const before = process.listeners('SIGINT')
  const result = runCliDevelopment([])
  await Promise.resolve()
  child.emit('error', new Error('spawn failed'))
  await expect(result).rejects.toThrow('spawn failed')
  expect(process.listeners('SIGINT')).toEqual(before)
})
