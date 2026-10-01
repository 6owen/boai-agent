/*
 * [INPUT]: 相同场景/模型配置、基线或候选 AppService/Mastra 和临时运行目录。
 * [OUTPUT]: 普通员工与核心隔离；既有素材/事件及可选 MD-v1 真实材料到报告/修订/采用/重启证据、完整hash、共享预算/冻结校验与人工待评审报告。
 * [POS]: tests/evaluation/harness.ts，手动供应商评估；不将自动检查替代语义复核。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, relative, dirname, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { isCoreAgent } from '../../src/shared/domain/core-agent'
import type { AppService as Service } from '../../src/runtime/service'
import type { MastraEngine as Engine } from '../../src/runtime/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../src/runtime/contracts'
import type { AgentInput, Connection, Conversation, ConversationDetail, DigitalAgent, ModelUsage, Snapshot } from '../../src/shared/domain'
import { cases, employees } from './cases'
import { DATASET_VERSION, type EvaluationRecord, type ArtifactEvidence, type EventEvidence, type EventScript } from './schema'
import { scoreRecord } from './checks'
import { writeReport } from './report'
import { EvaluationBudget } from './budget'
import { validateFrozenHoldout } from './matrix'
import { executeMaterialDelivery, newMaterialDeliveryEvidence } from './material-delivery'

interface Settings { split?: string; team?: 'single' | 'multi'; budgetFile?: string; label: string; source: string; output: string; samples: number; sampleStart?: number; maxRequests: number; cases: string[]; revision: string; hashes: Record<string, string> }
interface Input { settings: Settings; connection: Connection; apiKey: string; connections?: { connection: Connection; apiKey: string }[] }
type Phase = { caseId: string; sample: number; phase: string; runId: string; agentId: string }
type Call = Phase & { startedAt: number; headersMs?: number; requestBytes: number; status?: number; error?: string }
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const turnTerminal = new Set([...terminal, 'waiting_user', 'budget_exhausted'])
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function runEvaluation(input: Input, constructors: { AppService: typeof Service; MastraEngine: typeof Engine }) {
  const { settings, connection, apiKey } = input
  const connections = input.connections ?? [{ connection, apiKey }]
  const redact = (value: string) => connections.reduce((text, item) => item.apiKey ? text.replaceAll(item.apiKey, '[REDACTED]') : text, value)
  const save = (name: string, value: unknown) => writeFile(join(settings.output, name), redact(JSON.stringify(value, null, 2)))
  const selected = settings.cases.length ? cases.filter(item => settings.cases.includes(item.id)) : cases.filter(item => !item.delivery && (item.split === (settings.split ?? 'regression') || settings.split === 'all'))
  if (settings.team === 'single' && selected.some(item => !item.comparableSingle)) throw new Error('所选协议题不能作为单人对照；请选择 comparableSingle 留出业务题')
  if (!selected.length || settings.cases.some(id => !cases.some(item => item.id === id))) throw new Error('Unknown evaluation scenario')
  if (selected.some(item => item.delivery) && (selected.length !== 1 || settings.samples !== 1 || settings.team !== 'single' || connections.length !== 1 || settings.maxRequests > selected[0].delivery!.requestLimit)) throw new Error('MD-v1 首轮仅允许单独一题、1 sample、--team single、1连接且全局请求预算不超过40')
  if (selected.some(item => item.split === 'holdout')) await validateFrozenHoldout()
  const context = new AsyncLocalStorage<Phase>(), requests: Call[] = [], caseRequests = new Map<string, number>()
  const originalFetch = globalThis.fetch
  const budget = new EvaluationBudget(settings.budgetFile ?? join(settings.output, 'request-budget.json'), settings.maxRequests)
  globalThis.fetch = async (url, options) => {
    if (requests.length >= settings.maxRequests) throw new Error('EVALUATION_BUDGET: reached provider request ceiling')
    const phase = context.getStore() ?? { caseId: 'probe', sample: 0, phase: 'connection', runId: '', agentId: '' }
    const limit = selected.find(item => item.id === phase.caseId)?.maxRequests ?? 120
    const budgetKey = `${phase.caseId}:${phase.sample}`
    if ((caseRequests.get(budgetKey) ?? 0) >= limit) throw new Error('EVALUATION_BUDGET: case ceiling')
    caseRequests.set(budgetKey, (caseRequests.get(budgetKey) ?? 0) + 1)
    await budget.reserve(phase.phase)
    const call: Call = { ...phase, startedAt: Date.now(), requestBytes: typeof options?.body === 'string' ? Buffer.byteLength(options.body) : 0 }
    requests.push(call)
    try { const response = await originalFetch(url, options); call.status = response.status; return response }
    catch (error) { call.error = redact(error instanceof Error ? error.message : String(error)); throw error }
    finally { call.headersMs = Date.now() - call.startedAt }
  }
  const results: unknown[] = [], retained: EvaluationRecord[] = []
  let active: Service | undefined, stopped = false, cancelActive: (() => Promise<unknown>) | undefined
  const interrupt = () => { stopped = true; process.exitCode = 130; void cancelActive?.().catch(() => {}) }
  process.on('SIGINT', interrupt)
  const safeLog = (value: unknown) => process.stdout.write(redact(JSON.stringify(value)) + '\n')
  try {
    // Configuration check is retained as evidence and charged to the global request ceiling.
    const probe = new constructors.MastraEngine()
    try { for (const item of connections) await probe.test(item.connection, item.apiKey); await save('probe.json', { ok: true, requests }) }
    catch (error) { await save('probe.json', { ok: false, error: redact(String(error)), requests }); throw new Error('所选模型连接不可用；详见 probe.json，未启动场景') }
    const sampleStart = settings.sampleStart ?? 1
    for (let sample = sampleStart; sample < sampleStart + settings.samples && !stopped; sample++) for (const scenario of selected) {
      if (stopped || requests.length >= settings.maxRequests) { stopped = true; break }
      const caseId = `${scenario.id}-${sample}`, dataPath = join(settings.output, 'data', caseId)
      await mkdir(dataPath, { recursive: true })
      const emitted: { id: string; at: number; content: string; status: string }[] = [], runtimeErrors: string[] = [], events: EventEvidence[] = [], phases: NonNullable<EvaluationRecord['phases']> = []
      let applyEvent: (when: EventScript['when'], tool?: string) => Promise<void> = async () => {}, pendingEvents = Promise.resolve()
      const keys = new Map<string, string>()
      const startedAt = Date.now(), requestStart = requests.length, engine = new constructors.MastraEngine({ runTimeoutMs: 90_000 })
      const phase = <T>(name: string, ctx: EngineContext, operation: () => Promise<T>) => context.run({ caseId: scenario.id, sample, phase: name, runId: ctx.runId, agentId: ctx.agent.id }, async () => {
        const entry = { phase: name, agentId: ctx.agent.id, runId: ctx.runId, startAt: Date.now(), endAt: undefined as number | undefined }; phases.push(entry)
        try { return await operation() } finally { entry.endAt = Date.now() }
      })
      const observed: AgentEngine = {
        run: ctx => phase('execution', ctx, async () => {
          const injection = scenario.events?.find(event => event.when === 'child-output' && !events.some(hit => hit.id === event.id))
          if (injection && ctx.work?.parentWorkId) {
            const hit: EventEvidence = { id: injection.id, action: injection.action, trigger: ctx.runId, at: Date.now(), status: 'applied' }; events.push(hit)
            // This is explicitly a fault-injected run, not autonomous model success.
            try {
              await engine.run({ ...ctx, onDelta: async () => {}, onWorkOutcome: async () => {} })
              await ctx.onDelta(injection.content!); await ctx.onWorkOutcome!({ disposition: 'delivered', summary: injection.content!, evidence: [{ kind: 'answer', reference: injection.content! }] })
            } catch (error) { hit.status = 'failed'; hit.error = String(error); throw error }
          } else await engine.run({ ...ctx, onTool: async event => { await ctx.onTool(event); if (event.status === 'completed') await applyEvent('tool-completed', event.name) } })
        }),
        decide: ctx => phase('decision', ctx, () => engine.decide(ctx)),
        extractMemory: ctx => phase('memory', ctx, () => engine.extractMemory(ctx)),
        ...(engine.report ? { report: (ctx: EngineContext, draft: Parameters<NonNullable<AgentEngine['report']>>[1]) => phase('report', ctx, () => engine.report(ctx, draft)) } : {}),
        test: (value, key) => engine.test(value, key),
      }
      const createService = () => new constructors.AppService({ dataPath, engine: observed, secrets: { get: async id => keys.get(id), set: async () => { throw new Error('Evaluation cannot modify credentials') }, delete: async () => { throw new Error('Evaluation cannot modify credentials') } }, emit: event => {
        if (event.type === 'runtime-error') runtimeErrors.push(event.error)
        if (event.type === 'message' && event.message.status === 'completed' && event.message.senderType === 'agent' && sentAt) pendingEvents = pendingEvents.then(() => applyEvent('public-message')).catch(error => { runtimeErrors.push(String(error)) })
        if (event.type === 'message' && event.message.senderType === 'agent' && event.message.content.trim()) emitted.push({ id: event.message.id, at: Date.now(), content: event.message.content, status: event.message.status })
      } })
      let service = createService()
      active = service
      let conversation: Conversation | undefined, detail: ConversationDetail | undefined, error: string | undefined, sentAt = 0
      let members: DigitalAgent[] = []
      const delivery = scenario.delivery ? newMaterialDeliveryEvidence(caseId, scenario.delivery) : undefined
      try {
        await service.init()
        const savedConnections: Connection[] = []
        for (const item of connections) {
          const saved = await service.handle('saveConnection', { name: `Evaluation ${savedConnections.length}`, provider: item.connection.provider, baseUrl: item.connection.baseUrl, defaultModel: item.connection.defaultModel }) as Connection
          keys.set(saved.id, item.apiKey); savedConnections.push(saved)
        }
        const defaults = (await service.handle('snapshot', undefined) as Snapshot).agents.filter(agent => !isCoreAgent(agent))
        for (let i = 0; i < (settings.team === 'single' ? 1 : scenario.members); i++) {
          const [name, role] = settings.team === 'single' ? ['综合员工', '独立完成资料读取、计算、复核与交付'] : (scenario.roles ?? employees)[i]
          const saved = savedConnections[i % savedConnections.length]
          const definition: AgentInput = { name, role, instructions: `你是${name}，负责${role}。根据用户授权和实际资料做事，与群内其他员工独立协作，不编造已经执行的操作。回复简洁、具体。`, color: '#6c7c59', connectionId: saved.id, modelId: saved.defaultModel, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
          if (defaults[i]) { definition.id = defaults[i].id }
          members.push(await service.handle('saveAgent', definition) as DigitalAgent)
        }
        conversation = await service.handle('createConversation', { kind: 'group', title: caseId, agentIds: members.map(member => member.id) }) as Conversation
        cancelActive = () => service.handle('cancelRun', { conversationId: conversation!.id })
        for (const member of members) for (const file of scenario.files ?? []) {
          if (isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) throw new Error('Fixture path must stay in the isolated employee workspace')
          const path = join(dataPath, member.workspaceRef!, 'sessions', conversation.id, 'work', file.path)
          await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.content)
        }
        applyEvent = async (when, tool) => {
          for (const event of scenario.events ?? []) {
            if (event.when !== when || (event.tool && event.tool !== tool) || events.some(hit => hit.id === event.id)) continue
            const hit: EventEvidence = { id: event.id, action: event.action, at: Date.now(), trigger: tool ?? when, status: 'applied' }; events.push(hit)
            try {
              if (event.action === 'user-message') await service.handle('sendMessage', { conversationId: conversation!.id, content: event.content!, mentionIds: [], requestId: `${caseId}-${event.id}` })
              else if (event.action === 'cancel') await cancelActive!()
              else if (event.action === 'remove-member') await service.handle('createConversation', { id: conversation!.id, kind: conversation!.kind, title: conversation!.title, agentIds: conversation!.agentIds.filter(id => id !== members[event.member!].id) })
            } catch (error) { hit.status = 'failed'; hit.error = String(error); throw error }
          }
        }
        if (stopped) throw new Error('EVALUATION_INTERRUPTED: stopped before sending scenario')
        const send = async (content: string, suffix: string, mention = false) => service.handle('sendMessage', { conversationId: conversation!.id, content, mentionIds: mention && scenario.mention !== undefined ? [members[scenario.mention].id] : [], requestId: `${caseId}-${suffix}` })
        if (scenario.seed) { await send(scenario.seed, 'seed'); await settle(service, conversation) }
        if (stopped) throw new Error('EVALUATION_INTERRUPTED: stopped before measured input')
        if (scenario.delivery && delivery) {
          detail = await executeMaterialDelivery({ service: () => service, dataPath, conversation, member: members[0], caseId, scenario: { ...scenario, delivery: scenario.delivery }, evidence: delivery,
            onSent: () => { sentAt = Date.now() }, requests: () => requests.length,
            settle: () => settle(service, conversation!, scenario.timeoutMs, () => pendingEvents),
            restart: async () => { await service.close(); service = createService(); active = service; await service.init() },
          })
        } else {
          sentAt = Date.now(); await send(scenario.prompt, 'measure', true)
          detail = await settle(service, conversation, scenario.timeoutMs, () => pendingEvents)
        }
      } catch (caught) {
        error = redact(caught instanceof Error ? caught.message : String(caught))
        if (conversation) {
          await service.handle('cancelRun', { conversationId: conversation.id }).catch(() => {})
          detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
        }
      } finally { await service.close(); active = undefined; cancelActive = undefined }
      if (stopped) error ??= 'EVALUATION_INTERRUPTED: active sample cancelled and retained'
      const artifacts: ArtifactEvidence[] = []
      for (const artifact of detail?.artifacts ?? []) {
        try {
        const location = relative(await realpath(dataPath), await realpath(artifact.path))
        if (location.startsWith('..')) throw new Error('Evaluation artifact outside isolated directory')
        const bytes = await readFile(artifact.path)
        artifacts.push({ ...artifact, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), complete: bytes.length <= 8 * 1024 * 1024, ...(bytes.length <= 8 * 1024 * 1024 ? { content: bytes.toString('utf8') } : { captureError: '产物超过8MiB留证上限，保留原文件/hash并标记不可完整评分' }) })
        } catch (error) { artifacts.push({ ...artifact, complete: false, captureError: redact(String(error)) }) }
      }
      const primary = detail?.messages.find(message => message.senderType === 'user' && Date.parse(message.createdAt) >= sentAt)
      const turns = detail?.turns?.filter(turn => primary && Date.parse(turn.createdAt) >= Date.parse(primary.createdAt)) ?? []
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
      const result: EvaluationRecord = { caseId, scenario, datasetVersion: DATASET_VERSION, events, phases, criterion: scenario.criterion, prompt: scenario.prompt, seed: scenario.seed, startedAt, sentAt, elapsedMs: Date.now() - (sentAt || startedAt),
        metadata: { label: settings.label, revision: settings.revision, sourceHashes: settings.hashes, datasetHash: createHash('sha256').update(JSON.stringify({ version: DATASET_VERSION, scenario })).digest('hex'), team: settings.team ?? 'multi', requestLimit: settings.maxRequests, modelSignature: createHash('sha256').update(JSON.stringify(connections.map(({ connection: item }) => ({ provider: item.provider, baseUrl: item.baseUrl, model: item.defaultModel })))).digest('hex'), model: connections.map(item => item.connection.defaultModel).join(' + '), provider: connection.provider, members: members.map(({ id, name, role, instructions }) => ({ id, name, role, instructions })), promptHash: createHash('sha256').update(scenario.prompt).digest('hex') },
        metrics: { firstVisibleReplyMs: firstVisible === undefined ? null : firstVisible - sentAt, measuredRuns: runs.length, completedReplies: replies.length, decisionRuns: runs.filter(run => run.phase === 'decision').length, providerRequestsIncludingSeed: measuredRequests.length, providerRequestsAfterInput: measuredRequests.filter(call => call.startedAt >= sentAt).length, usage: sumUsage(runs), decisionUsage: sumUsage(runs.filter(run => run.phase === 'decision')), invalidDeliveries: detail?.deliveries?.filter(delivery => delivery.status === 'failed').length ?? 0 },
        error, runtimeErrors, requests: measuredRequests, detail, artifacts, emitted, ...(delivery ? { delivery } : {}) }
      await save(`${caseId}.json`, result); retained.push(JSON.parse(redact(JSON.stringify(result))) as EvaluationRecord); results.push({ caseId, error, metrics: result.metrics, runtimeErrors })
      await save('summary.json', { settings, scenarios: selected, model: { name: connection.name, provider: connection.provider, model: connection.defaultModel }, results, requestCount: requests.length, complete: false })
      safeLog({ caseId, requests: measuredRequests.length, replies: replies.length, failedRuns: runs.filter(run => run.status === 'failed').length, error, firstVisibleReplyMs: result.metrics!.firstVisibleReplyMs })
    }
    await save('summary.json', { settings, scenarios: selected, model: { name: connection.name, provider: connection.provider, model: connection.defaultModel }, results, requestCount: requests.length, complete: !stopped, semanticReview: 'pending' })
  } finally { process.removeListener('SIGINT', interrupt); globalThis.fetch = originalFetch; await active?.close(); await writeReport(join(settings.output, 'report'), retained.map(record => ({ record, score: scoreRecord(record, record.scenario!) }))) }
}

async function settle(service: Service, conversation: Conversation, timeoutMs = 120_000, pending?: () => Promise<void>) {
  const deadline = Date.now() + timeoutMs
  let stableSince = 0
  while (Date.now() < deadline) {
    await pending?.()
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    const idle = detail.turns?.every(turn => turnTerminal.has(turn.status)) && detail.runs.every(run => terminal.has(run.status)) && !detail.workItems?.some(work => ['ready', 'running'].includes(work.status))
    if (idle) { stableSince ||= Date.now(); if (Date.now() - stableSince >= 500) return detail } else stableSince = 0
    await delay(100)
  }
  throw new Error('EVALUATION_TIMEOUT: case exceeded its registered deadline; stopped and retained')
}
