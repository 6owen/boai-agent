/*
 * [INPUT]: 明确开启的真实供应商验收、已知官方DeepSeek来源/模型和本场无效合成凭据。
 * [OUTPUT]: 本场回环转发只接受该无效凭据与原模型，实际供应商响应原样返回CLI；留存HTTP状态/路径/hash，不读取真实凭据或保存报文正文。
 * [POS]: Claude认证故障协议支撑；真实上游拒绝与CLI/产品失败分别核对，不能冒充个人凭据撤销。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

export interface AuthRejectionRequest { method: string; path: string; model?: string; bodySha256: string; credentialIsSynthetic: boolean; upstreamStatus?: number; error?: string }

export async function createClaudeAuthProvider(input: { model: string; invalidKey: string }) {
  if (process.env.BOAI_TEST_REAL_API !== '1' || process.env.BOAI_TEST_REAL_CLAUDE !== '1' || !input.invalidKey.startsWith('boai-invalid-')) throw new Error('真实认证验收必须明确开启，且仅使用本场无效合成凭据')
  const requests: AuthRejectionRequest[] = [], active = new Set<AbortController>()
  const server = createServer(async (request, response) => {
    const parts: Buffer[] = []; let bytes = 0
    try {
      for await (const part of request) { bytes += part.length; if (bytes > 2 * 1024 * 1024) throw new Error('request-limit'); parts.push(Buffer.from(part)) }
      const body = Buffer.concat(parts), path = request.url ?? '/', value = JSON.parse(body.toString())
      const receipt: AuthRejectionRequest = { method: request.method ?? '', path, model: value.model, bodySha256: createHash('sha256').update(body).digest('hex'), credentialIsSynthetic: request.headers['x-api-key'] === input.invalidKey }
      requests.push(receipt)
      if (request.method !== 'POST' || !/^\/v1\/messages(?:\?|$)/.test(path) || !receipt.credentialIsSynthetic || value.model !== input.model) throw new Error('request-not-authorized')
      const controller = new AbortController(); active.add(controller)
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': input.invalidKey }
        for (const name of ['anthropic-version', 'anthropic-beta']) { const value = request.headers[name]; if (typeof value === 'string') headers[name] = value }
        const upstream = await fetch('https://api.deepseek.com/anthropic' + path, { method: 'POST', headers, body: body.toString(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
        receipt.upstreamStatus = upstream.status
        if (upstream.status !== 401) throw new Error('expected-authentication-rejection')
        const result = Buffer.from(await upstream.arrayBuffer())
        if (result.length > 2 * 1024 * 1024) throw new Error('response-limit')
        response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }).end(result)
      } catch (error) {
        receipt.error = error instanceof Error && ['expected-authentication-rejection', 'response-limit'].includes(error.message) ? error.message : 'upstream-unavailable'
        throw error
      } finally { active.delete(controller) }
    } catch {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Owned authentication probe failed' } }))
      else response.destroy()
    }
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); done() }) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('认证验收未取得本场回环端口')
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: async () => {
    for (const controller of active) controller.abort(new Error('test-finished'))
    server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  } }
}
