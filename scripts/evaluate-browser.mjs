/*
 * [INPUT]: 显式已保存连接、独立输出目录、早启动只读凭据桥与当前生产桌面构建。
 * [OUTPUT]: BRM-v1 首轮一个员工/任务、24 请求/40000 已知 tokens/120 秒的实际窗口与真实模型证据；不改用户数据库、不保存明文凭据。
 * [POS]: 手动浏览器真实模型验收入口，不进入 CI/冻结协作留出题。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import electron from 'electron'
const connectionId = process.argv[2]
if (!connectionId || process.argv.length > 3) throw new Error('Usage: node scripts/evaluate-browser.mjs CONNECTION_ID')
const output = resolve(`.local/browser-evaluation/BRM-v1-${Date.now()}`)
await mkdir(dirname(output), { recursive: true }); await mkdir(output, { recursive: false })
const settings = { version:'BRM-v1', connectionId, output, source:resolve('.'), dataPath:join(homedir(),'Library/Application Support/BoAI Agent/v2'), maxRequests:24, maxKnownTokens:40000, maxOutputTokensPerRequest:2048, deadlineMs:120000, hashes:{} }
for (const file of ['tests/evaluation/browser-delivery.ts','src/main/browser/browser-service.ts','src/main/browser/browser-pane-manager.ts','src/main/browser/browser-cdp.ts','src/runtime/modules/browser/session.ts','src/runtime/modules/browser/repository.ts','src/runtime/adapters/mastra/browser-tool.ts','src/runtime/adapters/mastra/browser-model.ts','src/runtime/adapters/mastra/engine.ts','src/runtime/adapters/mastra/deepseek-reasoning-model.ts','dist/main/main.cjs','dist/runtime/worker.mjs','pnpm-lock.yaml']) settings.hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(join(output,'settings.json'),JSON.stringify(settings,null,2))
const worker=join(output,'run.mjs'),host=join(output,'host.cjs')
await build({stdin:{contents:`import { runBrowserDelivery } from './tests/evaluation/browser-delivery.ts'; process.once('disconnect',()=>process.exit(1)); process.once('message',input=>runBrowserDelivery(input).then(()=>process.exit(process.exitCode??0),e=>{process.stderr.write(e.message+'\\n');process.exit(1)}));`,resolveDir:process.cwd()},outfile:worker,bundle:true,platform:'node',format:'esm',packages:'external',target:'node22'})
await build({entryPoints:['tests/evaluation/host.ts'],outfile:host,bundle:true,platform:'node',format:'cjs',packages:'external',target:'node22'})
process.stdout.write(`Evidence: ${output}\n`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(electron,[host,join(output,'settings.json'),worker],{stdio:'inherit',env})
process.on('SIGINT',()=>child.kill('SIGINT'))
const timer=setTimeout(async()=>{await writeFile(join(output,'environment-timeout.json'),JSON.stringify({phase:'evaluation_host_or_worker',providerRequests:'unknown',error:'真实评估整体期限已到；保留实际阶段，不推断系统原因'}));child.kill('SIGKILL')},settings.deadlineMs+30000)
process.exitCode=await new Promise(resolveExit=>child.once('exit',code=>resolveExit(code??1)))
clearTimeout(timer)
