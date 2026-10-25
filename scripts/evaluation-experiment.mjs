/*
 * [OUTPUT]: 应用与评估编译按当前工作区公开exports解析，保留原执行与分发合同。
 * [INPUT]: build/hillclimb及init/run/status/review、业务任务分组和源码/模型选择。
 * [OUTPUT]: 业务审阅包、真实API实验、独立评审与Codex隔离候选；旧手动实验保持，不自动提交或发布。
 * [POS]: scripts/evaluation-experiment.mjs，第15组实验生命周期CLI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2), command = args.shift()
const usage = 'Usage: pnpm eval:build --root PATH --config JSON\n       pnpm eval:hillclimb --root PATH --source PATH\n       pnpm eval:experiment init --root PATH --config JSON\n       pnpm eval:experiment run --root PATH --source PATH --hypothesis TEXT\n       pnpm eval:experiment review --root PATH --reviews JSON [--calibration JSON]\n       pnpm eval:experiment status --root PATH\nrun and hillclimb call real BOAI providers; hillclimb may call Codex. Pending quality stops optimization. No automatic publishing or final holdout reuse.\n'
if (!command || command === '--help' || args.includes('--help')) { process.stdout.write(usage); process.exit(0) }
const allowed = { build: ['--root', '--config'], hillclimb: ['--root', '--source'], init: ['--root', '--config'], run: ['--root', '--source', '--hypothesis'], review: ['--root', '--reviews', '--calibration'], status: ['--root'] }[command]
if (!allowed) throw new Error(usage)
const options = new Map()
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.includes(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid or duplicate option: ${args[index]}`)
  options.set(args[index], args[index + 1])
}
const required = name => { const value = options.get(name); if (!value) throw new Error(`Missing ${name}`); return value }
const root = resolve(required('--root')), read = async path => JSON.parse(await readFile(resolve(path), 'utf8'))
const toolsRoot = resolve('.local/evaluation-tools'); await mkdir(toolsRoot, { recursive: true })
const temporary = await mkdtemp(join(toolsRoot, 'experiment-'))
const abort = new AbortController(), cancel = () => abort.abort()
process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
try {
  const modulePath = join(temporary, 'experiment.mjs')
  await build({ stdin: { contents: "export * from './tests/evaluation/optimization.ts'; export * from './tests/evaluation/hillclimb.ts'", resolveDir: process.cwd() }, outfile: modulePath, platform: 'node', format: 'esm', target: 'node22', packages: 'external', bundle: true })
  const api = await import(pathToFileURL(modulePath).href)
  let result
  if (command === 'build') result = await api.buildBusinessEval(root, await read(required('--config')))
  else if (command === 'hillclimb') result = await api.runBusinessHillclimb(root, resolve(required('--source')), abort.signal)
  else if (command === 'init') result = await api.registerExperiment(root, await read(required('--config')))
  else if (command === 'run') result = await api.runExperimentRound(root, resolve(required('--source')), required('--hypothesis'))
  else if (command === 'review') result = await api.reviewExperimentRound(root, await read(required('--reviews')), options.has('--calibration') ? await read(options.get('--calibration')) : undefined)
  else {
    const status = await api.experimentStatus(root)
    result = { id: status.plan.id, used: status.used, maxRequests: status.plan.maxRequests, incumbent: status.incumbent, stopReason: status.stopReason,
      rounds: status.rounds.map(round => ({ index: round.started.index, hypothesis: round.started.hypothesis, status: round.finished?.decision.status ?? 'unfinished', calls: round.finished?.calls, reasons: round.finished?.decision.reasons, business: round.finished?.decision.business })) }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  if (result.decision?.status === 'blocked') process.exitCode = 2
  else if (result.decision?.status === 'regressed') process.exitCode = 1
  else if (command === 'hillclimb' && result.stopReason !== 'quality-saturated') process.exitCode = result.incumbent > 0 ? 0 : 2
  if (abort.signal.aborted) process.exitCode = 130
} finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); await rm(temporary, { recursive: true, force: true }) }
