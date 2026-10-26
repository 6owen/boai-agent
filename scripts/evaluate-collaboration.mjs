/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 源码版本、固定评估场景/样本编号、只读本地连接和显式运行参数。
 * [OUTPUT]: 支持零调用预登记/原登记执行、前后输入核验及模型配置锁定；隔离真实评估共用请求总预算。
 * [POS]: 手动真实模型验收入口；不进入 pnpm test，也不修改产品数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import electron from 'electron'

const args = process.argv.slice(2), option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] }
if (args.includes('--help')) {
  process.stdout.write('Usage: pnpm eval:collaboration --label NAME [--source PATH] [--samples 5] [--sample-start 1] [--cases id,id] [--connection ID] [--output PATH] [--max-requests 600] [--budget-file PATH] [--split regression|development|holdout] [--team multi|single] [--connections id,id] [--prepare]\nExecute a saved registration: --registered-settings PATH\nUses only saved model configuration and synthetic data. All attempts, including failures, are retained.\n')
  process.exit(0)
}
const registeredPath = option('--registered-settings', undefined)
if (registeredPath && args.length !== 2) throw new Error('Registered execution cannot override saved settings')
const registered = registeredPath ? JSON.parse(await readFile(resolve(registeredPath), 'utf8')) : undefined
const label = registered?.label ?? option('--label', '')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Specify a unique --label using lowercase letters, numbers and hyphens')
const source = registered?.source ?? resolve(option('--source', '.')), samples = registered?.samples ?? Number(option('--samples', '5'))
const sampleStart = registered?.sampleStart ?? Number(option('--sample-start', '1'))
const maxRequests = registered?.maxRequests ?? Number(option('--max-requests', '600'))
if (!Number.isInteger(samples) || samples < 1 || !Number.isInteger(sampleStart) || sampleStart < 1 || sampleStart + samples - 1 > 5 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 1000) throw new Error('Invalid bounded sampling/request configuration')
const output = registered?.output ?? resolve(option('--output', `.local/collaboration-evaluation/${label}-${Date.now()}`))
if (!registered) { await mkdir(dirname(output), { recursive: true }); await mkdir(output, { recursive: false }) }
const buildDir = join(output, 'runtime'); await mkdir(buildDir, { recursive: true })
async function snapshot() {
const hashes = {}
for (const directory of ['packages/runtime/src', 'packages/shared/src', 'packages/transport/src', 'packages/runtime-plugin-sdk/src', 'packages/runtime-plugins/src']) for (const entry of (await readdir(join(source, directory), { recursive: true })).sort()) {
  if (!/\.(ts|tsx)$/.test(entry)) continue
  const file = `${directory}/${entry}`; hashes[file] = createHash('sha256').update(await readFile(join(source, file))).digest('hex')
}
for (const file of ['package.json', 'pnpm-lock.yaml']) hashes[file] = createHash('sha256').update(await readFile(join(source, file))).digest('hex')
for (const file of ['scripts/evaluate-collaboration.mjs', 'scripts/evaluation-experiment.mjs', 'scripts/judge-evaluation.mjs', ... (await readdir('tests/evaluation')).filter(file => /\.(ts|json)$/.test(file)).sort().map(file => `tests/evaluation/${file}`)]) hashes[`evaluation:${file}`] = createHash('sha256').update(await readFile(file)).digest('hex')
return hashes
}
const hashes = await snapshot()
if (registered && JSON.stringify(hashes) !== JSON.stringify(registered.hashes)) throw new Error('Registered source or evaluator changed; no provider call started')
const split = registered?.split ?? option('--split', 'regression'), team = registered?.team ?? option('--team', 'multi')
if (!['regression','development','holdout','all'].includes(split) || !['single','multi'].includes(team)) throw new Error('Invalid dataset/team selection')
const settings = registered ?? { split, team, budgetFile: resolve(option('--budget-file', join(output, 'request-budget.json'))), connectionIds: option('--connections', '').split(',').filter(Boolean), label, source, output, samples, sampleStart, maxRequests, cases: option('--cases', '').split(',').filter(Boolean), connectionId: option('--connection', undefined), dataPath: resolve(option('--data', join(homedir(), 'Library/Application Support/BoAI Agent/v2'))), expectedModelSignature: option('--expected-model-signature', undefined), revision: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes }
if (!registered) await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2), { flag: 'wx' })
if (args.includes('--prepare')) process.exit(0)
await writeFile(join(output, 'execution-start.json'), JSON.stringify({ at: new Date().toISOString(), registered: !!registered }), { flag: 'wx' })
const worker = join(buildDir, `${label}-worker.mjs`), host = join(buildDir, `${label}-host.cjs`)
await build({ stdin: { contents: `import { AppService } from ${JSON.stringify(join(source, 'packages/runtime/src/service.ts'))}; import { MastraEngine } from ${JSON.stringify(join(source, 'packages/runtime/src/adapters/mastra/engine.ts'))}; import { runEvaluation } from ${JSON.stringify(resolve('tests/evaluation/harness.ts'))}; process.once('message', input => { runEvaluation(input, { AppService, MastraEngine }).then(() => process.exit(process.exitCode ?? 0), error => { process.stderr.write(String(error?.message ?? error)+'\\n'); process.exit(1) }) });`, resolveDir: process.cwd() }, outfile: worker, workspaceRoot: source, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', nodePaths: [resolve('node_modules')] })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env })
process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
const after = await snapshot(), changed = [...new Set([...Object.keys(hashes), ...Object.keys(after)])].filter(key => hashes[key] !== after[key])
await writeFile(join(output, 'input-verification.json'), JSON.stringify({ changed, exitCode: process.exitCode }, null, 2), { flag: 'wx' })
if (changed.length) process.exitCode = 1
