/*
 * [INPUT]: IPC 请求、AppService、Mastra 适配器与凭据代理。
 * [OUTPUT]: 本地运行进程的服务装配和消息处理。
 * [POS]: src/runtime/worker.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { AppService } from './service'
import { MastraEngine } from './adapters/mastra/engine'
import type { RpcRequest } from '../shared/ipc'
import type { SecretStore } from './contracts'

const port = process.parentPort
if (!port) throw new Error('The agent runtime must be launched by Electron.')
const dataPath = process.argv[2]
if (!dataPath) throw new Error('Missing application data path.')
const pendingSecrets = new Map<string, { resolve: (value: string | undefined) => void; reject: (error: Error) => void }>()
function secret(operation: 'get' | 'set' | 'delete', key: string, value?: string): Promise<string | undefined> {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingSecrets.delete(id); reject(new Error('系统凭据服务未响应。')) }, 15_000)
    pendingSecrets.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
    port.postMessage({ type: 'secret', id, operation, key, value })
  })
}
const secrets: SecretStore = {
  get: (id) => secret('get', id),
  set: async (id, value) => { await secret('set', id, value) },
  delete: async (id) => { await secret('delete', id) },
}
const service = new AppService({ dataPath, secrets, engine: new MastraEngine(), emit: (event) => port.postMessage({ type: 'event', event }) })
let shuttingDown = false
port.on('message', async ({ data }) => {
  if (data?.type === 'secret-result') {
    const pending = pendingSecrets.get(data.id)
    pendingSecrets.delete(data.id)
    if (data.error) pending?.reject(new Error(data.error))
    else pending?.resolve(data.value)
    return
  }
  if (data?.type === 'shutdown') {
    shuttingDown = true
    await service.close()
    port.postMessage({ type: 'stopped' })
    return
  }
  if (data?.type !== 'request' || shuttingDown) return
  const request = data.request as RpcRequest
  try {
    const result = request.method as string === '__backup'
      ? await service.backup((request.input as { destination: string }).destination)
      : await service.handle(request.method, request.input)
    port.postMessage({ type: 'response', response: { id: request.id, result } })
  } catch (error) {
    port.postMessage({ type: 'response', response: { id: request.id, error: error instanceof Error ? error.message : '操作失败' } })
  }
})
await service.init()
port.postMessage({ type: 'ready' })
