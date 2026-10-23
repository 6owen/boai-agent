/*
 * [INPUT]: Isolated original headless runtime, private host transport and worker-shaped desktop adapter.
 * [OUTPUT]: Ownership-loser discovery, quit/version refusal, immediate post-detach shutdown and stale recovery without business replay.
 * [POS]: C3 host module integration; actual Electron/browser evidence lives in BDD.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { startHeadlessServer } from '../src/runtime/headless'
import { DesktopHostBridge } from '../src/runtime/desktop-host'
import { AttachedRuntime, findAttachedRuntime, waitForAttachedRuntime } from '../src/main/attached-runtime'
import { readLocalConnection } from '../src/cli/discovery'
import { CliRpcClient } from '../src/cli/client'
import { MAX_DESKTOP_MESSAGE_BYTES } from '../src/shared/cli/protocol'
import type { Connection } from '../src/shared/domain'
import type { BrowserLease } from '../src/shared/ipc/browser'
import type { DigitalAgent } from '../src/shared/domain'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
async function root() { const path = await realpath(await mkdtemp(join(tmpdir(), 'boai-attached-'))); cleanup.push(() => rm(path, { recursive: true, force: true })); return path }
function request(host: AttachedRuntime, method: string, input?: unknown) {
  const id = randomUUID()
  return new Promise<unknown>((resolve, reject) => {
    const receive = (message: { type: string; response?: { id: string; result: unknown; error?: string } }) => {
      if (message.type !== 'response' || message.response?.id !== id) return
      host.off('message', receive)
      if (message.response.error) reject(new Error(message.response.error)); else resolve(message.response.result)
    }
    host.on('message', receive); host.postMessage({ type: 'request', request: { id, method, input }, waitForCompletion: true })
  })
}
function supply(host: AttachedRuntime, vault: Map<string, string>, browser: (method: string, input: unknown) => Promise<unknown> = async () => undefined) {
  host.on('message', async message => {
    if (message.type === 'secret') {
      let value: string | boolean | undefined
      if (message.operation === 'get') value = vault.get(message.key)
      if (message.operation === 'has') value = vault.has(message.key)
      if (message.operation === 'set') vault.set(message.key, message.value)
      if (message.operation === 'delete') vault.delete(message.key)
      host.postMessage({ type: 'secret-result', id: message.id, value })
    } else if (message.type === 'browser-host') {
      try { const result = await browser(message.method, message.input); host.postMessage({ type: 'browser-host-result', id: message.id, result }) }
      catch (error) { host.postMessage({ type: 'browser-host-result', id: message.id, error: String(error) }) }
    }
  })
}
it('attaches to one original service while public owner tokens cannot invoke private host or read vault values', async () => {
  const path = await root(), server = await startHeadlessServer({ dataPath: path, version: 'test', skillHome: path, engine: { run: async () => {}, test: async () => '' } }); cleanup.push(server.close)
  const local = await readLocalConnection(path), privateConnection = await readLocalConnection(path, 'desktop.json')
  await expect(findAttachedRuntime(path, 'different-live-version', randomUUID())).rejects.toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED' })
  expect(local.token).not.toBe(privateConnection.token); expect(local.serverId).toBe(privateConnection.serverId)
  const publicClient = new CliRpcClient(local.url, local); cleanup.push(() => publicClient.destroy()); await publicClient.connect()
  await expect(publicClient.invoke('runtime:request', { method: 'getConnectionApiKey', input: { id: 'anything' } })).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' })
  const wrong = new CliRpcClient(privateConnection.url, { ...privateConnection, token: local.token }); cleanup.push(() => wrong.destroy())
  await expect(wrong.connect()).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  const unattached = new CliRpcClient(privateConnection.url, { ...privateConnection, maxMessageBytes: MAX_DESKTOP_MESSAGE_BYTES }); cleanup.push(() => unattached.destroy()); await unattached.connect()
  await expect(unattached.invoke('runtime:request', { method: 'snapshot' })).rejects.toMatchObject({ code: 'AUTH_FAILED' }); unattached.destroy()
  const host = (await findAttachedRuntime(path, 'test', randomUUID()))!, vault = new Map<string, string>()
  supply(host, vault, async method => method === 'list' ? [{ instanceId: 'fake-window-for-transport-only' }] : undefined)
  cleanup.push(() => host.detach()); await host.start()
  expect(server.status()).toMatchObject({ desktopAttached: true, browserAvailable: true })
  expect(await publicClient.invoke('server:release', { serverId: server.serverId })).toMatchObject({ accepted: false })
  const saved = await request(host, 'saveConnection', { name: 'desktop-owned', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture', apiKey: 'synthetic-desktop-key' }) as Connection
  expect(vault.get(saved.id)).toBe('synthetic-desktop-key')
  expect(await request(host, 'getConnectionApiKey', { id: saved.id })).toBe('synthetic-desktop-key')
  expect(JSON.stringify(await publicClient.invoke('connections'))).not.toContain('synthetic-desktop-key')
  expect(await readFile(join(path, '.cli/credential-refs.json'), 'utf8')).not.toContain('synthetic-desktop-key')
  const sessionOnly = await publicClient.invoke('saveConnection', { name: 'session-only', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture', apiKey: 'synthetic-session-key' }) as Connection
  expect(vault.has(sessionOnly.id)).toBe(false)
  expect(await request(host, 'getBrowserWindows', {})).toEqual([{ instanceId: 'fake-window-for-transport-only' }])
  await expect(request(host, '__notARealInternalMethod')).rejects.toThrow('未知')
  await host.detach(); await vi.waitFor(() => expect(server.status()).toMatchObject({ state: 'ready', desktopAttached: false, browserAvailable: false }))
  expect(await publicClient.invoke('ping')).toMatchObject({ ok: true })
  await server.close()
  await writeFile(join(path, '.cli/desktop.json'), JSON.stringify({ ...privateConnection, version: 'old-dead-version' }), { mode: 0o600 })
  expect(await findAttachedRuntime(path, 'new-version', randomUUID())).toBeNull()
})

it('retains unknown browser exit until the same desktop reports actual drain, with no replay and bounded larger frames', async () => {
  const path = await root(), bridge = new DesktopHostBridge({ request: async (_method, input) => input, detach: async () => {}, lost: () => {} })
  await bridge.open(path, randomUUID(), 'test'); cleanup.push(() => bridge.close())
  const hostId = randomUUID(), host = (await findAttachedRuntime(path, 'test', hostId))!
  let release!: () => void
  const pendingAction = new Promise<void>(resolve => { release = resolve })
  supply(host, new Map(), async method => { if (method === 'executeSingle') await pendingAction })
  await host.start()
  const bytes = new Uint8Array(3 * 1024 * 1024).fill(23)
  expect(await request(host, 'transport-fixture', bytes)).toEqual(bytes)
  await bridge.request('acquire', { generation: 'original-generation' } as BrowserLease)
  const action = bridge.request('executeSingle', {} as never); let settled = false
  void action.catch(() => { settled = true })
  await vi.waitFor(() => expect(bridge.available).toBe(true)); host.kill()
  await vi.waitFor(() => expect(bridge.available).toBe(false)); expect(settled).toBe(false)
  const other = (await findAttachedRuntime(path, 'test', randomUUID()))!; cleanup.push(() => other.kill())
  const errors: string[] = []; other.on('message', message => { if (message.type === 'attach-error') errors.push(message.error) }); await other.start()
  expect(errors.join('')).toContain('真实退出尚未确认')
  release(); await pendingAction
  const same = (await findAttachedRuntime(path, 'test', hostId))!; supply(same, new Map()); cleanup.push(() => same.detach()); await same.start()
  await expect(action).rejects.toThrow('未重放')
  expect(bridge.available).toBe(true)
})

it('detaches the desktop without cancelling a running employee that has not used its browser', async () => {
  const path = await root()
  let release!: () => void, signal: AbortSignal | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const server = await startHeadlessServer({ dataPath: path, version: 'test', skillHome: path, engine: {
    test: async () => '', decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => { signal = context.signal; await gate; await context.onDelta('脱离桌面后原员工继续完成') },
  } }); cleanup.push(server.close)
  const metadata = await readLocalConnection(path), client = new CliRpcClient(metadata.url, metadata); cleanup.push(() => client.destroy()); await client.connect()
  const host = (await findAttachedRuntime(path, 'test', randomUUID()))!; supply(host, new Map()); cleanup.push(() => host.detach()); cleanup.push(release); await host.start()
  const connection = await request(host, 'saveConnection', { name: 'independent-run', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const employee = await request(host, 'saveAgent', { name: '独立员工', role: '普通交流', instructions: '', color: '#4A90D9', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, connectionId: connection.id, modelId: 'fixture' }) as DigitalAgent
  const requestId = randomUUID()
  await client.invoke('sendEmployeeMessage', { employeeId: employee.id, content: '普通问答', requestId })
  await vi.waitFor(() => expect(signal).toBeDefined())
  await host.detach()
  expect(signal!.aborted).toBe(false); expect(server.status().state).toBe('ready')
  release()
  await vi.waitFor(async () => expect(await client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] }))
})


it('waits for the original winning owner to publish a private endpoint without creating a service or business request', async () => {
  const path = await root()
  const waiting = waitForAttachedRuntime(path, 'test', randomUUID(), { timeoutMs: 5000 })
  await new Promise(resolve => setTimeout(resolve, 75))
  const server = await startHeadlessServer({ dataPath: path, version: 'test', skillHome: path, engine: { run: async () => { throw Error('No model allowed') }, test: async () => '' } }); cleanup.push(server.close)
  const host = await waiting; cleanup.push(() => host.detach()); supply(host, new Map())
  expect(host.serverId).toBe(server.serverId)
  expect(server.status().desktopAttached).toBe(false)
  await host.start()
  expect(server.status().desktopAttached).toBe(true)
  expect((await request(host, 'snapshot') as { conversations: unknown[] }).conversations).toEqual([])
  await host.detach()
  expect(server.status().desktopAttached).toBe(false)
  await server.close()
})

it('ends ownership-loser discovery on quit or deadline and refuses a live wrong version', async () => {
  const path = await root()
  await expect(waitForAttachedRuntime(path, 'test', randomUUID(), { timeoutMs: 60 })).rejects.toMatchObject({ code: 'SERVER_BUSY' })
  await expect(readFile(join(path, 'boai.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(waitForAttachedRuntime(path, 'test', randomUUID(), { stopping: () => true })).rejects.toMatchObject({ code: 'SERVER_BUSY' })
  const server = await startHeadlessServer({ dataPath: path, version: 'test', skillHome: path, engine: { run: async () => {}, test: async () => '' } }); cleanup.push(server.close)
  await expect(waitForAttachedRuntime(path, 'other', randomUUID())).rejects.toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED' })
  expect(server.status().desktopAttached).toBe(false)
})


it('removes a detached but still connected client from reverse-call subscriptions before allowing another desktop', async () => {
  const path = await root(), bridge = new DesktopHostBridge({ request: async () => undefined, detach: async () => {}, lost: () => {} })
  await bridge.open(path, randomUUID(), 'test'); cleanup.push(() => bridge.close())
  const metadata = await readLocalConnection(path, 'desktop.json')
  const old = new CliRpcClient(metadata.url, { ...metadata, maxMessageBytes: MAX_DESKTOP_MESSAGE_BYTES }); cleanup.push(() => old.destroy()); await old.connect()
  const oldCalls: unknown[] = []; old.on('host', value => oldCalls.push(value))
  await old.invoke('host:attach', { hostId: randomUUID(), pid: process.pid, drained: true })
  await old.invoke('host:detach'); expect(bridge.connected).toBe(false); expect(old.isConnected).toBe(true)
  const next = (await findAttachedRuntime(path, 'test', randomUUID()))!; cleanup.push(() => next.detach())
  supply(next, new Map(), async () => ['new-host-only']); await next.start()
  expect(await bridge.request('list', {})).toEqual(['new-host-only'])
  expect(oldCalls).toEqual([])
  await expect(old.invoke('runtime:request', { method: 'snapshot' })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
})
