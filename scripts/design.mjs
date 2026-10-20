/*
 * [INPUT]: prepare/serve与明确固定上游目录；默认当前仓库。
 * [OUTPUT]: 本机开发画板准备或前台服务；配置仅写.local/design，不改全局Codex。
 * [POS]: 第22组开发侧CLI，完整使用约定见05。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { prepareUpstream } from './design/upstream.mjs'
import { startDesignServer } from './design/server.mjs'
import { resolve } from 'node:path'
const [command, ...args] = process.argv.slice(2), options = new Map()
const usage = 'design.mjs prepare --upstream CHECKOUT [--root REPO] | serve [--root REPO] [--port NUMBER]'
if (!command || command === '--help') { console.log(usage); process.exit(0) }
const allowed = command === 'prepare' ? ['--upstream','--root'] : command === 'serve' ? ['--root','--port'] : []
for (let i = 0; i < args.length; i += 2) { if (!allowed.includes(args[i]) || !args[i+1] || options.has(args[i])) throw new Error(usage); options.set(args[i],args[i+1]) }
if (!allowed.length) throw new Error(usage)
const root = resolve(options.get('--root') ?? '.')
if (command === 'prepare') {
  if (!options.has('--upstream')) throw new Error(usage)
  const receipt = await prepareUpstream(root, resolve(options.get('--upstream')))
  console.log(JSON.stringify({ commit: receipt.commit, files: receipt.files.length, plugin: receipt.plugin },null,2))
} else {
  const port = options.has('--port') ? Number(options.get('--port')) : 0
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('无效本机端口')
  const server = await startDesignServer({ root, port })
  console.log(JSON.stringify({ editor: server.editor, mcp: server.mcp, pid: server.pid }, null, 2))
  const stop = async () => { await server.close(); process.exitCode = 0 }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
}
