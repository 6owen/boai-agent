/*
 * [INPUT]: Isolated SQLite profiles, real executable/package bytes and original verification records.
 * [OUTPUT]: Compiled identity stays bound to loaded code despite later builds; uncompiled inventory remains unknown, with zero executable launches.
 * [POS]: Runtime inventory provenance and read-only regression checks; verification versions are fixtures.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import mastraPackage from '@mastra/core/package.json' with { type: 'json' }
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { LaunchProfiles } from '../packages/runtime/src/modules/backends/profiles'
import { RuntimePlugins } from '../packages/runtime/src/modules/backends/runtime-plugins'
import { runtimeVersions } from '../packages/runtime/src/modules/backends/versions'
import { bundledRuntimePlugins } from '../packages/shared/src/plugins/runtime-catalog'
import { buildWorkspace as build } from '../scripts/workspace-packages.mjs'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-versions-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const bundle = join(root, 'bundle'); await mkdir(bundle)
  const plugins = new RuntimePlugins(join(root, 'plugins'), bundle); await plugins.init()
  const profiles = new LaunchProfiles(store, plugins); await profiles.init()
  return { root, store, bundle, plugins, profiles }
}

it('reports the loaded application inputs rather than a later dist identity or caller mutation', async () => {
  const f = await fixture(), compiled = { version: '0.2.4-fixture', inputHash: 'a'.repeat(64) }
  const output = await build({ stdin: { contents: "export { runtimeVersions } from './packages/runtime/src/modules/backends/versions'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __BOAI_APPLICATION_BUILD__: JSON.stringify(compiled) } })
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`)
  await mkdir(join(f.root, 'dist'))
  await writeFile(join(f.root, 'dist/build-identity.json'), JSON.stringify({ inputHash: 'b'.repeat(64) }))
  const value = await loaded.runtimeVersions(f.profiles, f.plugins, [])
  expect(value.application).toEqual({ ...compiled, source: 'compiled-inputs' })
  expect((await runtimeVersions(f.profiles, f.plugins, [])).application).toEqual({ version: null, inputHash: null, source: 'unknown' })
  value.application.inputHash = 'changed-by-caller'
  expect((await loaded.runtimeVersions(f.profiles, f.plugins, [])).application.inputHash).toBe(compiled.inputHash)
})

it.each(['acp', 'codex-app-server', 'claude-cli'] as const)('%s versions stay unknown until verified, invalidate changed/missing files and never launch the program', async protocol => {
  const f = await fixture(), marker = join(f.root, 'should-never-run'), executable = join(f.root, 'private-program.cjs')
  const bytes = `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')\n`
  await writeFile(executable, bytes, { mode: 0o700 })
  const profile = await f.profiles.save({ name: 'Private launch name', executable, args: protocol === 'acp' ? ['private-argument'] : [], protocol, useExistingLogin: false, hostAccessAcknowledged: true })
  const kind = ({ acp: 'acp-local', 'codex-app-server': 'codex-local', 'claude-cli': 'claude-local' } as const)[protocol]
  const agents = [{ id: 'employee-z', executionBackend: { kind, profileId: profile.id } }, { id: 'employee-a', executionBackend: { kind, profileId: profile.id } }] as const
  const query = () => runtimeVersions(f.profiles, f.plugins, [...agents])
  expect((await query()).programs[0]).toMatchObject({ version: null, source: 'unknown', availability: 'available', employeeIds: ['employee-a', 'employee-z'] })
  const verified = { name: 'fixture', version: '7.8.9-fixture', protocolVersion: 1, checkedAt: '2026-10-18T00:00:00.000Z' }
  await f.profiles.verified(profile.id, profile.revision, verified)
  const original = await f.store.load('launchProfiles'), known = await query()
  expect(known).toMatchObject({ node: process.versions.node, mastra: { version: mastraPackage.version, source: 'installed-package' } })
  expect(known.programs[0]).toMatchObject({ version: verified.version, source: 'verified-program', lastVerification: { version: verified.version, checkedAt: verified.checkedAt } })
  const serialized = JSON.stringify(known)
  for (const hidden of [f.root, 'Private launch name', 'private-argument', 'executableHash']) expect(serialized).not.toContain(hidden)
  await writeFile(executable, `${bytes}// changed\n`)
  expect((await query()).programs[0]).toMatchObject({ version: null, source: 'unknown', availability: 'changed', lastVerification: { version: verified.version } })
  await rm(executable)
  expect((await query()).programs[0]).toMatchObject({ version: null, source: 'unknown', availability: 'unavailable', lastVerification: { version: verified.version } })
  expect(await f.store.load('launchProfiles')).toEqual(original)
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('reports disabled installed package versions without acquiring a lease and rejects changed package bytes', async () => {
  const f = await fixture(), source = join(f.root, 'source'); await mkdir(source)
  const manifest = { ...bundledRuntimePlugins[0], id: 'test.versions', version: '3.2.1' }
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(source, 'LICENSE'), 'Isolated test fixture')
  await writeFile(join(source, 'pi.mjs'), 'throw new Error("inventory must not import a driver")')
  const catalog = await f.plugins.install(source, 0), registered = catalog.plugins.find(item => item.manifest.id === manifest.id)!
  const ref = { pluginId: manifest.id, providerId: 'pi', packageHash: registered.packageHash }
  await f.plugins.setEnabled(manifest.id, false, catalog.revision)
  const original = f.plugins.snapshot(), saved = await readFile(join(f.root, 'plugins/registry.json'))
  const query = () => runtimeVersions(f.profiles, f.plugins, [])
  expect((await query()).plugins[0]).toMatchObject({ id: manifest.id, version: '3.2.1', source: 'verified-package', enabled: false, inUse: 0 })
  await expect(f.plugins.acquire(ref)).rejects.toThrow('停用')
  await writeFile(join(f.root, 'plugins/packages', registered.packageHash, 'pi.mjs'), '// changed')
  expect((await query()).plugins[0]).toMatchObject({ version: null, registeredVersion: '3.2.1', source: 'unknown' })
  expect(f.plugins.snapshot()).toEqual(original)
  expect(await readFile(join(f.root, 'plugins/registry.json'))).toEqual(saved)
})

it('checks bundled driver bytes too, without changing the original package lease', async () => {
  const f = await fixture()
  await writeFile(join(f.bundle, 'pi.mjs'), 'throw new Error("must not run")')
  await f.plugins.init()
  const row = f.plugins.snapshot().plugins[0], ref = { pluginId: row.manifest.id, providerId: 'pi', packageHash: row.packageHash }
  const lease = await f.plugins.acquire(ref); cleanup.push(() => lease.release())
  expect((await runtimeVersions(f.profiles, f.plugins, [])).plugins[0]).toMatchObject({ version: row.manifest.version, source: 'verified-package', inUse: 1 })
  await writeFile(join(f.bundle, 'pi.mjs'), '// modified')
  expect((await runtimeVersions(f.profiles, f.plugins, [])).plugins[0]).toMatchObject({ version: null, source: 'unknown', inUse: 1 })
  await expect(f.plugins.acquire(ref)).rejects.toThrow('文件已变化')
  lease.release(); expect(f.plugins.snapshot().plugins[0].inUse).toBe(0)
})
