/*
 * [OUTPUT]: 2026-10-29 原ZIP8/DMG2来源校验同时核对候选中的更新feed与公钥，原冒烟断言保持。
 * [OUTPUT]: 应用与评估编译按当前工作区公开exports解析，保留原执行与分发合同。
 * [INPUT]: 当前干净源码对应的个人built候选、锁定BDD及隔离输出；已登录macOS arm64/Node24。
 * [OUTPUT]: ZIP8/DMG2原场景、逐启动完整独立profile/包身份、实际执行墙钟窗口与bundle前后字节；受管worker配对挂载/封存，未知先恢复。
 * [POS]: 个人候选产物冒烟入口；不修改基线、创建Tag/Release或替换个人应用/数据。
 * [PROTOCOL]: 修改同步Header及scripts/.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, lstat, copyFile, chmod, rm, realpath } from 'node:fs/promises'
import { join, resolve, dirname, basename, isAbsolute } from 'node:path'
import { tmpdir, userInfo } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'
import { acquireResourceLock } from './resource-lock.mjs'
import { sourceIdentity } from './ui-regression.mjs'
import { verifyBuildIdentity, sameBuildBytes } from './build-identity.mjs'
import { assertPersonalBundle, bundleInventory, releaseFile } from './release-build.mjs'
import { verifyReleaseSource } from './release-check.mjs'
import { unpackPersonalArchive } from './release-archive.mjs'
import { desktopPlanIdentity, desktopReportRows, selectDesktopCases, assertDesktopReport } from './desktop-plan.mjs'
import { recordDesktopExecution, verifyDesktopEvidence } from './desktop-evidence.mjs'
import { localCiFiles } from './local-ci.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url))), runs = join(root, '.local/release-asset-runs')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const exists = path => lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
const raw = (command, args, input) => execFileSync(command, args, { encoding: 'utf8', input, timeout: command.endsWith('hdiutil') ? 60_000 : 10_000, maxBuffer: 8 * 1024 * 1024 })
const plist = bytes => JSON.parse(raw('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], bytes))
const diskInfo = () => plist(raw('/usr/bin/hdiutil', ['info', '-plist']))

export function assertSmokeLaunch(value, { binary, version, cli, temporaryRoot }) {
  const { expected, actual, observed, profileRoot } = value
  const path = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value
  const canonical = value => {
    if (!path(value)) return null
    const alias = resolve(tmpdir())
    return value.startsWith(alias + '/') ? temporaryRoot + value.slice(alias.length) : value
  }
  if (!path(profileRoot) || dirname(profileRoot) !== temporaryRoot || !/^boai-bdd-[a-zA-Z0-9]+$/.test(basename(profileRoot)) || !path(expected?.dataDir) || expected.dataDir !== profileRoot && !expected.dataDir.startsWith(profileRoot + '/') || !path(expected.executable) || !equal(expected, actual) || canonical(observed?.dataDir) !== expected.dataDir || canonical(observed?.executable) !== expected.executable || canonical(observed?.applicationPath) !== join(dirname(dirname(expected.executable)), 'Resources/app.asar')) throw Error('逐启动profile或实际程序字段缺失、越界或不对应')
  const relocated = cli && expected.executable === join(profileRoot, "Moved ' BoAI Agent.app/Contents/MacOS/BoAI Agent")
  if ((expected.executable !== binary && !relocated) || observed.packaged !== true || observed.version !== version || !Number.isInteger(observed.pid) || observed.pid < 1) throw Error('逐启动程序、版本或packaged身份不对应')
  return { profileRoot, dataDir: expected.dataDir }
}
export async function verifySmokeBundle(app, expected) {
  const actual = await bundleInventory(app)
  if (!equal(actual, expected)) throw Error('实际产物bundle字节、模式或链接与builder不同')
  return actual
}

// Match the owned mount, never every mount of an image or a similarly named volume.
export function ownedSmokeMount(info, intent) {
  if (!Array.isArray(info?.images) || typeof intent?.mount !== 'string' || typeof intent.asset !== 'string') throw Error('DMG挂载快照或意图不完整')
  const found = info.images.filter(image => image['system-entities']?.some(row => row['mount-point'] === intent.mount))
  if (!found.length) return null
  if (found.length !== 1 || found[0]['image-path'] !== intent.asset || found[0]['system-entities'].some(row => row['mount-point'] && row['mount-point'] !== intent.mount)) throw Error('DMG挂载身份冲突，不退挂其他镜像或卷')
  return found[0]
}
export function selectSmokeCases(planBytes, inventory, kind) {
  const t1 = selectDesktopCases(desktopPlanIdentity(planBytes), inventory, 't1')
  if (kind === 'zip') {
    const ids = ['employee-create', 'api-chat-file-restart', 'native-file-chat-example-1', 'native-file-chat-example-2', 'directory-data-source-approval', 'directory-restart', 'appearance-restart', 'appearance-background']
    return ids.map(id => { const row = t1.find(row => row.id === id); if (!row) throw Error('缺少固定ZIP场景'); return row })
  }
  if (kind !== 'dmg') throw Error('未知产物场景类型')
  const titles = ['从桌面安装BOAI命令行工具', '安装命令行工具并在应用关闭后启动服务再重开卸载']
  const matches = desktopReportRows(inventory).filter(row => row.file === 'boai-cli-installation.feature' && equal(row.titles, titles))
  if (matches.length !== 1 || matches[0].tests?.length !== 1 || matches[0].tests[0].expectedStatus !== 'passed') throw Error('缺少唯一CLI安装成功场景')
  const { file, line, playwrightId } = matches[0]
  const creation = t1.find(row => row.id === 'employee-create')
  if (!creation) throw Error('缺少固定DMG创建场景')
  return [creation, { id: 'packaged-cli-installation', file, line, playwrightId, titles }]
}
async function helpers(directory) {
  const file = join(directory, 'process.mjs')
  if (!await exists(file)) await build({ stdin: { contents: "export {repairProcess,saveProcess} from './tests/evaluation/repair-process.ts';export {drainPendingProcesses} from './scripts/development/recovery.ts'", resolveDir: root }, outfile: file, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
  return import(pathToFileURL(file).href)
}
async function candidateAt(directory, signal) {
  if (dirname(directory) !== join(root, '.local/release-candidates') || (await lstat(directory)).isSymbolicLink()) throw Error('候选须为本worktree拥有的实际目录')
  const candidate = await json(join(directory, 'candidate.json')), source = await sourceIdentity(root), metadata = await json(join(root, 'package.json'))
  verifyReleaseSource({ version: candidate.identity?.version, sha: candidate.identity?.sha, metadata, current: { sha: source.commit, dirty: source.dirty } })
  if (candidate.status !== 'built' || !equal(candidate.errors, []) || !equal(candidate.source, source) || !sameBuildBytes(candidate.built, await verifyBuildIdentity(root))) throw Error('候选不是当前干净源码和构建的built结果')
  const names = ['dmg', 'zip'].map(extension => `BoAI-Agent-${candidate.identity.version}-macos-arm64.${extension}`)
  if (candidate.assets?.length !== 2 || !equal(candidate.assets.map(row => row.name).sort(), names.sort())) throw Error('候选须含唯一DMG与ZIP')
  for (const asset of candidate.assets) if (!equal(await releaseFile(join(directory, 'assets', asset.name), { signal }), { bytes: asset.bytes, sha256: asset.sha256 }) || !asset.bytes) throw Error('候选资产字节变化')
  if (candidate.app !== join(directory, 'assets/mac-arm64/BoAI Agent.app') || !equal(await bundleInventory(candidate.app), await json(join(directory, 'bundle-files.json')))) throw Error('原builder应用字节变化')
  return candidate
}
async function detachMount(directory) {
  const file = join(directory, 'dmg/mount.intent.json')
  if (!await exists(file)) return
  const intent = await json(file)
  if (intent.mount !== join(directory, 'dmg/mounted') || dirname(dirname(intent.asset ?? '')) !== intent.candidate || dirname(intent.candidate ?? '') !== join(root, '.local/release-candidates') || !intent.asset.endsWith('.dmg')) throw Error('旧DMG意图不属于本批')
  if (!ownedSmokeMount(diskInfo(), intent)) return
  if (!equal(await releaseFile(intent.asset), intent.archive)) throw Error('已挂载DMG原资产变化，保留现场')
  raw('/usr/bin/hdiutil', ['detach', intent.mount])
  if (ownedSmokeMount(diskInfo(), intent)) throw Error('DMG尚未确认退挂')
}
async function drainSmokeAssets(directory, guard, h) {
  await h.drainPendingProcesses(directory, guard)
  for (const kind of ['zip', 'dmg']) if (await exists(join(directory, kind))) await h.drainPendingProcesses(join(directory, kind), guard)
  await detachMount(directory)
}
async function recoverSmokeRuns(h) {
  for (const entry of await readdir(runs, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error('产物冒烟原件目录异常')
    const directory = join(runs, entry.name), intent = await json(join(directory, 'intent.json')), guard = join(directory, 'process-guard')
    if (intent.directory !== directory || !equal(await releaseFile(guard), intent.guard)) throw Error('旧冒烟监督器或目录身份变化')
    await h.drainPendingProcesses(join(directory, 'controller'), guard)
    await drainSmokeAssets(directory, guard, h)
  }
}
async function smokeEvidence(stage, selected, candidate, binary) {
  const report = await json(join(stage, 'playwright.json')), proof = await verifyDesktopEvidence(stage, report, selected)
  const profiles = new Set(), temporaryRoot = await realpath(tmpdir()); let launches = 0
  for (const row of proof) {
    const manifestPath = join(stage, row.manifest), manifest = await json(manifestPath)
    const facts = manifest.evidence.filter(item => item.kind === 'data' && /^第 \d+ 次实际应用包启动$/.test(item.label))
    if (facts.length !== manifest.launchCount) throw Error('逐启动实际包身份原件缺失')
    const seen = new Set(); let profile
    for (const fact of facts) {
      const value = await json(resolve(dirname(manifestPath), fact.path)), { launch } = value
      const current = assertSmokeLaunch(value, { binary, version: candidate.identity.version, cli: row.id === 'packaged-cli-installation', temporaryRoot })
      if (profile && !equal(current, profile) || !Number.isInteger(launch) || launch < 1 || launch > manifest.launchCount || seen.has(launch) || fact.launch !== launch) throw Error('实际启动profile或次数不对应')
      profile = current
      seen.add(launch)
    }
    if (!profile || profiles.has(profile.profileRoot)) throw Error('实际场景profile缺失或与其他场景共用')
    profiles.add(profile.profileRoot)
    launches += facts.length
  }
  return { proof, launches }
}
async function verifySmokeReports(directory, result, signal) {
  const intent = await json(join(directory, 'intent.json')), candidate = await candidateAt(intent.candidate, signal)
  if (result.version !== 1 || result.status !== 'passed' || !equal(result.errors, []) || !equal(result.source, candidate.source) || !equal(result.identity, candidate.identity)) throw Error('产物冒烟不是同一源码的完整成功')
  const planBytes = await readFile(join(directory, 'test-tiers.json'))
  if (!(await readFile(join(root, 'tests/e2e/test-tiers.json'))).equals(planBytes)) throw Error('产物场景计划字节变化')
  const stages = []
  for (const kind of ['zip', 'dmg']) {
    const stage = join(directory, kind), selected = selectSmokeCases(planBytes, await json(join(stage, 'inventory.json')), kind), application = await json(join(stage, 'application.json'))
    const binary = join(stage, kind === 'zip' ? 'extracted' : 'mounted', 'BoAI Agent.app/Contents/MacOS/BoAI Agent')
    if (!equal(selected, await json(join(stage, 'selection.json'))) || application.binary !== binary) throw Error('固定选择或目标包路径不对应')
    const expected = await json(join(intent.candidate, 'bundle-files.json'))
    if (!equal(await json(join(stage, 'bundle-before.json')), expected) || !equal(await json(join(stage, 'bundle-after.json')), expected)) throw Error('实际包测试前后字节清单缺失或变化')
    if (!equal(application.metadata, { version: 1, channel: 'personal-macos-arm64', sha: candidate.identity.sha, applicationVersion: candidate.identity.version, arch: 'arm64', ...(candidate.plist?.SUPublicEDKey ? { updates: { feedUrl: candidate.plist.SUFeedURL, publicKey: candidate.plist.SUPublicEDKey } } : {}) }) || !sameBuildBytes(application.packagedBuild, candidate.built)) throw Error('包内来源或构建登记不对应')
    assertPersonalBundle({ plist: application.info, version: candidate.identity.version, architectures: await readFile(join(stage, 'architecture.stdout.log'), 'utf8'), signature: await readFile(join(stage, 'signature-display.stdout.log'), 'utf8') + await readFile(join(stage, 'signature-display.stderr.log'), 'utf8') })
    for (const name of ['architecture', 'signature-verify', 'signature-display', 'native-app-icon-helper', 'native-boai-desktop-activity', 'native-boai-process-guard', 'inventory', 'selected-list', 'execute']) {
      const receipt = await json(join(stage, name + '.process.json'))
      if (receipt.exitCode !== 0 || receipt.failure) throw Error('原产物进程未完成：' + name)
      if (name.startsWith('native-') && (await readFile(join(stage, name + '.stdout.log'), 'utf8')).trim() !== 'arm64') throw Error('原生助手架构登记不对应')
    }
    const generated = await json(join(stage, 'generated-files.json'))
    if (!equal(generated.map(row => row.file), [...new Set(selected.map(row => row.file))])) throw Error('生成文件登记不对应')
    for (const row of generated) if (!equal(await releaseFile(join(root, '.features-gen', row.file + '.spec.js')), { bytes: row.bytes, sha256: row.sha256 })) throw Error('BDD生成文件字节变化')
    const evidence = await smokeEvidence(stage, selected, candidate, binary)
    if (!equal(evidence, await json(join(stage, 'evidence.json')))) throw Error('原产物身份或留证登记变化')
    stages.push({ kind, cases: selected.length, launches: evidence.launches })
  }
  if (!equal(stages, result.stages)) throw Error('产物两资产场景汇总不对应')
  return { sha: candidate.identity.sha, version: candidate.identity.version, stages }
}
export async function verifyReleaseSmoke(directory) {
  directory = resolve(directory)
  if (dirname(directory) !== runs || (await lstat(directory)).isSymbolicLink()) throw Error('原件不是本worktree产物目录')
  const bytes = await readFile(join(directory, 'manifest.json')), manifest = JSON.parse(bytes)
  if (manifest.version !== 1 || !equal(manifest.files, await localCiFiles(directory))) throw Error('产物原件缺失或hash变化')
  const proof = await verifySmokeReports(directory, await json(join(directory, 'result.json')))
  const mountIntent = await json(join(directory, 'dmg/mount.intent.json'))
  if (mountIntent.mount !== join(directory, 'dmg/mounted') || ownedSmokeMount(diskInfo(), mountIntent)) throw Error('产物DMG挂载尚未确认结束')
  if (!(await readFile(join(directory, 'manifest.json'))).equals(bytes) || !equal(manifest.files, await localCiFiles(directory))) throw Error('核验期间产物原件变化')
  return { ...proof, manifestSha256: createHash('sha256').update(bytes).digest('hex') }
}
async function worker(directory) {
  const intent = await json(join(directory, 'intent.json')), controller = new AbortController(), stop = () => controller.abort()
  const h = await helpers(directory), guard = join(directory, 'process-guard'), result = { version: 1, status: 'failed', stages: [], errors: [] }
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  const step = async (stage, name, command, args, timeoutMs = 120_000) => {
    console.log(`产物冒烟 ${name}`)
    const receipt = await h.repairProcess({ command, args, cwd: root, timeoutMs, signal: controller.signal, managed: { guard, ledger: join(stage, 'processes') }, capture: { directory: stage, prefix: name } })
    await h.saveProcess(stage, name, receipt)
    if (receipt.failure || receipt.exitCode !== 0) throw Error(`${name}未完成：${receipt.failure ?? receipt.exitCode}`)
    return receipt
  }
  try {
    const candidate = await candidateAt(intent.candidate, controller.signal), expected = await json(join(intent.candidate, 'bundle-files.json'))
    await step(directory, 'generate', 'pnpm', ['test:bddgen'])
    const planBytes = await readFile(join(root, 'tests/e2e/test-tiers.json'))
    await writeFile(join(directory, 'test-tiers.json'), planBytes, { flag: 'wx' })
    for (const kind of ['zip', 'dmg']) {
      const stage = join(directory, kind); await mkdir(stage)
      const asset = candidate.assets.find(row => row.name.endsWith('.' + kind)), archive = join(intent.candidate, 'assets', asset.name)
      let app
      if (kind === 'zip') {
        const extracted = await unpackPersonalArchive(archive, join(stage, 'extracted'), { signal: controller.signal })
        app = extracted.app; await save(join(stage, 'extraction.json'), extracted)
      } else {
        const mount = join(stage, 'mounted'); await mkdir(mount)
        const mountIntent = { mount, asset: await realpath(archive), candidate: intent.candidate, archive: { bytes: asset.bytes, sha256: asset.sha256 } }
        await save(join(stage, 'mount.intent.json'), mountIntent)
        if (ownedSmokeMount(diskInfo(), mountIntent)) throw Error('新产物挂载点已被占用')
        // This raw attach lives INSIDE the long-lived guarded worker. Its service
        // stays alive through BDD and paired detach, not a short-command guard.
        const bytes = raw('/usr/bin/hdiutil', ['attach', '-plist', '-readonly', '-nobrowse', '-mountpoint', mount, archive])
        await writeFile(join(stage, 'attach.plist'), bytes, { flag: 'wx' })
        if (!ownedSmokeMount(diskInfo(), mountIntent)) throw Error('未观察到本批实际DMG挂载')
        app = join(mount, 'BoAI Agent.app')
      }
      await save(join(stage, 'bundle-before.json'), await verifySmokeBundle(app, expected))
      const info = JSON.parse(raw('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]))
      if (info.CFBundleExecutable !== 'BoAI Agent') throw Error('产物主程序名称不对应')
      const binary = await realpath(join(app, 'Contents/MacOS', info.CFBundleExecutable))
      const architectures = await step(stage, 'architecture', '/usr/bin/lipo', ['-archs', binary])
      await step(stage, 'signature-verify', '/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
      const signature = await step(stage, 'signature-display', '/usr/bin/codesign', ['--display', '--verbose=4', app])
      assertPersonalBundle({ plist: info, architectures: architectures.stdout, signature: signature.stdout + signature.stderr, version: candidate.identity.version })
      const require = createRequire(import.meta.url), builder = createRequire(require.resolve('electron-builder')).resolve('app-builder-lib'), asar = createRequire(builder)('@electron/asar')
      const metadata = JSON.parse(asar.extractFile(join(app, 'Contents/Resources/app.asar'), 'package.json').toString()), packagedBuild = JSON.parse(asar.extractFile(join(app, 'Contents/Resources/app.asar'), 'dist/build-identity.json').toString())
      if (metadata.version !== candidate.identity.version || !equal(metadata.boaiRelease, { version: 1, channel: 'personal-macos-arm64', sha: candidate.identity.sha, applicationVersion: candidate.identity.version, arch: 'arm64', ...(candidate.plist?.SUPublicEDKey ? { updates: { feedUrl: candidate.plist.SUFeedURL, publicKey: candidate.plist.SUPublicEDKey } } : {}) }) || !sameBuildBytes(packagedBuild, candidate.built)) throw Error('asar源码、版本或构建不对应')
      await save(join(stage, 'application.json'), { info, binary, metadata: metadata.boaiRelease, packagedBuild })
      for (const name of ['app-icon-helper', 'boai-desktop-activity', 'boai-process-guard']) if ((await step(stage, 'native-' + name, '/usr/bin/lipo', ['-archs', join(app, 'Contents/Resources/app.asar.unpacked/dist/native', name)])).stdout.trim() !== 'arm64') throw Error('实际原生助手架构不符')
      const env = [`BOAI_TEST_PACKAGED_PATH=${binary}`]
      await step(stage, 'inventory', '/usr/bin/env', [...env, `PLAYWRIGHT_JSON_OUTPUT_FILE=${join(stage, 'inventory.json')}`, 'pnpm', 'exec', 'playwright', 'test', '--list', '--reporter=json'])
      const selected = selectSmokeCases(planBytes, await json(join(stage, 'inventory.json')), kind), selectors = selected.map(row => `.features-gen/${row.file}.spec.js:${row.line}`)
      await save(join(stage, 'selection.json'), selected)
      await step(stage, 'selected-list', '/usr/bin/env', [...env, `PLAYWRIGHT_JSON_OUTPUT_FILE=${join(stage, 'selected-list.json')}`, 'pnpm', 'exec', 'playwright', 'test', ...selectors, '--list', '--reporter=json'])
      const listReport = await json(join(stage, 'selected-list.json')), listed = desktopReportRows(listReport)
      if (!equal(listReport.errors, []) || listed.length !== selected.length || listed.some(row => row.tests?.length !== 1 || row.tests[0].expectedStatus !== 'passed') || selected.some(row => !listed.some(actual => actual.playwrightId === row.playwrightId && equal(actual.titles, row.titles) && actual.file === row.file && actual.line === row.line))) throw Error('实际选择与固定产物场景不同')
      const generated = await Promise.all([...new Set(selected.map(row => row.file))].map(async file => ({ file, ...await releaseFile(join(root, '.features-gen', file + '.spec.js')) })))
      await save(join(stage, 'generated-files.json'), generated)
      await recordDesktopExecution(stage, () => step(stage, 'execute', '/usr/bin/env', [...env, `PLAYWRIGHT_JSON_OUTPUT_FILE=${join(stage, 'playwright.json')}`, `BOAI_REVIEW_RUN_DIR=${join(stage, 'review')}`, 'pnpm', 'exec', 'playwright', 'test', ...selectors, '--output', join(stage, 'results'), '--reporter=line,json'], 10 * 60_000))
      assertDesktopReport(await json(join(stage, 'playwright.json')), selected)
      const evidence = await smokeEvidence(stage, selected, candidate, binary); await save(join(stage, 'evidence.json'), evidence)
      for (const row of generated) if (!equal(await releaseFile(join(root, '.features-gen', row.file + '.spec.js')), { bytes: row.bytes, sha256: row.sha256 })) throw Error('执行期间BDD生成文件变化')
      await h.drainPendingProcesses(stage, guard)
      await save(join(stage, 'bundle-after.json'), await verifySmokeBundle(app, expected))
      result.stages.push({ kind, cases: selected.length, launches: evidence.launches })
      if (kind === 'zip') await rm(join(stage, 'extracted'), { recursive: true })
      else await detachMount(directory)
    }
    await candidateAt(intent.candidate, controller.signal)
    controller.signal.throwIfAborted(); result.status = 'passed'
  } catch (error) { result.errors.push(String(error)); result.status = controller.signal.aborted ? 'cancelled' : 'failed'; process.exitCode = 1; console.error(String(error)) }
  finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop)
    try { await drainSmokeAssets(directory, guard, h) }
    catch (error) { result.errors.push(String(error)); result.status = 'failed'; process.exitCode = 1 }
    await save(join(directory, 'worker.json'), { ...result, completedAt: new Date().toISOString() })
  }
}
async function run(candidatePath) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.16.0') throw Error('个人产物冒烟须macOS arm64/Node24.16.0')
  const unlocks = [], controller = new AbortController(), stop = () => controller.abort(), directory = join(runs, randomUUID())
  const result = { version: 1, status: 'failed', errors: [], directory, authority: 'isolated candidate asset smoke only; no main CI, tag, publication or personal install qualification' }
  let h, guard
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  try {
    unlocks.push(acquireResourceLock(join(tmpdir(), `boai-ci-watch-${userInfo().uid}.sqlite`))); unlocks.push(acquireResourceLock(join(tmpdir(), 'boai-local-ci.sqlite')))
    const candidate = await candidateAt(resolve(candidatePath), controller.signal)
    // Build current trusted recovery helpers before accepting any old local ledger.
    await mkdir(runs, { recursive: true }); const preparation = join(root, '.local/release-smoke-tools'); await mkdir(preparation, { recursive: true })
    // No saved helper from an old candidate is executed.
    await rm(join(preparation, 'process.mjs'), { force: true }); h = await helpers(preparation)
    await recoverSmokeRuns(h)
    await mkdir(directory); await mkdir(join(directory, 'controller')); guard = join(directory, 'process-guard')
    await copyFile(join(root, 'dist/native/boai-process-guard'), guard); await chmod(guard, 0o700)
    await save(join(directory, 'intent.json'), { version: 1, directory, candidate: resolve(candidatePath), source: candidate.source, guard: await releaseFile(guard), startedAt: new Date().toISOString() })
    // Freeze compiled helpers in this run before launching the long-lived worker.
    await copyFile(join(preparation, 'process.mjs'), join(directory, 'process.mjs'))
    const receipt = await h.repairProcess({ command: process.execPath, args: [fileURLToPath(import.meta.url), '--worker', directory], cwd: root, timeoutMs: 25 * 60_000, signal: controller.signal, managed: { guard, ledger: join(directory, 'controller/processes') }, capture: { directory, prefix: 'worker' } })
    await h.saveProcess(directory, 'worker', receipt)
    if (receipt.failure || receipt.exitCode !== 0) throw Error('产物worker未完成：' + (receipt.failure ?? receipt.exitCode))
    const outcome = await json(join(directory, 'worker.json'))
    if (outcome.status !== 'passed' || outcome.errors.length || !equal(outcome.stages.map(row => [row.kind, row.cases]), [['zip', 8], ['dmg', 2]])) throw Error('产物worker不是固定两资产完整成功')
    Object.assign(result, { status: 'passed', stages: outcome.stages, source: candidate.source, identity: candidate.identity })
    await verifySmokeReports(directory, result, controller.signal)
    controller.signal.throwIfAborted()
  } catch (error) { result.errors.push(String(error)); result.status = controller.signal.aborted ? 'cancelled' : 'failed'; process.exitCode = 1; console.error(String(error)) }
  finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop)
    try {
      if (guard) { await h.drainPendingProcesses(join(directory, 'controller'), guard); await drainSmokeAssets(directory, guard, h) }
    } catch (error) { result.status = 'failed'; result.errors.push('产物收尾未确认：' + error); process.exitCode = 1 }
    try {
      if (await exists(directory)) {
        await save(join(directory, 'result.json'), { ...result, completedAt: new Date().toISOString() }); await save(join(directory, 'manifest.json'), { version: 1, files: await localCiFiles(directory) })
        if (result.status === 'passed') await verifyReleaseSmoke(directory)
      }
    } catch (error) {
      result.status = 'failed'; process.exitCode = 1; console.error('产物封存未确认，保留原件：' + error)
      if (await exists(directory)) try { await save(join(directory, 'qualification-failure.json'), { status: 'failed', error: String(error) }) } catch (writeError) { console.error('资格失败记录未写入：' + writeError) }
    }
    finally { for (const unlock of unlocks.reverse()) unlock() }
    console.log(`个人产物冒烟 ${result.status}: ${directory}`)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, path, ...extra] = process.argv.slice(2)
  Promise.resolve().then(() => {
    if (!path || extra.length) throw Error('用法：release-smoke.mjs --candidate 本worktree候选目录')
    if (command === '--candidate') return run(path)
    if (command === '--verify') return verifyReleaseSmoke(path).then(value => console.log(JSON.stringify(value)))
    if (command === '--worker' && dirname(resolve(path)) === runs) return worker(resolve(path))
    throw Error('未知产物冒烟入口')
  }).catch(error => { console.error(String(error)); process.exitCode = 1 })
}
