/*
 * [INPUT]: Vite、当前worktree宿主源码及可选完整 Electron 启动参数。
 * [OUTPUT]: 根或Electron应用目录调用均定位当前worktree，保留原开发启动参数。
 * [OUTPUT]: pnpm dev 启动真实开发窗口；BDD首次分配独立端口，重启显式复用同一origin验证持久记录；端口冲突直接失败，不占用或关闭用户开发窗口。
 * [POS]: 开发入口，不生成安装包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */

import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'
import { buildHost } from './build.mjs'
import { workspaceRoot } from './workspace-packages.mjs'

process.chdir(workspaceRoot)
await buildHost()
const testPort = Number(process.env.BOAI_TEST_DEV_PORT ?? 0)
const server = await createServer(process.env.BOAI_TEST_DEV_SERVER === '1' ? { server: { port: testPort, strictPort: testPort !== 0 } } : undefined)
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
