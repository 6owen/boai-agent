/*
 * [INPUT]: Deferred diagnosis read responses for explicitly selected task identities.
 * [OUTPUT]: Hidden/deleted/changed selections cannot accept late results; reads never retry or poll.
 * [POS]: UI lifecycle contract tests without a browser or Electron process.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { expect, it, vi } from 'vitest'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { TaskDiagnosisSnapshot, TaskDiagnosisTarget } from '../packages/shared/src/domain/task-diagnosis'
import { createTaskDiagnosisReader, type TaskDiagnosisReadState } from '../apps/electron/src/renderer/components/detail-panel/task-diagnosis-state'
const first: TaskDiagnosisTarget = { kind: 'task', employeeId: 'alice', taskId: 'one' }, second: TaskDiagnosisTarget = { kind: 'task', employeeId: 'alice', taskId: 'two' }
const snapshot = (target: TaskDiagnosisTarget, marker = 'fact'): TaskDiagnosisSnapshot => ({ target: { ...target, runIds: [], workIds: [] }, facts: [{ id: marker }], candidates: [] }) as unknown as TaskDiagnosisSnapshot
const result = (target: TaskDiagnosisTarget, marker?: string): ApplicationResult => ({ protocolVersion: 'boai.application.v1', operation: 'diagnostics.task', status: 'succeeded', data: snapshot(target, marker) })
function deferred() { let resolve!: (value: ApplicationResult) => void; const promise = new Promise<ApplicationResult>(done => { resolve = done }); return { promise, resolve } }
it('ignores late success and failure after close, hide or source deletion resets the reader', async () => {
  const pending = deferred(), changed = vi.fn(), call = vi.fn(() => pending.promise), reader = createTaskDiagnosisReader(call, changed)
  const work = reader.read(first); reader.reset(); const count = changed.mock.calls.length
  pending.resolve(result(first)); await work
  expect(changed).toHaveBeenCalledTimes(count); expect(changed.mock.calls.at(-1)?.[0]).toEqual({ loading: false }); expect(call).toHaveBeenCalledTimes(1)
})
it('keeps the new selected task when an earlier query completes later', async () => {
  const a = deferred(), b = deferred(), states: TaskDiagnosisReadState[] = [], call = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const reader = createTaskDiagnosisReader(call, state => states.push(state)), old = reader.read(first), current = reader.read(second)
  b.resolve(result(second)); await current; a.resolve(result(first)); await old
  expect(states.at(-1)?.snapshot?.target).toMatchObject(second); expect(call).toHaveBeenCalledTimes(2)
})
it('rejects a mismatched source response and leaves failure as unknown without automatic retry', async () => {
  const changed = vi.fn(), call = vi.fn(async () => result(second)), reader = createTaskDiagnosisReader(call, changed)
  await reader.read(first)
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({ loading: false, error: '诊断返回来源已变化，请重新选择原任务。' })
  expect(changed.mock.calls.at(-1)?.[0].snapshot).toBeUndefined(); expect(call).toHaveBeenCalledTimes(1)
})
it('replaces the bounded page and clears old evidence when the next source check rejects', async () => {
  const states: TaskDiagnosisReadState[] = [], call = vi.fn().mockResolvedValueOnce(result(first, 'a')).mockResolvedValueOnce(result(first, 'b')).mockResolvedValueOnce({ protocolVersion: 'boai.application.v1', operation: 'diagnostics.task', status: 'rejected', error: { code: 'NOT_FOUND', message: '来源已清理' } })
  const reader = createTaskDiagnosisReader(call, state => states.push(state))
  await reader.read(first); await reader.read(first, 'cursor')
  expect(states.at(-1)?.snapshot?.facts.map(value => value.id)).toEqual(['b'])
  await reader.read(first, 'next')
  expect(states.at(-1)).toEqual({ loading: false, target: first, error: '来源已清理' }); expect(call).toHaveBeenCalledTimes(3)
})

import type { Conversation, Message } from '../packages/shared/src/domain'
import { createTaskDiagnosisExplanation } from '../apps/electron/src/renderer/components/detail-panel/task-diagnosis-explanation'
function explanationFixture(initial: string | null = null) {
  let persisted = initial
  const write = vi.fn((value: string) => { persisted = value }), clear = vi.fn(() => { persisted = null })
  const receipts = vi.fn(async (): Promise<[Conversation | null, Message | null]> => [{ id: 'core-room' } as Conversation, { id: 'owner-message', conversationId: 'core-room', senderType: 'user', senderId: 'user', diagnosisTarget: first } as Message])
  const start = vi.fn(async (): Promise<unknown> => undefined), changed = vi.fn(), ports = { read: () => persisted, write, clear, requestId: () => 'stable-request', start, receipts }
  return { ports, start, write, clear, receipts, changed, saved: () => persisted, reader: createTaskDiagnosisExplanation(ports, changed) }
}
it('sends once after persisting identity, verifies both receipts and clears local metadata after acceptance', async () => {
  const f = explanationFixture()
  f.start.mockImplementation(async () => { expect(f.saved()).toContain('stable-request') })
  expect(await f.reader.explain(first)).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(f.saved()).toBeNull(); expect(f.clear).toHaveBeenCalledOnce()
  expect(await f.reader.explain(first)).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(f.start).toHaveBeenCalledOnce(); expect(f.receipts).toHaveBeenNthCalledWith(2, 'stable-request')
})
it('keeps unknown sends across remount and only reads the original receipt without resending', async () => {
  const f = explanationFixture(); f.start.mockRejectedValueOnce(new Error('transport timeout')); f.receipts.mockResolvedValue([null, null])
  expect(await f.reader.explain(first)).toBeUndefined(); expect(f.saved()).toContain('stable-request')
  const restored = createTaskDiagnosisExplanation(f.ports, f.changed)
  expect(await restored.explain(first)).toBeUndefined()
  expect(f.start).toHaveBeenCalledOnce(); expect(f.receipts).toHaveBeenNthCalledWith(2, 'stable-request'); expect(restored.state()).toMatchObject({ pending: true, accepted: false })
})
it('blocks sends when durable identity storage is unavailable or corrupt', async () => {
  const f = explanationFixture(); f.ports.write = vi.fn(() => { throw new Error('storage blocked') })
  await createTaskDiagnosisExplanation(f.ports, f.changed).explain(first)
  expect(f.start).not.toHaveBeenCalled(); expect(f.receipts).not.toHaveBeenCalled()
  const corrupt = explanationFixture('{unreadable'); await corrupt.reader.explain(first)
  expect(corrupt.start).not.toHaveBeenCalled(); expect(corrupt.reader.state().error).toBeTruthy()
})
it('retains mismatched receipts as unknown and does not navigate or resend', async () => {
  const f = explanationFixture(); f.receipts.mockResolvedValue([{ id: 'wrong-room' } as Conversation, { id: 'owner-message', conversationId: 'core-room', senderType: 'user', senderId: 'user', diagnosisTarget: first } as Message])
  expect(await f.reader.explain(first)).toBeUndefined(); expect(f.saved()).not.toBeNull(); expect(f.reader.state().pending).toBe(true)
  await f.reader.explain(second); expect(f.start).toHaveBeenCalledOnce()
})
it('keeps confirmed backend receipts but cannot navigate when the original view closes before completion', async () => {
  const f = explanationFixture()
  let release!: () => void
  f.start.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const waiting = f.reader.explain(first); f.reader.invalidate(); const count = f.changed.mock.calls.length
  release(); expect(await waiting).toBeUndefined()
  expect(f.changed).toHaveBeenCalledTimes(count); expect(f.saved()).toBeNull(); expect(f.start).toHaveBeenCalledOnce()
})

it('preserves a successor request when an old controller receives its original receipt after remount', async () => {
  let persisted: string | null = null, release!: (value: [Conversation | null, Message | null]) => void
  const targetA: TaskDiagnosisTarget = { ...first, occurrenceId: 'a' }, targetB: TaskDiagnosisTarget = { ...first, occurrenceId: 'b' }
  const receiptA: [Conversation, Message] = [{ id: 'core-a' } as Conversation, { id: 'message-a', conversationId: 'core-a', senderType: 'user', senderId: 'user', diagnosisTarget: targetA } as Message]
  const delayedA = new Promise<[Conversation | null, Message | null]>(resolve => { release = resolve })
  const start = vi.fn(async () => {}), receipts = vi.fn().mockReturnValueOnce(delayedA).mockResolvedValueOnce(receiptA).mockResolvedValue([null, null])
  const clear = vi.fn(() => { persisted = null }), ports = { read: () => persisted, write: (value: string) => { persisted = value }, clear, requestId: vi.fn().mockReturnValueOnce('request-a').mockReturnValueOnce('request-b'), start, receipts }
  const oldController = createTaskDiagnosisExplanation(ports, vi.fn()), oldRead = oldController.explain(targetA)
  await vi.waitFor(() => expect(receipts).toHaveBeenCalledWith('request-a'))
  oldController.invalidate()
  const currentController = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await currentController.explain(targetA)).toEqual({ conversationId: 'core-a', messageId: 'message-a' })
  expect(persisted).toBeNull(); expect(clear).toHaveBeenCalledOnce()
  // The confirmed controller only views A. A new mount may explicitly submit B.
  const successorController = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await successorController.explain(targetB)).toBeUndefined()
  expect(JSON.parse(persisted!).requestId).toBe('request-b')
  release(receiptA); expect(await oldRead).toBeUndefined()
  expect(JSON.parse(persisted!).requestId).toBe('request-b'); expect(clear).toHaveBeenCalledOnce()
  const restored = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await restored.explain(targetB)).toBeUndefined()
  expect(start).toHaveBeenCalledTimes(2); expect(receipts).toHaveBeenLastCalledWith('request-b')
  expect(restored.state()).toMatchObject({ pending: true, accepted: false })
})

it.each(['read', 'clear'] as const)('keeps a verified receipt pending when storage %s fails during cleanup', async failure => {
  let persisted: string | null = null, failCleanup = false
  const receipts = vi.fn(async (): Promise<[Conversation, Message]> => [{ id: 'core-room' } as Conversation, { id: 'owner-message', conversationId: 'core-room', senderType: 'user', senderId: 'user', diagnosisTarget: first } as Message])
  const start = vi.fn(async () => { failCleanup = true }), clear = vi.fn(() => { if (failCleanup && failure === 'clear') throw new Error('clear unavailable'); persisted = null })
  const ports = { read: () => { if (failCleanup && failure === 'read') throw new Error('read unavailable'); return persisted }, write: (value: string) => { persisted = value }, clear, requestId: () => 'stable-request', start, receipts }
  const controller = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await controller.explain(first)).toBeUndefined()
  expect(JSON.parse(persisted!).requestId).toBe('stable-request')
  expect(controller.state()).toMatchObject({ pending: true, accepted: false })
  expect(await controller.explain(second)).toBeUndefined(); expect(start).toHaveBeenCalledOnce()
  failCleanup = false
  expect(await controller.explain(first)).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(persisted).toBeNull(); expect(start).toHaveBeenCalledOnce(); expect(receipts).toHaveBeenLastCalledWith('stable-request')
})

it('views only the original accepted request after selection changes and ignores extra clicks while receipt lookup is loading', async () => {
  const f = explanationFixture()
  expect(await f.reader.explain(first)).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(f.reader.state().accepted).toBe(true)
  let release!: (value: [Conversation | null, Message | null]) => void
  const pending = new Promise<[Conversation | null, Message | null]>(resolve => { release = resolve })
  f.receipts.mockReturnValueOnce(pending)
  const viewingOriginal = f.reader.explain(second)
  expect(f.reader.state()).toMatchObject({ accepted: true, busy: true })
  expect(await f.reader.explain({ ...first, occurrenceId: 'new-selection' })).toBeUndefined()
  expect(f.start).toHaveBeenCalledOnce(); expect(f.receipts).toHaveBeenLastCalledWith('stable-request')
  release([{ id: 'core-room' } as Conversation, { id: 'owner-message', conversationId: 'core-room', senderType: 'user', senderId: 'user', diagnosisTarget: first } as Message])
  expect(await viewingOriginal).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(f.start).toHaveBeenCalledOnce(); expect(f.saved()).toBeNull()
})

const definiteRejection = (requestId: string) => ({ status: 'rejected', requestId, code: 'NOT_ACCEPTED', message: '本次解释请求未受理，请检查当前配置后重新发送。' })
it.each(['same-controller', 'remount'])('allows a later explicit send after a typed definite rejection (%s)', async mode => {
  const f = explanationFixture(); f.ports.requestId = vi.fn().mockReturnValueOnce('stable-request').mockReturnValueOnce('next-request')
  f.start.mockResolvedValueOnce(definiteRejection('stable-request'))
  expect(await f.reader.explain(first)).toBeUndefined()
  expect(f.saved()).toBeNull(); expect(f.reader.state()).toMatchObject({ pending: false, accepted: false, error: '本次解释请求未受理，请检查当前配置后重新发送。' })
  expect(f.receipts).not.toHaveBeenCalled(); expect(f.start).toHaveBeenCalledOnce()
  const next = mode === 'remount' ? createTaskDiagnosisExplanation(f.ports, f.changed) : f.reader
  expect(await next.explain(first)).toEqual({ conversationId: 'core-room', messageId: 'owner-message' })
  expect(f.start).toHaveBeenNthCalledWith(2, { requestId: 'next-request', diagnosisTarget: first })
  expect(f.start).toHaveBeenCalledTimes(2)
})

it.each([
  { status: 'unknown', requestId: 'stable-request' },
  definiteRejection('different-request'),
  { status: 'rejected', requestId: 'stable-request', code: 'NOT_ACCEPTED', message: 'arbitrary error body' },
])('retains the original pending identity for unknown or non-matching rejection results (%j)', async outcome => {
  const f = explanationFixture(); f.start.mockResolvedValueOnce(outcome); f.receipts.mockResolvedValue([null, null])
  expect(await f.reader.explain(first)).toBeUndefined()
  expect(f.saved()).toContain('stable-request'); expect(f.clear).not.toHaveBeenCalled()
  expect(await createTaskDiagnosisExplanation(f.ports, f.changed).explain(first)).toBeUndefined()
  expect(f.start).toHaveBeenCalledOnce(); expect(f.receipts).toHaveBeenLastCalledWith('stable-request')
})

it('does not clear a later request or change its controller when an earlier send receives a late rejection', async () => {
  let persisted: string | null = null, rejectA!: (value: unknown) => void
  const targetA: TaskDiagnosisTarget = { ...first, occurrenceId: 'a' }, targetB: TaskDiagnosisTarget = { ...first, occurrenceId: 'b' }
  const receiptA: [Conversation, Message] = [{ id: 'core-a' } as Conversation, { id: 'message-a', conversationId: 'core-a', senderType: 'user', senderId: 'user', diagnosisTarget: targetA } as Message]
  const delayedA = new Promise<unknown>(resolve => { rejectA = resolve })
  const start = vi.fn().mockReturnValueOnce(delayedA).mockResolvedValue({ status: 'unknown', requestId: 'request-b' })
  const clear = vi.fn(() => { persisted = null }), receipts = vi.fn().mockResolvedValueOnce(receiptA).mockResolvedValue([null, null])
  const ports = { read: () => persisted, write: (value: string) => { persisted = value }, clear, requestId: vi.fn().mockReturnValueOnce('request-a').mockReturnValueOnce('request-b'), start, receipts }
  const old = createTaskDiagnosisExplanation(ports, vi.fn()), oldSend = old.explain(targetA)
  old.invalidate()
  const reconciler = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await reconciler.explain(targetA)).toEqual({ conversationId: 'core-a', messageId: 'message-a' })
  const changes = vi.fn(), current = createTaskDiagnosisExplanation(ports, changes)
  expect(await current.explain(targetB)).toBeUndefined()
  const count = changes.mock.calls.length
  rejectA(definiteRejection('request-a')); expect(await oldSend).toBeUndefined()
  expect(JSON.parse(persisted!).requestId).toBe('request-b'); expect(clear).toHaveBeenCalledOnce()
  expect(changes).toHaveBeenCalledTimes(count); expect(current.state()).toMatchObject({ pending: true, accepted: false })
  expect(await current.explain(targetB)).toBeUndefined(); expect(receipts).toHaveBeenLastCalledWith('request-b'); expect(start).toHaveBeenCalledTimes(2)
})

it.each(['read', 'clear'] as const)('retains pending when definite-rejection cleanup cannot %s the stored identity', async failure => {
  let persisted: string | null = null, failCleanup = false
  const start = vi.fn(async () => { failCleanup = true; return definiteRejection('request-a') }), receipts = vi.fn(async (): Promise<[null, null]> => [null, null])
  const ports = { read: () => { if (failCleanup && failure === 'read') throw new Error('storage unavailable'); return persisted }, write: (value: string) => { persisted = value }, clear: () => { if (failCleanup && failure === 'clear') throw new Error('storage unavailable'); persisted = null }, requestId: () => 'request-a', start, receipts }
  const controller = createTaskDiagnosisExplanation(ports, vi.fn())
  expect(await controller.explain(first)).toBeUndefined()
  expect(controller.state()).toMatchObject({ pending: true, accepted: false })
  expect(JSON.parse(persisted!).requestId).toBe('request-a')
  failCleanup = false
  expect(await controller.explain(first)).toBeUndefined()
  expect(start).toHaveBeenCalledOnce(); expect(receipts).toHaveBeenLastCalledWith('request-a'); expect(persisted).not.toBeNull()
})
