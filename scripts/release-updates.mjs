/*
 * [INPUT]: Local Sparkle toolchain, per-app Keychain key, verified candidate and previous release ZIP.
 * [OUTPUT]: Packaged update metadata and signed full/delta appcast; immutable publication manifest.
 * [POS]: Personal macOS update preparation; never replaces the installed application.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdir, readdir, copyFile, lstat } from 'node:fs/promises'
import { sparkleBuilderConfig } from 'electron-sparkle-updater/builder'
import { releaseFile, bundleInventory } from './release-build.mjs'

export const releaseRepository = '6owen/boai-agent'
export const releaseFeed = `https://github.com/${releaseRepository}/releases/latest/download/appcast.xml`
export const keyAccount = 'com.boai.agent.updates'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(import.meta.url)
export const sparkleRoot = dirname(dirname(require.resolve('electron-sparkle-updater')))
export const sparkleBin = join(sparkleRoot, 'native/vendor/bin')
export const settingsPath = () => process.env.BOAI_RELEASE_CONFIG || join(homedir(), 'Library/Application Support/BoAI Release/settings.json')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
export const command = (exe, args, options = {}) => (execFileSync(exe, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, ...options }) ?? '').trim()
export const gh = (...args) => command('gh', args)
export const api = path => JSON.parse(gh('api', `repos/${releaseRepository}${path ? `/${path}` : ''}`))
export function validateUpdateConfig(value) {
  const url = new URL(value.feedUrl)
  if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('更新地址须为HTTPS或隔离测试的loopback')
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value.publicKey)) throw Error('缺少有效Sparkle公钥，请先运行 pnpm release:setup')
  return { feedUrl: url.href, publicKey: value.publicKey }
}
export async function readUpdateConfig() { return validateUpdateConfig(await json(settingsPath())) }
export async function rebuildSparkle() {
  const metadata = await json(join(root, 'package.json'))
  command('pnpm', ['exec', 'electron-sparkle-updater', 'rebuild', '--electron-version', metadata.devDependencies.electron, '--arch', 'arm64'], { stdio: 'inherit', timeout: 300_000 })
}
export async function prepareElectronDist(directory) {
  // pnpm side-effect caches can materialize framework symlinks as directories.
  // Build from Electron's checksum-pinned ZIP, preserving its canonical symlinks.
  const electronRequire = createRequire(require.resolve('electron/package.json'))
  const { downloadArtifact } = electronRequire('@electron/get')
  const { version } = electronRequire('./package.json')
  const archive = await downloadArtifact({ version, artifactName: 'electron', platform: 'darwin', arch: 'arm64', checksums: electronRequire('./checksums.json'), cacheRoot: join(root, '.local/electron-downloads'), downloader: {
    download: (url, target) => new Promise((accept, reject) => execFile('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20', '--max-time', '300', '--output', target, url], { timeout: 310_000 }, error => error ? reject(error) : accept())),
  } })
  await mkdir(directory)
  command('/usr/bin/ditto', ['-x', '-k', archive, directory], { timeout: 300_000 })
  return directory
}
export async function setupUpdates() {
  if (process.platform !== 'darwin') throw Error('个人发布需要macOS')
  await rebuildSparkle()
  const tool = join(sparkleBin, 'generate_keys')
  // The official tool reuses the account's existing key; no private key is exported.
  command(tool, ['--account', keyAccount], { stdio: 'inherit' })
  const publicKey = command(tool, ['--account', keyAccount, '-p'])
  const file = settingsPath(), previous = await json(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (previous && previous.publicKey !== publicKey) throw Error('已有发布公钥不匹配；不能静默轮换密钥')
  const config = validateUpdateConfig({ feedUrl: previous?.feedUrl ?? releaseFeed, publicKey })
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  console.log(`更新配置已就绪：${file}；私钥保留在钥匙串。`)
}
export function withSparkle(config, updates) {
  const fragment = sparkleBuilderConfig({ feedUrl: updates.feedUrl, publicEdKey: updates.publicKey, localizations: ['en', 'zh_CN'], deltaHistory: 0 })
  return {
    ...config,
    files: [...(config.files ?? []), ...fragment.files],
    asarUnpack: [...(config.asarUnpack ?? []), ...fragment.asarUnpack],
    extraFiles: [...(config.extraFiles ?? []), ...fragment.extraFiles, { from: 'resources/Sparkle-LICENSE.txt', to: 'Resources/Sparkle-LICENSE.txt' }],
    // electron-builder 26 has no top-level zip option; its unused blockmap is not published.
    dmg: { ...config.dmg, ...fragment.dmg },
    mac: { ...config.mac, minimumSystemVersion: '12.0', extendInfo: { ...config.mac?.extendInfo, ...fragment.mac.extendInfo } },
    extraMetadata: { ...config.extraMetadata, boaiRelease: { ...config.extraMetadata?.boaiRelease, updates } },
  }
}
export async function verifyCandidate(directory) {
  const candidate = await json(join(directory, 'candidate.json'))
  if (candidate.status !== 'built' || !candidate.identity?.sha || !candidate.plist?.SUPublicEDKey) throw Error('候选尚未构建或未启用更新')
  for (const asset of candidate.assets) {
    if (basename(asset.name) !== asset.name || JSON.stringify(await releaseFile(join(directory, 'assets', asset.name))) !== JSON.stringify({ bytes: asset.bytes, sha256: asset.sha256 })) throw Error('候选资产已变化')
  }
  if (JSON.stringify(await bundleInventory(candidate.app)) !== await readFile(join(directory, 'bundle-files.json'), 'utf8').then(text => JSON.stringify(JSON.parse(text)))) throw Error('候选bundle已变化')
  return candidate
}
export async function prepareUpdates(directory, previousZip, { edKeyFile, notes, downloadPrefix } = {}) {
  if (typeof notes !== 'string' || !notes.trim()) throw Error('发布须提供更新说明')
  directory = resolve(directory)
  const candidate = await verifyCandidate(directory), version = candidate.identity.version
  const output = join(directory, 'updates')
  await mkdir(output) // a prepared version is never silently overwritten
  const zip = candidate.assets.find(asset => asset.name.endsWith('.zip'))
  await copyFile(join(directory, 'assets', zip.name), join(output, zip.name))
  if (previousZip) {
    if (!(await lstat(previousZip)).isFile() || !basename(previousZip).endsWith('.zip') || basename(previousZip) === zip.name) throw Error('增量基包须为不同版本的已发布ZIP')
    await copyFile(previousZip, join(output, basename(previousZip)))
  }
  const releaseNotes = notes
  await writeFile(join(output, zip.name.replace(/\.zip$/, '.md')), releaseNotes)
  const prefix = downloadPrefix ?? `https://github.com/${releaseRepository}/releases/download/v${version}/`
  const args = [output, '--download-url-prefix', prefix, '--embed-release-notes', '--maximum-deltas', '1', '--maximum-versions', '1', '--versions', version]
  args.push(...(edKeyFile ? ['--ed-key-file', edKeyFile] : ['--account', keyAccount]))
  command(join(sparkleBin, 'generate_appcast'), args, { stdio: 'inherit', timeout: 600_000 })
  const appcast = join(output, 'appcast.xml'), xml = await readFile(appcast, 'utf8')
  if (!xml.includes(`>${version}</sparkle:version>`) || !xml.includes('sparkle:edSignature=')) throw Error('生成的更新索引缺版本或签名')
  const names = (await readdir(output)).filter(name => name === 'appcast.xml' || name === zip.name || name.endsWith('.delta'))
  for (const asset of candidate.assets.filter(asset => asset.name.endsWith('.dmg'))) { await copyFile(join(directory, 'assets', asset.name), join(output, asset.name)); names.push(asset.name) }
  const assets = []
  for (const name of names.sort()) assets.push({ name, ...await releaseFile(join(output, name)) })
  await writeFile(join(output, 'update-manifest.json'), JSON.stringify({ version: 1, identity: candidate.identity, assets }, null, 2) + '\n')
  assets.push({ name: 'update-manifest.json', ...await releaseFile(join(output, 'update-manifest.json')) })
  await writeFile(join(output, 'SHA256SUMS'), assets.map(asset => `${asset.sha256}  ${asset.name}`).join('\n') + '\n')
  assets.push({ name: 'SHA256SUMS', ...await releaseFile(join(output, 'SHA256SUMS')) })
  const manifest = { version: 1, identity: candidate.identity, candidate: directory, publicKey: candidate.plist.SUPublicEDKey, feedUrl: candidate.plist.SUFeedURL, previousZip: previousZip ? basename(previousZip) : null, delta: assets.some(asset => asset.name.endsWith('.delta')), assets, notes: releaseNotes }
  await writeFile(join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`更新准备完成：${output}；${manifest.delta ? '含增量包' : '完整包（首版或差分不适用）'}`)
  return output
}
export async function verifyPrepared(directory) {
  const manifest = await json(join(directory, 'release.json'))
  const candidate = await verifyCandidate(manifest.candidate)
  if (JSON.stringify(candidate.identity) !== JSON.stringify(manifest.identity) || candidate.plist.SUPublicEDKey !== manifest.publicKey || candidate.plist.SUFeedURL !== manifest.feedUrl) throw Error('发布清单与候选身份不符')
  for (const asset of manifest.assets) {
    if (basename(asset.name) !== asset.name || JSON.stringify(await releaseFile(join(directory, asset.name))) !== JSON.stringify({ bytes: asset.bytes, sha256: asset.sha256 })) throw Error('待发布资产已变化')
  }
  for (const original of candidate.assets) {
    if (!manifest.assets.some(asset => asset.name === original.name && asset.sha256 === original.sha256 && asset.bytes === original.bytes)) throw Error('发布资产不等于已验证候选')
  }
  return manifest
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupUpdates().catch(error => { console.error(String(error)); process.exitCode = 1 })
}
