/*
 * [OUTPUT]: 渠道明确发送/发送回执的owner公开项不出现在员工运行凭据目录，调用拒绝。
 * [OUTPUT]: 员工运行凭据不能使用本人附件上传/准备/全局准备回执。
 * [INPUT]: Original AppService contexts, actual knowledge files and desktop/headless WebSocket transports.
 * [OUTPUT]: Run identity, original API file tools/approval and stable call receipts, command leases and revocation.
 * [POS]: Controlled integration, no installed native CLI or external provider certification.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import { startHeadlessServer } from '../src/runtime/headless'
import { openDesktopCli } from '../src/main/cli-service'
import { dispatchRuntime } from '../src/runtime/dispatch'
import { RunCliAccess } from '../src/runtime/run-cli-access'
import { CliRpcClient } from '../src/cli/client'
import { readLocalConnection } from '../src/cli/discovery'
import { CliError, type ErrorCode } from '../src/shared/cli/protocol'
import type { RunCliGrant, RunCliPrincipal } from '../src/shared/cli/run-access'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, Resource, Snapshot } from '../src/shared/domain'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { createStageAgent } from '../src/runtime/adapters/mastra/agent-factory'
import { employeeEnvironment } from '../src/shared/cli/employee-environment'

const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const close of cleanups.splice(0).reverse()) await close() })
async function fixture(mode: 'desktop' | 'headless', task: boolean | 'ask' = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-grant-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = [], releases: (() => void)[] = []
  const engine: AgentEngine = { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: task ? 'task' : 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence, ...(task ? { work: { key: 'cli-command', scope: '验证原命令环境', deliverable: '真实命令回执' } } : {}) }), run: async ctx => {
    contexts.push(ctx)
    await new Promise<void>(resolve => { releases.push(resolve); ctx.signal.addEventListener('abort', () => resolve(), { once: true }) })
    if (!ctx.signal.aborted) await ctx.onDelta('受限CLI原任务完成')
  } }
  const owned = await startOwnedRuntime({ dataPath: root, engine, skillDiscovery: { homeDir: root }, secrets: { get: async () => 'private-fixture-key', set: async () => {}, delete: async () => {} }, emit: () => {} })
  const app = owned.service
  const connection = await app.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  const path = join(root, 'knowledge.md'); await writeFile(path, '品牌规范：海蓝色，引用知识原件🙂。')
  const resource = await app.handle('importResource', { kind: 'knowledge', path }) as Resource
  const agent = (await app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  await app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', knowledgeIds: [resource.id], ...(task ? { allowCommands: true, executionPermission: task === 'ask' ? 'ask' : 'full-access' } : {}) })
  const room = await app.handle('createConversation', { kind: 'direct', title: 'run scope', agentIds: [agent.id] }) as Conversation
  if (mode === 'headless') {
    await owned.close()
    const server = await startHeadlessServer({ dataPath: root, version: 'test', engine, skillHome: root }); cleanups.push(server.close)
  } else {
    cleanups.push(owned.close)
    const server = await openDesktopCli(root, 'test', { request: async (method, input) => app.handle(method, input) as never, runAccess: async input => {
      const reply = await dispatchRuntime(app, '__runCliAccess', input) as { ok: boolean; result?: unknown; code: ErrorCode; message: string }
      if (!reply.ok) throw new CliError(reply.code, reply.message)
      return reply.result
    } }); cleanups.push(server.close)
  }
  cleanups.push(() => { releases.forEach(release => release()) })
  const metadata = await readLocalConnection(root), owner = new CliRpcClient(metadata.url, metadata); cleanups.push(() => owner.destroy()); await owner.connect()
  const start = async () => {
    const index = contexts.length, requestId = randomUUID()
    await owner.invoke('sendMessage', { conversationId: room.id, requestId, mentionIds: [], content: '查询品牌规范' })
    await vi.waitFor(() => expect(contexts.length).toBe(index + 1))
    return { ctx: contexts[index], requestId, release: () => releases[index]() }
  }
  const connect = async (token: string) => { const client = new CliRpcClient(metadata.url, { token, workspaceId: metadata.workspaceId }); cleanups.push(() => client.destroy()); await client.connect(); return client }
  return { app, owner, connect, start, room, resource, metadata }
}

it.each(['desktop', 'headless'] as const)('%s restricts a run token to its original knowledge tools and revokes a live connection', async mode => {
  const f = await fixture(mode), active = await f.start()
  await expect(f.owner.invoke('auth:issue-run', { runId: active.ctx.runId, employeeId: 'bobo' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  const grant = await f.owner.invoke('auth:issue-run', { runId: active.ctx.runId }) as RunCliGrant
  expect(grant).toMatchObject({ employeeId: 'researcher', conversationId: f.room.id, runId: active.ctx.runId })
  expect(grant.token).not.toBe(f.metadata.token)
  const client = await f.connect(grant.token)
  expect(client.handshake?.registeredChannels).toEqual(['employee:context', 'employee:tools', 'employee:invoke'])
  for (const [name, input] of [['publishChannelReply', { conversationId: f.room.id, messageId: 'reply', contentHash: 'a'.repeat(64), requestId: randomUUID() }], ['publishChannelMessage', { conversationId: f.room.id, sourceMessageId: 'source', content: 'unauthorized publication', artifacts: [], requestId: randomUUID() }], ['listChannelMessageDeliveries', { conversationId: f.room.id, messageIds: [] }], ['transferMaterial', { action: 'begin', uploadId: randomUUID(), name: 'bad.md', size: 0, contentHash: '0'.repeat(64) }], ['prepareMaterial', { selectionId: randomUUID(), conversationId: f.room.id, requestId: randomUUID() }], ['getMaterialPreparation', { requestId: randomUUID() }], ['employees'], ['connections'], ['auth:issue-run', { runId: active.ctx.runId }], ['auth:revoke-run', { grantId: grant.grantId }], ['approve', { id: 'anything', approved: true }], ['events:subscribe', { channel: 'app' }], ['sendEmployeeMessage', { employeeId: 'bobo', content: 'escalate', requestId: randomUUID() }]] as const) {
    await expect(client.invoke(name, input)).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' })
  }
  const context = await client.invoke('employee:context')
  expect(context).toMatchObject({ runId: active.ctx.runId, employee: { id: 'researcher' }, tools: ['inspect_knowledge', 'search_knowledge', 'read_knowledge'] })
  expect(JSON.stringify(context)).not.toContain('private-fixture-key'); expect(context).not.toHaveProperty('token')
  const files = await client.invoke('employee:invoke', { tool: 'inspect_knowledge', input: {} }) as { files: { resourceId: string; path: string; contentHash: string }[] }
  const identity = files.files[0]
  expect(identity.resourceId).toBe(f.resource.id)
  expect(await client.invoke('employee:invoke', { tool: 'read_knowledge', input: { resourceId: identity.resourceId, path: identity.path, contentHash: identity.contentHash } })).toMatchObject({ content: '品牌规范：海蓝色，引用知识原件🙂。' })
  await expect(client.invoke('employee:invoke', { tool: 'read_knowledge', input: { resourceId: 'other-employee', path: identity.path, contentHash: identity.contentHash } })).rejects.toThrow()
  await expect(client.invoke('employee:invoke', { tool: 'approve', input: { approved: true } })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  await expect(client.invoke('employee:invoke', { tool: 'inspect_knowledge', input: {}, runId: 'other' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  expect(await f.owner.invoke('auth:revoke-run', { grantId: grant.grantId })).toEqual({ revoked: true })
  await expect(client.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  await expect(f.connect(grant.token)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  const fresh = await f.owner.invoke('auth:issue-run', { runId: active.ctx.runId }) as RunCliGrant
  const live = await f.connect(fresh.token)
  active.release()
  await vi.waitFor(async () => expect(await f.owner.invoke('getMessageExecution', { requestId: active.requestId })).toMatchObject({ state: 'completed', activeRunIds: [] }))
  const detail = await f.owner.invoke('getConversation', { id: f.room.id }) as ConversationDetail
  const run = detail.runs.find(run => run.id === active.ctx.runId)!
  expect(run.toolEvents).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'read_knowledge', status: 'completed', detail: JSON.stringify({ via: 'cli', tool: 'read_knowledge', completed: true }) })]))
  expect(JSON.stringify(run.toolEvents)).not.toContain('private-fixture-key')
  await expect(live.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  await expect(f.owner.invoke('auth:issue-run', { runId: active.ctx.runId })).rejects.toThrow()
})

it('checks original permission changes on the established connection before returning scoped data', async () => {
  const f = await fixture('desktop'), active = await f.start()
  const grant = await f.owner.invoke('auth:issue-run', { runId: active.ctx.runId }) as RunCliGrant, client = await f.connect(grant.token)
  const current = (await f.app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = current
  await f.app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, knowledgeIds: [] })
  await expect(client.invoke('employee:invoke', { tool: 'inspect_knowledge', input: {} })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  await expect(f.connect(grant.token)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
})

it('rejects expiry, forged principals and revocation during an awaited check', async () => {
  const f = await fixture('desktop'), active = await f.start()
  let now = 1000, checks = 0, hold: (() => Promise<void>) | undefined
  const access = new RunCliAccess(() => now), close = access.register(active.ctx, async () => { checks++; await hold?.() })
  const grant = await access.request({ kind: 'issue', runId: active.ctx.runId, ttlSeconds: 1 }) as RunCliGrant
  const { token, ...principal } = grant
  await expect(access.request({ kind: 'context', principal: { ...principal, employeeId: 'bobo' } })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  now = grant.expiresAt
  await expect(access.request({ kind: 'authenticate', token })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  const second = await access.request({ kind: 'issue', runId: active.ctx.runId }) as RunCliGrant
  const identity = await access.request({ kind: 'authenticate', token: second.token }) as RunCliPrincipal
  let release!: () => void; hold = () => new Promise<void>(resolve => { release = resolve })
  const pending = access.request({ kind: 'context', principal: identity })
  const rejected = expect(pending).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await access.request({ kind: 'revoke', grantId: identity.grantId }); release()
  await rejected; expect(checks).toBeGreaterThan(2); close()
})

it('automatically leases the original API command identity and revokes it on actual command exit', async () => {
  const f = await fixture('desktop', true), active = await f.start()
  vi.stubEnv('BOAI_SERVER_TOKEN', 'host-owner-token-must-not-be-inherited')
  vi.stubEnv('BOAI_SERVER_URL', 'ws://127.0.0.1:1')
  vi.stubEnv('BOAI_SECRET_INTERNAL', 'host-secret-must-not-be-inherited')
  const acquire = active.ctx.acquireCliEnvironment!, leases: Awaited<ReturnType<typeof acquire>>[] = []
  active.ctx.acquireCliEnvironment = async () => { const lease = await acquire(); leases.push(lease); return lease }
  const runtime = await createTaskRuntime(active.ctx)
  cleanups.push(runtime.dispose)
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const program = `process.stdout.write(JSON.stringify({run:process.env.BOAI_CLI_EMPLOYEE_RUN,url:process.env.BOAI_SERVER_URL,hasToken:!!process.env.BOAI_SERVER_TOKEN,owner:process.env.BOAI_SERVER_TOKEN==='host-owner-token-must-not-be-inherited',hostSecret:!!process.env.BOAI_SECRET_INTERNAL}))`
  const result = await runtime.tools.execute_command!.execute!({ command: `${quote(process.execPath)} -e ${quote(program)}` }, { requestContext: new RequestContext(), observe: noopObserve }) as { exitCode: number; stdout: string }
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ run: active.ctx.runId, url: f.metadata.url, hasToken: true, owner: false, hostSecret: false })
  expect(leases).toHaveLength(1)
  await expect(f.connect(leases[0].env.BOAI_SERVER_TOKEN!)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  const next = await acquire(), client = await f.connect(next.env.BOAI_SERVER_TOKEN!)
  expect(await client.invoke('employee:context')).toMatchObject({ runId: active.ctx.runId, expiresAt: null })
  next.release(); await expect(client.invoke('employee:context')).rejects.toMatchObject({ code: 'AUTH_FAILED' })
})

it('keeps automatic leases tied to execution lifetime without imposing a native task deadline', async () => {
  const f = await fixture('desktop'), active = await f.start()
  let time = 1000
  const access = new RunCliAccess(() => time), close = access.register(active.ctx, async () => {})
  await access.request({ kind: 'endpoint', url: f.metadata.url })
  const lease = await access.environment(active.ctx.runId)
  time += 48 * 3600 * 1000
  expect(await access.request({ kind: 'authenticate', token: lease.env.BOAI_SERVER_TOKEN! })).toMatchObject({ expiresAt: null, runId: active.ctx.runId })
  lease.release()
  await expect(access.request({ kind: 'authenticate', token: lease.env.BOAI_SERVER_TOKEN! })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  close()
})

it('strips inherited owner and service credentials while retaining the selected native provider environment', () => {
  const original = { PATH: '/native', HOME: '/native-home', ANTHROPIC_API_KEY: 'selected-provider', BOAI_SERVER_TOKEN: 'owner', BOAI_SERVER_URL: 'ws://owner', BOAI_SECRET_FIXTURE: 'host-secret', BOAI_DATA_DIR: '/owner', BOAI_CLI_EMPLOYEE_RUN: 'another-run' }
  expect(employeeEnvironment(original)).toEqual({ PATH: '/native', HOME: '/native-home', ANTHROPIC_API_KEY: 'selected-provider', BOAI_CLI_EMPLOYEE_RUN: 'unavailable' })
  expect(original.BOAI_SERVER_TOKEN).toBe('owner')
})

it('uses the original API task tools, one approval and one file effect for duplicate CLI call IDs', async () => {
  const f = await fixture('desktop', 'ask'), active = await f.start()
  const stage = await createStageAgent('task', active.ctx); cleanups.push(stage.dispose)
  const grant = await f.owner.invoke('auth:issue-run', { runId: active.ctx.runId }) as RunCliGrant, client = await f.connect(grant.token)
  const catalog = await client.invoke('employee:tools') as { name: string; effect: string }[]
  expect(catalog).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'write_file', effect: 'write' }), expect.objectContaining({ name: 'read_file' })]))
  const input = { path: `self:/runs/${active.ctx.runId}/cli.txt`, content: '原工具实际写入🙂' }, callId = randomUUID()
  await expect(client.invoke('employee:invoke', { tool: 'write_file', input })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  const first = client.invoke('employee:invoke', { tool: 'write_file', input, callId })
  const second = client.invoke('employee:invoke', { tool: 'write_file', input: { content: input.content, path: input.path }, callId })
  let snapshot!: Snapshot
  await vi.waitFor(async () => { snapshot = await f.app.handle('snapshot', undefined) as Snapshot; expect(snapshot.approvals).toHaveLength(1) })
  const path = join(active.ctx.workspace!.root, 'runs', active.ctx.runId, 'cli.txt')
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  await f.owner.invoke('approve', { id: snapshot.approvals[0].id, approved: true })
  const [a, b] = await Promise.all([first, second]); expect(a).toEqual(b)
  expect(await readFile(path, 'utf8')).toBe(input.content)
  await writeFile(path, '外部修改，重复回执不能重写')
  expect(await client.invoke('employee:invoke', { tool: 'write_file', input, callId })).toEqual(a)
  expect(await readFile(path, 'utf8')).toBe('外部修改，重复回执不能重写')
  await expect(client.invoke('employee:invoke', { tool: 'write_file', input: { ...input, content: '不同操作' }, callId })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  await stage.dispose()
  expect((await client.invoke('employee:context') as { tools: string[] }).tools).toEqual([])
  await expect(client.invoke('employee:invoke', { tool: 'write_file', input, callId: randomUUID() })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
})

it('retains a rejected original API write outcome without issuing another approval on retry', async () => {
  const f = await fixture('desktop', 'ask'), active = await f.start()
  const stage = await createStageAgent('task', active.ctx); cleanups.push(stage.dispose)
  const grant = await f.owner.invoke('auth:issue-run', { runId: active.ctx.runId }) as RunCliGrant, client = await f.connect(grant.token)
  const call = { tool: 'write_file', input: { path: `self:/runs/${active.ctx.runId}/denied.txt`, content: '不得写入' }, callId: randomUUID() }
  const first = expect(client.invoke('employee:invoke', call)).rejects.toThrow()
  let snapshot!: Snapshot
  await vi.waitFor(async () => { snapshot = await f.app.handle('snapshot', undefined) as Snapshot; expect(snapshot.approvals).toHaveLength(1) })
  await f.owner.invoke('approve', { id: snapshot.approvals[0].id, approved: false }); await first
  await expect(client.invoke('employee:invoke', call)).rejects.toThrow()
  expect((await f.app.handle('snapshot', undefined) as Snapshot).approvals).toEqual([])
  await expect(readFile(join(active.ctx.workspace!.root, 'runs', active.ctx.runId, 'denied.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
