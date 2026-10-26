/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 显式模型连接 ID、只读产品凭据及 UM-v1 冻结样例。
 * [OUTPUT]: 最多 32 次请求/20,000 输出 token/12 分钟的隔离真实记忆质量记录和源码 hash。
 * [POS]: T2.6 手动入口；沿用系统凭据桥，不修改日常数据库或保存密钥。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
if (!connectionId || process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-unified-memory.mjs CONNECTION_ID')
const output = resolve(`.local/memory-evaluation/UM-v1-${Date.now()}`); await mkdir(output, { recursive: true })
const settings = { output, connectionId, dataPath: join(homedir(), 'Library/Application Support/BoAI Agent/v2'), maxRequests: 32, maxOutputTokens: 20000, deadlineMs: 720000, hashes: {} }
for (const file of ['packages/shared/src/domain/memory.ts', 'packages/runtime/src/service.ts', 'packages/runtime/src/modules/memory/memory-repository.ts', 'packages/runtime/src/modules/memory/memory-recall.ts', 'packages/runtime/src/adapters/mastra/engine.ts', 'tests/evaluation/unified-memory.ts', 'pnpm-lock.yaml']) settings.hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: `import { runUnifiedMemoryEvaluation } from './tests/evaluation/unified-memory.ts'; process.once('message', input => { runUnifiedMemoryEvaluation(input).then(() => process.exit(0), e => { process.stderr.write(e.message+'\\n'); process.exit(1) }) });`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env }); process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)))
