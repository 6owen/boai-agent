/*
 * [INPUT]: Real AppService/application facade, isolated SQLite and native PTY.
 * [OUTPUT]: Terminal retirement, historical receipt replay without execution, preview deduplication/cleanup and original scope rejection.
 * [POS]: Product integration without external models or renderer automation.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startOwnedRuntime } from '../packages/runtime/src/bootstrap'
import { z } from 'zod'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import type { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { Conversation, Snapshot } from '../packages/shared/src/domain'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const f of clean.splice(0).reverse()) await f(); vi.unstubAllEnvs() })
async function fixture(run?: (ctx: EngineContext) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-terminal-protocol-'))); clean.push(() => rm(root, { recursive: true, force: true })); vi.stubEnv('HOME', root)
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine: { test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => { await run?.(ctx); await ctx.onDelta('已完成检查。') } }, secrets: { get: async () => 'fixture', set: async () => {}, delete: async () => {} }, emit: () => {} })
  clean.push(owned.close)
  const call = (operation: string, input = {}, requestId?: string) => owned.service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  await call('connections.create', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, 'fixture-connection')
  const room = await owned.service.handle('startCoreConversation', { content: '检查当前能力', requestId: 'fixture-start' }) as Conversation
  await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.id === room.id)?.activity, { timeout: 10000 }).toBe('idle')
  return { root, owned, call, room, scope: { employeeId: 'bobo', conversationId: room.id } }
}
it('deduplicates preview creation and rejects retired terminal requests before any preview side effect', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'index.html'), '<h1>preview retained</h1>')
  const input = { ...f.scope, directory: f.root }
  const first = await f.call('preview.start', input, 'preview-once')
  expect(first.status).toBe('succeeded')
  expect(await f.call('preview.start', input, 'preview-once')).toEqual(first)
  const page = first.data as { id: string; url: string }
  expect(await (await fetch(page.url)).text()).toContain('preview retained')
  for (const [operation, input] of [
    ['terminal.list', f.scope], ['terminal.create', f.scope], ['terminal.read', { id: 'legacy' }],
    ['terminal.exec', { id: 'legacy', command: 'echo must-not-run' }], ['terminal.write', { id: 'legacy', data: 'echo must-not-run\n' }],
    ['terminal.resize', { id: 'legacy', cols: 80, rows: 24 }], ['terminal.kill', { id: 'legacy' }],
  ] as const) expect(await f.call(operation, input, `retired-${operation}`)).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await f.call('workspace.close', { ...f.scope, terminalIds: ['legacy'], previewIds: [page.id] }, 'mixed-close')).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect((await f.call('preview.list', f.scope)).data).toMatchObject([{ id: page.id, status: 'ready' }])
  expect(await f.call('workspace.show', { ...f.scope, view: 'terminal' }, 'legacy-show')).toMatchObject({ status: 'rejected' })
  expect(await f.call('workspace.close', { ...f.scope, terminalIds: [], previewIds: [page.id] }, 'close-preview')).toMatchObject({ status: 'succeeded', data: { previews: [{ id: page.id, status: 'stopped' }], terminals: [] } })
  await f.owned.service.handle('clearConversationHistory', { id: f.room.id, hide: false })
  expect(await f.owned.service.handle('getApplicationReceipt', { requestId: 'preview-once' })).toMatchObject({ status: 'cleared' })
})
it('retains exact historical terminal receipts and conflicts without rerunning the original operation', async () => {
  const f = await fixture()
  const store = (f.owned.service as unknown as { store: ProductStore }).store
  const execute = vi.fn(async () => ({ id: 'historical-session', ...f.scope, status: 'exited' }))
  const legacy = new ApplicationService(store, [{ name: 'terminal.create', description: 'historical fixture', effect: 'write', resultType: 'terminal.create', input: z.object({ employeeId: z.string(), conversationId: z.string() }).strict(), execute }], async () => {})
  const original = await legacy.call({ operation: 'terminal.create', input: f.scope, requestId: 'historical-create' })
  expect(original.status).toBe('succeeded')
  expect(await f.call('terminal.create', f.scope, 'historical-create')).toEqual(original)
  expect(await f.call('terminal.create', { ...f.scope, title: 'different' }, 'historical-create')).toMatchObject({ status: 'rejected', error: { code: 'REQUEST_CONFLICT' } })
  expect(await f.call('terminal.create', f.scope, 'new-create')).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(execute).toHaveBeenCalledTimes(1)
})
it('does not let an employee enable recording or borrow another conversation terminal scope', async () => {
  let results: ApplicationResult[] = [], failure: unknown
  const f = await fixture(async ctx => {
    try {
      results = [
        await ctx.application!.call({ operation: 'activity.configure', input: { expectedRevision: 0, enabled: true }, requestId: 'not-owner' }),
        await ctx.application!.call({ operation: 'terminal.create', input: { employeeId: 'bobo', conversationId: 'foreign' }, requestId: 'foreign-shell' }),
      ]
    } catch (error) { failure = error }
  })
  expect(failure).toBeUndefined()
  expect(results).toHaveLength(2)
  expect(results[0]).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  expect(results[1]).toMatchObject({ status: 'rejected' })
  expect(await f.call('terminal.list', f.scope)).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await f.call('activity.status')).toMatchObject({ data: { settings: { enabled: false } } })
})
