/*
 * [OUTPUT]: 员工私聊/核心首发去重及空闲release拒绝其他客户端和实际活动。
 * [INPUT]: Real standalone assembly, SQLite owner/credential files and controlled original employee engine.
 * [OUTPUT]: Single owner, credential persistence boundaries, original sends and drain-before-release.
 * [POS]: C3 service regression; child-process and Electron checks are separate actual product evidence.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, realpath, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { acquireRuntimeOwner, RuntimeOwnedError } from '../packages/runtime/src/owner'
import { startOwnedRuntime } from '../packages/runtime/src/bootstrap'
import { startHeadlessServer } from '../packages/runtime/src/headless'
import { EnvironmentSecrets } from '../packages/runtime/src/environment-secrets'
import { CliRpcClient } from '../packages/transport/src/client'
import { readLocalConnection } from '../packages/transport/src/discovery'
import { executeMessage, type ExecutionEvent } from '../apps/cli/src/execution'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import type { Connection, Conversation, DigitalAgent } from '../packages/shared/src/domain'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function root() { const path = await realpath(await mkdtemp(join(tmpdir(), 'boai-headless-'))); cleanup.push(() => rm(path, { recursive: true, force: true })); return path }
const engine: AgentEngine = { test: async () => 'fixture', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => { await ctx.onDelta('独立服务原员工回复') } }
async function fixture(overrides: Partial<AgentEngine> = {}) {
  const path = await root(), server = await startHeadlessServer({ dataPath: path, version: 'test', engine: { ...engine, ...overrides }, skillHome: path, secretEnvironment: { BOAI_SECRET_FIXTURE: 'only-service-secret' } }); cleanup.push(server.close)
  const metadata = await readLocalConnection(path), client = new CliRpcClient(metadata.url, metadata); cleanup.push(() => client.destroy()); await client.connect()
  return { path, server, client }
}
async function configure(client: CliRpcClient) {
  const connection = await client.invoke('saveConnection', { name: 'isolated', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const employee = (await client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = employee
  await client.invoke('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture' })
  const room = await client.invoke('createConversation', { kind: 'direct', title: 'Standalone', agentIds: [employee.id] }) as Conversation
  return { connection, room }
}

it('serializes the same canonical profile without using stale metadata or PID as lock authority', async () => {
  const path = await root(), first = await acquireRuntimeOwner(path); cleanup.push(first.release)
  await writeFile(join(path, '.cli/owner.json'), JSON.stringify({ pid: 99999999, instanceId: 'stale' }), { mode: 0o600 })
  await expect(acquireRuntimeOwner(path)).rejects.toBeInstanceOf(RuntimeOwnedError)
  const alias = `${path}-alias`; await symlink(path, alias); cleanup.push(() => rm(alias))
  await expect(acquireRuntimeOwner(alias)).rejects.toBeInstanceOf(RuntimeOwnedError)
  await first.release()
  const second = await acquireRuntimeOwner(alias); cleanup.push(second.release)
  expect(second.identity.instanceId).not.toBe(first.identity.instanceId); expect(second.identity.dataPath).toBe(path)
})

it('starts no second runtime, while the first serves original employee configuration/send/history', async () => {
  const f = await fixture(), { room } = await configure(f.client)
  await expect(startHeadlessServer({ dataPath: f.path, version: 'test', engine, skillHome: f.path })).rejects.toMatchObject({ code: 'SERVER_BUSY' })
  await expect(startOwnedRuntime({ dataPath: f.path, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })).rejects.toBeInstanceOf(RuntimeOwnedError)
  expect(await f.client.invoke('health')).toMatchObject({ browserAvailable: false, credentialProvider: 'environment' })
  const events: ExecutionEvent[] = [], requestId = randomUUID()
  expect(await executeMessage(f.client, { kind: 'send', conversationId: room.id, content: '独立 Node', mentionIds: [] }, { requestId, emit: event => events.push(event), waitTimeout: 5000 })).toBe(0)
  expect(events.filter(event => event.type === 'message').at(-1)).toMatchObject({ message: { content: '独立服务原员工回复' } })
  const metadata = await readLocalConnection(f.path)
  await f.server.close()
  await expect(readLocalConnection(f.path)).rejects.toMatchObject({ code: 'ENOENT' })
  const next = await startHeadlessServer({ dataPath: f.path, version: 'test', engine, skillHome: f.path }); cleanup.push(next.close)
  const fresh = await readLocalConnection(f.path), client = new CliRpcClient(fresh.url, fresh); cleanup.push(() => client.destroy()); await client.connect()
  expect(fresh.serverId).not.toBe(metadata.serverId)
  expect(await client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] })
})

it('binds only environment references via original connection CAS and never persists credential values', async () => {
  const f = await fixture(), { connection } = await configure(f.client)
  const bound = await f.client.invoke('credentials:bind', { id: connection.id, expectedRevision: connection.revision, environmentVariable: 'BOAI_SECRET_FIXTURE' }) as { revision: number }
  expect(bound.revision).toBe(connection.revision! + 1)
  await expect(f.client.invoke('credentials:bind', { id: connection.id, expectedRevision: connection.revision, environmentVariable: 'BOAI_SECRET_FIXTURE' })).rejects.toThrow('连接已被修改')
  await expect(f.client.invoke('credentials:bind', { id: connection.id, expectedRevision: bound.revision, environmentVariable: 'BOAI_SERVER_TOKEN' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  const references = await readFile(join(f.path, '.cli/credential-refs.json'), 'utf8')
  expect(references).toContain('BOAI_SECRET_FIXTURE'); expect(references).not.toContain('only-service-secret')
  expect(JSON.stringify(await f.client.invoke('connections'))).not.toContain('only-service-secret')
  expect(await f.client.invoke('credentials:status')).toEqual([{ id: connection.id, mode: 'environment', environmentVariable: 'BOAI_SECRET_FIXTURE', available: true }])
  await f.server.close()
  const next = new EnvironmentSecrets(f.path, { BOAI_SECRET_FIXTURE: 'rotated-in-environment' }); await next.init()
  expect(await next.get(connection.id)).toBe('rotated-in-environment')
  await next.set(connection.id, 'session-only')
  expect(await readFile(join(f.path, '.cli/credential-refs.json'), 'utf8')).not.toContain('session-only')
  const reopened = new EnvironmentSecrets(f.path, { BOAI_SECRET_FIXTURE: 'rotated-in-environment' }); await reopened.init()
  expect(await reopened.get(connection.id)).toBeUndefined()
})

it('keeps desktop vault metadata visible while refusing to use or decrypt its value', async () => {
  const path = await root(), owner = await acquireRuntimeOwner(path); cleanup.push(owner.release)
  const original = JSON.stringify({ existing: 'encrypted-fixture-not-a-real-key' })
  await writeFile(join(path, 'credentials.enc.json'), original, { mode: 0o600 })
  const secrets = new EnvironmentSecrets(path, {}); await secrets.init()
  expect(await secrets.has('existing')).toBe(false)
  await expect(secrets.get('existing')).rejects.toThrow('可信凭据宿主')
  expect(await secrets.status()).toEqual([{ id: 'existing', mode: 'desktop-vault-unavailable', available: false }])
  expect(await readFile(join(path, 'credentials.enc.json'), 'utf8')).toBe(original)
})

it('holds ownership through delayed actual adapter exit and rejects mutation during shutdown', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async () => { started = true; await gate } }); cleanup.push(release)
  const { room } = await configure(f.client), requestId = randomUUID()
  await f.client.invoke('sendMessage', { requestId, conversationId: room.id, content: 'delayed adapter exit', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  const serverId = f.server.serverId
  expect(await f.client.invoke('server:release', { serverId })).toMatchObject({ accepted: false, state: 'ready' })
  await expect(f.client.invoke('server:shutdown', { serverId: randomUUID() })).rejects.toMatchObject({ code: 'PROFILE_MISMATCH' })
  expect(await f.client.invoke('server:shutdown', { serverId })).toEqual({ serverId, accepted: true })
  await vi.waitFor(async () => expect(await f.client.invoke('server:status')).toMatchObject({ state: 'stopping' }))
  await expect(acquireRuntimeOwner(f.path)).rejects.toBeInstanceOf(RuntimeOwnedError)
  await expect(f.client.invoke('sendMessage', { requestId: randomUUID(), conversationId: room.id, content: 'must not start', mentionIds: [] })).rejects.toMatchObject({ code: 'SERVER_BUSY' })
  release(); await f.server.finished
  const next = await acquireRuntimeOwner(f.path); cleanup.push(next.release)
})

it('reuses the employee private room and makes core first-send visible through the original receipt', async () => {
  const f = await fixture(), { room } = await configure(f.client)
  for (const employeeId of ['researcher', 'bobo']) {
    const requestId = randomUUID(), input = { employeeId, content: `run ${employeeId}`, requestId }
    const sent = await f.client.invoke('sendEmployeeMessage', input) as { id: string; conversationId: string }
    if (employeeId === 'researcher') expect(sent.conversationId).toBe(room.id)
    expect(await f.client.invoke('sendEmployeeMessage', input)).toMatchObject({ id: sent.id })
    expect(await f.client.invoke('getMessageReceipt', { requestId })).toMatchObject({ id: sent.id })
    await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] }))
    await expect(f.client.invoke('sendEmployeeMessage', { ...input, content: 'changed' })).rejects.toThrow('requestId')
    await expect(f.client.invoke('sendEmployeeMessage', { ...input, employeeId: employeeId === 'bobo' ? 'researcher' : 'bobo' })).rejects.toThrow('其他员工')
  }
})

it('only releases an idle service with a single client and confirms owner release after real close', async () => {
  const f = await fixture(), metadata = await readLocalConnection(f.path)
  const other = new CliRpcClient(metadata.url, metadata); cleanup.push(() => other.destroy()); await other.connect()
  expect(await f.client.invoke('server:release', { serverId: f.server.serverId })).toMatchObject({ accepted: false })
  other.destroy()
  await vi.waitFor(async () => expect(await f.client.invoke('server:status')).toMatchObject({ clients: 1 }))
  expect(await f.client.invoke('server:release', { serverId: f.server.serverId })).toMatchObject({ accepted: true, state: 'stopping' })
  await f.server.finished
  const owner = await acquireRuntimeOwner(f.path); cleanup.push(owner.release)
})
