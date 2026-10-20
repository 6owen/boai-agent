/*
 * [INPUT]: 本开发宿主持有的HTTP/SSE/MCP/stdio进程及仓库锁。
 * [OUTPUT]: 冻结启动PID、关闭后停止新操作；排空在途调用及最终持久化、核对真实退出后解锁。
 * [POS]: 开发画板关闭边界，不重放业务写入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { setTimeout } from 'node:timers/promises'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
export class DesignStdioTransport extends StdioClientTransport {
  startedPid = null
  async start() {
    // Client.initialize失败会异步close并清空SDK内部PID；必须在初始化请求之前留存身份。
    try { await super.start() } finally { this.startedPid = this.pid }
  }
}
export function createDesignActivity() {
  let stopping = false
  const pending = new Set()
  const assertOpen = () => { if (stopping) throw new Error('开发宿主正在关闭') }
  return {
    assertOpen,
    stop: () => { stopping = true },
    run: action => {
      const work = Promise.resolve().then(() => { assertOpen(); return action() })
      pending.add(work)
      const remove = () => pending.delete(work)
      work.then(remove, remove)
      return work
    },
    drain: async () => { while (pending.size) await Promise.allSettled([...pending]) },
  }
}
const alive = pid => {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error }
}
export async function closeDesignResources(resources) {
  const errors = [], attempt = async action => { try { await action() } catch (error) { errors.push(error) } }
  for (const stream of resources.events) await attempt(() => stream.end())
  await Promise.all([
    ...resources.sessions.map(session => attempt(() => session.close())),
    attempt(async () => {
      if (!resources.http) return
      resources.http.closeAllConnections()
      await new Promise((resolve, reject) => resources.http.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()))
    }),
  ])
  await Promise.all([attempt(() => resources.client?.close()), attempt(() => resources.transport?.close())])
  // 先关闭协议使挂起调用结束，再排空调用和最终写队列；不能截取关闭开始时的旧Promise。
  let drained = true
  try { await resources.drainOperations?.(); await resources.drainPersistence() } catch (error) { errors.push(error); drained = false }
  // SDK在最后SIGKILL后立即返回；锁必须等本轮真实子进程退出。
  const deadline = Date.now() + 5_000
  while (alive(resources.pid) && Date.now() < deadline) await setTimeout(20)
  const connections = resources.http ? await new Promise((resolve, reject) => resources.http.getConnections((error, count) => error ? reject(error) : resolve(count))) : 0
  const stopped = drained && !resources.http?.listening && connections === 0 && !alive(resources.pid)
  if (stopped) {
    await attempt(resources.removeInfo)
    await attempt(resources.release)
  } else errors.push(new Error('开发宿主资源未实际退出，保留独占锁；不能启动新实例'))
  if (errors.length) {
    const error = new AggregateError(errors, errors.map(item => String(item.message ?? item)).join('；'))
    error.resourcesStopped = stopped
    throw error
  }
}
