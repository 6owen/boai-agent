/*
 * [INPUT]: ProductStore, local mock Memmy health and in-memory secret vault.
 * [OUTPUT]: Explicit opt-in, CAS persistence, restart suspension, credential redaction and source-turn receipt classification.
 * [POS]: Provider configuration and transactional outbox test against a local mock; no real user data leaves this fixture.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { UserMemoryProvider } from '../src/runtime/modules/memory/user-memory-provider'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
it('keeps the local provider by default and enables Memmy only after a ready local health response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-memory-provider-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const db = new ProductStore(join(root, 'boai.sqlite')); await db.init(); cleanup.push(() => db.close())
  const secrets = new Map<string, string>(), requests: string[] = [], captured: unknown[] = []
  let turnResponse: unknown = { status: 'stored', result: { l1MemoryIds: ['l1-1'] } }
  const vault = { get: async (id: string) => secrets.get(id), set: async (id: string, value: string) => { secrets.set(id, value) }, delete: async (id: string) => { secrets.delete(id) } }
  const server: Server = createServer(async (request, response) => { requests.push(request.url!); response.setHeader('content-type', 'application/json');
    if (request.url === '/api/v1/source-turns/complete') { const chunks: Uint8Array[] = []; for await (const chunk of request) chunks.push(chunk); captured.push(JSON.parse(Buffer.concat(chunks).toString())); response.end(JSON.stringify(turnResponse)); return }
    response.end(JSON.stringify(request.url === '/api/v1/memory/search'
    ? { injectedContext: '用户曾说明希望简短回答', debug: { sourceMemoryIds: ['mem-1'] } }
    : { ok: true, serviceVersion: '2.1.6', storage: { ready: true }, models: { summary: { configured: true }, embedding: { configured: true } } })) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('没有测试端口')
  const endpoint = `http://127.0.0.1:${address.port}`
  let changed = 0
  const provider = new UserMemoryProvider(db, vault, () => { changed++ }); await provider.init()
  expect(provider.operations().map(operation => operation.name)).toEqual(['memory.provider.status'])
  expect(await provider.status()).toMatchObject({ settings: { revision: 0, provider: 'local', hasToken: false }, reachable: false })
  expect(requests).toEqual([])
  expect(await provider.configure({ expectedRevision: 0, provider: 'memmy', endpoint, token: 'secret' })).toMatchObject({ revision: 1, provider: 'memmy', hasToken: true })
  expect((await provider.status()).serviceVersion).toBe('2.1.6')
  expect(await provider.recall({ conversationId: 'room', runId: 'run-1', query: '回答要多长？', signal: new AbortController().signal })).toMatchObject({ text: '用户曾说明希望简短回答', sourceMemoryIds: ['mem-1'], revision: 1 })
  expect(requests).toEqual(['/api/v1/health', '/api/v1/health', '/api/v1/memory/search'])
  await expect(provider.configure({ expectedRevision: 0, provider: 'local' })).rejects.toThrow('已改变')
  await db.write([provider.pendingTurn({ runId: 'pre-restart', turnId: 'turn-before-restart', conversationId: 'room', userMessageId: 'missing-user', assistantMessageId: 'missing-answer', completedAt: '2026-10-20T10:00:03.000Z', providerRevision: 1, sourceMemoryIds: [] })])
  const restarted = new UserMemoryProvider(db, vault, () => { changed++ }); await restarted.init()
  expect(await restarted.settings()).toMatchObject({ revision: 1, provider: 'memmy', hasToken: true })
  expect(restarted.mode).toBe('local')
  expect(await restarted.status()).toMatchObject({ reachable: false, error: expect.stringContaining('已暂停') })
  expect(await restarted.configuredClient()).toBeUndefined()
  expect(await restarted.recall({ conversationId: 'room', runId: 'after-restart', query: '请回忆', signal: new AbortController().signal })).toBeUndefined()
  expect(requests).toEqual(['/api/v1/health', '/api/v1/health', '/api/v1/memory/search'])
  expect(captured).toHaveLength(0)
  expect((await db.get<{ status: string }>('userMemoryTurns', 'pre-restart'))?.status).toBe('pending')
  expect(changed).toBe(1)
  expect(JSON.stringify(await restarted.settings())).not.toContain('secret')
  const startedAt = '2026-10-20T10:00:00.000Z', completedAt = '2026-10-20T10:00:03.000Z'
  await db.write([
    { collection: 'messages', id: 'user-1', value: { id: 'user-1', conversationId: 'room', senderType: 'user', senderId: 'user', content: '请简短回答', status: 'completed', sequence: 1, createdAt: startedAt } },
    { collection: 'messages', id: 'assistant-1', value: { id: 'assistant-1', conversationId: 'room', senderType: 'agent', senderId: 'bobo', content: '好的。', status: 'completed', sequence: 2, createdAt: completedAt } },
    provider.pendingTurn({ runId: 'run-1', turnId: 'turn-1', conversationId: 'room', userMessageId: 'user-1', assistantMessageId: 'assistant-1', completedAt, providerRevision: 1, sourceMemoryIds: ['mem-1'] }),
  ])
  await provider.flushTurn('run-1')
  expect(captured).toHaveLength(1)
  expect(captured[0]).toMatchObject({ sourceTurn: { startedAt, completedAt, completionEvidence: 'assistant_completed:assistant-1', turnId: 'turn-1' }, query: '请简短回答', answer: '好的。', sourceMemoryIds: ['mem-1'] })
  expect((await db.get<{ status: string; externalIds: string[] }>('userMemoryTurns', 'run-1'))).toMatchObject({ status: 'accepted', externalIds: ['l1-1'] })
  await provider.flushTurn('run-1')
  expect(captured).toHaveLength(1)
  turnResponse = { status: 'pending', reason: 'memory_add_disabled' }
  await db.write([provider.pendingTurn({ runId: 'run-2', turnId: 'turn-2', conversationId: 'room', userMessageId: 'user-1', assistantMessageId: 'assistant-1', completedAt, providerRevision: 1, sourceMemoryIds: [] })])
  await provider.flushTurn('run-2')
  expect((await db.get<{ status: string; result: string }>('userMemoryTurns', 'run-2'))).toMatchObject({ status: 'unknown', result: 'memory_add_disabled' })
  await provider.close()
})
