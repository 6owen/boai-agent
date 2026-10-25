/*
 * [OUTPUT]: Raw sockets cannot bypass principal-filtered catalogs, impersonate owners or receive owner events; delayed authentication closes safely.
 * [INPUT]: Actual ws/wss sockets, Craft-derived client/codec and isolated certificates/handlers.
 * [OUTPUT]: Authentication, correlation, no replay, limits, subscriptions, TLS and shutdown evidence.
 * [POS]: CLI transport tests; no model, personal profile or external provider.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import WebSocket from 'ws'
import { CliRpcClient } from '../packages/transport/src/client'
import { startRpcServer, type RpcChannel } from '../packages/transport/src/server'
import { deserializeEnvelope, serializeEnvelope } from '../packages/shared/src/cli/codec'
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type MessageEnvelope } from '../packages/shared/src/cli/protocol'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const token = randomBytes(32).toString('base64url')
async function fixture(channels = new Map<string, RpcChannel>([['echo', { input: z.unknown(), effect: 'read', handle: input => input }]]), extra: Partial<Parameters<typeof startRpcServer>[0]> = {}) {
  const server = await startRpcServer({ token, workspaceId: 'fixture', version: 'test', channels, ...extra }); cleanup.push(() => server.close())
  const client = new CliRpcClient(server.url, { token, workspaceId: 'fixture' }); cleanup.push(() => client.destroy()); await client.connect()
  return { server, client }
}
async function raw(url: string, frame: MessageEnvelope) {
  const ws = new WebSocket(url); cleanup.push(() => ws.terminate()); await once(ws, 'open')
  const response = once(ws, 'message'); ws.send(serializeEnvelope(frame))
  return { ws, value: deserializeEnvelope(String((await response)[0])) }
}

it('preserves exact binary bytes and own __proto__ data without changing prototypes', () => {
  const args = JSON.parse('{"__proto__":{"polluted":true},"name":"中文"}')
  const value = deserializeEnvelope(serializeEnvelope({ id: 'test', type: 'request', channel: 'echo', args: [args, new Uint8Array([0, 127, 255])] }))
  expect(value.args?.[1]).toEqual(new Uint8Array([0, 127, 255]))
  expect(Object.hasOwn(value.args![0] as object, '__proto__')).toBe(true)
  expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
})

it('correlates concurrent out-of-order replies without replay or a second service', async () => {
  const calls: number[] = []
  const { client } = await fixture(new Map([['work', { input: z.number(), effect: 'write', handle: async input => { const value = input as number; calls.push(value); await new Promise(resolve => setTimeout(resolve, value === 1 ? 20 : 1)); return value } }]]))
  expect(await Promise.all([client.invoke('work', 1), client.invoke('work', 2)])).toEqual([1, 2])
  expect(calls).toEqual([1, 2])
  await expect(client.invoke('__backup', {})).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' })
})

it('enforces run identity on raw requests even when a client ignores the advertised catalog', async () => {
  const manage = vi.fn(), scoped = vi.fn((_input, session) => { session.subscriptions.set('app', {}); return session.principal.runId })
  const runToken = randomBytes(32).toString('base64url')
  const { server } = await fixture(new Map<string, RpcChannel>([
    ['manage', { input: z.unknown(), effect: 'write', handle: manage }],
    ['scoped', { access: 'run', input: z.unknown(), effect: 'read', handle: scoped }],
  ]), { authenticateRun: async candidate => {
    if (candidate !== runToken) throw new Error('bad token')
    return { kind: 'run', grantId: randomUUID(), runId: 'r1', employeeId: 'a1', conversationId: 'c1', expiresAt: Date.now() + 60000 }
  } })
  const { ws, value } = await raw(server.url, { id: randomUUID(), type: 'handshake', token: runToken, protocolVersion: PROTOCOL_VERSION })
  expect(value.registeredChannels).toEqual(['scoped'])
  const request = async (channel: string) => {
    const response = once(ws, 'message'); ws.send(serializeEnvelope({ id: randomUUID(), type: 'request', channel, args: [{}] }))
    return deserializeEnvelope(String((await response)[0]))
  }
  expect((await request('manage')).error?.code).toBe('AUTH_FAILED'); expect(manage).not.toHaveBeenCalled()
  expect((await request('scoped')).result).toBe('r1')
  const frames: MessageEnvelope[] = []; ws.on('message', bytes => frames.push(deserializeEnvelope(bytes.toString())))
  server.publish('app', { private: 'owner only' })
  await request('scoped')
  expect(frames.some(frame => frame.type === 'event')).toBe(false)
})

it.each([
  { token: 'wrong', protocolVersion: PROTOCOL_VERSION, code: 'AUTH_FAILED' },
  { token, protocolVersion: 'other', code: 'PROTOCOL_VERSION_UNSUPPORTED' },
  { token, protocolVersion: PROTOCOL_VERSION, workspaceId: 'other', code: 'PROFILE_MISMATCH' },
])('rejects invalid handshake before handler dispatch: $code', async ({ code, ...credentials }) => {
  const calls = vi.fn()
  const { server } = await fixture(new Map([['write', { input: z.unknown(), effect: 'write', handle: calls }]]))
  const { value } = await raw(server.url, { id: randomUUID(), type: 'handshake', ...credentials })
  expect(value.error?.code).toBe(code); expect(calls).not.toHaveBeenCalled(); expect(JSON.stringify(value)).not.toContain(token)
})

it('rejects unknown public channels, invalid schemas and duplicate transport IDs', async () => {
  const calls = vi.fn(input => input)
  const { server } = await fixture(new Map([['write', { input: z.object({ text: z.string() }).strict(), effect: 'write', handle: calls }]]))
  const { ws } = await raw(server.url, { id: 'hello', type: 'handshake', token, protocolVersion: PROTOCOL_VERSION })
  async function request(id: string, channel: string, args: unknown[]) { const reply = once(ws, 'message'); ws.send(serializeEnvelope({ id, type: 'request', channel, args })); return deserializeEnvelope(String((await reply)[0])) }
  expect((await request('private', '__backup', [{}])).error?.code).toBe('CHANNEL_NOT_FOUND')
  expect((await request('schema', 'write', [{ text: 'x', permission: 'full-access' }])).error?.code).toBe('INVALID_REQUEST')
  expect((await request('one', 'write', [{ text: 'accepted' }])).result).toEqual({ text: 'accepted' })
  expect((await request('one', 'write', [{ text: 'again' }])).error?.code).toBe('DUPLICATE_REQUEST')
  expect(calls).toHaveBeenCalledTimes(1)
})

it('reports timeout as unknown and never resends the accepted operation', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve }); let calls = 0
  const { server } = await fixture(new Map([['write', { input: z.undefined(), effect: 'write', handle: async () => { calls++; await gate; return 'done' } }]]))
  const client = new CliRpcClient(server.url, { token, requestTimeout: 30 }); cleanup.push(() => client.destroy()); await client.connect()
  await expect(client.invoke('write')).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
  expect(calls).toBe(1); release(); await new Promise(resolve => setTimeout(resolve, 25)); expect(calls).toBe(1)
})

it('rejects pending requests on disconnect and does not cancel or replay accepted work', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve }); let calls = 0
  const { server, client } = await fixture(new Map([['work', { input: z.undefined(), effect: 'write', handle: async () => { calls++; await gate; return 'done' } }]]))
  const pending = expect(client.invoke('work')).rejects.toMatchObject({ code: 'CLIENT_DISCONNECTED' })
  await vi.waitFor(() => expect(calls).toBe(1)); await server.close(); await pending; release()
  expect(client.isConnected).toBe(false); expect(server.clients).toBe(0); expect(calls).toBe(1)
})

it('filters subscribed events and releases subscriptions on close', async () => {
  const channels = new Map<string, RpcChannel>([['subscribe', { input: z.string(), effect: 'read', handle: (input, session) => { session.subscriptions.set('app', { conversationId: input as string }); return true } }]])
  const { server, client } = await fixture(channels), observed: unknown[] = []
  const remove = client.on('app', event => observed.push(event))
  await client.invoke('subscribe', 'room-a')
  server.publish('app', 'other', 'room-b'); server.publish('app', 'mine', 'room-a')
  await vi.waitFor(() => expect(observed).toEqual(['mine']))
  remove(); server.publish('app', 'unsubscribed', 'room-a'); client.destroy()
  await vi.waitFor(() => expect(server.clients).toBe(0)); expect(observed).toEqual(['mine'])
})

it('refuses oversized requests locally and opaque cross-origin browser connections', async () => {
  const { server, client } = await fixture()
  await expect(client.invoke('echo', 'x'.repeat(MAX_MESSAGE_BYTES))).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' })
  const ws = new WebSocket(server.url, { origin: 'https://untrusted.example' }); cleanup.push(() => ws.terminate())
  const error = await new Promise<Error>(resolve => ws.once('error', resolve)); expect(error.message).toContain('401')
})

it('uses the supplied CA before WSS connection and never disables certificate validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-cli-tls-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const key = join(root, 'key.pem'), cert = join(root, 'cert.pem')
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'])
  const server = await startRpcServer({ token, workspaceId: 'tls-fixture', version: 'test', channels: new Map([['ping', { input: z.undefined(), effect: 'read', handle: () => 'pong' }]]), tls: { key: await readFile(key), cert: await readFile(cert) } }); cleanup.push(() => server.close())
  const wrong = new CliRpcClient(server.url, { token }); cleanup.push(() => wrong.destroy()); await expect(wrong.connect()).rejects.toMatchObject({ code: 'CLIENT_DISCONNECTED' })
  const good = new CliRpcClient(server.url, { token, ca: await readFile(cert) }); cleanup.push(() => good.destroy()); await good.connect(); expect(await good.invoke('ping')).toBe('pong')
})
