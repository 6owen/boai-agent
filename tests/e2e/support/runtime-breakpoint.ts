/*
 * [INPUT]: 本场隔离 Electron utility、生产 worker 及本机回环 Node Inspector。
 * [OUTPUT]: 不替换源码/业务结果，在消息受理、工作认领、复制前准备事务或成果发布的精确提交边界暂停；只保存位置/hash，不读取闭包、凭据或模型正文。
 * [POS]: 事务故障的桌面支撑；Inspector 仅对下一次本场 utility 开启，后续恢复正常启动。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { Desktop } from './desktop'
import { crashAutomationRuntime } from './automation-recovery'

type InspectorState = { url?: string; pid?: number; restore(): void }
type Globals = typeof globalThis & { __boaiRuntimeInspector?: InspectorState }
type Location = { scriptId: string; lineNumber: number; columnNumber: number }
type Pause = { reason: string; hitBreakpoints?: string[]; callFrames: { functionName: string; location: Location }[] }

export type RuntimeBoundary = '复制前准备事务未提交' | '复制完成未登记' | '登记事务未提交' | '消息提交前' | '消息提交后未调度' | '工作认领提交前' | '工作认领提交后未绑定运行'
const anchors: Record<RuntimeBoundary, { line: RegExp; previous?: RegExp }> = {
  '复制前准备事务未提交': { line: /^}$/, previous: /^await tx\.put\(record\d*\("artifactPublicationIntents", intent\)\);$/ },
  '复制完成未登记': { line: /^await context\.onArtifact\(artifact\);$/ },
  '登记事务未提交': { line: /^if \(previous\) await this\.finishFamilyAcceptances\(tx, logicalArtifactId, "superseded"\);$/ },
  '消息提交前': { line: /^if \(revision\d*\) await this\.artifactRepository\.commitRevision\(tx, revision\d*, message\d*\);$/ },
  '消息提交后未调度': { line: /^if \(duplicate\) return clone\d*\(this\.messages\.get\(duplicate\.id\) \?\? fail\d*\(/ },
  '工作认领提交前': { line: /^return work;$/, previous: /^await tx\.put\(row\d*\("workExecutions", execution\)\);$/ },
  '工作认领提交后未绑定运行': { line: /^run\.workId = context\.work\.id;$/ },
}

export async function runtimeBreakpoint(runtime: Desktop, boundary: RuntimeBoundary) {
  // Restart only the idle test utility to add a loopback inspector. Product files,
  // credential handling, arguments and business implementation remain unchanged.
  await runtime.app.evaluate(({ utilityProcess }) => {
    const globals = globalThis as Globals, original = utilityProcess.fork
    if (globals.__boaiRuntimeInspector) throw new Error('本场断点已初始化')
    const state: InspectorState = { restore: () => { utilityProcess.fork = original } }
    globals.__boaiRuntimeInspector = state
    utilityProcess.fork = ((entry: string, args: string[] = [], options: Electron.ForkOptions = {}) => {
      if (options.serviceName !== 'BoAI Agent Runtime' || !entry.endsWith('/runtime/worker.mjs')) return original(entry, args, options)
      state.restore()
      const child = original(entry, args, { ...options, execArgv: [...(options.execArgv ?? []), '--inspect=127.0.0.1:0'] })
      child.on('spawn', () => { state.pid = child.pid })
      let buffer = ''
      child.stderr?.on('data', chunk => {
        if (state.url) return
        buffer = (buffer + String(chunk)).slice(-4096)
        const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-zA-Z0-9-]+)/.exec(buffer)
        if (match) { state.url = match[1]; buffer = '' }
      })
      return child
    }) as typeof utilityProcess.fork
  })
  let socket: WebSocket | undefined
  try {
    await crashAutomationRuntime(runtime)
    await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    await expect.poll(() => runtime.app.evaluate(() => Boolean((globalThis as Globals).__boaiRuntimeInspector?.url)), { timeout: 15000 }).toBe(true)
    const endpoint = await runtime.app.evaluate(() => { const state = (globalThis as Globals).__boaiRuntimeInspector!; return { url: state.url!, pid: state.pid! } })
    socket = new WebSocket(endpoint.url)
    const scripts = new Map<string, string>(), pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
    let sequence = 0, paused: Pause | undefined, closed = false
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const call = pending.get(message.id); if (!call) return
        pending.delete(message.id); clearTimeout(call.timer)
        if (message.error) call.reject(new Error(`Inspector ${message.error.code}: ${message.error.message}`))
        else call.resolve(message.result)
      } else if (message.method === 'Debugger.scriptParsed') scripts.set(message.params.scriptId, message.params.url)
      else if (message.method === 'Debugger.paused') paused = message.params
    })
    socket.addEventListener('close', () => {
      closed = true
      for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error('本场Inspector已退出')) }
      pending.clear()
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('本场Inspector连接超时')), 10000)
      socket!.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket!.addEventListener('error', () => { clearTimeout(timer); reject(new Error('本场Inspector连接失败')) }, { once: true })
    })
    const call = (method: string, params: unknown = {}): Promise<any> => new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector方法超时：${method}`)) }, 10000)
      pending.set(id, { resolve, reject, timer }); socket!.send(JSON.stringify({ id, method, params }))
    })
    await call('Debugger.enable')
    const workers = [...scripts.entries()].filter(([, url]) => url.endsWith('/runtime/worker.mjs'))
    expect(workers, '只允许对本场生产worker设置断点').toHaveLength(1)
    const [scriptId, scriptUrl] = workers[0]
    const source = (await call('Debugger.getScriptSource', { scriptId })).scriptSource as string
    const anchor = anchors[boundary], lines = source.split('\n')
    const matching = lines.flatMap((line, index) => anchor.line.test(line.trim()) && (!anchor.previous || anchor.previous.test(lines[index - 1]?.trim() ?? '')) ? [index] : [])
    expect(matching, '断点锚点必须在本次生产构建中唯一').toHaveLength(1)
    const needle = lines[matching[0]].trim()
    const requested = { scriptId, lineNumber: matching[0], columnNumber: lines[matching[0]].indexOf(needle) }
    const result = await call('Debugger.setBreakpoint', { location: requested })
    expect(result.actualLocation.scriptId).toBe(scriptId)
    expect(result.actualLocation.lineNumber).toBe(requested.lineNumber)
    const evidence = { boundary, processId: endpoint.pid, scriptUrl, scriptSha256: createHash('sha256').update(source).digest('hex'), sourceLine: needle, ...(anchor.previous ? { sourcePreviousLine: lines[matching[0] - 1].trim() } : {}), line: requested.lineNumber + 1, breakpointId: result.breakpointId, actualLocation: result.actualLocation, mechanism: 'Node Inspector breakpoint, no source replacement or call-frame evaluation' }
    const hit = () => {
      if (!paused) return null
      expect(paused.hitBreakpoints).toContain(result.breakpointId)
      expect(paused.callFrames[0].location).toMatchObject({ scriptId, lineNumber: requested.lineNumber })
      return { ...evidence, reason: paused.reason, frames: paused.callFrames.map(frame => ({ functionName: frame.functionName, location: frame.location })) }
    }
    const kill = async () => {
      await runtime.app.evaluate(({ app }, pid) => {
        const current = app.getAppMetrics().find(value => value.name === 'BoAI Agent Runtime' && value.type === 'Utility')
        if (current?.pid !== pid) throw new Error('原断点进程已更换，拒绝结束其他运行服务')
        process.kill(pid, 'SIGKILL')
      }, endpoint.pid)
      await expect.poll(() => closed, { timeout: 10000 }).toBe(true)
    }
    return {
      evidence, hit, kill,
      dispose: async () => {
        if (closed) return
        if (paused) await kill()
        else { await call('Debugger.disable'); socket!.close(); await expect.poll(() => closed, { timeout: 10000 }).toBe(true) }
      },
    }
  } catch (error) {
    socket?.close()
    await runtime.app.evaluate(() => { (globalThis as Globals).__boaiRuntimeInspector?.restore() }).catch(() => {})
    throw error
  }
}
