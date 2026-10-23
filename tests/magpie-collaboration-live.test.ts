/*
 * [INPUT]: Explicit finite real-model batch, installed Magpie and optional installed native runtimes; isolated BOAI data/configuration.
 * [OUTPUT]: Real bobo organization, model-created paused group automation, actual employee dependencies, owned process exits and two service restarts without replay.
 * [POS]: Source business acceptance for API/native mixtures and opt-in actual Mastra clock; Electron/package certification remains separate.
 * [PROTOCOL]: Update Header, tests/.folder.md and Magpie ledger; retain failures and never change personal HOME, CODEX_HOME or gateway settings.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { TABLE_SCHEDULE_TRIGGERS } from '@mastra/core/storage'
import { expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentRun, AutomationDefinition, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message, Snapshot, WorkItem } from '../src/shared/domain'
import type { NativeAction } from '../src/shared/domain/execution'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'

const enabled = process.env.BOAI_MAGPIE_COLLABORATION_REAL === '1'
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const collections = ['agents', 'connections', 'launchProfiles', 'conversations', 'messages', 'messageReceipts', 'runs', 'turns', 'workItems', 'workExecutions', 'workBudgets', 'budgetModelCalls', 'boboCollaborations', 'automations', 'automationOccurrences', 'automationDispatches', 'nativeActions', 'codexSessions', 'claudeSessions', 'pluginSessions', 'codexRuntime', 'claudeRuntime', 'pluginRuntime']
async function sources() {
  const files = (await readdir('src', { recursive: true })).filter(path => /\.(ts|tsx|json)$/.test(path)).map(path => `src/${path}`)
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-collaboration-live.test.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async path => [path, sha(await readFile(path))])))
}

test.skipIf(!enabled)('real Magpie organization and group automation retain actual employee results across API/native execution', async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH ?? '', mode = process.env.BOAI_MAGPIE_COLLABORATION_MODE ?? 'api'
  const trigger = process.env.BOAI_MAGPIE_COLLABORATION_TRIGGER ?? 'manual'
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || !['api', 'codex-claude', 'pi-opencode'].includes(mode) || !['manual', 'clock'].includes(trigger)) throw Error('Fresh batch and supported mode/trigger required')
  const directory = resolve('.local/magpie-20261017', `collaboration-${batch}`), dataPath = join(directory, 'data'), selected = 'deepseek/deepseek-flash'
  await mkdir(directory)
  const sourceBefore = await sources(), originalHome = process.env.HOME, originalCodexHome = process.env.CODEX_HOME
  const hello = await fetch('http://127.0.0.1:3425/api/hello', { signal: AbortSignal.timeout(5000) }).then(response => response.json())
  expect(hello).toMatchObject({ name: 'magpie', version: '0.1.1277' })
  const tasks = [
    '请现在复用现有研究员，只新增一名独立员工“成本采集员”，建立一个包含你、研究员和成本采集员的独立经营核算群，并说明分工。研究员负责销售计算，成本采集员负责成本计算，你负责等待二人的实际结果后汇总。本消息只组织，不执行核算。请实际使用组织工具完成。',
    '请只由bobo用manage_automation创建归属当前群的暂停计划“Magpie经营核算”：每天09:00，Asia/Singapore，每次独立任务上下文，关闭通知，enabled=false。研究员计算17+23并交付销售数值；成本采集员计算5+7并交付成本数值；bobo为负责人，必须用delegate_work分别委派两人，再用wait_for_work等待本次真实结果，然后计算销售减成本并用report_work交付。两名采集员没有依赖，bobo依赖二人。现在只保存计划，不运行。所有必要配置已给出。',
  ]
  await writeFile(join(directory, 'plan.json'), JSON.stringify({ batch, mode, trigger, sourceBefore, version: hello.version, selected, tasks, userMessages: 2, manualOccurrences: trigger === 'manual' ? 1 : 0, scheduledOccurrences: trigger === 'clock' ? 1 : 0, restarts: 2, maxForwardedInferenceRequests: 60, observationDeadlinePerPhaseMs: 180000, retries: 0, sourceMode: 'BOAI explicit connection', apiBudget: 'original', nativeBudget: 'none', scope: 'real model/source business; separate actual clock or manual trigger, no Electron/package or natural failure certification' }, null, 2))
  const requests: { path: string; phase: string; startedAt: string; model?: string; status?: number; actualModel?: string | null; actualProvider?: string | null; closed: boolean; forwarded?: boolean; error?: string }[] = []
  const jobs = new Set<Promise<void>>(), snapshots: unknown[] = [], profiles: LaunchProfile[] = [], approvals: { actionId: string; method: string; runId: string }[] = []
  const ownedProcesses = new Map<number, { pid: number; parentPid: number; executable: string; observedAt: string }>()
  const captureProcesses = async () => {
    const output = (await promisify(execFile)('/bin/ps', ['-axo', 'pid=,ppid=,comm='])).stdout
    const rows = output.split('\n').flatMap(line => { const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return match ? [{ pid: Number(match[1]), parentPid: Number(match[2]), executable: match[3] }] : [] })
    const owned = new Set([process.pid])
    for (let changed = true; changed;) {
      changed = false
      for (const row of rows) if (owned.has(row.parentPid) && !owned.has(row.pid) && row.executable !== '/bin/ps') { owned.add(row.pid); ownedProcesses.set(row.pid, { ...row, observedAt: ownedProcesses.get(row.pid)?.observedAt ?? new Date().toISOString() }); changed = true }
    }
  }
  const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
  let phase = 'setup', forwarded = 0, status = 'running', failure: string | undefined, service: AppService | undefined
  const proxy = createServer((request, response) => {
    const job = (async () => {
      if (!request.url || !/^\/(api\/hello|v1\/(models|codex\/models|chat\/completions|responses|messages(?:\/count_tokens)?))(?:\?|$)/.test(request.url)) { response.writeHead(404); response.end(); return }
      let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 4_000_000) throw Error('Experiment input too large') }
      const inference = request.method === 'POST' && /^\/v1\/(chat\/completions|responses|messages)(?:\?|$)/.test(request.url)
      const body = raw ? JSON.parse(raw) : undefined
      const row: typeof requests[number] = { phase, path: request.url, startedAt: new Date().toISOString(), closed: false, ...(inference ? { model: body.model } : {}) }
      const abort = new AbortController()
      response.once('close', () => { row.closed = true; if (!response.writableEnded) abort.abort() })
      if (inference) { requests.push(row); if (forwarded >= 60) { row.error = 'Frozen experiment request cap'; response.writeHead(429); response.end(); return }; forwarded++; row.forwarded = true; await captureProcesses() }
      try {
        const headers = new Headers()
        for (const key of ['content-type', 'authorization', 'x-api-key', 'anthropic-version', 'anthropic-beta', 'user-agent', 'openai-beta']) if (typeof request.headers[key] === 'string') headers.set(key, request.headers[key] as string)
        const result = await fetch(`http://127.0.0.1:3425${request.url}`, { method: request.method, headers, ...(raw ? { body: raw } : {}), signal: abort.signal })
        row.status = result.status; row.actualModel = result.headers.get('x-magpie-model'); row.actualProvider = result.headers.get('x-magpie-provider')
        const outgoing: Record<string, string> = { 'content-type': result.headers.get('content-type') ?? 'application/json' }
        for (const key of ['x-magpie-model', 'x-magpie-provider']) if (result.headers.has(key)) outgoing[key] = result.headers.get(key)!
        response.writeHead(result.status, outgoing)
        if (result.body) for await (const chunk of result.body) response.write(chunk)
        response.end()
      } catch (error) { row.error = abort.signal.aborted ? 'cancelled' : String(error); if (!response.headersSent) response.writeHead(502); response.end() }
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end() })
    jobs.add(job); void job.finally(() => jobs.delete(job))
  })
  await new Promise<void>(done => proxy.listen(0, '127.0.0.1', done))
  const endpoint = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
  const config = join(directory, 'native-config')
  await mkdir(config)
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR']) {
    const path = join(config, key); await mkdir(path); vi.stubEnv(key, path)
  }
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE', 'OPENCODE_CONFIG']) vi.stubEnv(key, undefined)
  vi.stubEnv('OPENCODE_CONFIG_CONTENT', '{}'); vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  const make = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No personal credential expected') }, delete: async () => {} }, emit: () => {} })
  const records = async () => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(collections.map(async name => [name, await store.load<any>(name)]))) } finally { await store.close() } }
  const clockTriggers = async (scheduleId: string) => {
    const client = createClient({ url: pathToFileURL(join(dataPath, 'automation-mastra.sqlite')).href, concurrency: 1 })
    try {
      await client.execute('PRAGMA query_only=ON')
      const result = await client.execute({ sql: `SELECT id,schedule_id,run_id,scheduled_fire_at,actual_fire_at,outcome FROM "${TABLE_SCHEDULE_TRIGGERS}" WHERE schedule_id=? ORDER BY actual_fire_at,id`, args: [scheduleId] })
      return result.rows.map(row => ({ id: String(row.id), scheduleId: String(row.schedule_id), runId: row.run_id === null ? null : String(row.run_id), scheduledFireAt: Number(row.scheduled_fire_at), actualFireAt: Number(row.actual_fire_at), outcome: String(row.outcome) }))
    } finally { client.close() }
  }
  const detail = async (id: string) => await service!.handle('getConversation', { id }) as ConversationDetail
  const approve = async (view: ConversationDetail) => {
    for (const run of view.runs.filter(run => run.status === 'waiting_approval')) {
      const actions = await service!.handle('listNativeActions', { conversationId: view.conversation.id, runId: run.id }) as NativeAction[]
      for (const action of actions.filter(action => action.status === 'pending')) {
        if (action.kind !== 'approval' || !/^mcp__boai__(report_work|delegate_work|wait_for_work|read_messages|send_message)$/.test(action.method) || approvals.some(row => row.actionId === action.id)) throw Error(`Unexpected native action: ${action.method}`)
        approvals.push({ actionId: action.id, method: action.method, runId: run.id })
        await service!.handle('respondNativeAction', { conversationId: view.conversation.id, runId: run.id, actionId: action.id, response: { option: run.backend?.kind === 'codex-local' ? 'accept' : 'allow' } })
      }
    }
  }
  const settle = async (conversationId: string, messageId: string) => {
    let view: ConversationDetail | undefined
    await expect.poll(async () => { view = await detail(conversationId); await approve(view); return view.runs.some(run => run.triggerMessageId === messageId) && view.runs.every(run => terminal.has(run.status)) && !!view.turns?.some(turn => turn.triggerMessageId === messageId) && view.turns.every(turn => terminal.has(turn.status)) }, { timeout: 180000, interval: 150 }).toBe(true)
    snapshots.push({ phase, detail: view }); expect(view!.runs.every(run => run.status === 'completed')).toBe(true); return view!
  }
  const save = async (agent: DigitalAgent, change: Record<string, unknown> = {}) => {
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _created, ...input } = agent
    return await service!.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, ...change }) as DigitalAgent
  }
  try {
    service = make(); await service.init()
    const connection = await service.handle('saveConnection', { name: 'Magpie business', provider: 'openai-compatible', baseUrl: endpoint, defaultModel: selected, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
    await service.handle('getConnectionModelCatalog', { id: connection.id, baseUrl: endpoint, gateway: connection.gateway, expectedRevision: connection.revision })
    const initial = await service.handle('snapshot', undefined) as Snapshot
    for (const agent of initial.agents.filter(agent => ['bobo', 'researcher'].includes(agent.id))) await save(agent, { connectionId: connection.id, modelId: selected, thinkingLevel: 'none' })
    phase = 'organization'
    const core = await service.handle('startCoreConversation', { requestId: `${batch}-organize`, content: tasks[0] }) as Conversation
    const original = (await detail(core.id)).messages.find(message => message.senderType === 'user')!
    const organized = await settle(core.id, original.id), state = await records()
    expect(state.boboCollaborations).toHaveLength(1); expect(state.boboCollaborations[0].status).toBe('committed')
    expect(organized.workItems).toHaveLength(1); expect(organized.workItems![0].status).toBe('delivered')
    const group = (state.conversations as Conversation[]).find(chat => chat.id === state.boboCollaborations[0].groupConversationId)!
    expect(group.agentIds).toHaveLength(3); expect(group.agentIds).toContain('bobo'); expect(group.agentIds).toContain('researcher')
    const collectorId = group.agentIds.find(id => !['bobo', 'researcher'].includes(id))!
    expect((state.agents as DigitalAgent[]).find(agent => agent.id === collectorId)?.name).toBe('成本采集员')
    expect((await detail(group.id)).workItems).toEqual([])
    const runtimes = mode === 'api' ? ['api', 'api'] : mode.split('-')
    const catalog = await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog
    for (const [index, agentId] of ['researcher', collectorId].entries()) {
      const runtime = runtimes[index], agent = (state.agents as DigitalAgent[]).find(agent => agent.id === agentId)!
      if (runtime === 'api') { await save(agent, { connectionId: connection.id, modelId: selected, thinkingLevel: 'none' }); continue }
      const plugin = catalog.plugins.find(plugin => plugin.manifest.id === `boai.runtime.${runtime}`)
      const executable = runtime === 'opencode' ? resolve('.local/magpie-20261017/opencode-tool/node_modules/opencode-ai/bin/opencode.exe') : `/Users/wangwenbo/.nvm/versions/node/v24.16.0/bin/${runtime}`
      const draft = { name: `Magpie business ${runtime}`, executable, args: [], protocol: runtime === 'codex' ? 'codex-app-server' : runtime === 'claude' ? 'claude-cli' : 'runtime-plugin', useExistingLogin: false, hostAccessAcknowledged: true, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: runtime, packageHash: plugin.packageHash } } : {}) }
      await service.handle('testLaunchProfileDraft', draft); const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile; profiles.push(profile)
      await save(agent, { connectionId: connection.id, modelId: '', executionBackend: plugin ? { kind: 'runtime-plugin', profileId: profile.id, pluginId: plugin.manifest.id, providerId: runtime } : { kind: runtime === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, nativeOptions: runtime === 'codex' ? { codexSandbox: 'workspace-write', codexApprovalPolicy: 'never' } : runtime === 'claude' ? { claudePermissionMode: 'acceptEdits' } : {}, thinkingLevel: 'auto' })
    }
    phase = 'create-plan'
    const message = await service.handle('sendMessage', { conversationId: group.id, requestId: `${batch}-plan`, mentionIds: ['bobo'], content: tasks[1] }) as Message
    await settle(group.id, message.id)
    const plans = await service.handle('listAutomations', undefined) as AutomationsView
    expect(plans.definitions).toHaveLength(1); expect(plans.occurrences).toHaveLength(0)
    let plan: AutomationDefinition = plans.definitions[0]
    expect(plan).toMatchObject({ enabled: false, time: '09:00', timezone: 'Asia/Singapore', conversationPolicy: 'new-conversation', owner: { kind: 'group', conversationId: group.id }, collaboration: { coordinatorId: 'bobo' } })
    expect(plan.employeeIds?.slice().sort()).toEqual(group.agentIds.slice().sort())
    let occurrence!: AutomationOccurrence
    if (trigger === 'clock') {
      phase = 'clock-wait'
      const due = new Date(Math.ceil((Date.now() + 65000) / 60000) * 60000)
      plan = await service.handle('saveAutomation', { id: plan.id, expectedRevision: plan.revision, requestId: `${batch}-schedule`, name: plan.name, description: plan.description, prompt: plan.prompt, owner: plan.owner, collaboration: plan.collaboration, conversationPolicy: plan.conversationPolicy, employeeIds: plan.employeeIds, frequency: 'daily', time: due.toISOString().slice(11, 16), weekday: plan.weekday, timezone: 'UTC', enabled: true, notify: false, notificationPolicy: 'muted' }) as AutomationDefinition
      expect(plan.sync).toBe('synced'); expect(plan.scheduleId).toBeTruthy(); expect(await clockTriggers(plan.scheduleId!)).toEqual([])
      snapshots.push({ phase, plan, due: due.toISOString(), manualRunActionUsed: false, clockOrLedgerSeeded: false })
      await expect.poll(async () => { const view = await service!.handle('listAutomations', undefined) as AutomationsView; occurrence = view.occurrences.find(row => row.automationId === plan.id)!; return !!occurrence }, { timeout: 160000, interval: 500 }).toBe(true)
      expect(occurrence!).toMatchObject({ source: 'schedule', automationId: plan.id, revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduledFor: due.toISOString() })
      expect(occurrence!.nativeRunId).toBeTruthy()
      await service.handle('pauseAutomation', { id: plan.id })
      snapshots.push({ phase: 'clock-admitted', occurrence: occurrence!, triggers: await clockTriggers(plan.scheduleId!) })
    } else occurrence = await service.handle('runAutomation', { id: plan.id, requestId: `${batch}-once` }) as AutomationOccurrence
    phase = `${trigger}-run`
    await expect.poll(async () => { await approve(await detail(occurrence.conversationId)); occurrence = (await service!.handle('listAutomations', undefined) as AutomationsView).occurrences.find(item => item.id === occurrence.id)!; return !!occurrence.finishedAt }, { timeout: 180000, interval: 150 }).toBe(true)
    const executed = await detail(occurrence.conversationId); snapshots.push({ phase, plan, occurrence, detail: executed })
    expect(occurrence).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
    const works = executed.workItems!; expect(works).toHaveLength(3); expect(works.every(work => work.status === 'delivered')).toBe(true)
    const parent = works.find(work => work.ownerAgentId === 'bobo')!
    expect(parent.requiredResults).toHaveLength(2); expect(works.filter(work => work.parentWorkId === parent.id)).toHaveLength(2)
    expect(executed.messages.filter(message => parent.resultMessageIds.includes(message.id)).map(message => message.content).join('\n')).toMatch(/(?:^|\D)28(?:\D|$)/)
    for (const work of works.filter(work => work.parentWorkId === parent.id)) {
      const expected = work.ownerAgentId === 'researcher' ? 40 : 12
      expect(executed.messages.filter(message => work.resultMessageIds.includes(message.id)).map(message => message.content).join('\n')).toContain(String(expected))
      expect(parent.requiredResults).toContainEqual({ workId: work.id, resultVersion: work.resultVersion })
      expect(work.budgetId).toBe(parent.budgetId)
      if (mode !== 'api') { const nativeWorkRuns = executed.runs.filter(run => run.workId === work.id); expect(nativeWorkRuns.length).toBeGreaterThan(0); expect(work.budgetPolicy).toBe('native'); expect(nativeWorkRuns.every(run => run.usage === undefined)).toBe(true) }
    }
    if (trigger === 'manual') expect((await service.handle('runAutomation', { id: plan.id, requestId: `${batch}-once` }) as AutomationOccurrence).id).toBe(occurrence.id)
    else {
      const triggers = await clockTriggers(plan.scheduleId!); expect(triggers).toHaveLength(1); expect(triggers[0].runId).toBe(occurrence.nativeRunId)
      snapshots.push({ phase: 'clock-completed', triggers })
    }
    await service.close(); await expect.poll(() => [...ownedProcesses.keys()].every(pid => !alive(pid)), { timeout: 10000 }).toBe(true); const before = await records(), count = forwarded
    const business = (value: typeof before) => ({ ...value, automations: value.automations.map((definition: AutomationDefinition) => { const { syncedAt: _sync, ...rest } = definition; return rest }) })
    phase = 'restart'
    for (let index = 0; index < 2; index++) { service = make(); await service.init(); const after = await records(); snapshots.push({ phase, index, before, after }); expect(business(after)).toEqual(business(before)); expect(forwarded).toBe(count); await service.close() }
    expect(requests.filter(row => row.forwarded).every(row => row.status === 200 && row.model === selected && row.actualModel === selected)).toBe(true)
    const calls = (before.runs as AgentRun[]).filter(run => !run.backend).flatMap(run => run.modelCalls ?? [])
    expect(calls.length).toBeGreaterThan(0)
    if (mode === 'api') expect(calls).toHaveLength(forwarded)
    expect(calls.every(call => call.route?.actualModelId === selected)).toBe(true)
    if (mode !== 'api') {
      const nativeRuns = (before.runs as AgentRun[]).filter(run => !!run.backend)
      expect(nativeRuns.length).toBeGreaterThan(1); expect(nativeRuns.every(run => run.backend?.modelSource?.selectedModelId === selected)).toBe(true)
      const nativeWorks = (before.workItems as WorkItem[]).filter(work => work.origin && work.ownerAgentId !== 'bobo')
      expect(nativeWorks).toHaveLength(2); expect(nativeWorks.every(work => work.budgetPolicy === 'native')).toBe(true)
      expect(ownedProcesses.size).toBeGreaterThan(0)
    }
    expect(await sources()).toEqual(sourceBefore); status = 'passed'
  } catch (error) { status = 'failed'; failure = String(error); throw error }
  finally {
    await service?.close(); proxy.closeAllConnections(); await new Promise<void>(done => proxy.close(() => done())); await Promise.all(jobs)
    expect(process.env.HOME).toBe(originalHome); expect(process.env.CODEX_HOME).toBe(originalCodexHome); vi.unstubAllEnvs()
    const processes = [...ownedProcesses.values()].map(row => ({ ...row, exited: !alive(row.pid) }))
    await writeFile(join(directory, 'result.json'), JSON.stringify({ batch, mode, trigger, status, failure, sourceBefore, sourceAfter: await sources(), requests, forwarded, profiles, approvals, snapshots, records: await records(), processes, allProcessesExited: processes.every(row => row.exited), closedAt: new Date().toISOString(), activeJobs: jobs.size, allRequestsClosed: requests.every(row => row.closed), personalHomeChanged: false }, null, 2))
    expect(jobs.size).toBe(0); expect(requests.every(row => row.closed)).toBe(true)
    expect(processes.every(row => row.exited)).toBe(true)
  }
}, 570000)
