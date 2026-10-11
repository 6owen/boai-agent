/*
 * [INPUT]: Vite、宿主源码及可选完整 Electron 启动参数。
 * [OUTPUT]: pnpm dev 启动真实开发窗口；BDD使用系统分配的独立端口，不占用或关闭用户开发窗口；默认入口仍为项目根目录。
 * [POS]: 开发入口，不生成安装包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */

import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'
import { buildHost } from './build.mjs'

await buildHost()
const server = await createServer(process.env.BOAI_TEST_DEV_SERVER === '1' ? { server: { port: 0 } } : undefined)
await server.listen()
const args = process.argv.slice(2)
const child = spawn(electron, args.length ? args : ['.'], {
  stdio: 'inherit', env: { ...process.env, BOAI_RENDERER_URL: server.resolvedUrls.local[0] },
})
let closing = false
async function close() {
  if (closing) return
  closing = true
  child.kill('SIGTERM')
  await server.close()
}
child.once('exit', async (code) => { await close(); process.exit(code ?? 0) })
process.on('SIGINT', async () => { await close(); process.exit(0) })
process.on('SIGTERM', async () => { await close(); process.exit(0) })
