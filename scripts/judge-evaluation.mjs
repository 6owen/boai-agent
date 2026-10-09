/*
 * [INPUT]: 实验轮次登记的judge模型、原件目录与共享预算。
 * [OUTPUT]: 原Electron只读凭据桥启动独立Mastra评审；原始评分、重复一致性和未知计量保留。
 * [POS]: scripts/judge-evaluation.mjs，内部业务评审命令，不自行选择模型或增加预算。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'
if (process.argv.length !== 3) throw new Error('Usage: node scripts/judge-evaluation.mjs REGISTERED_SETTINGS')
const settingsPath = resolve(process.argv[2]), settings = JSON.parse(await readFile(settingsPath, 'utf8'))
const runtime = join(settings.output, 'runtime'); await mkdir(runtime, { recursive: false })
const worker = join(runtime, 'judge.mjs'), host = join(runtime, 'host.cjs')
await build({ stdin: { contents: "import { runJudge } from './tests/evaluation/judge.ts'; process.once('message', input => runJudge(input).then(() => process.exit(process.exitCode ?? 0), error => { process.stderr.write(String(error?.message ?? error)); process.exit(1) }))", resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [host, settingsPath, worker], { env, stdio: 'inherit' })
const cancel = () => child.kill('SIGINT'); process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
try { process.exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)) }) }
finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel) }
