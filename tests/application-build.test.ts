/*
 * [INPUT]: 真实应用编排与受控编译/资源复制边界。
 * [OUTPUT]: 客户端隔离、完整CLI资源闭包、Electron兼容输出和失败身份回归；不启动产品。
 * [POS]: 第26组应用独立构建合同。
 * [PROTOCOL]: 修改同步tests/.folder.md及第26组03。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const steps = vi.hoisted(() => ({
  compile: vi.fn(), plugins: vi.fn(), guard: vi.fn(), desktop: vi.fn(), icon: vi.fn(), design: vi.fn(), renderer: vi.fn(),
  copyFile: vi.fn(), cp: vi.fn(), mkdir: vi.fn(), rm: vi.fn(), readFile: vi.fn(), hash: vi.fn(), invalidate: vi.fn(), record: vi.fn(),
}))
vi.mock('../scripts/workspace-packages.mjs', () => ({ buildWorkspace: steps.compile, workspaceRoot: '/fixture/workspace' }))
vi.mock('../scripts/build-runtime-plugins.mjs', () => ({ buildRuntimePlugins: steps.plugins }))
vi.mock('../scripts/build-process-guard.mjs', () => ({ default: steps.guard }))
vi.mock('../scripts/build-desktop-activity.mjs', () => ({ default: steps.desktop }))
vi.mock('../scripts/build-app-icon.mjs', () => ({ default: steps.icon }))
vi.mock('../scripts/design-packages.mjs', () => ({ buildDesign: steps.design }))
vi.mock('vite', () => ({ build: steps.renderer }))
vi.mock('node:fs/promises', () => ({ copyFile: steps.copyFile, cp: steps.cp, mkdir: steps.mkdir, rm: steps.rm, readFile: steps.readFile }))
vi.mock('../scripts/build-identity.mjs', () => ({ buildInputHash: steps.hash, invalidateBuildIdentity: steps.invalidate, recordBuildIdentity: steps.record }))
// @ts-expect-error Plain Node build entry intentionally has no declaration file.
import { buildApplication, buildHost, parseBuildArguments } from '../scripts/build.mjs'

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process, 'chdir').mockImplementation(() => {})
  steps.hash.mockResolvedValue('same-input')
  steps.readFile.mockImplementation(async (path: string) => {
    if (path === 'package.json') return JSON.stringify({ version: '0.2.4' })
    if (path === 'resources/agent-skills/manifest.json') return JSON.stringify({ skills: ['fixture-skill'] })
    if (path.endsWith('app-icon-manifest.json')) return JSON.stringify({ icons: [{ id: 'avatar-blue', tray: { oneX: 'tray/avatar-blueTemplate.png', twoX: 'tray/avatar-blueTemplate@2x.png' } }] })
    if (path.endsWith('/SKILL.md')) return '# Fixture skill'
    throw new Error(`Unexpected build input: ${path}`)
  })
})
afterEach(() => { vi.restoreAllMocks() })
const outputs = () => steps.compile.mock.calls.map(([options]) => options.outfile).sort()
const copied = () => [...steps.cp.mock.calls, ...steps.copyFile.mock.calls].map(([, target]) => target)

it('轻客户端仅生成客户端和员工工具及原来源许可，不调用服务/桌面构建', async () => {
  await buildApplication('cli-client')
  expect(outputs()).toEqual(['dist/cli/employee-tools.mjs', 'dist/cli/index.mjs'])
  expect(copied()).toEqual(['dist/cli/LICENSE.txt', 'dist/cli/NOTICE.txt', 'dist/cli/source-manifest.json'])
  for (const step of [steps.guard, steps.plugins, steps.desktop, steps.icon, steps.design, steps.renderer, steps.record]) expect(step).not.toHaveBeenCalled()
  expect(steps.invalidate).toHaveBeenCalledWith('/fixture/workspace')
  expect(process.chdir).toHaveBeenCalledWith('/fixture/workspace')
  for (const [options] of steps.compile.mock.calls) expect(JSON.parse(options.define.__BOAI_APPLICATION_BUILD__)).toEqual({ version: '0.2.4', inputHash: 'same-input' })
})

it('完整CLI包含serve与插件/guard/PPT/技能/语音/许可闭包，不依赖Electron或设计包构建', async () => {
  await buildApplication('cli')
  expect(outputs()).toEqual(['dist/cli/employee-tools.mjs', 'dist/cli/index.mjs', 'dist/runtime/serve.mjs'])
  expect(steps.plugins).toHaveBeenCalledOnce()
  expect(steps.guard).toHaveBeenCalledOnce()
  expect(copied()).toEqual(expect.arrayContaining([
    'dist/runtime/alma', 'dist/agent-skills/fixture-skill', 'dist/agent-skills/manifest.json', 'dist/capabilities/voice',
    'dist/runtime/rovai-channels-LICENSE.txt', 'dist/runtime/rovai-channels-source-manifest.json',
    'dist/runtime/hermes-file-tools-LICENSE.txt', 'dist/runtime/hermes-file-tools-source-manifest.json',
    'dist/cli/LICENSE.txt', 'dist/cli/NOTICE.txt', 'dist/cli/source-manifest.json',
  ]))
  for (const step of [steps.desktop, steps.icon, steps.design, steps.renderer, steps.record]) expect(step).not.toHaveBeenCalled()
  const runtime = steps.compile.mock.calls.find(([options]) => options.outfile === 'dist/runtime/serve.mjs')?.[0]
  expect(runtime).toMatchObject({ packages: 'external', entryPoints: ['packages/runtime/src/serve.ts'] })
})

it('默认Electron构建保留完整闭包、原路径、许可与最终全量身份', async () => {
  await buildApplication()
  expect(outputs()).toEqual([
    'dist/cli/employee-tools.mjs', 'dist/cli/index.mjs', 'dist/main/browser-toolbar-preload.cjs', 'dist/main/main.cjs', 'dist/main/preload.cjs', 'dist/runtime/serve.mjs', 'dist/runtime/worker.mjs',
  ])
  for (const step of [steps.guard, steps.plugins, steps.desktop, steps.icon, steps.design, steps.renderer]) expect(step).toHaveBeenCalledOnce()
  expect(steps.renderer).toHaveBeenCalledWith({ configFile: '/fixture/workspace/vite.config.ts' })
  expect(copied()).toEqual(expect.arrayContaining([
    'dist/main/app-icons/avatar-blue.png', 'dist/main/app-icons/tray/avatar-blueTemplate.png', 'dist/main/app-icons/tray/avatar-blueTemplate@2x.png',
    'dist/main/local-configs-LICENSE.txt', 'dist/main/local-configs-NOTICE.txt', 'dist/main/browser-LICENSE.txt', 'dist/main/browser-NOTICE.txt', 'dist/main/browser-source-manifest.json',
    'dist/renderer/craft-scenic-LICENSE.txt', 'dist/renderer/craft-scenic-NOTICE.txt', 'dist/renderer/craft-scenic-source-manifest.json',
    'dist/renderer/BASE46-LICENSE.txt', 'dist/renderer/Geist-OFL.txt', 'dist/renderer/LobeIcons-LICENSE.txt',
  ]))
  expect(steps.record).toHaveBeenCalledWith('same-input', '/fixture/workspace')
  expect(steps.record.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...steps.copyFile.mock.invocationCallOrder))
})

it('开发兼容buildHost只准备host和完整CLI闭包，Renderer交给Vite且不登记完整构建', async () => {
  await buildHost()
  expect(outputs()).toContain('dist/runtime/worker.mjs')
  expect(outputs()).toContain('dist/runtime/serve.mjs')
  expect(steps.renderer).not.toHaveBeenCalled()
  expect(steps.record).not.toHaveBeenCalled()
})

it('编译失败前已清旧全量资格，失败不会登记新资格', async () => {
  steps.compile.mockRejectedValueOnce(new Error('compile failed'))
  await expect(buildApplication('cli')).rejects.toThrow('compile failed')
  expect(steps.invalidate.mock.invocationCallOrder[0]).toBeLessThan(steps.compile.mock.invocationCallOrder[0])
  expect(steps.record).not.toHaveBeenCalled()
})

it('构建期间输入变化被拒绝，不能登记全量资格', async () => {
  steps.hash.mockResolvedValueOnce('first-input').mockResolvedValue('changed-input')
  await expect(buildApplication()).rejects.toThrow(/源码或资源变化/)
  expect(steps.renderer).not.toHaveBeenCalled()
  expect(steps.record).not.toHaveBeenCalled()
})

it('无效目标与参数在写产物前失败，默认目标和三个显式目标保持稳定', async () => {
  expect(parseBuildArguments([])).toBe('electron')
  for (const target of ['electron', 'cli', 'cli-client']) expect(parseBuildArguments(['--app', target])).toBe(target)
  for (const args of [['--app', 'web'], ['--app'], ['--other'], ['--app', 'cli', '--other']]) expect(() => parseBuildArguments(args)).toThrow('Usage')
  await expect(buildApplication('web')).rejects.toThrow('Unknown application')
  expect(steps.invalidate).not.toHaveBeenCalled()
  expect(steps.compile).not.toHaveBeenCalled()
})
