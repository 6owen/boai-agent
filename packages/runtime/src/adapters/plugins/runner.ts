/*
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: Host-owned JSONL control channel and a pinned module path.
 * [OUTPUT]: Isolated Runtime API lifecycle; only serializable input/events/tools cross the boundary.
 * [POS]: Trusted plugin process; fault isolation, not an OS security sandbox.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing the wire contract.
 */
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import type { RuntimeFactory, RuntimeProvider, RuntimeServices } from '@boai/runtime-plugin-sdk'
import { hostFrameSchema } from './validation'
const output = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n')
const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void }>()
const callback = (type: 'tool' | 'action', value: unknown) => new Promise<any>((resolve, reject) => { const id = randomUUID(); pending.set(id, { resolve, reject }); output({ type, id, value }) })
let provider: RuntimeProvider | undefined, initialized = false
const controller = new AbortController()
async function request(frame: any) {
  try {
    if (frame.method === 'initialize') {
      if (initialized) throw new Error('Runtime already initialized'); initialized = true
      const module = await import(pathToFileURL(frame.input.entry).href)
      if (module.runtimeApiVersion !== (frame.input.runtimeApiVersion ?? 1) || typeof module.createRuntime !== 'function') throw new Error('插件Runtime API不兼容')
      const services: RuntimeServices = { launch: frame.input.launch, ...(frame.input.runtimeApiVersion === 2 ? { modelSource: frame.input.modelSource } : {}), signal: controller.signal, emit: event => output({ type: 'event', event }), tool: (name, input, callId) => callback('tool', { name, input, callId }), action: input => callback('action', input) }
      provider = await (module.createRuntime as RuntimeFactory)(services)
      output({ type: 'response', id: frame.id, result: true }); return
    }
    if (!provider) throw new Error('Runtime not initialized')
    const methods = ['probe', 'inspectSource', 'openSession', 'submit', 'sendInput', 'interrupt', 'inspect', 'closeSession'] as const
    if (!methods.includes(frame.method) || typeof provider[frame.method as keyof RuntimeProvider] !== 'function') throw new Error('Runtime method unsupported')
    const result = await (provider[frame.method as keyof RuntimeProvider] as (input?: unknown) => Promise<unknown>).call(provider, frame.input)
    output({ type: 'response', id: frame.id, result })
    if (frame.method === 'closeSession') { process.stdin.pause(); process.exitCode = 0; process.stdin.destroy() }
  } catch (error) { output({ type: 'response', id: frame.id, error: error instanceof Error ? error.message : '插件执行失败' }) }
}
let buffer = ''; const decoder = new StringDecoder('utf8')
process.stdin.on('data', (chunk: Buffer) => {
  buffer += decoder.write(chunk); let index: number
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
    if (!line.trim()) continue
    try { const frame = hostFrameSchema.parse(JSON.parse(line))
      if (frame.type === 'callback') { const call = pending.get(frame.id); pending.delete(frame.id); if (frame.error) call?.reject(new Error(frame.error)); else call?.resolve(frame.result) }
      else if (frame.type === 'request') void request(frame)
      else throw new Error('Unknown host frame')
    } catch { controller.abort(); process.exitCode = 1; process.stdin.destroy() }
  }
  if (Buffer.byteLength(buffer) > 64 * 1024 * 1024) { controller.abort(); process.stdin.destroy() }
})
process.stdin.on('end', () => { controller.abort(); void provider?.closeSession() })
