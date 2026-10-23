/*
 * [INPUT]: Explicit connection ID; read-only credential bridge and synthetic desktop OCR evaluation.
 * [OUTPUT]: Isolated real-model report/analysis evidence with 14-request/12k-output-token/6-minute hard limits.
 * [POS]: Manual daily-report memory quality probe; no daily user data modification.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
if (!connectionId || process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-bobo-activity-memory.mjs CONNECTION_ID')
const output = resolve(`.local/memory-evaluation/ACTIVITY-v1-${Date.now()}`); await mkdir(output, { recursive: true })
const settings = { output, connectionId, dataPath: join(homedir(), 'Library/Application Support/BoAI Agent/v2'), maxRequests: 14, maxOutputTokens: 12_000, deadlineMs: 360_000, hashes: {} }
for (const file of ['src/runtime/modules/desktop-activity/activity-service.ts', 'resources/agent-skills/boai-daily-report/SKILL.md', 'tests/evaluation/bobo-activity-memory.ts', 'pnpm-lock.yaml']) settings.hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: `import { runBoboActivityMemoryEvaluation } from './tests/evaluation/bobo-activity-memory.ts'; process.once('message', input => { runBoboActivityMemoryEvaluation(input).then(() => process.exit(0), error => { process.stderr.write(error.message+'\\n'); process.exit(1) }) });`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env }); process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)))
