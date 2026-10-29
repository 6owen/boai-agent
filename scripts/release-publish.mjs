/*
 * [INPUT]: Prepared signed assets, verified packaged smoke evidence and current main Test.
 * [OUTPUT]: Exact-source v tag and complete GitHub Release; existing releases never clobbered.
 * [POS]: Explicit local publication entry point, separate from candidate preparation.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { checkRelease } from './release-check.mjs'
import { verifyReleaseSmoke } from './release-smoke.mjs'
import { verifyPrepared, command, gh, api, releaseRepository, releaseFeed } from './release-updates.mjs'

export function assertPublishable(manifest, smoke) {
  if (manifest.feedUrl !== releaseFeed || smoke.sha !== manifest.identity.sha || smoke.version !== manifest.identity.version || !smoke.manifestSha256) throw Error('更新源或产物冒烟不属于本次发布')
  const names = manifest.assets.map(asset => asset.name)
  if (new Set(names).size !== names.length || !['appcast.xml', 'SHA256SUMS'].every(name => names.includes(name)) || !names.some(name => name.endsWith('.zip')) || !names.some(name => name.endsWith('.dmg'))) throw Error('发布资产不完整')
}
export async function publishRelease(directory, smokeDirectory) {
  directory = resolve(directory)
  const manifest = await verifyPrepared(directory), smoke = await verifyReleaseSmoke(smokeDirectory)
  assertPublishable(manifest, smoke)
  const { version, sha, tag } = manifest.identity
  await checkRelease(version, sha)
  if (api('').private) throw Error('当前更新源需要公开Release，不向应用写入GitHub凭据')
  const remoteTag = JSON.parse(gh('api', `repos/${releaseRepository}/git/matching-refs/tags/${tag}`)).find(ref => ref.ref === `refs/tags/${tag}`)
  if (remoteTag) {
    const commit = remoteTag.object.type === 'tag' ? api(`git/tags/${remoteTag.object.sha}`).object.sha : remoteTag.object.sha
    if (commit !== sha) throw Error('同名tag已经指向不同提交')
  }
  const existing = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${releaseRepository}/releases?per_page=100`)).flat().find(release => release.tag_name === tag)
  if (existing) throw Error(`Release ${tag} 已存在；保留原件，请核对远程状态，不自动覆盖或重发。`)
  // All checks precede the first remote write; verify once more immediately before tagging.
  await verifyPrepared(directory); await checkRelease(version, sha)
  if (!remoteTag) gh('api', '--method', 'POST', `repos/${releaseRepository}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`)
  const notesFile = join(directory, 'release-notes.md')
  await writeFile(notesFile, `${manifest.notes}\n\n源码：${sha}\n\n本机 macOS arm64 构建；${manifest.delta ? '包含差分更新包。' : '完整更新包。'}\n`)
  const assets = manifest.assets.map(asset => join(directory, asset.name))
  command('gh', ['release', 'create', tag, ...assets, '--repo', releaseRepository, '--verify-tag', '--draft', '--title', `BoAI Agent ${tag}`, '--notes-file', notesFile], { timeout: 600_000, stdio: 'inherit' })
  const release = api(`releases/tags/${tag}`)
  for (const asset of manifest.assets) {
    const uploaded = release.assets.find(row => row.name === asset.name)
    if (!uploaded || uploaded.size !== asset.bytes || uploaded.digest !== `sha256:${asset.sha256}`) throw Error('远程资产校验失败；Release保留为draft')
  }
  await checkRelease(version, sha)
  const published = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${releaseRepository}/releases?per_page=100`)).flat().filter(row => !row.draft && !row.prerelease)
  const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }
  if (published.some(row => /^v\d+\.\d+\.\d+$/.test(row.tag_name) && compare(row.tag_name.slice(1), version) > 0)) throw Error('已有更新版本；保留draft，避免回退Latest')
  gh('release', 'edit', tag, '--repo', releaseRepository, '--draft=false', '--latest')
  const result = api(`releases/tags/${tag}`)
  if (result.draft) throw Error('发布结果尚未确认，请只读核对远程Release')
  console.log(`已发布：${result.html_url}；当前已安装应用未被替换。`)
  return result.html_url
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, smokeDirectory, ...extra] = process.argv.slice(2)
  if (!directory || !smokeDirectory || extra.length) throw Error('用法：release:publish 更新目录 产物冒烟目录')
  publishRelease(directory, smokeDirectory).catch(error => { console.error(String(error)); process.exitCode = 1 })
}
