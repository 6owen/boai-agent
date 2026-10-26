/*
 * [OUTPUT]: 显式及原生来源绕过继承的loopback代理；生产启动边界核对远端代理、既有排除项及来源保持。
 * [INPUT]: Shared source resolution, per-process environment, production AppService and isolated Claude protocol fixture.
 * [OUTPUT]: Native Messages source is independent of API defaults; model/credential ownership, version gate, source changes and historical receipts stay explicit.
 * [POS]: Claude Magpie source integration; synthetic CLI does not certify the installed binary or supplier.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing coverage.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, realpath, readFile, writeFile, copyFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { claudeProvider, assertClaudeGatewayVersion } from '../packages/shared/src/domain/claude-provider'
import { claudeGatewayEnvironment } from '../packages/runtime/src/adapters/claude/gateway-source'
import { AppService } from '../packages/runtime/src/service'
import { agentModelSelectionReady } from '../apps/electron/src/renderer/components/employee/agent-model-selection'
import type { Connection, DigitalAgent, LaunchProfile, Conversation, ConversationDetail, Message, Snapshot } from '../packages/shared/src/domain'

const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); vi.unstubAllEnvs() })
const source = (protocol: 'chat' | 'responses' | 'messages' = 'chat'): Connection => ({ id: 'source', name: 'Magpie', revision: 4, provider: 'openai-compatible', baseUrl: 'http://localhost:3425/relay/', defaultModel: 'group/work', hasApiKey: false, gateway: { kind: 'magpie', auth: 'local', protocol } })

test('Claude derives Messages from one gateway root without changing the shared API protocol or requiring a private local key', () => {
  for (const protocol of ['chat', 'responses', 'messages'] as const) {
    const connection = source(protocol), original = structuredClone(connection)
    expect(claudeProvider(connection, '')).toEqual({ baseUrl: 'http://localhost:3425/relay', model: 'group/work' })
    expect(claudeProvider(connection, 'vendor/org/model').model).toBe('vendor/org/model')
    expect(connection).toEqual(original)
  }
  expect(() => claudeProvider({ ...source(), baseUrl: 'https://remote.test' }, '')).toThrow('凭据')
  expect(() => claudeProvider({ ...source(), gateway: { ...source().gateway!, auth: 'key' } }, '')).toThrow('凭据')
  expect(claudeProvider({ ...source(), baseUrl: 'https://remote.test/prefix', hasApiKey: true, gateway: { ...source().gateway!, auth: 'key' } }, '')).toEqual({ baseUrl: 'https://remote.test/prefix', model: 'group/work' })
  expect(() => claudeProvider({ ...source(), baseUrl: 'https://unverified.test', gateway: undefined, hasApiKey: true }, '')).toThrow('尚未验证')
})

test('explicit gateway routing removes competing ambient providers while retaining native capabilities and uses an independent environment per employee', () => {
  const inherited = { HOME: '/home/original', PATH: '/bin', CLAUDE_CONFIG_DIR: '/private/profile', NATIVE_PLUGIN_SETTING: 'keep', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_GATEWAY: '1', CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-oauth', ANTHROPIC_CUSTOM_HEADERS: 'x-api-key: synthetic-wrong', ANTHROPIC_MODEL: 'wrong-model', CLAUDE_CODE_EFFORT_LEVEL: 'low' }
  const original = { ...inherited }, first = claudeGatewayEnvironment(source(), '', '', inherited, 'high')
  expect(first).toMatchObject({ HOME: inherited.HOME, CLAUDE_CONFIG_DIR: inherited.CLAUDE_CONFIG_DIR, NATIVE_PLUGIN_SETTING: 'keep', ANTHROPIC_BASE_URL: 'http://localhost:3425/relay', ANTHROPIC_MODEL: 'group/work', ANTHROPIC_API_KEY: 'magpie-boai', ANTHROPIC_AUTH_TOKEN: 'magpie-boai', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', CLAUDE_CODE_EFFORT_LEVEL: 'high', CLAUDE_CODE_SUBAGENT_MODEL: 'group/work' })
  for (const key of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_GATEWAY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_CUSTOM_HEADERS']) expect(first).not.toHaveProperty(key)
  expect(inherited).toEqual(original)
  const second = claudeGatewayEnvironment({ ...source(), baseUrl: 'http://127.0.0.1:4000', defaultModel: 'other/model' }, '', '', inherited)
  expect(second.ANTHROPIC_MODEL).toBe('other/model'); expect(second).not.toHaveProperty('CLAUDE_CODE_EFFORT_LEVEL'); expect(first.ANTHROPIC_MODEL).toBe('group/work')
})

test('explicit gateway binding rejects an unverified/older Claude host-routing version in the UI and shared contract', () => {
  const connection = source(), profile: LaunchProfile = { id: 'claude', name: 'Claude', executable: '/fixture', executableHash: 'fixture', args: [], protocol: 'claude-cli', useExistingLogin: false, hostAccessAcknowledged: true, revision: 1, verified: { name: 'Claude', version: '2.1.302', protocolVersion: 1, checkedAt: 'fixed' } }
  const selection = { executionBackend: { kind: 'claude-local' as const, profileId: profile.id }, connectionId: connection.id, modelId: '' }
  expect(agentModelSelectionReady(selection, [connection], [profile])).toBe(true)
  for (const version of ['2.1.214', 'fixture', '3.0.0']) {
    expect(() => assertClaudeGatewayVersion(connection, version)).toThrow('2.1.302')
    expect(agentModelSelectionReady(selection, [connection], [{ ...profile, verified: { ...profile.verified!, version } }])).toBe(false)
  }
})

test('production Claude uses the connection default model, freezes the native protocol and starts a new session after a source revision', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-claude-gateway-')))
  disposals.push(() => rm(root, { recursive: true, force: true }))
  const executable = join(root, 'claude.mjs'), observations = join(root, 'source-observations.jsonl')
  const cli = (await readFile(resolve('tests/fixtures/native-claude-conversation.mjs'), 'utf8')).replace('2.1.140 (Claude Code)', '2.1.302 (Claude Code)')
  const capture = `\nawait appendFile(${JSON.stringify(observations)},JSON.stringify({model:arg('--model'),base:process.env.ANTHROPIC_BASE_URL,managed:process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST,competingProvider:process.env.CLAUDE_CODE_USE_BEDROCK,session,resumed:process.argv.includes('--resume'),keyIsPublic:process.env.ANTHROPIC_API_KEY==='magpie-boai'})+'\\n')\n`
  await writeFile(executable, cli.replace('const emit=value=>', capture + 'const emit=value=>')); await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(root, 'native-business.mjs'))
  vi.stubEnv('CLAUDE_CODE_USE_BEDROCK', '1'); vi.stubEnv('ANTHROPIC_MODEL', 'wrong-model')
  let apiCalls = 0
  const options = { dataPath: root, engine: { run: async () => { apiCalls++; throw new Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options); await service.init(); disposals.push(() => service.close())
  const draft = { name: 'Managed Claude', executable, args: [], protocol: 'claude-cli', useExistingLogin: false, hostAccessAcknowledged: true }
  await service.handle('testLaunchProfileDraft', draft)
  const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  const input = { name: 'Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425/relay', defaultModel: 'group/work', gateway: source().gateway }
  const connection = await service.handle('saveConnection', input) as Connection
  const agent = await service.handle('saveAgent', { name: '网关员工', role: '写作', instructions: '按消息回答', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
  const chat = await service.handle('createConversation', { kind: 'direct', title: 'Magpie', agentIds: [agent.id] }) as Conversation
  const send = async () => {
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '请回答你好', mentionIds: [], requestId: crypto.randomUUID() }) as Message
    let detail!: ConversationDetail
    await expect.poll(async () => { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail; return detail.runs.find(run => run.triggerMessageId === message.id)?.status }, { timeout: 10000 }).toBe('completed')
    return detail.runs.find(run => run.triggerMessageId === message.id)!
  }
  const first = await send()
  expect(first.backend?.modelSource).toEqual({ mode: 'boai-connection', connectionId: connection.id, connectionRevision: 1, protocol: 'messages', selectedModelId: 'group/work' })
  const changed = await service.handle('saveConnection', { ...input, id: connection.id, expectedRevision: 1, baseUrl: 'http://127.0.0.1:4444/prefix', defaultModel: 'vendor/next' }) as Connection
  const second = await send()
  expect(second.backend?.modelSource).toMatchObject({ connectionRevision: 2, protocol: 'messages', selectedModelId: 'vendor/next' })
  expect(second.backend?.sessionId).not.toBe(first.backend?.sessionId)
  expect(changed.gateway?.protocol).toBe('chat')
  const rows = (await readFile(observations, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(rows).toMatchObject([{ model: 'group/work', base: input.baseUrl, managed: '1', resumed: false, keyIsPublic: true }, { model: 'vendor/next', base: changed.baseUrl, managed: '1', resumed: false, keyIsPublic: true }])
  expect(rows.every(row => !row.competingProvider)).toBe(true); expect(apiCalls).toBe(0)
  await service.close(); service = new AppService(options); await service.init()
  expect((await readFile(observations, 'utf8')).trim().split('\n')).toHaveLength(2)
  const retained = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(retained.runs.find(run => run.id === first.id)?.backend?.modelSource).toEqual(first.backend?.modelSource)
  expect((await service.handle('snapshot', undefined) as Snapshot).connections.find(value => value.id === connection.id)?.gateway?.protocol).toBe('chat')
}, 30000)


test.each(['http://127.0.0.1:3425', 'http://localhost:3425/prefix', 'http://[::1]:3425'])('local Claude gateway %s bypasses inherited proxies without mutating shared configuration', baseUrl => {
  const inherited = { HTTPS_PROXY: 'http://127.0.0.1:8001', http_proxy: 'http://127.0.0.1:8002', all_proxy: 'socks5://127.0.0.1:8003', NO_PROXY: 'internal.example', no_proxy: 'other.example,internal.example' }
  const original = { ...inherited }, env = claudeGatewayEnvironment({ ...source(), baseUrl }, '', '', inherited)
  const exclusions = new Set((env.NO_PROXY ?? '').split(','))
  expect(exclusions).toEqual(new Set(['internal.example', 'other.example', '127.0.0.1', 'localhost', '::1']))
  expect(env.no_proxy).toBe(env.NO_PROXY)
  for (const key of ['HTTPS_PROXY', 'http_proxy', 'all_proxy'] as const) expect(env[key]).toBe(inherited[key])
  expect(inherited).toEqual(original)
})

test('remote Claude gateway retains independent inherited proxy exclusions exactly', () => {
  const inherited = { HTTPS_PROXY: 'http://127.0.0.1:8001', NO_PROXY: 'upper.example', no_proxy: 'lower.example' }
  const remote: Connection = { ...source(), baseUrl: 'https://gateway.example/prefix', hasApiKey: true, gateway: { ...source().gateway!, auth: 'key' } }
  expect(claudeGatewayEnvironment(remote, '', 'synthetic-private', inherited)).toMatchObject(inherited)
})

test.each(['http://127.0.0.1:3425', 'https://native.example/prefix'])('native Claude process bypasses loopback without taking ownership of profile source %s', async baseUrl => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-claude-native-proxy-')))
  disposals.push(() => rm(root, { recursive: true, force: true }))
  const executable = join(root, 'claude.mjs'), observations = join(root, 'environment.jsonl')
  const cli = (await readFile(resolve('tests/fixtures/native-claude-conversation.mjs'), 'utf8')).replace('2.1.140 (Claude Code)', '2.1.302 (Claude Code)')
  const capture = `\nawait appendFile(${JSON.stringify(observations)},JSON.stringify({upper:process.env.NO_PROXY,lower:process.env.no_proxy,proxy:process.env.HTTPS_PROXY,base:process.env.ANTHROPIC_BASE_URL,model:process.env.ANTHROPIC_MODEL,managed:process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST,keyRetained:process.env.ANTHROPIC_AUTH_TOKEN==='synthetic-native-key'})+'\\n')\n`
  await writeFile(executable, cli.replace('const emit=value=>', capture + 'const emit=value=>')); await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(root, 'native-business.mjs'))
  const inherited = { NO_PROXY: ' upper.example,internal.example ', no_proxy: 'lower.example,internal.example', HTTPS_PROXY: 'http://127.0.0.1:8001', ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_MODEL: 'native/default', ANTHROPIC_AUTH_TOKEN: 'synthetic-native-key', CLAUDE_CONFIG_DIR: root }
  for (const [key, value] of Object.entries(inherited)) vi.stubEnv(key, value)
  vi.stubEnv('CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', undefined)
  let apiCalls = 0
  const service = new AppService({ dataPath: join(root, 'data'), engine: { run: async () => { apiCalls++; throw Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init(); disposals.push(() => service.close())
  const draft = { name: 'Native Claude', executable, args: [], protocol: 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
  await service.handle('testLaunchProfileDraft', draft)
  const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  const agent = await service.handle('saveAgent', { name: '原生来源', role: '测试', instructions: '按消息回答', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
  const chat = await service.handle('createConversation', { kind: 'direct', title: 'Native source', agentIds: [agent.id] }) as Conversation
  const message = await service.handle('sendMessage', { conversationId: chat.id, content: '请回答你好', mentionIds: [], requestId: crypto.randomUUID() }) as Message
  await expect.poll(async () => (await service.handle('getConversation', { id: chat.id }) as ConversationDetail).runs.find(run => run.triggerMessageId === message.id)?.status, { timeout: 10000 }).toBe('completed')
  const captured = (await readFile(observations, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(captured).toHaveLength(1)
  expect(new Set(captured[0].upper.split(','))).toEqual(new Set(['upper.example', 'internal.example', 'lower.example', '127.0.0.1', 'localhost', '::1']))
  expect(captured[0].lower).toBe(captured[0].upper)
  expect(captured[0]).toMatchObject({ proxy: inherited.HTTPS_PROXY, base: baseUrl, model: 'native/default', keyRetained: true })
  expect(captured[0].managed).toBeUndefined(); expect(apiCalls).toBe(0)
  for (const [key, value] of Object.entries(inherited)) expect(process.env[key]).toBe(value)
}, 20000)
