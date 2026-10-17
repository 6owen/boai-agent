/*
 * [INPUT]: Explicit finite batch, installed Magpie/CLIs, isolated production automation and synthetic upstream gates.
 * [OUTPUT]: Actual mixed API budget exhaustion versus explicit user stop, native child delivery, process exits and restart evidence.
 * [POS]: M14 source integration acceptance; synthetic supplier does not certify natural model quality or desktop/package behavior.
 * [PROTOCOL]: Update Header, tests/.folder.md and Magpie ledger; preserve failures and personal HOME/CODEX_HOME/configuration.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, afterAll, expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentRun, AutomationDefinition, AutomationOccurrence, AutomationsView, BudgetModelCall, Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, WorkBudget, WorkItem } from '../src/shared/domain'
import type { RuntimePluginCatalog } from '../src/shared/plugins/runtime-catalog'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { streamText, streamTool } from './fixtures/gateway-stream'

const enabled = process.env.BOAI_MAGPIE_BUDGET_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const cases = (process.env.BOAI_MAGPIE_BUDGET_CASES ?? 'codex,pi').split(',')
const directory = resolve('.local/magpie-20261017', `budget-${batch}`)
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const collections = ['agents', 'connections', 'launchProfiles', 'conversations', 'messages', 'runs', 'turns', 'workItems', 'workExecutions', 'workBudgets', 'budgetModelCalls', 'automations', 'automationOccurrences', 'automationDispatches', 'nativeActions', 'codexSessions', 'pluginSessions', 'codexRuntime', 'pluginRuntime']
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
async function sources() {
  const files: string[] = []
  for (const root of ['src', 'tests', 'scripts']) for (const file of await readdir(root, { recursive: true })) if (/\.(ts|tsx|mjs|json)$/.test(file)) files.push(`${root}/${file}`)
  files.push('package.json', 'pnpm-lock.yaml')
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, sha(await readFile(file))])))
}
type Body = { model: string; messages: { role: string; content: unknown; tool_calls?: { function: { name: string; arguments: string } }[] }[]; tools?: { function: { name: string } }[] }
type Wire = { phase: string; model: string; stage: string; startedAt: string; closed: boolean; tools: string[]; tool?: string; held?: boolean; error?: string }
let sourceBefore: Record<string, string>, started = false
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || cases.some(name => !['codex', 'pi'].includes(name))) throw Error('Fresh batch and supported cases required')
  await mkdir(directory); started = true; sourceBefore = await sources()
  await writeFile(join(directory, 'plan.json'), JSON.stringify({ batch, cases, sourceBefore, sourceMode: 'G2b explicit connection', maxUpstreamRequestsPerCase: 24, occurrencesPerCase: 2, phaseDeadlineMs: 60000, retries: 0, budgetInjection: 'Owned SQLite transaction lowers only maxModelCalls to current reserved count after the API parent is waiting and the actual native request is held; all accounting/cause/termination use production code', scope: 'Installed isolated Magpie, actual CLI, real AppService/Work/automation; controlled supplier, no personal gateway or natural-model/desktop/package certification' }, null, 2))
})
afterAll(async () => {
  if (!started) return
  const sourceAfter = await sources(); await writeFile(join(directory, 'source-check.json'), JSON.stringify({ sourceBefore, sourceAfter, unchanged: JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter) }, null, 2)); expect(sourceAfter).toEqual(sourceBefore)
})
for (const runtime of cases) test.skipIf(!enabled)(`${runtime}: API quota stops API calls while a real native child finishes; explicit user stop exits`, async () => {
  const evidence = join(directory, runtime), dataPath = join(evidence, 'data'); await mkdir(evidence)
  const originalHome = process.env.HOME, originalCodexHome = process.env.CODEX_HOME
  const rows: Wire[] = [], errors: string[] = [], jobs = new Set<Promise<void>>(), snapshots: unknown[] = []
  const owned = new Map<number, { pid: number; parentPid: number; executable: string; phase: string }>()
  let phase = 'setup', childId = '', status = 'running', failure: string | undefined, service: AppService | undefined
  let gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, nativeRelease = () => {}
  let nativeGate = Promise.resolve(), nativeHeld = false
  const resetGates = () => { nativeHeld = false; nativeGate = new Promise<void>(done => { nativeRelease = done }) }
  const captureProcesses = async () => {
    const output = (await promisify(execFile)('/bin/ps', ['-axo', 'pid=,ppid=,comm='])).stdout
    const all = output.split('\n').flatMap(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/); return m ? [{ pid: +m[1], parentPid: +m[2], executable: m[3] }] : [] })
    const parents = new Set([process.pid]), excluded = new Set(gateway?.processes.map(row => row.pid) ?? [])
    for (let more = true; more;) { more = false; for (const row of all) if (parents.has(row.parentPid) && !parents.has(row.pid) && !excluded.has(row.pid) && row.executable !== '/bin/ps') { parents.add(row.pid); if (!owned.has(row.pid)) owned.set(row.pid, { ...row, phase }); more = true } }
  }
  const server = createServer((request, response) => {
    const job = (async () => {
      if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: ['api', `native-${runtime}`].map(id => ({ id, object: 'model', owned_by: 'budget', context_window: 131072, max_output_tokens: 8192 })) })); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw Error('Synthetic request too large') }
      const body = JSON.parse(raw) as Body
      const inputText = strings(body.messages).find(text => text.startsWith('{"protocol":"private-'))
      const input = inputText ? JSON.parse(inputText) : undefined
      const row: Wire = { phase, model: body.model, stage: input?.protocol ?? 'execution', startedAt: new Date().toISOString(), closed: false, tools: (body.tools ?? []).map(tool => tool.function.name) }; rows.push(row)
      response.once('close', () => { row.closed = true }); await captureProcesses()
      if (rows.length > 24) throw Error('Frozen experiment request cap reached')
      const text = (value: unknown) => streamText(response, 'chat', typeof value === 'string' ? value : JSON.stringify(value), 'complete', {})
      const tool = (name: string, args: object) => { expect(row.tools).toContain(name); row.tool = name; streamTool(response, 'chat', name, args, true, {}, `budget-${rows.length}`) }
      const hold = async (gate: Promise<void>) => { row.held = true; await Promise.race([gate, new Promise<void>(done => response.once('close', done))]); return !response.destroyed }
      if (body.model === 'api') {
        if (input?.protocol === 'private-memory-delta-v1') return text({ candidates: [] })
        if (input?.protocol === 'private-work-report-v1') return text({ action: 'publish', text: input.data.draft.text, outcome: input.data.draft.outcome })
        if (input?.protocol === 'private-group-interpretation-v1') return text({ mode: 'independent' })
        if (input?.protocol === 'private-participation-v2') return text(input.data.participation?.hasRespondedInTurn ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: 'budget-parent', scope: `委派${childId}交付NATIVE_RESULT=40，再读取消息`, deliverable: '核对同事实际结果' } })
        const delegated = body.messages.filter(message => message.role === 'tool').flatMap(message => { try { return [JSON.parse(strings(message.content).join(''))] } catch { return [] } }).find(value => value.id && value.ownerAgentId === childId && value.parentWorkId)
        if (!delegated) return tool('delegate_work', { key: 'native-child', ownerAgentId: childId, scope: '计算17+23并交付NATIVE_RESULT=40', deliverable: 'NATIVE_RESULT=40' })
        if (!body.messages.some(message => message.tool_calls?.some(call => call.function.name === 'wait_for_work'))) return tool('wait_for_work', { dependencies: [{ workId: delegated.id, resultVersion: 1 }], nextStep: '读取本次同事交付并核对结果' })
        return text('等待本机同事的实际结果。')
      }
      if (body.model !== `native-${runtime}`) throw Error(`Unexpected model ${body.model}`)
      const reportName = row.tools.find(name => name.endsWith('report_work'))
      if (!reportName) throw Error(`Missing native report tool: ${row.tools.join(',')}`)
      const reported = body.messages.some(message => message.tool_calls?.some(call => call.function.name === reportName))
      if (!reported) { nativeHeld = true; if (!await hold(nativeGate)) return; return tool(reportName, { disposition: 'delivered', summary: 'NATIVE_RESULT=40', evidence: [{ kind: 'answer', reference: 'NATIVE_RESULT=40' }] }) }
      return text('NATIVE_RESULT=40')
    })().catch(error => { errors.push(String(error)); response.destroy(error instanceof Error ? error : undefined) })
    jobs.add(job); void job.finally(() => jobs.delete(job))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const config = join(evidence, 'config'); await mkdir(config)
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR']) { const path = join(config, key); await mkdir(path); vi.stubEnv(key, path) }
  for (const key of ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE']) vi.stubEnv(key, undefined)
  const create = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No personal credentials') }, delete: async () => {} }, emit: () => {} })
  const records = async () => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(collections.map(async name => [name, await store.load<any>(name)]))) } finally { await store.close() } }
  const detail = async (occurrence: AutomationOccurrence) => await service!.handle('getConversation', { id: occurrence.conversationId }) as ConversationDetail
  const occurrenceNow = async (id: string) => (await service!.handle('listAutomations', undefined) as AutomationsView).occurrences.find(row => row.id === id)!
  const held = async (occurrence: AutomationOccurrence) => {
    await expect.poll(async () => { const view = await detail(occurrence); if (errors.length) throw Error(errors.join('\n')); if (view.runs.some(run => run.status === 'waiting_approval')) throw Error('Unexpected approval'); return nativeHeld && view.workItems?.some(work => work.ownerAgentId === childId && work.status === 'running') && view.workItems.some(work => work.ownerAgentId !== childId && work.status === 'waiting') }, { timeout: 60000, interval: 100 }).toBe(true)
    await captureProcesses(); expect([...owned.values()].some(row => row.phase === phase && alive(row.pid))).toBe(true)
    snapshots.push({ phase: `${phase}-held`, detail: await detail(occurrence), occurrence: await occurrenceNow(occurrence.id), records: await records(), processes: [...owned.values()] })
  }
  try {
    gateway = await isolatedMagpie(evidence, (server.address() as { port: number }).port)
    await gateway.command(['provider', 'add', 'budget', 'id=budget', `url=http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, 'key=SYNTHETIC_BUDGET_NOT_A_SECRET', `models=api,native-${runtime}`]); await gateway.start()
    service = create(); await service.init()
    const connection = await service.handle('saveConnection', { name: 'Budget boundary', provider: 'openai-compatible', baseUrl: gateway.origin, defaultModel: 'budget/api', gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
    const plugin = runtime === 'pi' ? (await service.handle('listRuntimePlugins', undefined) as RuntimePluginCatalog).plugins.find(row => row.manifest.id === 'boai.runtime.pi')! : undefined
    const draft = { name: `Budget ${runtime}`, executable: `/Users/wangwenbo/.nvm/versions/node/v24.16.0/bin/${runtime}`, args: [], protocol: runtime === 'codex' ? 'codex-app-server' : 'runtime-plugin', useExistingLogin: false, hostAccessAcknowledged: true, ...(plugin ? { runtimePlugin: { pluginId: plugin.manifest.id, providerId: runtime, packageHash: plugin.packageHash } } : {}) }
    await service.handle('testLaunchProfileDraft', draft); const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const base = { role: '核算', instructions: '按当前任务执行并提交实际结果。', color: '#123456', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, connectionId: connection.id }
    const api = await service.handle('saveAgent', { ...base, name: 'API负责人', modelId: 'budget/api' }) as DigitalAgent
    const native = await service.handle('saveAgent', { ...base, name: '本机核算员', modelId: `budget/native-${runtime}`, executionBackend: plugin ? { kind: 'runtime-plugin', profileId: profile.id, pluginId: plugin.manifest.id, providerId: runtime } : { kind: 'codex-local', profileId: profile.id }, ...(runtime === 'codex' ? { nativeOptions: { codexSandbox: 'workspace-write', codexApprovalPolicy: 'never' } } : {}) }) as DigitalAgent
    childId = native.id
    const group = await service.handle('createConversation', { kind: 'group', title: '额度边界', agentIds: [api.id, native.id] }) as Conversation
    const plan = await service.handle('saveAutomation', { name: '混合额度边界', prompt: `API负责人委派本机核算员${native.id}计算17+23并交付NATIVE_RESULT=40，随后读取消息，按实际结果核对。`, owner: { kind: 'group', conversationId: group.id }, conversationPolicy: 'new-conversation', employeeIds: group.agentIds, collaboration: { coordinatorId: api.id, assignments: [{ employeeId: native.id, instruction: '计算17+23', deliverable: 'NATIVE_RESULT=40', dependsOn: [] }, { employeeId: api.id, instruction: '委派本机员工，随后读取消息和核对结果', deliverable: '核对结果', dependsOn: [native.id] }] }, frequency: 'manual', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }) as AutomationDefinition
    phase = 'budget'; resetGates()
    const first = await service.handle('runAutomation', { id: plan.id, requestId: `${batch}-${runtime}-budget` }) as AutomationOccurrence
    await held(first); expect((await occurrenceNow(first.id)).budgetScope).toBe('mixed')
    const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
    const injection = await store.transaction(async tx => { const original = (await tx.get<WorkBudget>('workBudgets', first.budgetId!))!; expect(original.modelCalls).toBeGreaterThan(0); const next = { ...original, maxModelCalls: original.modelCalls }; await tx.put({ collection: 'workBudgets', id: next.id, value: next }); return { original, next } }); await store.close()
    snapshots.push({ phase: 'budget-cap-injected', injection }); const apiRequests = rows.filter(row => row.model === 'api').length
    const exhausted = await detail(first), parent = exhausted.workItems!.find(work => work.ownerAgentId === api.id)!, child = exhausted.workItems!.find(work => work.ownerAgentId === native.id)!
    snapshots.push({ phase: 'api-exhausted-native-held', detail: exhausted, occurrence: await occurrenceNow(first.id), records: await records(), processes: [...owned.values()].map(row => ({ ...row, alive: alive(row.pid) })) })
    expect(parent.status).toBe('waiting')
    expect(child).toMatchObject({ status: 'running', budgetPolicy: 'native', parentWorkId: parent.id, budgetId: first.budgetId })
    expect(rows.filter(row => row.model === 'api')).toHaveLength(apiRequests); expect(rows.filter(row => row.phase === 'budget' && row.model !== 'api' && row.held).every(row => !row.closed)).toBe(true)
    nativeRelease()
    await expect.poll(async () => (await detail(first)).workItems!.find(work => work.id === child.id)?.status, { timeout: 60000, interval: 100 }).toBe('delivered')
    await expect.poll(async () => (await detail(first)).runs.every(run => terminal.has(run.status)), { timeout: 15000, interval: 100 }).toBe(true)
    await expect.poll(async () => (await detail(first)).workItems!.find(work => work.id === parent.id)?.status, { timeout: 20000, interval: 100 }).not.toMatch(/^(waiting|ready|running)$/)
    const delivered = await detail(first), ledger = await records(), nativeRuns = (ledger.runs as AgentRun[]).filter(run => run.agentId === native.id)
    expect(nativeRuns.length).toBeGreaterThan(0); expect(nativeRuns.every(run => run.backend?.modelSource?.selectedModelId === `budget/native-${runtime}` && run.usage === undefined)).toBe(true)
    expect((ledger.budgetModelCalls as BudgetModelCall[]).filter(call => nativeRuns.some(run => run.id === call.runId))).toEqual([])
    expect(delivered.workItems!.find(work => work.id === parent.id)!.status).not.toBe('delivered'); expect(delivered.workItems!.find(work => work.id === parent.id)!.outcome?.summary).toMatch(/上限|预算/); expect((await occurrenceNow(first.id)).deliveryStatus).not.toBe('delivered')
    expect(delivered.messages.filter(message => delivered.workItems!.find(work => work.id === child.id)!.resultMessageIds.includes(message.id)).map(message => message.content)).toContain('NATIVE_RESULT=40')
    expect(rows.filter(row => row.model === 'api')).toHaveLength(apiRequests)
    expect(ledger.workBudgets.find((budget: WorkBudget) => budget.id === first.budgetId)).toMatchObject({ modelCalls: injection.next.modelCalls, maxModelCalls: injection.next.maxModelCalls, workItems: 1 })
    snapshots.push({ phase: 'native-delivered-api-not-delivered', detail: delivered, occurrence: await occurrenceNow(first.id), records: ledger })
    phase = 'user-stop'; resetGates()
    const second = await service.handle('runAutomation', { id: plan.id, requestId: `${batch}-${runtime}-stop` }) as AutomationOccurrence
    await held(second); const stopPids = [...owned.values()].filter(row => row.phase === phase).map(row => row.pid); expect(stopPids.length).toBeGreaterThan(0)
    await service.handle('stopAutomation', { id: second.id })
    await expect.poll(() => stopPids.every(pid => !alive(pid)), { timeout: 15000, interval: 100 }).toBe(true)
    await expect.poll(() => rows.filter(row => row.phase === 'user-stop').every(row => row.closed), { timeout: 10000, interval: 100 }).toBe(true)
    expect((await occurrenceNow(second.id)).cancellationCause).toBe('user')
    expect((await detail(second)).workItems!.every(work => work.status === 'cancelled' && work.cancellationCause === 'user')).toBe(true)
    snapshots.push({ phase: 'user-stopped', detail: await detail(second), occurrence: await occurrenceNow(second.id), stopPids, allExited: stopPids.every(pid => !alive(pid)) }); nativeRelease()
    await service.close(); const before = await records(), count = rows.length
    for (let index = 1; index <= 2; index++) { service = create(); await service.init(); await service.close(); const after = await records(); snapshots.push({ phase: `restart-${index}`, records: after, count: rows.length }); expect(rows).toHaveLength(count); const normalize = (records: Record<string, any[]>) => ({ ...records, automations: records.automations.map(({ syncedAt: _sync, ...rest }) => rest) }); expect(normalize(after)).toEqual(normalize(before)) }
    expect(errors).toEqual([]); status = 'passed'
  } catch (error) { status = 'failed'; failure = String(error); throw error }
  finally {
    await service?.close(); nativeRelease(); await gateway?.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await Promise.all(jobs)
    const processes = [...owned.values()].map(row => ({ ...row, exited: !alive(row.pid) }))
    expect(process.env.HOME).toBe(originalHome); expect(process.env.CODEX_HOME).toBe(originalCodexHome); vi.unstubAllEnvs()
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status, failure, runtime, rows, errors, snapshots, records: service ? await records() : {}, processes, allProcessesExited: processes.every(row => row.exited), activeJobs: jobs.size, allRequestsClosed: rows.every(row => row.closed), homeUnchanged: true }, null, 2))
    expect(jobs.size).toBe(0); expect(rows.every(row => row.closed)).toBe(true); expect(processes.every(row => row.exited)).toBe(true)
  }
}, 240000)
