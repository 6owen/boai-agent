/*
 * [INPUT]: Gateway source/credential contracts and production AppService with an isolated native Codex fixture.
 * [OUTPUT]: Explicit Responses/source contracts using a version-file fixture, with confirmed gateway version and no replay.
 * [POS]: G2 Codex source integration; offline fixture does not certify real CLI or supplier quality.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing coverage.
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, realpath, readFile, writeFile, copyFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { codexGatewayProvider, assertCodexGatewayVersion } from '../packages/shared/src/domain/codex-provider'
import { codexGatewaySource } from '../packages/runtime/src/adapters/codex/gateway-source'
import { AppService } from '../packages/runtime/src/service'
import { agentModelConnections, agentModelSelectionReady } from '../apps/electron/src/renderer/components/employee/agent-model-selection'
import type { Connection, DigitalAgent, LaunchProfile, Conversation, ConversationDetail, Message } from '../packages/shared/src/domain'

const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose() })
const source = (): Connection => ({ id: 'source', name: 'Magpie', revision: 4, provider: 'openai-compatible', baseUrl: 'http://localhost:3425/relay/', defaultModel: 'group/work', hasApiKey: false, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } })

test('explicit Codex source uses Responses and raw model IDs without changing the saved API source', () => {
  for (const protocol of ['chat', 'messages', 'responses'] as const) {
    const connection = { ...source(), gateway: { ...source().gateway!, protocol } }, before = structuredClone(connection)
    expect(codexGatewayProvider(connection, '')).toEqual({ baseUrl: 'http://localhost:3425/relay/v1', model: 'group/work' })
    expect(codexGatewayProvider(connection, 'vendor/org/model').model).toBe('vendor/org/model')
    expect(connection).toEqual(before)
  }
  expect(() => codexGatewayProvider({ ...source(), gateway: undefined }, '')).toThrow('网关')
  expect(() => codexGatewayProvider({ ...source(), baseUrl: 'https://remote.test' }, '')).toThrow('凭据')
  expect(() => assertCodexGatewayVersion('0.161.0')).toThrow('0.162.1')
})

test('each process has an independent provider and credential environment without key/secret config in argv', () => {
  const inherited = { HOME: '/native', CODEX_HOME: '/native/codex', PATH: '/bin', OPENAI_BASE_URL: 'https://wrong.test', OPENAI_API_KEY: 'wrong-key', NATIVE_PLUGIN_OPTION: 'keep' }, before = { ...inherited }
  const connection = { ...source(), hasApiKey: true, gateway: { ...source().gateway!, auth: 'key' as const } }
  const first = codexGatewaySource(connection, '', 'synthetic-private-key-one', inherited), second = codexGatewaySource(connection, 'other/model', 'synthetic-private-key-two', inherited)
  expect(first.providerId).not.toBe(second.providerId)
  expect(first.env).toMatchObject({ HOME: '/native', CODEX_HOME: '/native/codex', NATIVE_PLUGIN_OPTION: 'keep', BOAI_CODEX_GATEWAY_API_KEY: 'synthetic-private-key-one' })
  expect(second.env.BOAI_CODEX_GATEWAY_API_KEY).toBe('synthetic-private-key-two')
  expect(first.env).not.toHaveProperty('OPENAI_API_KEY'); expect(first.env).not.toHaveProperty('OPENAI_BASE_URL')
  expect(JSON.stringify(first.args)).not.toContain('synthetic-private-key')
  expect(first.args.join(' ')).toContain('requires_openai_auth = false'); expect(first.args.join(' ')).toContain('supports_websockets = false')
  expect(inherited).toEqual(before)
})

test('UI keeps native configuration available, allows only supported explicit gateways and never falls back from a missing source', () => {
  const connection = source(), profile: LaunchProfile = { id: 'codex', name: 'Codex', executable: '/fixture', executableHash: 'fixture', args: [], protocol: 'codex-app-server', useExistingLogin: true, hostAccessAcknowledged: true, revision: 1, verified: { name: 'Codex', version: '0.162.1', protocolVersion: 2, checkedAt: 'fixed' } }
  const selection = { executionBackend: { kind: 'codex-local' as const, profileId: profile.id }, connectionId: connection.id, modelId: '' }
  expect(agentModelSelectionReady(selection, [connection], [profile])).toBe(true)
  expect(agentModelSelectionReady({ ...selection, connectionId: '' }, [], [profile])).toBe(true)
  expect(agentModelSelectionReady(selection, [], [profile])).toBe(false)
  expect(agentModelSelectionReady(selection, [connection], [{ ...profile, verified: { ...profile.verified!, version: '0.161.0' } }])).toBe(false)
  expect(agentModelConnections(selection, [connection, { ...connection, id: 'direct', gateway: undefined }])).toEqual([connection])
})

test('production Codex binds default model/provider, rejects source mismatch before turn submission and preserves historical receipts after source change', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-codex-gateway-')))
  disposals.push(() => rm(root, { recursive: true, force: true }))
  const executable = join(root, 'codex.mjs'), observations = join(root, 'source-observations.jsonl')
  let cli = await readFile(resolve('tests/fixtures/native-conversation.mjs'), 'utf8')
  cli = cli.replace("model:'fixture'}})", "model:params.model??'fixture',modelProvider:params.model==='mismatch'?'wrong-provider':params.modelProvider}})")
  cli = cli.replace("await appendFile('native-thread-requests.jsonl'", `await appendFile(${JSON.stringify(observations)},JSON.stringify({method,model:params.model,provider:params.modelProvider,threadId:params.threadId,keyIsPublic:process.env.BOAI_CODEX_GATEWAY_API_KEY==='magpie-boai'})+'\\n'); await appendFile('native-thread-requests.jsonl'`)
  cli = cli.replace("await appendFile('native-turn-requests.jsonl'", `await appendFile(${JSON.stringify(observations)},JSON.stringify({method,threadId:params.threadId})+'\\n'); await appendFile('native-turn-requests.jsonl'`)
  await writeFile(executable, cli); await chmod(executable, 0o700)
  await writeFile(join(root, 'native-version.txt'), '0.162.1')
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(root, 'native-business.mjs'))
  let apiCalls = 0
  const options = { dataPath: root, engine: { run: async () => { apiCalls++; throw new Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options); await service.init(); disposals.push(() => service.close())
  const draft = { name: 'Managed Codex', executable, args: [], protocol: 'codex-app-server', useExistingLogin: false, hostAccessAcknowledged: true }
  await service.handle('testLaunchProfileDraft', draft)
  const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  expect(profile.verified?.version).toBe('0.162.1')
  const input = { name: 'Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425/relay', defaultModel: 'group/work', gateway: source().gateway }
  const connection = await service.handle('saveConnection', input) as Connection
  const agent = await service.handle('saveAgent', { name: '网关员工', role: '写作', instructions: '按消息回答', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
  const chat = await service.handle('createConversation', { kind: 'direct', title: 'Magpie', agentIds: [agent.id] }) as Conversation
  const send = async () => {
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '请回答你好', mentionIds: [], requestId: crypto.randomUUID() }) as Message
    let detail!: ConversationDetail
    await expect.poll(async () => { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail; return ['completed', 'failed'].includes(detail.runs.find(run => run.triggerMessageId === message.id)?.status ?? '') }, { timeout: 10000 }).toBe(true)
    return detail.runs.find(run => run.triggerMessageId === message.id)!
  }
  const first = await send(); expect(first.status, first.error).toBe('completed')
  expect(first.backend?.modelSource).toEqual({ mode: 'boai-connection', connectionId: connection.id, connectionRevision: 1, protocol: 'responses', selectedModelId: 'group/work' })
  const second = await send(); expect(second.status, second.error).toBe('completed'); expect(second.backend?.sessionId).toBe(first.backend?.sessionId)
  const changed = await service.handle('saveConnection', { ...input, id: connection.id, expectedRevision: 1, baseUrl: 'http://127.0.0.1:4444/prefix', defaultModel: 'vendor/next' }) as Connection
  const third = await send(); expect(third.status, third.error).toBe('completed')
  expect(third.backend?.modelSource).toMatchObject({ connectionRevision: 2, protocol: 'responses', selectedModelId: 'vendor/next' })
  expect(third.backend?.sessionId).not.toBe(first.backend?.sessionId); expect(changed.gateway?.protocol).toBe('chat')
  await service.handle('saveConnection', { ...input, id: connection.id, expectedRevision: 2, defaultModel: 'mismatch' })
  const rejected = await send(); expect(rejected.status).toBe('failed'); expect(rejected.error).toContain('来源')
  const lines = (await readFile(observations, 'utf8')).trim().split('\n'), rows = lines.map(line => JSON.parse(line))
  expect(rows.filter(row => row.method === 'turn/start')).toHaveLength(3)
  expect(rows.filter(row => row.keyIsPublic)).toHaveLength(4); expect(apiCalls).toBe(0)
  await service.close(); service = new AppService(options); await service.init()
  expect((await readFile(observations, 'utf8')).trim().split('\n')).toEqual(lines)
  const retained = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(retained.runs.find(run => run.id === first.id)?.backend?.modelSource).toEqual(first.backend?.modelSource)
}, 30000)
