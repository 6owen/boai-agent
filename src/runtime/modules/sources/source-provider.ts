/*
 * [INPUT]: Frozen source definition, vault-only credentials and an owned abort signal.
 * [OUTPUT]: Craft API requests, MCP HTTP/SSE/stdio sessions and contained local text operations.
 * [POS]: Source transport adapter; no employee or configuration authority.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { z } from 'zod'
import { opendir, lstat, realpath, mkdir } from 'node:fs/promises'
import { join, resolve, isAbsolute } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { apiSourceRequestSchema, localSourceRequestSchema, type DataSource, type SourceTool } from '../../../shared/domain/sources'
import { apiAuthSpecFromConfig, parseStoredApiCredential } from './craft/api-auth'
import { executeApiRequest } from './craft/api-request'
import { boundedRead, restrictedPath, writeWorkspaceFile } from '../workspaces/file-access'
import { fileContentHash, readFilePage } from '../workspaces/file-editing'
import { assertNativeProcessGuard } from '../../adapters/native-process-guard'

const execute = promisify(execFile)
export const SOURCE_TIMEOUT = 30_000
const MAX_RESULT_CHARACTERS = 128_000
export interface SourceSession { tools: SourceTool[]; call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>; close(): Promise<void> }
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }
export async function recoverSourceProcesses(dataPath: string) {
  if (process.platform !== 'darwin') return
  const ledger = join(dataPath, 'source-processes')
  try { await lstat(ledger) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  await execute(await assertNativeProcessGuard(), ['--recover', ledger], { timeout: 15_000, maxBuffer: 65536 })
}
export function redactSourceValue(value: unknown, credential: string): unknown {
  let text = JSON.stringify(value) ?? 'null'
  const secrets = [credential]
  try { const parsed = JSON.parse(credential); if (parsed && typeof parsed === 'object') { secrets.push(...Object.values(parsed).filter((v): v is string => typeof v === 'string')); if (typeof parsed.username === 'string' && typeof parsed.password === 'string') secrets.push(`${parsed.username}:${parsed.password}`) } } catch { /* Plain token. */ }
  for (const secret of secrets.filter(value => value.length > 2).sort((a, b) => b.length - a.length)) {
    for (const encoded of [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) text = text.split(JSON.stringify(encoded).slice(1, -1)).join('[redacted]')
  }
  if (text.length > MAX_RESULT_CHARACTERS) return { truncated: true, characters: text.length, excerpt: text.slice(0, MAX_RESULT_CHARACTERS) }
  return JSON.parse(text)
}
export async function sourceFolder(path: string) {
  if (!isAbsolute(path)) throw new Error('请选择本地文件夹的绝对路径')
  const canonical = await realpath(path)
  if (!(await lstat(canonical)).isDirectory()) throw new Error('数据源必须是文件夹')
  return canonical
}
function apiPath(source: Extract<DataSource, { type: 'api' }>, path: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path) || path.includes('\\') || path.includes('#')) throw new Error('API 请求必须使用当前数据源下的相对端点')
  const base = new URL(source.api.baseUrl.replace(/\/$/, '') + '/')
  const target = new URL(path.replace(/^\//, ''), base)
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error('API 端点超出了配置的 Base URL')
}
export async function openSourceSession(source: DataSource, credential: string, dataPath: string, signal: AbortSignal): Promise<SourceSession> {
  signal.throwIfAborted()
  if (source.type === 'api') return {
    tools: [{ name: 'request', description: `Request a relative endpoint. ${source.api.allowWrites ? 'Writes are enabled.' : 'Only GET is enabled.'}`, inputSchema: z.toJSONSchema(apiSourceRequestSchema, { io: 'input' }) }],
    async call(name, args, signal) {
      if (name !== 'request') throw new Error('未知 API 工具')
      const request = apiSourceRequestSchema.parse(args)
      apiPath(source, request.path)
      if (request.method !== 'GET' && !source.api.allowWrites) throw new Error('此 API 数据源仅允许读取')
      if (source.api.authType !== 'none' && !credential) throw new Error('数据源尚未配置凭据')
      const result = await executeApiRequest({ name: source.name, baseUrl: source.api.baseUrl, auth: apiAuthSpecFromConfig(source.api) }, parseStoredApiCredential(credential, source.api), request, { signal, timeoutMs: SOURCE_TIMEOUT })
      if (!result.ok) throw new Error(`API 请求失败（HTTP ${result.status}）`)
      const text = new TextDecoder('utf-8', { fatal: true }).decode(result.buffer)
      if (text.includes('\0')) throw new Error('此端点返回二进制，请使用提供文本或 JSON 的端点')
      return redactSourceValue({ status: result.status, contentType: result.contentType, ...readFilePage(text, 0, 48000) }, credential)
    }, close: async () => {},
  }
  if (source.type === 'local') {
    const root = await sourceFolder(source.local.path)
    if (root !== source.local.path) throw new Error('数据源目录来源已变化，请重新配置')
    return {
      tools: [{ name: 'files', description: `Paths are relative to this bound folder. ${source.local.accessMode === 'read' ? 'Read-only.' : 'Write requires content and expectedHash from a prior read, or null for a new file.'}`, inputSchema: z.toJSONSchema(localSourceRequestSchema, { io: 'input' }) }],
      async call(name, args, signal) {
        if (name !== 'files') throw new Error('未知文件夹工具')
        const request = localSourceRequestSchema.parse(args)
        signal.throwIfAborted()
        if (isAbsolute(request.path)) throw new Error('请使用数据源内的相对路径')
        if (request.operation === 'write') {
          if (source.local.accessMode !== 'read-write') throw new Error('此文件夹仅允许读取')
          if (request.content === undefined || request.expectedHash === undefined) throw new Error('写入需要正文及原文件 hash；新文件使用 null')
          await writeWorkspaceFile(root, request.path, request.content, request.expectedHash, signal)
          return { written: true, path: request.path, contentHash: fileContentHash(request.content) }
        }
        const target = await restrictedPath([root], resolve(root, request.path))
        if (request.operation === 'read') return { path: request.path, ...readFilePage(await boundedRead(target, { strictUtf8: true }), request.offset, request.limit) }
        const entries: { name: string; type: string }[] = []
        let count = 0, truncated = false
        for await (const entry of await opendir(target)) {
          signal.throwIfAborted()
          if (entry.isSymbolicLink()) continue
          if (count++ < request.offset) continue
          if (entries.length === 200) { truncated = true; break }
          entries.push({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })
        }
        return { entries, nextOffset: truncated ? request.offset + entries.length : null }
      }, close: async () => {},
    }
  }
  // Transport mapping follows Craft server-builder.ts. SDK/session ownership is BOAI's.
  const config = source.mcp
  const headers = config.transport !== 'stdio' && config.authType === 'bearer' ? { Authorization: `Bearer ${credential}` } : undefined
  if (config.transport !== 'stdio' && config.authType === 'bearer' && !credential) throw new Error('MCP 尚未配置访问令牌')
  const scopedFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (config.transport === 'stdio' || url.origin !== new URL(config.url).origin) throw new Error('MCP 请求不能离开配置的服务地址')
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TIMEOUT), ...(init?.signal ? [init.signal] : [])]) })
  }
  const ledger = join(dataPath, 'source-processes')
  let env: Record<string, string> = {}
  if (config.transport === 'stdio' && credential) env = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).parse(JSON.parse(credential))
  if (['NODE_OPTIONS', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'ELECTRON_RUN_AS_NODE'].some(key => key in env)) throw new Error('MCP 环境变量包含保留的宿主变量')
  if (config.transport === 'stdio') await mkdir(ledger, { recursive: true, mode: 0o700 })
  const transport = config.transport === 'stdio'
    ? new StdioClientTransport({ command: await assertNativeProcessGuard(), args: ['--ledger', ledger, config.command, ...config.args], env: { ...getDefaultEnvironment(), ...env }, stderr: 'ignore', maxBufferSize: 4 * 1024 * 1024 })
    : config.transport === 'sse'
      ? new SSEClientTransport(new URL(config.url), { requestInit: { headers }, fetch: scopedFetch, eventSourceInit: { fetch: scopedFetch } })
      : new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers }, fetch: scopedFetch, reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } })
  const client = new Client({ name: 'boai-sources', version: '1.0.0' })
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    const pid = transport instanceof StdioClientTransport ? transport.pid : null
    await client.close()
    if (pid) {
      const deadline = Date.now() + 15_000
      while (alive(pid) && Date.now() < deadline) await delay(25)
      if (alive(pid)) throw new Error('MCP 进程尚未退出，请关闭应用后核对')
    }
  })()
  const abort = () => { void close().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    await client.connect(transport, { signal, timeout: SOURCE_TIMEOUT })
    const tools: SourceTool[] = [], cursors = new Set<string>(); let cursor: string | undefined
    do {
      const result = await client.listTools(cursor ? { cursor } : {}, { signal, timeout: SOURCE_TIMEOUT })
      for (const tool of result.tools) tools.push({ name: tool.name, description: tool.description?.slice(0, 4000), inputSchema: tool.inputSchema, readOnly: tool.annotations?.readOnlyHint === true })
      if (tools.length > 200) throw new Error('MCP 工具目录超过 200 项，请在服务端缩小范围')
      cursor = result.nextCursor
      if (cursor && (cursors.has(cursor) || cursors.size >= 20)) throw new Error('MCP 工具目录分页异常')
      if (cursor) cursors.add(cursor)
    } while (cursor)
    signal.throwIfAborted()
    const publicTools = redactSourceValue(tools, credential)
    if (!Array.isArray(publicTools)) throw new Error('MCP 工具目录过大，请在服务端缩小范围')
    return { tools: publicTools as SourceTool[], async call(name, args, signal) {
      if (!tools.some(tool => tool.name === name)) throw new Error('MCP 工具不在当前目录中')
      const result = await client.callTool({ name, arguments: args }, undefined, { signal, timeout: SOURCE_TIMEOUT, maxTotalTimeout: SOURCE_TIMEOUT })
      return redactSourceValue(result, credential)
    }, close: async () => { signal.removeEventListener('abort', abort); await close() } }
  } catch (error) { signal.removeEventListener('abort', abort); await close(); throw error }
}
