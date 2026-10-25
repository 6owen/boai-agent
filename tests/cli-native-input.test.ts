/*
 * [OUTPUT]: 显式ask沿原Codex/Claude批准接口，拒绝后零副作用回复，原生保存配置保持。
 * [OUTPUT]: 实际原生子进程在明确业务cwd执行，不同cwd不续用旧会话。
 * [INPUT]: Original AppService/RPC and isolated Codex/Claude protocol processes with real pending callbacks.
 * [OUTPUT]: Original CLI tools/organization, native input/approval exits, owner rejection and post-exit revocation.
 * [POS]: Native protocol integration, not real provider/installed native CLI certification.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { nativeFixture } from './fixtures/native-product'
import { verifyCliEnvironment, verifyWorkingDirectory } from './fixtures/cli-environment'
import { RunCliAccess } from '../packages/runtime/src/run-cli-access'
import type { RunCliEnvironmentLease } from '../packages/shared/src/cli/run-access'
import { openDesktopCli } from '../apps/electron/src/main/cli-service'
import { readLocalConnection } from '../packages/transport/src/discovery'
import { CliRpcClient } from '../packages/transport/src/client'
import { executeMessage, type ExecutionEvent } from '../apps/cli/src/execution'
import type { MessageExecution } from '../packages/shared/src/domain/message-execution'
import type { Message, Snapshot, Conversation, ConversationDetail } from '../packages/shared/src/domain'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it.each(['codex', 'claude'] as const)('%s uses the explicit working directory and renews its session when it changes', async runtime => {
  await verifyWorkingDirectory(await nativeFixture(runtime, cleanup), cleanup)
}, 60000)
it.each(['codex', 'claude'] as const)('%s automatically receives a run CLI lease and loses it after actual exit', async runtime => {
  await verifyCliEnvironment(await nativeFixture(runtime, cleanup), cleanup)
}, 60000)
it.each(['codex', 'claude'] as const)('%s uses the original organization tools via CLI without a knowledge-only permission gate', async runtime => {
  const f = await fixture(runtime), snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const core = snapshot.agents.find(agent => agent.id === 'bobo')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = core
  await f.service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: '', modelId: '', executionBackend: f.agent.executionBackend })
  const room = await f.service.handle('startCoreConversation', { requestId: randomUUID(), content: `NATIVE_CLI_ORGANIZATION ${JSON.stringify({ entry: resolve('dist/cli/index.mjs') })}` }) as Conversation
  let detail!: ConversationDetail
  await vi.waitFor(async () => { detail = await f.service.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.runs.length).toBeGreaterThan(0); expect(detail.runs.every(run => ['completed', 'failed'].includes(run.status))).toBe(true) }, { timeout: 20000 })
  expect(detail.runs.map(run => run.error)).toEqual([undefined])
  expect(detail.workItems?.[0].status).toBe('delivered')
  const after = await f.service.handle('snapshot', undefined) as Snapshot
  expect(after.agents.filter(agent => agent.name === '新核查员')).toHaveLength(1)
  expect(after.conversations.filter(room => room.title === '原生组织群')).toHaveLength(1)
}, 60000)
async function fixture(runtime: 'codex' | 'claude') {
  const f = await nativeFixture(runtime, cleanup)
  const server = await openDesktopCli(f.root, 'fixture', { request: async (method, input) => f.service.handle(method, input) as never, runAccess: input => f.service.runCliAccess(input) }); cleanup.push(server.close)
  const metadata = await readLocalConnection(f.root), client = new CliRpcClient(metadata.url, metadata)
  cleanup.push(async () => client.destroy()); await client.connect()
  return { ...f, client }
}

it.each(['codex', 'claude'] as const)('%s input is returned as pending and only its explicit original answer resumes the run', async runtime => {
  const f = await fixture(runtime), requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.chat.id, content: 'NATIVE_QUESTION', mentionIds: [] }, { requestId, waitTimeout: 15000, emit: event => events.push(event) })).toBe(3)
  const pending = await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution, action = pending.nativeActions[0]
  expect(pending.state).toBe('waiting_input'); expect(action).toMatchObject({ kind: 'input', status: 'pending' })
  expect(events.at(-1)).toMatchObject({ recovery: { nativeActions: [{ channel: 'respondNativeAction', identity: { conversationId: f.chat.id, runId: action.runId, actionId: action.id }, required: ['response'] }] } })
  const response = { conversationId: f.chat.id, runId: action.runId, actionId: action.id, response: { answers: Object.fromEntries(action.questions!.map(question => [question.id, ['CLI明确回答']])) } }
  await expect(f.client.invoke('respondNativeAction', { ...response, runId: 'wrong-run' })).rejects.toThrow()
  expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).nativeActions[0].status).toBe('pending')
  await f.client.invoke('respondNativeAction', response)
  const calls = vi.spyOn(f.client, 'invoke')
  expect(await executeMessage(f.client, { kind: 'observe' }, { requestId, waitTimeout: 15000, emit: event => events.push(event) })).toBe(0)
  expect(calls.mock.calls.some(call => ['sendMessage', 'sendEmployeeMessage', 'cancelMessageExecution', 'respondNativeAction'].includes(call[0]))).toBe(false)
  expect(events.some(event => event.type === 'message' && (event.message as Message).content.includes('CLI明确回答'))).toBe(true)
  expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).runs.map(run => run.id)).toEqual(pending.runs.map(run => run.id))
  await expect(f.client.invoke('respondNativeAction', response)).rejects.toThrow()
  expect(events.at(-1)).toMatchObject({ state: 'completed' })
})

it.each(['codex', 'claude'] as const)('%s native approval stays pending until explicitly denied, then observation preserves the denial reply', async runtime => {
  const f = await fixture(runtime), requestId = randomUUID(), events: ExecutionEvent[] = []
  const agent = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.chat.agentIds[0])!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  const saved = await f.service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'ask' })
  expect(await executeMessage(f.client, { kind: 'send', expectedExecutionPermission: 'ask', conversationId: f.chat.id, content: 'NATIVE_APPROVAL', mentionIds: [] }, { requestId, waitTimeout: 15000, emit: event => events.push(event) })).toBe(3)
  const pending = await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution, action = pending.nativeActions[0]
  expect(pending.state).toBe('waiting_approval'); expect(action.kind).toBe('approval')
  const option = action.options.find(item => /reject|deny|decline/.test(item.id)); expect(option).toBeDefined()
  await f.client.invoke('respondNativeAction', { conversationId: f.chat.id, runId: action.runId, actionId: action.id, response: { option: option!.id } })
  expect(await executeMessage(f.client, { kind: 'observe' }, { requestId, waitTimeout: 15000, emit: event => events.push(event) })).toBe(0)
  expect(events.some(event => event.type === 'message' && (event.message as Message).content.includes('已拒绝，未执行'))).toBe(true)
  expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).activeRunIds).toEqual([])
  expect((await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.chat.agentIds[0])).toEqual(saved)
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toMatchObject({ permissionExpectation: { permission: 'ask', agentIds: [agent.id] } })
})

it.each(['codex', 'claude'] as const)('%s cancellation while awaiting input waits for the native process and prevents later answers', async runtime => {
  const f = await fixture(runtime), requestId = randomUUID()
  const original = RunCliAccess.prototype.environment
  let lease: RunCliEnvironmentLease | undefined
  const spy = vi.spyOn(RunCliAccess.prototype, 'environment').mockImplementation(async function (this: RunCliAccess, runId) { lease = await original.call(this, runId); return lease })
  cleanup.push(async () => spy.mockRestore())
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.chat.id, content: 'NATIVE_QUESTION', mentionIds: [] }, { requestId, waitTimeout: 15000, emit: () => {} })).toBe(3)
  const action = (await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).nativeActions[0]
  const scoped = new CliRpcClient(lease!.env.BOAI_SERVER_URL!, { token: lease!.env.BOAI_SERVER_TOKEN! }); cleanup.push(async () => scoped.destroy()); await scoped.connect()
  expect(await scoped.invoke('employee:context')).toMatchObject({ runId: action.runId })
  expect(await executeMessage(f.client, { kind: 'cancel' }, { requestId, waitTimeout: 15000, emit: () => {} })).toBe(0)
  await expect(scoped.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  expect(await f.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'cancelled', activeRunIds: [], nativeActions: [] })
  await expect(f.client.invoke('respondNativeAction', { conversationId: f.chat.id, runId: action.runId, actionId: action.id, response: { answers: Object.fromEntries(action.questions!.map(question => [question.id, ['不能复活']])) } })).rejects.toThrow()
})
