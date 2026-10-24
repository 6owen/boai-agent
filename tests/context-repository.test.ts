/*
 * [INPUT]: Real temporary ProductStore databases, authorized sources and injected commit failures.
 * [OUTPUT]: Context CAS, one maintainer, atomic rotation, source invalidation, crash recovery and employee isolation checks.
 * [POS]: Context persistence regression; no model or desktop requests.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { Message } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ContextRepository, contextSource, contextCollections, type ContextOwner } from '../src/runtime/modules/contexts/context-repository'
import { contextCapacity, estimateTokens } from '../src/runtime/modules/contexts/context-capacity'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const owner: ContextOwner = { agentId: 'employee', conversationId: 'dm', scopeVersion: 'scope-v1' }
const message = (id: string, sequence = 1): Message => ({ id, sequence, conversationId: 'dm', content: `Exact fact ${id}`, senderId: 'user', senderName: 'Owner', senderType: 'user', status: 'completed', createdAt: '2026-10-24T00:00:00.000Z' })
const metrics = { basis: 'public-source', estimatedInputTokens: 1000, estimatedRemainingTokens: 100, windowSource: 'unknown-policy', modelId: 'fixture', inputLimit: 48000 } as const
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-context-')), store = new ProductStore(join(root, 'db.sqlite'))
  await store.init(); cleanups.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  const messages = [message('one'), message('two', 2)]
  await store.write(messages.map(value => ({ collection: 'messages', id: value.id, value })))
  return { store, repository: new ContextRepository(store), messages }
}
it('atomically rotates one internal session while preserving original message identities', async () => {
  const { store, repository, messages } = await fixture()
  const view = await repository.read(owner, messages), op = await repository.begin(owner, 'run', view, 'rotate')
  const next = await repository.commit(op, 'Fact one [one]', [contextSource(messages[0]!)], messages, metrics)
  expect(next.stream.activeSessionId).not.toBe(view.stream.activeSessionId)
  expect(next.stream.revision).toBe(1)
  expect((await store.load<Message>('messages'))).toEqual(messages)
  expect((await store.load<{ id: string; status: string }>('contextSessions')).find(row => row.id === view.stream.activeSessionId)?.status).toBe('sealed')
  expect((await repository.read(owner, messages)).checkpoint?.summary).toBe('Fact one [one]')
})
it('admits one maintainer and rejects duplicate commit or stale candidate without touching the pointer', async () => {
  const { repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'compact')
  await expect(repository.begin(owner, 'peer', view, 'rotate')).rejects.toThrow('版本已变化')
  await repository.commit(op, 'fact', [contextSource(messages[0]!)], messages, metrics)
  await expect(repository.commit(op, 'duplicate', [contextSource(messages[0]!)], messages, metrics)).rejects.toThrow('版本已变化')
  await expect(repository.begin(owner, 'peer', view, 'rotate')).rejects.toThrow('版本已变化')
})
it('rejects changed or newly unauthorized sources and does not treat another conversation sequence as the same source', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'rotate')
  const refs = [contextSource(messages[0]!)]
  await expect(repository.commit(op, 'fact', refs, [], metrics)).rejects.toThrow('来源或版本')
  await expect(repository.commit(op, 'fact', [{ ...refs[0]!, conversationId: 'group' }], messages, metrics)).rejects.toThrow('来源或版本')
  await store.write([{ collection: 'messages', id: messages[0]!.id, value: { ...messages[0]!, content: 'corrected' } }])
  await expect(repository.commit(op, 'fact', refs, messages, metrics)).rejects.toThrow('来源或版本')
  expect((await repository.read(owner, messages)).stream.activeSessionId).toBe(view.stream.activeSessionId)
})
it('keeps a valid covered prefix on append, but invalidates on source change or rule/scope change', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'compact')
  await repository.commit(op, 'fact', [contextSource(messages[0]!)], messages, metrics)
  expect((await repository.read(owner, [...messages, message('new', 3)])).checkpoint).toBeDefined()
  expect((await repository.read({ ...owner, scopeVersion: 'changed' }, messages)).checkpoint).toBeUndefined()
  await store.write([], [{ collection: 'messages', id: messages[0]!.id }])
  expect((await repository.read(owner, messages)).checkpoint).toBeUndefined()
})
it('rolls back checkpoint, sealed segment and pointer together on a storage failure', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'rotate')
  const original = store.transaction.bind(store)
  vi.spyOn(store, 'transaction').mockImplementation(operation => original(tx => operation({ ...tx, put: async record => { if (record.collection === 'contextStreams') throw new Error('disk fault'); await tx.put(record) } })))
  await expect(repository.commit(op, 'fact', [contextSource(messages[0]!)], messages, metrics)).rejects.toThrow('disk fault')
  vi.restoreAllMocks()
  expect((await repository.read(owner, messages)).stream.activeSessionId).toBe(view.stream.activeSessionId)
  expect(await store.load('contextCheckpoints')).toHaveLength(0)
  expect(await store.load('contextSessions')).toHaveLength(1)
})
it('recovers an interrupted candidate without promoting it or reserving another model call', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  await repository.begin(owner, 'crashed', view, 'rotate')
  const restarted = new ContextRepository(store); await restarted.recover()
  expect((await restarted.read(owner, messages)).stream).toMatchObject({ revision: 0, activeSessionId: view.stream.activeSessionId })
  expect((await store.load<{ status: string }>('contextMaintenance'))[0]?.status).toBe('failed')
  await expect(restarted.begin(owner, 'next', await restarted.read(owner, messages), 'compact')).resolves.toBeDefined()
})
it.each(['shape', 'version', 'owner'])('ignores an incompatible derived checkpoint (%s) without changing the authoritative pointer', async mode => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'compact')
  const committed = await repository.commit(op, 'fact', [contextSource(messages[0]!)], messages, metrics)
  const change = mode === 'shape' ? { sources: 'invalid-shape' } : mode === 'version' ? { version: 999 } : { agentId: 'another-employee' }
  await store.write([{ collection: 'contextCheckpoints', id: committed.checkpoint!.id, value: { ...committed.checkpoint, ...change } }])
  const restored = await repository.read(owner, messages)
  expect(restored.checkpoint).toBeUndefined()
  expect(restored.stream.activeSessionId).toBe(committed.stream.activeSessionId)
  expect(await store.load<Message>('messages')).toEqual(messages)
})
it('rolls back when cancellation arrives inside the checkpoint write transaction', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const op = await repository.begin(owner, 'run', view, 'rotate'), controller = new AbortController(), original = store.transaction.bind(store)
  vi.spyOn(store, 'transaction').mockImplementation(operation => original(tx => operation({ ...tx, put: async row => { await tx.put(row); if (row.collection === 'contextCheckpoints') controller.abort(new Error('Stopped before commit')) } })))
  await expect(repository.commit(op, 'fact', [contextSource(messages[0]!)], messages, metrics, () => controller.signal.throwIfAborted())).rejects.toThrow('Stopped before commit')
  vi.restoreAllMocks()
  expect((await repository.read(owner, messages)).stream.activeSessionId).toBe(view.stream.activeSessionId)
  expect(await store.load('contextCheckpoints')).toHaveLength(0)
})
it('loads a run handoff only for confirmed completed tools with currently authorized sources', async () => {
  const { repository, messages } = await fixture(); await repository.read(owner, messages)
  await repository.recordStep(owner, 'old-run', 'A completed result, not a new instruction.', [{ toolCallId: 'tool-a', hash: 'unit-hash' }], messages, metrics)
  expect(await repository.resumedSteps(owner, [{ runId: 'old-run', toolIds: [] }], messages)).toEqual([])
  expect(await repository.resumedSteps({ ...owner, agentId: 'foreign' }, [{ runId: 'old-run', toolIds: ['tool-a'] }], messages)).toEqual([])
  expect(await repository.resumedSteps(owner, [{ runId: 'old-run', toolIds: ['tool-a'] }], [])).toEqual([])
  expect(await repository.resumedSteps(owner, [{ runId: 'old-run', toolIds: ['tool-a'] }], messages)).toEqual([{ runId: 'old-run', summary: 'A completed result, not a new instruction.' }])
})
it('stores incremental source segments and invalidates the full handoff when an ancestor source disappears', async () => {
  const { store, repository, messages } = await fixture(), view = await repository.read(owner, messages)
  const first = await repository.commit(await repository.begin(owner, 'run-1', view, 'compact'), 'First fact', [contextSource(messages[0]!)], messages, metrics)
  const second = await repository.commit(await repository.begin(owner, 'run-2', first, 'rotate'), 'Both facts', messages.map(contextSource), messages, metrics)
  const rows = await store.load<{ id: string; sources: unknown[]; previousCheckpointId?: string }>('contextCheckpoints')
  expect(rows.find(row => row.id === second.checkpoint!.id)).toMatchObject({ previousCheckpointId: first.checkpoint!.id, sources: [contextSource(messages[1]!)] })
  expect((await repository.read(owner, messages)).checkpoint!.sources).toHaveLength(2)
  await store.write([], [{ collection: 'messages', id: messages[0]!.id }])
  expect((await repository.read(owner, messages)).checkpoint).toBeUndefined()
})
it('isolates employees and blocks a cleared conversation from reviving context', async () => {
  const { store, repository, messages } = await fixture()
  const a = await repository.read(owner, messages), b = await repository.read({ ...owner, agentId: 'other' }, messages)
  expect(a.stream.id).not.toBe(b.stream.id)
  await repository.forgetAgent(owner.agentId)
  for (const collection of contextCollections) expect((await store.load<{ agentId: string }>(collection)).some(row => row.agentId === owner.agentId)).toBe(false)
  await store.write([{ collection: 'conversationCleanup', id: owner.conversationId, value: { id: owner.conversationId } }])
  await expect(repository.read(owner, messages)).rejects.toThrow('来源或版本')
})
it('uses only selected model window metadata and labels the unknown input ceiling honestly', () => {
  const agent = { modelId: 'small' } as import('../src/shared/domain').DigitalAgent
  expect(contextCapacity({ agent }, 2000)).toMatchObject({ window: undefined, source: 'unknown-policy', limit: 48000 })
  expect(contextCapacity({ agent, modelCatalog: { models: [{ id: 'small', contextWindow: 8000 }, { id: 'large', contextWindow: 100000 }], source: 'service-declared', fetchedAt: '' } }, 2000)).toMatchObject({ window: 8000, limit: 4976 })
  expect(contextCapacity({ agent }, 2000, 50000)).toMatchObject({ window: undefined, source: 'unknown-policy', limit: 98000 })
  expect(estimateTokens([{ type: 'image', image: 'data:image/png;base64,' + 'a'.repeat(100000) }])).toBeLessThan(5000)
  expect(estimateTokens('中文'.repeat(100))).toBeGreaterThan(estimateTokens('ab'.repeat(100)))
})
