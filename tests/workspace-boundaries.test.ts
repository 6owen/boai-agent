/*
 * [OUTPUT]: 团队规划接口归宿主合同；普通网关请求身份由共享的模型选择和调用记录生成。
 * [OUTPUT]: 本机协议与宿主命令复用进程组实际退出屏障，独立原生传输可单独装载。
 * [OUTPUT]: Every new cross-directory value cycle fails, including when an obsolete migration file is present.
 * [OUTPUT]: 跨目录但不形成文件环的业务依赖按逐方向清单核对，延迟和类型引用不计。
 * [OUTPUT]: 机器依赖图沿真实解析目标区分类型、静态/延迟、CommonJS 和公开重导出。
 * [OUTPUT]: 浏览器宿主入口经间接/延迟导入执行器或 Electron 也会在构建前被拒绝。
 * [INPUT]: A minimal workspace using real package names, the build resolver and CI checker.
 * [OUTPUT]: Runtime cycles, manifest direction and private imports fail while type and lazy edges work.
 * [POS]: Contract tests for pnpm check:workspace without the application build.
 * [PROTOCOL]: Update this header and tests/.folder.md when changing this contract.
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it('checks package manifests and actual module initialization against the same development exports as the bundle', async () => {
  // Node resolves the real parser from this worktree while all fixture files remain isolated.
  const scratch = resolve('.local')
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'workspace-boundaries-'))
  const avatar = join(root, 'packages/avatar-motion')
  const app = join(root, 'apps/electron')
  const manifest = {
    name: '@6owen/avatar-motion',
    exports: { '.': { types: './src/index.d.ts', default: './src/index.js' } },
  }
  const check = (...options: string[]) => execFileSync(process.execPath, ['scripts/check-workspace-boundaries.mjs', ...options], {
    cwd: root, stdio: 'pipe', encoding: 'utf8',
  })
  try {
    for (const directory of [join(root, 'scripts'), join(app, 'src'), join(avatar, 'src')]) {
      await mkdir(directory, { recursive: true })
    }
    for (const script of ['workspace-packages.mjs', 'runtime-module-dependencies.mjs', 'check-workspace-boundaries.mjs']) {
      await copyFile(resolve('scripts', script), join(root, 'scripts', script))
    }
    await writeFile(join(app, 'package.json'), JSON.stringify({
      name: '@boai/electron', dependencies: { '@6owen/avatar-motion': 'workspace:*' },
    }))
    await writeFile(join(avatar, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(avatar, 'src/index.d.ts'), 'export type Frame = number')
    await writeFile(join(avatar, 'src/index.js'), 'export const frame = 1')
    await writeFile(join(app, 'src/main.ts'), "import '@6owen/avatar-motion'; import './view'; export type State = number")
    const view = join(app, 'src/view.ts')
    await writeFile(view, "import { type State } from './main'; export const load = () => import('./main')")
    expect(check()).toContain('passed')
    const graph = () => JSON.parse(check('--graph')) as {
      runtimeModules: { dependencies: Record<string, string[]>; cycleGroups: string[][] }
      packages: { name: string; dependencies: string[]; exports: Record<string, string> }[]
      files: { path: string; workspace: string; imports: { line: number; kind: string; specifier: string; target?: string }[] }[]
    }
    const report = graph()
    expect(report.packages.find(item => item.name === '@boai/electron')?.dependencies).toEqual(['@6owen/avatar-motion'])
    expect(report.packages.find(item => item.name === '@6owen/avatar-motion')?.exports['@6owen/avatar-motion']).toBe('packages/avatar-motion/src/index.js')
    expect(report.files.find(item => item.path === 'apps/electron/src/view.ts')?.imports).toEqual([
      { line: 1, kind: 'type', specifier: './main', target: 'apps/electron/src/main.ts' },
      { line: 1, kind: 'dynamic', specifier: './main', target: 'apps/electron/src/main.ts' },
    ])
    await writeFile(view, "export * from '@6owen/avatar-motion'\nconst fs = require('node:fs')")
    expect(graph().files.find(item => item.path === 'apps/electron/src/view.ts')?.imports).toEqual([
      { line: 1, kind: 'reexport', specifier: '@6owen/avatar-motion', target: 'packages/avatar-motion/src/index.js' },
      { line: 2, kind: 'require', specifier: 'node:fs' },
    ])
    await writeFile(view, "export * from './main'")
    expect(check).toThrow(/static import cycle: .*main\.ts -> .*view\.ts -> .*main\.ts/)
    await writeFile(view, "import '@6owen/avatar-motion/src/index.js'")
    expect(check).toThrow(/unresolved public export @6owen\/avatar-motion\/src\/index.js/)
    await writeFile(view, '')
    const runtime = join(root, 'packages/runtime')
    await mkdir(join(runtime, 'src/adapters'), { recursive: true })
    await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: '@boai/runtime', exports: { './browser': './src/browser.ts' } }))
    await writeFile(join(runtime, 'src/browser.ts'), "export * from './commands'")
    await writeFile(join(runtime, 'src/adapters/example.ts'), 'export const adapter = true')
    const commands = join(runtime, 'src/commands.ts')
    await writeFile(commands, "export const load = () => import('./adapters/example')")
    expect(check).toThrow(/browser host entry reaches packages\/runtime\/src\/adapters\/example/)
    await writeFile(commands, "import '@mastra/core/agent'")
    expect(check).toThrow(/browser host entry reaches @mastra\/core\/agent/)
    await writeFile(commands, "import 'electron/main'")
    expect(check).toThrow(/browser host entry reaches electron\/main/)
    await writeFile(commands, "import type { BrowserWindow } from 'electron'; export const parse = () => 1")
    expect(check()).toContain('passed')

    const modules = join(runtime, 'src/modules')
    for (const domain of ['one', 'two', 'three']) {
      await mkdir(join(modules, domain), { recursive: true })
      await writeFile(join(modules, domain, 'value.ts'), 'export const value = 1')
    }
    await writeFile(join(modules, 'one/use.ts'), "import '../two/value'")
    await writeFile(join(modules, 'two/use.ts'), "export * from '../three/value'")
    const third = join(modules, 'three/use.ts')
    await writeFile(third, "export type T = typeof import('../one/value'); export const later = () => import('../one/value')")
    expect(graph().runtimeModules.cycleGroups).toEqual([])
    await writeFile(third, "const value = require('../one/value')")
    expect(check).toThrow(/three.use\.ts: line 1 runtime module cycle edge: three -> one/)
    // A legacy migration file must never permit a cycle, even when it lists every edge.
    await writeFile(join(root, 'scripts/runtime-module-cycle-debt.json'), JSON.stringify({ one: ['two'], two: ['three'], three: ['one'] }))
    expect(check).toThrow(/runtime module cycle edge: three -> one; group: one, three, two/)
    await writeFile(third, "import '../one/value'; import '../two/value'")
    expect(check).toThrow(/runtime module cycle edge: three -> two/)
    await writeFile(third, '')
    expect(graph().runtimeModules).toEqual({ dependencies: { one: ['two'], three: [], two: ['three'] }, cycleGroups: [] })

    await writeFile(join(avatar, 'package.json'), JSON.stringify({
      ...manifest, dependencies: { '@boai/electron': 'workspace:*' },
    }))
    expect(check).toThrow(/forbidden dependency @6owen\/avatar-motion -> @boai\/electron/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.each([
  'adapters/codex/client',
  'adapters/claude/process',
  'modules/teams/team-generation',
])('keeps the model SDK out of the standalone %s bundle', async entry => {
  const result = await build({
    entryPoints: [`packages/runtime/src/${entry}.ts`], bundle: true, platform: 'node',
    format: 'esm', target: 'node22', packages: 'external', write: false, metafile: true,
  })
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports)
  expect(imports.filter(item => item.path.startsWith('@mastra/'))).toEqual([])
})
