/*
 * [INPUT]: 版本化BDD/截图合同、实际源码/字体/平台及显式候选接受命令。
 * [OUTPUT]: 只读UI回归、旧新差异报告、隔离候选和逐case晋升；缺失/跳过/异常均非通过。
 * [POS]: 开发侧UI门槛CLI；不调用供应商、不提交或推送、不改产品数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { arch, platform, release } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { verifyBuildIdentity } from './build-identity.mjs'
import { acquireResourceLock } from './resource-lock.mjs'
import { createBaselineReview, verifyBaselineReview } from './ui-baseline-review.mjs'

const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const baseline = join(root, 'tests/e2e/baselines')
const hash = value => createHash('sha256').update(value).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim()
let cancelled = false
let activeRun

export const baselineContractHash = (contract, id) => hash(JSON.stringify({ case: contract.cases.find(item => item.id === id), height: contract.height, threshold: contract.threshold, maxDiffPixels: contract.maxDiffPixels, masks: contract.masks, version: contract.version }))

export function assertUiExecutionMode(env) {
  if (env.BOAI_TEST_PACKAGED_PATH || env.BOAI_TEST_DEV_SERVER === '1' || env.BOAI_RENDERER_URL) throw new Error('当前UI基线必须使用本工作区的完整构建，不能混用安装包或开发服务')
}

// The OS releases a SQLite transaction on actual process death. No stale-file
// deletion or PID/lease race can admit two GUI runners after a crash.
export const acquireUiLock = acquireResourceLock

export function validateReport(report, caseIds) {
  const tests = []
  const walk = suites => { for (const suite of suites ?? []) { for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) tests.push({ title: spec.title, ...test }); walk(suite.suites) } }
  walk(report.suites)
  const errors = [...(report.errors ?? []).map(error => error.message ?? String(error))]
  if (tests.length !== caseIds.length) errors.push(`必需${caseIds.length}场，实际报告${tests.length}场`)
  for (const id of caseIds) {
    const found = tests.filter(test => test.title.includes(`界面 ${id} `))
    if (found.length !== 1) { errors.push(`${id}: 缺失或重复结果`); continue }
    const test = found[0]
    if (test.expectedStatus !== 'passed' || test.status !== 'expected' || test.results?.length !== 1 || test.results[0].status !== 'passed') errors.push(`${id}: 未完整通过（${test.status ?? 'unknown'}）`)
  }
  return { status: errors.length ? 'failed' : 'passed', cases: caseIds, errors }
}

export async function sourceIdentity(workspace = root) {
  const readGit = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim()
  const names = readGit('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean).filter(path => /^(src\/|resources\/|scripts\/|tests\/|package.json$|pnpm-lock.yaml$|pnpm-workspace.yaml$|playwright.config.ts$|vite.config.ts$|tailwind.config.ts$|tsconfig.json$)/.test(path) && !/^tests\/e2e\/baselines\/(manifest.json|.*\.png)$/.test(path)).sort()
  const digest = createHash('sha256')
  for (const name of names) { digest.update(name + '\0'); try { digest.update(await readFile(join(workspace, name))) } catch (error) { if (error.code !== 'ENOENT') throw error; digest.update('<deleted>') } }
  return { commit: readGit('rev-parse', 'HEAD'), sourceHash: digest.digest('hex'), dirty: Boolean(readGit('status', '--porcelain')) }
}

export async function renderEnvironment() {
  if (platform() !== 'darwin') throw new Error('当前UI基线仅适用于macOS；其他平台需独立采集')
  const query = 'import Foundation; import CoreText; let f = CTFontCreateWithName("PingFang SC" as CFString, 14, nil); let u = CTFontCopyAttribute(f, kCTFontURLAttribute) as? URL; let d: [String: String] = ["postscript": CTFontCopyPostScriptName(f) as String, "path": u?.path ?? ""]; let b = try JSONSerialization.data(withJSONObject: d); print(String(data: b, encoding: .utf8)!)'
  const chinese = JSON.parse(execFileSync('swift', ['-e', query], { encoding: 'utf8', timeout: 60_000 }))
  if (!chinese.postscript.startsWith('PingFangSC-') || !chinese.path) throw new Error('CoreText未解析到固定中文字体PingFang SC，不能比较UI基线')
  const fonts = [hash(await readFile(chinese.path))]
  const bundled = await readFile(join(root, 'src/renderer/assets/fonts/Geist.woff2')).catch(async () => {
    const files = git('ls-files', '-z', '*Geist*.woff2').split('\0').filter(Boolean)
    if (files.length !== 1) throw new Error('无法唯一核对Geist字体')
    return readFile(join(root, files[0]))
  })
  return { platform: platform(), arch: arch(), osMajor: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim().split('.')[0], electron: require('electron/package.json').version, playwright: require('@playwright/test/package.json').version, geist: hash(bundled), pingFang: [...new Set(fonts)].sort(), timezone: 'Asia/Singapore', locale: 'zh-CN', scale: 'css' }
}

async function runCommand(command, args, env) {
  // Reuse the product's identity-bound native supervisor. It observes this
  // owner's death and retains responsibility for the whole spawned tree.
  const ledger = join(root, '.local/ui-processes', randomUUID())
  const child = spawn(join(root, 'dist/native/boai-process-guard'), ['--ledger', ledger, command, ...args], { cwd: root, env, stdio: 'inherit' })
  const cancel = () => { cancelled = true; child.kill('SIGINT') }
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
  try { return await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) }) }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel) }
}

async function execute(directory, ids, environment, candidate) {
  await mkdir(directory, { recursive: true })
  const env = { ...process.env, TZ: environment.timezone, LANG: 'en_US.UTF-8', BOAI_UI_ENVIRONMENT: JSON.stringify(environment), BOAI_UI_RUN_DIR: directory }
  delete env.BOAI_UI_CANDIDATE_DIR
  if (candidate) env.BOAI_UI_CANDIDATE_DIR = candidate
  const pattern = `界面 (${ids.join('|')}) `
  let exit = { code: null, signal: null }, result
  try {
    exit = await runCommand('pnpm', ['exec', 'playwright', 'test', '--grep', pattern, '--retries=0'], env)
    result = validateReport(await json(join(directory, 'playwright.json')), ids)
  } catch (error) { result = { status: 'failed', cases: ids, errors: [String(error)] } }
  if (exit.code !== 0) { result.status = 'failed'; result.errors.push(`测试进程退出：${JSON.stringify(exit)}`) }
  await save(join(directory, 'summary.json'), { ...result, exit })
  return result
}

async function main() {
  const [command = 'check', ...args] = process.argv.slice(2)
  const options = Object.fromEntries(args.map((arg, index) => arg.startsWith('--') ? [arg.slice(2), args[index + 1]] : []).filter(pair => pair.length))
  if (!['check', 'candidate', 'accept'].includes(command)) throw new Error('用法：ui-regression.mjs check|candidate|accept [--cases id,id] [--candidate DIR] [--reason TEXT]')
  if (process.env.CI && command !== 'check') throw new Error('CI禁止候选采集或基线晋升')
  assertUiExecutionMode(process.env)
  if (options.fault && (process.env.CI || command !== 'check' || !['layout', 'behavior', 'environment'].includes(options.fault))) throw new Error('故障演练仅支持本地check --fault layout|behavior|environment')
  const contract = await json(join(baseline, 'contract.json'))
  if (process.env.CI && options.cases) throw new Error('CI必须运行全部登记UI场景')
  const ids = options.cases ? options.cases.split(',') : contract.cases.map(item => item.id)
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !contract.cases.some(item => item.id === id))) throw new Error('场景列表为空、重复或未登记')
  const directory = command === 'accept' ? null : resolve(options.output ?? join(root, '.local/ui-runs', randomUUID()))
  if (directory) { await mkdir(dirname(directory), { recursive: true }); await mkdir(directory); activeRun = directory }
  const environment = await renderEnvironment(), source = await sourceIdentity()
  delete process.env.BOAI_UI_FAULT
  if (options.fault) process.env.BOAI_UI_FAULT = options.fault
  if (options.fault === 'environment') environment.osMajor = 'wrong-environment-probe'
  await mkdir(join(root, '.local'), { recursive: true })
  const releaseLock = acquireUiLock(join(root, '.local/ui-regression-lock.sqlite'))
  try {
    if (command === 'accept') {
      if (!options.candidate || !options.cases || !options.reason) throw new Error('接受必须明确--candidate、--cases及--reason；独立审阅仍由PR执行')
      const directory = resolve(options.candidate), candidate = await json(join(directory, 'candidate.json'))
      const result = await json(join(directory, 'capture/summary.json'))
      if (candidate.source.sourceHash !== source.sourceHash || JSON.stringify(candidate.environment) !== JSON.stringify(environment)) throw new Error('候选源码或环境已变化，请重新采集')
      if (JSON.stringify(await verifyBuildIdentity(root)) !== JSON.stringify(candidate.built)) throw new Error('候选构建身份已变化，请重新采集')
      if (result.status !== 'passed' || ids.some(id => !candidate.cases[id])) throw new Error('候选不完整或未通过，禁止晋升')
      await verifyBaselineReview(directory, ids, baseline, candidate)
      const previous = await json(join(baseline, 'manifest.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (previous && JSON.stringify(previous.environment) !== JSON.stringify(environment) && ids.length !== contract.cases.length) throw new Error('环境迁移必须审阅全部场景')
      const manifest = previous ?? { version: 1, environment, cases: {} }
      manifest.environment = environment
      for (const id of ids) {
        const file = join(directory, 'snapshots', `${id}.png`)
        if (hash(await readFile(file)) !== candidate.cases[id].sha256) throw new Error(`候选图片已变化：${id}`)
      }
      for (const id of ids) {
        await copyFile(join(directory, 'snapshots', `${id}.png`), join(baseline, `${id}.png`))
        manifest.cases[id] = { ...candidate.cases[id], source, reason: options.reason, candidate: candidate.id, acceptedAt: new Date().toISOString() }
      }
      await save(join(baseline, 'manifest.json'), manifest)
      console.log(`已接受${ids.length}项本地候选；提交PR后仍需独立审阅。`)
      return
    }
    const built = await verifyBuildIdentity(root)
    const identity = { id: randomUUID(), source, built, environment, osRelease: release(), osVersion: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), node: process.version, selected: ids, startedAt: new Date().toISOString() }
    await save(join(directory, 'run.json'), identity)
    const generated = await runCommand('pnpm', ['test:bddgen'], process.env)
    if (generated.code !== 0) throw new Error('BDD生成失败，未执行UI回归')
    // Initial recording has no old expected images to compare. Keep that gap explicit;
    // the capture still runs every real behavior/layout assertion before writing a candidate.
    const hasBaseline = await stat(join(baseline, 'manifest.json')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
    let comparison
    if (command === 'candidate' && !hasBaseline) {
      await mkdir(join(directory, 'compare'))
      comparison = { status: 'not-run', cases: ids, errors: ['首次采集：缺少已接受基线，无旧期望图可比较；不代表比较通过'] }
      await save(join(directory, 'compare/summary.json'), comparison)
    } else comparison = await execute(join(directory, 'compare'), ids, environment)
    if (cancelled) throw new Error('UI测试已取消，保留原报告；不继续采集或接受基线')
    if (command === 'check') {
      if ((await sourceIdentity()).sourceHash !== source.sourceHash) { comparison.status = 'failed'; comparison.errors.push('执行期间源码变化，结论失效') }
      try { if (JSON.stringify(await verifyBuildIdentity(root)) !== JSON.stringify(built)) throw new Error('执行期间构建身份变化') } catch (error) { comparison.status = 'failed'; comparison.errors.push(String(error)) }
      await save(join(directory, 'summary.json'), { ...identity, ...comparison })
      console.log(`UI回归：${comparison.status}；报告 ${directory}`)
      if (comparison.status !== 'passed') process.exitCode = 1
      return
    }
    const snapshots = join(directory, 'snapshots'); await mkdir(snapshots)
    const capture = await execute(join(directory, 'capture'), ids, environment, snapshots)
    if (cancelled) throw new Error('UI候选采集已取消，禁止晋升')
    if (capture.status !== 'passed') { process.exitCode = 1; console.log(`候选采集失败；报告 ${directory}`); return }
    if ((await sourceIdentity()).sourceHash !== source.sourceHash) throw new Error('采集期间源码变化，候选无效')
    if (JSON.stringify(await verifyBuildIdentity(root)) !== JSON.stringify(built)) throw new Error('采集期间构建身份变化，候选无效')
    const cases = {}
    for (const id of ids) cases[id] = { sha256: hash(await readFile(join(snapshots, `${id}.png`))), contract: baselineContractHash(contract, id) }
    await createBaselineReview(directory, ids, baseline)
    await save(join(directory, 'candidate.json'), { ...identity, cases, comparison: comparison.status })
    console.log(`待审阅UI候选：${directory}；旧/新/差异见compare报告，未修改已接受基线。`)
  } finally { releaseLock() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(async error => {
  if (activeRun) {
    const identity = await json(join(activeRun, 'run.json')).catch(() => ({}))
    await save(join(activeRun, 'summary.json'), { ...identity, status: 'failed', cases: identity.selected ?? [], errors: [String(error)] })
  }
  console.error(String(error)); process.exitCode = cancelled ? 130 : 1
})
