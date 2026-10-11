/*
 * [OUTPUT]: 2026-10-11 持续原生Claude生产驱动支持本机登录/显式API、原生工具与公开过程；旧私有阶段仅作兼容回归。
 * [OUTPUT]: 原生会话产品工具无固定48次限制；普通工具错误回给Agent处理，传输/身份故障保留。
 * [INPUT]: 本阶段冻结的宿主工具、Claude已公开的工具调用身份与阶段取消信号。
 * [OUTPUT]: 单阶段回环MCP桥；仅匹配调用执行、重复身份复用回执、关闭等待真实退出；只读诊断区分接收/执行/回执，无身份、参数或结果。
 * [POS]: Claude原生循环到BoAI宿主工具的专用协议桥，不拥有Work/审批/成果权威。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createServer, type IncomingMessage } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { NativeTool } from '../native-task'

const MAX_CALLS = 48
const MAX_BODY = 2 * 1024 * 1024
export const claudeToolName = (name: string) => `mcp__boai__${name}`
type Announced = { name: string; input: unknown }
type Call = { announced?: Announced; ready: Promise<Announced>; resolve(value: Announced): void
  result?: Promise<unknown>; received: boolean; started: boolean; returned: boolean; exited: boolean; completed: boolean; responsePrepared: boolean }
export type ClaudeToolCallState = 'unknown' | 'announced' | 'received' | 'executing' | 'exited_unconfirmed' | 'confirmed'
export interface ClaudeToolBridgeDiagnostic {
  announcedCalls: number; receivedCalls: number; executionStarts: number; executionReturns: number
  executionExits: number; completionConfirmations: number; responsePreparations: number; failedRequests: number
}

async function bodyOf(request: IncomingMessage) {
  const parts: Buffer[] = []; let size = 0
  for await (const part of request) {
    size += part.length
    if (size > MAX_BODY) throw new Error('MCP请求超过2MiB')
    parts.push(part)
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown
}

export async function createClaudeToolBridge(input: {
  native?: boolean; configDirectory: string; tools: NativeTool[]; signal: AbortSignal; onFailure(error: Error): void
}) {
  input.signal.throwIfAborted()
  const tools = new Map(input.tools.map(tool => [tool.name, tool]))
  if (!tools.size || tools.size !== input.tools.length || [...tools.keys()].some(name => !/^[a-zA-Z0-9_-]{1,64}$/.test(name))) throw new Error('Claude宿主工具目录无效')
  const configRoot = await mkdtemp(join(input.configDirectory, 'boai-mcp-'))
  const configPath = join(configRoot, 'connection.json')
  const calls = new Map<string, Call>(), active = new Set<Promise<unknown>>()
  let closing = false, failure: Error | undefined, failedRequests = 0
  const check = () => { input.signal.throwIfAborted(); if (failure) throw failure; if (closing) throw new Error('Claude工具桥正在退出') }
  const fail = (error: unknown) => {
    const reason = error instanceof Error ? error : new Error('Claude宿主工具失败')
    if (!failure) { failure = reason; input.onFailure(reason) }
    return reason
  }
  let rejectStopped!: (reason: Error) => void
  const stopped = new Promise<never>((_, reject) => { rejectStopped = reject }); void stopped.catch(() => {})
  const abort = () => rejectStopped(input.signal.reason instanceof Error ? input.signal.reason : new Error('Claude工具阶段已停止'))
  input.signal.addEventListener('abort', abort, { once: true })
  if (input.signal.aborted) abort()
  const lookup = (id: unknown) => {
    if (typeof id !== 'string' || !/^[\w-]{1,200}$/.test(id)) throw new Error('Claude工具请求缺少稳定调用身份')
    let call = calls.get(id)
    if (!call) {
      if (!input.native && calls.size >= MAX_CALLS) throw new Error('达到本阶段工具调用上限')
      let resolve!: (value: Announced) => void
      const ready = new Promise<Announced>(done => { resolve = done })
      call = { ready, resolve, received: false, started: false, returned: false, exited: false, completed: false, responsePrepared: false }; calls.set(id, call)
    }
    return { id, call }
  }
  const sdk = new Server({ name: 'boai', version: '1.0.0' }, { capabilities: { tools: {} } })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true })
  sdk.setRequestHandler(ListToolsRequestSchema, async () => {
    check()
    return { tools: input.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema } as Tool)) }
  })
  sdk.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const operation = (async () => {
      try {
        check()
        const { id, call } = lookup(extra._meta?.['claudecode/toolUseId'])
        call.received = true
        const announced = await Promise.race([call.ready, stopped])
        check()
        const tool = tools.get(request.params.name)
        if (!tool || announced.name !== request.params.name || !isDeepStrictEqual(announced.input, request.params.arguments)) throw fail(new Error('Claude工具请求与本轮公开身份或参数不符'))
        // Retransmission may use a different JSON-RPC id. Native tool-use identity
        // is the authority within this phase, never payload similarity alone.
        call.result ??= Promise.resolve().then(async () => {
          check(); call.started = true
          try {
            const result = await tool.execute(request.params.arguments, id)
            call.returned = true; check(); call.completed = true; return result
          } finally { call.exited = true }
        })
        const result = await call.result
        const text = JSON.stringify(result) ?? 'null'
        if (Buffer.byteLength(text) > MAX_BODY) throw new Error('Claude宿主工具结果超过2MiB')
        call.responsePrepared = true
        return { content: [{ type: 'text' as const, text }] }
      } catch (error) {
        failedRequests++
        if (!input.native) fail(error)
        return { content: [{ type: 'text' as const, text: input.native && error instanceof Error ? error.message : 'The host did not confirm this operation. Do not retry it or bypass the refusal.' }], isError: true }
      }
    })()
    active.add(operation)
    try { return await operation } finally { active.delete(operation) }
  })
  const secret = `Bearer ${randomBytes(32).toString('hex')}`
  let configBytes: Buffer | undefined, authority = ''
  const server = createServer((request, response) => {
    const operation = (async () => {
      const auth = request.headers.authorization ?? ''
      const authBytes = Buffer.from(auth), expectedBytes = Buffer.from(secret)
      if (closing || input.signal.aborted || failure) { response.writeHead(503).end(); return }
      if (request.headers.origin || request.headers.host !== authority || authBytes.length !== expectedBytes.length || !timingSafeEqual(authBytes, expectedBytes)) { response.writeHead(403).end(); return }
      if (request.url !== '/mcp') { response.writeHead(404).end(); return }
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const body = await bodyOf(request)
        check()
        await transport.handleRequest(request, response, body)
      } catch {
        if (!response.headersSent) response.writeHead(400)
        response.end()
      }
    })()
    active.add(operation); void operation.finally(() => active.delete(operation)).catch(error => fail(error))
  })
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.maxConnections = 16
  server.on('error', error => fail(error))
  const close = async () => {
    closing = true; input.signal.removeEventListener('abort', abort)
    rejectStopped(new Error('Claude工具桥已关闭'))
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    // SDK JSON response resolvers are discarded by close(). Let each already
    // accepted handler finish, including host effects, before closing transport.
    await Promise.allSettled([...active])
    await sdk.close()
    if (configBytes) {
      const actual = await readFile(configPath).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
      if (actual && !actual.equals(configBytes)) throw new Error('Claude临时连接配置已外改，保留待核对')
      if (actual) await unlink(configPath)
    }
    await rmdir(configRoot)
  }
  try {
    await sdk.connect(transport)
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() }) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Claude工具桥没有有效回环地址')
    authority = `127.0.0.1:${address.port}`
    configBytes = Buffer.from(JSON.stringify({ mcpServers: { boai: { type: 'http', url: `http://${authority}/mcp`, headers: { Authorization: secret } } } }))
    await writeFile(configPath, configBytes, { flag: 'wx', mode: 0o600 })
    check()
    return { configPath, toolNames: input.tools.map(tool => claudeToolName(tool.name)),
      announce(id: unknown, name: unknown, args: unknown) {
        check()
        const nativeName = typeof name === 'string' && name.startsWith('mcp__boai__') ? name.slice('mcp__boai__'.length) : ''
        if (!tools.has(nativeName)) throw new Error('Claude返回未授权的原生或外部工具')
        const { call } = lookup(id), value = { name: nativeName, input: args }
        if (call.announced && !isDeepStrictEqual(call.announced, value)) throw new Error('Claude重复工具身份的内容发生变化')
        call.announced = value; call.resolve(value)
      },
      assertResult(id: unknown) {
        check()
        if (typeof id !== 'string' || !calls.get(id)?.completed) throw new Error('Claude工具结果缺少宿主完成回执')
      },
      assertComplete() { check(); if ([...calls.values()].some(call => !call.completed)) throw new Error('Claude仍有未确认的宿主工具') },
      // Observation never calls lookup/check: it creates no identity, releases no
      // effect and remains readable after failure, cancellation and actual exit.
      callState(id: unknown): ClaudeToolCallState {
        const call = typeof id === 'string' ? calls.get(id) : undefined
        return !call ? 'unknown' : call.completed ? 'confirmed' : call.exited ? 'exited_unconfirmed' : call.started ? 'executing' : call.received ? 'received' : 'announced'
      },
      diagnostic(): ClaudeToolBridgeDiagnostic {
        const values = [...calls.values()]
        return { announcedCalls: values.filter(call => call.announced).length, receivedCalls: values.filter(call => call.received).length,
          executionStarts: values.filter(call => call.started).length, executionReturns: values.filter(call => call.returned).length,
          executionExits: values.filter(call => call.exited).length, completionConfirmations: values.filter(call => call.completed).length,
          responsePreparations: values.filter(call => call.responsePrepared).length, failedRequests }
      },
      close }
  } catch (error) { await close(); throw error }
}
