/*
 * [INPUT]: Isolated SQLite records containing private bodies and unrelated request/run identities.
 * [OUTPUT]: Regression proof for bounded source-scoped diagnosis projection and zero writes.
 * [POS]: Diagnosis storage contract tests; no runtime, model or personal data.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'boai-diagnosis-records-')), store = new ProductStore(join(dir, 'data.db'))
  cleanup.push(() => rm(dir, { recursive: true, force: true })); await store.init(); cleanup.push(() => store.close())
  return store
}
it('projects only original-source receipts and exact run interactions without reading private bodies or writing', async () => {
  const store = await fixture()
  const scope = { employeeId: 'alice', conversationId: 'room', runId: 'run-1', triggerMessageId: 'source-1' }
  const receipt = (id: string, employeeId: string, messageId: string) => ({ collection: 'applicationOperations', id, value: { id, actor: { kind: 'employee', employeeId, conversationId: 'room', messageId }, result: { operation: 'secret.write', status: 'unknown', data: { private: 'SECRET' }, error: { code: 'OUTCOME_UNKNOWN', message: 'SECRET' } } } })
  await store.write([
    receipt('own-1', 'alice', 'source-1'), receipt('own-2', 'alice', 'source-1'), receipt('foreign', 'bob', 'source-1'), receipt('other-source', 'alice', 'source-2'),
    { collection: 'nativeActions', id: 'action', value: { id: 'action', agentId: 'alice', conversationId: 'room', runId: 'run-1', kind: 'input', status: 'pending', createdAt: '2026-11-07T00:00:00Z', detail: 'SECRET' } },
    { collection: 'nativeActions', id: 'other-action', value: { id: 'other-action', agentId: 'alice', conversationId: 'room', runId: 'run-2', kind: 'input', status: 'pending' } },
    { collection: 'approvals', id: 'approval', value: { id: 'approval', conversationId: 'room', runId: 'run-1', kind: 'command', command: 'SECRET' } },
    { collection: 'approvals', id: 'other-approval', value: { id: 'other-approval', conversationId: 'room', runId: 'run-2', command: 'SECRET' } },
  ])
  const before = await store.load('applicationOperations'), write = vi.spyOn(store, 'write'), transaction = vi.spyOn(store, 'transaction')
  const result = await store.queryTaskDiagnosisRecords(scope, 1)
  expect(result.receipts).toHaveLength(1); expect(result.receipts[0]).toMatchObject({ id: 'own-1', status: 'unknown', errorCode: 'OUTCOME_UNKNOWN' })
  expect(result.nativeActions.map(value => value.id)).toEqual(['action']); expect(result.approvals.map(value => value.id)).toEqual(['approval'])
  expect(result.truncated).toEqual({ receipts: true, nativeActions: false, approvals: false })
  expect(JSON.stringify(result)).not.toContain('SECRET'); expect(JSON.stringify(result)).not.toContain('foreign'); expect(JSON.stringify(result)).not.toContain('other-')
  expect(await store.load('applicationOperations')).toEqual(before); expect(write).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled()
})
