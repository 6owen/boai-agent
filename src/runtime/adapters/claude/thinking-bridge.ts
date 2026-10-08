/*
 * [INPUT]: 本轮私有DeepSeek格式阶段、明确API来源/模型/凭据及原取消信号。
 * [OUTPUT]: 单阶段鉴权回环兼容映射，按唯一有序格式回执选择尚未完成的StructuredOutput，异常身份/顺序/错误标记拒绝转发；thinking显式disabled且移除无效effort，原模型/消息/工具schema及响应字节、鉴权/路由/关闭边界保持，最终确认仍归turn。
 * [POS]: Claude提供方参数适配，不调用父模型、不取得Work或业务工具权限。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { CLAUDE_TEXT_INPUT_LIMIT } from './policy'

const MAX_BODY = CLAUDE_TEXT_INPUT_LIMIT * 2 + 64 * 1024
const failure = () => new Error('Claude思考参数兼容请求失败，原请求需要核对')
export async function createClaudeThinkingBridge(input: {
  baseUrl: string; apiKey: string; model: string; signal: AbortSignal; onFailure(error: Error): void
}) {
  input.signal.throwIfAborted()
  const upstream = new URL(input.baseUrl)
  if (upstream.username || upstream.password || upstream.search || upstream.hash || !input.apiKey.trim() || input.model !== 'deepseek-v4-pro'
    || !(upstream.href.replace(/\/$/, '') === 'https://api.deepseek.com/anthropic' || upstream.protocol === 'http:' && upstream.hostname === '127.0.0.1')) throw new Error('Claude思考兼容来源尚未验证')
  const controller = new AbortController(), signal = AbortSignal.any([input.signal, controller.signal])
  const secret = randomBytes(32).toString('hex'), active = new Set<Promise<void>>()
  let closing = false, authority = '', error: Error | undefined, closed: Promise<void> | undefined
  const fail = () => { if (!error) { error = failure(); input.onFailure(error) } }
  const reject = (response: ServerResponse, status: number) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Private phase route unavailable' } }))
  }
  const serve = async (request: IncomingMessage, response: ServerResponse) => {
    const key = request.headers['x-api-key'], supplied = Buffer.from(typeof key === 'string' ? key : ''), expected = Buffer.from(secret)
    if (closing || signal.aborted || error) { reject(response, 503); return }
    if (request.headers.origin || request.headers.host !== authority || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { reject(response, 403); return }
    // Unrelated CLI provider preflights never obtain the real credential or
    // another upstream route. Only this phase's Messages request is forwarded.
    if (request.method !== 'POST' || !['/v1/messages', '/v1/messages?beta=true'].includes(request.url ?? '')) { reject(response, 404); return }
    try {
      const parts: Buffer[] = []; let bytes = 0
      for await (const chunk of request) {
        signal.throwIfAborted(); bytes += chunk.length
        if (bytes > MAX_BODY) throw failure()
        parts.push(Buffer.from(chunk))
      }
      const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string, unknown>
      if (!body || Array.isArray(body) || body.model !== input.model || !Array.isArray(body.messages)
        || body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some(tool => !tool || typeof tool !== 'object' || tool.name !== 'StructuredOutput'))) throw failure()
      // This only selects the pending effect-free formatter; turn.ts owns completion.
      if (Array.isArray(body.tools) && body.tools.length > 1) throw failure()
      const formatterOnly = Array.isArray(body.tools) && body.tools.length === 1
      if (formatterOnly) {
        const formatter = (body.tools as Record<string, unknown>[])[0]
        if (!formatter.input_schema || typeof formatter.input_schema !== 'object' || Array.isArray(formatter.input_schema)) throw failure()
        const ids = new Set<string>()
        let pending: string | undefined, choiceCompleted = false
        for (const value of body.messages as unknown[]) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure()
          const message = value as Record<string, unknown>
          if (!Array.isArray(message.content)) continue
          for (const value of message.content as unknown[]) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure()
            const block = value as Record<string, unknown>
            if (block.type === 'tool_use') {
              if (message.role !== 'assistant' || block.name !== 'StructuredOutput' || typeof block.id !== 'string' || !block.id
                || ids.has(block.id) || pending || choiceCompleted) throw failure()
              ids.add(block.id); pending = block.id
            } else if (block.type === 'tool_result') {
              if (message.role !== 'user' || !pending || block.tool_use_id !== pending
                || block.is_error !== undefined && typeof block.is_error !== 'boolean') throw failure()
              pending = undefined
              if (block.is_error !== true) choiceCompleted = true
            }
          }
        }
        if (pending) throw failure()
        if (!choiceCompleted) body.tool_choice = { type: 'tool', name: 'StructuredOutput' }
      }
      body.thinking = { type: 'disabled' }
      if (body.output_config && typeof body.output_config === 'object' && !Array.isArray(body.output_config)) {
        delete (body.output_config as Record<string, unknown>).effort
        if (!Object.keys(body.output_config).length) delete body.output_config
      }
      const payload = Buffer.from(JSON.stringify(body)), target = new URL(upstream.href)
      target.pathname = upstream.pathname.replace(/\/$/, '') + '/v1/messages'; target.search = request.url!.includes('?') ? '?beta=true' : ''
      const headers: Record<string, string> = { 'content-type': 'application/json', 'content-length': String(payload.length), 'x-api-key': input.apiKey }
      for (const name of ['anthropic-version', 'anthropic-beta', 'accept']) { const value = request.headers[name]; if (typeof value === 'string') headers[name] = value }
      signal.throwIfAborted()
      const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
      let stopped!: Promise<void>
      try {
        await new Promise<void>((resolve, reject) => {
          const outgoing = transport(target, { method: 'POST', headers, signal, agent: false }, incoming => {
            const responseHeaders: Record<string, string> = {}
            for (const name of ['content-type', 'retry-after', 'request-id', 'x-request-id']) { const value = incoming.headers[name]; if (typeof value === 'string') responseHeaders[name] = value }
            response.writeHead(incoming.statusCode ?? 502, responseHeaders)
            incoming.once('error', reject); incoming.once('aborted', () => reject(failure())); incoming.once('end', resolve)
            incoming.pipe(response)
          })
          response.once('close', () => { if (!response.writableFinished) outgoing.destroy(failure()) })
          stopped = new Promise<void>(done => outgoing.once('close', () => done()))
          outgoing.once('error', reject); outgoing.end(payload)
        })
      } finally { await stopped }
    } catch {
      if (!response.headersSent) reject(response, 502)
      else response.destroy()
      if (!closing && !signal.aborted) fail()
    }
  }
  const server = createServer((request, response) => {
    const operation = serve(request, response).catch(() => fail())
    active.add(operation); void operation.finally(() => active.delete(operation))
  })
  const abort = () => server.closeAllConnections()
  signal.addEventListener('abort', abort, { once: true })
  const close = () => closed ??= (async () => {
    closing = true; controller.abort(failure()); signal.removeEventListener('abort', abort); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve())); await Promise.allSettled([...active])
  })()
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() }) })
    const address = server.address()
    if (!address || typeof address === 'string') throw failure()
    authority = `127.0.0.1:${address.port}`; signal.throwIfAborted()
    return { baseUrl: `http://${authority}`, apiKey: secret, close }
  } catch (error) { await close(); throw error }
}
