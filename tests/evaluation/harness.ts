/*
 * [INPUT]: 相同场景/模型配置、基线或候选 AppService/Mastra 和临时运行目录。
 * [OUTPUT]: 所有尝试的完整公开/工作记录、失败分类、调用/用量和延迟证据。
 * [POS]: tests/evaluation/harness.ts，手动供应商评估；不将自动检查替代语义复核。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import type { AppService as Service } from '../../src/runtime/service'
import type { MastraEngine as Engine } from '../../src/runtime/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../src/runtime/contracts'
import type { AgentInput, Connection, Conversation, ConversationDetail, DigitalAgent, ModelUsage, Snapshot } from '../../src/shared/domain'
import { cases, employees } from './cases'

interface Settings { label: string; source: string; output: string; samples: number; sampleStart?: number; maxRequests: number; cases: string[]; revision: string; hashes: Record<string, string> }
interface Input { settings: Settings; connection: Connection; apiKey: string }
type Phase = { caseId: string; sample: number; phase: string; runId: string; agentId: string }
type Call = Phase & { startedAt: number; headersMs?: number; requestBytes: number; status?: number; error?: string }
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const turnTerminal = new Set([...terminal, 'waiting_user', 'budget_exhausted'])
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function runEvaluation(input: Input, constructors: { AppService: typeof Service; MastraEngine: typeof Engine }) {
  const { settings, connection, apiKey } = input
  const redact = (value: string) => apiKey ? value.replaceAll(apiKey, '[REDACTED]') : value
  const save = (name: string, value: unknown) => writeFile(join(settings.output, name), redact(JSON.stringify(value, null, 2)))
  const selected = settings.cases.length ? cases.filter(item => settings.cases.includes(item.id)) : cases
  if (!selected.length || settings.cases.some(id => !cases.some(item => item.id === id))) throw new Error('Unknown evaluation scenario')
  const context = new AsyncLocalStorage<Phase>(), requests: Call[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (requests.length >= settings.maxRequests) throw new Error('EVALUATION_BUDGET: reached provider request ceiling')
    const phase = context.getStore() ?? { caseId: 'probe', sample: 0, phase: 'connection', runId: '', agentId: '' }
    const call: Call = { ...phase, startedAt: Date.now(), requestBytes: typeof options?.body === 'string' ? Buffer.byteLength(options.body) : 0 }
    requests.push(call)
    try { const response = await originalFetch(url, options); call.status = response.status; return response }
    catch (error) { call.error = redact(error instanceof Error ? error.message : String(error)); throw error }
    finally { call.headersMs = Date.now() - call.startedAt }
  }
  const results: unknown[] = []
  let active: Service | undefined, stopped = false, cancelActive: (() => Promise<unknown>) | undefined
  process.on('SIGINT', () => { stopped = true; process.exitCode = 130; void cancelActive?.().catch(() => {}) })
  const safeLog = (value: unknown) => process.stdout.write(redact(JSON.stringify(value)) + '\n')
  try {
    // Configuration check is retained as evidence and charged to the global request ceiling.
    const probe = new constructors.MastraEngine()
    try { await probe.test(connection, apiKey); await save('probe.json', { ok: true, requests }) }
    catch (error) { await save('probe.json', { ok: false, error: redact(String(error)), requests }); throw new Error('所选模型连接不可用；详见 probe.json，未启动场景') }
    const sampleStart = settings.sampleStart ?? 1
    for (let sample = sampleStart; sample < sampleStart + settings.samples && !stopped; sample++) for (const scenario of selected) {
      if (stopped || requests.length >= settings.maxRequests) { stopped = true; break }
      const caseId = `${scenario.id}-${sample}`, dataPath = join(settings.output, 'data', caseId)
      await mkdir(dataPath, { recursive: true })
      const emitted: { id: string; at: number; content: string; status: string }[] = [], runtimeErrors: string[] = []
      const startedAt = Date.now(), requestStart = requests.length, engine = new constructors.MastraEngine({ runTimeoutMs: 90_000 })
      const phase = <T>(name: string, ctx: EngineContext, operation: () => Promise<T>) => context.run({ caseId: scenario.id, sample, phase: name, runId: ctx.runId, agentId: ctx.agent.id }, operation)
      const observed: AgentEngine = {
        run: ctx => phase('execution', ctx, () => engine.run(ctx)),
        decide: ctx => phase('decision', ctx, () => engine.decide(ctx)),
        extractMemory: ctx => phase('memory', ctx, () => engine.extractMemory(ctx)),
        ...(engine.report ? { report: (ctx: EngineContext, draft: Parameters<NonNullable<AgentEngine['report']>>[1]) => phase('report', ctx, () => engine.report(ctx, draft)) } : {}),
        test: (value, key) => engine.test(value, key),
      }
      const service = new constructors.AppService({ dataPath, engine: observed, secrets: { get: async () => apiKey, set: async () => { throw new Error('Evaluation cannot modify credentials') }, delete: async () => { throw new Error('Evaluation cannot modify credentials') } }, emit: event => {
        if (event.type === 'runtime-error') runtimeErrors.push(event.error)
        if (event.type === 'message' && event.message.senderType === 'agent' && event.message.content.trim()) emitted.push({ id: event.message.id, at: Date.now(), content: event.message.content, status: event.message.status })
      } })
      active = service
      let conversation: Conversation | undefined, detail: ConversationDetail | undefined, error: string | undefined, sentAt = 0
      let members: DigitalAgent[] = []
      try {
        await service.init()
        const saved = await service.handle('saveConnection', { name: 'Evaluation', provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel }) as Connection
        const defaults = (await service.handle('snapshot', undefined) as Snapshot).agents
        for (let i = 0; i < scenario.members; i++) {
          const [name, role] = employees[i]
          const definition: AgentInput = { name, role, instructions: `你是${name}，负责${role}。根据用户授权和实际资料做事，与群内其他员工独立协作，不编造已经执行的操作。回复简洁、具体。`, color: '#6c7c59', connectionId: saved.id, modelId: connection.defaultModel, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
          if (defaults[i]) { definition.id = defaults[i].id }
          members.push(await service.handle('saveAgent', definition) as DigitalAgent)
        }
        conversation = await service.handle('createConversation', { kind: 'group', title: caseId, agentIds: members.map(member => member.id) }) as Conversation
        cancelActive = () => service.handle('cancelRun', { conversationId: conversation!.id })
        if (stopped) throw new Error('EVALUATION_INTERRUPTED: stopped before sending scenario')
        const send = async (content: string, suffix: string, mention = false) => service.handle('sendMessage', { conversationId: conversation!.id, content, mentionIds: mention && scenario.mention !== undefined ? [members[scenario.mention].id] : [], requestId: `${caseId}-${suffix}` })
        if (scenario.seed) { await send(scenario.seed, 'seed'); await settle(service, conversation) }
        if (stopped) throw new Error('EVALUATION_INTERRUPTED: stopped before measured input')
        sentAt = Date.now(); await send(scenario.prompt, 'measure', true)
        detail = await settle(service, conversation)
      } catch (caught) {
        error = redact(caught instanceof Error ? caught.message : String(caught))
        if (conversation) {
          await service.handle('cancelRun', { conversationId: conversation.id }).catch(() => {})
          detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
        }
      } finally { await service.close(); active = undefined; cancelActive = undefined }
      if (stopped) error ??= 'EVALUATION_INTERRUPTED: active sample cancelled and retained'
      const artifacts = []
      for (const artifact of detail?.artifacts ?? []) {
        const location = relative(dataPath, artifact.path)
        if (location.startsWith('..')) throw new Error('Evaluation artifact outside isolated directory')
        artifacts.push({ ...artifact, content: (await readFile(artifact.path, 'utf8')).slice(0, 48000) })
      }
      const primary = detail?.messages.filter(message => message.senderType === 'user').at(-1)
      const turns = detail?.turns?.filter(turn => turn.triggerMessageId === primary?.id) ?? []
      const ids = new Set(turns.map(turn => turn.id))
      const runs = detail?.runs.filter(run => run.turnId && ids.has(run.turnId)) ?? []
      const replies = detail?.messages.filter(message => message.senderType === 'agent' && message.turnId && ids.has(message.turnId) && message.status === 'completed') ?? []
      const firstVisible = emitted.find(event => event.at >= sentAt && replies.some(message => message.id === event.id))?.at
      const sumUsage = (items: typeof runs) => {
        const usage: ModelUsage = {}, known: Record<string, number> = {}
        for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) for (const run of items) if (run.usage?.[field] !== undefined) { usage[field] = (usage[field] ?? 0) + run.usage[field]!; known[field] = (known[field] ?? 0) + 1 }
        return { reported: usage, runsReportingEachField: known, totalRuns: items.length }
      }
      const measuredRequests = requests.slice(requestStart)
      const result = { caseId, criterion: scenario.criterion, prompt: scenario.prompt, seed: scenario.seed, startedAt, sentAt, elapsedMs: Date.now() - startedAt,
        metadata: { label: settings.label, revision: settings.revision, sourceHashes: settings.hashes, model: connection.defaultModel, provider: connection.provider, members: members.map(({ id, name, role, instructions }) => ({ id, name, role, instructions })), promptHash: createHash('sha256').update(scenario.prompt).digest('hex') },
        metrics: { firstVisibleReplyMs: firstVisible === undefined ? null : firstVisible - sentAt, measuredRuns: runs.length, completedReplies: replies.length, decisionRuns: runs.filter(run => run.phase === 'decision').length, providerRequestsIncludingSeed: measuredRequests.length, providerRequestsAfterInput: measuredRequests.filter(call => call.startedAt >= sentAt).length, usage: sumUsage(runs), decisionUsage: sumUsage(runs.filter(run => run.phase === 'decision')), invalidDeliveries: detail?.deliveries?.filter(delivery => delivery.status === 'failed').length ?? 0 },
        error, runtimeErrors, requests: measuredRequests, detail, artifacts, emitted, review: { status: 'pending', usefulMessageIds: [], unnecessaryMessageIds: [], missingRequiredReplies: [], taskDelivered: null, notes: 'Requires semantic review; legal pass is not a model failure.' } }
      await save(`${caseId}.json`, result); results.push({ caseId, error, metrics: result.metrics, runtimeErrors })
      await save('summary.json', { settings, scenarios: selected, model: { name: connection.name, provider: connection.provider, model: connection.defaultModel }, results, requestCount: requests.length, complete: false })
      safeLog({ caseId, requests: measuredRequests.length, replies: replies.length, failedRuns: runs.filter(run => run.status === 'failed').length, error, firstVisibleReplyMs: result.metrics.firstVisibleReplyMs })
    }
    await save('summary.json', { settings, scenarios: selected, model: { name: connection.name, provider: connection.provider, model: connection.defaultModel }, results, requestCount: requests.length, complete: !stopped, semanticReview: 'pending' })
  } finally { globalThis.fetch = originalFetch; await active?.close() }
}

async function settle(service: Service, conversation: Conversation) {
  const deadline = Date.now() + 120_000
  let stableSince = 0
  while (Date.now() < deadline) {
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    const idle = detail.turns?.every(turn => turnTerminal.has(turn.status)) && detail.runs.every(run => terminal.has(run.status)) && !detail.workItems?.some(work => ['ready', 'running'].includes(work.status))
    if (idle) { stableSince ||= Date.now(); if (Date.now() - stableSince >= 500) return detail } else stableSince = 0
    await delay(100)
  }
  throw new Error('EVALUATION_TIMEOUT: case exceeded 120 seconds; stopped and retained')
}
