/*
 * [INPUT]: Electron/CLI应用目标、当前worktree源码、默认技能及来源许可。
 * [OUTPUT]: 独立client/CLI/Electron闭包；仅完整Electron登记全量dist身份，保留buildHost开发兼容入口。
 * [POS]: 应用构建编排；默认全量Electron，固定原dist布局，无导入副作用。
 * [PROTOCOL]: 修改同步scripts/.folder.md及第26组03。
 */
import { buildRuntimePlugins } from './build-runtime-plugins.mjs'
import buildDesktopActivity from './build-desktop-activity.mjs'
import buildProcessGuard from './build-process-guard.mjs'
import buildAppIcon from './build-app-icon.mjs'
import { copyFile, cp, readFile, rm, mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildWorkspace as build, workspaceRoot } from './workspace-packages.mjs'
import { buildInputHash, invalidateBuildIdentity, recordBuildIdentity } from './build-identity.mjs'

const targets = ['electron', 'cli', 'cli-client']
export function parseBuildArguments(args) {
  if (args.length === 0) return 'electron'
  if (args.length === 2 && args[0] === '--app' && targets.includes(args[1])) return args[1]
  throw new Error('Usage: node scripts/build.mjs [--app electron|cli|cli-client]')
}

async function context(inputHash) {
  // Native helpers, Vite and runtime discovery share the distribution root.
  process.chdir(workspaceRoot)
  await invalidateBuildIdentity(workspaceRoot)
  const inputs = inputHash ?? await buildInputHash(workspaceRoot)
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const define = { __BOAI_APPLICATION_BUILD__: JSON.stringify({ version, inputHash: inputs }) }
  return { inputs, compile: options => build({ ...options, define }) }
}
async function assertUnchanged(inputs) {
  if (await buildInputHash(workspaceRoot) !== inputs) throw new Error('应用构建期间源码或资源变化，请重新构建后启动')
}

async function buildClient(compile) {
  const options = { bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['bufferutil', 'utf-8-validate'], sourcemap: true }
  await Promise.all([
    compile({ ...options, entryPoints: ['apps/cli/src/employee-tools.ts'], outfile: 'dist/cli/employee-tools.mjs', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } }),
    compile({ ...options, entryPoints: ['apps/cli/src/index.ts'], outfile: 'dist/cli/index.mjs', banner: { js: "#!/usr/bin/env node\nimport { createRequire as cliCreateRequire } from 'node:module'; const require = cliCreateRequire(import.meta.url);" } }),
  ])
  for (const name of ['LICENSE.txt', 'NOTICE.txt', 'source-manifest.json']) await copyFile(`packages/shared/src/cli/${name}`, `dist/cli/${name}`)
}

async function buildRuntime(compile) {
  await buildProcessGuard()
  await Promise.all([
    buildRuntimePlugins(),
    compile({ entryPoints: ['packages/runtime/src/serve.ts'], outfile: 'dist/runtime/serve.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
  await cp('packages/runtime/src/modules/presentations/alma', 'dist/runtime/alma', { recursive: true, filter: path => basename(path) !== '.folder.md' })
  const skillManifest = JSON.parse(await readFile('resources/agent-skills/manifest.json', 'utf8'))
  await Promise.all(skillManifest.skills.map(name => readFile(`resources/agent-skills/${name}/SKILL.md`, 'utf8')))
  await rm('dist/agent-skills', { recursive: true, force: true })
  await mkdir('dist/agent-skills', { recursive: true })
  for (const name of skillManifest.skills) await cp(`resources/agent-skills/${name}`, `dist/agent-skills/${name}`, { recursive: true, filter: path => basename(path) !== '.folder.md' })
  await copyFile('resources/agent-skills/manifest.json', 'dist/agent-skills/manifest.json')
  await cp('resources/capabilities/voice', 'dist/capabilities/voice', { recursive: true, filter: path => !['.folder.md', '__pycache__'].includes(basename(path)) })
  for (const [source, prefix] of [['packages/runtime/src/adapters/channels/rovai', 'rovai-channels'], ['packages/runtime/src/modules/workspaces/hermes', 'hermes-file-tools']]) {
    for (const name of ['LICENSE.txt', 'source-manifest.json']) await copyFile(`${source}/${name}`, `dist/runtime/${prefix}-${name}`)
  }
}

async function buildElectronHost(compile) {
  await buildDesktopActivity()
  await buildAppIcon()
  await Promise.all([
    compile({ entryPoints: ['apps/electron/src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@libsql/client'], sourcemap: true }),
    compile({ entryPoints: ['apps/electron/src/preload/browser-toolbar.ts'], outfile: 'dist/main/browser-toolbar-preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    compile({ entryPoints: ['apps/electron/src/preload/index.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    compile({ entryPoints: ['apps/electron/src/worker/index.ts'], outfile: 'dist/runtime/worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
  await mkdir('dist/main/app-icons/tray', { recursive: true })
  const appIconManifest = JSON.parse(await readFile('packages/shared/src/appearance/app-icon-manifest.json', 'utf8'))
  for (const icon of appIconManifest.icons) {
    await copyFile(`resources/app-icons/${icon.id}.png`, `dist/main/app-icons/${icon.id}.png`)
    for (const file of [icon.tray.oneX, icon.tray.twoX]) {
      if (!/^tray\/avatar-[a-z-]+Template(?:@2x)?\.png$/.test(file)) throw new Error(`Invalid tray asset: ${icon.id}`)
      await copyFile(`resources/app-icons/${file}`, `dist/main/app-icons/${file}`)
    }
  }
  for (const name of ['LICENSE.txt', 'NOTICE.txt']) await copyFile(`apps/electron/src/main/local-configs/${name}`, `dist/main/local-configs-${name}`)
  for (const name of ['LICENSE.txt', 'NOTICE.txt', 'source-manifest.json']) await copyFile(`apps/electron/src/main/browser/${name}`, `dist/main/browser-${name}`)
}

export async function buildCli({ inputHash, clientOnly = false } = {}) {
  const { inputs, compile } = await context(inputHash)
  await buildClient(compile)
  if (!clientOnly) await buildRuntime(compile)
  await assertUnchanged(inputs)
}

export async function buildHost({ inputHash } = {}) {
  const { inputs, compile } = await context(inputHash)
  const { buildDesign } = await import('./design-packages.mjs')
  await buildDesign()
  await buildClient(compile)
  await buildRuntime(compile)
  await buildElectronHost(compile)
  await assertUnchanged(inputs)
}

export async function buildApplication(target = 'electron') {
  if (!targets.includes(target)) throw new Error(`Unknown application build target: ${target}`)
  if (target !== 'electron') return buildCli({ clientOnly: target === 'cli-client' })
  const inputs = await buildInputHash(workspaceRoot)
  await buildHost({ inputHash: inputs })
  const { build: buildRenderer } = await import('vite')
  await buildRenderer({ configFile: resolve(workspaceRoot, 'vite.config.ts') })
  for (const name of ['LICENSE.txt', 'NOTICE.txt', 'source-manifest.json']) await copyFile(`apps/electron/src/renderer/styles/craft-scenic/${name}`, `dist/renderer/craft-scenic-${name}`)
  await copyFile('packages/shared/src/appearance/BASE46-LICENSE.txt', 'dist/renderer/BASE46-LICENSE.txt')
  await copyFile('apps/electron/src/renderer/assets/Geist-OFL.txt', 'dist/renderer/Geist-OFL.txt')
  await copyFile('apps/electron/src/renderer/assets/LobeIcons-LICENSE.txt', 'dist/renderer/LobeIcons-LICENSE.txt')
  await recordBuildIdentity(inputs, workspaceRoot)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildApplication(parseBuildArguments(process.argv.slice(2)))
}
