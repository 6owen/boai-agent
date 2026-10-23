/*
 * [INPUT]: 固定collaboration-suite BDD、显式offline/real模式、可选标题过滤和1–3次独立样本。
 * [OUTPUT]: pnpm dev多Agent用例集执行、源码/预算登记、所有成功失败的原始留证与回放归档及独立报告。
 * [POS]: 第14组可重复验收入口，复用Playwright BDD/Desktop，不安装依赖或构建安装包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { buildHost } from './build.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
if (args.includes('--help')) {
  process.stdout.write('pnpm test:collaboration [--mode offline|real] [--repeat 1..3] [--grep TITLE_PATTERN] [--output NEW_DIR] [--list]\nReal mode requires BOAI_TEST_API_DATA_DIR and BOAI_TEST_API_CONNECTION_ID for an explicitly selected saved API connection. Every attempt is isolated; failed attempts are retained.\n')
  process.exit(0)
}
const mode = option('--mode', 'offline'), repeat = Number(option('--repeat', '1'))
if (!['offline', 'real'].includes(mode) || !Number.isInteger(repeat) || repeat < 1 || repeat > 3) throw new Error('mode必须为offline或real，repeat必须为1–3')
const selection = mode === 'real' ? ['--grep', '(?=.*@collaboration-suite)(?=.*(?:@real-api|@group-coordination))'] : ['--grep', '(?=.*@collaboration-suite)', '--grep-invert', '@real-api']
const pattern = option('--grep')
if (pattern) { new RegExp(pattern); selection[1] += `(?=.*(?:${pattern}))` }
const env = { ...process.env, BOAI_TEST_DEV_SERVER: '1' }
delete env.BOAI_TEST_PACKAGED_PATH
if (mode === 'real') env.BOAI_TEST_REAL_API = '1'
else delete env.BOAI_TEST_REAL_API

async function command(command, argv, logFile) {
  const log = logFile ? createWriteStream(logFile, { flags: 'wx' }) : undefined
  const child = spawn(command, argv, { env, stdio: log ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  if (log) { child.stdout.on('data', chunk => log.write(chunk)); child.stderr.on('data', chunk => log.write(chunk)) }
  const forward = () => child.kill('SIGINT')
  process.once('SIGINT', forward)
  try {
    return await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', code => resolveExit(code ?? 1)) })
  } finally { process.removeListener('SIGINT', forward); if (log) await new Promise(resolveClose => log.end(resolveClose)) }
}
if (await command('pnpm', ['exec', 'bddgen'])) throw new Error('BDD生成失败')
if (args.includes('--list')) { process.exitCode = await command('pnpm', ['exec', 'playwright', 'test', ...selection, '--list']); process.exit(process.exitCode) }
if (mode === 'real' && (!env.BOAI_TEST_API_DATA_DIR || !env.BOAI_TEST_API_CONNECTION_ID)) throw new Error('真实模式必须显式指定已保存配置来源和连接ID；不猜测模型或读取其他凭据')
const output = resolve(option('--output', `.local/feature-review/collaboration-suite-${Date.now()}`))
await mkdir(dirname(output), { recursive: true })
await mkdir(output, { recursive: false })
const batch = join(output, 'run'); await mkdir(batch)
env.BOAI_REVIEW_RUN_DIR = batch
env.PLAYWRIGHT_JSON_OUTPUT_NAME = join(batch, 'playwright-results.json')
await buildHost()
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const files = {}
for (const directory of ['src', 'scripts', 'tests']) for (const entry of (await readdir(directory, { recursive: true })).sort()) {
  if (!/\.(ts|tsx|mjs|feature)$/.test(entry)) continue
  const file = `${directory}/${entry}`; files[file] = sha(await readFile(file))
}
for (const file of ['package.json', 'pnpm-lock.yaml', 'playwright.config.ts', 'tests/evaluation/holdout-manifest.json', 'ai-docs/spec/14.Agent群聊协作/07-GitHub参考与多轮测试用例集.md', 'dist/main/main.cjs', 'dist/runtime/worker.mjs']) files[file] = sha(await readFile(file))
const recordedAt = new Date().toISOString()
await writeFile(join(batch, 'build-manifest.json'), JSON.stringify({ recordedAt, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: true, desktopMode: 'pnpm-dev', sourceAndBuildDigest: sha(JSON.stringify(files)), files }, null, 2))
await writeFile(join(batch, 'registration.json'), JSON.stringify({ runId: 'group-collaboration-suite-v1', recordedAt, desktopMode: 'development', desktopModelMode: mode === 'real' ? 'real-provider' : 'offline-protocol', command: 'pnpm dev', repeat, selection, budgets: 'Original product per-turn and per-root request/output/deadline budgets. No renewal or retry-until-success. Playwright retries disabled; repeat-each creates independent samples.', contract: 'ai-docs/spec/14.Agent群聊协作/07-GitHub参考与多轮测试用例集.md' }, null, 2))
process.stdout.write(`Running ${mode} collaboration suite (${repeat} independent sample(s)); evidence: ${batch}\n`)
const exitCode = await command('pnpm', ['exec', 'playwright', 'test', ...selection, '--repeat-each', String(repeat), '--retries', '0', '--reporter=list,json'], join(batch, 'run.log'))
let resources = 0, traces = 0
for (const directory of await readdir(join(batch, 'scenarios'))) {
  const folder = join(batch, 'scenarios', directory), file = join(folder, 'manifest.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  for (const item of manifest.evidence) {
    const bytes = await readFile(join(folder, item.path))
    if (sha(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error(`留证hash不符：${item.label}`)
    resources++
  }
  for (const trace of manifest.traces) {
    const bytes = await readFile(trace.path)
    if (sha(bytes) !== trace.sha256 || bytes.length !== trace.bytes) throw new Error('回放hash不符')
    const target = join(folder, `trace-launch-${trace.launch}.zip`)
    await copyFile(trace.path, target)
    trace.originalPath = trace.path; trace.path = target; traces++
  }
  await writeFile(file, JSON.stringify(manifest, null, 2))
}
const changed = []
for (const [file, hash] of Object.entries(files)) if (sha(await readFile(file)) !== hash) changed.push(file)
await writeFile(join(batch, 'verification.json'), JSON.stringify({ resources, traces, sourceInputs: Object.keys(files).length, changed, exitCode }, null, 2))
if (await command('node', ['scripts/generate-feature-review.mjs', '--input', batch, '--output', join(output, 'report')])) throw new Error('报告生成失败；原始运行保留')
process.stdout.write(`Result: ${exitCode ? 'FAILED (retained)' : 'PASSED'}; verified ${resources} resources, ${traces} traces. Report: ${join(output, 'report/index.html')}\n`)
process.exitCode = changed.length ? 1 : exitCode
