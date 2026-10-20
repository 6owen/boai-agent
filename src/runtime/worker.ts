/*
 * [OUTPUT]: 桌面宿主提供同包只读技能源路径，新 Bobo 沿原服务初始化默认绑定。
 * [OUTPUT]: 当前包的员工脚本工具库位置交给原AppService租约，不依赖全局boai安装或PATH。
 * [OUTPUT]: 2026-10-19应用业务协议：worker反向请求实际桌面外观/插件服务，沿原宿主边界。
 * [OUTPUT]: 仅启动竞争失败时发owner-busy，主进程等本worker实际退出再认证附着原服务；不受理业务。
 * [OUTPUT]: 原父端口与附着桌面复用显式dispatchRuntime，内部方法不开放给普通CLI。
 * [OUTPUT]: 与独立服务共用owner装配；原服务/适配器实际排空后才释放配置锁。
 * [OUTPUT]: 版本化Magpie系统导入先持久草稿、明确确认后事务保存连接/回执；冷启动有界队列、未知核对和Sonner反馈，完整应用验收仍待运行。
 * [OUTPUT]: 通用插件执行路由、独立宿主/租约与产品桥；插件session恢复、私有目录备份排除，旧引擎兼容。
 * [OUTPUT]: 2026-10-14固定网页引用由宿主核源；本机只读租约绑定真实消息/run，写操作沿Work；重开窗口使用独立实例身份。
 * [INPUT]: IPC 请求、AppService、Mastra 适配器与凭据代理。
 * [OUTPUT]: 私有浏览器 bridge 和 Main 实际开始反向握手；drain 不以超时释放资源；仅主进程可访问的通知领取/回执通道；本地运行进程装配、消息处理及仅宿主可指定位置的备份/技能库导出。
 * [POS]: src/runtime/worker.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startOwnedRuntime } from './bootstrap'
import { RuntimeOwnedError } from './owner'
import { MastraEngine } from './adapters/mastra/engine'
import { dispatchRuntime } from './dispatch'
import type { RpcRequest } from '../shared/ipc'
import type { BrowserHostBridge, BrowserHostMethods } from '../shared/ipc/browser'
import type { ApplicationHostPort, ApplicationHostMethod } from '../shared/ipc/application-host'
import type { Methods } from '../shared/ipc'
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
const pendingBrowser = new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>()
const browserHost:BrowserHostBridge = {
  request: <K extends keyof BrowserHostMethods>(method:K,input:BrowserHostMethods[K]['input']) => new Promise<BrowserHostMethods[K]['output']>((resolve,reject) => {
    const id=randomUUID()
    // Actual CDP exit is authoritative. A timer must not release a browser lease.
    pendingBrowser.set(id,{resolve:value=>resolve(value as BrowserHostMethods[K]['output']),reject})
    port.postMessage({type:'browser-host',id,method,input})
  }),
}
const pendingApplication = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>()
const applicationHost: ApplicationHostPort = {
  available: true,
  request: <K extends ApplicationHostMethod>(method: K, input: Methods[K]['input']) => new Promise<Methods[K]['output']>((resolve, reject) => {
    const id = randomUUID()
    pendingApplication.set(id, { resolve: value => resolve(value as Methods[K]['output']), reject })
    port.postMessage({ type: 'application-host', id, method, input })
  }),
}
process.env.BOAI_RUNTIME_PLUGIN_BUNDLE ??= fileURLToPath(new URL('./plugins/', import.meta.url)).replace(/app\.asar(?=[/\\])/, 'app.asar.unpacked')
let starting: ReturnType<typeof startOwnedRuntime>
let service: Awaited<ReturnType<typeof startOwnedRuntime>>['service']
let shuttingDown = false
port.on('message', async ({ data }) => {
  if (data?.type === 'application-host-result') { const pending = pendingApplication.get(data.id); pendingApplication.delete(data.id); if (data.error) pending?.reject(new Error(data.error)); else pending?.resolve(data.result); return }
  if (data?.type === 'browser-host-result') {
    const pending=pendingBrowser.get(data.id); pendingBrowser.delete(data.id)
    if (data.error) pending?.reject(new Error(data.error)); else pending?.resolve(data.result)
    return
  }
  if (data?.type === 'secret-result') {
    const pending = pendingSecrets.get(data.id)
    pendingSecrets.delete(data.id)
    if (data.error) pending?.reject(new Error(data.error))
    else pending?.resolve(data.value)
    return
  }
  if (data?.type === 'shutdown') {
    shuttingDown = true
    try { await (await starting).close() }
    catch (error) { if (!(error instanceof RuntimeOwnedError)) throw error }
    port.postMessage({ type: 'stopped' })
    return
  }
  if (data?.type !== 'request' || shuttingDown || !service) return
  const request = data.request as RpcRequest
  try {
    const result = await dispatchRuntime(service, request.method, request.input)
    port.postMessage({ type: 'response', response: { id: request.id, result } })
  } catch (error) {
    port.postMessage({ type: 'response', response: { id: request.id, error: error instanceof Error ? error.message : '操作失败' } })
  }
})
starting = startOwnedRuntime({ dataPath, skillDiscovery: { bundledRoot: fileURLToPath(new URL('../agent-skills/', import.meta.url)) }, secrets, browserHost, applicationHost, toolClientPath: fileURLToPath(new URL('../cli/employee-tools.mjs', import.meta.url)), engine: new MastraEngine({ memoryPath: join(dataPath, 'memory', 'bobo-mastra.db') }), emit: (event) => port.postMessage({ type: 'event', event }) })
try {
  const owned = await starting; service = owned.service
  if (!shuttingDown) port.postMessage({ type: 'ready', owner: owned.owner })
} catch (error) {
  if (!(error instanceof RuntimeOwnedError)) throw error
  // No AppService was initialized and no business request was accepted. The parent stops this
  // losing process and authenticates the winner only after observing our actual exit.
  port.postMessage({ type: 'owner-busy' })
}
