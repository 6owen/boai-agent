/*
 * [OUTPUT]: 浏览器宿主入口经间接/延迟导入执行器或 Electron 也会在构建前被拒绝。
 * [INPUT]: A minimal workspace using real package names, the build resolver and CI checker.
 * [OUTPUT]: Runtime cycles, manifest direction and private imports fail while type and lazy edges work.
 * [POS]: Contract tests for pnpm check:workspace without the application build.
 * [PROTOCOL]: Update this header and tests/.folder.md when changing this contract.
 */
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
  const check = () => execFileSync(process.execPath, ['scripts/check-workspace-boundaries.mjs'], {
    cwd: root, stdio: 'pipe', encoding: 'utf8',
  })
  try {
    for (const directory of [join(root, 'scripts'), join(app, 'src'), join(avatar, 'src')]) {
      await mkdir(directory, { recursive: true })
    }
    for (const script of ['workspace-packages.mjs', 'check-workspace-boundaries.mjs']) {
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

    await writeFile(join(avatar, 'package.json'), JSON.stringify({
      ...manifest, dependencies: { '@boai/electron': 'workspace:*' },
    }))
    expect(check).toThrow(/forbidden dependency @6owen\/avatar-motion -> @boai\/electron/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
