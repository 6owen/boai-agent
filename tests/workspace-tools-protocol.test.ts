/*
 * [INPUT]: Real AppService/application facade, isolated SQLite and native PTY.
 * [OUTPUT]: Durable terminal intent, cross-scope rejection and clear/exit lifecycle evidence.
 * [POS]: Product integration without external models or renderer automation.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import type { EngineContext } from '../src/runtime/contracts'
import type { Conversation, Snapshot } from '../src/shared/domain'
import type { ApplicationResult } from '../src/shared/domain/application-protocol'
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
it('deduplicates creation, executes in the same session, then clears output and receipts with the chat', async () => {
  const f = await fixture()
  const first = await f.call('terminal.create', f.scope, 'create-once')
  expect(first.status).toBe('succeeded')
  expect(await f.call('terminal.create', f.scope, 'create-once')).toEqual(first)
  const terminal = first.data as { id: string }
  expect((await f.call('terminal.list', f.scope)).data).toHaveLength(1)
  const execution = await f.call('terminal.exec', { id: terminal.id, command: 'echo protocol-terminal' }, 'one-command')
  expect(execution).toMatchObject({ status: 'succeeded', data: { status: 'exited', exitCode: 0, conversationId: f.room.id } })
  expect((execution.data as { output: string }).output).toContain('protocol-terminal')
  expect(await f.call('workspace.close', { ...f.scope, terminalIds: [terminal.id], previewIds: [] }, 'close-specific')).toMatchObject({ status: 'succeeded', data: { terminals: [{ id: terminal.id, status: 'exited' }] } })
  await f.owned.service.handle('clearConversationHistory', { id: f.room.id, hide: false })
  expect(await f.call('terminal.read', { id: terminal.id })).toMatchObject({ status: 'rejected' })
  expect(await f.owned.service.handle('getApplicationReceipt', { requestId: 'one-command' })).toMatchObject({ status: 'cleared' })
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
  expect((await f.call('terminal.list', f.scope)).data).toEqual([])
  expect(await f.call('activity.status')).toMatchObject({ data: { settings: { enabled: false } } })
})
