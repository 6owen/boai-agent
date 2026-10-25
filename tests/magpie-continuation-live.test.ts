/*
 * [INPUT]: Explicit batch/cases/source mode, installed Magpie and native CLIs, isolated AppService and strict synthetic Chat upstream.
 * [OUTPUT]: G2a/G2b cancellation/update plus opt-in concurrent connection deletion/rebinding and plugin drain; retained effects and actual client exits.
 * [POS]: M20 installed-version acceptance; no personal service/configuration changes or real supplier inference.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger; preserve every failed batch.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createServer, type Server } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { AgentHome, Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../packages/shared/src/domain'
import type { RuntimePluginCatalog } from '../packages/shared/src/plugins/runtime-catalog'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { streamText, streamTool } from './fixtures/gateway-stream'
import { writeNativeMagpieProfile } from './fixtures/native-magpie-profile'

const enabled = process.env.BOAI_MAGPIE_CONTINUATION_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const sourceMode = process.env.BOAI_MAGPIE_CONTINUATION_SOURCE ?? 'explicit', nativeProfile = sourceMode === 'native'
const action = process.env.BOAI_MAGPIE_CONTINUATION_ACTION ?? 'cancel'
const allCases = ['direct', 'api-chat', 'api-responses', 'api-messages', 'codex', 'claude', 'pi', 'opencode']
const catalogIds = [...allCases, ...allCases.filter(name => name !== 'direct').flatMap(name => [`${name}-updated`, `${name}-peer`])]
const cases = (process.env.BOAI_MAGPIE_CONTINUATION_CASES ?? (nativeProfile ? allCases.slice(4) : allCases).join(',')).split(',')
const evidence = resolve('.local/magpie-20261017', `continuation-${batch}`), maxPosts = cases.reduce((sum, name) => sum + (name === 'direct' ? 9 : 12), 0)
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'waiting_user', 'budget_exhausted'])
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms)), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
type Body = { model?: string; messages?: { role: string; content?: unknown; tool_calls?: unknown[]; reasoning_content?: string }[]; tools?: { function?: { name?: string }; name?: string }[]; [key: string]: unknown }
type Row = { scenario: string; phase: string; path: string; body: Body; started: number; ended?: number; closed: boolean; emptyAssistant?: number; status?: number; hold?: boolean; title?: boolean; peer?: boolean; actualModel?: string | null; remotePort?: number; error?: string }
const rows: Row[] = [], incoming: Row[] = [], controllers = new Set<AbortController>(), jobs = new Set<Promise<void>>()
let upstream: Server | undefined, proxy: Server | undefined, gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, baseUrl = '', scenario = '', phase = '', nativeFile = '', workdir = '', started = false, sourceBefore: Record<string, string>
let releasePeer = () => {}
const collections = ['connections', 'agents', 'runs', 'turns', 'messages', 'workItems', 'artifacts', 'nativeActions', 'codexSessions', 'claudeSessions', 'pluginSessions', 'codexRuntime', 'claudeRuntime', 'pluginRuntime']
function emptyAssistants(body: Body) {
  return (body.messages ?? []).filter(message => message.role === 'assistant' && !message.tool_calls?.length && (message.content == null || typeof message.content === 'string' && !message.content.trim() || Array.isArray(message.content) && message.content.every(part => part?.type === 'text' && !String(part.text ?? '').trim()))).length
}
async function sources() {
  const files: string[] = []
  for (const path of await workspaceInputFiles(['apps', 'packages', 'tests', 'scripts'])) if (/\.(ts|tsx|mjs|json)$/.test(path)) files.push(path)
  files.push('package.json', 'pnpm-lock.yaml')
  return Object.fromEntries(await Promise.all(files.sort().map(async path => [path, sha(await readFile(path))])))
}
async function listen(server: Server) { await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); return (server.address() as { port: number }).port }
async function close(server?: Server) { if (server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) } }
function track(job: Promise<void>) { jobs.add(job); void job.finally(() => jobs.delete(job)) }
function fileTool(body: Body) {
  const names = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name)
  const name = scenario.startsWith('api-') ? 'write_file' : scenario === 'claude' ? 'Write' : scenario === 'codex' ? 'exec_command' : 'write'
  if (!names.includes(name)) throw Error(`Expected native file tool ${name}; offered: ${names.join(',')}`)
  const input = scenario.startsWith('api-') ? { path: 'self:/work/effect.txt', content: 'WRITTEN_ONCE' } : scenario === 'claude' ? { file_path: nativeFile, content: 'WRITTEN_ONCE' } : scenario === 'codex' ? { cmd: "printf '%s' 'WRITTEN_ONCE' > effect.txt", workdir } : scenario === 'opencode' ? { filePath: nativeFile, content: 'WRITTEN_ONCE' } : { path: nativeFile, content: 'WRITTEN_ONCE' }
  return { name, input }
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || !['native', 'explicit'].includes(sourceMode) || !['cancel', 'connection-update', 'connection-delete'].includes(action) || action !== 'cancel' && (nativeProfile || cases.includes('direct')) || action === 'connection-delete' && cases.some(name => !allCases.slice(4).includes(name)) || cases.some(name => !allCases.includes(name) || nativeProfile && !allCases.slice(4).includes(name))) throw Error('Fresh batch, known source mode and compatible cases required')
  await mkdir(evidence); started = true; sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, cases, action, sourceBefore, maxPosts, sourceMode: nativeProfile ? 'Native profile (G2a); no BOAI model connection or model override' : 'BOAI explicit connection (G2b); API three protocols', nativeProfiles: 'Explicit isolated XDG/Claude/Pi/OpenCode configuration directories, selected Codex profile directory and product private session directories; test does not override HOME or CODEX_HOME', scope: 'Installed gateway + synthetic strict Chat supplier. Direct controls separate from production histories. Tool writes once, explicit user cancellation or actual connection change, explicit new message, service reopen and another explicit message. connection-delete adds another employee of the same CLI on a separate held connection, then deletion/rebinding while the peer finishes; Pi/OpenCode disable drains the held instance, refuses a new probe and re-enables without replay. No natural supplier/desktop/package claim.' }, null, 2))
  upstream = createServer((request, response) => track((async () => {
    if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: catalogIds.map(id => ({ id, object: 'model', owned_by: 'compat', context_window: 131072, max_output_tokens: 8192 })) })); return }
    let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw Error('Synthetic input cap exceeded') }
    const body: Body = JSON.parse(raw), row: Row = { scenario, phase, path: request.url!, body, started: Date.now(), closed: false, emptyAssistant: emptyAssistants(body) }; rows.push(row)
    response.once('close', () => { row.closed = true; row.ended = Date.now() })
    if (rows.length > maxPosts) throw Error('Predeclared request cap exceeded')
    if (!request.url?.endsWith('/chat/completions')) throw Error('Only controlled Chat upstream is configured')
    if (row.emptyAssistant) { row.status = 400; response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Invalid assistant message: content or tool_calls must be set' } })); return }
    row.status = 200
    row.title = scenario === 'opencode' && !(body.tools?.length) && JSON.stringify(body.messages).toLowerCase().includes('title')
    if (row.title) { streamText(response, 'chat', 'Continuation', 'complete', {}); return }
    if (action === 'connection-delete' && body.model === `${scenario}-peer`) {
      row.peer = true; row.hold = true
      await Promise.race([new Promise<void>(done => { releasePeer = done }), new Promise<void>(done => response.once('close', done))])
      if (!response.destroyed) streamText(response, 'chat', 'PEER_SOURCE_OK', 'complete', {})
      return
    }
    const count = rows.filter(value => value.scenario === scenario && value.phase === phase && !value.title).length
    if (scenario === 'direct') { streamText(response, 'chat', 'CONTROL_OK', 'complete', {}); return }
    if (phase === 'interrupted') {
      if (scenario.startsWith('api-') && count === 1) streamText(response, 'chat', JSON.stringify({ action: 'reply', responseKind: 'task', work: { key: 'once', scope: '保存一次文件后回答', deliverable: '文件' } }), 'complete', {})
      else if (count === (scenario.startsWith('api-') ? 2 : 1)) { const tool = fileTool(body); streamTool(response, 'chat', tool.name, tool.input, true, {}) }
      else { row.hold = true; streamText(response, 'chat', '', 'hold', {}) }
    } else if (scenario.startsWith('api-')) streamText(response, 'chat', count === 1 ? JSON.stringify({ action: 'reply', responseKind: 'chat' }) : count === 2 ? `CONTINUED_${phase}` : JSON.stringify({ candidates: [] }), 'complete', {})
    else streamText(response, 'chat', `CONTINUED_${phase}`, 'complete', {})
  })().catch(error => { response.destroy(error instanceof Error ? error : undefined) })))
  const upstreamPort = await listen(upstream); gateway = await isolatedMagpie(evidence, upstreamPort)
  await gateway.command(['provider', 'add', 'compat', 'id=compat', `url=http://127.0.0.1:${upstreamPort}/v1`, 'key=SYNTHETIC_CONTINUATION_NOT_A_SECRET', `models=${catalogIds.join(',')}`]); await gateway.start()
  proxy = createServer((request, response) => track((async () => {
    let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw Error('Gateway input cap exceeded') }
    const body: Body = raw ? JSON.parse(raw) : {}, row: Row = { scenario, phase, path: request.url!, body, started: Date.now(), closed: false }
    if (request.method === 'POST') { incoming.push(row); if (incoming.length > maxPosts) throw Error('Predeclared gateway request cap exceeded') }
    row.remotePort = request.socket.remotePort
    response.once('close', () => { row.closed = true; row.ended = Date.now() })
    const abort = new AbortController(); controllers.add(abort); response.once('close', () => abort.abort())
    try {
      const result = await fetch(gateway!.origin + request.url, { method: request.method, headers: { 'content-type': 'application/json', authorization: 'Bearer magpie-boai', 'x-api-key': 'magpie-boai', 'anthropic-version': '2023-06-01' }, ...(raw ? { body: raw } : {}), signal: abort.signal, redirect: 'error' })
      row.status = result.status; row.actualModel = result.headers.get('x-magpie-model')
      const headers: Record<string, string> = { 'content-type': result.headers.get('content-type') ?? 'application/json' }
      for (const name of ['x-magpie-model', 'x-magpie-provider']) if (result.headers.get(name)) headers[name] = result.headers.get(name)!
      response.writeHead(result.status, headers); if (result.body) for await (const part of result.body) response.write(part); response.end()
    } catch (error) { row.error = String(error); response.destroy(error instanceof Error ? error : undefined) } finally { controllers.delete(abort) }
  })().catch(error => { response.destroy(error instanceof Error ? error : undefined) })))
  baseUrl = `http://127.0.0.1:${await listen(proxy)}`
}, 90000)
afterAll(async () => {
  if (!started) return
  for (const abort of controllers) abort.abort()
  await gateway?.close(); await close(proxy); await close(upstream); await Promise.all(jobs)
  const sourceAfter = await sources()
  await writeFile(join(evidence, 'closed.json'), JSON.stringify({ incoming, upstream: rows, sourceBefore, sourceAfter, sourceUnchanged: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter), allRequestsClosed: [...incoming, ...rows].every(row => row.closed) }, null, 2))
  vi.unstubAllEnvs()
})
test.skipIf(!enabled || !cases.includes('direct'))('old gateway empty-assistant controls remain separate from BOAI histories', async () => {
  scenario = 'direct'; phase = 'controls'
  const controls = ['', null, '   ', [], [{ type: 'text', text: '' }], undefined]
  for (const content of controls) {
    const result = await fetch(baseUrl + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'compat/direct', stream: true, messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content }, { role: 'user', content: 'continue' }] }) })
    expect(result.status).toBe(400); expect(await result.text()).toContain('content or tool_calls')
  }
  const reasoning = await fetch(baseUrl + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'compat/direct', stream: true, messages: [{ role: 'assistant', content: null, reasoning_content: 'only reasoning' }, { role: 'user', content: 'continue' }] }) })
  expect(reasoning.status).toBe(400); await reasoning.text()
  for (const messages of [[{ role: 'user', content: 'clean' }], [{ role: 'user', content: 'write' }, { role: 'assistant', content: null, tool_calls: [{ id: 'valid-tool', type: 'function', function: { name: 'write', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'valid-tool', content: 'written' }, { role: 'user', content: 'continue' }]]) {
    const result = await fetch(baseUrl + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'compat/direct', stream: true, messages }) })
    expect(result.status).toBe(200); expect(await result.text()).toContain('CONTROL_OK')
  }
  expect(rows.filter(row => row.scenario === 'direct' && row.status === 400)).toHaveLength(7)
}, 20000)
for (const name of allCases.filter(value => value !== 'direct')) test.skipIf(!enabled || !cases.includes(name))(`${name}: ${action} after a real tool permits explicit new messages without replay`, async () => {
  scenario = name; phase = 'setup'; const directory = join(evidence, name), dataPath = join(directory, 'data'); await mkdir(directory)
  const api = name.startsWith('api-'), protocol = api ? name.slice(4) as 'chat' | 'responses' | 'messages' : 'chat'
  const config = join(directory, 'config'); await mkdir(config)
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR']) { const path = join(config, key); await mkdir(path); vi.stubEnv(key, path) }
  vi.stubEnv('OPENCODE_CONFIG_CONTENT', '{}'); vi.stubEnv('OPENCODE_CONFIG', undefined)
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL']) vi.stubEnv(key, undefined)
  vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  let nativeFiles: Record<string, string> = {}, selectedConfig: string | undefined
  if (nativeProfile) {
    for (const key of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE']) vi.stubEnv(key, undefined)
    vi.stubEnv('BOAI_NATIVE_MAGPIE_KEY', 'magpie-boai')
    selectedConfig = name === 'claude' ? process.env.CLAUDE_CONFIG_DIR! : name === 'pi' ? process.env.PI_CODING_AGENT_DIR! : join(config, 'native-profile')
    nativeFiles = await writeNativeMagpieProfile(name, selectedConfig, baseUrl, { id: `compat/${name}`, context_window: 131072, max_output_tokens: 8192, reasoning: false })
    if (name === 'opencode') { vi.stubEnv('OPENCODE_CONFIG', join(selectedConfig, 'opencode.json')); vi.stubEnv('OPENCODE_CONFIG_CONTENT', undefined) }
  }
  let parentCalls = 0, profile: LaunchProfile | undefined, failure: unknown, status = 'running', fileStamp: { sha256: string; mtimeMs: number } | undefined
  const snapshots: { phase: string; detail: ConversationDetail; records: Record<string, unknown[]> }[] = []
  const create = () => new AppService({ dataPath, engine: api ? new MastraEngine() : { run: async () => { parentCalls++; throw Error('Native task cannot use API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => { throw Error('No stored credential expected') }, delete: async () => {} }, emit: () => {} })
  let service = create()
  const read = async (): Promise<Record<string, Record<string, unknown>[]>> => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(collections.map(async key => [key, await store.load<Record<string, unknown>>(key)]))) } finally { await store.close() } }
  let chat: Conversation | undefined
  const detail = async () => await service.handle('getConversation', { id: chat!.id }) as ConversationDetail
  const settle = async (message: Message, target = chat!) => {
    let view: ConversationDetail | undefined
    await expect.poll(async () => { view = await service.handle('getConversation', { id: target.id }) as ConversationDetail; const run = view.runs.find(value => value.triggerMessageId === message.id && value.phase === 'execution'); if (run?.status === 'waiting_approval') throw Error('Unexpected native approval; preserve and close without bypass'); return !!run && terminal.has(run.status) && view.runs.every(value => terminal.has(value.status)) && !!view.turns?.length && view.turns.every(turn => terminal.has(turn.status)) }, { timeout: 45000, interval: 50 }).toBe(true)
    snapshots.push({ phase, detail: view!, records: await read() }); return view!.runs.find(run => run.triggerMessageId === message.id && run.phase === 'execution')!
  }
  try {
    await service.init()
    const connection = nativeProfile ? undefined : await service.handle('saveConnection', { name: `Continuation ${name}`, provider: 'openai-compatible', baseUrl, defaultModel: `compat/${name}`, gateway: { kind: 'magpie', auth: 'local', protocol } }) as Connection
    const catalog = !api ? await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog : undefined, plugin = catalog?.plugins.find(value => value.manifest.id === `boai.runtime.${name}`)
    if (!api) {
      const executable = name === 'opencode' ? resolve('.local/magpie-20261017/opencode-tool/node_modules/opencode-ai/bin/opencode.exe') : `/Users/wangwenbo/.nvm/versions/node/v24.16.0/bin/${name}`
      const draft = { name: `Continuation ${name}`, executable, args: [], protocol: name === 'codex' ? 'codex-app-server' : name === 'claude' ? 'claude-cli' : 'runtime-plugin', useExistingLogin: nativeProfile, ...(nativeProfile && name === 'codex' ? { codexHome: selectedConfig } : {}), hostAccessAcknowledged: true, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: name, packageHash: plugin.packageHash } } : {}) }
      await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    }
    const definition = { name: `验收 ${name}`, role: '文件处理', instructions: '只执行用户明确要求的操作。', color: '#123456', connectionId: connection?.id ?? '', modelId: '', ...(!api ? { executionBackend: plugin ? { kind: 'runtime-plugin', profileId: profile!.id, pluginId: plugin.manifest.id, providerId: name } : { kind: name === 'codex' ? 'codex-local' : 'claude-local', profileId: profile!.id } } : {}), ...(name === 'codex' ? { nativeOptions: { codexSandbox: 'workspace-write', codexApprovalPolicy: 'never' } } : name === 'claude' ? { nativeOptions: { claudePermissionMode: 'acceptEdits' } } : {}), skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
    const agent = await service.handle('saveAgent', definition) as DigitalAgent
    chat = await service.handle('createConversation', { kind: 'direct', title: `Continuation ${name}`, agentIds: [agent.id] }) as Conversation
    const home = await service.handle('getAgentHome', { agentId: agent.id, conversationId: chat.id }) as AgentHome
    workdir = join(home.sessionPath!, 'work'); nativeFile = join(workdir, 'effect.txt')
    let peerChat: Conversation | undefined, peerMessage: Message | undefined, peerConnection: Connection | undefined
    let peerPids: number[] = [], peerSockets = ''
    if (action === 'connection-delete') {
      peerConnection = await service.handle('saveConnection', { name: `Peer ${name}`, provider: 'openai-compatible', baseUrl, defaultModel: `compat/${name}-peer`, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
      const peer = await service.handle('saveAgent', { ...definition, name: `并行 ${name}`, connectionId: peerConnection.id }) as DigitalAgent
      peerChat = await service.handle('createConversation', { kind: 'direct', title: `Peer ${name}`, agentIds: [peer.id] }) as Conversation
      phase = 'peer'; peerMessage = await service.handle('sendMessage', { conversationId: peerChat.id, requestId: `${batch}-${name}-peer`, content: '只回答 PEER_SOURCE_OK，不修改文件。', mentionIds: [] }) as Message
      await expect.poll(() => rows.filter(row => row.scenario === name && row.peer && row.hold).length, { timeout: 45000 }).toBe(1)
      const port = incoming.filter(row => row.scenario === name && row.body.model === `compat/${name}-peer`).at(-1)?.remotePort
      peerSockets = (await promisify(execFile)('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`])).stdout
      peerPids = [...new Set(peerSockets.split('\n').slice(1).map(line => Number(line.trim().split(/\s+/)[1])).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid))]
      expect(peerPids).toHaveLength(1)
    }
    phase = 'interrupted'
    const first = await service.handle('sendMessage', { conversationId: chat.id, requestId: `${batch}-${name}-first`, content: '请只执行一次：保存 effect.txt，内容为 WRITTEN_ONCE，然后回答。', mentionIds: [] }) as Message
    await expect.poll(async () => { const view = await detail(); const run = view.runs.find(value => value.triggerMessageId === first.id && value.phase === 'execution'); if (run && (terminal.has(run.status) || run.status === 'waiting_approval')) throw Error(`Stopped before held response: ${run.status}: ${run.error}`); return rows.filter(row => row.scenario === name && row.hold && !row.peer).length }, { timeout: 45000, interval: 50 }).toBe(1)
    const paths = (await readdir(dataPath, { recursive: true })).filter(path => path.endsWith('/effect.txt'))
    expect(paths).toHaveLength(1); nativeFile = join(dataPath, paths[0]); expect(await readFile(nativeFile, 'utf8')).toBe('WRITTEN_ONCE')
    fileStamp = { sha256: sha(await readFile(nativeFile)), mtimeMs: (await stat(nativeFile)).mtimeMs }
    const socketOwners = async () => {
      if (api) return undefined
      const port = incoming.filter(row => row.scenario === name).at(-1)?.remotePort
      try { return (await promisify(execFile)('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`])).stdout }
      catch (error) { return String((error as { stdout?: string }).stdout ?? error) }
    }
    const socketsBeforeCancel = await socketOwners()
    const clientPids = [...new Set((socketsBeforeCancel ?? '').split('\n').slice(1).map(line => Number(line.trim().split(/\s+/)[1])).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid))]
    if (!api) expect(clientPids).toHaveLength(1)
    await writeFile(join(directory, 'before-cancel.json'), JSON.stringify({ sourceMode, profile, nativeFiles, socketsBeforeCancel, clientPids, fileStamp }, null, 2))
    if (action === 'connection-update') {
      expect(connection).toBeDefined()
      const updated = await service.handle('saveConnection', { id: connection!.id, expectedRevision: connection!.revision, name: connection!.name, provider: connection!.provider, baseUrl: connection!.baseUrl, defaultModel: `compat/${name}-updated`, gateway: connection!.gateway }) as Connection
      expect(updated).toMatchObject({ id: connection!.id, revision: connection!.revision! + 1, defaultModel: `compat/${name}-updated` })
      await writeFile(join(directory, 'source-update.json'), JSON.stringify({ action, before: connection, after: updated, phase, requestsBefore: incoming.filter(row => row.scenario === name).length }, null, 2))
    } else if (action === 'connection-delete') await service.handle('deleteConnection', { id: connection!.id })
    else await service.handle('cancelRun', { conversationId: chat.id })
    const interrupted = await settle(first); expect(interrupted.status).not.toBe('completed')
    if (action !== 'cancel') { expect(interrupted.error).toContain('连接'); if (!api) expect(interrupted.backend?.modelSource?.selectedModelId).toBe(`compat/${name}`) }
    await expect.poll(() => rows.filter(row => row.scenario === name && row.hold && !row.peer).every(row => row.closed), { timeout: 10000 }).toBe(true)
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    if (!api) {
      await expect.poll(() => clientPids.every(pid => !alive(pid)), { timeout: 10000 }).toBe(true)
      await writeFile(join(directory, 'native-client-exit.json'), JSON.stringify({ socketsBeforeCancel, socketsAfterExit: await socketOwners(), clientPids, allExited: clientPids.every(pid => !alive(pid)), interruptedSession: interrupted.backend?.sessionId }, null, 2))
      expect(interrupted.backend?.sessionId).toBeTruthy()
    }
    if (action === 'connection-delete') {
      expect(peerPids.every(alive)).toBe(true); expect(rows.filter(row => row.scenario === name && row.peer).every(row => !row.closed)).toBe(true)
      const peerHeld = await service.handle('getConversation', { id: peerChat!.id }) as ConversationDetail
      expect(peerHeld.runs.some(run => run.phase === 'execution' && run.status === 'running')).toBe(true)
      let disabled: RuntimePluginCatalog | undefined
      if (plugin) {
        const current = await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog
        disabled = await service.handle('setRuntimePluginEnabled', { id: plugin.manifest.id, enabled: false, expectedRevision: current.revision }) as RuntimePluginCatalog
        expect(disabled.plugins.find(p => p.manifest.id === plugin.manifest.id)).toMatchObject({ enabled: false, inUse: 1 })
        await expect(service.handle('testLaunchProfileDraft', { name: profile!.name, executable: profile!.executable, args: [], protocol: 'runtime-plugin', useExistingLogin: false, hostAccessAcknowledged: true, runtimePlugin: profile!.runtimePlugin })).rejects.toThrow('停用')
      }
      phase = 'peer-finish'; releasePeer()
      const peerRun = await settle(peerMessage!, peerChat!); expect(peerRun.status, peerRun.error).toBe('completed'); expect(peerRun.backend?.sessionId).not.toBe(interrupted.backend?.sessionId)
      expect(peerRun.backend?.modelSource?.selectedModelId).toBe(`compat/${name}-peer`)
      await expect.poll(() => peerPids.every(pid => !alive(pid)), { timeout: 10000 }).toBe(true)
      const peerResult = await service.handle('getConversation', { id: peerChat!.id }) as ConversationDetail
      expect(peerResult.messages.find(m => m.runId === peerRun.id && m.senderType === 'agent')?.content).toBe('PEER_SOURCE_OK')
      expect(JSON.stringify(incoming.filter(row => row.scenario === name && row.body.model === `compat/${name}-peer`).map(row => row.body))).not.toContain(nativeFile)
      let reenabled: RuntimePluginCatalog | undefined
      if (plugin) {
        const drained = await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog
        expect(drained.plugins.find(p => p.manifest.id === plugin.manifest.id)).toMatchObject({ enabled: false, inUse: 0 })
        reenabled = await service.handle('setRuntimePluginEnabled', { id: plugin.manifest.id, enabled: true, expectedRevision: drained.revision }) as RuntimePluginCatalog
      }
      const replacement = await service.handle('saveConnection', { name: `Replacement ${name}`, provider: 'openai-compatible', baseUrl, defaultModel: `compat/${name}-updated`, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
      const agentState = (await read()).agents.find(value => value.id === agent.id) as unknown as DigitalAgent
      expect(agentState.connectionId).toBe('')
      const rebound = await service.handle('saveAgent', { ...definition, id: agent.id, expectedConfigVersion: agentState.configVersion, connectionId: replacement.id }) as DigitalAgent
      await writeFile(join(directory, 'peer-lifecycle.json'), JSON.stringify({ peerConnection, peerHeld, peerResult, peerSockets, peerPids, allPeerPidsExited: peerPids.every(pid => !alive(pid)), disabled, reenabled, deleted: connection, replacement, rebound }, null, 2))
    }
    expect((await detail()).messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(0)
    const afterCancel = incoming.length; await pause(150); expect(incoming).toHaveLength(afterCancel)
    phase = 'explicit'
    const next = await service.handle('sendMessage', { conversationId: chat.id, requestId: `${batch}-${name}-explicit`, content: '不要重复保存或执行之前的工具。现在只回答 CONTINUED_explicit。', mentionIds: [] }) as Message
    const continued = await settle(next); expect(continued.status, continued.error).toBe('completed')
    if (!api) { expect(continued.backend?.sessionId).toBeTruthy(); expect(continued.backend?.sessionId).not.toBe(interrupted.backend?.sessionId); expect(continued.usage).toBeUndefined() }
    if (action !== 'cancel') {
      if (!api) expect(continued.backend?.modelSource?.selectedModelId).toBe(`compat/${name}-updated`)
      expect(incoming.filter(row => row.scenario === name && row.phase === 'explicit').every(row => row.body.model === `compat/${name}-updated`)).toBe(true)
      expect(rows.filter(row => row.scenario === name && row.phase === 'explicit').every(row => row.body.model === `${name}-updated`)).toBe(true)
    }
    expect((await detail()).messages.find(message => message.runId === continued.id && message.senderType === 'agent')?.content).toBe('CONTINUED_explicit')
    phase = 'reopen'; const beforeRestart = incoming.length; await service.close(); const saved = await read(); service = create(); await service.init(); await pause(150); expect(incoming).toHaveLength(beforeRestart); expect(await read()).toEqual(saved)
    phase = 'after-reopen'
    const last = await service.handle('sendMessage', { conversationId: chat.id, requestId: `${batch}-${name}-last`, content: '不要修改文件，只回答 CONTINUED_after-reopen。', mentionIds: [] }) as Message
    const resumed = await settle(last); expect(resumed.status, resumed.error).toBe('completed')
    if (!api) expect(resumed.backend?.sessionId).toBe(continued.backend?.sessionId)
    expect((await detail()).messages.find(message => message.runId === resumed.id && message.senderType === 'agent')?.content).toBe('CONTINUED_after-reopen')
    expect({ sha256: sha(await readFile(nativeFile)), mtimeMs: (await stat(nativeFile)).mtimeMs }).toEqual(fileStamp)
    expect(rows.filter(row => row.scenario === name).every(row => row.emptyAssistant === 0)).toBe(true)
    expect(rows.filter(row => row.scenario === name && row.phase === 'interrupted' && !row.title)).toHaveLength(api ? 3 : 2)
    expect(rows.filter(row => row.scenario === name && row.phase === 'explicit' && !row.title)).toHaveLength(api ? 3 : 1)
    expect(rows.filter(row => row.scenario === name && row.phase === 'after-reopen' && !row.title)).toHaveLength(api ? 3 : 1)
    expect(parentCalls).toBe(0); expect((await detail()).artifacts).toHaveLength(0); status = 'passed'
    for (const [path, original] of Object.entries(nativeFiles)) expect(await readFile(path, 'utf8')).toBe(original + (name === 'codex' ? `\n[projects.${JSON.stringify(process.cwd())}]\ntrust_level = "trusted"\n` : ''))
    if (nativeProfile) expect((await read()).connections).toHaveLength(0)
  } catch (error) { failure = error; status = 'failed'; throw error }
  finally {
    phase = 'close'; await service.close()
    const nativeFilesAfter = Object.fromEntries(await Promise.all(Object.keys(nativeFiles).map(async path => [path, await readFile(path, 'utf8')])))
    await writeFile(join(directory, 'result.json'), JSON.stringify({ status, error: failure ? String(failure) : undefined, action, sourceMode, profile, nativeFiles, nativeFilesAfter, parentCalls, file: nativeFile, fileStamp, snapshots, records: await read(), incoming: incoming.filter(row => row.scenario === name), upstream: rows.filter(row => row.scenario === name) }, null, 2)); vi.unstubAllEnvs()
  }
}, 180000)
