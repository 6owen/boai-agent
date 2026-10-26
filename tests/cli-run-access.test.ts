/*
 * [OUTPUT]: 实际Node脚本通过原员工RPC循环读写/聚合；原目录隔离、执行记录、禁止终态内嵌和作用域排空验证。
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
import { startOwnedRuntime } from '../packages/runtime/src/bootstrap'
import { startHeadlessServer } from '../packages/runtime/src/headless'
import { openDesktopCli } from '../apps/electron/src/main/cli-service'
import { dispatchRuntime } from '../packages/runtime/src/dispatch'
import { RunCliAccess } from '../packages/runtime/src/run-cli-access'
import { CliRpcClient } from '../packages/transport/src/client'
import { readLocalConnection } from '../packages/transport/src/discovery'
import { CliError, type ErrorCode } from '../packages/shared/src/cli/protocol'
import type { RunCliGrant, RunCliPrincipal } from '../packages/shared/src/cli/run-access'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, Resource, Snapshot } from '../packages/shared/src/domain'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { createStageAgent } from '../packages/runtime/src/adapters/mastra/agent-factory'
import { employeeEnvironment } from '../packages/shared/src/cli/employee-environment'
import { withEmployeeTools, type EmployeeTools } from '../apps/cli/src/employee-tools'
import { buildWorkspace as build } from '../scripts/workspace-packages.mjs'

const cleanups: (() => Promise<unknown> | void)[] = []
async function scriptLibrary() {
  const root = await mkdtemp(join(tmpdir(), 'boai-script-library-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'employee-tools.mjs')
  await build({ entryPoints: ['apps/cli/src/employee-tools.ts'], outfile: path, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
  return path
}

it.each(['desktop', 'headless'] as const)('%s runs an actual script through scoped tools, aggregates results and retains original tool receipts', async mode => {
  const f = await fixture(mode, true, await scriptLibrary()), active = await f.start()
  const runtime = await createTaskRuntime(active.ctx); cleanups.push(runtime.dispose)
  const stage = await createStageAgent('task', active.ctx); cleanups.push(stage.dispose)
  const acquire = active.ctx.acquireCliEnvironment!, leases: Awaited<ReturnType<typeof acquire>>[] = []
  active.ctx.acquireCliEnvironment = async () => { const lease = await acquire(); leases.push(lease); return lease }
  const command = `ELECTRON_RUN_AS_NODE=1 "$BOAI_CLI_NODE" --input-type=module <<'BOAI_SCRIPT'
import { pathToFileURL } from 'node:url'
const { withEmployeeTools } = await import(pathToFileURL(process.env.BOAI_CLI_TOOL_CLIENT).href)
await withEmployeeTools(async ({ listTools, boaiTool }) => {
  const catalog = await listTools()
  if (catalog.some(t => ['report_work', 'delegate_work'].includes(t.name))) throw new Error('direct-only tool leaked')
  if (catalog.find(t => t.name === 'read_file')?.effect !== 'read') throw new Error('file reading effect incorrect')
  const values = [3, 8, 5]
  let total = 0
  for (const [index, value] of values.entries()) {
    const path = 'self:/runs/' + process.env.BOAI_CLI_EMPLOYEE_RUN + '/row-' + index + '.json'
    const write = { path, content: JSON.stringify({ value, privateDetail: 'intermediate-content' }) }
    await boaiTool('write_file', write, 'script-write-' + index)
    await boaiTool('write_file', write, 'script-write-' + index)
    const file = await boaiTool('read_file', { path }, 'script-read-' + index)
    total += JSON.parse(file.content).value
  }
  try { await boaiTool('report_work', {}, 'script-final'); throw new Error('accepted hidden completion') }
  catch (error) { if (error.code !== 'CAPABILITY_UNAVAILABLE') throw error }
  console.log(JSON.stringify({ count: values.length, total }))
})
BOAI_SCRIPT`
  const result = await runtime.tools.execute_command!.execute!({ command }, { requestContext: new RequestContext(), observe: noopObserve }) as { exitCode: number; stdout: string; stderr: string }
  expect(result).toMatchObject({ exitCode: 0, stderr: '' }); expect(JSON.parse(result.stdout)).toEqual({ count: 3, total: 16 })
  expect(result.stdout).not.toContain('intermediate-content')
  for (const [i, value] of [3, 8, 5].entries()) expect(JSON.parse(await readFile(join(active.ctx.workspace!.root, 'runs', active.ctx.runId, `row-${i}.json`), 'utf8'))).toEqual({ value, privateDetail: 'intermediate-content' })
  const detail = await f.owner.invoke('getConversation', { id: f.room.id }) as ConversationDetail
  const events = detail.runs.find(run => run.id === active.ctx.runId)!.toolEvents
  expect(events.filter(event => event.name === 'write_file' && event.status === 'completed')).toHaveLength(3)
  expect(events.filter(event => event.name === 'read_file' && event.status === 'completed')).toHaveLength(3)
  expect(events.some(event => event.name === 'report_work')).toBe(false)
  expect(leases).toHaveLength(1)
  await expect(f.connect(leases[0].env.BOAI_SERVER_TOKEN!)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
})

it('drains submitted script tools before closing and rejects new calls after callback completion', async () => {
  const f = await fixture('desktop'), active = await f.start()
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const unregister = active.ctx.registerCliTools!([{ name: 'held_read', description: 'held actual RPC', inputSchema: { type: 'object' }, effect: 'read', execute: async () => { await hold; return { complete: true } } }]); cleanups.push(unregister)
  const lease = await active.ctx.acquireCliEnvironment!(); cleanups.push(lease.release)
  for (const [key, value] of Object.entries(lease.env)) vi.stubEnv(key, value)
  let tools!: EmployeeTools, result!: Promise<unknown>, finished = false
  const run = withEmployeeTools(async supplied => { tools = supplied; result = tools.boaiTool('held_read', {}, 'held-call') }).then(() => { finished = true })
  await vi.waitFor(() => expect(result).toBeDefined())
  expect(finished).toBe(false)
  await expect(tools.listTools()).rejects.toMatchObject({ code: 'CLIENT_DISCONNECTED' })
  release(); await run; expect(await result).toEqual({ complete: true }); expect(finished).toBe(true)
})

it('does not discover owner credentials when an employee script has no usable lease', async () => {
  vi.stubEnv('BOAI_CLI_EMPLOYEE_RUN', 'unavailable')
  const callback = vi.fn()
  await expect(withEmployeeTools(callback)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  expect(callback).not.toHaveBeenCalled()
})

it.skipIf(process.platform !== 'darwin')('loads only the host script library under the original approved command directory policy', async () => {
  const f = await fixture('desktop', 'ask', await scriptLibrary()), active = await f.start()
  expect(active.ctx.agent.directoryGrants).toEqual([])
  const runtime = await createTaskRuntime(active.ctx); cleanups.push(runtime.dispose)
  const stage = await createStageAgent('task', active.ctx); cleanups.push(stage.dispose)
  const command = `ELECTRON_RUN_AS_NODE=1 "$BOAI_CLI_NODE" --input-type=module <<'BOAI_SCRIPT'
import { pathToFileURL } from 'node:url'
const { withEmployeeTools } = await import(pathToFileURL(process.env.BOAI_CLI_TOOL_CLIENT).href)
await withEmployeeTools(async ({ listTools }) => { console.log((await listTools()).some(tool => tool.name === 'read_file')) })
BOAI_SCRIPT`
  const pending = runtime.tools.execute_command!.execute!({ command }, { requestContext: new RequestContext(), observe: noopObserve }) as Promise<{ exitCode: number; stdout: string }>
  let snapshot!: Snapshot
  await vi.waitFor(async () => { snapshot = await f.app.handle('snapshot', undefined) as Snapshot; expect(snapshot.approvals).toHaveLength(1) })
  await f.owner.invoke('approve', { id: snapshot.approvals[0].id, approved: true })
  expect(await pending).toMatchObject({ exitCode: 0, stdout: 'true\n' })
})
afterEach(async () => { vi.unstubAllEnvs(); for (const close of cleanups.splice(0).reverse()) await close() })
async function fixture(mode: 'desktop' | 'headless', task: boolean | 'ask' = false, toolClientPath?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-grant-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = [], releases: (() => void)[] = []
  const engine: AgentEngine = { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: task ? 'task' : 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence, ...(task ? { work: { key: 'cli-command', scope: '验证原命令环境', deliverable: '真实命令回执' } } : {}) }), run: async ctx => {
    contexts.push(ctx)
    await new Promise<void>(resolve => { releases.push(resolve); ctx.signal.addEventListener('abort', () => resolve(), { once: true }) })
    if (!ctx.signal.aborted) await ctx.onDelta('受限CLI原任务完成')
  } }
  const owned = await startOwnedRuntime({ dataPath: root, engine, toolClientPath, skillDiscovery: { homeDir: root }, secrets: { get: async () => 'private-fixture-key', set: async () => {}, delete: async () => {} }, emit: () => {} })
  const app = owned.service
  const connection = await app.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  const path = join(root, 'knowledge.md'); await writeFile(path, '品牌规范：海蓝色，引用知识原件🙂。')
  const resource = await app.handle('importResource', { kind: 'knowledge', path }) as Resource
  const agent = (await app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  await app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', knowledgeIds: [resource.id], ...(toolClientPath ? { directoryGrants: [] } : {}), ...(task ? { allowCommands: true, executionPermission: task === 'ask' ? 'ask' : 'full-access' } : {}) })
  const room = await app.handle('createConversation', { kind: 'direct', title: 'run scope', agentIds: [agent.id] }) as Conversation
  if (mode === 'headless') {
    await owned.close()
    const server = await startHeadlessServer({ dataPath: root, version: 'test', engine, skillHome: root, toolClientPath }); cleanups.push(server.close)
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
