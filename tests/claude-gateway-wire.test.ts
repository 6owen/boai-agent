/*
 * [INPUT]: Explicit opt-in, the installed Claude CLI and isolated HTTP/profile/AppService directories.
 * [OUTPUT]: Actual native CLI routing/auth/model precedence against a local wire fixture; no supplier inference, no personal config changes.
 * [POS]: G2 Claude native wire gate; does not certify real Magpie/model task quality.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing this gate.
 */
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../packages/shared/src/domain'

test.skipIf(process.env.BOAI_CLAUDE_GATEWAY_WIRE !== '1')('installed Claude honors the host gateway over ambient and settings sources while retaining native tools', async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw new Error('Specify a new BOAI_MAGPIE_BATCH')
  const evidence = resolve('.local/magpie-20261017', `claude-wire-${batch}`)
  await mkdir(evidence) // Existing results must never be overwritten.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-claude-wire-'))), config = join(root, 'config')
  await mkdir(config)
  const servers: Server[] = [], requests: { path: string; model: string; keyIsPublic: boolean; toolNames: string[] }[] = []
  let service: AppService | undefined, forbidden = 0, parentCalls = 0, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, failure: string | undefined
  const listen = async (host: Server) => { servers.push(host); await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(host.address() as { port: number }).port}` }
  const trap = await listen(createServer((_req, res) => { forbidden++; res.writeHead(503); res.end('wrong source') }))
  const endpoint = await listen(createServer((req, res) => { void (async () => {
    let raw = ''; for await (const part of req) { raw += part; if (raw.length > 4_000_000) throw new Error('Fixture request too large') }
    const body = raw ? JSON.parse(raw) : {}
    if (req.url?.includes('/count_tokens')) { res.setHeader('content-type', 'application/json'); res.end('{"input_tokens":10}'); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/relay/v1/messages')) { res.writeHead(404); res.end('{}'); return }
    requests.push({ path: req.url, model: body.model, keyIsPublic: req.headers['x-api-key'] === 'magpie-boai' || req.headers.authorization === 'Bearer magpie-boai', toolNames: (body.tools ?? []).map((tool: { name: string }) => tool.name) })
    if (requests.length > 6) { res.writeHead(429); res.end('fixture request cap'); return }
    const message = { id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'BOAI_GATEWAY_WIRE_OK' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }
    if (!body.stream) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(message)); return }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const event = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data as object })}\n\n`)
    event('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'BOAI_GATEWAY_WIRE_OK' } })
    event('content_block_stop', { index: 0 })
    event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
    event('message_stop', {}); res.end()
  })().catch(() => { res.writeHead(500); res.end('fixture failure') }) }))
  const settings = JSON.stringify({ model: 'wrong-settings-model', env: { ANTHROPIC_BASE_URL: trap, ANTHROPIC_API_KEY: 'synthetic-settings-key', ANTHROPIC_AUTH_TOKEN: 'synthetic-settings-key', ANTHROPIC_MODEL: 'wrong-settings-model', ANTHROPIC_DEFAULT_SONNET_MODEL: 'wrong-settings-model', CLAUDE_CODE_USE_BEDROCK: '1' } })
  await writeFile(join(config, 'settings.json'), settings)
  await writeFile(join(root, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: ['magpie-boai'], rejected: [] } }))
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, model: 'group/work', savedApiProtocol: 'chat', nativeProtocol: 'messages', maxRequests: 6, scope: 'installed Claude with local HTTP fixture; no supplier inference', settingsHash: createHash('sha256').update(settings).digest('hex') }, null, 2))
  vi.stubEnv('HOME', root); vi.stubEnv('CLAUDE_CONFIG_DIR', config); vi.stubEnv('CLAUDE_CODE_USE_BEDROCK', '1'); vi.stubEnv('ANTHROPIC_MODEL', 'wrong-ambient-model')
  vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  try {
    service = new AppService({ dataPath: join(root, 'data'), engine: { run: async () => { parentCalls++; throw new Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    await service.init()
    const draft = { name: 'Installed Claude wire', executable: process.env.BOAI_CLAUDE_EXECUTABLE ?? 'claude', args: [], protocol: 'claude-cli', useExistingLogin: false, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const connection = await service.handle('saveConnection', { name: 'Wire Magpie', provider: 'openai-compatible', baseUrl: `${endpoint}/relay`, defaultModel: 'group/work', gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
    const agent = await service.handle('saveAgent', { name: '网关原生验证', role: '测试', instructions: '按消息回答', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
    const chat = await service.handle('createConversation', { kind: 'direct', title: 'Wire', agentIds: [agent.id] }) as Conversation
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '只回答 BOAI_GATEWAY_WIRE_OK。', mentionIds: [], requestId: `${batch}-message` }) as Message
    await expect.poll(async () => { const view = await service!.handle('getConversation', { id: chat.id }) as ConversationDetail; run = view.runs.find(value => value.triggerMessageId === message.id); return run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 45000, interval: 100 }).toBe(true)
    expect(run?.status, run?.error).toBe('completed')
    expect(requests.length).toBeGreaterThan(0); expect(requests.length).toBeLessThanOrEqual(6)
    expect(requests.every(request => request.model === 'group/work' && request.keyIsPublic)).toBe(true)
    expect(requests.some(request => request.toolNames.includes('Read') && request.toolNames.includes('Bash'))).toBe(true)
    expect(forbidden).toBe(0); expect(parentCalls).toBe(0)
    expect(run?.backend?.modelSource).toMatchObject({ protocol: 'messages', selectedModelId: 'group/work', connectionRevision: 1 })
    expect(await readFile(join(config, 'settings.json'), 'utf8')).toBe(settings)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service?.close()
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, version: profile?.verified?.version, executableHash: profile?.executableHash, requests, forbidden, parentCalls, run: run ? { id: run.id, status: run.status, error: run.error, backend: run.backend } : undefined }, null, 2))
    vi.unstubAllEnvs()
    for (const host of servers) { host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve())) }
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
