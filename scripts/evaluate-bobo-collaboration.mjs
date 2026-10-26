/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 显式已保存连接、只读凭据桥和 BC-v1 两个独立真实模型场景。
 * [OUTPUT]: 全已有/补缺员的真实组织与依赖交付证据及阶段合同源码hash；累计48请求/40000已知输出token/240秒，不改冻结留出题或用户数据库。
 * [POS]: BC4 手动评估入口；初始化期限和实际失败留证，人工质量独立 pending。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
if (!connectionId || process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-bobo-collaboration.mjs CONNECTION_ID')
const output = resolve(`.local/bobo-collaboration-evaluation/BC-v1-${Date.now()}`)
await mkdir(dirname(output), { recursive: true }); await mkdir(output)
const settings = { version: 'BC-v1', output, connectionId, dataPath: join(homedir(), 'Library/Application Support/BoAI Agent/v2'), maxRequests: 48, maxOutputTokens: 40000, deadlineMs: 240000, hashes: {} }
for (const file of ['tests/evaluation/bobo-collaboration.ts','packages/runtime/src/service.ts','packages/runtime/src/modules/bobo-collaboration/service.ts','packages/runtime/src/modules/collaboration/work-collaboration.ts','packages/runtime/src/group-scheduler.ts','packages/runtime/src/adapters/mastra/engine.ts','packages/runtime/src/adapters/mastra/agent-factory.ts','packages/runtime/src/adapters/mastra/task-runtime.ts','packages/runtime/src/modules/collaboration/work-protocol.ts','packages/runtime/src/contracts.ts','packages/runtime/src/adapters/mastra/deepseek-reasoning-model.ts','pnpm-lock.yaml']) {
  try { settings.hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex') } catch (error) { throw new Error(`评估源文件不可读：${file}`, { cause: error }) }
}
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: `import { runBoboCollaborationEvaluation } from './tests/evaluation/bobo-collaboration.ts'; process.once('disconnect',()=>process.exit(1)); process.once('message',input=>runBoboCollaborationEvaluation(input).then(()=>process.exit(process.exitCode??0),e=>{process.stderr.write(e.message+'\\n');process.exit(1)}));`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env })
let deadline
const started = Date.now()
const watchdog = setInterval(async () => {
  let initialized = false; try { await readFile(join(output, 'model.json')); initialized = true } catch {}
  deadline = initialized ? settings.deadlineMs + 15000 : 30000
  if (Date.now() - started <= deadline) return
  clearInterval(watchdog)
  await writeFile(join(output, 'environment-timeout.json'), JSON.stringify({ status: initialized ? 'incomplete' : 'environment_pending', phase: initialized ? 'model_execution' : 'credential_bridge', error: '本次实际评估达到有界期限；系统原因未证明，不推断锁屏或供应商能力', ...(!initialized ? { providerRequests: 0 } : {}), humanQuality: 'pending' }, null, 2))
  child.kill('SIGKILL')
}, 1000)
process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
clearInterval(watchdog)
