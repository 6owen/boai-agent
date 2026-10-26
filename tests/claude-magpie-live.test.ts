/*
 * [OUTPUT]: 真实批准仅在明确创建/修订期对固定文件publish_artifact允许一次；意外工具或重复批准立即失败，不改变生产权限规则。
 * [INPUT]: Explicit opt-in/new batch, installed Claude and already-running local Magpie, isolated AppService/profile.
 * [OUTPUT]: Bounded native file creation/revision, restart and explicit new-message evidence; original requests/files/source hashes retained.
 * [POS]: Real G2b representative acceptance; no personal configuration changes, no product budget or upstream upgrade.
 * [PROTOCOL]: Update Header/tests map and the Magpie ledger for every batch, including failures.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../packages/shared/src/domain'
import type { ArtifactPreview, ArtifactVersion } from '../packages/shared/src/domain/artifacts'
import type { NativeAction } from '../packages/shared/src/domain/execution'

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
async function sources() {
  const paths = (await workspaceInputFiles()).filter(file => /\.(ts|tsx|json)$/.test(file))
  paths.push('package.json', 'pnpm-lock.yaml', 'tests/claude-magpie-live.test.ts')
  const entries = await Promise.all(paths.sort().map(async path => [path, sha(await readFile(path))]))
  return { hash: sha(JSON.stringify(entries)), files: Object.fromEntries(entries) }
}
test.skipIf(process.env.BOAI_CLAUDE_MAGPIE_REAL !== '1')('native Claude creates/revises a Magpie-backed file and continues only on an explicit message after restart', async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw new Error('Specify a fresh BOAI_MAGPIE_BATCH')
  const evidence = resolve('.local/magpie-20261017', `claude-live-${batch}`)
  await mkdir(evidence)
  const dataPath = join(evidence, 'data'), home = join(evidence, 'native-home'), config = join(home, '.claude')
  await mkdir(config, { recursive: true })
  await writeFile(join(config, 'settings.json'), '{}')
  const originalBody = '# 原生网关验收\n状态：待验证\n备注：保留原文。', selected = 'deepseek/deepseek-flash'
  const tasks = [`请创建并通过 BOAI 的 publish_artifact 交付真实文件 magpie-native-check.md。正文恰好为以下三行，不增加解释：\n${originalBody}\n请实际保存文件并交付，不要只在聊天中展示正文。`, '请修订这份文件，仅把“状态：待验证”改为“状态：已验证”，保留其他所有文字和换行，并通过 BOAI 的 publish_artifact 交付更新后的文件。', '根据刚才已交付的最新文件，仅回答其中的状态值。不修改文件，不重复交付。']
  const source = await sources(), hello = await fetch('http://127.0.0.1:3425/api/hello').then(response => response.json())
  expect(hello.name).toBe('magpie')
  const catalog = await fetch('http://127.0.0.1:3425/v1/models', { headers: { authorization: 'Bearer magpie-boai' } }).then(response => response.json())
  expect(catalog.data.some((entry: { id: string }) => entry.id === selected)).toBe(true)
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, version: hello.version, source, selected, tasks, userMessages: 3, maxForwardedInferenceRequests: 30, observationDeadlinePerMessageMs: 180000, approvalPolicy: 'At most one allow-once publish_artifact for magpie-native-check.md in each explicitly requested create/revision phase; reject unexpected requests', scope: 'production AppService + installed Claude + local Magpie; no Electron/package certification' }, null, 2))
  const requests: Record<string, unknown>[] = [], snapshots: { phase: string; detail: ConversationDetail }[] = [], approvals: { phase: string; actionId: string; runId: string; path: string }[] = []
  let phase = 'setup', forwarded = 0, service: AppService | undefined, profile: LaunchProfile | undefined, chat: Conversation | undefined, first: ArtifactVersion | undefined, second: ArtifactVersion | undefined, error: string | undefined, status = 'running', parentCalls = 0
  // Test-only forwarding provides an exact HTTP count and header evidence without
  // altering Magpie or claiming that the CLI exposes those headers in production.
  const proxy = createServer((req, res) => { void (async () => {
    if (!req.url || !/^\/(api\/hello|v1\/(models|messages))(?:[/?]|$)/.test(req.url)) { res.writeHead(404); res.end(); return }
    let raw = ''; for await (const part of req) { raw += part; if (raw.length > 4_000_000) throw new Error('Experiment input too large') }
    const inference = req.method === 'POST' && /^\/v1\/messages(?:\?|$)/.test(req.url)
    const body = raw ? JSON.parse(raw) : undefined
    const record: Record<string, unknown> = { phase, path: req.url, startedAt: new Date().toISOString(), ...(inference ? { model: body.model, stream: body.stream, tools: (body.tools ?? []).map((tool: { name: string }) => tool.name), effort: body.output_config?.effort, thinking: body.thinking } : {}) }
    if (inference) { requests.push(record); if (forwarded >= 30) { record.capped = true; res.writeHead(429); res.end('Experiment forwarding limit'); return }; forwarded++; record.forwarded = true }
    const abort = new AbortController(); res.once('close', () => { if (!res.writableEnded) abort.abort() })
    try {
      const headers = new Headers(); for (const name of ['content-type', 'x-api-key', 'authorization', 'anthropic-version', 'anthropic-beta', 'user-agent']) if (typeof req.headers[name] === 'string') headers.set(name, req.headers[name] as string)
      const upstream = await fetch(`http://127.0.0.1:3425${req.url}`, { method: req.method, headers, ...(raw ? { body: raw } : {}), signal: abort.signal })
      record.status = upstream.status; record.actualModel = upstream.headers.get('x-magpie-model'); record.actualProvider = upstream.headers.get('x-magpie-provider')
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk)
      res.end()
    } catch (failure) { record.transport = abort.signal.aborted ? 'cancelled' : 'failed'; if (!res.headersSent) res.writeHead(502); res.end() }
  })().catch(() => { if (!res.headersSent) res.writeHead(500); res.end() }) })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
  vi.stubEnv('HOME', home); vi.stubEnv('CLAUDE_CONFIG_DIR', config); vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  const makeService = () => new AppService({ dataPath, engine: { run: async () => { parentCalls++; throw new Error('Native task must not use an API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  const settle = async (message: Message) => {
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const detail = await service!.handle('getConversation', { id: chat!.id }) as ConversationDetail
      const run = detail.runs.find(value => value.triggerMessageId === message.id)
      if (run?.status === 'waiting_approval') {
        const actions = await service!.handle('listNativeActions', { conversationId: chat!.id, runId: run.id }) as NativeAction[]
        for (const action of actions.filter(action => action.status === 'pending')) {
          const input = (action.detail as { input?: { path?: string; name?: string } })?.input
          if (action.kind !== 'approval' || action.method !== 'mcp__boai__publish_artifact' || !['create', 'revision'].includes(phase) || input?.path !== 'magpie-native-check.md' || input.name && input.name !== 'magpie-native-check.md' || approvals.some(approval => approval.phase === phase)) throw new Error(`Unexpected native approval in ${phase}: ${action.method}`)
          approvals.push({ phase, actionId: action.id, runId: run.id, path: input.path })
          await service!.handle('respondNativeAction', { conversationId: chat!.id, runId: run.id, actionId: action.id, response: { option: 'allow' } })
        }
      }
      if (run && ['completed', 'failed', 'cancelled', 'interrupted', 'waiting_user'].includes(run.status) && detail.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'waiting_user'].includes(turn.status))) {
        snapshots.push({ phase, detail }); expect(run.status, run.error).toBe('completed'); expect(run.backend?.modelSource).toMatchObject({ protocol: 'messages', selectedModelId: selected }); return detail
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('Experiment observation deadline reached; close and retain final records without replay')
  }
  try {
    service = makeService(); await service.init()
    const draft = { name: 'Claude Magpie real', executable: process.env.BOAI_CLAUDE_EXECUTABLE ?? 'claude', args: [], protocol: 'claude-cli', useExistingLogin: false, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const connection = await service.handle('saveConnection', { name: 'Magpie native', provider: 'openai-compatible', baseUrl: endpoint, defaultModel: selected, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
    const agent = await service.handle('saveAgent', { name: '原生网关验收', role: '文件处理', instructions: '按用户明确要求处理文件并使用 BOAI 提供的产品工具交付。', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'claude-local', profileId: profile.id }, nativeOptions: { claudePermissionMode: 'acceptEdits', effort: 'low' }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    chat = await service.handle('createConversation', { kind: 'direct', title: '原生网关文件', agentIds: [agent.id] }) as Conversation
    phase = 'create'
    let detail = await settle(await service.handle('sendMessage', { conversationId: chat.id, content: tasks[0], mentionIds: [], requestId: `${batch}-create` }) as Message)
    expect(detail.artifacts).toHaveLength(1); first = (await service.handle('getArtifactPreview', { id: detail.artifacts[0].id }) as ArtifactPreview).artifact
    const original = await readFile(first.path, 'utf8'); expect(original.trimEnd()).toBe(originalBody); expect(sha(original)).toBe(first.contentHash); await writeFile(join(evidence, 'original.md'), original)
    phase = 'revision'
    detail = await settle(await service.handle('reviseArtifact', { conversationId: chat.id, artifactId: first.id, contentHash: first.contentHash, targetAgentId: agent.id, content: tasks[1], requestId: `${batch}-revision` }) as Message)
    const updated = detail.artifacts.find(value => value.previousArtifactId === first!.id); expect(updated).toBeDefined()
    second = (await service.handle('getArtifactPreview', { id: updated!.id }) as ArtifactPreview).artifact
    const revision = await readFile(second.path, 'utf8'); expect(revision).toBe(original.replace('待验证', '已验证')); expect(sha(revision)).toBe(second.contentHash); expect(await readFile(first.path, 'utf8')).toBe(original); await writeFile(join(evidence, 'revision.md'), revision)
    expect(second.contentVersion).toBe(first.contentVersion + 1); expect(second.logicalArtifactId).toBe(first.logicalArtifactId)
    expect(detail.workItems?.filter(work => [first!.sourceWorkId, second!.sourceWorkId].includes(work.id)).map(work => work.status)).toEqual(['delivered', 'delivered'])
    const beforeRestart = forwarded; phase = 'restart'; await service.close(); service = makeService(); await service.init()
    expect(forwarded).toBe(beforeRestart)
    phase = 'explicit-new-message'
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: tasks[2], mentionIds: [], requestId: `${batch}-continue` }) as Message
    detail = await settle(message)
    expect(detail.messages.some(value => value.senderType === 'agent' && value.content.includes('已验证') && value.createdAt >= message.createdAt)).toBe(true)
    expect(detail.artifacts).toHaveLength(2); expect(parentCalls).toBe(0)
    expect(requests.filter(value => value.forwarded).every(value => value.model === selected && value.actualModel === selected && value.actualProvider === 'deepseek')).toBe(true)
    expect(await sources()).toEqual(source); status = 'passed'
  } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); status = 'failed'; throw failure }
  finally {
    await service?.close(); proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); vi.unstubAllEnvs()
    const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
    let closedRecords: unknown
    try { closedRecords = { runs: await store.load('runs'), turns: await store.load('turns'), works: await store.load('workItems'), artifacts: await store.load('artifacts'), messages: await store.load('messages'), nativeActions: await store.load('nativeActions') } } finally { await store.close() }
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ batch, status, error, version: hello.version, program: profile?.verified, executableHash: profile?.executableHash, sourceBefore: source, sourceAfter: await sources(), requests, forwarded, parentCalls, approvals, first, second, snapshots, closedRecords, closedAt: new Date().toISOString() }, null, 2))
  }
}, 570000)
