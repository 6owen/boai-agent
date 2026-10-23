/*
 * [INPUT]: Explicit opt-in, installed Pi/OpenCode binaries and isolated native settings/HTTP endpoints.
 * [OUTPUT]: Actual three-protocol requests, raw model/auth/tools and source precedence without supplier calls.
 * [POS]: Runtime API v2 installed-binary wire gate; separate from live Magpie business acceptance.
 * [PROTOCOL]: Update tests/.folder.md and retain each batch including failed observations.
 */
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'

for (const provider of ['pi', 'opencode'] as const) test.skipIf(process.env.BOAI_PLUGIN_GATEWAY_WIRE !== provider).each(['chat', 'responses', 'messages'] as const)(`${provider} installed binary honors explicit %s source and retains native/product tools`, async protocol => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw new Error('Specify a new BOAI_MAGPIE_BATCH')
  const evidence = resolve('.local/magpie-20261017', `${provider}-wire-${batch}-${protocol}`)
  await mkdir(evidence)
  const privateAuth = process.env.BOAI_PLUGIN_WIRE_AUTH === 'key', key = privateAuth ? `synthetic-private-${randomUUID()}` : 'magpie-boai', credentials = new Map<string, string>()
  const root = await realpath(await mkdtemp(join(tmpdir(), `boai-${provider}-wire-`)))
  const servers: Server[] = [], requests: { path: string; model: string; keyMatches: boolean; toolNames: string[] }[] = []
  const rejectedPaths: string[] = []
  let service: AppService | undefined, forbidden = 0, parentCalls = 0, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, failure: string | undefined
  const listen = async (host: Server) => { servers.push(host); await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(host.address() as { port: number }).port}` }
  const trap = await listen(createServer((_req, res) => { forbidden++; res.writeHead(503); res.end('wrong source') }))
  const endpoint = await listen(createServer((req, res) => { void (async () => {
    let raw = ''; for await (const part of req) { raw += part; if (raw.length > 4_000_000) throw new Error('Fixture request too large') }
    const body = raw ? JSON.parse(raw) : {}
    const path = `/relay/v1/${protocol === 'chat' ? 'chat/completions' : protocol}`
    if (req.method !== 'POST' || req.url?.split('?')[0] !== path) { rejectedPaths.push(req.url ?? ''); res.writeHead(404); res.end('{}'); return }
    const names = (tools: { name?: string; function?: { name?: string }; type?: string; tools?: never[] }[]): string[] => tools.flatMap(tool => [tool.name ?? tool.function?.name ?? tool.type ?? '', ...names(tool.tools ?? [])])
    requests.push({ path: req.url!, model: body.model, keyMatches: req.headers.authorization === `Bearer ${key}` || req.headers['x-api-key'] === key, toolNames: names(body.tools ?? []) })
    if (requests.length > 8) { res.writeHead(429); res.end('fixture request cap'); return }
    const text = 'BOAI_GATEWAY_WIRE_OK'
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    let sequence = 0
    const event = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`)
    if (protocol === 'chat') {
      const chunk = (delta: object, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'r', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      chunk({ role: 'assistant', content: text }); chunk({}, 'stop'); res.end('data: [DONE]\n\n')
    } else if (protocol === 'messages') {
      event('message_start', { message: { id: 'r', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } })
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
      event('content_block_stop', { index: 0 }); event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }); event('message_stop', {}); res.end()
    } else {
      const item = { id: 'msg_wire', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
      const response = { id: `resp_${requests.length}`, object: 'response', created_at: 1, model: body.model, status: 'in_progress', output: [] }
      event('response.created', { response })
      event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
      event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
      event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: text })
      event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text })
      event('response.output_item.done', { output_index: 0, item })
      event('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } }); res.end()
    }
  })().catch(() => { res.writeHead(500); res.end('fixture failure') }) }))
  const nativeFiles: { path: string; text: string }[] = provider === 'pi' ? [
    { path: join(root, '.pi/agent/models.json'), text: JSON.stringify({ providers: { wrong: { api: 'openai-completions', baseUrl: `${trap}/v1`, apiKey: 'synthetic-wrong-native', models: [{ id: 'wrong', name: 'wrong', contextWindow: 32768, maxTokens: 4096 }] } } }) },
    { path: join(root, '.pi/agent/settings.json'), text: JSON.stringify({ defaultProvider: 'wrong', defaultModel: 'wrong', hideThinkingBlock: true }) },
  ] : [{ path: join(root, '.config/opencode/opencode.json'), text: JSON.stringify({ $schema: 'https://opencode.ai/config.json', model: 'wrong/wrong', small_model: 'wrong/wrong', provider: { wrong: { npm: '@ai-sdk/openai-compatible', options: { baseURL: `${trap}/v1`, apiKey: 'synthetic-wrong-native' }, models: { wrong: { name: 'wrong' } } } } }) }]
  for (const file of nativeFiles) { await mkdir(join(file.path, '..'), { recursive: true }); await writeFile(file.path, file.text) }
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, provider, protocol, model: 'group/work', maxRequests: 8, scope: 'actual binary/local HTTP fixture; no supplier inference', auth: privateAuth ? 'synthetic-private' : 'public', settings: nativeFiles.map(file => ({ path: file.path, sha256: createHash('sha256').update(file.text).digest('hex') })) }, null, 2))
  vi.stubEnv('HOME', root)
  try {
    service = new AppService({ dataPath: join(root, 'data'), engine: { run: async () => { parentCalls++; throw new Error('No API parent') }, test: async () => '' }, secrets: { get: async (id: string) => credentials.get(id), set: async (id: string, value: string) => { credentials.set(id, value) }, delete: async (id: string) => { credentials.delete(id) } }, emit: () => {} })
    await service.init()
    const catalog = await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog, plugin = catalog.plugins.find(p => p.manifest.id === `boai.runtime.${provider}`)!
    const draft = { name: `Installed ${provider} wire`, executable: process.env.BOAI_PLUGIN_EXECUTABLE ?? provider, args: [], protocol: 'runtime-plugin', runtimePlugin: { pluginId: plugin.manifest.id, providerId: provider, packageHash: plugin.packageHash }, useExistingLogin: true, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const connection = await service.handle('saveConnection', { name: 'Wire Magpie', provider: 'openai-compatible', baseUrl: `${endpoint}/relay`, defaultModel: 'group/work', ...(privateAuth ? { apiKey: key } : {}), gateway: { kind: 'magpie', auth: privateAuth ? 'key' : 'local', protocol } }) as Connection
    const agent = await service.handle('saveAgent', { name: '网关原生验证', role: '测试', instructions: '按消息回答', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'runtime-plugin', profileId: profile.id, pluginId: plugin.manifest.id, providerId: provider }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
    const chat = await service.handle('createConversation', { kind: 'direct', title: 'Wire', agentIds: [agent.id] }) as Conversation
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '只回答 BOAI_GATEWAY_WIRE_OK。', mentionIds: [], requestId: `${batch}-${provider}-${protocol}` }) as Message
    await expect.poll(async () => { const view = await service!.handle('getConversation', { id: chat.id }) as ConversationDetail; run = view.runs.find(value => value.triggerMessageId === message.id); return run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 60000, interval: 100 }).toBe(true)
    expect(run?.status, run?.error).toBe('completed')
    expect(requests.length).toBeGreaterThan(0); expect(requests.length).toBeLessThanOrEqual(8)
    expect(requests.every(request => request.model === 'group/work' && request.keyMatches)).toBe(true)
    expect(requests.some(request => request.toolNames.includes('bash'))).toBe(true)
    expect(requests.some(request => request.toolNames.some(name => name.includes('publish_artifact')))).toBe(true)
    expect(forbidden).toBe(0); expect(parentCalls).toBe(0)
    expect(run?.backend?.modelSource).toMatchObject({ protocol, selectedModelId: 'group/work', connectionRevision: 1 })
    for (const file of nativeFiles) expect(await readFile(file.path, 'utf8')).toBe(file.text)
    await service.close()
    if (privateAuth) {
      for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) if (entry.isFile()) expect((await readFile(join(entry.parentPath, entry.name))).includes(Buffer.from(key)), entry.name).toBe(false)
    }
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service?.close()
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, version: profile?.verified?.version, executableHash: profile?.executableHash, requests, rejectedPaths, forbidden, parentCalls, run: run ? { id: run.id, status: run.status, error: run.error, backend: run.backend } : undefined }, null, 2))
    vi.unstubAllEnvs()
    for (const host of servers) { host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve())) }
    await rm(root, { recursive: true, force: true })
  }
}, 120000)
