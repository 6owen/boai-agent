/*
 * [INPUT]: Real isolated SQLite source journals and managed canvas documents, without desktop or model calls.
 * [OUTPUT]: Durable cleanup identity, lost-reply recovery, offline deletion, external-change preservation and source isolation.
 * [POS]: WT4 source lifecycle integration tests for conversation and employee cleanup.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Conversation, DigitalAgent } from '../packages/shared/src/domain'
import { CanvasDocumentRepository, canvasScopeKey } from '../packages/canvas-plugin/src/document'
import { canvasHostEnvelopeSchema, type CanvasDocument, type CanvasScope, type CanvasScopeFilter } from '../packages/canvas-plugin/src/protocol'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { CanvasService } from '../packages/runtime/src/modules/canvas/service'
import { ConversationHistory } from '../packages/runtime/src/modules/conversations/history'
import { ContactDeletionService } from '../packages/runtime/src/modules/employees/contact-deletion'
import { prepareSessionDeletion, sessionFingerprint, type SessionOperationRecord } from '../packages/runtime/src/modules/conversations/session-operations'

const requireCanvas = createRequire(new URL('../packages/canvas-plugin/package.json', import.meta.url))
const { createTLSchema } = requireCanvas('@tldraw/tlschema') as { createTLSchema(): { serialize(): Record<string, unknown> } }
const disposals: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose() })
const row = (collection: string, id: string, value: object) => ({ collection, id, value: { id, ...value } })
const employee = (id: string): DigitalAgent => ({ id, name: id, role: 'designer', instructions: '', color: '#638ac5', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
const document = (): CanvasDocument => ({ schema: createTLSchema().serialize(), store: {
  'document:document': { id: 'document:document', typeName: 'document', name: '', gridSize: 10, meta: {} },
  'page:page': { id: 'page:page', typeName: 'page', name: 'Page', index: 'a1', meta: {} },
} })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-canvas-cleanup-'))
  disposals.push(() => rm(root, { recursive: true, force: true }))
  const dataPath = join(root, 'v2'); await mkdir(dataPath)
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  disposals.push(() => store.close())
  const canvas = new CanvasService(dataPath); disposals.push(() => canvas.close())
  const documents = new CanvasDocumentRepository(join(dataPath, 'canvases'))
  const create = (scope: CanvasScope, operationId: string) => documents.create(scope, { operationId, title: operationId, intent: { action: 'create' }, initialize: async () => document() })
  const conversation: Conversation = { id: 'conversation-a', title: 'Canvas source', kind: 'group', agentIds: ['employee-a', 'employee-b'], mode: 'natural', sharedKnowledgeIds: [], workspacePath: join(dataPath, 'workspaces', 'conversation-a'), createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  await mkdir(conversation.workspacePath, { recursive: true })
  await store.write([row('conversations', conversation.id, conversation), ...['employee-a', 'employee-b', 'employee-c'].map(id => row('agents', id, employee(id)))])
  const cleanup = (filter: CanvasScopeFilter, cleanupId: string) => canvas.cleanup(filter, cleanupId)
  return { root, dataPath, store, canvas, documents, conversation, create, cleanup }
}

it('cleans offline while disabled, isolates scope and never expands a completed cleanup to later boards', async () => {
  const f = await setup(), scope = { employeeId: 'employee-a', conversationId: f.conversation.id }
  const old = await f.create(scope, 'old'), anotherMember = await f.create({ ...scope, employeeId: 'employee-b' }, 'member')
  const other = await f.create({ ...scope, conversationId: 'conversation-b' }, 'other'), employeeWide = await f.create({ employeeId: scope.employeeId }, 'private')
  expect(await f.canvas.enabled()).toBe(false)
  await f.cleanup({ conversationId: f.conversation.id }, 'clear-conversation')
  await expect(f.documents.open(scope, old.board.boardId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(f.documents.open({ ...scope, employeeId: 'employee-b' }, anotherMember.board.boardId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const later = await f.create(scope, 'later')
  await f.cleanup({ conversationId: f.conversation.id }, 'clear-conversation')
  expect(await f.documents.open(scope, later.board.boardId)).toEqual(later.board)
  expect(await f.documents.open({ ...scope, conversationId: 'conversation-b' }, other.board.boardId)).toEqual(other.board)
  expect(await f.documents.open({ employeeId: scope.employeeId }, employeeWide.board.boardId)).toEqual(employeeWide.board)
  await expect(f.create(scope, 'old')).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('persists the conversation fence before cleanup and recovers a lost reply with the same frozen identity', async () => {
  const f = await setup(), scope = { employeeId: 'employee-a', conversationId: f.conversation.id }
  const old = await f.create(scope, 'old')
  await writeFile(join(f.conversation.workspacePath, 'keep-until-confirmed'), 'source')
  const seen: string[] = []
  const losingReply = async (filter: CanvasScopeFilter, cleanupId: string) => {
    const pending = await f.store.get<{ canvasCleanupId: string }>('conversationCleanup', f.conversation.id)
    expect(pending?.canvasCleanupId).toBe(cleanupId); seen.push(cleanupId)
    await f.cleanup(filter, cleanupId)
    throw new Error('host cleanup reply lost')
  }
  await expect(new ConversationHistory(f.store, f.dataPath, undefined, undefined, undefined, losingReply).clear(f.conversation, true)).rejects.toThrow('reply lost')
  expect(await f.store.get('conversations', f.conversation.id)).toBeDefined()
  expect(await readFile(join(f.conversation.workspacePath, 'keep-until-confirmed'), 'utf8')).toBe('source')
  await expect(f.documents.open(scope, old.board.boardId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const later = await f.create(scope, 'later')
  const resumed = new ConversationHistory(f.store, f.dataPath, undefined, undefined, undefined, async (filter, cleanupId) => { seen.push(cleanupId); await f.cleanup(filter, cleanupId) })
  expect(await resumed.recover()).toEqual([])
  expect(seen).toHaveLength(2); expect(seen[1]).toBe(seen[0])
  expect(await f.store.load('conversationCleanup')).toEqual([])
  expect(await f.store.get('conversations', f.conversation.id)).toMatchObject({ list: { hidden: true } })
  expect(await f.documents.open(scope, later.board.boardId)).toEqual(later.board)
})

it('retains an externally changed canvas and reports its pending source cleanup during recovery', async () => {
  const f = await setup(), scope = { employeeId: 'employee-a', conversationId: f.conversation.id }
  const board = await f.create(scope, 'changed')
  const file = join(f.dataPath, 'canvases', canvasScopeKey(scope), `${board.board.boardId}.json`)
  const changed = JSON.parse(await readFile(file, 'utf8')); changed.board.title = 'outside edit'
  const bytes = JSON.stringify(changed); await writeFile(file, bytes)
  const history = new ConversationHistory(f.store, f.dataPath, undefined, undefined, undefined, f.cleanup)
  await expect(history.clear(f.conversation, false)).rejects.toThrow('保留')
  const pending = await f.store.get<{ canvasCleanupId: string }>('conversationCleanup', f.conversation.id)
  expect(pending?.canvasCleanupId).toBeTruthy()
  expect(await history.recover()).toEqual([{ conversationId: f.conversation.id, error: expect.stringContaining('保留') }])
  expect(await readFile(file, 'utf8')).toBe(bytes)
  expect(await f.store.get('conversationCleanup', f.conversation.id)).toMatchObject({ canvasCleanupId: pending!.canvasCleanupId, canvasCleanupError: expect.any(String) })
})

it('keeps the original canvas cleanup identity when preparing the same session deletion again', async () => {
  const f = await setup()
  const receipt: SessionOperationRecord = { id: 'delete-session', requestId: 'delete-session', operation: 'delete', conversationId: f.conversation.id, state: 'pending', fingerprint: sessionFingerprint({ operation: 'delete', conversationId: f.conversation.id }) }
  await prepareSessionDeletion(f.store, f.conversation, [], receipt)
  const history = new ConversationHistory(f.store, f.dataPath, undefined, undefined, undefined, async () => { throw new Error('disk conflict') })
  await expect(history.clear(f.conversation, true, false, receipt)).rejects.toThrow('disk conflict')
  const pending = await f.store.get('conversationCleanup', f.conversation.id)
  await prepareSessionDeletion(f.store, f.conversation, [], receipt)
  expect(await f.store.get('conversationCleanup', f.conversation.id)).toEqual(pending)
})

it('derives stable per-employee cleanup identities after batch deletion and resumes without deleting later boards', async () => {
  const f = await setup()
  await f.store.write([], [{ collection: 'conversations', id: f.conversation.id }])
  const scopeA = { employeeId: 'employee-a' }, scopeB = { employeeId: 'employee-b' }, scopeC = { employeeId: 'employee-c' }
  await f.create(scopeA, 'old-a'); await f.create(scopeB, 'old-b'); const keep = await f.create(scopeC, 'keep-c')
  const seen = new Map<string, string>(), calls: string[] = []
  const losingReply = async (filter: CanvasScopeFilter, cleanupId: string) => {
    expect(await f.store.get('agents', filter.employeeId!)).toBeUndefined()
    expect(await f.store.load('contactDeletions')).toHaveLength(1)
    seen.set(filter.employeeId!, cleanupId); await f.cleanup(filter, cleanupId)
    if (filter.employeeId === scopeB.employeeId) throw new Error('reply lost')
  }
  await expect(new ContactDeletionService(f.store, f.dataPath, undefined, losingReply).delete({ agentIds: [scopeA.employeeId, scopeB.employeeId] })).rejects.toThrow('reply lost')
  expect(new Set(seen.values()).size).toBe(2)
  const laterA = await f.create(scopeA, 'later-a'), laterB = await f.create(scopeB, 'later-b')
  await new ContactDeletionService(f.store, f.dataPath, undefined, async (filter, cleanupId) => { expect(cleanupId).toBe(seen.get(filter.employeeId!)); calls.push(filter.employeeId!); await f.cleanup(filter, cleanupId) }).recover()
  expect(calls).toEqual([scopeA.employeeId, scopeB.employeeId])
  expect(await f.store.load('contactDeletions')).toEqual([])
  expect(await f.documents.open(scopeA, laterA.board.boardId)).toEqual(laterA.board)
  expect(await f.documents.open(scopeB, laterB.board.boardId)).toEqual(laterB.board)
  expect(await f.documents.open(scopeC, keep.board.boardId)).toEqual(keep.board)
})

it('refuses employee cleanup while the source identity still exists', async () => {
  const f = await setup(), cleanup = vi.fn(async () => {})
  await f.store.write([row('contactDeletions', 'pending', { agentIds: ['employee-a'], status: 'pending' })])
  await expect(new ContactDeletionService(f.store, f.dataPath, undefined, cleanup).recover()).rejects.toThrow('身份仍存在')
  expect(cleanup).not.toHaveBeenCalled()
  expect(await f.store.get('contactDeletions', 'pending')).toMatchObject({ status: 'failed' })
})

it('dispatches trusted cleanup independently of plugin enablement and drains until its acknowledgement', async () => {
  const f = await setup()
  let resolve!: (value: { deletedBoards: []; preserved: [] }) => void
  const request = vi.fn(() => new Promise<{ deletedBoards: []; preserved: [] }>(done => { resolve = done }))
  const canvas = new CanvasService(f.dataPath, request)
  expect(await canvas.enabled()).toBe(false)
  const cleaning = canvas.cleanup({ conversationId: 'conversation-a' }, 'cleanup-a')
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(request).toHaveBeenCalledWith({ type: 'discard', filter: { conversationId: 'conversation-a' }, cleanupId: 'cleanup-a' })
  expect(canvas.busy).toBe(true)
  let closed = false; const closing = canvas.close().then(() => { closed = true })
  await Promise.resolve(); expect(closed).toBe(false)
  resolve({ deletedBoards: [], preserved: [] }); await cleaning; await closing
  expect(canvas.busy).toBe(false)
  expect(() => canvasHostEnvelopeSchema.parse({ type: 'discard', filter: {}, cleanupId: 'cleanup-a' })).toThrow()
  expect(() => canvasHostEnvelopeSchema.parse({ type: 'discard', filter: { employeeId: 'a' }, cleanupId: '../arbitrary' })).toThrow()
})
