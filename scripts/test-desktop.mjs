/*
 * [OUTPUT]: 应用与评估编译按当前工作区公开exports解析，保留原执行与分发合同。
 * [INPUT]: 明确T1核心或T3完整旧清单、当前构建、原BDD和隔离新输出目录。
 * [OUTPUT]: 先核实际清单并记录监督入口执行墙钟；源码/构建前后、截图/trace/日志严格核验，不跳过旧失败。
 * [POS]: T1必需检查与手动T3执行入口；真实供应商T2另按原明确配置。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'
import { sourceIdentity } from './ui-regression.mjs'
import { verifyBuildIdentity } from './build-identity.mjs'
import { desktopPlanIdentity, desktopReportRows, selectDesktopCases, assertDesktopReport } from './desktop-plan.mjs'
import { recordDesktopExecution, verifyDesktopEvidence } from './desktop-evidence.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n')
async function main() {
  const [tier, ...args] = process.argv.slice(2)
  if (!['t1', 't3'].includes(tier) || args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('用法：test-desktop.mjs t1|t3 [--output 新目录]')
  const directory = resolve(args[1] ?? join(root, '.local', 'desktop-runs', randomUUID()))
  if (relative(join(root, '.local'), directory).startsWith('..') || directory === join(root, '.local')) throw new Error('输出须为本worktree .local内新目录')
  await mkdir(resolve(directory, '..'), { recursive: true }); await mkdir(directory)
  const controller = new AbortController(), cancel = () => controller.abort()
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel)
  const summary = { tier, status: 'failed', errors: [], cases: [], outputDirectory: directory, startedAt: new Date().toISOString() }
  try {
    const bytes = await readFile(join(root, 'tests/e2e/test-tiers.json')), identity = desktopPlanIdentity(bytes)
    const source = await sourceIdentity(root), built = await verifyBuildIdentity(root)
    if (process.env.CI && source.dirty) throw new Error('CI源码不干净')
    Object.assign(summary, { source, built, planHash: identity.hash })
    await writeFile(join(directory, 'test-tiers.json'), bytes, { flag: 'wx' })
    await build({ stdin: { contents: "export {repairProcess,saveProcess} from './tests/evaluation/repair-process.ts'", resolveDir: root }, outfile: join(directory, 'process.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
    const { repairProcess, saveProcess } = await import(join(directory, 'process.mjs'))
    const deadline = Date.now() + (tier === 't1' ? 45 : 80) * 60_000
    const run = async (label, parameters, output) => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('桌面层级执行期限已到，不启动后续步骤')
      const execute = () => repairProcess({ command: '/usr/bin/env', args: [...(output ? [`PLAYWRIGHT_JSON_OUTPUT_FILE=${output}`] : []), ...(label === 'execute' ? [`BOAI_REVIEW_RUN_DIR=${join(directory, 'review')}`] : []), 'pnpm', ...parameters], cwd: root, timeoutMs: remaining, signal: controller.signal, managed: { guard: join(root, 'dist/native/boai-process-guard'), ledger: join(directory, 'processes') }, capture: { directory, prefix: label } })
      const receipt = label === 'execute' ? await recordDesktopExecution(directory, execute) : await execute()
      await saveProcess(directory, label, receipt)
      if (receipt.exitCode !== 0 || receipt.failure) throw new Error(`${label}未完成：${receipt.failure ?? receipt.exitCode}`)
    }
    await run('generate', ['test:bddgen'])
    await run('inventory', ['exec', 'playwright', 'test', '--list', '--reporter=json'], join(directory, 'inventory.json'))
    const selected = selectDesktopCases(identity, JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8')), tier)
    const selectors = selected.map(row => `${join('.features-gen', row.file + '.spec.js')}:${row.line}`)
    await save(join(directory, 'selection.json'), selected)
    summary.cases = selected.map(row => row.id)
    const generated = Object.fromEntries(await Promise.all([...new Set(selected.map(row => row.file))].map(async file => [file, createHash('sha256').update(await readFile(join(root, '.features-gen', file + '.spec.js'))).digest('hex')])))
    await run('selected-list', ['exec', 'playwright', 'test', ...selectors, '--list', '--reporter=json'], join(directory, 'selected-list.json'))
    const selectedList = JSON.parse(await readFile(join(directory, 'selected-list.json'), 'utf8'))
    const listed = selectDesktopCases(identity, selectedList, tier)
    if (desktopReportRows(selectedList).length !== selected.length || JSON.stringify(listed) !== JSON.stringify(selected)) throw new Error('实际选择与冻结计划不同')
    // Execute the original BDD bodies. No retries, new timeout, skips or assertion edits.
    await run('execute', ['exec', 'playwright', 'test', ...selectors, '--output', join(directory, 'results'), '--reporter=line,json'], join(directory, 'playwright.json'))
    const report = JSON.parse(await readFile(join(directory, 'playwright.json'), 'utf8'))
    assertDesktopReport(report, selected)
    const evidence = await verifyDesktopEvidence(directory, report, selected)
    await save(join(directory, 'evidence.json'), evidence)
    summary.evidenceSha256 = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
    for (const [file, hash] of Object.entries(generated)) if (createHash('sha256').update(await readFile(join(root, '.features-gen', file + '.spec.js'))).digest('hex') !== hash) throw new Error('执行期间BDD生成文件变化')
    if (JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(source) || JSON.stringify(await verifyBuildIdentity(root)) !== JSON.stringify(built) || !(await readFile(join(root, 'tests/e2e/test-tiers.json'))).equals(bytes)) throw new Error('执行期间源码、构建或测试计划变化')
    summary.status = 'passed'
  } catch (error) { summary.errors.push(String(error)); if (controller.signal.aborted) summary.status = 'cancelled'; process.exitCode = 1 }
  finally { process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel); summary.completedAt = new Date().toISOString(); await save(join(directory, 'summary.json'), summary); console.log(`${tier}: ${summary.status}; ${directory}`) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
