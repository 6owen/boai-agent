/*
 * [INPUT]: Real bumpp in isolated repositories and release metadata/hash fixtures.
 * [OUTPUT]: Stable monotonic versioning, no incidental tag/push and tampered release refusal.
 * [POS]: Personal update pipeline regressions; native installation belongs to BDD.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Node release module.
import { bumpApplicationVersion } from '../scripts/release-version.mjs'
// @ts-expect-error Node release module.
import { command, withSparkle, verifyPrepared, validateUpdateConfig, releaseFeed } from '../scripts/release-updates.mjs'
// @ts-expect-error Node release module.
import { assertPublishable } from '../scripts/release-publish.mjs'
// @ts-expect-error Node release module.
import { releaseFile, bundleInventory } from '../scripts/release-build.mjs'
const updates = { feedUrl: releaseFeed, publicKey: Buffer.alloc(32, 8).toString('base64') }
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
it('bumpp updates app/build versions together without changing workspace versions, committing or tagging', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'boai-bumpp-'))
  try {
    git(cwd, 'init', '-q')
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'probe', version: '0.2.4', build: { buildVersion: '0.2.4' } }) + '\n')
    await mkdir(join(cwd, 'child'))
    const child = JSON.stringify({ name: 'internal', version: '0.0.1' }); await writeFile(join(cwd, 'child/package.json'), child)
    git(cwd, 'add', '--', 'package.json', 'child/package.json')
    git(cwd, '-c', 'user.name=BOAI Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
    const head = git(cwd, 'rev-parse', 'HEAD')
    await bumpApplicationVersion('patch', { cwd, interactive: false })
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))).toMatchObject({ version: '0.2.5', build: { buildVersion: '0.2.5' } })
    expect(await readFile(join(cwd, 'child/package.json'), 'utf8')).toBe(child)
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head); expect(git(cwd, 'tag')).toBe('')
    const modified = await readFile(join(cwd, 'package.json'), 'utf8')
    await expect(bumpApplicationVersion('0.3.0-beta.1', { cwd, interactive: false })).rejects.toThrow('稳定版本')
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(modified)
    git(cwd, 'add', '--', 'package.json'); git(cwd, '-c', 'user.name=BOAI Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'bump')
    await expect(bumpApplicationVersion('0.2.3', { cwd, interactive: false })).rejects.toThrow('递增稳定')
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(modified)
  } finally { await rm(cwd, { recursive: true, force: true }) }
})
it('preserves existing bundle resources/native unpacking and embeds matching Sparkle identity', () => {
  const config = withSparkle({ files: ['dist/**'], asarUnpack: ['dist/native/**'], extraFiles: [{ from: 'old', to: 'old' }], mac: { identity: '-', hardenedRuntime: false, extendInfo: { Old: true } }, extraMetadata: { boaiRelease: { sha: 'a'.repeat(40) } } }, updates)
  expect(config.files).toContain('dist/**'); expect(config.asarUnpack).toContain('dist/native/**')
  expect(config.mac).toMatchObject({ identity: '-', hardenedRuntime: false, minimumSystemVersion: '12.0', extendInfo: { Old: true, SUFeedURL: updates.feedUrl, SUPublicEDKey: updates.publicKey, SUDeltaChainHistory: 0 } })
  expect(config.extraMetadata.boaiRelease).toEqual({ sha: 'a'.repeat(40), updates })
})
it('refuses credentials, insecure remote feeds and missing update keys', () => {
  for (const feedUrl of ['http://example.test/feed', 'https://a:b@example.test/feed']) expect(() => validateUpdateConfig({ ...updates, feedUrl })).toThrow()
  expect(() => validateUpdateConfig({ ...updates, publicKey: 'bad' })).toThrow()
  expect(validateUpdateConfig(updates)).toEqual(updates)
})
it('ties publication to the same version/source and production feed', () => {
  const manifest = { identity: { version: '0.2.5', sha: 'a'.repeat(40) }, feedUrl: releaseFeed, assets: ['appcast.xml', 'SHA256SUMS', 'app.zip', 'app.dmg'].map(name => ({ name, bytes: 20, sha256: 'd'.repeat(64) })) }
  const smoke = { version: '0.2.5', sha: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), assets: manifest.assets.slice(2) }
  expect(() => assertPublishable(manifest, smoke)).not.toThrow()
  expect(() => assertPublishable(manifest, { ...smoke, assets: smoke.assets.map(asset => ({ ...asset, sha256: 'e'.repeat(64) })) })).toThrow('待发布字节')
  expect(() => assertPublishable(manifest, { ...smoke, sha: 'c'.repeat(40) })).toThrow()
  expect(() => assertPublishable({ ...manifest, feedUrl: 'http://127.0.0.1/feed' }, smoke)).toThrow()
  expect(() => assertPublishable({ ...manifest, assets: manifest.assets.slice(1) }, smoke)).toThrow()
})
it('rejects changed prepared assets and changed underlying candidate bundle bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-update-assets-'))
  try {
    const app = join(root, 'app'), prepared = join(root, 'updates'); await mkdir(app); await mkdir(prepared); await mkdir(join(root, 'assets'))
    await writeFile(join(app, 'main'), 'bundle')
    const name = 'app.zip', identity = { version: '0.2.5', sha: 'a'.repeat(40), tag: 'v0.2.5' }
    await writeFile(join(root, 'assets', name), 'archive'); await writeFile(join(prepared, name), 'archive')
    const assets = [{ name, ...await releaseFile(join(prepared, name)) }]
    await writeFile(join(root, 'candidate.json'), JSON.stringify({ status: 'built', identity, app, assets, plist: { SUPublicEDKey: updates.publicKey, SUFeedURL: updates.feedUrl } }))
    await writeFile(join(root, 'bundle-files.json'), JSON.stringify(await bundleInventory(app)))
    await writeFile(join(prepared, 'release.json'), JSON.stringify({ identity, candidate: root, assets, ...updates }))
    await expect(verifyPrepared(prepared)).resolves.toMatchObject({ identity })
    await writeFile(join(prepared, name), 'tampered')
    await expect(verifyPrepared(prepared)).rejects.toThrow('资产已变化')
    await writeFile(join(prepared, name), 'archive'); await writeFile(join(app, 'main'), 'tampered')
    await expect(verifyPrepared(prepared)).rejects.toThrow('bundle已变化')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('accepts successful inherited stdio and still surfaces a nonzero child exit', () => {
  expect(command(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'inherit' })).toBe('')
  expect(() => command(process.execPath, ['-e', 'process.exit(3)'])).toThrow()
})

it('matches the installed electron-builder schema rather than forwarding unsupported upstream zip options', async () => {
  const require = createRequire(import.meta.url), builder = createRequire(require.resolve('electron-builder'))
  const { validateConfiguration } = builder('app-builder-lib/out/util/config/config')
  const metadata = JSON.parse(await readFile('package.json', 'utf8'))
  const config = withSparkle(metadata.build, updates)
  await expect(validateConfiguration(config, { isEnabled: false })).resolves.toBeUndefined()
})

it('explicit packaging proxy inheritance never brings model credentials into the child', async () => {
  const { repairProcess } = await import('./evaluation/repair-process')
  const controller = new AbortController()
  const receipt = await repairProcess({ command: process.execPath, args: ['-e', 'console.log(JSON.stringify({http:!!process.env.HTTP_PROXY,https:!!process.env.HTTPS_PROXY,model:!!process.env.OPENAI_API_KEY||!!process.env.CODEX_API_KEY}))'], cwd: process.cwd(), timeoutMs: 5000, signal: controller.signal, networkProxy: true })
  expect(receipt.exitCode).toBe(0); expect(receipt.failure).toBeUndefined()
  expect(JSON.parse(receipt.stdout)).toEqual({ http: !!process.env.HTTP_PROXY, https: !!process.env.HTTPS_PROXY, model: false })
})
