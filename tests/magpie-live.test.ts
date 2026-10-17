/*
 * [INPUT]: Explicit BOAI_MAGPIE_REAL opt-in, installed local Magpie and current production MastraEngine.
 * [OUTPUT]: Finite three-request smoke evidence for exact protocols, raw model selection, response routing and streamed text.
 * [POS]: Real inference gate; default test runs skip it, and it never edits personal BOAI/Magpie configuration.
 * [PROTOCOL]: Update Header and tests/.folder.md plus the Magpie acceptance ledger when running this gate.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { listModelCatalog, probeMagpie } from '../src/runtime/adapters/mastra/model-catalog'
import type { EngineContext } from '../src/runtime/contracts'
import type { Connection, ModelUsage } from '../src/shared/domain'
import type { GatewayRouteEvidence, ModelCatalog } from '../src/shared/domain/model-gateway'
const enabled = process.env.BOAI_MAGPIE_REAL === '1'
const batch = process.env.BOAI_MAGPIE_BATCH ?? 'unset'
const root = 'http://127.0.0.1:3425', selected = 'deepseek/deepseek-flash'
const evidence = resolve('.local/magpie-20261017')
const originalFetch = globalThis.fetch
let catalog: ModelCatalog, version: string, requests = 0
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || batch === 'unset') throw new Error('A fresh explicit batch ID is required')
  const identity = await probeMagpie(root); version = identity.version
  catalog = await listModelCatalog(`${root}/v1`, 'magpie-boai')
  if (!catalog.models.find(model => model.id === selected)?.reasoningLevels?.includes('none')) throw new Error('The selected live model/none setting is not in the current catalog')
  await mkdir(evidence, { recursive: true })
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin === root && url.pathname.startsWith('/v1/') && (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'POST') {
      if (requests >= 3) throw new Error('Live experiment three-request cap reached; no automatic replay')
      requests++
    }
    return originalFetch(input, init)
  }
})
afterAll(() => { globalThis.fetch = originalFetch })
test.skipIf(!enabled).each(['chat', 'responses', 'messages'] as const)('installed Magpie production engine %s smoke', async protocol => {
  const output = join(evidence, `g1-live-${batch}-${protocol}.json`)
  try { await readFile(output); throw new Error('Evidence already exists; choose a new explicitly planned batch') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const directory = await mkdtemp(join(tmpdir(), 'boai-magpie-live-')), startedAt = new Date().toISOString()
  const connection: Connection = { id: `live-${protocol}`, revision: 1, name: 'Magpie live gate', provider: protocol === 'messages' ? 'anthropic' : 'openai-compatible', baseUrl: root, defaultModel: selected, gateway: { kind: 'magpie', protocol, auth: 'local' }, hasApiKey: false }
  const callId = `live-${batch}-${protocol}`, routes: { callId: string; evidence: GatewayRouteEvidence }[] = [], usage: ModelUsage[] = [], started: string[] = []
  let text = '', status = 'running', error: string | undefined
  const before = requests
  const record = () => ({ batch, protocol, selected, version, startedAt, finishedAt: status === 'running' ? undefined : new Date().toISOString(), status, inferenceRequests: requests - before, rawText: text, routes, usage, error, engine: 'production MastraEngine.run; isolated chat context', scope: 'single API reply only; no Work, tools, business delivery, Electron or app-package certification' })
  await writeFile(output, JSON.stringify(record(), null, 2))
  try {
    const context: EngineContext = {
      connection, modelCatalog: catalog, apiKey: '', modelCallId: callId,
      agent: { id: 'live-employee', name: 'Gateway verification', role: '', instructions: '按用户要求简短作答。', executionBackend: { kind: 'mastra-model' }, connectionId: connection.id, modelId: selected, thinkingLevel: 'none', skillIds: [], knowledgeIds: [], color: '#123456', allowCommands: false, active: true, configVersion: 1 },
      conversation: { id: `live-${protocol}`, kind: 'direct', title: 'Gateway verification', agentIds: ['live-employee'], mode: 'mention', sharedKnowledgeIds: [], workspacePath: join(directory, 'shared'), createdAt: startedAt, updatedAt: startedAt },
      messages: [{ id: 'user', conversationId: `live-${protocol}`, senderType: 'user', senderId: 'human', senderName: 'User', content: '仅回复 BOAI_MAGPIE_OK，不要补充其他内容。', status: 'completed', sequence: 1, createdAt: startedAt }],
      resources: [], runId: callId, signal: AbortSignal.timeout(90_000), responseKind: 'chat',
      onModelCallStarted: async id => { started.push(id) }, onModelCallRoute: async (id, value) => { routes.push({ callId: id, evidence: value }) }, onModelCallUsage: async (_id, value) => { usage.push(value) },
      onDelta: async value => { text += value }, onTool: async () => { throw new Error('Smoke case must not call a tool') }, approveCommand: async () => false,
    }
    await new MastraEngine().run(context)
    expect(started).toEqual([callId]); expect(requests - before).toBe(1); expect(text.trim()).toBe('BOAI_MAGPIE_OK')
    expect(routes).toHaveLength(1); expect(routes[0].callId).toBe(callId); expect(routes[0].evidence.routeSource).toBe('response-headers'); expect(routes[0].evidence.actualModelId).toBeTruthy()
    status = 'passed'
  } catch (failure) {
    status = 'failed'; error = String(failure instanceof Error ? failure.message : failure).replaceAll('magpie-boai', '[public app id]').slice(0, 2000); throw failure
  } finally { await writeFile(output, JSON.stringify(record(), null, 2)); await rm(directory, { recursive: true, force: true }) }
}, 95_000)
