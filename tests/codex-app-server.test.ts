/*
 * [OUTPUT]: 模型目录原生档位/显示名保留，重复条目不丢能力，旧字符串接口兼容。
 * [OUTPUT]: 2026-10-11 第13组原生生产合同回归与旧阶段兼容分开；夹具成功不冒充真实模型验收。
 * [OUTPUT]: 2026-10-10 新增进度精确来源/原始思维隔离/有界文本与真实Work参数结果持久检查，无真实供应商调用。
 * [OUTPUT]: 2026-10-10 新增0.161.0/模型目录零推理/验证变化拒绝，以及原Work成果与员工执行IPC冻结来源/原生引用/零新增预算检查。
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
 * [POS]: 旧阶段传输/探测回归；生产原生员工业务已迁至native-conversation/native-lifecycle/native-mixed-collaboration，旧五阶段产品断言退役。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inspectProgram } from '../src/runtime/modules/backends/program'
import { listCodexModelCatalog, listCodexModels, runCodexPhase, testCodexConnection, type CodexPhaseDiagnostic } from '../src/runtime/adapters/codex/turn'
import { observeCodexPhase } from '../src/runtime/adapters/codex/trace'
import type { TraceSpan } from '../src/shared/domain/traces'
import type { LaunchProfile } from '../src/shared/domain/backends'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { EXECUTION_PROGRESS_LIMITS, type ExecutionProgressEvent, type AgentHome, type AutomationDefinition, type AutomationOccurrence, type ArtifactVersion, type BudgetModelCall, type Conversation, type ConversationDetail, type ConversationMaterial, type DigitalAgent, type InboxPage, type MemoryEntry, type Message, type Resource, type Snapshot, type WorkBudget, type WorkItem } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { EmployeeExecutionDetail, EmployeeExecutionPage } from '../src/shared/domain/employee-executions'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('exposes only current-turn public summaries/commentary and preserves the final response', async () => {
  const events: Pick<ExecutionProgressEvent, 'id' | 'kind' | 'text'>[] = []
  const result = await runCodexPhase({ ...await fixture('public-progress'), onProgress: async event => { events.push(event) } })
  expect(result.text).toBe('员工回复：你好🌱')
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'summary', text: '正在整理文档结构。' }),
    expect.objectContaining({ kind: 'commentary', text: '正在准备交付文件。' }),
    expect.objectContaining({ id: 'stage:turn_wait' }),
  ]))
  expect(JSON.stringify(events)).not.toContain('private-')
})
it('bounds external summary identities and text without discarding the actual result', async () => {
  const events = new Map<string, Pick<ExecutionProgressEvent, 'id' | 'kind' | 'text'>>()
  const result = await runCodexPhase({ ...await fixture('bounded-progress'), onProgress: async event => { events.set(event.id, event) } })
  expect(result.text).toBe('员工回复：你好🌱')
  expect([...events.values()].filter(event => event.kind !== 'stage').length).toBeLessThanOrEqual(EXECUTION_PROGRESS_LIMITS.events)
  expect([...events.values()].every(event => event.text.length <= EXECUTION_PROGRESS_LIMITS.text)).toBe(true)
})
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
  expect((await fixture('unknown-version')).profile.verified?.version).toBe('0.160.0') // Current contract probes protocol capabilities instead of a release allowlist.
})

it('loads canonical native models without submitting inference and still rejects changed or unverified programs', async () => {
  const input = await fixture('version-161')
  expect(input.profile.verified?.version).toBe('0.161.0')
  expect(await listCodexModels(input)).toEqual(['gpt-6.1-sol'])
  expect(await listCodexModelCatalog(input)).toEqual([{ value: 'gpt-6.1-sol', displayName: 'Protocol fixture', supportedEffortLevels: ['low', 'high'], supportsEffort: true }])
  await expect(readFile(join(input.cwd, 'turn-requests.txt'))).rejects.toThrow()
  await expect(listCodexModels({ ...input, profile: { ...input.profile, verified: undefined } })).rejects.toThrow('请先测试')
  await expect(listCodexModels({ ...input, profile: { ...input.profile, verified: { ...input.profile.verified!, version: '0.159.3' } } })).rejects.toThrow('版本已变化')
  await expect(listCodexModels(await fixture('model-catalog-repeat'))).rejects.toThrow('游标没有推进')
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
