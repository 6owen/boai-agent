/*
 * [OUTPUT]: 2026-10-29 个人候选嵌入Sparkle与公钥；重编译桥接并从校验过的Electron ZIP保留framework链接。
 * [OUTPUT]: 应用与评估编译按当前工作区公开exports解析，保留原执行与分发合同。
 * [INPUT]: 明确版本/SHA、干净源码及完整原构建配置；本机macOS arm64，共用清单接受规范化路径。
 * [OUTPUT]: 旧进程排空后隔离ad-hoc候选、实际链接与可取消hash/身份/签名；仅built，不授发布或安装资格。
 * [POS]: 个人候选构建；不创建Tag/Release、不替换应用或个人数据，产物冒烟另行核对。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, copyFile, chmod, lstat, readdir, readlink, realpath } from 'node:fs/promises'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { tmpdir, userInfo } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'
import { verifyReleaseSource } from './release-check.mjs'
import { sourceIdentity } from './ui-regression.mjs'
import { verifyBuildIdentity } from './build-identity.mjs'
import buildProcessGuard from './build-process-guard.mjs'
import { acquireResourceLock } from './resource-lock.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
export function personalMacConfiguration(metadata, { output, version, sha }) {
  verifyReleaseSource({ version, sha, metadata, current: { sha, dirty: false } })
  return {
    ...metadata.build, extends: null, directories: { ...metadata.build.directories, output },
    artifactName: 'BoAI-Agent-${version}-macos-${arch}.${ext}',
    mac: { ...metadata.build.mac, target: ['dmg', 'zip'], identity: '-', hardenedRuntime: false, notarize: false },
    extraMetadata: { ...metadata.build.extraMetadata, boaiRelease: { version: 1, channel: 'personal-macos-arm64', sha, applicationVersion: version, arch: 'arm64' } },
  }
}
export async function releaseFile(path, { signal } = {}) {
  signal?.throwIfAborted()
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('候选资产须为普通文件')
  const hash = createHash('sha256'); for await (const bytes of createReadStream(path, { signal })) hash.update(bytes)
  return { bytes: info.size, sha256: hash.digest('hex') }
}
export async function bundleInventory(directory) {
  directory = resolve(directory)
  const rootInfo = await lstat(directory)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('候选bundle根目录须为真实目录')
  const base = directory, canonical = await realpath(directory), files = []
  const walk = async directory => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const path = join(directory, entry.name), key = path.slice(base.length + 1), info = await lstat(path)
      if (info.isSymbolicLink()) {
        const target = await readlink(path), destination = resolve(dirname(path), target)
        if (isAbsolute(target) || (destination !== base && !destination.startsWith(base + '/'))) throw new Error('候选bundle链接越出应用目录')
        const actual = await realpath(path)
        if (actual !== canonical && !actual.startsWith(canonical + '/')) throw new Error('候选bundle链接越出应用目录')
        files.push({ path: key, type: 'link', target, mode: info.mode & 0o777 })
      }
      else if (info.isDirectory()) await walk(path)
      else if (info.isFile()) files.push({ path: key, type: 'file', mode: info.mode & 0o777, ...await releaseFile(path) })
      else throw new Error('候选bundle含特殊文件')
    }
  }
  await walk(directory)
  return files
}
export async function drainReleaseCandidates(directory, helpers) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('候选原件目录不是普通目录')
    const previous = join(directory, entry.name), ledger = await lstat(join(previous, 'processes')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!ledger) continue
    if (!ledger.isDirectory() || ledger.isSymbolicLink()) throw new Error('候选进程账本不是普通目录')
    const guard = join(previous, 'process-guard'), info = await lstat(guard)
    if (!info.isFile() || info.isSymbolicLink() || !(info.mode & 0o111)) throw new Error('旧候选缺少实际进程监督器，不能重建')
    await helpers.drainPendingProcesses(previous, guard)
  }
}
export function assertPersonalBundle({ plist, architectures, signature, version }) {
  if (plist?.CFBundleIdentifier !== 'com.boai.agent' || plist.CFBundleShortVersionString !== version || plist.CFBundleVersion !== version || !plist.CFBundleExecutable || /[/\\]/.test(plist.CFBundleExecutable)) throw new Error('候选bundle身份或版本不匹配')
  if (architectures.trim() !== 'arm64' || !/^Signature=adhoc$/m.test(signature) || !/^TeamIdentifier=not set$/m.test(signature) || /^CodeDirectory.*\bruntime\b/m.test(signature)) throw new Error('候选须为arm64/ad-hoc且无hardened runtime，不冒充Developer ID')
}
export async function buildRelease(version, sha) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.16.0') throw new Error('个人候选仅支持已登记的macOS arm64/Node24.16.0')
  const source = await sourceIdentity(root), metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const identity = verifyReleaseSource({ version, sha, current: { sha: source.commit, dirty: source.dirty }, metadata })
  // CI and watcher exclusion prevents a different checkout/build from taking the
  // same workspace while these bytes are assembled. No desktop app is stopped.
  const releases = [], controller = new AbortController(), cancel = () => controller.abort()
  const directory = join(root, '.local/release-candidates', randomUUID()), result = { version: 1, status: 'failed', identity, source, startedAt: new Date().toISOString(), errors: [], authority: 'candidate only; smoke, main CI, tag, publication and installation not qualified' }
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel)
  try {
    releases.push(acquireResourceLock(join(tmpdir(), `boai-ci-watch-${userInfo().uid}.sqlite`)))
    releases.push(acquireResourceLock(join(tmpdir(), 'boai-local-ci.sqlite')))
    controller.signal.throwIfAborted()
    if (JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(source)) throw new Error('领取构建锁期间源码变化')
    await mkdir(directory, { recursive: true })
    await build({ stdin: { contents: "export {repairProcess,saveProcess} from './tests/evaluation/repair-process.ts';export {drainPendingProcesses} from './scripts/development/recovery.ts'", resolveDir: root }, outfile: join(directory, 'process.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
    const helpers = await import(pathToFileURL(join(directory, 'process.mjs')).href)
    await drainReleaseCandidates(dirname(directory), helpers)
    controller.signal.throwIfAborted(); await buildProcessGuard()
    // Keep an immutable supervisor outside dist before pnpm build replaces dist.
    const guard = join(directory, 'process-guard'); await copyFile(join(root, 'dist/native/boai-process-guard'), guard); await chmod(guard, 0o700)
    const step = async (id, command, args, timeoutMs) => {
      console.log(`个人候选 ${id}`)
      const receipt = await helpers.repairProcess({ command, args, cwd: root, timeoutMs, signal: controller.signal, managed: { guard, ledger: join(directory, 'processes') }, capture: { directory, prefix: id } })
      await helpers.saveProcess(directory, id, receipt)
      if (receipt.failure || receipt.exitCode !== 0) throw new Error(`${id}失败：${receipt.failure ?? receipt.exitCode}`)
    }
    const { readUpdateConfig, rebuildSparkle, withSparkle, prepareElectronDist } = await import('./release-updates.mjs')
    const updates = await readUpdateConfig()
    await rebuildSparkle()
    const config = withSparkle(personalMacConfiguration(metadata, { output: join(directory, 'assets'), version, sha }), updates), path = join(directory, 'builder.json')
    config.electronDist = await prepareElectronDist(join(directory, 'electron-dist'))
    await save(path, config)
    await step('build', 'pnpm', ['build'], 10 * 60_000)
    result.built = await verifyBuildIdentity(root)
    await step('package', 'pnpm', ['exec', 'electron-builder', '--config', path, '--mac', 'dmg', 'zip', '--arm64', '--publish', 'never'], 30 * 60_000)
    const app = join(directory, 'assets/mac-arm64/BoAI Agent.app')
    const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { encoding: 'utf8', timeout: 10_000 }))
    if (!plist.CFBundleExecutable || /[/\\]/.test(plist.CFBundleExecutable)) throw new Error('候选可执行文件名称不合法')
    const architectures = execFileSync('lipo', ['-archs', join(app, 'Contents/MacOS', plist.CFBundleExecutable)], { encoding: 'utf8', timeout: 10_000 })
    await step('signature-verify', '/usr/bin/codesign', ['--verify', '--deep', '--strict', app], 2 * 60_000)
    // codesign display is normally stderr, so capture it explicitly.
    const display = await helpers.repairProcess({ command: '/usr/bin/codesign', args: ['--display', '--verbose=4', app], cwd: root, timeoutMs: 10_000, signal: controller.signal, managed: { guard, ledger: join(directory, 'processes') }, capture: { directory, prefix: 'signature-display' } })
    await helpers.saveProcess(directory, 'signature-display', display)
    if (display.failure || display.exitCode !== 0) throw new Error('签名身份读取失败')
    assertPersonalBundle({ plist, architectures, signature: display.stdout + display.stderr, version })
    const assets = []
    for (const extension of ['dmg', 'zip']) {
      const name = `BoAI-Agent-${version}-macos-arm64.${extension}`, info = await releaseFile(join(directory, 'assets', name))
      if (!info.bytes) throw new Error('候选资产不能为空')
      assets.push({ name, ...info })
    }
    result.assets = assets; result.app = app; result.plist = plist; result.architectures = architectures.trim()
    await save(join(directory, 'bundle-files.json'), await bundleInventory(app))
    if (JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(source) || JSON.stringify(await verifyBuildIdentity(root)) !== JSON.stringify(result.built)) throw new Error('候选构建期间源码或dist变化')
    controller.signal.throwIfAborted(); result.status = 'built'
  } catch (error) { result.errors.push(String(error)); if (controller.signal.aborted) result.status = 'cancelled'; process.exitCode = 1 }
  finally {
    process.off('SIGTERM', cancel); process.off('SIGINT', cancel)
    result.completedAt = new Date().toISOString()
    try { await mkdir(directory, { recursive: true }); await save(join(directory, 'candidate.json'), result) }
    finally { for (const release of releases.reverse()) release() }
    console.log(`个人候选 ${result.status}: ${directory}`)
  }
  if (result.status !== 'built') throw new Error(`候选构建${result.status}: ${result.errors.join("; ")}；${directory}`)
  return directory
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}, args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    if (!['--version', '--sha'].includes(args[index]) || options[args[index]] || !args[index + 1]) throw new Error('用法：release-build.mjs --version X.Y.Z --sha 完整提交')
    options[args[index]] = args[index + 1]
  }
  if (!options['--version'] || !options['--sha']) throw new Error('必须明确候选版本与SHA')
  buildRelease(options['--version'], options['--sha']).catch(error => { console.error(String(error)); process.exitCode = 1 })
}
