/*
[OUTPUT]: 已关闭SQLite sidecar在目录快照后消失时重核对应主库；持久化缺失/实际私密字节仍失败。
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [INPUT]: Versioned Runtime API packages, isolated host records and synthetic gateway credentials.
 * [OUTPUT]: Private v2 source, legacy compatibility, before-submit rejection, redaction and source revision isolation.
 * [POS]: Offline production-host integration; native protocol/source effects have separate actual-binary gates.
 * [PROTOCOL]: Update Header and tests/.folder.md when this boundary changes.
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, realpath, writeFile, readFile, readdir, rm, copyFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppService } from '../packages/runtime/src/service'
import { bundledRuntimePlugins, runtimeManifestSchema, type RuntimePluginCatalog } from '../packages/shared/src/plugins/runtime-catalog'
import { hostFrameSchema } from '../packages/runtime/src/adapters/plugins/validation'
import { piGatewaySource, opencodeGatewaySource } from '../packages/runtime-plugins/src/gateway-source'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../packages/shared/src/domain'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function expectNoStoredSecret(files: string[], secret: string) {
  const databases = new Set(files.filter(path => /\.(?:sqlite|sqlite3)$/.test(path)))
  const scan = async (path: string) => expect((await readFile(path)).includes(Buffer.from(secret)), basename(path)).toBe(false)
  for (const path of files) {
    try { await scan(path) }
    catch (error) {
      const main = path.replace(/-(?:wal|shm)$/, '')
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !/\.(?:sqlite|sqlite3)-(?:wal|shm)$/.test(path) || !databases.has(main)) throw error
      // SQLite may remove its temporary WAL/shared-memory files after the
      // directory snapshot. Re-read the matching persistent database instead.
      await scan(main)
    }
  }
  for (const path of databases) await scan(path)
}
test('stored-secret scan rechecks the main DB when a closed SQLite sidecar disappears, while real leaks and missing durable files fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-secret-scan-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const main = join(root, 'boai.sqlite'), sidecar = main + '-shm', durable = join(root, 'record.json'), secret = 'synthetic-private-scanner-value'
  await writeFile(main, '[redacted]'); await writeFile(durable, '{}'); await writeFile(sidecar, secret)
  await expect(expectNoStoredSecret([main, sidecar, durable], secret)).rejects.toThrow('boai.sqlite-shm')
  await rm(sidecar); await expect(expectNoStoredSecret([main, sidecar, durable], secret)).resolves.toBeUndefined()
  await writeFile(main, secret); await expect(expectNoStoredSecret([sidecar, main, durable], secret)).rejects.toThrow('boai.sqlite')
  await writeFile(main, '[redacted]'); await rm(durable)
  await expect(expectNoStoredSecret([main, sidecar, durable], secret)).rejects.toMatchObject({ code: 'ENOENT' })
})
async function setup(mode: 'normal' | 'mismatch' | 'error' | 'native-race' = 'normal', apiVersion: 1 | 2 = 2) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-plugin-source-'))), secret = `synthetic-${randomUUID()}`, credentials = new Map<string, string>()
  const options = { dataPath: join(root, 'data'), engine: { run: async () => { throw Error('No API parent') }, test: async () => '' }, secrets: { get: async (key: string) => credentials.get(key), set: async (key: string, value: string) => { credentials.set(key, value) }, delete: async (key: string) => { credentials.delete(key) } }, emit: () => {} }
  let service = new AppService(options); cleanup.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }) }); await service.init()
  const pack = join(root, 'package'); await mkdir(pack)
  const manifest = structuredClone(bundledRuntimePlugins[0]); manifest.id = 'example.model-source'; manifest.contributions[0].driver = { kind: 'module', entry: 'runtime.mjs' }; manifest.contributions[0].runtimeApiVersion = apiVersion
  delete manifest.contributions[0].nativeSourceIdentity
  if (mode === 'native-race') manifest.contributions[0].nativeSourceIdentity = true
  if (apiVersion === 1) delete manifest.contributions[0].modelSource
  await writeFile(join(pack, 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(pack, 'LICENSE'), 'Test fixture')
  await writeFile(join(pack, 'runtime.mjs'), `import {randomUUID} from 'node:crypto';
export const runtimeApiVersion=${apiVersion}; export function createRuntime(s) { let source=s.modelSource, opened=false; return {
async inspectSource(){return {fingerprint:(opened?'b':'a').repeat(64)}},
async probe(){return {name:'Test provider',version:'1.0.0',protocolVersion:1,capabilities:{chat:'supported',resume:'supported',images:'unsupported',tools:'unsupported',actions:'unsupported',steer:'unsupported',followUp:'unsupported'},${apiVersion === 2 ? "modelSource:{protocols:['chat','responses','messages']}" : ''}}},
async openSession(input){ opened=true; if(source && JSON.stringify(s.launch).includes(source.apiKey)) throw Error('Secret leaked to launch'); ${mode === 'error' ? "throw Error('Private error '+source.apiKey)" : ''}; const id=input.resumeRef||randomUUID(); return {sessionId:id,resumeRef:id,...(source?{modelSource:{protocol:source.protocol,modelId:${mode === 'mismatch' ? "'wrong'" : 'source.modelId'}}}:{})}},
async submit(input){s.emit({type:'input.accepted',requestId:input.requestId}); if(source)s.emit({type:'message.completed',id:'answer',text:source.apiKey});s.emit({type:'session.idle'});return {text:source?'Private value '+source.apiKey:'Legacy native response'}},
async interrupt(){},async inspect(){return {state:'idle'}},async closeSession(){} } }`)
  const catalog = await service.installRuntimePlugin(pack, 0) as RuntimePluginCatalog, plugin = catalog.plugins.find(p => p.manifest.id === manifest.id)!
  const executable = join(root, 'program.mjs'); await copyFile(resolve('tests/fixtures/plugin-native.mjs'), executable); await chmod(executable, 0o700)
  const draft = { name: 'Private source test', executable, args: [], protocol: 'runtime-plugin', runtimePlugin: { pluginId: manifest.id, providerId: 'pi', packageHash: plugin.packageHash }, useExistingLogin: false, hostAccessAcknowledged: true }
  await service.handle('testLaunchProfileDraft', draft)
  const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  const connection = await service.handle('saveConnection', { name: 'Synthetic gateway', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'vendor/group/model', apiKey: secret, gateway: { kind: 'magpie', protocol: 'chat', auth: 'key' } }) as Connection
  const employee = { name: '插件来源验证', role: '测试', instructions: '按消息回答', color: '#00AABB', connectionId: apiVersion === 2 && mode !== 'native-race' ? connection.id : '', modelId: '', executionBackend: { kind: 'runtime-plugin', profileId: profile.id, pluginId: manifest.id, providerId: 'pi' }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  const agent = await service.handle('saveAgent', employee) as DigitalAgent, chat = await service.handle('createConversation', { kind: 'direct', title: 'Source', agentIds: [agent.id] }) as Conversation
  const send = async () => {
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '回答一次', mentionIds: [], requestId: randomUUID() }) as Message
    let detail: ConversationDetail | undefined
    await expect.poll(async () => { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail; return detail.runs.some(run => run.triggerMessageId === message.id && ['completed', 'failed'].includes(run.status)) }, { timeout: 15000 }).toBe(true)
    return detail!
  }
  return { root, secret, profile, connection, employee, agent, send, get service() { return service }, restart: async () => { await service.close(); service = new AppService(options); await service.init() } }
}
test('v2 private source never enters launch, public replies/events, profile or stored records; a changed source creates a fresh native session', async () => {
  const f = await setup(), first = await f.send(), run = first.runs.at(-1)!
  expect(run.status, run.error).toBe('completed'); expect(run.backend?.modelSource).toMatchObject({ connectionId: f.connection.id, connectionRevision: 1, protocol: 'chat', selectedModelId: 'vendor/group/model' })
  expect(JSON.stringify(first)).not.toContain(f.secret); expect(first.messages.some(message => message.content.includes('[redacted]'))).toBe(true)
  await f.restart(); const second = await f.send(); expect(second.runs.at(-1)?.backend?.sessionId).toBe(run.backend?.sessionId)
  await f.service.handle('saveConnection', { id: f.connection.id, provider: f.connection.provider, baseUrl: f.connection.baseUrl, gateway: f.connection.gateway, expectedRevision: f.connection.revision, name: 'Changed source', defaultModel: 'vendor/group/new-model' })
  const third = await f.send(); expect(third.runs.at(-1)?.status).toBe('completed'); expect(third.runs.at(-1)?.backend?.sessionId).not.toBe(run.backend?.sessionId); expect(third.runs.at(-1)?.backend?.modelSource?.connectionRevision).toBe(2)
  expect(third.runs.every(value => value.usage === undefined)).toBe(true)
  await f.service.close()
  const entries = await readdir(join(f.root, 'data'), { recursive: true, withFileTypes: true })
  await expectNoStoredSecret(entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)), f.secret)
}, 60000)
test.each(['mismatch', 'error'] as const)('v2 %s rejects before accepting user input and sanitizes private errors', async mode => {
  const f = await setup(mode), detail = await f.send(), run = detail.runs.at(-1)!
  expect(run.status).toBe('failed'); expect(run.backend?.inputAccepted).not.toBe(true)
  expect(JSON.stringify(detail)).not.toContain(f.secret)
  expect(run.error).toContain(mode === 'mismatch' ? '插件未确认所选网关来源' : '[redacted]')
}, 30000)
test('v1 modules retain native operation and cannot receive an explicit gateway source', async () => {
  const f = await setup('normal', 1), detail = await f.send()
  expect(detail.runs.at(-1)?.status).toBe('completed')
  await expect(f.service.handle('saveAgent', { ...f.employee, name: 'Invalid source', connectionId: f.connection.id })).rejects.toThrow('未验证此网关协议')
}, 30000)
test('only explicit v2 negotiation accepts a private source; manifest v1 cannot claim it', () => {
  const input = { entry: '/runtime.mjs', launch: { executable: '/pi', args: [], cwd: '/work', privateHome: '/private', config: {} } }, modelSource = { protocol: 'chat', baseUrl: 'http://127.0.0.1:3425/v1', modelId: 'vendor/model', apiKey: 'synthetic-private' }
  expect(hostFrameSchema.safeParse({ type: 'request', id: 'init', method: 'initialize', input }).success).toBe(true)
  expect(hostFrameSchema.safeParse({ type: 'request', id: 'init', method: 'initialize', input: { ...input, modelSource } }).success).toBe(false)
  expect(hostFrameSchema.safeParse({ type: 'request', id: 'init', method: 'initialize', input: { ...input, runtimeApiVersion: 2, modelSource } }).success).toBe(true)
  const manifest = structuredClone(bundledRuntimePlugins[0]); manifest.contributions[0].runtimeApiVersion = 1
  expect(runtimeManifestSchema.safeParse(manifest).success).toBe(false)
})
test('a native source change during openSession rejects before user submission', async () => {
  const f = await setup('native-race'), detail = await f.send(), run = detail.runs.at(-1)!
  expect(run.status).toBe('failed'); expect(run.backend?.inputAccepted).not.toBe(true)
  expect(run.error).toContain('原生配置在受理前发生变化')
  expect(detail.messages.some(message => message.content.includes('Legacy native response'))).toBe(false)
}, 30000)
test.each(['chat', 'responses', 'messages'] as const)('native %s source config stores only a credential reference and uses distinct provider identities', protocol => {
  const source = { protocol, baseUrl: 'http://127.0.0.1:3425/relay/v1', modelId: 'vendor/org/model', apiKey: 'synthetic-private-key' }, first = piGatewaySource(source), second = piGatewaySource(source), acp = opencodeGatewaySource(source)
  expect(first.providerId).not.toBe(second.providerId)
  expect(first.extension).toContain('"contextWindow":0')
  const known = piGatewaySource({ ...source, model: { contextWindow: 1000000, maxOutputTokens: 393216, reasoning: true } })
  expect(known.extension).toContain('"contextWindow":1000000'); expect(known.extension).toContain('"maxTokens":393216')
  expect(first.extension).not.toContain(source.apiKey); expect(first.env.BOAI_PI_GATEWAY_API_KEY).toBe(source.apiKey)
  expect(first.baseUrl).toBe(protocol === 'messages' ? 'http://127.0.0.1:3425/relay' : source.baseUrl)
  expect(acp.env.OPENCODE_CONFIG_CONTENT).not.toContain(source.apiKey); expect(acp.env.BOAI_OPENCODE_GATEWAY_API_KEY).toBe(source.apiKey)
  expect(acp.modelId.endsWith('/vendor/org/model')).toBe(true)
})
