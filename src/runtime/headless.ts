/*
 * [OUTPUT]: 独立服务与桌面共用随包技能源及首次绑定；可显式注入受信分发根。
 * [OUTPUT]: 独立服务提供同包员工脚本工具库，身份/生命周期沿原run租约。
 * [OUTPUT]: 2026-10-19应用业务协议：独立服务使用同profile实际桌面设置宿主，可用状态动态核对。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: Public server verifies run credentials with the original live AppService; owner-only methods remain isolated.
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: original AppService, kernel-backed owner, reference-only secrets and optional trusted desktop host.
 * [INPUT]: Craft bootstrap/headless-start.ts @ 22c9f0414ab63e0a22814c9a2ada740206e09091 and explicit service configuration.
 * [OUTPUT]: Standalone runtime with private attached desktop/browser/vault bridge and actual-drain shutdown.
 * [POS]: Headless assembly; shares all employee, storage and scheduling code with the desktop worker.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { ServerOptions } from 'node:https'
import { startOwnedRuntime } from './bootstrap'
import { RuntimeOwnedError } from './owner'
import { MastraEngine } from './adapters/mastra/engine'
import { EnvironmentSecrets } from './environment-secrets'
import { connectionSchema, conversationSchema } from './service'
import { agentSchema } from './modules/employees/employee-service'
import type { AgentEngine } from './contracts'
import { publicChannels } from '../cli/channels'
import { startRpcServer, type RpcChannel } from '../cli/server'
import { profileIdentity, publishLocalConnection } from '../cli/discovery'
import { CliError, PROTOCOL_VERSION } from '../shared/cli/protocol'
import { DesktopHostBridge } from './desktop-host'
import { dispatchRuntime } from './dispatch'
import { publishAppEvent } from '../cli/events'
import type { RunCliAccessRequest, RunCliPrincipal } from '../shared/cli/run-access'

export interface HeadlessOptions { bundledSkillRoot?: string; toolClientPath?: string; dataPath: string; version: string; host?: string; port?: number; token?: string; tls?: ServerOptions; secretEnvironment?: Record<string, string | undefined>; engine?: AgentEngine; skillHome?: string }
export async function startHeadlessServer(options: HeadlessOptions) {
  const host = options.host ?? '127.0.0.1', loopback = ['127.0.0.1', '::1'].includes(host)
  if (!loopback && (!options.tls || !options.token)) throw new CliError('INVALID_REQUEST', '非回环服务需要明确的 TLS 和 BOAI_SERVER_TOKEN')
  const token = options.token ?? randomBytes(32).toString('base64url')
  if (token.length < 32 || token.length > 4096 || new Set(token).size < 8) throw new CliError('AUTH_FAILED', '服务 token 必须是至少32字符的独立随机凭据')
  const desktop = new DesktopHostBridge({ request: (method, input) => {
    if (state !== 'ready') throw new CliError('SERVER_BUSY', '服务正在退出')
    return secrets.withDesktop(() => dispatchRuntime(owned.service, method, input))
  }, detach: () => owned.service.detachBrowserHost(), lost: () => owned.service.detachBrowserHost() })
  const secrets = new EnvironmentSecrets(options.dataPath, options.secretEnvironment ?? {}, {
    connected: () => desktop.connected,
    get: async id => await desktop.secret('get', id) as string | undefined,
    has: async id => await desktop.secret('has', id) as boolean,
    set: async (id, value) => { await desktop.secret('set', id, value) },
    delete: async id => { await desktop.secret('delete', id) },
  })
  let server: Awaited<ReturnType<typeof startRpcServer>> | undefined
  let state: 'ready' | 'stopping' | 'stopped' = 'ready'
  let stopped!: () => void
  const finished = new Promise<void>(resolve => { stopped = resolve })
  const owned = await startOwnedRuntime({ dataPath: options.dataPath, toolClientPath: options.toolClientPath ?? fileURLToPath(new URL('../cli/employee-tools.mjs', import.meta.url)), secrets, browserHost: desktop, applicationHost: { get available() { return desktop.available }, request: async (method, input) => await desktop.application(method, input) as never }, engine: options.engine ?? new MastraEngine(), skillDiscovery: { homeDir: options.skillHome, bundledRoot: options.bundledSkillRoot ?? fileURLToPath(new URL('../agent-skills/', import.meta.url)) }, emit(event) {
    if (server) publishAppEvent(server, event)
    desktop.publish(event)
  } }, () => secrets.init()).catch(error => { if (error instanceof RuntimeOwnedError) throw new CliError('SERVER_BUSY', error.message); throw error })
  const workspaceId = await profileIdentity(options.dataPath), serverId = owned.owner.instanceId
  const credentialChanges = new Set<Promise<unknown>>()
  let removeConnection: (() => Promise<void>) | undefined, closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    state = 'stopping'
    // Keep status available while the original runtime drains. No lock release before adapter exit.
    await Promise.allSettled([...credentialChanges])
    await owned.close()
    await desktop.close()
    await server?.close(); await removeConnection?.()
    state = 'stopped'; stopped()
  })()
  const port = { runAccess: async (input: RunCliAccessRequest) => {
    if (state !== 'ready') throw new CliError('SERVER_BUSY', '服务正在退出')
    return owned.service.runCliAccess(input)
  }, request: async (method: import('../shared/ipc').Method, input: unknown) => {
    if (state !== 'ready') throw new CliError('SERVER_BUSY', '服务正在退出，不再受理业务请求')
    return owned.service.handle(method, input) as never
  } }
  const channels = new Map(publicChannels(port, { workspaceId, version: options.version, name: basename(owned.owner.dataPath), get browserAvailable() { return desktop.available }, credentialProvider: 'environment' }))
  const register = (name: string, input: z.ZodType, effect: RpcChannel['effect'], handle: RpcChannel['handle']) => channels.set(name, { input, effect, handle })
  // Trusted owner configuration uses exactly the original service schemas and CAS checks.
  for (const [name, schema] of [['saveConnection', connectionSchema], ['saveAgent', agentSchema], ['createConversation', conversationSchema]] as const) register(name, schema, 'write', input => port.request(name, input))
  register('credentials:status', z.undefined(), 'read', () => secrets.status())
  register('credentials:bind', z.object({ id: z.string().min(1).max(200), expectedRevision: z.number().int().positive(), environmentVariable: z.string().regex(/^BOAI_SECRET_[A-Z0-9_]+$/).max(200) }).strict(), 'write', input => {
    if (state !== 'ready') throw new CliError('SERVER_BUSY', '服务正在退出')
    const operation = (async () => {
    const { id, environmentVariable, expectedRevision } = input as { id: string; environmentVariable: string; expectedRevision: number }
    const connections = (await owned.service.handle('snapshot', undefined) as import('../shared/domain').Snapshot).connections
    const connection = connections.find(connection => connection.id === id)
    if (!connection) throw new CliError('INVALID_REQUEST', '只能为当前已有模型连接绑定环境凭据')
    // Credential changes pass the original connection CAS/cancellation, then persist only the reference.
    const { revision: _revision, hasApiKey: _key, ...definition } = connection
    const saved = await port.request('saveConnection', { ...definition, expectedRevision, apiKey: secrets.environmentValue(environmentVariable) }) as import('../shared/domain').Connection
    await secrets.bind(id, environmentVariable); return { id, revision: saved.revision, mode: 'environment', available: true }
    })()
    credentialChanges.add(operation)
    return operation.finally(() => { credentialChanges.delete(operation) })
  })
  const status = () => ({ serverId, workspaceId, version: options.version, state, clients: server?.clients ?? 0, owner: { instanceId: owned.owner.instanceId, pid: owned.owner.pid, processStartedAt: owned.owner.processStartedAt, acquiredAt: owned.owner.acquiredAt }, desktopAttached: desktop.connected, browserAvailable: desktop.available, credentialProvider: desktop.connected ? 'environment+desktop-vault' : 'environment' })
  register('server:status', z.undefined(), 'read', status)
  register('server:release', z.object({ serverId: z.string().uuid() }).strict(), 'write', async input => {
    if ((input as { serverId: string }).serverId !== serverId) throw new CliError('PROFILE_MISMATCH', '服务实例已变化')
    const accepted = await owned.service.claimIdleShutdown(() => {
      if (state !== 'ready' || desktop.connected || server!.clients !== 1 || server!.pendingRequests !== 1 || credentialChanges.size) return false
      state = 'stopping'; return true
    })
    if (accepted) setImmediate(() => { void close().catch(() => { server?.publish('app', { type: 'runtime-error', error: '服务尚未确认退出' }) }) })
    return { serverId, accepted, state }
  })
  register('server:shutdown', z.object({ serverId: z.string().uuid() }).strict(), 'write', input => {
    if ((input as { serverId: string }).serverId !== serverId) throw new CliError('PROFILE_MISMATCH', '服务实例已变化，未发出关闭请求')
    state = 'stopping'
    // RPC receipt is only acceptance; actual closure is observable via status/socket/process exit.
    setImmediate(() => { void close().catch(() => { server?.publish('app', { type: 'runtime-error', error: '服务尚未确认退出，请保留原实例并核对' }) }) })
    return { serverId, accepted: true }
  })
  try {
    await desktop.open(options.dataPath, serverId, options.version)
    server = await startRpcServer({ host, port: options.port, tls: options.tls, token, workspaceId, serverId, version: options.version, channels, accepting: () => state === 'ready', authenticateRun: async token => await port.runAccess({ kind: 'authenticate', token }) as RunCliPrincipal })
    await port.runAccess({ kind: 'endpoint', url: server.url })
    if (loopback) removeConnection = await publishLocalConnection(options.dataPath, { protocolVersion: PROTOCOL_VERSION, workspaceId, serverId, url: server.url, token, pid: process.pid, version: options.version })
    return { url: server.url, workspaceId, serverId, status, close, finished }
  } catch (error) { await close(); throw error }
}
