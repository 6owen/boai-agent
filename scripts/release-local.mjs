/*
 * [INPUT]: Clean current main release version, local update configuration and explicit --publish.
 * [OUTPUT]: Local build/smoke, previous-release delta, signed feed; optional final publication.
 * [POS]: One local release workflow; no cloud packaging or installed-app mutation.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRelease } from './release-check.mjs'
import { buildRelease, releaseFile } from './release-build.mjs'
import { command, gh, api, releaseRepository, prepareUpdates, readUpdateConfig } from './release-updates.mjs'
import { publishRelease } from './release-publish.mjs'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
export async function localRelease(publish = false) {
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')), sha = command('git', ['rev-parse', 'HEAD'])
  await readUpdateConfig()
  await checkRelease(metadata.version, sha)
  const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${releaseRepository}/releases?per_page=100`)).flat()
  const previous = releases.filter(row => !row.draft && !row.prerelease && /^v\d+\.\d+\.\d+$/.test(row.tag_name)).sort((a, b) => b.tag_name.localeCompare(a.tag_name, 'en', { numeric: true }))[0]
  const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }
  if (previous && compare(metadata.version, previous.tag_name.slice(1)) <= 0) throw Error('当前版本未递增，请先用bumpp更新版本')
  const directory = await buildRelease(metadata.version, sha)
  const before = new Set(await readdir(join(root, '.local/release-asset-runs')).catch(error => { if (error.code === 'ENOENT') return []; throw error }))
  command(process.execPath, ['scripts/release-smoke.mjs', '--candidate', directory], { stdio: 'inherit', timeout: 3_600_000 })
  const created = (await readdir(join(root, '.local/release-asset-runs'))).filter(name => !before.has(name))
  if (created.length !== 1) throw Error('无法唯一确定本次产物冒烟')
  const smoke = join(root, '.local/release-asset-runs', created[0])
  let previousZip, range = sha
  if (previous) {
    const release = api(`releases/${previous.id}`), asset = release.assets.find(row => row.name === `BoAI-Agent-${previous.tag_name.slice(1)}-macos-arm64.zip`)
    if (asset) {
      const cache = join(directory, 'previous'); await mkdir(cache)
      command('gh', ['release', 'download', previous.tag_name, '--repo', releaseRepository, '--pattern', asset.name, '--dir', cache], { timeout: 600_000 })
      previousZip = join(cache, asset.name)
      const info = await releaseFile(previousZip)
      if (info.bytes !== asset.size || asset.digest !== `sha256:${info.sha256}`) throw Error('上一版ZIP校验失败')
    }
    command('git', ['fetch', 'origin', `refs/tags/${previous.tag_name}:refs/tags/${previous.tag_name}`])
    range = `${previous.tag_name}..${sha}`
  }
  const notes = command('git', ['log', '--no-merges', '--format=- %s', range]) || '- 维护更新'
  const prepared = await prepareUpdates(directory, previousZip, { notes })
  if (publish) await publishRelease(prepared, smoke)
  else console.log(`准备完成，发布命令：pnpm release:publish ${JSON.stringify(prepared)} ${JSON.stringify(smoke)}`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--publish')) throw Error('用法：pnpm release:local [--publish]')
  localRelease(process.argv.includes('--publish')).catch(error => { console.error(String(error)); process.exitCode = 1 })
}
