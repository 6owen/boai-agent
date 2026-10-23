/*
 * [OUTPUT]: 新终态任务页沿实际群根展开唯一子工作，逐卡核对可见状态并在两次受控重启后重复核对；静态候选修正不算实跑通过。
 * [OUTPUT]: 真实混合核心委派子工作实际写入时停止群父子树或结束自有Utility的双方向四例候选；原组织独立根已交付保持，单次SQL核对群根等待child v1与未发布子原件，原48/16000/绝对期限、未知用量、实际退出及两次重启零重放另批实跑，不以静态检查计通过。
 * [INPUT]: 原Claude员工/明确API来源、共用Codex连接UI、助手设置与SQLite组织/Work账本。
 * [OUTPUT]: Claude或Codex核心复用另一种已保存本机员工，独立身份/原组织公告/真实依赖文件、共享预算和重启零重放；本场实际退出后继续严格留证。
 * [POS]: 混合本机核心组织BDD；原创建新员工场景保持，不替代自动化或其他故障矩阵。
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
import { addCodexConnection } from '../support/native-connection'
import { systemKeychainLaunch } from '../support/saved-model'
import { verifyLocalAgentNavigation } from '../support/local-agent-navigation'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { crashAutomationRuntime, runtimeChildProcessIds } from '../support/automation-recovery'
import type { Desktop } from '../support/desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { AgentRun, BudgetModelCall, DigitalAgent, WorkBudget, WorkItem, WorkExecution, WorkWake, Message, Conversation, CollaborationStartIntent } from '../../../src/shared/domain'
import type { BoboCollaborationOperation } from '../../../src/shared/domain/bobo-collaboration'

const { Then } = createBdd(test)
async function mixedCoreMembers(runtime: Desktop, state: { employeeId?: string; connectionName?: string; connectionId?: string }, coreKind: string) {
  const page = runtime.page, codexProfile = await addCodexConnection(runtime, true)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill('Codex组织同事')
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('独立文件核对员工')
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('用中文简短回复；只处理用户明确请求或正式分工的工作。文件用宿主工具实际写入和发布；不另建根工作、不联网、不执行命令，不把核对码保存为长期记忆。')
  await editor.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Codex', exact: true }).click()
  await expect(editor.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(codexProfile.name)
  await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('混合核心前从通讯录创建独立Codex员工')
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const claude = before.agents.find(a => a.id === state.employeeId)!, codex = before.agents.find(a => a.name === 'Codex组织同事')!
  expect(claude.executionBackend?.kind).toBe('claude-local')
  expect(codex).toMatchObject({ executionBackend: { kind: 'codex-local', profileId: codexProfile.id }, connectionId: '', allowCommands: false })
  const childEmployee = coreKind === 'Claude' ? codex : claude
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
  await page.getByRole('combobox', { name: '执行后端', exact: true }).click()
  await page.getByRole('option', { name: `本机 ${coreKind} · 聊天与协作`, exact: true }).click()
  await expect(page.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(coreKind === 'Claude' ? '本机 Claude' : codexProfile.name)
  if (coreKind === 'Claude') {
    await page.getByRole('combobox', { name: '模型连接', exact: true }).click()
    await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  } else await expect(page.getByRole('combobox', { name: '模型连接', exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '允许申请运行命令', exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('混合核心原助手设置选择'+coreKind)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(a => a.id === 'bobo')?.executionBackend?.kind).toBe(coreKind === 'Claude' ? 'claude-local' : 'codex-local')
  const configured = await page.evaluate(() => window.boai.request('snapshot', undefined)), core = configured.agents.find(a => a.id === 'bobo')!
  expect(core).toMatchObject({ systemRole: 'core', allowCommands: false, executionBackend: coreKind === 'Claude' ? claude.executionBackend : { kind: 'codex-local', profileId: codexProfile.id }, connectionId: coreKind === 'Claude' ? state.connectionId : '' })
  return { page, codexProfile, claude, codex, childEmployee, configured, core }
}

Then('用户让{string}核心助手组织另一种已保存本机员工并核对原预算和重启', async ({ runtime, claudeEmployee: state }, coreKind: string) => {
  expect(state.real).toBe(true); expect(['Claude', 'Codex']).toContain(coreKind)
  test.skip(process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  test.setTimeout(720000)
  const { page, codexProfile, claude, codex, childEmployee, configured, core } = await mixedCoreMembers(runtime, state, coreKind)
  const request = `请复用通讯录中现有的“${childEmployee.name}”，保持他的原运行方式和独立身份，不新建或更改员工。只把你和他加入“本机混合组织群”，现在组织并执行：你用宿主委派工具让他创建并发布 child.md，正文包含“${state.token}”；随后用依赖工具等待，结束等待回合。接续后实际读取核对子文件，再创建并发布 summary.md，包含同一核对码和子文件名。只需这两个短文件，不联网、不执行命令、不向用户提问，不重复已完成的委派或写入，不把本场内容记为长期偏好。`
  await runtime.reviewData('混合本机核心原请求及独立绑定', { coreKind, request, core, claude, codex, childEmployeeId: childEmployee.id, codexProfile, modelMode: 'real-provider', humanReview: 'pending' })
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await verifyLocalAgentNavigation(runtime, { employeeId: core.id, label: '混合'+coreKind+'核心空白页' })
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), conversations: await store.load('conversations'), messages: await store.load('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), events: await store.load('events'), deliveries: await store.load('deliveries'), decisions: await store.load('decisions'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), organizations: await store.load<BoboCollaborationOperation>('boboCollaborations'), teams: await store.load('teamCreations'), claudeSessions: await store.load('claudeSessions'), codexSessions: await store.load('codexSessions'), traces: await store.load('traceSpans'), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') })
  let scenarioFailure: unknown
  try {
    await expect.poll(async () => (await store.load('workBudgets')).length === 1 || (await store.load<AgentRun>('runs')).some(r => ['failed','cancelled','interrupted'].includes(r.status)), { timeout: 150000 }).toBe(true)
    const initial = await store.load<WorkBudget>('workBudgets'); expect(initial).toHaveLength(1)
    expect(initial[0]).toMatchObject({ maxModelCalls: 48, maxOutputTokens: 16000, callUnit: 'mixed', accounting: 'model-calls-v1' })
    const limits = { id: initial[0].id, deadlineAt: initial[0].deadlineAt, maxModelCalls: initial[0].maxModelCalls, maxOutputTokens: initial[0].maxOutputTokens }
    await runtime.reviewData('混合本机核心原始预算与绝对期限', initial)
    await expect.poll(async () => {
      const actual = await records()
      if (actual.runs.some(r => ['failed','cancelled','interrupted'].includes(r.status))) return true
      return actual.works.length === 3 && actual.works.every(w => w.status === 'delivered') && actual.runs.length > 0 && actual.runs.every(r => r.status === 'completed')
    }, { timeout: 420000, intervals: [500, 1000, 2500] }).toBe(true)
    const actual = await records(); await runtime.reviewData('混合本机核心原持久回执与账本', actual)
    expect(actual.runs.filter(r => r.status !== 'completed')).toEqual([])
    expect(actual.works).toHaveLength(3); expect(actual.works.every(w => w.status === 'delivered' && !w.requiresReview)).toBe(true)
    expect(actual.budgets).toHaveLength(1); expect(actual.budgets[0]).toMatchObject({ ...limits, unknownCalls: 0, usageIncomplete: false })
    expect(actual.works.every(w => w.budgetId === limits.id)).toBe(true)
    expect(actual.calls).toHaveLength(actual.budgets[0].modelCalls)
    expect(new Set(actual.calls.map(c => c.id)).size).toBe(actual.calls.length)
    expect(actual.calls.every(c => c.callUnit === 'external-turn' && !!c.settledAt && c.usageComplete)).toBe(true)
    expect(actual.runs.filter(r => r.agentId === core.id).every(r => r.backend?.kind === core.executionBackend!.kind)).toBe(true)
    expect(actual.runs.filter(r => r.agentId === childEmployee.id).every(r => r.backend?.kind === childEmployee.executionBackend!.kind)).toBe(true)
    expect(actual.runs.some(r => r.agentId === core.id)).toBe(true); expect(actual.runs.some(r => r.agentId === childEmployee.id)).toBe(true)
    expect(actual.runs.some(r => ![core.id, childEmployee.id].includes(r.agentId))).toBe(false)
    expect(actual.teams).toEqual([]); expect(actual.organizations).toHaveLength(1)
    const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    expect(snapshot.agents).toEqual(configured.agents)
    const coreChats = snapshot.conversations.filter(c => c.purpose === 'core'); expect(coreChats).toHaveLength(1)
    const operation = actual.organizations[0]
    expect(operation).toMatchObject({ status: 'committed', mode: 'organize_and_execute', sourceConversationId: coreChats[0].id, budgetId: limits.id, executionBackend: core.executionBackend, connectionId: core.connectionId })
    const group = await page.evaluate(id => window.boai.request('getConversation', { id }), operation.groupConversationId!)
    expect([...group.conversation.agentIds].sort()).toEqual([core.id, childEmployee.id].sort())
    expect(group.messages[0]).toMatchObject({ senderId: core.id, content: operation.announcement!.content })
    const parent = group.workItems!.find(w => w.id === operation.groupRootWorkId)!, child = group.workItems!.find(w => w.parentWorkId === parent.id)!
    expect(parent).toMatchObject({ ownerAgentId: core.id, status: 'delivered', budgetId: limits.id })
    expect(child).toMatchObject({ ownerAgentId: childEmployee.id, status: 'delivered', parentWorkId: parent.id, rootWorkId: parent.id, budgetId: limits.id, sourceMessageId: parent.sourceMessageId })
    const dependency = { workId: child.id, resultVersion: child.resultVersion }
    expect(parent.requiredResults).toContainEqual(dependency); expect(parent.observedResults).toContainEqual(dependency)
    expect(group.artifacts).toHaveLength(2)
    const childFile = group.artifacts.find(a => child.artifactIds.includes(a.id!))!, parentFile = group.artifacts.find(a => parent.artifactIds.includes(a.id!))!
    expect(childFile).toMatchObject({ ownerAgentId: childEmployee.id, name: 'child.md' }); expect(parentFile).toMatchObject({ ownerAgentId: core.id, name: 'summary.md' })
    for (const file of group.artifacts) {
      const bytes = await readFile(file.path); expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.contentHash); expect(bytes.toString()).toContain(state.token)
      await runtime.reviewFile('混合本机组织群交付原件-'+file.name, file.path, { required: true, expectedSha256: file.contentHash })
    }
    expect(await readFile(parentFile.path, 'utf8')).toContain(childFile.name)
    await runtime.reviewData('混合本机组织群原公告与父子交付', group)
    const result = page.getByRole('region', { name: '群协作组织结果', exact: true })
    await expect(result.getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合本机核心原讨论与组织回执')
    await result.getByRole('button', { name: '进入群聊', exact: true }).click()
    await runtime.reviewNativeCheckpoint('混合本机组织群独立员工实际交付')
    const committed = await records()
    await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime))
    const restored = await records()
    for (const key of ['agents','conversations','messages','runs','turns','events','deliveries','decisions','works','budgets','calls','profileCalls','organizations','teams','claudeSessions','codexSessions'] as const) expect(restored[key]).toEqual(committed[key])
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: group.conversation.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
    await runtime.reviewNativeCheckpoint('重启后混合本机组织群与原记录保持')
    expect(runtime.errors).toEqual([])
  } catch (error) {
    scenarioFailure = error; await runtime.reviewData('混合本机核心原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' }); throw error
  } finally {
    try { await runtime.reviewData('混合本机核心最终状态含失败', await records()); await archiveNativeFinalReview(runtime, { label: '混合本机核心', records }) }
    catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], '混合本机核心原场景或结束留证失败') }
    finally { await store.close() }
  }
})

async function mixedCoreProcessStarts(pids: number[]) {
  if (!pids.length) return new Map<number, string>()
  try {
    const { stdout } = await promisify(execFile)('ps', ['-p', pids.join(','), '-o', 'pid=,lstart='])
    return new Map(stdout.trim().split('\n').filter(Boolean).map(line => {
      const match = /^\s*(\d+)\s+(.+)$/.exec(line)
      if (!match) throw new Error('混合核心原进程身份无法核对')
      return [Number(match[1]), match[2]] as const
    }))
  } catch (error) { if ((error as { code?: number }).code === 1) return new Map<number, string>(); throw error }
}

Then('真实混合本机{string}核心委派子工作实际写入后以{string}结束且原树与原件保持', async ({ runtime, claudeEmployee: state }, coreKind: string, ending: string) => {
  expect(state.real).toBe(true); expect(['Claude', 'Codex']).toContain(coreKind); expect(['停止原工作树', '运行服务意外退出']).toContain(ending)
  test.skip(process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  test.setTimeout(720000)
  const crashed = ending === '运行服务意外退出'
  const { page, codexProfile, claude, codex, childEmployee, configured, core } = await mixedCoreMembers(runtime, state, coreKind)
  const request = `请复用通讯录中现有的“${childEmployee.name}”，保持他的原运行方式和独立身份，不新建或更改员工。只把你和他加入“本机混合父子工作群”，现在组织并执行：你用宿主 delegate_work 正式委派唯一子工作，让他先用 write_file 在 self:/work/child-proof.md 写入核对码“${state.token}”与本人明确获派的文件目标及尚未正式发布的准备状态；再依次用 write_file 创建 self:/work/status-01.md 至 status-04.md 四篇有具体内容的状态说明，每篇600–650中文字符、四篇正文合计不超过2600中文字符，依次说明文件目标与核读依据、独立员工的职责及原件来源、准备原件与正式交付的区别、停止和重启时应核对的已有事实。每篇包含编号和同一核对码，只依据公开请求与本人本轮真实工具回执写说明，不虚构未发生操作或未知同事状态，不用重复句或占位文凑字数，每篇只用一次 write_file，不追加、不重写、不创建额外文件。四篇完成前不要发布任何文件，完成后只用 publish_artifact 正式发布 child-proof.md 并汇报真实交付。你收到真实子工作ID后用 wait_for_work 等待其第1版结果，结束本等待回合，不重复委派。只有子文件真实交付后才接续读取核对原文件、创建并发布 summary.md，包含同一核对码和子文件名。保持原共享48次调用、16000输出token和绝对期限，不申请增加预算，不通过等待、延迟或循环写入扩大工作时长；不联网、不运行命令或脚本、不另建独立工作、不向用户提问、不保存长期记忆。`
  await runtime.reviewData('混合核心父子中断原请求与独立配置', { coreKind, ending, request, core, claude, codex, childEmployee, codexProfile, modelMode: 'real-provider', gateMode: 'actual-single-SQL-snapshot-no-artificial-hold', humanReview: 'pending' })
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await verifyLocalAgentNavigation(runtime, { employeeId: core.id, label: '混合核心父子中断空白页' })
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const filename = join(runtime.root, 'v2', 'boai.sqlite'); expect((await stat(filename)).isFile()).toBe(true)
  const client = createClient({ url: pathToFileURL(filename).href, concurrency: 1 })
  await client.execute('PRAGMA query_only=ON')
  const collections = ['agents', 'conversations', 'messages', 'runs', 'turns', 'events', 'deliveries', 'decisions', 'workItems', 'workBudgets', 'budgetModelCalls', 'profileModelCalls', 'boboCollaborations', 'teamCreations', 'claudeSessions', 'codexSessions', 'traceSpans', 'artifacts', 'workExecutions', 'workWakes', 'collaborationStarts', 'artifactPublicationIntents']
  const records = async () => {
    // One SELECT gives the gate a single SQLite read snapshot; no cross-query composition of different moments.
    const result = await client.execute({ sql: `SELECT collection,value FROM records WHERE collection IN (${collections.map(() => '?').join(',')}) ORDER BY rowid`, args: collections })
    const read = <T = Record<string, unknown>>(name: string) => result.rows.filter(row => row.collection === name).map(row => JSON.parse(String(row.value)) as T)
    return { agents: read<DigitalAgent>('agents'), conversations: read<Conversation>('conversations'), messages: read<Message>('messages'), runs: read<AgentRun>('runs'), turns: read('turns'), events: read('events'), deliveries: read('deliveries'), decisions: read('decisions'), works: read<WorkItem>('workItems'), budgets: read<WorkBudget>('workBudgets'), calls: read<BudgetModelCall>('budgetModelCalls'), profileCalls: read('profileModelCalls'), organizations: read<BoboCollaborationOperation>('boboCollaborations'), teams: read('teamCreations'), claudeSessions: read('claudeSessions'), codexSessions: read('codexSessions'), traces: read('traceSpans'), artifacts: read<{ id: string; name: string; path: string; contentHash: string }>('artifacts'), executions: read<WorkExecution>('workExecutions'), wakes: read<WorkWake>('workWakes'), starts: read<CollaborationStartIntent>('collaborationStarts'), publicationIntents: read('artifactPublicationIntents') }
  }
  type Records = Awaited<ReturnType<typeof records>>
  const business = ({ traces: _traces, ...actual }: Records) => actual
  const restart = async () => { await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime)) }
  const identify = (actual: Records) => {
    const operation = actual.organizations[0], organizationWork = actual.works.find(work => work.id === operation?.organizationWorkId), parent = actual.works.find(work => work.id === operation?.groupRootWorkId)
    const children = parent ? actual.works.filter(work => work.parentWorkId === parent.id) : [], child = children[0], run = child ? actual.runs.find(value => value.id === child.activeRunId && value.workId === child.id && value.phase === 'execution') : undefined
    return { operation, organizationWork, parent, children, child, run }
  }
  const held = (actual: Records) => {
    const { operation, organizationWork, parent, children, child, run } = identify(actual)
    return actual.organizations.length === 1 && operation.status === 'committed' && organizationWork?.status === 'delivered' && parent?.status === 'waiting' && !parent.activeRunId && children.length === 1 && child?.status === 'running' && child.resultVersion === 0 && parent.requiredResults.length === 1 && parent.requiredResults[0].workId === child.id && parent.requiredResults[0].resultVersion === 1 && run?.status === 'running' && run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed' && JSON.parse(event.detail ?? '{}').path?.endsWith('/child-proof.md')) && actual.artifacts.length === 0 && actual.runs.some(value => value.agentId === core.id && value.workId === parent.id) && actual.runs.filter(value => value.agentId === core.id).every(value => value.status === 'completed')
  }
  let prepared: { path: string; bytes: Buffer; sha256: string; ino: number; size: number; modified: number } | undefined, identities = new Map<number, string>(), scenarioFailure: unknown, completedChecks = false
  const capturePrepared = async (actual: Records) => {
    if (prepared) return
    const { operation, child } = identify(actual)
    const run = actual.runs.find(value => value.workId === child?.id && value.phase === 'execution' && value.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed' && JSON.parse(event.detail ?? '{}').path?.endsWith('/child-proof.md')))
    if (!operation?.groupConversationId || !child || !run) return
    const receipt = run.toolEvents.find(event => event.name === 'write_file' && event.status === 'completed' && JSON.parse(event.detail ?? '{}').path?.endsWith('/child-proof.md'))!
    const written = JSON.parse(receipt.detail!).path as string
    expect(['self:/work/child-proof.md', `self:/runs/${run.id}/child-proof.md`]).toContain(written)
    const home = await runtime.page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: childEmployee.id, conversationId: operation.groupConversationId })
    const path = join(home.sessionPath!, written.slice('self:/'.length)), bytes = await readFile(path), actualStat = await stat(path)
    expect(bytes.toString()).toContain(state.token); prepared = { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), ino: actualStat.ino, size: actualStat.size, modified: actualStat.mtimeMs }
    await runtime.reviewFile('混合核心子工作实际未发布原件', path, { required: true, expectedSha256: prepared.sha256 })
    await runtime.reviewData('混合核心原件仅沿实际子工作成功回执', { operationId: operation.id, childWorkId: child.id, runId: run.id, toolReceipt: receipt, written, prepared: { path, sha256: prepared.sha256, ino: prepared.ino, size: prepared.size, modified: prepared.modified } })
  }
  try {
    await expect.poll(async () => { const actual = await records(); return actual.budgets.length === 1 || actual.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) }, { timeout: 150000 }).toBe(true)
    const initial = await records(); expect(initial.budgets).toHaveLength(1)
    const budget = initial.budgets[0]
    expect(budget).toMatchObject({ maxModelCalls: 48, maxOutputTokens: 16000, callUnit: 'mixed', accounting: 'model-calls-v1' })
    const limits = { id: budget.id, deadlineAt: budget.deadlineAt, maxModelCalls: budget.maxModelCalls, maxOutputTokens: budget.maxOutputTokens, maxRuns: budget.maxRuns, maxWorkItems: budget.maxWorkItems, maxRetries: budget.maxRetries, maxReportRefreshes: budget.maxReportRefreshes, maxNoProgress: budget.maxNoProgress }
    await runtime.reviewData('混合核心原唯一共享预算与绝对期限', { initial, limits })
    await expect.poll(async () => { const actual = await records(); return held(actual) || actual.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || actual.works.some(work => work.parentWorkId && work.status === 'delivered') }, { timeout: 300000, intervals: [50, 100, 250] }).toBe(true)
    const before = await records(); await capturePrepared(before)
    await runtime.reviewData('混合核心中断前同次SQL原门禁', { before, gateSatisfied: held(before), scope: 'actual group parent-child tree; the already delivered organization root is a separate root, no separate active external dependency case' })
    expect(held(before), '必须同次观察原组织已交付、群根等待真实child第1版且child实际写入后仍运行未发布').toBe(true)
    const { operation, organizationWork, parent, children, child, run } = identify(before)
    expect(before.works).toHaveLength(3); expect(before.budgets).toHaveLength(1); expect(children).toHaveLength(1); expect(before.teams).toEqual([])
    expect(before.agents).toEqual(configured.agents); expect(before.budgets[0]).toMatchObject(limits)
    expect(before.works.every(work => work.budgetId === budget.id)).toBe(true)
    expect(operation).toMatchObject({ status: 'committed', mode: 'organize_and_execute', organizationWorkId: organizationWork!.id, groupRootWorkId: parent!.id, budgetId: budget.id, executionBackend: core.executionBackend, connectionId: core.connectionId })
    expect(organizationWork).toMatchObject({ ownerAgentId: core.id, conversationId: operation.sourceConversationId, sourceMessageId: operation.sourceMessageId, status: 'delivered', requiresReview: false, rootWorkId: organizationWork!.id, budgetId: budget.id })
    expect(organizationWork!.parentWorkId).toBeUndefined(); expect(parent!.parentWorkId).toBeUndefined(); expect(parent!.id).not.toBe(organizationWork!.id)
    const dependency = { workId: child!.id, resultVersion: 1 }
    expect(parent).toMatchObject({ ownerAgentId: core.id, conversationId: operation.groupConversationId, rootWorkId: parent!.id, status: 'waiting', budgetId: budget.id, dependsOnWorkIds: [child!.id], requiredResults: [dependency], artifactIds: [] })
    expect(parent!.waitRevision).toBeGreaterThan(0); expect(parent!.activeRunId).toBeUndefined()
    expect(child).toMatchObject({ ownerAgentId: childEmployee.id, conversationId: parent!.conversationId, parentWorkId: parent!.id, rootWorkId: parent!.id, sourceMessageId: parent!.sourceMessageId, budgetId: budget.id, status: 'running', requiresReview: true, resultVersion: 0, artifactIds: [], resultMessageIds: [] })
    expect(run).toMatchObject({ agentId: childEmployee.id, workId: child!.id, status: 'running', backend: { kind: childEmployee.executionBackend!.kind } })
    expect(before.executions.find(value => value.id === run!.id)).toMatchObject({ workId: child!.id, budgetId: budget.id, status: 'active' })
    expect(before.runs.filter(value => value.agentId === core.id).every(value => value.backend?.kind === core.executionBackend!.kind && value.status === 'completed')).toBe(true)
    expect(before.runs.some(value => ![core.id, childEmployee.id].includes(value.agentId))).toBe(false)
    expect(before.calls.filter(value => value.runId === run!.id)).toHaveLength(1); expect(before.calls.find(value => value.runId === run!.id)?.usageComplete).toBe(false)
    const group = await page.evaluate(id => window.boai.request('getConversation', { id }), operation.groupConversationId!)
    expect([...group.conversation.agentIds].sort()).toEqual([core.id, childEmployee.id].sort())
    expect(group.messages[0]).toMatchObject({ senderId: core.id, content: operation.announcement!.content }); expect(group.artifacts).toEqual([])
    expect(prepared).toBeDefined()
    const originalFile = async () => {
      expect(await readFile(prepared!.path)).toEqual(prepared!.bytes)
      const actualStat = await stat(prepared!.path)
      expect({ ino: actualStat.ino, size: actualStat.size, modified: actualStat.mtimeMs }).toEqual({ ino: prepared!.ino, size: prepared!.size, modified: prepared!.modified })
    }
    const navigate = async () => {
      await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
      await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: group.conversation.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    }
    await navigate(); await runtime.reviewNativeCheckpoint('混合核心群根真实等待与子工作实际准备原件')
    await page.locator('.chat-header').getByRole('button', { name: '会话操作', exact: true }).click(); await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
    const parentCard = page.locator(`.activity-detail [data-work-id="${parent!.id}"]`)
    await expect(parentCard.getByRole('button', { name: '停止此工作及子工作', exact: true })).toBeVisible()
    const utilityPid = await runtime.app.evaluate(({ app }) => {
      const worker = app.getAppMetrics().find(value => value.name === 'BoAI Agent Runtime' && value.type === 'Utility')
      if (!worker) throw new Error('混合核心本场运行服务不存在，不能注入故障')
      return worker.pid
    })
    const pids = await runtimeChildProcessIds(runtime); expect(pids.length).toBeGreaterThan(0)
    const observedPids = [utilityPid, ...pids]; identities = await mixedCoreProcessStarts(observedPids); expect(identities.size).toBe(observedPids.length)
    await runtime.reviewData('混合核心停止精确群树与原独立组织根', { ending, before, limits, operation, organizationWork, parent, child, run, dependency, dependencySemantics: { requiredResultVersion: 1, actualChildResultVersion: child!.resultVersion, actualChildStatus: child!.status, observedMetadata: parent!.observedResults, observedMetadataIsNotProofOfChildDelivery: true }, utilityPid, identities: [...identities], originalFile: { path: prepared!.path, sha256: prepared!.sha256, ino: prepared!.ino, size: prepared!.size, modified: prepared!.modified }, cancellationScope: [parent!.id, child!.id], outsideObservedScope: [organizationWork!.id] })
    const actionGate = await records(); expect(held(actionGate), '注入停止或故障前仍须满足原自然门禁').toBe(true); expect(actionGate.budgets[0]).toMatchObject(limits)
    expect(identify(actionGate).organizationWork).toEqual(organizationWork); expect(Date.now()).toBeLessThan(Date.parse(limits.deadlineAt))
    if (crashed) {
      expect(await runtime.app.evaluate(({ app }) => app.getAppMetrics().find(value => value.name === 'BoAI Agent Runtime' && value.type === 'Utility')?.pid)).toBe(utilityPid)
      await crashAutomationRuntime(runtime); await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
      await expect.poll(async () => [...await mixedCoreProcessStarts(observedPids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
      await runtime.reviewNativeCheckpoint('混合核心自有运行服务实际退出'); await restart()
    } else await parentCard.getByRole('button', { name: '停止此工作及子工作', exact: true }).click()
    await expect.poll(async () => [...await mixedCoreProcessStarts(pids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
    const expectedStatus = crashed ? 'interrupted' : 'cancelled', tree = new Set([parent!.id, child!.id])
    await expect.poll(async () => (await records()).works.filter(work => tree.has(work.id)).map(work => work.status), { timeout: 30000 }).toEqual([expectedStatus, expectedStatus])
    await expect.poll(async () => (await records()).runs.every(value => ['completed', 'failed', 'cancelled', 'interrupted'].includes(value.status)), { timeout: 30000 }).toBe(true)
    const stopped = await records(), stoppedParent = stopped.works.find(work => work.id === parent!.id)!, stoppedChild = stopped.works.find(work => work.id === child!.id)!, originalBudget = stopped.budgets[0]
    expect(stopped.works).toHaveLength(3); expect(stopped.budgets).toHaveLength(1); expect(stopped.organizations).toEqual(before.organizations); expect(stopped.starts).toEqual(before.starts); expect(stopped.teams).toEqual([]); expect(stopped.agents).toEqual(configured.agents)
    expect(stoppedParent).toMatchObject({ id: parent!.id, ownerAgentId: core.id, rootWorkId: parent!.id, conversationId: parent!.conversationId, sourceMessageId: parent!.sourceMessageId, budgetId: budget.id, status: expectedStatus, requiredResults: parent!.requiredResults, observedResults: parent!.observedResults, dependsOnWorkIds: parent!.dependsOnWorkIds, waitRevision: parent!.waitRevision, resultVersion: parent!.resultVersion, resultMessageIds: parent!.resultMessageIds, artifactIds: [] })
    expect(stoppedChild).toMatchObject({ id: child!.id, ownerAgentId: childEmployee.id, parentWorkId: parent!.id, rootWorkId: parent!.id, sourceMessageId: child!.sourceMessageId, budgetId: budget.id, status: expectedStatus, requiresReview: true, resultVersion: 0, resultMessageIds: [], artifactIds: [] })
    expect(stoppedParent.parentWorkId).toBeUndefined(); expect(stoppedParent.activeRunId).toBeUndefined(); expect(stoppedChild.activeRunId).toBeUndefined()
    if (crashed) { expect(stoppedParent.requiresReview).toBe(true); expect(stoppedParent.cancellationCause).toBeUndefined(); expect(stoppedChild.cancellationCause).toBeUndefined() }
    else { expect(stoppedParent.cancellationCause).toBe('user'); expect(stoppedChild.cancellationCause).toBe('user'); expect(stoppedParent.requiresReview).toBe(parent!.requiresReview) }
    expect(stopped.works.filter(work => !tree.has(work.id))).toEqual(before.works.filter(work => !tree.has(work.id)))
    expect(stopped.runs.filter(value => value.id !== run!.id)).toEqual(before.runs.filter(value => value.id !== run!.id))
    expect(stopped.runs.find(value => value.id === run!.id)).toMatchObject({ status: expectedStatus, backend: { kind: childEmployee.executionBackend!.kind } })
    expect(stopped.executions.find(value => value.id === run!.id)?.status).toBe('released'); expect(stopped.executions.some(value => tree.has(value.workId) && value.status === 'active')).toBe(false)
    expect(stopped.wakes.some(value => tree.has(value.workId) && ['pending', 'scheduled'].includes(value.status))).toBe(false)
    expect(stopped.artifacts).toEqual([]); expect(stopped.publicationIntents).toEqual([])
    expect(originalBudget).toMatchObject({ ...limits, callUnit: 'mixed', accounting: 'model-calls-v1', usageIncomplete: true }); expect(originalBudget.unknownCalls).toBeGreaterThanOrEqual(1); expect(originalBudget.renewals).toEqual(budget.renewals)
    expect(originalBudget.modelCalls).toBeLessThanOrEqual(48); expect(stopped.calls).toHaveLength(originalBudget.modelCalls); expect(new Set(stopped.calls.map(value => value.id)).size).toBe(stopped.calls.length)
    expect(stopped.calls.map(value => value.id)).toEqual(actionGate.calls.map(value => value.id)); expect(stopped.calls.every(value => value.budgetId === budget.id && value.collaborationRequestId === operation.requestId)).toBe(true)
    expect(stopped.calls.filter(value => value.runId === run!.id)).toHaveLength(1); expect(stopped.calls.find(value => value.runId === run!.id)?.usageComplete).toBe(false)
    expect(stopped.runs.filter(value => tree.has(value.workId ?? '') && value.phase === 'memory')).toEqual([])
    await originalFile(); await navigate()
    const verifyStoppedTreeUi = async () => {
      const tasks = runtime.page.locator('.chat-panel:visible').getByRole('region', { name: '任务工作视图', exact: true })
      const groupTask = tasks.locator(`[data-work-id="${parent!.id}"]`)
      await expect(groupTask).toBeVisible()
      const childToggle = groupTask.getByRole('button', { name: /^(展开|收起)子工作 · 1$/ })
      await expect(childToggle).toBeVisible()
      if (await childToggle.getAttribute('aria-expanded') === 'false') await groupTask.getByRole('button', { name: '展开子工作 · 1', exact: true }).click()
      await expect(childToggle).toHaveAttribute('aria-expanded', 'true')
      for (const workId of tree) {
        await expect(tasks.locator(`[data-work-id="${workId}"]`)).toBeVisible()
        await expect(tasks.locator(`[data-work-id="${workId}"]`)).toContainText(crashed ? '已中断' : '已停止')
      }
    }
    await verifyStoppedTreeUi()
    await runtime.reviewNativeCheckpoint('混合核心原群父子树已结束且未发布原件保持')
    await runtime.reviewData('混合核心原树终态与未知调用及实际退出', { before, actionGate, stopped, expectedStatus, originalBudget, observedChildProcessesExited: true, observedUtilityExited: crashed, utilityPid, organizationWorkUnchanged: true, actualObservedTree: [...tree], separateActiveExternalDependencyCase: false })
    for (let index = 1; index <= 2; index++) {
      await restart(); const restored = await records(); expect(business(restored)).toEqual(business(stopped)); await originalFile(); await navigate(); await verifyStoppedTreeUi()
      await runtime.reviewData(`混合核心第${index}次受控重启原树零重放`, { stopped, restored, originalFile: { path: prepared!.path, sha256: prepared!.sha256, ino: prepared!.ino, size: prepared!.size, modified: prepared!.modified }, humanReview: 'pending' })
    }
    await runtime.reviewNativeCheckpoint('混合核心两次重启后的原群树与未发布子原件'); expect(runtime.errors).toEqual([]); completedChecks = true
  } catch (error) {
    scenarioFailure = error
    try { const actual = await records(); await capturePrepared(actual); await runtime.reviewData('混合核心中断失败时原树与实际原件', { actual, gateSatisfied: held(actual), failure: error instanceof Error ? error.message : '本场失败' }) }
    catch (evidenceError) { await runtime.reviewData('混合核心中断失败原件留证缺口', { failure: evidenceError instanceof Error ? evidenceError.message : '失败留证缺口' }); throw new AggregateError([error, evidenceError], '混合核心原场景与失败留证均失败') }
    throw error
  } finally {
    try {
      if (prepared) await runtime.reviewFile('混合核心最终实际未发布子原件', prepared.path, { required: true, expectedSha256: prepared.sha256 })
      const beforeClose = await records(); await archiveNativeFinalReview(runtime, { label: '混合核心父子中断', records }); const afterClose = await records()
      await runtime.reviewData('混合核心关闭前后原业务核对', { beforeClose, afterClose, completedChecks, comparisonScope: 'all selected business collections; raw before/after Trace retained separately as observations', failureCleanupDoesNotCountAsPass: Boolean(scenarioFailure) })
      if (completedChecks) expect(business(afterClose)).toEqual(business(beforeClose))
      if (prepared) await runtime.reviewFile('混合核心实际退出后未发布子原件', prepared.path, { required: true, expectedSha256: prepared.sha256 })
    } catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], '混合核心父子中断原场景或严格结束留证失败') }
    finally {
      const remaining = [...await mixedCoreProcessStarts([...identities.keys()])].filter(([pid, started]) => identities.get(pid) === started), cleanup: number[] = []
      for (const [pid] of remaining) { try { process.kill(pid, 'SIGKILL'); cleanup.push(pid) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
      await runtime.reviewData('混合核心父子中断测试清理不计产品通过', { cleanup }); client.close()
    }
  }
})
