/*
 * [INPUT]: Frozen tool schemas and host callback services.
 * [OUTPUT]: Authenticated loopback MCP/native bridge; calls retain stable identities and never replay after disconnect.
 * [POS]: Plugin-only bridge; business authority remains in the host tools.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing the bridge.
 */
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import type { RuntimeServices, RuntimeTool } from '../../../shared/plugins/runtime-api'
export async function toolServer(services: RuntimeServices, tools: RuntimeTool[]) {
  const token = randomBytes(32).toString('hex'), calls = new Map<string, { fingerprint: string; result: Promise<unknown> }>()
  const active = new Set<Promise<unknown>>(); let closing = false
  const server = createServer(async (request, response) => {
    let id: string | number | null = null
    try {
      if (closing || request.method !== 'POST' || request.url !== `/${token}`) { response.writeHead(404).end(); return }
      let size = 0; const parts: Buffer[] = []
      for await (const chunk of request) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new Error('Tool request too large'); parts.push(chunk) }
      const frame = JSON.parse(Buffer.concat(parts).toString())
      id = typeof frame.id === 'string' || typeof frame.id === 'number' ? frame.id : null
      if (frame.method?.startsWith('notifications/')) { response.writeHead(202).end(); return }
      let result: unknown
      if (frame.method === 'initialize') result = { protocolVersion: frame.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'boai', version: '1.0.0' } }
      else if (frame.method === 'tools/list') result = { tools }
      else if (frame.method === 'ping') result = {}
      else if (frame.method === 'tools/call') {
        const { name, arguments: input } = frame.params ?? {}, tool = tools.find(item => item.name === name)
        if (!tool) throw new Error('Unknown host tool')
        const callId = typeof frame.params?.callId === 'string' ? frame.params.callId : `mcp-${frame.id ?? randomUUID()}`
        const fingerprint = JSON.stringify([name, input]), prior = calls.get(callId)
        if (prior && prior.fingerprint !== fingerprint) throw new Error('Tool identity reused with different input')
        const operation = prior?.result ?? services.tool(name, input, callId)
        if (!prior) { calls.set(callId, { fingerprint, result: operation }); active.add(operation); void operation.finally(() => active.delete(operation)).catch(() => {}) }
        result = await operation
      } else throw new Error('Unsupported bridge method')
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }))
    } catch (error) { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: error instanceof Error ? error.message : 'Tool bridge failed' } })) }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Bridge address unavailable')
  return { url: `http://127.0.0.1:${address.port}/${token}`, async close() { closing = true; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await Promise.allSettled(active) } }
}
