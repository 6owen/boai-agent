/*
 * [INPUT]: 当前干净提交、锁定依赖、固定工程/T1/全部本机UI合同。
 * [OUTPUT]: 不调用Actions的完整本地CI、受管串行执行与逐原件hash封存；verify拒绝旧提交或改动结果。
 * [POS]: 本机CI唯一入口；真实供应商/基线接受/发布及安装不在此执行。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'
import buildProcessGuard from './build-process-guard.mjs'
import { acquireResourceLock } from './resource-lock.mjs'
import { sourceIdentity } from './ui-regression.mjs'
import { verifyBuildIdentity } from './build-identity.mjs'
import { validateGate, verifyDesktopGate } from './ci-result.mjs'
import { desktopPlanIdentity, desktopReportRows, assertDesktopReport } from './desktop-plan.mjs'
import { beginLocalCiPublication } from './local-ci-github.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
export async function localCiFiles(directory, current = directory) {
  const result = []
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(current, entry.name), path = relative(directory, file)
    if (path === 'manifest.json') continue
    if (entry.isDirectory()) result.push(...await localCiFiles(directory, file))
    else {
      const stat = await lstat(file)
      if (!entry.isFile() || stat.isSymbolicLink()) throw new Error('本地CI原件不能含链接或特殊文件')
      const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes)
      result.push({ path, bytes: stat.size, sha256: hash.digest('hex') })
    }
  }
  return result
}
export async function verifyLocalCi(directory) {
  directory = resolve(directory)
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('本地CI目录不能是符号链接')
  const result = await json(join(directory, 'result.json')), manifest = await json(join(directory, 'manifest.json'))
  if (manifest.version !== 1 || !manifest.files?.length || JSON.stringify(manifest.files) !== JSON.stringify(await localCiFiles(directory))) throw new Error('本地CI原件缺失、增加或hash变化')
  const qualification = await verifyLocalCiReports(directory, result)
  if (JSON.stringify(manifest.files) !== JSON.stringify(await localCiFiles(directory)) || JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(result.source)) throw new Error('核验期间本地CI原件或源码变化')
  return { ...qualification, manifestSha256: createHash('sha256').update(await readFile(join(directory, 'manifest.json'))).digest('hex') }
}
async function verifyLocalCiReports(directory, result) {
  const source = await sourceIdentity(root)
  if (result.version !== 1 || result.status !== 'passed' || result.errors?.length !== 0 || source.dirty || JSON.stringify(result.source) !== JSON.stringify(source) || JSON.stringify(result.built) !== JSON.stringify(await verifyBuildIdentity(root))) throw new Error('本地CI不是当前干净源码及构建的完整成功')
  const identity = desktopPlanIdentity(await readFile(join(root, 'tests/e2e/test-tiers.json'))), contract = await json(join(root, 'tests/e2e/baselines/contract.json')), ids = contract.cases.map(row => row.id)
  const desktop = await json(join(directory, 't1/summary.json')), raw = await json(join(directory, 't1/playwright.json')), ui = await json(join(directory, 'ui/summary.json'))
  validateGate({ desktop: { result: 'success' }, ui: { result: 'success' } }, result.engineering, ui, ids, source.commit, { summary: desktop, report: raw, identity })
  if (JSON.stringify(desktop.source) !== JSON.stringify(source) || JSON.stringify(ui.source) !== JSON.stringify(source) || ui.profile !== 'local-macos-arm64' || JSON.stringify(desktop.built) !== JSON.stringify(result.built) || JSON.stringify(ui.built) !== JSON.stringify(result.built)) throw new Error('本地CI子报告源码/构建/环境不一致')
  await verifyDesktopGate(join(directory, 't1'), desktop, raw, identity)
  const uiRaw = await json(join(directory, 'ui/compare/playwright.json')), rows = desktopReportRows(uiRaw)
  const uiSelected = ids.map(id => { const matches = rows.filter(row => row.titles.at(-1).includes(`界面 ${id} `)); if (matches.length !== 1) throw new Error('UI原报告缺场或重复'); return { ...matches[0], id } })
  assertDesktopReport(uiRaw, uiSelected)
  return { sha: source.commit, sourceHash: source.sourceHash, t1: identity.ids.length, ui: ids.length }
}
async function run(branch) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.16.0') throw new Error('本地CI须使用已登记的macOS arm64/Node24.16.0')
  const release = acquireResourceLock(join(tmpdir(), 'boai-local-ci.sqlite'))
  const controller = new AbortController(), cancel = () => controller.abort()
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel)
  const runId = randomUUID(), directory = join(root, '.local/ci-local', runId)
  let publish, publicationFailed = false
  const result = { version: 1, status: 'failed', errors: [], startedAt: new Date().toISOString(), engineering: { selected: ['install', 'types', 'lint', 'build', 'unit', 'dataset', 'bdd'], outcomes: {}, status: 'failed' } }
  try {
    await mkdir(directory, { recursive: true })
    result.source = await sourceIdentity(root)
    if (result.source.dirty) throw new Error('本地CI只接受干净提交')
    if (branch) publish = await beginLocalCiPublication({ branch, sha: result.source.commit, runId, journal: join(root, '.local/ci-publish', runId) })
    await buildProcessGuard()
    await build({ stdin: { contents: "export {repairProcess,saveProcess} from './tests/evaluation/repair-process.ts'", resolveDir: root }, outfile: join(directory, 'process.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
    const { repairProcess, saveProcess } = await import(join(directory, 'process.mjs'))
    const deadline = Date.now() + 120 * 60_000
    const step = async (id, command, args, limit) => {
      console.log(`本地CI ${id}`)
      const remaining = Math.min(limit * 60_000, deadline - Date.now())
      const receipt = await repairProcess({ command, args, cwd: root, timeoutMs: remaining, signal: controller.signal, managed: { guard: join(root, 'dist/native/boai-process-guard'), ledger: join(directory, 'processes') }, capture: { directory, prefix: id } })
      await saveProcess(directory, id, receipt)
      if (receipt.failure || receipt.exitCode !== 0) { result.errors.push(`${id}: ${receipt.failure ?? receipt.exitCode}`); return false }
      return true
    }
    const definitions = [
      ['install', 'pnpm', ['install', '--frozen-lockfile'], 15],
      ['electron-install', 'node', ['node_modules/electron/install.js'], 5],
      ['electron-version', 'pnpm', ['exec', 'electron', '--version'], 2],
      ['types', 'pnpm', ['typecheck'], 5], ['lint', 'pnpm', ['lint:ui'], 5], ['build', 'pnpm', ['build'], 10],
      ['unit', 'pnpm', ['test', '--maxWorkers=2'], 30], ['dataset', 'pnpm', ['eval:dataset'], 5],
      ['bdd', 'node', ['scripts/test-desktop.mjs', 't1', '--output', join(directory, 't1')], 46],
      ['ui', 'node', ['scripts/ui-regression.mjs', 'check', '--profile', 'local-macos-arm64', '--output', join(directory, 'ui')], 20],
    ]
    for (const [id, command, args, limit] of definitions) {
      const passed = await step(id, command, args, limit)
      result.engineering.outcomes[id] = passed ? 'success' : 'failure'
      if (!passed && ['install', 'electron-install', 'electron-version', 'build'].includes(id)) break
    }
    if (['electron-install', 'electron-version'].some(id => result.engineering.outcomes[id] !== 'success')) result.engineering.outcomes.install = 'failure'
    result.built = await verifyBuildIdentity(root)
    if (JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(result.source)) throw new Error('执行期间源码变化')
    result.engineering.sha = result.source.commit
    result.engineering.status = result.engineering.selected.every(id => result.engineering.outcomes[id] === 'success') ? 'passed' : 'failed'
    controller.signal.throwIfAborted()
    if (!result.errors.length && result.engineering.status === 'passed' && result.engineering.outcomes.ui === 'success') { result.status = 'passed'; await verifyLocalCiReports(directory, result); controller.signal.throwIfAborted() }
  } catch (error) { result.errors.push(String(error)); result.status = controller.signal.aborted ? 'cancelled' : 'failed' }
  finally {
    process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel)
    let verified
    try {
      result.completedAt = new Date().toISOString(); await save(join(directory, 'result.json'), result); await save(join(directory, 'manifest.json'), { version: 1, files: await localCiFiles(directory) })
      verified = result.status === 'passed' ? await verifyLocalCi(directory) : undefined
    }
    catch (error) { result.status = 'failed'; console.error(String(error)); try { await save(join(directory, 'qualification-failure.json'), { error: String(error), status: 'failed' }) } catch (writeError) { console.error(`失败记录未能写入：${String(writeError)}`) } }
    try { if (publish) await publish({ passed: !!verified, manifestSha256: verified?.manifestSha256 }) }
    catch (error) { publicationFailed = true; console.error(`GitHub回传未确认，原意图/回执在.local/ci-publish/${runId}：${String(error)}`) }
    finally { release() }
    if (result.status !== 'passed' || publicationFailed) process.exitCode = 1
    console.log(`本地CI ${result.status}: ${directory}`)
  }
}
async function main() {
  const [command, directory, ...extra] = process.argv.slice(2)
  if (command === 'run' && !directory) await run()
  else if (command === 'run' && directory === '--github-branch' && extra.length === 1) await run(extra[0])
  else if (command === 'verify' && directory && !extra.length) console.log(JSON.stringify(await verifyLocalCi(directory)))
  else throw new Error('用法：local-ci.mjs run [--github-branch 分支] | verify 本地原件目录')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
