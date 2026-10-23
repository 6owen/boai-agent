/*
 * [INPUT]: Fixed Memmy REST routes and controlled loopback HTTP server.
 * [OUTPUT]: Auth/header/route, response-error and endpoint-boundary checks for R-E1/R-E2.
 * [POS]: Transport contract test; it does not certify external model extraction quality.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { MemmyRestClient, MemmyRestClientError } from '../src/runtime/modules/memory/providers/memmy-client'

const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve())) })

it('calls the fixed local health and memory routes with auth, timezone and bounded error reporting', async () => {
  const requests: { method: string; url: string; authorization?: string; timeZone?: string; body: unknown }[] = []
  const server = createServer(async (request, response) => {
    const chunks: Uint8Array[] = []; for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    requests.push({ method: request.method!, url: request.url!, authorization: request.headers.authorization, timeZone: request.headers['x-memmy-time-zone'] as string, body: raw ? JSON.parse(raw) : undefined })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/v1/memory/missing') { response.statusCode = 404; response.end('{"error":"missing"}'); return }
    response.end(JSON.stringify(request.url === '/api/v1/health' ? { ok: true, serviceVersion: '2.1.6' } : { ok: true }))
  })
  server.listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('没有测试端口')
  const client = new MemmyRestClient({ endpoint: `http://127.0.0.1:${address.port}`, token: 'test-token', timeZone: 'Asia/Singapore' })
  expect((await client.health()).ok).toBe(true)
  await client.syncEvidence({ action: 'upsert', source: 'boai-desktop', sourceRecordId: 'sample-1', revision: '2026-10-20T00:00:00.000Z', content: 'Observed source' })
  await expect(client.getMemory('missing')).rejects.toBeInstanceOf(MemmyRestClientError)
  expect(requests.map(({ method, url }) => [method, url])).toEqual([['GET', '/api/v1/health'], ['POST', '/api/v1/evidence/sync'], ['GET', '/api/v1/memory/missing']])
  expect(requests.every(item => item.authorization === 'Bearer test-token' && item.timeZone === 'Asia/Singapore')).toBe(true)
  expect(requests[1]?.body).toMatchObject({ sourceRecordId: 'sample-1', action: 'upsert' })
  expect(() => new MemmyRestClient({ endpoint: 'https://example.com' })).toThrow('本机HTTP')
})
