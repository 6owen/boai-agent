/*
 * [INPUT]: 源码版本、固定评估场景/样本编号、只读本地连接和显式运行参数。
 * [OUTPUT]: 构建并运行独立 Electron 凭据桥及真实模型评估进程。
 * [POS]: 手动真实模型验收入口；不进入 pnpm test，也不修改产品数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import electron from 'electron'

const args = process.argv.slice(2), option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] }
if (args.includes('--help')) {
  process.stdout.write('Usage: pnpm eval:collaboration --label NAME [--source PATH] [--samples 5] [--sample-start 1] [--cases id,id] [--connection ID] [--output PATH] [--max-requests 600]\nUses only saved model configuration and synthetic data. All attempts, including failures, are retained.\n')
  process.exit(0)
}
const label = option('--label', '')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Specify a unique --label using lowercase letters, numbers and hyphens')
const source = resolve(option('--source', '.')), samples = Number(option('--samples', '5'))
const sampleStart = Number(option('--sample-start', '1'))
const maxRequests = Number(option('--max-requests', '600'))
if (!Number.isInteger(samples) || samples < 1 || !Number.isInteger(sampleStart) || sampleStart < 1 || sampleStart + samples - 1 > 5 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 1000) throw new Error('Invalid bounded sampling/request configuration')
const output = resolve(option('--output', `.local/collaboration-evaluation/${label}-${Date.now()}`))
await mkdir(dirname(output), { recursive: true }); await mkdir(output, { recursive: false })
const buildDir = resolve('.local/evaluation-runtime'); await mkdir(buildDir, { recursive: true })
const hashes = {}
for (const file of ['src/runtime/group-scheduler.ts', 'src/runtime/service.ts', 'src/runtime/adapters/mastra/agent-factory.ts', 'src/runtime/adapters/mastra/engine.ts']) hashes[file] = createHash('sha256').update(await readFile(join(source, file))).digest('hex')
const settings = { label, source, output, samples, sampleStart, maxRequests, cases: option('--cases', '').split(',').filter(Boolean), connectionId: option('--connection', undefined), dataPath: option('--data', join(homedir(), 'Library/Application Support/BoAI Agent/v2')), revision: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes }
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(buildDir, `${label}-worker.mjs`), host = join(buildDir, `${label}-host.cjs`)
await build({ stdin: { contents: `import { AppService } from ${JSON.stringify(join(source, 'src/runtime/service.ts'))}; import { MastraEngine } from ${JSON.stringify(join(source, 'src/runtime/adapters/mastra/engine.ts'))}; import { runEvaluation } from ${JSON.stringify(resolve('tests/evaluation/harness.ts'))}; process.once('message', input => { runEvaluation(input, { AppService, MastraEngine }).then(() => process.exit(process.exitCode ?? 0), error => { process.stderr.write(String(error?.message ?? error)+'\\n'); process.exit(1) }) });`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', nodePaths: [resolve('node_modules')] })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env })
process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
