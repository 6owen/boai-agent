/*
 * [OUTPUT]: v4真实活动核心请求补全原固定路径及真实wait_for_work例外；原自然快照/字数/48共享预算/绝对期限/两次重启断言保持，旧v3失败另存。
 * [OUTPUT]: 预算前置先按本次原会话/消息/本人核对唯一组织Work及原requestId/mode/key/无parent和origin，再沿该Work预算身份核对原48/16000；普通Work明确分类失败，最终组织回执绑定同一原来源。
 * [OUTPUT]: 新请求收窄本人和新子员工的每次公开汇报至80中文字符；退出后按本次核心工作身份核对四个固定文件实件/不存在/失败，原自然门禁和48/16000预算不变。
 * [OUTPUT]: 核心空白首发沿本次原用户消息/新会话回执等待实际ChatView可见后，才编辑新草稿及打开底部；原请求、自然执行门禁和预算保持。
 * [INPUT]: 原真实Claude员工/系统加密来源、bobo原底部设置、单次只读SQLite快照和原保存答复故障支撑。
 * [OUTPUT]: 真实组织/子工作已交付、核心已写未发布且仍实际执行时正常或受理前后未知职责保存；自然门禁、原共享预算/原件、只读核读/载入、两次受控重启及明确新交流逐项留证。
 * [POS]: 第13组活动Claude核心保存的真实BDD候选；无夹具屏障或预置成果，未捕获自然窗口即失败，不代替离线场景或原生未保存关闭。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { test } from './claude-employee.steps'
import type { AgentDelivery, AgentRun, ArtifactVersion, BudgetModelCall, Conversation, DigitalAgent, DiscussionTurn, Message, WorkBudget, WorkExecution, WorkItem } from '../../../src/shared/domain'
import type { BoboCollaborationOperation } from '../../../src/shared/domain/bobo-collaboration'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'
import { installSaveProbe, type SaveProbe } from '../support/agent-config-save'
import { runtimeChildProcessIds } from '../support/automation-recovery'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { systemKeychainLaunch } from '../support/saved-model'
import { MAX_FILE_BYTES, workspaceTarget } from '../../../src/runtime/modules/workspaces/file-access'

const { Then } = createBdd(test)
type ProcessIdentity = { pid: number; group: number; started: string }
type OriginalFile = { path: string; bytes: Buffer; sha256: string; ino: number; size: number; modified: number }
async function liveCoreProcesses(): Promise<ProcessIdentity[]> {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,pgid=,lstart='])
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) throw new Error('真实活动核心进程身份无法核对')
    return { pid: Number(match[1]), group: Number(match[2]), started: match[3] }
  })
}

Then('真实活动Claude核心从底部{string}后保留原组织子成果并两次重启不重放', async ({ runtime, claudeEmployee: state }, saveCase: string) => {
  expect(state.real).toBe(true)
  test.skip(process.env.BOAI_TEST_REAL_CLAUDE !== '1', '真实Claude模型必须显式开启')
  test.skip(process.platform === 'win32', '本场实际核对POSIX进程组，Windows另行验收')
  test.setTimeout(720000)
  expect(['正常保存', '受理前答复丢失', '受理后答复丢失']).toContain(saveCase)
  const mode: SaveProbe['__bottomSave']['mode'] = saveCase === '受理前答复丢失' ? 'before' : saveCase === '受理后答复丢失' ? 'after' : 'normal'
  const page = runtime.page, snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const core = async () => (await snapshot()).agents.find(agent => agent.id === 'bobo')!
  const editor = () => runtime.page.locator('.detail-content:visible')
  const initial = await snapshot(), existing = initial.agents.find(agent => agent.id === state.employeeId)!
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
  await editor().getByRole('combobox', { name: '执行后端', exact: true }).click()
  await page.getByRole('option', { name: '本机 Claude · 聊天与协作', exact: true }).click()
  await editor().getByRole('combobox', { name: '模型连接', exact: true }).click()
  await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  await editor().getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await core()).executionBackend).toEqual(existing.executionBackend)
  const configured = await core()
  expect(configured).toMatchObject({ systemRole: 'core', active: true, allowCommands: false, connectionId: state.connectionId, executionBackend: { kind: 'claude-local' } })
  const request = `请新建唯一独立员工“活动保存文件同事”，职责为核对文件且每次公开汇报不超过80中文字符、只报告工作、文件和真实状态，使用你当前的本机Claude和明确API来源；不复用或更改现有员工。你本人每次公开汇报也不超过80中文字符，只报告工作、文件和真实状态。只把你和他加入“活动Claude核心保存群”，现在组织并执行：你用 delegate_work 正式委派唯一子工作，让他用 write_file 创建 child.md，正文只写核对码“${state.token}”及这是本人独立子工作成果，再用 publish_artifact 正式发布并汇报真实交付。你取得真实子工作ID后用 wait_for_work 等待第1版，结束本等待回合，不重复委派。子工作实际交付后，你读取核对已交付文件，再先用 write_file 在 self:/work/core-proof.md 写入同一核对码、子文件名与实际核对结论；随后依次用 write_file 创建 self:/work/review-01.md、self:/work/review-02.md、self:/work/review-03.md 三份核读说明，每份200–250中文字符、三份合计不超过750中文字符，分别说明独立员工与公开文件来源、准备原件与正式交付的区别、配置变更与重启应保留的已有事实。各份包含编号和同一核对码，只依据原请求与本人本轮真实工具回执，不虚构未知状态、不用占位句凑字数，每份只写一次，不追加、不重写、不新建其他工作。三份说明完成前不要发布核心文件；完成后只正式发布 core-proof.md 并汇报真实交付。保持最初共享48次调用、16000输出token和绝对期限，不申请增加预算，除上述真实依赖的 wait_for_work 声明外，不得人为等待、睡眠、延迟或循环扩大执行时间；不联网、不执行命令、不向用户提问、不保存长期记忆。`
  await runtime.reviewData('真实活动核心保存原始请求与配置', { saveCase, request, requestScope: 'v4-full-fixed-paths-and-real-dependency-wait-only-public-reports-at-most-80-Chinese-characters', configured, existing, modelMode: 'real-provider', gateMode: 'actual-single-SQL-snapshot-no-artificial-hold', humanReview: 'pending' })
  const filename = join(runtime.root, 'v2', 'boai.sqlite')
  expect((await stat(filename)).isFile()).toBe(true)
  const client = createClient({ url: pathToFileURL(filename).href, concurrency: 1 })
  await client.execute('PRAGMA query_only=ON')
  const collections = ['agents', 'conversations', 'messages', 'turns', 'runs', 'events', 'deliveries', 'decisions', 'workItems', 'workBudgets', 'budgetModelCalls', 'profileModelCalls', 'boboCollaborations', 'teamCreations', 'claudeSessions', 'traceSpans', 'artifacts', 'workExecutions', 'workWakes', 'collaborationStarts', 'artifactPublicationIntents']
  const records = async () => {
    // Every gate is one database read snapshot, not values combined across concurrent stages.
    const result = await client.execute({ sql: `SELECT collection,value FROM records WHERE collection IN (${collections.map(() => '?').join(',')}) ORDER BY rowid`, args: collections })
    const read = <T = Record<string, unknown>>(name: string) => result.rows.filter(row => row.collection === name).map(row => JSON.parse(String(row.value)) as T)
    return { agents: read<DigitalAgent>('agents'), conversations: read<Conversation>('conversations'), messages: read<Message>('messages'), turns: read<DiscussionTurn>('turns'), runs: read<AgentRun>('runs'), events: read('events'), deliveries: read<AgentDelivery>('deliveries'), decisions: read('decisions'), works: read<WorkItem>('workItems'), budgets: read<WorkBudget>('workBudgets'), calls: read<BudgetModelCall>('budgetModelCalls'), profileCalls: read<ProfileModelCall>('profileModelCalls'), organizations: read<BoboCollaborationOperation>('boboCollaborations'), teams: read('teamCreations'), sessions: read('claudeSessions'), traces: read('traceSpans'), artifacts: read<ArtifactVersion>('artifacts'), executions: read<WorkExecution>('workExecutions'), wakes: read('workWakes'), starts: read('collaborationStarts'), publicationIntents: read('artifactPublicationIntents') }
  }
  type Records = Awaited<ReturnType<typeof records>>
  const identify = (actual: Records) => {
    const operation = actual.organizations[0], organization = actual.works.find(work => work.id === operation?.organizationWorkId), parent = actual.works.find(work => work.id === operation?.groupRootWorkId)
    const children = actual.works.filter(work => work.parentWorkId === parent?.id), child = children[0]
    const run = actual.runs.find(value => value.id === parent?.activeRunId && value.workId === parent?.id && value.phase === 'execution')
    return { operation, organization, parent, children, child, run }
  }
  const proofReceipt = (run?: AgentRun) => run?.toolEvents.find(event => event.name === 'write_file' && event.status === 'completed' && JSON.parse(event.detail || '{}').path === 'self:/work/core-proof.md')
  const naturalGate = (actual: Records) => {
    const { operation, organization, parent, children, child, run } = identify(actual)
    return actual.organizations.length === 1 && operation.status === 'committed' && organization?.status === 'delivered' && parent?.ownerAgentId === configured.id && parent.status === 'running' && children.length === 1 && child.status === 'delivered' && child.resultVersion === 1 && run?.status === 'running' && !!proofReceipt(run) && !run.toolEvents.some(event => event.name === 'publish_artifact') && parent.artifactIds.length === 0 && actual.artifacts.length === 1 && actual.runs.filter(value => value.id !== run.id).every(value => value.status === 'completed') && actual.calls.filter(value => value.runId !== run.id).every(value => value.usageComplete && !!value.settledAt) && actual.executions.find(value => value.id === run.id)?.status === 'active'
  }
  const failed = (actual: Records) => actual.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))
  const terminal = (actual: Records) => actual.runs.length > 0 && actual.runs.every(run => ['completed', 'cancelled'].includes(run.status)) && actual.turns.every(turn => ['completed', 'cancelled', 'budget_exhausted', 'waiting_user'].includes(turn.status)) && actual.deliveries.every(delivery => ['completed', 'cancelled', 'skipped', 'passed'].includes(delivery.status)) && actual.executions.every(execution => execution.status === 'released')
  const restart = async () => { await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime)) }
  const originalFile = async (path: string): Promise<OriginalFile> => {
    const bytes = await readFile(path), info = await stat(path)
    expect(bytes.toString()).toContain(state.token)
    return { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), ino: info.ino, size: info.size, modified: info.mtimeMs }
  }
  const unchanged = async (file: OriginalFile) => {
    expect(await readFile(file.path)).toEqual(file.bytes)
    const info = await stat(file.path)
    expect({ ino: info.ino, size: info.size, modified: info.mtimeMs }).toEqual({ ino: file.ino, size: file.size, modified: file.modified })
  }
  let installed = false, scenarioFailure: unknown, prepared: OriginalFile | undefined, childOriginal: OriginalFile | undefined
  const completedNotes: OriginalFile[] = []
  try {
    await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    // Clicking send does not await the core-start receipt or the composer replacement.
    const sourceMessages = (actual: Records) => actual.messages.filter(message => message.senderType === 'user' && message.status === 'completed' && message.content === request && actual.conversations.some(conversation => conversation.id === message.conversationId && conversation.purpose === 'core'))
    await expect.poll(async () => sourceMessages(await records()).length).toBe(1)
    const accepted = await records(), sourceMessage = sourceMessages(accepted)[0], sourceConversation = accepted.conversations.find(conversation => conversation.id === sourceMessage.conversationId)!
    expect(initial.conversations.some(conversation => conversation.id === sourceConversation.id)).toBe(false)
    expect(sourceConversation).toMatchObject({ purpose: 'core', agentIds: [configured.id] })
    await expect(page.locator('.core-chat-start')).toHaveCount(0)
    await expect(page.locator('.chat-header .chat-title')).toHaveText(sourceConversation.title)
    await expect(page.locator(`[data-reading-message-id="${sourceMessage.id}"]`)).toContainText(request)
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
    await runtime.reviewData('真实活动核心原首发受理与当前会话界面核对', { sourceConversation, sourceMessage, modelMode: 'real-provider', gate: 'original source message visible in the admitted ChatView; not a model completion or work gate' })
    const draft = '活动Claude核心保存期间尚未发送的新消息'
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
    // Prepare only the original UI draft; it neither pauses nor changes the executing work.
    await page.getByRole('button', { name: '选择模型', exact: true }).click()
    await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '助手名称', exact: true })).toHaveValue(configured.name)
    const role = `真实活动核心${saveCase}的明确职责`
    await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
    await installSaveProbe(runtime); installed = true
    await runtime.app.evaluate((_electron, value) => { (globalThis as SaveProbe).__bottomSave.mode = value }, mode)
    const source = { conversationId: sourceConversation.id, sourceMessageId: sourceMessage.id, ownerAgentId: configured.id }
    const sourceWorks = (actual: Records) => actual.works.filter(work => work.conversationId === source.conversationId && work.sourceMessageId === source.sourceMessageId && work.ownerAgentId === source.ownerAgentId)
    const organizationRequestId = `bobo-collaboration:${sourceMessage.id}`
    const isOrganization = (work: WorkItem) => work.key === 'bobo-organization' && work.organization?.requestId === organizationRequestId && work.organization.mode === 'organize_and_execute' && work.parentWorkId === undefined && work.origin === undefined
    await expect.poll(async () => { const actual = await records(); return sourceWorks(actual).length > 0 || failed(actual) }, { timeout: 150000 }).toBe(true)
    const first = await records(), originalWorks = sourceWorks(first)
    if (originalWorks.length !== 1 || !isOrganization(originalWorks[0])) await runtime.reviewData('真实活动核心原来源组织分类失败', { first, source, originalWorks, organizationRequestId, classification: originalWorks.length === 1 && !originalWorks[0].organization ? 'ordinary-work-claimed-for-original-source' : 'original-source-organization-contract-unavailable-or-invalid', noBudgetUpgradeOrAlternateBudgetSelection: true })
    expect(originalWorks, '本人原会话和原消息必须只有唯一来源Work').toHaveLength(1)
    const sourceOrganization = originalWorks[0]
    expect(sourceOrganization.organization, '本人原消息已认领普通Work或未形成合法组织合同；不能等待改成48或改选其他账本').toMatchObject({ requestId: organizationRequestId, mode: 'organize_and_execute' })
    expect(sourceOrganization).toMatchObject({ ...source, key: 'bobo-organization', collaborationRequestId: organizationRequestId, rootWorkId: sourceOrganization.id })
    expect(sourceOrganization.parentWorkId).toBeUndefined(); expect(sourceOrganization.origin).toBeUndefined()
    expect(first.budgets).toHaveLength(1)
    const sourceBudgets = first.budgets.filter(value => value.id === sourceOrganization.budgetId)
    expect(sourceBudgets, '原组织Work的budgetId必须引用唯一账本').toHaveLength(1)
    const budget = sourceBudgets[0]
    expect(budget).toMatchObject({ id: sourceOrganization.budgetId, collaborationRequestId: organizationRequestId, conversationId: sourceConversation.id })
    expect(budget.origin).toBeUndefined()
    expect(budget).toMatchObject({ maxModelCalls: 48, maxOutputTokens: 16000, callUnit: 'mixed', accounting: 'model-calls-v1' })
    const limits = { id: budget.id, deadlineAt: budget.deadlineAt, maxModelCalls: budget.maxModelCalls, maxOutputTokens: budget.maxOutputTokens, maxRuns: budget.maxRuns, maxWorkItems: budget.maxWorkItems, maxRetries: budget.maxRetries, maxReportRefreshes: budget.maxReportRefreshes, maxNoProgress: budget.maxNoProgress }
    await runtime.reviewData('真实活动核心保存原共享预算与最初绝对期限', { first, limits })
    await expect.poll(async () => { const actual = await records(); return naturalGate(actual) || failed(actual) || identify(actual).parent?.status === 'delivered' }, { timeout: 300000, intervals: [25, 50, 100] }).toBe(true)
    const before = await records()
    if (!naturalGate(before)) await runtime.reviewData('真实活动核心保存自然门禁未满足', { before, gateSatisfied: false })
    expect(naturalGate(before), '必须真实组织和子工作均已交付，核心完成宿主写入后仍执行且未发布；未捕获自然窗口不执行保存').toBe(true)
    const { operation, organization, parent, child, run } = identify(before)
    expect(before.works).toHaveLength(3); expect(before.budgets).toHaveLength(1); expect(before.teams).toEqual([])
    expect(operation).toMatchObject({ status: 'committed', mode: 'organize_and_execute', sourceConversationId: organization!.conversationId, sourceMessageId: organization!.sourceMessageId, groupRootWorkId: parent!.id, budgetId: budget.id, executionBackend: configured.executionBackend, connectionId: configured.connectionId })
    expect(organization).toMatchObject({ ownerAgentId: configured.id, status: 'delivered', rootWorkId: organization!.id, budgetId: budget.id, requiresReview: false })
    expect(operation).toMatchObject({ requestId: organizationRequestId, sourceConversationId: sourceConversation.id, sourceMessageId: sourceMessage.id, organizationWorkId: sourceOrganization.id })
    expect(organization).toMatchObject({ id: sourceOrganization.id, ...source, key: 'bobo-organization', collaborationRequestId: organizationRequestId, organization: { requestId: organizationRequestId, mode: 'organize_and_execute' } })
    expect(organization!.origin).toBeUndefined()
    expect(organization!.parentWorkId).toBeUndefined(); expect(parent!.parentWorkId).toBeUndefined(); expect(parent!.id).not.toBe(organization!.id)
    expect(parent).toMatchObject({ ownerAgentId: configured.id, conversationId: operation!.groupConversationId, status: 'running', activeRunId: run!.id, requiresReview: true, rootWorkId: parent!.id, budgetId: budget.id, artifactIds: [] })
    expect(child).toMatchObject({ ownerAgentId: operation!.agents[0].id, parentWorkId: parent!.id, rootWorkId: parent!.id, sourceMessageId: parent!.sourceMessageId, status: 'delivered', resultVersion: 1, budgetId: budget.id, requiresReview: false })
    expect(operation!.agents).toHaveLength(1); expect(child!.ownerAgentId).not.toBe(configured.id); expect(child!.ownerAgentId).not.toBe(existing.id)
    expect(before.agents.filter(agent => agent.id !== child!.ownerAgentId)).toEqual(initial.agents.map(agent => agent.id === configured.id ? configured : agent))
    const childAgent = before.agents.find(agent => agent.id === child!.ownerAgentId)!
    expect(childAgent).toMatchObject({ executionBackend: configured.executionBackend, connectionId: configured.connectionId, allowCommands: false })
    expect(before.agents.find(agent => agent.id === existing.id)).toEqual(existing)
    expect(parent!.requiredResults).toContainEqual({ workId: child!.id, resultVersion: child!.resultVersion }); expect(parent!.observedResults).toContainEqual({ workId: child!.id, resultVersion: child!.resultVersion })
    expect(parent!.resultMessageIds).toHaveLength(1)
    const waitingReply = before.messages.find(message => message.id === parent!.resultMessageIds[0])!
    expect(waitingReply).toMatchObject({ senderType: 'agent', senderId: configured.id, conversationId: parent!.conversationId, status: 'completed' }); expect(waitingReply.content.trim()).not.toBe('')
    const waitingRun = before.runs.find(value => value.id === waitingReply.runId)!
    expect(waitingRun).toMatchObject({ workId: parent!.id, status: 'completed' }); expect(waitingRun.toolEvents.some(event => event.name === 'wait_for_work' && event.status === 'completed')).toBe(true)
    expect(run).toMatchObject({ agentId: configured.id, workId: parent!.id, status: 'running', backend: { kind: 'claude-local' } })
    expect(run!.toolEvents.some(event => event.name === 'read_file' && event.status === 'completed')).toBe(true)
    expect(before.works.every(work => work.budgetId === budget.id)).toBe(true); expect(before.budgets[0]).toMatchObject(limits)
    expect(before.calls.filter(call => call.runId === run!.id)).toHaveLength(1); expect(before.calls.find(call => call.runId === run!.id)?.usageComplete).toBe(false)
    const childFile = before.artifacts[0]
    expect(child!.artifactIds).toEqual([childFile.id]); expect(childFile.ownerAgentId).toBe(child!.ownerAgentId)
    expect(childFile).toMatchObject({ sourceWorkId: child!.id, contentVersion: 1, contentStatus: 'ready', registrationSource: 'publication' })
    expect(child!.resultMessageIds).toContain(childFile.sourceMessageId)
    expect(before.messages.find(message => message.id === childFile.sourceMessageId)).toMatchObject({ senderId: child!.ownerAgentId, status: 'completed', runId: childFile.runId })
    const childRun = before.runs.find(value => value.id === childFile.runId)!
    expect(childRun).toMatchObject({ agentId: child!.ownerAgentId, workId: child!.id, status: 'completed', backend: { kind: 'claude-local' } })
    expect(childRun.toolEvents.filter(event => event.name === 'publish_artifact' && event.status === 'completed')).toHaveLength(1)
    childOriginal = await originalFile(childFile.path); expect(childOriginal.sha256).toBe(childFile.contentHash)
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: configured.id, conversationId: parent!.conversationId })
    expect(home.sessionPath).toBeTruthy(); prepared = await originalFile(join(home.sessionPath!, 'work', 'core-proof.md'))
    const pids = await runtimeChildProcessIds(runtime), identities = (await liveCoreProcesses()).filter(process => pids.includes(process.pid)), groups = [...new Set(identities.filter(process => pids.includes(process.group)).map(process => process.group))]
    expect(pids.length).toBeGreaterThan(0); expect(identities).toHaveLength(pids.length); expect(groups.length).toBeGreaterThan(0)
    const live = async () => (await liveCoreProcesses()).filter(process => identities.some(old => old.pid === process.pid && old.started === process.started) || groups.includes(process.group))
    const actionGate = await records()
    expect(naturalGate(actionGate), '点击原底部保存前仍须满足同次真实活动门禁').toBe(true)
    expect(identify(actionGate).run!.id).toBe(run!.id); expect(identify(actionGate).child).toEqual(child); expect(identify(actionGate).organization).toEqual(organization)
    expect(actionGate.budgets[0]).toMatchObject(limits); expect(Date.now()).toBeLessThan(Date.parse(limits.deadlineAt))
    // Preserve the original live identities even if saving or its reply assertion fails.
    await runtime.reviewData('真实活动核心保存点击前自然门禁与原进程身份', { saveCase, mode, actionGate, configured, identities, groups, proofReceipt: proofReceipt(run), prepared: { path: prepared.path, sha256: prepared.sha256, ino: prepared.ino, size: prepared.size, modified: prepared.modified }, childFile })
    const finalGate = await records()
    expect(naturalGate(finalGate), '写入留证后点击保存前仍须满足原自然活动门禁').toBe(true)
    expect(identify(finalGate).run!.id).toBe(run!.id); expect(identify(finalGate).child).toEqual(child); expect(identify(finalGate).organization).toEqual(organization)
    expect(finalGate.budgets[0]).toMatchObject(limits); expect(Date.now()).toBeLessThan(Date.parse(limits.deadlineAt))
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    if (mode !== 'normal') {
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
    }
    const saved = await core(), saveCalls = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
    expect(saveCalls).toEqual([{ method: 'saveAgent', admitted: mode !== 'before', expectedConfigVersion: configured.configVersion }])
    expect(saved.configVersion).toBe(configured.configVersion + (mode === 'before' ? 0 : 1)); expect(saved.role).toBe(mode === 'before' ? configured.role : role)
    expect({ ...saved, role: configured.role, configVersion: configured.configVersion }).toEqual(configured)
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    await runtime.reviewData('真实活动核心保存实际来源和精确请求回执', { saveCase, actionGate, finalGate, configured, saved, saveCalls, identities, groups, proofReceipt: proofReceipt(run), prepared: { path: prepared.path, sha256: prepared.sha256, ino: prepared.ino, size: prepared.size, modified: prepared.modified }, childFile })
    await runtime.reviewFile('真实活动核心保存原已发布子文件', childFile.path, { required: true, expectedSha256: childOriginal.sha256 })
    await runtime.reviewFile('真实活动核心保存原实际准备文件', prepared.path, { required: true, expectedSha256: prepared.sha256 })
    if (mode !== 'before') {
      await expect.poll(live, { timeout: 30000, intervals: [50, 100, 250] }).toEqual([])
      await expect.poll(async () => (await records()).runs.find(value => value.id === run!.id)?.status, { timeout: 30000 }).toBe('cancelled')
      const cancelled = await records()
      expect(cancelled.runs.find(value => value.id === run!.id)?.error).toBe('员工配置已变更，请重新执行')
      expect(cancelled.works.find(work => work.id === parent!.id)).toMatchObject({ status: 'cancelled', requiresReview: true, ownerAgentId: parent!.ownerAgentId, sourceMessageId: parent!.sourceMessageId, rootWorkId: parent!.rootWorkId, budgetId: budget.id, artifactIds: [], resultMessageIds: parent!.resultMessageIds })
      expect(cancelled.messages.find(message => message.id === waitingReply.id)).toEqual(waitingReply); expect(cancelled.artifacts).toEqual(before.artifacts)
      expect(cancelled.budgets[0]).toMatchObject({ ...limits, unknownCalls: 1, usageIncomplete: true })
      expect(cancelled.calls.find(call => call.runId === run!.id)?.usageComplete).toBe(false)
      expect(cancelled.executions.find(execution => execution.id === run!.id)?.status).toBe('released')
      await runtime.reviewData('真实活动核心保存已受理后的原取消及实际退出', { saved, saveCalls, cancelled, identities, groups, actualExited: true })
    } else {
      // A rejected save does not freeze normal work progress: the original work may finish naturally.
      const unadmitted = await records()
      expect(unadmitted.agents).toEqual(before.agents); expect(unadmitted.organizations).toEqual(before.organizations); expect(unadmitted.budgets[0]).toMatchObject(limits)
      expect(unadmitted.works.find(work => work.id === parent!.id)?.status).not.toBe('cancelled')
      expect(unadmitted.runs.find(value => value.id === run!.id)?.status).not.toBe('cancelled')
      await runtime.reviewData('真实活动核心保存未受理而原工作自然继续', { saved, saveCalls, unadmitted, naturalProgressAllowed: true })
    }
    if (mode !== 'normal') {
      await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
      await expect(editor().getByText(mode === 'before' ? /版本未变也不作为本次保存的请求回执/ : /配置版本已经变化/)).toBeVisible()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
      expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(saveCalls)
      await runtime.reviewNativeCheckpoint('真实活动核心未知保存冻结草稿与只读核对')
      await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
      await page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '放弃并退出', exact: true }).click()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(saved.role)
      await editor().getByRole('button', { name: '取消', exact: true }).click()
    }
    expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(saveCalls)
    await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
    await expect.poll(async () => { const actual = await records(); return terminal(actual) || actual.runs.some(value => ['failed', 'interrupted'].includes(value.status)) }, { timeout: 420000 }).toBe(true)
    await expect.poll(live, { timeout: 30000 }).toEqual([])
    const settled = await records(); expect(terminal(settled)).toBe(true)
    expect(settled.works).toHaveLength(3); expect(settled.budgets).toHaveLength(1)
    expect(settled.works.find(work => work.id === child!.id)).toEqual(child); expect(settled.works.find(work => work.id === organization!.id)).toEqual(organization)
    expect(settled.organizations).toEqual(before.organizations); expect(settled.agents.filter(agent => agent.id !== configured.id)).toEqual(before.agents.filter(agent => agent.id !== configured.id))
    expect(settled.budgets[0]).toMatchObject({ ...limits, unknownCalls: mode === 'before' ? 0 : 1, usageIncomplete: mode !== 'before' })
    expect(settled.calls).toHaveLength(settled.budgets[0].modelCalls); expect(new Set(settled.calls.map(call => call.id)).size).toBe(settled.calls.length)
    expect(settled.calls.every(call => call.callUnit === 'external-turn' && !!call.settledAt)).toBe(true)
    expect(settled.runs.find(value => value.id === run!.id)?.status).toBe(mode === 'before' ? 'completed' : 'cancelled')
    expect(settled.artifacts).toHaveLength(mode === 'before' ? 2 : 1)
    if (mode === 'before') {
      expect(settled.works.every(work => work.status === 'delivered')).toBe(true); expect(settled.runs.every(value => value.status === 'completed')).toBe(true)
      const parentFile = settled.artifacts.find(file => file.ownerAgentId === configured.id)!
      expect(settled.works.find(work => work.id === parent!.id)?.artifactIds).toEqual([parentFile.id]); expect(parentFile.sourcePath).toBe(prepared.path)
      expect(createHash('sha256').update(await readFile(parentFile.path)).digest('hex')).toBe(parentFile.contentHash)
      expect(await readFile(parentFile.path)).toEqual(prepared.bytes)
    }
    const notePaths = new Set(run!.toolEvents.filter(event => event.name === 'write_file' && event.status === 'completed').map(event => JSON.parse(event.detail || '{}').path as string))
    const finalRun = settled.runs.find(value => value.id === run!.id)!
    for (const event of finalRun.toolEvents.filter(value => value.name === 'write_file' && value.status === 'completed')) {
      const logical = JSON.parse(event.detail || '{}').path as string
      if (/^self:\/work\/review-0[123]\.md$/.test(logical)) {
        const file = await originalFile(join(home.sessionPath!, logical.slice('self:/'.length)))
        completedNotes.push(file)
        await runtime.reviewFile('真实活动核心实际已完成核读说明-' + logical, file.path, { required: true, expectedSha256: file.sha256 })
      }
    }
    expect(new Set(completedNotes.map(file => file.path)).size).toBe(completedNotes.length)
    if (mode === 'before') expect(completedNotes).toHaveLength(3)
    await runtime.reviewData('真实活动核心核读说明按实际完成回执留证', { runId: run!.id, completedBeforeSave: [...notePaths], finalWriteReceipts: finalRun.toolEvents.filter(event => event.name === 'write_file'), completedNotes: completedNotes.map(({ bytes: _bytes, ...file }) => file), noteBaseline: 'captured after original run actually exited; never evidence of unknown or uncompleted write effects' })
    await unchanged(prepared); await unchanged(childOriginal)
    await runtime.reviewData('真实活动核心保存稳定原工作与自然完成分支', { saveCase, before, actionGate, settled, saveCalls, actualExited: true })
    await runtime.reviewNativeCheckpoint('真实活动核心保存原状态和已发布子成果')
    for (let index = 1; index <= 2; index++) {
      await restart(); expect(await records()).toEqual(settled); expect(await core()).toEqual(saved)
      await unchanged(prepared); await unchanged(childOriginal)
      for (const file of completedNotes) await unchanged(file)
      await runtime.reviewData(`真实活动核心保存第${index}次受控重启零重放`, { index, records: await records() })
    }
    await runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await runtime.page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    const explicit = `这是两次重启后明确发送的新普通交流。只复述“${state.token}”并简短确认当前职责，不执行工具、不继续之前的组织工作、不保存长期记忆。`
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(explicit)
    expect(await records()).toEqual(settled)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const actual = await records(), added = actual.runs.filter(value => !settled.runs.some(old => old.id === value.id))
      return added.some(value => ['failed', 'cancelled', 'interrupted'].includes(value.status)) || added.length === 3 && added.every(value => value.status === 'completed') && terminal(actual)
    }, { timeout: 300000 }).toBe(true)
    const final = await records(), newRuns = final.runs.filter(value => !settled.runs.some(old => old.id === value.id))
    expect(newRuns).toHaveLength(3); expect(final.profileCalls).toHaveLength(settled.profileCalls.length + 3)
    for (const next of newRuns) expect(next).toMatchObject({ agentId: saved.id, status: 'completed', backend: saved.executionBackend })
    expect(newRuns.every(value => value.bootstrap?.configVersion === saved.configVersion && value.bootstrap.instructions.includes(saved.role))).toBe(true)
    expect(final.works).toEqual(settled.works); expect(final.budgets).toEqual(settled.budgets); expect(final.calls).toEqual(settled.calls); expect(final.artifacts).toEqual(settled.artifacts); expect(final.organizations).toEqual(settled.organizations)
    const chat = newRuns.find(value => value.phase === 'execution')!, detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.conversationId)
    expect(detail.messages).toHaveLength(2); expect(detail.messages[0]).toMatchObject({ senderType: 'user', content: explicit, status: 'completed' })
    expect(detail.messages[1]).toMatchObject({ senderType: 'agent', senderId: saved.id, runId: chat.id, status: 'completed' }); expect(detail.messages[1].content).toContain(state.token)
    expect(newRuns.every(value => value.toolEvents.length === 0)).toBe(true)
    await unchanged(prepared); await unchanged(childOriginal); expect(runtime.errors).toEqual([])
    for (const file of completedNotes) await unchanged(file)
    await runtime.reviewData('真实活动核心保存两次重启与明确新交流最终核对', { saveCase, saved, settled, final, controlledRestarts: 2, nativeUnsavedCloseTested: false, realModelTested: true })
    await runtime.reviewNativeCheckpoint('真实活动核心保存两次重启后明确新交流')
  } catch (error) {
    scenarioFailure = error
    await runtime.reviewData('真实活动核心保存原场景失败', { saveCase, failure: error instanceof Error ? error.message : '原场景失败' })
    throw error
  } finally {
    const failures: unknown[] = []
    let finalCoreFiles: { workId: string; agentId: string; conversationId: string; sessionPath: string } | undefined
    try { if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()) } catch (error) { failures.push(error) }
    try {
      const actual = await records(), { operation, parent } = identify(actual)
      if (parent && operation) {
        expect(actual.organizations).toHaveLength(1)
        expect(parent).toMatchObject({ id: operation.groupRootWorkId, ownerAgentId: configured.id, conversationId: operation.groupConversationId })
        expect(actual.conversations.some(value => value.id === parent.conversationId && value.agentIds.includes(configured.id))).toBe(true)
        expect(/^[a-zA-Z0-9_-]{1,200}$/.test(configured.id) && /^[a-zA-Z0-9_-]{1,200}$/.test(parent.conversationId)).toBe(true)
        // The product's fixed session path follows this same-attempt G identity, even when activeRunId was cleared.
        finalCoreFiles = { workId: parent.id, agentId: configured.id, conversationId: parent.conversationId, sessionPath: join(runtime.root, 'v2', 'agents', configured.id, 'workspace', 'sessions', parent.conversationId) }
        await runtime.reviewData('真实活动核心结束前固定四文件来源身份', { ...finalCoreFiles, pathSource: 'original product configuration session path', filenames: ['core-proof.md', 'review-01.md', 'review-02.md', 'review-03.md'], runs: actual.runs.filter(value => value.workId === parent.id).map(value => ({ id: value.id, status: value.status, phase: value.phase, writeReceipts: value.toolEvents.filter(event => event.name === 'write_file') })), physicalFilesChecked: false })
      } else await runtime.reviewData('真实活动核心结束前固定四文件来源身份不可用', { parent, operation, physicalFilesChecked: false, reason: 'same-attempt G not created; no other conversation or directory is inspected' })
      // A missed natural window still exports any actually completed preparation receipt.
      if (!prepared) {
        const written = actual.runs.find(value => value.workId === parent?.id && !!proofReceipt(value))
        if (parent && written) {
          if (!finalCoreFiles) throw new Error('实际准备文件缺少已核对的原核心会话身份，不能导出猜测路径')
          prepared = await originalFile(join(finalCoreFiles.sessionPath, 'work', 'core-proof.md'))
          await runtime.reviewData('真实活动核心失败后沿实际成功回执导出准备原件', { workId: parent.id, runId: written.id, proofReceipt: proofReceipt(written), path: prepared.path, sha256: prepared.sha256, ino: prepared.ino, size: prepared.size, modified: prepared.modified })
        }
      }
    } catch (error) { failures.push(error) }
    try { if (prepared) await runtime.reviewFile('真实活动核心保存最终实际准备原件', prepared.path, { required: true, expectedSha256: prepared.sha256 }) } catch (error) { failures.push(error) }
    try { if (childOriginal) await unchanged(childOriginal); if (prepared) await unchanged(prepared); for (const file of completedNotes) await unchanged(file) } catch (error) { failures.push(error) }
    let finalExitVerified = false
    try { await archiveNativeFinalReview(runtime, { label: '真实Claude活动核心保存', records }); finalExitVerified = true } catch (error) { failures.push(error) }
    try {
      if (finalCoreFiles && finalExitVerified) {
        const finalRecords = await records(), sameWork = finalRecords.works.find(value => value.id === finalCoreFiles!.workId)
        expect(sameWork).toMatchObject({ ownerAgentId: finalCoreFiles.agentId, conversationId: finalCoreFiles.conversationId })
        const writeReceipts = finalRecords.runs.filter(value => value.workId === finalCoreFiles!.workId).flatMap(value => value.toolEvents.filter(event => event.name === 'write_file').map(event => ({ runId: value.id, runStatus: value.status, ...event })))
        for (const name of ['core-proof.md', 'review-01.md', 'review-02.md', 'review-03.md']) {
          const path = join(finalCoreFiles.sessionPath, 'work', name), baseline = [prepared, ...completedNotes].find(value => value?.path === path)
          let fileObserved = false
          try {
            await workspaceTarget(join(runtime.root, 'v2'), `agents/${finalCoreFiles.agentId}/workspace/sessions/${finalCoreFiles.conversationId}/work/${name}`)
            const info = await stat(path)
            fileObserved = true
            if (!info.isFile() || info.nlink !== 1 || info.size > MAX_FILE_BYTES) throw new Error('本次固定工作文件不是1MiB内无硬链接的普通文件')
            const bytes = await readFile(path), sha256 = createHash('sha256').update(bytes).digest('hex')
            expect(bytes.length).toBe(info.size)
            await runtime.reviewData('真实活动核心实际退出后固定文件-' + name, { ...finalCoreFiles, finalExitVerified, path, presence: 'exists', sha256, ino: info.ino, size: info.size, modified: info.mtimeMs, expectedSha256: baseline?.sha256, writeReceipts, physicalExistenceDoesNotEstablishCompletedWriteOrDelivery: true })
            // Keep actual bytes even when a write was running/unknown or the original subsequently fails comparison.
            await runtime.reviewFile('真实活动核心实际退出后固定文件原件-' + name, path, { required: true, expectedSha256: sha256 })
            if (baseline) await unchanged(baseline)
          } catch (error) {
            const absent = !fileObserved && (error as NodeJS.ErrnoException).code === 'ENOENT'
            await runtime.reviewData('真实活动核心实际退出后固定文件-' + name + '-读取结果', { ...finalCoreFiles, finalExitVerified, path, fileObserved, presence: absent ? 'absent-at-post-exit-check' : 'read-or-archive-failed', errorCode: (error as NodeJS.ErrnoException).code, failure: error instanceof Error ? error.message : '固定文件留证失败', writeReceipts, absenceDoesNotEstablishToolWasNotCalled: true })
            if (!absent || baseline) failures.push(error)
          }
        }
      } else await runtime.reviewData('真实活动核心固定四文件退出后核对不可用', { finalExitVerified, finalCoreFiles, physicalFilesChecked: false, reason: finalCoreFiles ? 'actual final exit could not be verified; no stable final file claim' : 'same-attempt G identity unavailable; no directory scan' })
    } catch (error) { failures.push(error) }
    client.close()
    if (failures.length) throw new AggregateError(scenarioFailure ? [scenarioFailure, ...failures] : failures, '真实活动核心保存原场景或独立结束留证失败')
  }
})
