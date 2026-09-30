/*
 * [INPUT]: 显式模型连接 ID、只读产品凭据、当前团队创建源码。
 * [OUTPUT]: T1-v2 最多七例十四次请求，支持单例最多两次调用的隔离验收及源码 hash。
 * [POS]: 手动 T1.5 入口；复用已存在的系统凭据桥接。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
const caseId = process.argv[3]
const caseIds = ['writing-four', 'writing-vague', 'single-assistant', 'personalities', 'werewolf', 'tool-overreach', 'writing-twelve']
if (!connectionId || process.argv.length > 4 || (caseId && !caseIds.includes(caseId))) throw new Error('Usage: node scripts/evaluate-team-creation.mjs CONNECTION_ID [CASE_ID]')
const output = resolve(`.local/team-evaluation/T1-v2-${Date.now()}`)
await mkdir(output, { recursive: true })
const maxCases = caseId ? 1 : caseIds.length
const settings = { output, connectionId, caseId, dataPath: join(homedir(), 'Library/Application Support/BoAI Agent/v2'), caseVersion: 'T1-v2', maxCases, maxRequests: maxCases * 2, maxOutputTokensPerRequest: 8192, deadlineMsPerCase: 120000, hashes: {} }
for (const file of ['src/shared/domain/team-creation.ts', 'src/runtime/adapters/mastra/team-planner.ts', 'src/runtime/modules/teams/team-generation.ts', 'tests/evaluation/team-creation.ts', 'pnpm-lock.yaml']) settings.hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: `import { runTeamEvaluation } from './tests/evaluation/team-creation.ts'; process.once('message', input => { runTeamEvaluation(input).then(() => process.exit(0), () => process.exit(1)) });`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env })
process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
