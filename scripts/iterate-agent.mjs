/*
 * [OUTPUT]: 应用与评估编译按当前工作区公开exports解析，保留原执行与分发合同。
 * [INPUT]: 固定开发计划、新实验目录和源码目录；可选只读状态查询。
 * [OUTPUT]: 一条命令运行Codex开发自迭代、打印停止与补丁位置；不改当前工作树或自动提交。
 * [POS]: scripts/iterate-agent.mjs，pnpm dev:repair入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2), command = args.shift()
const help = 'pnpm dev:repair run --config PLAN.json --root NEW_DIR [--source PATH]\npnpm dev:repair status --root DIR\nThe run command starts bounded Codex sessions and fixed local tests in isolated copies. Produces best.patch; never changes the source checkout.\n'
if (!command || command === '--help' || args.includes('--help')) { process.stdout.write(help); process.exit(0) }
const allowed = command === 'run' ? ['--config', '--root', '--source'] : command === 'status' ? ['--root'] : []
if (!allowed.length) throw new Error(help)
const options = new Map()
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.includes(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid or duplicate option: ${args[index]}`)
  options.set(args[index], args[index + 1])
}
const required = key => { const value = options.get(key); if (!value) throw new Error(`Missing ${key}`); return value }
const root = resolve(required('--root')), controller = new AbortController()
const interrupt = () => controller.abort(new Error('Cancelled by user'))
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
const tools = resolve('.local/evaluation-tools'); await mkdir(tools, { recursive: true })
const temporary = await mkdtemp(join(tools, 'repair-'))
try {
  const modulePath = join(temporary, 'repair.mjs')
  await build({ entryPoints: ['tests/evaluation/repair.ts'], outfile: modulePath, platform: 'node', format: 'esm', target: 'node22', packages: 'external', bundle: true })
  const api = await import(pathToFileURL(modulePath).href)
  const result = command === 'run'
    ? await api.runRepairLoop(resolve(options.get('--source') ?? '.'), root, JSON.parse(await readFile(resolve(required('--config')), 'utf8')), controller.signal)
    : await api.repairStatus(root)
  process.stdout.write(JSON.stringify({ root, stopReason: result.stopReason, codexInvocations: result.codexInvocations, incumbent: result.incumbent,
    knownTokens: result.knownTokens, usageComplete: result.usageComplete, sourceUnchanged: result.sourceUnchanged, semanticQuality: result.semanticQuality, evidenceGaps: result.evidenceGaps,
    patch: result.patch && join(root, result.patch), rounds: result.rounds?.map(round => ({ index: round.index, status: round.status, failed: round.evaluation?.checks.filter(check => check.status === 'failed').length, reasons: round.reasons })) }, null, 2) + '\n')
  if (result.stopReason === 'cancelled') process.exitCode = 130
  else if (result.evidenceGaps?.length || ['blocked', 'error', 'running-or-interrupted'].includes(result.stopReason)) process.exitCode = 2
  else if (!['checks-passed', 'baseline-already-passed'].includes(result.stopReason)) process.exitCode = 1
} finally {
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt)
  await rm(temporary, { recursive: true, force: true })
}
