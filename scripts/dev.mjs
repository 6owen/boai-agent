import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'
import { buildHost } from './build.mjs'

await buildHost()
const server = await createServer()
await server.listen()
const child = spawn(electron, ['.'], {
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
