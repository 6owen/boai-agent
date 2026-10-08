/*
 * [OUTPUT]: 实际隔离进程核对系统代理启动/新建/恢复双作用域，原禁用工具/只读/审批/空环境及模型/无重试控制保持。
 * [OUTPUT]: 原生传输回退Trace只保留当前已提交线程的固定类别与有界时间；提交前/未知/错线程/迟到/超限和敏感串均不扩业务重试权。
 * [OUTPUT]: 首次Work前的原问题/失败追加按实际continuation接续，普通继续无关联；原请求/预算、单次文件与重启不重放。
 * [OUTPUT]: 混合群分工双方在各自已交付工作后恰有一次同账记忆调用，接续不遗失负责人或子员工维护。
 * [OUTPUT]: 协议错配按精确运行方式拒绝，兼容Claude新增协议； 策略v3逐项拒绝原生审批且维持只读/无环境，动态宿主命令仍按真实允许/拒绝及单次效果验收。
 * [OUTPUT]: 旧缺省ACP程序/显式报告/人工文件发布跨重启后切换本机，原无Work/未知用量和回执保持。
 * [OUTPUT]: 同员工API/本机切换保留业务身份且新建原生session；运行/实际退出/取消待核对三阶段拒绝换绑。
 * [OUTPUT]: 本机自动化无API交付、原问题/到期追加、混合员工同账、停止重启和配置失效均走生产服务；到期模块为明确故障注入。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: Codex资源/来源与真实Work交付；判断/执行/交付后记忆共原预算，等待工作不额外维护，真实工具失败保留原因。
 * [OUTPUT]: 实际协议输入验证续聊只补充新消息/图片；旧回复仅关联原身份，撤权后新会话重新核读。
 * [OUTPUT]: 本机备份排除原生私有目录、标记原生会话失效；原址/异址/旧备份恢复不调用协议，显式新消息新建会话，业务原件保留。
 * [OUTPUT]: 验证原Work交付/修订新根/明确补充与重启不重放、外部计量、工具去重、实际退出和命令审批。
 * [OUTPUT]: 真实批准命令取消期间持有排他执行资源，父子退出后新任务进入；重启保留待核对原工作且不重放。
 * [OUTPUT]: 实际chat协议携带当前Work与任务阶段能力，避免阶段无工具被解释为员工不能交付。
 * [INPUT]: 隔离Codex协议进程、受管启动配置和取消/故障场景。
 * [OUTPUT]: 外部阶段Trace区分真实协议等待与宿主回调堵塞；敏感正文不进入诊断，观测失败不重发或改变结果。
 * [OUTPUT]: 无工具策略、Unicode流、真实终态、未知不重试、取消退出及原生用量合同测试。
 * [POS]: tests模块验收；真实CLI/模型验收另外留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inspectProgram } from '../src/runtime/modules/backends/program'
import { runCodexPhase, testCodexConnection, type CodexPhaseDiagnostic } from '../src/runtime/adapters/codex/turn'
import { observeCodexPhase } from '../src/runtime/adapters/codex/trace'
import type { TraceSpan } from '../src/shared/domain/traces'
import type { LaunchProfile } from '../src/shared/domain/backends'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentHome, AutomationDefinition, AutomationOccurrence, ArtifactVersion, BudgetModelCall, Conversation, ConversationDetail, ConversationMaterial, DigitalAgent, InboxPage, MemoryEntry, Message, Resource, Snapshot, WorkBudget, WorkItem } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(mode = '') {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'boai-codex-protocol-'))); roots.push(cwd)
  if (mode) await writeFile(join(cwd, 'fixture-mode'), mode)
  const file = inspectProgram(resolve('tests/fixtures/codex-app-server.mjs'))
  const profile: LaunchProfile = { id: 'codex-profile', name: 'Codex', protocol: 'codex-app-server', executable: file.path, executableHash: file.hash, runtime: 'node', args: [], revision: 1, useExistingLogin: false, hostAccessAcknowledged: true }
  const signal = new AbortController().signal
  const base = { profile, cwd, privateHome: join(cwd, 'private-home'), signal }
  const verified = await testCodexConnection(base)
  return { ...base, profile: { ...profile, verified }, instructions: 'Only this employee identity.', prompt: '你好', timeoutMs: 3000 }
}

it('tests a real session without sending inference and never presents saved login as verified authentication', async () => {
  const input = await fixture()
  await expect(readFile(join(input.cwd, 'turn-input.json'))).rejects.toThrow()
  expect(input.profile.verified).toMatchObject({ name: 'Codex', version: '0.159.3', protocolVersion: 2 })
  await expect(fixture('login-missing')).rejects.toThrow('需要登录')
  await expect(fixture('unknown-version')).rejects.toThrow('尚未通过')
})

it('uses actual no-environment/tool controls and preserves split UTF-8, current turn usage and resume identity', async () => {
  const input = await fixture(), chunks: string[] = [], identities: string[] = []
  const result = await runCodexPhase({ ...input, threadId: 'employee-a-chat-1', onSession: async id => { identities.push(id) }, onDelta: async text => { chunks.push(text) } })
  expect(result.text).toBe('员工回复：你好🌱')
  expect(chunks.join('')).toBe(result.text)
  expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 4, totalTokens: 9 })
  expect(identities).toEqual(['employee-a-chat-1'])
  const config = JSON.parse(await readFile(join(input.cwd, 'thread-config.json'), 'utf8'))
  expect(config.config).not.toHaveProperty('model_providers.openai.request_max_retries')
  expect(config).toMatchObject({ environments: [], sandbox: 'read-only', approvalPolicy: { granular: { sandbox_approval: false, rules: false, mcp_elicitations: false, request_permissions: false, skill_approval: false } }, threadId: 'employee-a-chat-1', excludeTurns: true,
    config: { 'mcp_servers.personal.enabled': false, features: { shell_tool: false, hooks: false, plugins: false, apps: false } } })
})

it.each(['start', 'resume'])('respects the system proxy during native startup and thread/%s without relaxing employee restrictions', async method => {
  const input = await fixture()
  const result = await runCodexPhase({ ...input, ...(method === 'resume' ? { threadId: 'proxy-resume-thread' } : {}), effort: 'low' })
  expect(result.text).toBe('员工回复：你好🌱')
  expect(await readFile(join(input.cwd, 'thread-method.txt'), 'utf8')).toBe(`thread/${method}`)
  const startup = JSON.parse(await readFile(join(input.cwd, 'startup-policy.json'), 'utf8'))
  const thread = JSON.parse(await readFile(join(input.cwd, 'thread-config.json'), 'utf8'))
  const turn = JSON.parse(await readFile(join(input.cwd, 'turn-input.json'), 'utf8'))
  const disabled = {
    shell_tool: false, unified_exec: false, view_image: false, image_generation: false, multi_agent: false, multi_agent_v2: false,
    apps: false, plugins: false, hooks: false, memories: false, skill_search: false, skill_mcp_dependency_install: false, tool_suggest: false,
    browser_use: false, computer_use: false, code_mode: false, code_mode_host: false, code_mode_only: false, code_mode_only_strict_3p_tools: false,
    goals: false, sleep_tool: false, workspace_dependencies: false, unbounded_connection_retries: false,
  }
  expect(startup['features.respect_system_proxy']).toBe(true)
  expect(thread.config.features.respect_system_proxy).toBe(true)
  for (const [feature, enabled] of Object.entries(disabled)) {
    expect(startup[`features.${feature}`]).toBe(enabled)
    expect(thread.config.features[feature]).toBe(enabled)
  }
  expect(startup).toMatchObject({ web_search: 'disabled', project_doc_max_bytes: 0, mcp_servers: {}, 'analytics.enabled': false,
    'features.skip_host_skill_discovery': true, 'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false })
  expect(thread).toMatchObject({ model: 'gpt-6.1-sol', environments: [], sandbox: 'read-only', approvalPolicy: { granular: {
    sandbox_approval: false, rules: false, mcp_elicitations: false, request_permissions: false, skill_approval: false,
  } }, config: { web_search: 'disabled', project_doc_max_bytes: 0, mcp_servers: {}, 'mcp_servers.personal.enabled': false,
    features: { skip_host_skill_discovery: true }, 'tools.view_image': false, 'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false } })
  expect(thread.config).not.toHaveProperty('model_providers.openai.request_max_retries')
  expect(thread.config).not.toHaveProperty('model_providers.openai.stream_max_retries')
  expect(thread).not.toHaveProperty('dynamicTools')
  expect(turn).toMatchObject({ threadId: result.threadId, effort: 'low', environments: [], input: [{ type: 'text', text: '你好', text_elements: [] }] })
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it.each(['failed', 'wrong-turn', 'tool', 'malformed-receipt'])('refuses %s without turning protocol failure into a successful reply or reissuing the prompt', async mode => {
  const input = await fixture(mode)
  await expect(runCodexPhase(input)).rejects.toThrow()
  const turn = JSON.parse(await readFile(join(input.cwd, 'turn-input.json'), 'utf8'))
  expect(turn.input[0].text).toBe('你好')
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('cancels a live process promptly and does not retry an unconfirmed turn', async () => {
  const input = await fixture('hang'), controller = new AbortController()
  const started = Date.now()
  await expect(runCodexPhase({ ...input, signal: controller.signal, onSubmitted: async () => { controller.abort() } })).rejects.toThrow()
  expect(Date.now() - started).toBeLessThan(2000)
})

it('records the actual external turn boundary without pretending to know internal model steps or saving prompt bodies', async () => {
  const input = await fixture(), spans: TraceSpan[] = []
  const onDiagnostic = await observeCodexPhase({ runId: 'observed-run', onTrace: async span => { spans.push(span) } }, 'chat')
  await runCodexPhase({ ...input, prompt: 'private-secret-input', onDiagnostic })
  expect(spans).toHaveLength(2)
  expect(spans[1]).toMatchObject({ id: spans[0].id, traceId: 'observed-run', spanType: 'external_agent', attributes: { accounting: 'external-turn', internalModelSteps: 'unknown' }, output: { outcome: 'completed', stage: 'completed', turnId: 'fixture-turn' } })
  expect(spans[0].endedAt).toBeUndefined(); expect(spans[1].endedAt).toBeDefined()
  expect(JSON.stringify(spans)).not.toContain('private-secret')
  const diagnostic = spans[1].output as CodexPhaseDiagnostic
  expect(diagnostic.protocol?.notificationCounts['turn/completed']).toEqual({ received: 1, handled: 1 })
  expect(diagnostic.protocol?.pendingRequests).toEqual([])
})

it('keeps provider retry classification and a submitted unknown turn without capturing raw error data or issuing another request', async () => {
  const input = await fixture('provider-retry'); let diagnostic: CodexPhaseDiagnostic | undefined
  await expect(runCodexPhase({ ...input, timeoutMs: 1000, onDiagnostic: async value => { diagnostic = value } })).rejects.toThrow('阶段超时')
  expect(diagnostic).toMatchObject({ outcome: 'failed', stage: 'turn_wait', turnId: 'fixture-turn', externalErrors: [{ code: 'responseStreamDisconnected', httpStatusCode: 503, willRetry: true }] })
  expect(diagnostic!.protocol?.notificationCounts.error).toEqual({ received: 1, handled: 1 })
  expect(diagnostic!.protocol?.notificationCounts.other).toEqual({ received: 1, handled: 1 })
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('records transport fallback only for the submitted current thread in the original Trace without raw warning or error data', async () => {
  const input = await fixture('transport-fallback'), spans: TraceSpan[] = []
  const onDiagnostic = await observeCodexPhase({ runId: 'transport-observed-run', onTrace: async span => { spans.push(span) } }, 'chat')
  expect((await runCodexPhase({ ...input, onDiagnostic })).text).toBe('员工回复：你好🌱')
  expect(spans).toHaveLength(2)
  const diagnostic = spans[1].output as CodexPhaseDiagnostic
  expect(diagnostic).toMatchObject({ outcome: 'completed', stage: 'completed', transportEvents: [
    { type: 'websocket_to_https_fallback', elapsedMs: expect.any(Number) }, { type: 'websocket_to_https_fallback', elapsedMs: expect.any(Number) },
  ], externalErrors: [{ code: 'unknown', willRetry: false }] })
  expect(diagnostic.transportEvents).toHaveLength(2)
  expect(diagnostic.transportEvents!.every(event => Object.keys(event).sort().join(',') === 'elapsedMs,type' && event.elapsedMs >= 0 && event.elapsedMs <= diagnostic.elapsedMs)).toBe(true)
  expect(diagnostic.protocol?.notificationCounts.warning).toEqual({ received: 10, handled: 10 })
  expect(diagnostic.protocol?.notificationCounts.error).toEqual({ received: 1, handled: 1 })
  expect(JSON.stringify(spans)).not.toContain('private-secret')
  expect(JSON.stringify(spans)).not.toContain('Falling back')
  expect(JSON.stringify(spans)).not.toContain('https://')
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('bounds transport fallback diagnostic events at eight while counting every native warning', async () => {
  const input = await fixture('transport-fallback-limit'); let diagnostic: CodexPhaseDiagnostic | undefined
  await runCodexPhase({ ...input, onDiagnostic: async value => { diagnostic = value } })
  expect(diagnostic!.transportEvents).toHaveLength(8)
  expect(diagnostic!.protocol?.notificationCounts.warning).toEqual({ received: 12, handled: 12 })
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
})

it('ignores transport fallback before thread submission without blocking the native turn receipt', async () => {
  const input = await fixture('transport-before-thread'); let diagnostic: CodexPhaseDiagnostic | undefined
  expect((await runCodexPhase({ ...input, threadId: 'pre-submission-thread', onDiagnostic: async value => { diagnostic = value } })).text).toBe('员工回复：你好🌱')
  expect(diagnostic!.transportEvents).toBeUndefined()
  expect(diagnostic!.protocol?.notificationCounts.warning).toEqual({ received: 1, handled: 1 })
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('waits for the actual native receipt before recording transport fallback from an in-flight turn submission', async () => {
  const input = await fixture('transport-before-receipt'); let diagnostic: CodexPhaseDiagnostic | undefined, submitted = false
  await runCodexPhase({ ...input, onSubmitted: async () => { submitted = true }, onDiagnostic: async value => { diagnostic = value } })
  expect(submitted).toBe(true)
  expect(diagnostic!.transportEvents).toEqual([{ type: 'websocket_to_https_fallback', elapsedMs: expect.any(Number) }])
  expect(diagnostic!.protocol?.notificationCounts.warning).toEqual({ received: 1, handled: 1 })
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
})

it('keeps an unconfirmed transport fallback submission unknown on timeout without issuing another turn request', async () => {
  const input = await fixture('transport-unconfirmed'); let diagnostic: CodexPhaseDiagnostic | undefined, submitted = false
  await expect(runCodexPhase({ ...input, timeoutMs: 1000, onSubmitted: async () => { submitted = true }, onDiagnostic: async value => { diagnostic = value } })).rejects.toThrow('阶段超时')
  expect(submitted).toBe(false)
  expect(diagnostic).toMatchObject({ outcome: 'failed', stage: 'turn_start' })
  expect(diagnostic!.transportEvents).toBeUndefined()
  expect(diagnostic!.protocol?.notificationCounts.warning?.received).toBe(1)
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('keeps submitted transport fallback waiting for a real terminal until the original phase timeout without retrying', async () => {
  const input = await fixture('transport-fallback-hang'); let diagnostic: CodexPhaseDiagnostic | undefined, submitted = false
  await expect(runCodexPhase({ ...input, timeoutMs: 1000, onSubmitted: async () => { submitted = true }, onDiagnostic: async value => { diagnostic = value } })).rejects.toThrow('阶段超时')
  expect(submitted).toBe(true)
  expect(diagnostic).toMatchObject({ outcome: 'failed', stage: 'turn_wait', turnId: 'fixture-turn', transportEvents: [{ type: 'websocket_to_https_fallback', elapsedMs: expect.any(Number) }] })
  expect(diagnostic!.protocol?.notificationCounts.warning).toEqual({ received: 1, handled: 1 })
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('ignores late transport fallback warnings after the matching native turn has reached its terminal state', async () => {
  const input = await fixture('transport-fallback-late'); let diagnostic: CodexPhaseDiagnostic | undefined
  await runCodexPhase({ ...input, onDiagnostic: async value => { diagnostic = value } })
  expect(diagnostic!.transportEvents).toEqual([{ type: 'websocket_to_https_fallback', elapsedMs: expect.any(Number) }])
  expect(diagnostic!.protocol?.notificationCounts.warning).toEqual({ received: 2, handled: 2 })
  expect(JSON.stringify(diagnostic)).not.toContain('private-secret')
})

it('distinguishes received but unprocessed completion from a provider that sent no completion', async () => {
  const input = await fixture(); let diagnostic: CodexPhaseDiagnostic | undefined, release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  await expect(runCodexPhase({ ...input, timeoutMs: 1000, onDelta: () => blocked, onStop: release,
    onDiagnostic: async value => { diagnostic = value } })).rejects.toThrow('阶段超时')
  expect(diagnostic).toMatchObject({ outcome: 'failed', stage: 'turn_wait' })
  expect(diagnostic!.protocol?.notificationCounts['turn/completed']).toEqual({ received: 1, handled: 0 })
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('does not fail or repeat a native turn when both diagnostic storage and its error reporter fail', async () => {
  const input = await fixture(); let failures = 0
  const onDiagnostic = await observeCodexPhase({ runId: 'observed-run', onTrace: async () => { throw new Error('private-secret-storage') },
    onTraceError: async error => { failures++; expect(error).toBe('本机 Codex 执行诊断未能保存'); throw new Error('reporter unavailable') } }, 'chat')
  expect((await runCodexPhase({ ...input, onDiagnostic })).text).toBe('员工回复：你好🌱')
  expect(failures).toBe(2)
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('rejects changed programs and versions before making a model request', async () => {
  const input = await fixture()
  await expect(runCodexPhase({ ...input, profile: { ...input.profile, executableHash: 'changed' } })).rejects.toThrow('程序已变化')
  await expect(runCodexPhase({ ...input, profile: { ...input.profile, verified: { ...input.profile.verified!, version: '0.0.0' } } })).rejects.toThrow('版本已变化')
  await expect(readFile(join(input.cwd, 'turn-input.json'))).rejects.toThrow()
})

it('deduplicates a repeated native tool identity without repeating its effect', async () => {
  const input = await fixture('host-tool-duplicate'); let effects = 0
  const result = await runCodexPhase({ ...input, tools: [{ name: 'host_write', description: 'test', inputSchema: {}, execute: async () => { effects++; return { written: true } } }] })
  expect(result.text).toBe('员工回复：你好🌱'); expect(effects).toBe(1)
})

it('retains the actual host tool failure without claiming user cancellation or retrying the effect', async () => {
  const input = await fixture('host-tool'); let effects = 0
  await expect(runCodexPhase({ ...input, tools: [{ name: 'host_write', description: 'test', inputSchema: {}, execute: async () => { effects++; throw new Error('Source version changed before write') } }] })).rejects.toThrow('Source version changed before write')
  expect(effects).toBe(1)
  expect((await readFile(join(input.cwd, 'turn-requests.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
})

it('waits for an outstanding host tool to really exit when the external phase times out', async () => {
  const input = await fixture('host-tool'), controller = new AbortController(); let entered = false, exited = false
  const start = Date.now()
  await expect(runCodexPhase({ ...input, timeoutMs: 300, onStop: () => controller.abort(), tools: [{ name: 'host_write', description: 'test', inputSchema: {}, execute: async () => {
    entered = true
    await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => { setTimeout(() => { exited = true; resolve() }, 40) }, { once: true }))
  } }] })).rejects.toThrow()
  expect(entered).toBe(true); expect(exited).toBe(true); expect(Date.now() - start).toBeLessThan(2000)
})

it('saves native connection verification through the product API without invoking the API model or misrouting it to ACP', async () => {
  const input = await fixture()
  const service = new AppService({ dataPath: join(input.cwd, 'product'),
    engine: { run: async () => { throw new Error('API model must not run') }, test: async () => { throw new Error('API model must not run') } },
    secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {},
  })
  await service.init()
  try {
    const { id: _id, revision: _revision, executableHash: _hash, verified: _verified, ...draft } = input.profile
    expect(await service.handle('testLaunchProfileDraft', draft)).toMatchObject({ name: 'Codex', version: '0.159.3' })
    const saved = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    expect(saved.protocol).toBe('codex-app-server')
    expect(saved.verified).toMatchObject({ name: 'Codex' })
    expect(await service.handle('testLaunchProfile', { id: saved.id })).toMatchObject({ id: saved.id, verified: { name: 'Codex' } })
    await expect(service.handle('saveAgent', { name: 'Wrong protocol', role: '', instructions: '', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: { kind: 'acp-local', profileId: saved.id } })).rejects.toThrow('协议不一致')
  } finally { await service.close() }
})

it('creates a native employee, keeps two IM turns in its own session, survives restart and clears its mapping without API calls or Work', async () => {
  const input = await fixture(), dataPath = join(input.cwd, 'im-product')
  const create = () => new AppService({ dataPath, engine: { run: async () => { throw new Error('API model must not run') }, decide: async () => { throw new Error('API decision must not run') }, extractMemory: async () => { throw new Error('API memory must not run') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  let service = create(); await service.init()
  const detail = async (id: string) => await service.handle('getConversation', { id }) as ConversationDetail
  const settle = async (id: string, count: number) => {
    await expect.poll(async () => (await detail(id)).messages.filter(m => m.senderType === 'agent' && m.status === 'completed').length, { timeout: 10000 }).toBe(count)
    await expect.poll(async () => (await detail(id)).turns!.every(t => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(t.status)), { timeout: 10000 }).toBe(true)
    await expect.poll(async () => (await detail(id)).runs.filter(run => run.phase === 'memory' && run.status === 'completed').length, { timeout: 10000 }).toBe(count)
  }
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try {
    const { id: _id, revision: _revision, executableHash: _hash, verified: _verified, ...draft } = input.profile
    await service.handle('testLaunchProfileDraft', draft)
    const saved = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const employee = await service.handle('saveAgent', { name: '本机同事', role: '聊天助手', instructions: '独立回应', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: { kind: 'codex-local', profileId: saved.id } }) as DigitalAgent
    const conversation = await service.handle('createConversation', { kind: 'direct', title: 'Codex 对话', agentIds: [employee.id] }) as Conversation
    const firstMessage = await service.handle('sendMessage', { conversationId: conversation.id, content: '你好', mentionIds: [], requestId: 'native-chat-1' }) as Message
    await settle(conversation.id, 1)
    const first = (await store.load<{ threadId: string; state: string }>('codexSessions'))[0]
    expect(first.state).toBe('completed')
    const home = await service.handle('getAgentHome', { agentId: employee.id, conversationId: conversation.id }) as AgentHome
    const chatInput = async () => JSON.parse(JSON.parse(await readFile(join(home.sessionPath!, 'work', 'employee-chat-v1-input.json'), 'utf8')).input[0].text)
    expect(await chatInput()).toMatchObject({ contextMode: 'initial', phase: 'chat', taskCapabilitiesAfterClaim: { files: true, commandsByApproval: false, browser: false }, currentWorkItems: [], historicalBackground: [], currentTurnMessages: [{ id: firstMessage.id, content: '你好' }] })
    const publishedReply = (await detail(conversation.id)).messages.find(message => message.senderId === employee.id)!
    await service.close(); service = create(); await service.init()
    const secondMessage = await service.handle('sendMessage', { conversationId: conversation.id, content: '继续聊天', mentionIds: [], requestId: 'native-chat-2' }) as Message
    await settle(conversation.id, 2)
    const second = (await store.load<{ threadId: string }>('codexSessions'))[0]
    expect(second.threadId).toBe(first.threadId)
    expect(await chatInput()).toMatchObject({ contextMode: 'incremental', historicalBackground: [], currentTurnMessages: [{ id: secondMessage.id, content: '继续聊天' }], priorReply: { messageId: publishedReply.id } })
    expect(JSON.stringify(await chatInput())).not.toContain('员工回复：你好🌱')
    expect(JSON.stringify(await chatInput())).not.toContain(firstMessage.id)
    expect(await store.load('workItems')).toEqual([])
    expect((await detail(conversation.id)).messages.filter(m => m.senderType === 'agent').every(m => m.content === '员工回复：你好🌱')).toBe(true)
    await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect(await store.load('codexSessions')).toEqual([])
  } finally { await service.close(); await store.close() }
})

it('lets native Codex publish a real managed artifact through the original Work transaction without an API parent', async () => {
  const input = await fixture(), dataPath = join(input.cwd, 'task-product')
  const service = new AppService({ dataPath, engine: { run: async () => { throw new Error('API execution must not run') }, decide: async () => { throw new Error('API decision must not run') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init()
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try {
    const { id: _id, revision: _revision, executableHash: _hash, verified: _verified, ...draft } = input.profile
    await service.handle('testLaunchProfileDraft', draft)
    const saved = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const employee = await service.handle('saveAgent', { name: '本机交付同事', role: '交付文件', instructions: '', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: { kind: 'codex-local', profileId: saved.id } }) as DigitalAgent
    const conversation = await service.handle('createConversation', { kind: 'direct', title: 'Codex 文件交付', agentIds: [employee.id] }) as Conversation
    await service.handle('sendMessage', { conversationId: conversation.id, content: 'NATIVE_FILE_TASK 请创建并交付 Markdown 文件。', mentionIds: [], requestId: 'native-file-task' })
    await expect.poll(async () => (await store.load<WorkItem>('workItems'))[0]?.status, { timeout: 15000 }).toBe('delivered')
    const work = (await store.load<WorkItem>('workItems'))[0]!
    expect(work.artifactIds).toHaveLength(1)
    await expect.poll(async () => (await service.handle('getConversation', { id: conversation.id }) as ConversationDetail).runs.some(run => run.phase === 'memory' && run.status === 'completed'), { timeout: 10000 }).toBe(true)
    const budget = (await store.load<WorkBudget>('workBudgets'))[0]!
    expect(budget).toMatchObject({ callUnit: 'external-turn', accounting: 'model-calls-v1', sourceMessageId: work.sourceMessageId, modelCalls: 3, unknownCalls: 0, usageIncomplete: false, usage: { inputTokens: 15, outputTokens: 12, totalTokens: 27 } })
    const calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls.map(call => call.phase).sort()).toEqual(['decision', 'execution', 'memory'])
    expect(calls.every(call => call.workId === work.id && call.budgetId === budget.id && call.callUnit === 'external-turn')).toBe(true)
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    const decision = detail.runs.find(run => run.phase === 'decision')!
    expect(Date.parse(budget.deadlineAt) - Date.parse(decision.createdAt)).toBe(300000)
    expect(detail.messages.some(message => message.senderType === 'agent' && message.content === '已创建并发布 codex-proof.md。')).toBe(true)
    expect(detail.runs.find(run => run.workId === work.id)?.backend).toMatchObject({ kind: 'codex-local', externalInvocations: 1, toolControl: 'host-bridge' })
    expect(work.outcome?.evidence).toEqual([{ kind: 'artifact', reference: work.artifactIds[0] }])
    const runId = detail.runs.find(run => run.workId === work.id)!.id
    await expect(service.handle('listExternalFiles', { runId })).rejects.toThrow('旧 ACP')
    await expect(service.handle('publishExternalArtifact', { runId, relativePath: 'codex-proof.md' })).rejects.toThrow('旧 ACP')
  } finally { await service.close(); await store.close() }
})

it.each([true, false])('native command approval=%s gates the real effect and cannot be submitted twice', async approved => {
  const input = await fixture(), dataPath = join(input.cwd, 'approval-product')
  const service = new AppService({ dataPath, engine: { run: async () => { throw new Error('Unexpected API') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init()
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try {
    const { id: _id, revision: _revision, executableHash: _hash, verified: _verified, ...draft } = input.profile
    await service.handle('testLaunchProfileDraft', draft)
    const saved = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const agent = await service.handle('saveAgent', { name: '命令同事', role: '', instructions: '', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: true, active: true, executionBackend: { kind: 'codex-local', profileId: saved.id } }) as DigitalAgent
    const conversation = await service.handle('createConversation', { kind: 'direct', title: '命令测试', agentIds: [agent.id] }) as Conversation
    await service.handle('sendMessage', { conversationId: conversation.id, content: 'NATIVE_FILE_TASK NATIVE_COMMAND 明确请求执行命令后交付。', mentionIds: [], requestId: 'native-command' })
    const snapshot = async () => await service.handle('snapshot', undefined) as Snapshot
    await expect.poll(async () => (await snapshot()).approvals.length, { timeout: 10000 }).toBe(1)
    const approval = (await snapshot()).approvals[0]!
    expect(approval.conversationId).toBe(conversation.id)
    await expect(readFile(join(approval.cwd, 'command-proof.txt'))).rejects.toThrow()
    await service.handle('approve', { id: approval.id, approved })
    await expect(service.handle('approve', { id: approval.id, approved: !approved })).rejects.toThrow('失效')
    await expect.poll(async () => (await store.load<WorkItem>('workItems'))[0]?.status, { timeout: 10000 }).toBe(approved ? 'delivered' : 'blocked')
    if (approved) expect(await readFile(join(approval.cwd, 'command-proof.txt'), 'utf8')).toBe('command-proof')
    else { await expect(readFile(join(approval.cwd, 'command-proof.txt'))).rejects.toThrow(); expect((await store.load<WorkItem>('workItems'))[0]!.artifactIds).toEqual([]) }
    expect((await snapshot()).approvals).toEqual([])
  } finally { await service.close(); await store.close() }
})

async function nativeWorkProduct(allowCommands = false, engine?: AgentEngine) {
  const input = await fixture(), dataPath = join(input.cwd, 'work-lifecycle')
  const create = (directory = dataPath) => new AppService({ dataPath: directory, engine: engine ?? { run: async () => { throw new Error('Unexpected API model') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  const service = create(); await service.init()
  const { id: _id, revision: _revision, executableHash: _hash, verified: _verified, ...draft } = input.profile
  await service.handle('testLaunchProfileDraft', draft)
  const saved = await service.handle('saveLaunchProfile', draft) as LaunchProfile
  const agent = await service.handle('saveAgent', { name: '独立交付员工', role: '', instructions: '', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands, active: true, executionBackend: { kind: 'codex-local', profileId: saved.id } }) as DigitalAgent
  const conversation = await service.handle('createConversation', { kind: 'direct', title: '原工作生命周期', agentIds: [agent.id] }) as Conversation
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  const idle = async (current = service) => expect.poll(async () => {
    const detail = await current.handle('getConversation', { id: conversation.id }) as ConversationDetail
    return !!detail.turns?.length && detail.turns.every(turn => ['completed', 'waiting_user', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
      && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
      && detail.turns.every(turn => detail.runs.some(run => run.turnId === turn.id && (run.phase === 'memory' || run.workId && run.disposition === 'waiting')))
  }, { timeout: 10000 }).toBe(true)
  return { service, store, create, agent, conversation, idle, dataPath, root: input.cwd }
}

async function nativeCore(f: Awaited<ReturnType<typeof nativeWorkProduct>>) {
  const core = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  return await f.service.handle('saveAgent', { id: core.id, expectedConfigVersion: core.configVersion, name: core.name, role: core.role, instructions: core.instructions, color: core.color, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: f.agent.executionBackend }) as DigitalAgent
}

async function nativeAutomation(f: Awaited<ReturnType<typeof nativeWorkProduct>>, prompt = 'NATIVE_FILE_TASK') {
  return await f.service.handle('saveAutomation', { name: '本机每日交付', prompt, conversationPolicy: 'new-conversation', employeeIds: [f.agent.id], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
}
async function automationState(f: Awaited<ReturnType<typeof nativeWorkProduct>>, id: string, status: AutomationOccurrence['status']) {
  await expect.poll(async () => (await f.service.handle('getAutomationOccurrence', { id }) as AutomationOccurrence).status, { timeout: 12000 }).toBe(status)
  return await f.service.handle('getAutomationOccurrence', { id }) as AutomationOccurrence
}

it('invalidates native automation admission when the reviewed launch profile changes without creating a chat, work or model call', async () => {
  const f = await nativeWorkProduct()
  try {
    const plan = await nativeAutomation(f)
    const profile = (await f.service.handle('listLaunchProfiles', undefined) as LaunchProfile[])[0]!
    const { verified: _verified, executableHash: _hash, revision, ...input } = profile
    await f.service.handle('saveLaunchProfile', { ...input, expectedRevision: revision, name: '修改后尚未重新测试' })
    const result = await f.service.handle('runAutomation', { id: plan.id, requestId: 'changed-profile' }) as AutomationOccurrence
    expect(result).toMatchObject({ status: 'skipped', attentionReason: 'authorization' })
    expect(result.budgetId).toBeUndefined()
    expect((await f.store.load<Conversation>('conversations')).filter(chat => chat.purpose === 'automation')).toEqual([])
    expect(await f.store.load('runs')).toEqual([]); expect(await f.store.load('workItems')).toEqual([])
    await expect(nativeAutomation(f)).rejects.toThrow('测试')
  } finally { await f.service.close(); await f.store.close() }
})

it('keeps the existing unattended command boundary for native automation admission', async () => {
  const f = await nativeWorkProduct(true)
  try {
    await expect(nativeAutomation(f)).rejects.toThrow('命令权限')
    expect(await f.store.load('automations')).toEqual([]); expect(await f.store.load('runs')).toEqual([])
  } finally { await f.service.close(); await f.store.close() }
})

it('runs a native automation without API configuration using one occurrence, task chat and original phase ledger, then never replays it on restart', async () => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  try {
    const plan = await nativeAutomation(f), request = { id: plan.id, requestId: 'native-once' }
    expect(await f.store.load('runs')).toEqual([])
    const [first, duplicate] = await Promise.all([f.service.handle('runAutomation', request), f.service.handle('runAutomation', request)]) as AutomationOccurrence[]
    expect(duplicate.id).toBe(first.id); expect(duplicate.conversationId).toBe(first.conversationId)
    const result = await automationState(f, first.id, 'completed')
    expect(result).toMatchObject({ deliveryStatus: 'delivered', usageIncomplete: false })
    const chats = await f.store.load<Conversation>('conversations'), work = (await f.store.load<WorkItem>('workItems'))[0]!, budget = (await f.store.load<WorkBudget>('workBudgets'))[0]!
    expect(chats.filter(chat => chat.purpose === 'automation')).toHaveLength(1)
    expect(work).toMatchObject({ status: 'delivered', conversationId: first.conversationId, budgetId: first.budgetId, origin: { occurrenceId: first.id } })
    expect(budget).toMatchObject({ id: first.budgetId, callUnit: 'mixed', modelCalls: 3, runs: 1, unknownCalls: 0, usageIncomplete: false, deadlineAt: first.budget!.deadlineAt })
    const calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls.map(call => call.phase).sort()).toEqual(['decision', 'execution', 'memory'])
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && call.origin?.occurrenceId === first.id)).toBe(true)
    expect(await f.store.load('connections')).toEqual([])
    const artifact = (await f.store.load<ArtifactVersion>('artifacts'))[0]!
    expect(await readFile(artifact.path, 'utf8')).toContain('NATIVE_FILE_TASK')
    const runs = await f.store.load('runs')
    await f.service.close(); restarted = f.create(); await restarted.init()
    expect(await restarted.handle('runAutomation', request)).toMatchObject({ id: first.id, status: 'completed' })
    expect(await f.store.load('runs')).toEqual(runs)
    expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
})

it('continues a native automation only from its fixed question and keeps prior effects, original occurrence and deadline', async () => {
  const f = await nativeWorkProduct()
  try {
    const plan = await nativeAutomation(f, 'NATIVE_FILE_TASK NATIVE_QUESTION')
    const initial = await f.service.handle('runAutomation', { id: plan.id, requestId: 'native-question' }) as AutomationOccurrence
    const waiting = await automationState(f, initial.id, 'waiting_user')
    const before = await f.service.handle('getConversation', { id: initial.conversationId }) as ConversationDetail
    const work = before.workItems![0]!, budget = before.workBudgets![0]!
    expect(work.status).toBe('waiting')
    const question = before.messages.find(message => message.senderType === 'agent' && waiting.waitingTurnIds?.includes(message.turnId!) && message.status === 'completed')!
    const reply = { occurrenceId: initial.id, content: '用 Codex proof 作为标题', requestId: 'native-answer', question: { expectedVersion: waiting.stateVersion, questionMessageId: question.id } }
    await expect(f.service.handle('replyAutomation', { ...reply, question: { ...reply.question, questionMessageId: 'wrong-message' } })).rejects.toThrow()
    expect(await f.store.load('runs')).toHaveLength(before.runs.length)
    const answer = await f.service.handle('replyAutomation', reply) as Message
    expect(await f.service.handle('replyAutomation', reply)).toEqual(answer)
    await automationState(f, initial.id, 'completed')
    const works = await f.store.load<WorkItem>('workItems'), budgets = await f.store.load<WorkBudget>('workBudgets')
    expect(works).toHaveLength(1); expect(works[0]).toMatchObject({ id: work.id, sourceMessageId: work.sourceMessageId, budgetId: budget.id, status: 'delivered', origin: work.origin })
    expect(budgets).toHaveLength(1); expect(budgets[0]).toMatchObject({ deadlineAt: budget.deadlineAt, modelCalls: 4, runs: 2, unknownCalls: 0 })
    expect((await f.store.load<ConversationDetail['runs'][number]>('runs')).flatMap(run => run.toolEvents).filter(event => event.name === 'write_file')).toHaveLength(2)
  } finally { await f.service.close(); await f.store.close() }
})

it('renews an expired native question only by explicit grant while retaining usage, work and previous effects', async () => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  try {
    const plan = await nativeAutomation(f, 'NATIVE_FILE_TASK NATIVE_QUESTION')
    const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'native-expiry' }) as AutomationOccurrence
    await automationState(f, first.id, 'waiting_user')
    const before = (await f.store.load<WorkBudget>('workBudgets'))[0]!, work = (await f.store.load<WorkItem>('workItems'))[0]!
    const internal = f.service as unknown as { store: ProductStore; automations: import('../src/runtime/modules/automations/automation-service').AutomationService }
    await internal.store.write([{ collection: 'workBudgets', id: before.id, value: { ...before, deadlineAt: new Date(0).toISOString() } }])
    await internal.automations.stop(first.id, '测试原时间预算已到期', 'budget')
    const stopped = await automationState(f, first.id, 'cancelled')
    const request = { occurrenceId: first.id, content: '使用补充后的标题并完成原文件', requestId: 'native-grant', renewBudget: { expectedVersion: stopped.stateVersion, allowance: 'standard-v1' as const } }
    const message = await f.service.handle('replyAutomation', request) as Message
    await internal.automations.stop(first.id, '旧期限迟到事件', 'budget', 0)
    await automationState(f, first.id, 'completed')
    expect(await f.service.handle('replyAutomation', request)).toEqual(message)
    const budgets = await f.store.load<WorkBudget>('workBudgets'), works = await f.store.load<WorkItem>('workItems'), calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
    expect(budgets).toHaveLength(1); expect(works).toHaveLength(1)
    expect(budgets[0]).toMatchObject({ id: before.id, callUnit: 'mixed', runs: 2, maxModelCalls: 48, unknownCalls: 0 })
    expect(budgets[0].modelCalls).toBe(calls.length); expect(budgets[0].modelCalls).toBeGreaterThan(before.modelCalls)
    expect(calls.every(call => call.origin?.occurrenceId === first.id && call.callUnit === 'external-turn' && call.usageComplete)).toBe(true)
    expect(budgets[0].renewals).toHaveLength(1)
    expect(budgets[0].renewals![0]).toMatchObject({ requestId: request.requestId, messageId: message.id, used: { modelCalls: before.modelCalls, usage: before.usage, unknownCalls: before.unknownCalls } })
    expect(works[0]).toMatchObject({ id: work.id, sourceMessageId: work.sourceMessageId, budgetId: work.budgetId, status: 'delivered', origin: work.origin })
    expect((await f.store.load<ConversationDetail['runs'][number]>('runs')).flatMap(run => run.toolEvents).filter(event => event.name === 'write_file')).toHaveLength(2)
    await f.service.close(); restarted = f.create(); await restarted.init()
    expect(await restarted.handle('replyAutomation', request)).toEqual(message)
    expect(await f.store.load('workBudgets')).toEqual(budgets); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
})

it.each(['question', 'failed-decision'] as const)('passes explicit pre-work %s continuation to Codex without treating ordinary chat as a grant', async mode => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  const detail = (id: string) => f.service.handle('getConversation', { id }) as Promise<ConversationDetail>
  try {
    const agent = f.agent, plan = await nativeAutomation(f, mode === 'question' ? 'NATIVE_CONTINUATION_QUESTION' : 'NATIVE_CONTINUATION_FAILURE')
    const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'before-work' }) as AutomationOccurrence
    const initial = await automationState(f, first.id, mode === 'question' ? 'waiting_user' : 'failed'), before = await detail(first.conversationId)
    expect(before.workItems).toEqual([]); expect(before.artifacts).toEqual([])
    const home = await f.service.handle('getAgentHome', { agentId: agent.id, conversationId: first.conversationId }) as { sessionPath: string }
    const decisions = async () => (await readFile(join(home.sessionPath, 'work', 'decision-continuation.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const ordinary = await f.service.handle('sendMessage', { conversationId: first.conversationId, content: '继续', mentionIds: [], requestId: 'ordinary-continue' }) as Message
    await expect.poll(async () => (await detail(first.conversationId)).messages.some(m => m.senderType === 'agent' && m.status === 'completed' && m.turnId === ordinary.turnId)).toBe(true)
    await expect.poll(async () => (await detail(first.conversationId)).runs.every(r => ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status))).toBe(true)
    expect((await decisions()).filter(d => d.originalUserRequestId === ordinary.id)).not.toHaveLength(0)
    expect((await decisions()).filter(d => d.originalUserRequestId === ordinary.id).every(d => d.continuation === undefined)).toBe(true)
    expect((await detail(first.conversationId)).workItems).toEqual([])
    await automationState(f, first.id, initial.status)
    const request = { occurrenceId: first.id, content: '标题用接续证明，请完成原文件。', requestId: 'explicit-continue' }
    let continuation: { question?: { expectedVersion: number; questionMessageId: string }; renewBudget?: { expectedVersion: number; allowance: 'standard-v1' } }
    if (mode === 'question') {
      const waiting = await automationState(f, first.id, 'waiting_user')
      const question = before.messages.find(m => m.senderType === 'agent' && m.turnId === first.turnId && m.status === 'completed')!
      continuation = { question: { expectedVersion: waiting.stateVersion, questionMessageId: question.id } }
    } else {
      // Explicit expiry injection tests the continuation contract, not elapsed wall-clock behavior.
      const internal = f.service as unknown as { store: ProductStore }
      await internal.store.write([{ collection: 'workBudgets', id: first.budgetId!, value: { ...before.workBudgets![0], deadlineAt: new Date(0).toISOString() } }])
      const stopped = await automationState(f, first.id, 'failed')
      continuation = { renewBudget: { expectedVersion: stopped.stateVersion, allowance: 'standard-v1' } }
    }
    const input = { ...request, ...continuation }, reply = await f.service.handle('replyAutomation', input) as Message
    expect(await f.service.handle('replyAutomation', input)).toEqual(reply)
    await expect.poll(async () => (await decisions()).some(d => d.originalUserRequestId === reply.id)).toBe(true)
    const data = (await decisions()).find(d => d.originalUserRequestId === reply.id)!
    expect(data.continuation).toMatchObject({ originalRequestId: first.messageId, replyToTurnIds: mode === 'question' ? [first.turnId] : [] })
    if (mode === 'failed-decision') expect(data.continuation.resumesTurnIds).toContain(first.turnId)
    const completed = await automationState(f, first.id, 'completed'), after = await detail(first.conversationId)
    expect(completed.deliveryStatus).toBe('delivered')
    expect(after.workItems).toHaveLength(1); expect(after.artifacts).toHaveLength(1); expect(after.workBudgets).toHaveLength(1)
    expect(after.workItems![0]).toMatchObject({ sourceMessageId: first.messageId, budgetId: first.budgetId, status: 'delivered' })
    expect(after.runs.flatMap(r => r.toolEvents).filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(1)
    expect(after.workBudgets![0].modelCalls).toBe((await f.store.load('budgetModelCalls')).length)
    if (mode === 'question') expect(after.workBudgets![0].deadlineAt).toBe(before.workBudgets![0].deadlineAt)
    else expect(after.workBudgets![0].renewals).toHaveLength(1)
    const records = await Promise.all(['runs', 'workItems', 'workBudgets', 'budgetModelCalls'].map(name => f.store.load(name)))
    await f.service.close(); restarted = f.create(); await restarted.init()
    expect(await restarted.handle('replyAutomation', input)).toEqual(reply)
    expect(await Promise.all(['runs', 'workItems', 'workBudgets', 'budgetModelCalls'].map(name => f.store.load(name)))).toEqual(records)
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
}, 30_000)


it('stops an unfinished native automation without publishing its private file or replaying its unknown call after restart', async () => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  try {
    const plan = await nativeAutomation(f, 'NATIVE_FILE_TASK NATIVE_AUTOMATION_HANG'), request = { id: plan.id, requestId: 'native-stop' }
    const occurrence = await f.service.handle('runAutomation', request) as AutomationOccurrence
    await expect.poll(async () => (await f.store.load<ConversationDetail['runs'][number]>('runs')).some(run => run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed')), { timeout: 10000 }).toBe(true)
    await f.service.handle('stopAutomation', { id: occurrence.id })
    await automationState(f, occurrence.id, 'cancelled')
    const runs = await f.store.load('runs'), calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
    expect(await f.store.load('artifacts')).toEqual([])
    expect(calls.some(call => call.phase === 'execution' && !call.usageComplete)).toBe(true)
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toMatchObject({ unknownCalls: 1, usageIncomplete: true })
    await f.service.close(); restarted = f.create(); await restarted.init()
    expect(await restarted.handle('runAutomation', request)).toMatchObject({ id: occurrence.id, status: 'cancelled' })
    expect(await f.store.load('runs')).toEqual(runs); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
})

it.each(['employee_creation', 'organize_only', 'organize_and_execute'] as const)('native bobo completes the authorized organization mode with no API parent: %s', async mode => {
  const f = await nativeWorkProduct()
  try {
    const core = await nativeCore(f)
    const marker = mode === 'employee_creation' ? 'NATIVE_BOBO_CREATE' : mode === 'organize_only' ? 'NATIVE_BOBO_ONLY' : 'NATIVE_BOBO_EXECUTE'
    const conversation = await f.service.handle('startCoreConversation', { requestId: `native-core-${mode}`, content: marker + ' 按实际请求组织员工' }) as Conversation
    await expect.poll(async () => {
      const works = await f.store.load<WorkItem>('workItems')
      const detail = await f.service.handle('getConversation', { id: conversation.id }) as ConversationDetail
      return works.length === (mode === 'organize_and_execute' ? 3 : 1) && works.every(work => work.status === 'delivered') ? 'delivered' : JSON.stringify(detail.runs.filter(run => run.status === 'failed').map(run => run.error))
    }, { timeout: 20000 }).toBe('delivered')
    await expect.poll(async () => (await f.store.load<{ status: string }>('runs')).every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 10000 }).toBe(true)
    const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
    expect(snapshot.connections).toEqual([])
    const created = snapshot.agents.find(agent => agent.name === '本机新同事')!
    expect(created).toMatchObject({ executionBackend: core.executionBackend, connectionId: '', allowCommands: false, allowBrowser: false })
    expect(created.systemRole).toBeUndefined()
    expect(created.id).not.toBe(core.id)
    const works = await f.store.load<WorkItem>('workItems'), budgets = await f.store.load<WorkBudget>('workBudgets')
    expect(budgets).toHaveLength(1)
    expect(new Set(works.map(work => work.budgetId)).size).toBe(1)
    expect(budgets[0]).toMatchObject({ maxModelCalls: mode === 'organize_and_execute' ? 48 : 24, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false })
    const calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls.length).toBe(budgets[0].modelCalls)
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete)).toBe(true)
    expect(calls.some(call => call.phase === 'decision')).toBe(true)
    expect(calls.some(call => call.phase === 'memory')).toBe(true)
    const groups = snapshot.conversations.filter(item => item.kind === 'group')
    expect(groups).toHaveLength(mode === 'employee_creation' ? 0 : 1)
    expect(snapshot.conversations.find(item => item.id === conversation.id)).toMatchObject({ purpose: 'core', agentIds: ['bobo'] })
    if (mode !== 'employee_creation') {
      expect(groups[0].agentIds).toEqual(['bobo', f.agent.id, created.id])
      const group = await f.service.handle('getConversation', { id: groups[0].id }) as ConversationDetail
      expect(group.messages[0]).toMatchObject({ senderId: 'bobo', collaborationRequestId: budgets[0].collaborationRequestId })
      if (mode === 'organize_only') { expect(group.runs).toEqual([]); expect(group.workItems).toEqual([]) }
      else {
        expect(group.workItems).toHaveLength(2)
        const root = group.workItems!.find(work => !work.parentWorkId)!, child = group.workItems!.find(work => work.parentWorkId)!
        expect(root.ownerAgentId).toBe('bobo'); expect(child.rootWorkId).toBe(root.id)
        expect(root.requiredResults).toEqual([{ workId: child.id, resultVersion: 1 }])
        expect(group.artifacts).toHaveLength(2)
        for (const artifact of group.artifacts) expect(await readFile(artifact.path, 'utf8')).toContain('NATIVE_FILE_TASK')
      }
    }
    expect((await f.store.load<{ status: string; error?: string }>('runs')).filter(run => run.status !== 'completed')).toEqual([])
  } finally { await f.service.close(); await f.store.close() }
})

it('native core retains its selected backend on restart; ordinary chat creates no Work and named team inherits the native runtime', async () => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  try {
    const core = await nativeCore(f)
    const conversation = await f.service.handle('startCoreConversation', { requestId: 'native-core-chat', content: '你好，请介绍一下自己' }) as Conversation
    await expect.poll(async () => {
      const detail = await f.service.handle('getConversation', { id: conversation.id }) as ConversationDetail
      return detail.messages.some(message => message.senderId === 'bobo' && message.status === 'completed') && detail.runs.some(run => run.phase === 'memory' && run.status === 'completed')
    }, { timeout: 10000 }).toBe(true)
    expect(await f.store.load('workItems')).toEqual([])
    await f.service.close(); restarted = f.create(); await restarted.init()
    const reopened = (await restarted.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
    expect(reopened).toMatchObject({ executionBackend: core.executionBackend, configVersion: core.configVersion, connectionId: '', memoryNamespace: core.memoryNamespace })
    const named = await restarted.handle('startCoreConversation', { requestId: 'native-named-team', team: { name: '用户原团队名', requirements: 'NATIVE_NAMED_TEAM 创建核查员工' } }) as Conversation
    await expect.poll(async () => {
      const detail = await restarted!.handle('getConversation', { id: named.id }) as ConversationDetail
      return detail.workItems?.[0]?.status === 'delivered' ? 'delivered' : JSON.stringify(detail.runs.filter(run => run.status === 'failed').map(run => run.error))
    }, { timeout: 10000 }).toBe('delivered')
    const snapshot = await restarted.handle('snapshot', undefined) as Snapshot
    const created = snapshot.agents.find(agent => agent.name === '团队同事')!
    expect(created).toMatchObject({ executionBackend: core.executionBackend, connectionId: '' })
    expect(snapshot.conversations.find(item => item.kind === 'group')).toMatchObject({ title: '用户原团队名', agentIds: [created.id] })
    expect(snapshot.connections).toEqual([])
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
})

it.each(['independent', 'native-parent', 'api-parent', 'automation'] as const)('runs a mixed group through real host scheduling and one original ledger: %s', async mode => {
  const independent = mode === 'independent' || mode === 'automation'
  const apiRuns: EngineContext[] = []
  const account = async (context: EngineContext, phase: Parameters<NonNullable<EngineContext['onModelCallStarted']>>[1]) => {
    expect(context.agent.executionBackend?.kind).toBe('mastra-model')
    await context.onModelCallStarted!(context.modelCallId!, phase)
    await context.onModelCallUsage!(context.modelCallId!, { inputTokens: 8, outputTokens: 3, totalTokens: 11 })
  }
  const engine: AgentEngine = {
    test: async () => '',
    decide: async context => {
      await account(context, 'decision')
      const first = context.participation?.isFirstDecision && !context.participation.hasRespondedInTurn
      const mentioned = context.messages.find(message => message.id === context.triggerMessageId)?.mentionIds ?? []
      return first && (!mentioned.length || mentioned.includes(context.agent.id))
        ? { action: 'reply', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence, work: { key: 'api-independent', scope: '核查实际请求', deliverable: '核查结果' } }
        : { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
    },
    run: async context => {
      await account(context, 'task'); apiRuns.push(context)
      expect(context.workBudget).toMatchObject(context.work!.origin ? { origin: context.work!.origin } : { callUnit: 'mixed', sourceMessageId: context.work!.sourceMessageId })
      if (mode === 'api-parent' && !context.work!.parentWorkId && !context.work!.waitRevision) {
        const owner = context.members!.find(member => member.executionBackend?.kind === 'codex-local')!
        const child = await context.delegateWork!({ key: 'api-child', ownerAgentId: owner.id, scope: '核查并交付实际文件', deliverable: 'codex-proof.md' })
        await context.waitForWork!({ dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '核对实际文件后汇总' })
        await context.onDelta('等待同事核查结果。'); return
      }
      if (context.work!.waitRevision) expect(context.dependencyArtifacts).toHaveLength(1)
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已核对', evidence: [{ kind: 'answer', reference: '实际核查结果为79' }] })
      await context.onDelta('实际核查结果为79')
    },
    report: async (context, draft) => { await account(context, 'report'); return { action: 'publish', text: draft.text } },
    extractMemory: async context => { await account(context, 'memory'); return [] },
  }
  const f = await nativeWorkProduct(false, engine)
  try {
    const connection = await f.service.handle('saveConnection', { name: 'API fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'fixture' }) as { id: string }
    const api = await f.service.handle('saveAgent', { name: 'API同事', role: '核查', instructions: '', color: '#123456', connectionId: connection.id, modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: { kind: 'mastra-model' } }) as DigitalAgent
    const group = await f.service.handle('createConversation', { kind: 'group', title: '混合员工群', agentIds: [f.agent.id, api.id] }) as Conversation
    const read = () => f.service.handle('getConversation', { id: group.id }) as Promise<ConversationDetail>
    let occurrence: AutomationOccurrence | undefined
    if (mode === 'automation') {
      const plan = await f.service.handle('saveAutomation', { name: '混合自动化', prompt: 'NATIVE_GROUP_FILES 两位员工各自交付明确工作', conversationId: group.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
      occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'mixed-auto-once' }) as AutomationOccurrence
      await expect.poll(async () => {
        const current = await f.service.handle('getAutomationOccurrence', { id: occurrence!.id }) as AutomationOccurrence
        return current.status === 'failed' ? JSON.stringify({ reason: current.reason, errors: (await read()).runs.filter(run => run.status === 'failed').map(run => ({ phase: run.phase, employee: run.agentId, error: run.error })) }) : current.status
      }, { timeout: 12000 }).toBe('completed')
    }
    const source = occurrence ? (await read()).messages.find(message => message.id === occurrence!.messageId)! : await f.service.handle('sendMessage', { conversationId: group.id, content: mode === 'independent' ? 'NATIVE_GROUP_FILES 两位员工各自交付明确工作' : 'NATIVE_GROUP_TASK 请负责人分工给同事核查后再汇总', mentionIds: mode === 'independent' ? [] : [mode === 'native-parent' ? f.agent.id : api.id], requestId: `mixed-${mode}` }) as Message
    await expect.poll(async () => {
      const detail = await read()
      return detail.workItems?.length === 2 && detail.workItems.every(work => work.status === 'delivered') ? 'delivered' : JSON.stringify(detail.runs.filter(run => run.status === 'failed').map(run => run.error))
    }, { timeout: 15000 }).toBe('delivered')
    await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) && (await read()).runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 10000 }).toBe(true)
    const detail = await read(), works = detail.workItems!, budget = detail.workBudgets![0]
    expect(detail.workBudgets).toHaveLength(1)
    expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
    expect(works.every(work => work.sourceMessageId === source.id && work.budgetId === budget.id)).toBe(true)
    expect(budget).toMatchObject({ callUnit: 'mixed', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
    expect(apiRuns.length).toBe(mode === 'api-parent' ? 2 : 1)
    const calls = (await f.store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)
    expect(calls.length).toBe(budget.modelCalls)
    const employeeOf = (call: BudgetModelCall) => detail.runs.find(run => run.id === call.runId)?.agentId
    expect(calls.filter(call => employeeOf(call) === f.agent.id).every(call => call.callUnit === 'external-turn')).toBe(true)
    expect(calls.filter(call => employeeOf(call) === api.id).every(call => !call.callUnit)).toBe(true)
    // Both actual owners maintain memory after their delivery, including dependency continuation.
    for (const employeeId of [api.id, f.agent.id]) {
      const memoryCalls = calls.filter(call => call.phase === 'memory' && employeeOf(call) === employeeId)
      expect(memoryCalls).toHaveLength(1)
      const ownerWork = works.find(work => work.ownerAgentId === employeeId)!
      expect(detail.runs.find(run => run.id === memoryCalls[0].runId)).toMatchObject({ status: 'completed', agentId: employeeId,
        ...(occurrence ? { origin: { occurrenceId: occurrence.id }, turnId: occurrence.turnId } : { workId: ownerWork.id }) })
    }
    if (occurrence) {
      expect(budget).toMatchObject({ id: occurrence.budgetId, deadlineAt: occurrence.budget!.deadlineAt, maxModelCalls: 24 })
      expect(calls.every(call => call.origin?.occurrenceId === occurrence!.id)).toBe(true)
      expect(calls.filter(call => call.callUnit === 'external-turn').length).toBeGreaterThan(0)
      expect(calls.filter(call => !call.callUnit).length).toBeGreaterThan(0)
      expect(works.every(work => work.origin?.occurrenceId === occurrence!.id)).toBe(true)
    }
    if (!independent) {
      const child = works.find(work => work.parentWorkId)!, parent = works.find(work => !work.parentWorkId)!
      expect(child.rootWorkId).toBe(parent.id); expect(parent.requiredResults).toEqual([{ workId: child.id, resultVersion: 1 }])
      expect(parent.waitRevision).toBe(1)
      expect(detail.runs.filter(run => run.workId === parent.id && run.phase === 'execution')).toHaveLength(2)
    }
    const nativeArtifacts = detail.artifacts.filter(artifact => detail.runs.some(run => run.id === artifact.runId && run.agentId === f.agent.id))
    expect(nativeArtifacts).toHaveLength(1)
    expect(await readFile(nativeArtifacts[0].path, 'utf8')).toContain('NATIVE_FILE_TASK')
  } finally { await f.store.close(); await f.service.close() }
})

it('keeps legacy ACP history and explicit file receipts unchanged after restart and switching the same employee to native Codex', async () => {
  const f = await nativeWorkProduct(); let restarted: AppService | undefined
  const input = (agent: DigitalAgent, executionBackend: DigitalAgent['executionBackend']) => ({ id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, active: true, allowCommands: false, skillIds: [], knowledgeIds: [], connectionId: '', modelId: '', executionBackend })
  try {
    // Omitted protocol is an actual old-style ACP configuration, not a native alias.
    const legacy = await f.service.handle('saveLaunchProfile', { name: '旧ACP程序', executable: process.execPath, args: [resolve('tests/fixtures/acp-agent.mjs')], useExistingLogin: false, hostAccessAcknowledged: true }) as LaunchProfile
    await f.service.handle('testLaunchProfile', { id: legacy.id })
    const beforeAgent = await f.service.handle('saveAgent', input(f.agent, { kind: 'acp-local', profileId: legacy.id })) as DigitalAgent
    const request = { conversationId: f.conversation.id, content: '旧ACP的明确文件任务', requestId: 'legacy-task' }
    const message = await f.service.handle('sendExternalTask', request) as Message
    await expect.poll(async () => (await f.store.load<ConversationDetail['runs'][number]>('runs'))[0]?.status, { timeout: 10000 }).toBe('completed')
    const oldRun = (await f.store.load<ConversationDetail['runs'][number]>('runs'))[0]
    expect(oldRun).toMatchObject({ backend: { kind: 'acp-local', sessionPolicy: 'fresh', externalInvocations: 1 } })
    expect(oldRun.workId).toBeUndefined(); expect(oldRun.usage).toBeUndefined()
    await f.service.handle('publishExternalArtifact', { runId: oldRun.id, relativePath: 'report.txt' })
    const original = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(original.workItems ?? []).toEqual([]); expect(await f.store.load('workBudgets')).toEqual([])
    await f.service.close(); restarted = f.create(); await restarted.init()
    expect((await restarted.handle('getConversation', { id: f.conversation.id }) as ConversationDetail).runs).toEqual(original.runs)
    const current = (await restarted.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.agent.id)!
    const native = await restarted.handle('saveAgent', input(current, f.agent.executionBackend)) as DigitalAgent
    expect(native).toMatchObject({ id: beforeAgent.id, workspaceRef: beforeAgent.workspaceRef, memoryNamespace: beforeAgent.memoryNamespace })
    expect(await restarted.handle('getExternalTaskReceipt', { conversationId: request.conversationId, requestId: request.requestId })).toEqual(message)
    expect(await restarted.handle('listExternalFiles', { runId: oldRun.id })).toMatchObject({ files: [{ name: 'report.txt', relativePath: 'report.txt' }] })
    await restarted.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK', mentionIds: [], requestId: 'new-native-task' }); await f.idle(restarted)
    const after = await restarted.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(after.runs.find(run => run.id === oldRun.id)).toEqual(oldRun)
    expect(after.messages.filter(value => original.messages.some(old => old.id === value.id))).toEqual(original.messages)
    expect(after.workItems).toHaveLength(1); expect(after.workItems![0].status).toBe('delivered')
    expect(after.artifacts.find(file => file.id === original.artifacts[0].id)).toEqual(original.artifacts[0])
    expect(await readFile(original.artifacts[0].path, 'utf8')).toBe('controlled external artifact')
    expect((await f.store.load<BudgetModelCall>('budgetModelCalls')).every(call => call.runId !== oldRun.id)).toBe(true)
  } finally { await restarted?.close(); await f.service.close(); await f.store.close() }
})

it('switches an idle employee between native and API without changing identity or replaying old work, then creates a fresh native session', async () => {
  const apiCalls: string[] = []
  const f = await nativeWorkProduct(false, {
    test: async () => '',
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => { apiCalls.push(context.runId); await context.onDelta('API同一员工回复') },
    extractMemory: async () => [],
  })
  const save = (agent: DigitalAgent, executionBackend: DigitalAgent['executionBackend'], connectionId = '') => f.service.handle('saveAgent', { id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, active: true, allowCommands: false, skillIds: [], knowledgeIds: [], connectionId, modelId: '', executionBackend }) as Promise<DigitalAgent>
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK', mentionIds: [], requestId: 'before-switch-work' }); await f.idle()
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '切换前普通聊天', mentionIds: [], requestId: 'before-switch-chat' }); await f.idle()
    const before = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    const mapping = (await f.store.load<{ threadId: string }>('codexSessions'))[0]
    const identity = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === f.agent.id)!
    const home = await f.service.handle('getAgentHome', { agentId: f.agent.id, conversationId: f.conversation.id }) as AgentHome
    const connection = await f.service.handle('saveConnection', { name: '切换API测试', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'fixture' }) as { id: string }
    const api = await save(identity, { kind: 'mastra-model' }, connection.id)
    expect(api).toMatchObject({ id: identity.id, workspaceRef: identity.workspaceRef, memoryNamespace: identity.memoryNamespace })
    expect(apiCalls).toEqual([])
    expect((await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail).messages).toEqual(before.messages)
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '切换后普通聊天', mentionIds: [], requestId: 'api-new-chat' }); await f.idle()
    expect(apiCalls).toHaveLength(1)
    const current = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === identity.id)!
    await save(current, identity.executionBackend)
    expect(apiCalls).toHaveLength(1)
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '回到本机普通聊天', mentionIds: [], requestId: 'native-new-chat' }); await f.idle()
    expect((await f.store.load<{ threadId: string }>('codexSessions'))[0].threadId).not.toBe(mapping.threadId)
    const after = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(after.workItems).toEqual(before.workItems); expect(after.workBudgets).toEqual(before.workBudgets)
    expect(after.artifacts).toEqual(before.artifacts)
    const restoredHome = await f.service.handle('getAgentHome', { agentId: f.agent.id, conversationId: f.conversation.id }) as AgentHome
    expect(restoredHome).toMatchObject({ workspacePath: home.workspacePath, sessionPath: home.sessionPath, memoryNamespace: home.memoryNamespace })
    expect(after.messages.filter(message => before.messages.some(prior => prior.id === message.id))).toEqual(before.messages)
  } finally { await f.service.close(); await f.store.close() }
})

it.skipIf(process.platform === 'win32')('holds native task admission until an approved command and its child exit, then restarts without replay', async () => {
  const f = await nativeWorkProduct(true), kill = process.kill.bind(process)
  let restarted: AppService | undefined, group: number | undefined, spy: ReturnType<typeof vi.spyOn> | undefined
  const alive = (pid: number) => { try { kill(pid, 0); return true } catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === 'ESRCH') return false; if (code === 'EPERM') return true; throw error } }
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK NATIVE_CANCEL_COMMAND 执行可停止的命令', mentionIds: [], requestId: 'native-cancel' })
    const snapshot = () => f.service.handle('snapshot', undefined) as Promise<Snapshot>
    await expect.poll(async () => (await snapshot()).approvals.length, { timeout: 10000 }).toBe(1)
    const approval = (await snapshot()).approvals[0]!
    const work = (await f.store.load<WorkItem>('workItems'))[0]!
    expect(approval.runId).toBe(work.activeRunId)
    await expect(readFile(join(approval.cwd, 'command-parent.pid'))).rejects.toThrow()
    await f.service.handle('approve', { id: approval.id, approved: true })
    await expect.poll(async () => readFile(join(approval.cwd, 'command-child.pid'), 'utf8').catch(() => ''), { timeout: 5000 }).toMatch(/^\d+$/)
    const parent = Number(await readFile(join(approval.cwd, 'command-parent.pid'), 'utf8')), child = Number(await readFile(join(approval.cwd, 'command-child.pid'), 'utf8'))
    group = -parent
    const connection = await f.service.handle('saveConnection', { name: '运行时切换目标', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'fixture' }) as { id: string }
    const switchInput = { id: f.agent.id, expectedConfigVersion: f.agent.configVersion, name: f.agent.name, role: f.agent.role, instructions: f.agent.instructions, color: f.agent.color, active: true, allowCommands: false, skillIds: [], knowledgeIds: [], connectionId: connection.id, modelId: '', executionBackend: { kind: 'mastra-model' as const } }
    await expect(f.service.handle('saveAgent', switchInput)).rejects.toThrow('员工仍在执行')
    expect(alive(parent)).toBe(true); expect(alive(child)).toBe(true)
    // A controlled OS-exit delay proves admission is tied to the actual tool,
    // not the already-cancelled Work or the stopped external model process.
    spy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => pid === group && signal === 'SIGKILL' ? true : kill(pid, signal))
    await f.service.handle('cancelRun', { conversationId: f.conversation.id, workId: work.id })
    expect((await f.store.load<WorkItem>('workItems')).find(value => value.id === work.id)).toMatchObject({ status: 'cancelled', requiresReview: true, artifactIds: [] })
    await expect(f.service.handle('approve', { id: approval.id, approved: true })).rejects.toThrow('失效')
    const otherAgent = await f.service.handle('saveAgent', { name: '之后的文件员工', role: '', instructions: '', color: '#223344', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: f.agent.executionBackend }) as DigitalAgent
    const other = await f.service.handle('createConversation', { kind: 'direct', title: '退出之后的新工作', agentIds: [otherAgent.id] }) as Conversation
    expect(other.id).not.toBe(f.conversation.id)
    await f.service.handle('sendMessage', { conversationId: other.id, content: 'NATIVE_FILE_TASK 另一个文件工作', mentionIds: [], requestId: 'after-cancel' })
    await expect.poll(async () => (await f.service.handle('getConversation', { id: other.id }) as ConversationDetail).runs.some(run => run.phase === 'execution'), { timeout: 10000 }).toBe(true)
    const waiting = await f.service.handle('getConversation', { id: other.id }) as ConversationDetail
    expect(waiting.runs.find(run => run.phase === 'execution')?.toolEvents).toEqual([])
    expect(waiting.workItems ?? []).toEqual([])
    expect(alive(parent)).toBe(true); expect(alive(child)).toBe(true)
    await expect(f.service.backup(join(f.root, 'busy-backup'))).rejects.toThrow('正在执行')
    await expect(f.service.handle('saveAgent', switchInput)).rejects.toThrow('员工仍在执行')
    spy.mockRestore(); spy = undefined; kill(group, 'SIGKILL')
    await expect.poll(() => alive(group!), { timeout: 5000 }).toBe(false)
    await expect.poll(async () => (await f.service.handle('getConversation', { id: other.id }) as ConversationDetail).workItems?.[0]?.status, { timeout: 10000 }).toBe('delivered')
    await expect.poll(async () => (await f.service.handle('getConversation', { id: other.id }) as ConversationDetail).runs.some(run => run.phase === 'memory' && run.status === 'completed'), { timeout: 10000 }).toBe(true)
    await expect.poll(() => (f.service as unknown as { activeAdapters: Set<string>; runControllers: Map<string, AbortController> }).activeAdapters.has(work.activeRunId!) || (f.service as unknown as { runControllers: Map<string, AbortController> }).runControllers.has(work.activeRunId!)).toBe(false)
    await expect(f.service.handle('saveAgent', switchInput)).rejects.toThrow('待核对工作')
    const before = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    const ticks = await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')
    const budgets = await f.store.load('workBudgets'), calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls.filter(call => call.workId === work.id)).toHaveLength(2)
    expect((before.workBudgets ?? [])[0]).toMatchObject({ usageIncomplete: true, unknownCalls: 1 })
    await f.service.close(); restarted = f.create(); await restarted.init()
    const after = await restarted.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(after.messages).toEqual(before.messages); expect(after.runs).toEqual(before.runs); expect(after.workItems).toEqual(before.workItems)
    expect(await f.store.load('workBudgets')).toEqual(budgets); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
    expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks)
    expect(alive(parent)).toBe(false); expect(alive(child)).toBe(false)
  } finally {
    spy?.mockRestore()
    if (group && alive(group)) { try { kill(group, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    await restarted?.close(); await f.service.close(); await f.store.close()
  }
})

it.each(['same-directory', 'new-directory', 'legacy-backup'] as const)('restores %s without native replay or reusing a transcript that advanced after export', async mode => {
  const f = await nativeWorkProduct(), destination = join(f.root, 'backup')
  let restored: AppService | undefined
  let restoredStore: Awaited<ReturnType<typeof ProductStore.openReadOnly>> | undefined
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'BEFORE_BACKUP 普通聊天', mentionIds: [], requestId: 'before-backup' }); await f.idle()
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK', mentionIds: [], requestId: 'file-before-backup' }); await f.idle()
    const original = (await f.store.load<ArtifactVersion>('artifacts'))[0]!
    await f.service.handle('adoptArtifact', { artifactId: original.id, contentHash: original.contentHash, expectedAdoptionRevision: 0, requestId: 'backup-adoption' })
    const home = await f.service.handle('getAgentHome', { agentId: f.agent.id, conversationId: f.conversation.id }) as AgentHome
    const nativeHome = join(home.sessionPath!, '.codex-private')
    await writeFile(join(nativeHome, 'auth.json'), 'private-runtime-credential-must-not-export')
    await mkdir(join(home.sessionPath!, 'work', '.codex-private')); await writeFile(join(home.sessionPath!, 'work', '.codex-private', 'business.txt'), 'user-owned-output')
    const before = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    const originalMapping = (await f.store.load<{ threadId: string }>('codexSessions'))[0]
    const beforeAdoption = await f.store.load('artifactAdoptionCurrent')
    const callsBefore = await readFile(join(home.sessionPath!, 'work', 'turn-requests.txt'), 'utf8')
    await f.service.backup(destination)
    expect(JSON.parse(await readFile(join(destination, 'backup.json'), 'utf8'))).toMatchObject({ nativeAgentRestorePolicy: 'fresh-session', credentialsIncluded: false })
    expect(await f.store.load('codexRuntime')).toEqual([{ id: 'installation', root: f.dataPath, restorePending: false }])
    const copiedHome = join(destination, 'agents', f.agent.id, 'workspace', 'sessions', f.conversation.id)
    await expect(readFile(join(copiedHome, '.codex-private', 'auth.json'))).rejects.toThrow()
    expect(await readFile(join(copiedHome, 'work', '.codex-private', 'business.txt'), 'utf8')).toBe('user-owned-output')
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'FUTURE_ONLY_SECRET 普通聊天', mentionIds: [], requestId: 'after-backup' }); await f.idle()
    expect((await f.store.load<{ threadId: string }>('codexSessions'))[0].threadId).toBe(originalMapping.threadId)
    expect((await readFile(join(home.sessionPath!, 'work', 'turn-requests.txt'), 'utf8')).length).toBeGreaterThan(callsBefore.length)
    await f.service.close(); await f.store.close()
    const restoredPath = mode === 'new-directory' ? join(f.root, 'restored') : f.dataPath
    if (restoredPath === f.dataPath) await rm(restoredPath, { recursive: true, force: true })
    await cp(destination, restoredPath, { recursive: true })
    if (mode === 'legacy-backup') {
      const legacy = new ProductStore(join(restoredPath, 'boai.sqlite')); await legacy.init()
      try { await legacy.write([], [{ collection: 'codexRuntime', id: 'installation' }]) } finally { await legacy.close() }
    }
    restored = f.create(restoredPath); await restored.init()
    restoredStore = await ProductStore.openReadOnly(join(restoredPath, 'boai.sqlite'))
    const recovered = await restored.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(recovered.messages).toEqual(before.messages)
    expect(recovered.runs).toEqual(before.runs)
    expect(recovered.workItems).toEqual(before.workItems); expect(recovered.workBudgets).toEqual(before.workBudgets)
    expect(await restoredStore.load('artifactAdoptionCurrent')).toEqual(beforeAdoption)
    expect(recovered.artifacts[0]).toMatchObject({ id: original.id, contentHash: original.contentHash, sourceWorkId: original.sourceWorkId })
    expect(await readFile(recovered.artifacts[0].path, 'utf8')).toBe('# Codex proof\nNATIVE_FILE_TASK\n')
    const recoveredHome = await restored.handle('getAgentHome', { agentId: f.agent.id, conversationId: f.conversation.id }) as AgentHome
    expect(await readFile(join(recoveredHome.sessionPath!, 'work', 'turn-requests.txt'), 'utf8')).toBe(callsBefore)
    await expect(readFile(join(recoveredHome.sessionPath!, '.codex-private', 'models_cache.json'))).rejects.toThrow()
    expect((await restoredStore.load('codexSessions'))[0]).toMatchObject({ threadId: originalMapping.threadId, resumeInvalidated: mode === 'legacy-backup' ? 'unverified-installation' : 'restored-backup' })
    await restored.handle('sendMessage', { conversationId: f.conversation.id, content: 'AFTER_RESTORE 普通聊天', mentionIds: [], requestId: 'new-after-restore' }); await f.idle(restored)
    const newMapping = (await restoredStore.load<{ threadId: string; resumeInvalidated?: string }>('codexSessions'))[0]
    expect(newMapping.threadId).not.toBe(originalMapping.threadId)
    expect(newMapping.resumeInvalidated).toBeUndefined()
    const input = JSON.parse(await readFile(join(recoveredHome.sessionPath!, 'work', 'employee-chat-v1-input.json'), 'utf8'))
    expect(input.input[0].text).toContain('BEFORE_BACKUP')
    expect(input.input[0].text).not.toContain('FUTURE_ONLY_SECRET')
    expect(JSON.parse(input.input[0].text).contextMode).toBe('initial')
    expect((await restored.handle('getConversation', { id: f.conversation.id }) as ConversationDetail).workItems).toEqual(before.workItems)
  } finally { await restored?.close(); await restoredStore?.close(); await f.service.close(); await f.store.close() }
})

it('revises the explicitly selected native artifact using a new root and budget while preserving original bytes and adoption', async () => {
  const f = await nativeWorkProduct()
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK', mentionIds: [], requestId: 'original' }); await f.idle()
    const original = (await f.store.load<ArtifactVersion>('artifacts'))[0]!
    const oldWork = (await f.store.load<WorkItem>('workItems'))[0]!, oldBudget = (await f.store.load<WorkBudget>('workBudgets'))[0]!
    await f.service.handle('adoptArtifact', { artifactId: original.id, contentHash: original.contentHash, expectedAdoptionRevision: 0, requestId: 'adopt-original' })
    const revision = { conversationId: f.conversation.id, artifactId: original.id, contentHash: original.contentHash, targetAgentId: f.agent.id, content: 'NATIVE_REVISION 修改原版文件', requestId: 'revise-original' }
    const accepted = await f.service.handle('reviseArtifact', revision) as Message
    expect(await f.service.handle('reviseArtifact', revision)).toEqual(accepted)
    await f.idle()
    const artifacts = await f.store.load<ArtifactVersion>('artifacts'), works = await f.store.load<WorkItem>('workItems')
    expect(artifacts).toHaveLength(2); expect(works).toHaveLength(2)
    const next = artifacts.find(value => value.id !== original.id)!, nextWork = works.find(value => value.id !== oldWork.id)!
    expect(next).toMatchObject({ previousArtifactId: original.id, logicalArtifactId: original.logicalArtifactId, contentVersion: 2, revisionRequestId: revision.requestId, sourceWorkId: nextWork.id })
    expect(nextWork).toMatchObject({ status: 'delivered', rootWorkId: nextWork.id, sourceMessageId: accepted.id })
    expect(nextWork.budgetId).not.toBe(oldWork.budgetId)
    expect(works.find(value => value.id === oldWork.id)).toEqual(oldWork)
    expect((await f.store.load<WorkBudget>('workBudgets')).find(value => value.id === oldBudget.id)).toEqual(oldBudget)
    expect(await readFile(original.path, 'utf8')).toBe('# Codex proof\nNATIVE_FILE_TASK\n')
    expect(await readFile(next.path, 'utf8')).toBe('# Codex proof revised\nNATIVE_REVISION\n')
    expect((await f.store.load<{ artifactId: string }>('artifactAdoptionCurrent'))[0]?.artifactId).toBe(original.id)
  } finally { await f.service.close(); await f.store.close() }
})

it('continues a native waiting task only from the explicit question receipt with its original work, budget and prior effects', async () => {
  const f = await nativeWorkProduct()
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK NATIVE_QUESTION', mentionIds: [], requestId: 'question-task' }); await f.idle()
    const work = (await f.store.load<WorkItem>('workItems'))[0]!, budget = (await f.store.load<WorkBudget>('workBudgets'))[0]!
    expect(work.status).toBe('waiting')
    expect((await f.store.load<BudgetModelCall>('budgetModelCalls')).map(call => call.phase).sort()).toEqual(['decision', 'execution'])
    const question = (await f.service.handle('listInbox', { kind: 'question' }) as InboxPage).items.find(value => value.conversationId === f.conversation.id)!
    expect(question.question?.canReply).toBe(true)
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '普通闲聊，不是对问题的补充', mentionIds: [], requestId: 'unrelated' }); await f.idle()
    expect((await f.store.load<WorkItem>('workItems'))[0]?.status).toBe('waiting')
    const input = { questionId: question.question!.id, expectedRevision: question.question!.revision, content: '用 Codex proof 作为标题', requestId: 'explicit-answer' }
    const answer = await f.service.handle('replyInboxQuestion', input)
    expect(await f.service.handle('replyInboxQuestion', input)).toEqual(answer)
    await f.idle()
    const works = await f.store.load<WorkItem>('workItems'), budgets = await f.store.load<WorkBudget>('workBudgets')
    expect(works).toHaveLength(1); expect(works[0]).toMatchObject({ id: work.id, status: 'delivered', budgetId: budget.id, sourceMessageId: work.sourceMessageId })
    expect(budgets).toHaveLength(1); expect(budgets[0]).toMatchObject({ deadlineAt: budget.deadlineAt, modelCalls: 4, runs: 2 })
    expect((await f.store.load<ConversationDetail['runs'][number]>('runs')).flatMap(run => run.toolEvents).filter(tool => tool.name === 'write_file')).toHaveLength(2)
  } finally { await f.service.close(); await f.store.close() }
})

it('keeps a native waiting task interrupted after restart without replaying effects or accepting a stale answer', async () => {
  const f = await nativeWorkProduct(); let restored: AppService | undefined
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_FILE_TASK NATIVE_QUESTION', mentionIds: [], requestId: 'question-task' }); await f.idle()
    const before = await f.store.load('runs'), question = (await f.service.handle('listInbox', { kind: 'question' }) as InboxPage).items.find(value => value.conversationId === f.conversation.id)!
    await f.service.close(); restored = f.create(); await restored.init()
    expect(await f.store.load('runs')).toHaveLength(before.length)
    expect((await f.store.load<WorkItem>('workItems'))[0]?.status).toBe('interrupted')
    await expect(restored.handle('replyInboxQuestion', { questionId: question.question!.id, expectedRevision: question.question!.revision, content: '旧问题补充', requestId: 'stale' })).rejects.toThrow()
    expect(await restored.handle('getMessageReceipt', { requestId: 'stale' })).toBeNull()
    expect(await f.store.load('artifacts')).toEqual([])
  } finally { await (restored ?? f.service).close(); await f.store.close() }
})

it('delivers authorized material bytes and images to native chat, records scoped memory, and abandons its session after revocation', async () => {
  const f = await nativeWorkProduct()
  try {
    const text = join(f.root, 'source.md'), image = join(f.root, 'image.png'), binary = join(f.root, 'original.bin')
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII='
    await writeFile(text, 'SOURCE_PRIVATE_82cf 原始正文')
    await writeFile(image, Buffer.from(png, 'base64')); await writeFile(binary, Buffer.from([0, 255, 42, 0]))
    const materials: ConversationMaterial[] = []
    for (const path of [text, image, binary]) materials.push(await f.service.handle('prepareMaterial', { conversationId: f.conversation.id, path, requestId: `prepare-${materials.length}`,
      ...(path === image ? { authorizedAgentIds: [f.agent.id] } : {}) }) as ConversationMaterial)
    const message = await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_MEMORY 用户希望使用紫色标题。请看看这些材料。', mentionIds: [], requestId: 'native-materials', materialSelections: materials.map(({ id, revision }) => ({ id, revision })) }) as Message
    await f.idle()
    const home = await f.service.handle('getAgentHome', { agentId: f.agent.id, conversationId: f.conversation.id }) as AgentHome
    const readInput = async () => JSON.parse(await readFile(join(home.sessionPath!, 'work', 'employee-chat-v1-input.json'), 'utf8'))
    const firstInput = await readInput()
    expect(firstInput.input.filter((input: { type: string }) => input.type === 'image')).toEqual([{ type: 'image', url: `data:image/png;base64,${png}` }])
    expect(firstInput.input[0].text).toContain('SOURCE_PRIVATE_82cf')
    expect(firstInput.input[0].text).toContain('Only this metadata is available; no text has been extracted.')
    const memory = (await f.store.load<MemoryEntry>('memory')).find(entry => entry.origin === 'model')!
    expect(memory).toMatchObject({ content: '用户希望使用紫色标题', ownerAgentId: f.agent.id, useScope: 'conversation', sourceMessageIds: [message.id] })
    const first = (await f.store.load<{ threadId: string; materials: unknown[] }>('codexSessions'))[0]
    expect(first.materials).toHaveLength(3)
    for (const collection of ['messages', 'runs', 'snapshots', 'memory', 'codexSessions']) expect(JSON.stringify(await f.store.load(collection))).not.toContain(png)
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '这些图片无需重新发送，继续普通聊天。', mentionIds: [], requestId: 'native-materials-followup' })
    await f.idle()
    expect((await f.store.load<{ threadId: string }>('codexSessions'))[0].threadId).toBe(first.threadId)
    const incremental = await readInput()
    expect(incremental.input.filter((input: { type: string }) => input.type === 'image')).toEqual([])
    expect(JSON.parse(incremental.input[0].text)).toMatchObject({ contextMode: 'incremental', historicalBackground: [] })
    expect(incremental.input[0].text).not.toContain('SOURCE_PRIVATE_82cf')
    const currentImage = (await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail).materials!.find(item => item.id === materials[1].id)!
    await f.service.handle('setMaterialAuthorization', { id: currentImage.id, expectedRevision: currentImage.revision, authorizedAgentIds: [] })
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '普通后续聊天', mentionIds: [], requestId: 'after-revocation' })
    await f.idle()
    expect((await f.store.load<{ threadId: string }>('codexSessions'))[0].threadId).not.toBe(first.threadId)
    expect((await readInput()).input.filter((input: { type: string }) => input.type === 'image')).toEqual([])
    const after = (await f.store.load<{ memories: { id: string }[] }>('codexSessions'))[0]
    expect(after.memories.map(entry => entry.id)).not.toContain(memory.id)
    const finalConfig = JSON.parse(await readFile(join(home.sessionPath!, 'work', 'thread-config.json'), 'utf8'))
    expect(finalConfig.baseInstructions).not.toContain('用户希望使用紫色标题')
    expect(await f.store.load('workItems')).toEqual([])
  } finally { await f.service.close(); await f.store.close() }
})

it('rejects a native memory candidate citing a foreign message without a repair call or saved fact', async () => {
  const f = await nativeWorkProduct()
  try {
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_MEMORY INVALID_SOURCE 用户希望使用紫色标题。', mentionIds: [], requestId: 'invalid-memory' })
    await f.idle()
    const detail = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    const maintenance = detail.runs.filter(run => run.phase === 'memory')
    expect(maintenance).toHaveLength(1)
    expect(maintenance[0]).toMatchObject({ status: 'failed', backend: { kind: 'codex-local', externalInvocations: 1 } })
    expect(maintenance[0].error).toContain('未授权或不存在的来源')
    expect((await f.store.load<MemoryEntry>('memory')).filter(entry => entry.origin === 'model')).toEqual([])
    expect(detail.messages.filter(message => message.senderType === 'agent')).toHaveLength(1)
  } finally { await f.service.close(); await f.store.close() }
})

it('binds native employee skills and knowledge, loads real versioned references and publishes through the existing Work', async () => {
  const f = await nativeWorkProduct()
  try {
    const directory = join(f.root, 'native-proof'); await mkdir(join(directory, 'references'), { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), '---\nname: native-proof\ndescription: Load native resource evidence\n---\nRead references/proof.md and the authorized knowledge.')
    await writeFile(join(directory, 'references/proof.md'), 'SKILL_PROOF_09e741')
    const knowledge = join(f.root, 'knowledge.md'); await writeFile(knowledge, 'KNOWLEDGE_PROOF f3c081b2')
    const skillResource = await f.service.handle('importResource', { kind: 'skill', path: directory }) as Resource
    const knowledgeResource = await f.service.handle('importResource', { kind: 'knowledge', path: knowledge }) as Resource
    await f.service.handle('saveAgent', { id: f.agent.id, name: f.agent.name, role: '', instructions: '', color: '#112233', connectionId: '', modelId: '', skillIds: [skillResource.id], knowledgeIds: [knowledgeResource.id], allowCommands: false, active: true, executionBackend: f.agent.executionBackend })
    await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'NATIVE_RESOURCE_TASK 请使用绑定技能与知识交付文件。', mentionIds: [], requestId: 'native-resources' })
    await f.idle()
    const detail = await f.service.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
    expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
    expect(detail.workItems).toHaveLength(1)
    expect(detail.workItems![0].status).toBe('delivered')
    const artifact = detail.artifacts[0]
    const body = await readFile(artifact.path, 'utf8')
    expect(body).toContain('SKILL_PROOF_09e741'); expect(body).toContain('f3c081b2')
    const task = detail.runs.find(run => run.responseKind === 'task')!
    expect(task.toolEvents.filter(event => event.status === 'completed').map(event => event.name)).toEqual(expect.arrayContaining(['skill', 'skill_read', 'search_knowledge', 'publish_artifact']))
    expect(task.environment?.resourceVersions.map(version => version.id)).toEqual(expect.arrayContaining([skillResource.id, knowledgeResource.id]))
    expect(task.backend?.kind).toBe('codex-local')
  } finally { await f.service.close(); await f.store.close() }
})
