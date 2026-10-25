/*
 * [INPUT]: External directory packages, standalone generator and existing RuntimePlugins installation transaction.
 * [OUTPUT]: Offline preflight without execution, package diagnostics, protected generation and original CAS/hash/lease checks.
 * [POS]: Focused external development contract; no model, GUI or real user profile.
 * [PROTOCOL]: Update tests/.folder.md and workspace spec 04 with changes.
 */
import { afterEach, expect, test } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkPlugin, createPlugin } from '../scripts/runtime-plugin-devkit.mjs'
import { RuntimePlugins } from '../packages/runtime/src/modules/backends/runtime-plugins'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(source = 'export const runtimeApiVersion = 2; export const createRuntime = () => ({})') {
  const root = await mkdtemp(join(tmpdir(), 'boai-plugin-devkit-')); roots.push(root)
  const directory = join(root, 'package'); await mkdir(directory)
  const manifest = JSON.parse(await readFile(resolve('examples/runtime-plugins/text-inspector/manifest.json'), 'utf8'))
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  await copyFile(resolve('examples/runtime-plugins/text-inspector/LICENSE.txt'), join(directory, 'LICENSE.txt'))
  await writeFile(join(directory, 'plugin.mjs'), source)
  return { root, directory, manifest }
}

test('preflight returns the original install hash without executing a module, and install remains CAS/lease protected', async () => {
  const f = await fixture()
  const marker = join(f.root, 'must-not-exist')
  await writeFile(join(f.directory, 'plugin.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export const runtimeApiVersion = 2; export const createRuntime = () => ({})`)
  const checked = await checkPlugin(f.directory)
  expect(checked).toMatchObject({ id: 'example.text-inspector', runtimeApiVersion: 2, runtimeLoaded: false, files: 3 })
  await expect(readFile(marker)).rejects.toThrow()
  const registry = join(f.root, 'registry'), bundle = join(f.root, 'empty-bundle')
  const manager = new RuntimePlugins(registry, bundle); await manager.init()
  const installed = await manager.install(f.directory, 0)
  expect(installed.plugins[0].packageHash).toBe(checked.packageHash)
  await expect(manager.install(f.directory, 0)).rejects.toThrow('插件列表已变化')
  const restarted = new RuntimePlugins(registry, bundle); await restarted.init()
  expect(restarted.snapshot().plugins[0].packageHash).toBe(checked.packageHash)
  const ref = { pluginId: checked.id, providerId: 'text-inspector', packageHash: checked.packageHash }
  const lease = await restarted.acquire(ref)
  await expect(restarted.uninstall(checked.id, 1)).rejects.toThrow('仍在执行')
  lease.release()
  await writeFile(join(lease.root, 'plugin.mjs'), 'changed')
  await expect(restarted.verifyPackage(ref)).rejects.toThrow('文件已变化')
  await expect(readFile(marker)).rejects.toThrow()
})

test.each([
  ['unsupported manifest API', 'api', ''],
  ['missing license', 'license', ''],
  ['missing entry', 'entry', ''],
  ['missing provider export', 'module', 'export const runtimeApiVersion = 2'],
  ['unbundled dependency', 'module', "import x from 'not-a-bundled-provider'; export const runtimeApiVersion = 2; export const createRuntime = () => x"],
] as const)('preflight rejects %s', async (_name, kind, source) => {
  const f = await fixture()
  if (kind === 'api') { f.manifest.apiVersion = 3; await writeFile(join(f.directory, 'manifest.json'), JSON.stringify(f.manifest)) }
  if (kind === 'license') await rm(join(f.directory, 'LICENSE.txt'))
  if (kind === 'entry') await rm(join(f.directory, 'plugin.mjs'))
  if (kind === 'module') await writeFile(join(f.directory, 'plugin.mjs'), source)
  await expect(checkPlugin(f.directory)).rejects.toThrow()
})

test('preflight rejects symlinks and relative module dependencies outside the package', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'outside.mjs'), 'export default 1')
  await symlink(join(f.root, 'outside.mjs'), join(f.directory, 'linked.mjs'))
  await expect(checkPlugin(f.directory)).rejects.toThrow('符号链接')
  await rm(join(f.directory, 'linked.mjs'))
  await writeFile(join(f.directory, 'plugin.mjs'), "import x from '../outside.mjs'; export const runtimeApiVersion = 2; export const createRuntime = () => x")
  await expect(checkPlugin(f.directory)).rejects.toThrow('必须在插件包内')
})

test('generator refuses an existing directory and copies a supplied SDK artifact into a new standalone project', async () => {
  const f = await fixture(), target = join(f.root, 'external-project')
  await expect(createPlugin(f.directory)).rejects.toThrow()
  expect(JSON.parse(await readFile(join(f.directory, 'manifest.json'), 'utf8')).id).toBe(f.manifest.id)
  const tarball = join(f.root, 'boai-runtime-plugin-sdk-0.1.0.tgz')
  await writeFile(tarball, 'fixture artifact bytes')
  const result = await createPlugin(target, { sdk: { tarball, sdkDirectory: f.root, name: '@boai/runtime-plugin-sdk', version: '0.1.0' } })
  expect(result.packageDirectory).toBe(join(target, 'package'))
  expect(await readFile(join(target, 'vendor', 'boai-runtime-plugin-sdk-0.1.0.tgz'), 'utf8')).toBe('fixture artifact bytes')
  const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
  const workspace = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
  expect(manifest.packageManager).toBe(workspace.packageManager)
  expect(manifest.devDependencies['@boai/runtime-plugin-sdk']).toBe('file:./vendor/boai-runtime-plugin-sdk-0.1.0.tgz')
  expect(JSON.stringify(manifest)).not.toContain('workspace:')
  expect(JSON.stringify(manifest)).not.toContain(resolve('.'))
  await expect(readFile(join(target, 'package', 'manifest.json'))).rejects.toThrow()
})
