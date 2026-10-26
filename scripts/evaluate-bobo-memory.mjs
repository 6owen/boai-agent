/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: Explicit connection ID; read-only product credential bridge and synthetic bobo memory probe.
 * [OUTPUT]: Isolated real-model evidence with 12-request/10k-output-token/6-minute hard limits.
 * [POS]: Manual bobo Memory quality evaluation; does not change the user's daily database.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
if (!connectionId || process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-bobo-memory.mjs CONNECTION_ID')
const output = resolve(`.local/memory-evaluation/BOBO-v1-${Date.now()}`); await mkdir(output, { recursive: true })
const settings = { output, connectionId, dataPath: join(homedir(), 'Library/Application Support/BoAI Agent/v2'), maxRequests: 12, maxOutputTokens: 10_000, deadlineMs: 360_000, hashes: {} }
for (const file of ['packages/runtime/src/adapters/mastra/conversation-memory.ts', 'packages/runtime/src/service.ts', 'packages/runtime/src/modules/memory/memory-repository.ts', 'tests/evaluation/bobo-memory.ts', 'pnpm-lock.yaml']) settings.hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: `import { runBoboMemoryEvaluation } from './tests/evaluation/bobo-memory.ts'; process.once('message', input => { runBoboMemoryEvaluation(input).then(() => process.exit(0), error => { process.stderr.write(error.message+'\\n'); process.exit(1) }) });`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env }); process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)))
