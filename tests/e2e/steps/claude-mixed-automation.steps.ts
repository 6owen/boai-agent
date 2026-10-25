/*
 * [OUTPUT]: 新日历输入在原proof后仅十篇600–650中文字符的真实状态说明，总正文不超6500字符后再发布proof；首场旧60份输入达到阶段48工具上限、尚未注入停止的失败保持，手动字面请求及全部断言/预算/期限不变，输入校准不计产品通过。
 * [OUTPUT]: 真实Mastra日历受理后暂停后续计划，沿原混合实际写入停止/服务故障断言核对本次原身份、预算、未发布原件与同事交付；新增双方向四例候选，实际结果归第13组06，不以静态检查计通过。
 * [OUTPUT]: 混合自动化实际写入后停止/服务SIGKILL候选，双向负责人核对原共享预算、同事交付、进程退出与两次重启零重放；原件路径仅取原负责人/执行的成功工具回执，计划同步时刻单独核对，其余字段及业务精确保持，原失败保留，结果归第13组06。
 * [INPUT]: 原Claude员工/明确API来源、共用Codex连接UI、普通群、七项表单与原Mastra触发/SQLite账本。
 * [OUTPUT]: 新增Claude或Codex等待、原问题/实际期限到期后追加的混合自动化候选；首场Claude误选chat失败保留，明确可开工准备阶段后另批复验；旧手动/日历全部业务断言保持，实际结果归第13组06。
 * [OUTPUT]: 两种真实本机员工手动或真实到点自动化，独立根/两原件与原occurrence共享预算、原生触发、重启零重放及最终实际退出留证；受理时预算上限/期限固定，最终计量核对，调用员工沿真实runId关联，手动可选原生ID按值核对。
 * [POS]: 混合本机自动化BDD；原单员工/核心/普通群及API混合场景保持，等待/追加/故障矩阵另验。
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
import { TABLE_SCHEDULE_TRIGGERS } from '@mastra/core/storage'
import { test } from './claude-employee.steps'
import type { Desktop } from '../support/desktop'
import { addCodexConnection } from '../support/native-connection'
import { systemKeychainLaunch } from '../support/saved-model'
import { openSchedule, scheduleAction, scheduleTarget, selectScheduleOption } from '../support/schedule-controls'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { crashAutomationRuntime, runtimeChildProcessIds } from '../support/automation-recovery'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { AgentRun, AutomationDefinition, AutomationDispatch, AutomationOccurrence, BudgetModelCall, DigitalAgent, WorkBudget, WorkItem, Message } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
async function observedProcessStarts(pids: number[]) {
  if (!pids.length) return new Map<number, string>()
  try {
    const { stdout } = await promisify(execFile)('ps', ['-p', pids.join(','), '-o', 'pid=,lstart='])
    return new Map(stdout.trim().split('\n').filter(Boolean).map(line => { const match = /^\s*(\d+)\s+(.+)$/.exec(line)!; return [Number(match[1]), match[2]] }))
  } catch (error) { if ((error as { code?: number }).code === 1) return new Map<number, string>(); throw error }
}
async function mixedAutomationMembers(runtime: Desktop, employeeId: string) {
  const page = runtime.page, codexProfile = await addCodexConnection(runtime, true)
  const newContact = async () => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  }
  await newContact(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const employeeEditor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await employeeEditor.getByRole('textbox', { name: '名称', exact: true }).fill('Codex定时同事')
  await employeeEditor.getByRole('textbox', { name: '角色', exact: true }).fill('独立定时文件交付')
  await employeeEditor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('用中文简短回复。只处理自己明确获派的工作，文件用宿主工具实际写入和发布；不代替其他员工、不另建额外工作、不联网、不运行命令，不把本场内容保存为长期偏好。')
  await employeeEditor.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Codex', exact: true }).click()
  await expect(employeeEditor.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(codexProfile.name)
  await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('混合自动化原通讯录创建Codex员工')
  await employeeEditor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(employeeEditor).toBeHidden()
  const configured = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const claude = configured.agents.find(a => a.id === employeeId)!, codex = configured.agents.find(a => a.name === 'Codex定时同事')!
  expect(claude.executionBackend?.kind).toBe('claude-local')
  expect(codex).toMatchObject({ executionBackend: { kind: 'codex-local', profileId: codexProfile.id }, connectionId: '', allowCommands: false })
  await newContact(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const groupEditor = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const member of [claude, codex]) await groupEditor.locator('label').filter({ hasText: member.name }).getByRole('checkbox').check()
  await runtime.reviewNativeCheckpoint('混合自动化原普通群选择两种员工')
  await groupEditor.getByRole('button', { name: '完成', exact: true }).click(); await expect(groupEditor).toBeHidden()
  const chat = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(c => c.kind === 'group' && c.agentIds.includes(claude.id) && c.agentIds.includes(codex.id))!
  expect([...chat.agentIds].sort()).toEqual([claude.id, codex.id].sort())
  return { page, codexProfile, configured, claude, codex, chat }
}

async function mixedAutomationInterruption(runtime: Desktop, state: { real?: boolean; employeeId?: string; token?: string }, ownerKind: string, ending: string, scheduled: boolean) {
  expect(state.real).toBe(true); expect(['Claude', 'Codex']).toContain(ownerKind); expect(['停止本次', '运行服务意外退出']).toContain(ending)
  test.skip(process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  test.setTimeout(900000)
  const crashed = ending === '运行服务意外退出'
  const { page, configured, claude, codex, chat } = await mixedAutomationMembers(runtime, state.employeeId!)
  const owner = ownerKind === 'Claude' ? claude : codex, peer = ownerKind === 'Claude' ? codex : claude, title = scheduled ? '真实日历混合本机自动化中断验证' : '混合本机自动化中断验证'
  const request = `这次自动化给两位员工分别明确分配独立文件工作，每位都是自己工作的负责人。${peer.name}：只创建并正式发布 completed-peer.md，正文包含“${state.token}”，汇报自己的文件已交付，不等待对方。${owner.name}：这是已经授权且具备开工条件的实际文件工作。先用 write_file 在 self:/work/stop-proof.txt 写入“${state.token}”。然后依次用 write_file 创建 self:/work/check-01.txt 至 check-60.txt，每个文件写入其编号与同一核对码，每次只写一个文件。所有文件写完前不要发布任何文件，写完后只正式发布 stop-proof.txt。每位只处理自己的工作，不代替对方、不委派、不另建额外工作、不联网、不运行命令、不用脚本、不保存长期记忆。`
  const actualRequest = scheduled ? `这次自动化给两位员工分别明确分配独立文件工作，每位都是自己工作的负责人。${peer.name}：只创建并正式发布 completed-peer.md，正文包含“${state.token}”，汇报自己的文件已交付，不等待对方。${owner.name}：这是已经授权且具备开工条件的实际文件工作。先用 write_file 在 self:/work/stop-proof.txt 写入“${state.token}”。然后依次用 write_file 创建 self:/work/check-01.txt 至 check-10.txt，每篇含编号与同一核对码，各写600–650中文字符且十篇正文合计不超过6500中文字符。十篇主题依次是：本次文件工作的目标与验收依据、两位员工独立负责的范围、真实文件与核对码的用途、准备文件与正式发布的区别、原共享预算和绝对期限的使用原则、仅处理本人文件的协作边界、未完成工作如何如实汇报、停止后保留原件而不声称交付的原则、重启只核对已保存事实的原则、最终文件成果的核读步骤。只据本任务公开需求和本人本轮真实工具回执写有具体内容的状态说明，不把未发生操作或未知同事状态写成完成，不用重复句或占位文凑字数。每篇只调用一次 write_file，不追加、不重写、不创建第十一篇，也不通过等待或延迟扩大工作时长。所有十篇写完前不要发布任何文件，写完后只正式发布 stop-proof.txt，最终汇报简短；遵守本次原16000输出token额度，不要求增加预算。每位只处理自己的工作，不代替对方、不委派、不另建额外工作、不联网、不运行命令、不用脚本、不保存长期记忆。` : request
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill(title); await editor.getByLabel('任务描述', { exact: true }).fill(actualRequest)
  await scheduleTarget(page, 'conversation', chat.title + ' · 群聊'); await selectScheduleOption(page, '通知', '静音')
  const due = scheduled ? new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000) : undefined
  if (due) {
    await editor.getByRole('button', { name: '时间', exact: true }).click()
    await page.getByLabel('执行时间', { exact: true }).fill(due.toISOString().slice(11, 16))
    await page.getByLabel('时区', { exact: true }).fill('UTC'); await page.keyboard.press('Escape')
    await runtime.reviewData('混合日历中断原表单与实际时间', { request: actualRequest, configuredTime: due.toISOString(), manualRunActionUsed: false, clockOrLedgerSeeded: false, modelMode: 'real-provider', humanReview: 'pending' })
    await runtime.reviewNativeCheckpoint('混合日历中断七项表单与真实到点配置')
  }
  await editor.getByRole('button', { name: '创建', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  if (!scheduled) await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(value => value.name === title)!
  expect(plan).toMatchObject({ enabled: scheduled, sync: 'synced', conversationPolicy: 'existing-conversation', conversationId: chat.id, notificationPolicy: 'muted' })
  if (scheduled) { expect(plan.nextTimes[0]).toBe(due!.toISOString()); expect(plan.scheduleId).toBeTruthy() }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const clockRecords = async () => {
    const filename = join(runtime.root, 'v2', 'automation-mastra.sqlite'); expect((await stat(filename)).isFile()).toBe(true)
    const client = createClient({ url: pathToFileURL(filename).href, concurrency: 1 })
    try {
      await client.execute('PRAGMA query_only=ON')
      const rows = await client.execute({ sql: `SELECT id,schedule_id,run_id,scheduled_fire_at,actual_fire_at,outcome FROM "${TABLE_SCHEDULE_TRIGGERS}" WHERE schedule_id=? ORDER BY actual_fire_at,id`, args: [plan.scheduleId!] })
      return rows.rows.map(row => ({ id: String(row.id), scheduleId: String(row.schedule_id), runId: row.run_id === null ? null : String(row.run_id), scheduledFireAt: Number(row.scheduled_fire_at), actualFireAt: Number(row.actual_fire_at), outcome: String(row.outcome) }))
    } finally { client.close() }
  }
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), plans: await store.load<AutomationDefinition>('automations'), occurrences: await store.load<AutomationOccurrence>('automationOccurrences'), messages: await store.load<Message>('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), dispatches: await store.load<AutomationDispatch>('automationDispatches'), deliveries: await store.load('deliveries'), events: await store.load('events'), wakes: await store.load('workWakes'), claudeSessions: await store.load('claudeSessions'), codexSessions: await store.load('codexSessions'), ...(scheduled ? { nativeTriggers: await clockRecords() } : {}), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  const restart = async () => { await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime)) }
  const navigate = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
  }
  let identities = new Map<number, string>(), prepared: { path: string; bytes: Buffer; sha256: string; modified: number } | undefined, scenarioFailure: unknown
  let calendarClaim: AutomationOccurrence | undefined, calendarBudget: WorkBudget | undefined
  try {
    const ready = await records(); expect(ready.runs).toEqual([]); expect(ready.works).toEqual([]); expect(ready.budgets).toEqual([])
    if (scheduled) expect(ready.nativeTriggers).toEqual([])
    await runtime.reviewData('混合自动化中断前原配置与请求', { request: actualRequest, ownerKind, ending, owner, peer, plan, configured, ready, humanReview: 'pending' })
    if (scheduled) {
      await expect.poll(async () => {
        const occurrences = (await store.load<AutomationOccurrence>('automationOccurrences')).filter(value => value.automationId === plan.id)
        calendarClaim = occurrences[0]; return occurrences.length
      }, { timeout: 160000, intervals: [500, 1000, 2500] }).toBe(1)
      expect(calendarClaim).toMatchObject({ source: 'schedule', automationId: plan.id, revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduledFor: due!.toISOString() })
      expect(calendarClaim!.nativeRunId).toBeTruthy(); expect(calendarClaim!.budgetId).toBeTruthy()
      expect(['admitted', 'running']).toContain(calendarClaim!.status); expect(calendarClaim!.cancellationRequestedAt).toBeUndefined()
      calendarBudget = (await store.load<WorkBudget>('workBudgets')).find(value => value.id === calendarClaim!.budgetId)!
      expect(calendarBudget).toMatchObject({ maxModelCalls: 24, maxOutputTokens: 16000, accounting: 'model-calls-v1' })
      // Admission commits the original occurrence, budget and dispatch together; pause only the definition after observing that claim.
      await scheduleAction(page, '暂停计划')
    } else {
      await scheduleAction(page, '立即运行一次')
      await expect.poll(async () => (await records()).occurrences.length, { timeout: 30000 }).toBe(1)
    }
    const admitted = (await records()).occurrences[0], initial = (await records()).budgets[0]
    expect(admitted).toMatchObject({ source: scheduled ? 'schedule' : 'manual', conversationId: chat.id, budgetId: initial.id })
    const limits = { id: initial.id, maxModelCalls: initial.maxModelCalls, maxOutputTokens: initial.maxOutputTokens, deadlineAt: initial.deadlineAt }
    expect(initial).toMatchObject({ maxModelCalls: 24, maxOutputTokens: 16000, accounting: 'model-calls-v1' })
    if (scheduled) {
      expect(admitted).toMatchObject({ id: calendarClaim!.id, automationId: plan.id, revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduledFor: due!.toISOString(), nativeRunId: calendarClaim!.nativeRunId, admittedAt: calendarClaim!.admittedAt, budgetId: calendarBudget!.id })
      expect(limits).toEqual({ id: calendarBudget!.id, maxModelCalls: calendarBudget!.maxModelCalls, maxOutputTokens: calendarBudget!.maxOutputTokens, deadlineAt: calendarBudget!.deadlineAt })
      expect(admitted.nativeRunId).toBeTruthy(); expect(admitted.manualRequestId).toBeUndefined()
      expect(admitted.cancellationRequestedAt).toBeUndefined()
      expect(Date.parse(admitted.admittedAt ?? admitted.startedAt)).toBeGreaterThanOrEqual(due!.getTime())
      const paused = await records(), pausedPlan = paused.plans.find(value => value.id === plan.id)!, dispatch = paused.dispatches.find(value => value.id === admitted.id)!
      expect(pausedPlan).toMatchObject({ enabled: false, sync: 'synced', revision: plan.revision + 1, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduleId: plan.scheduleId, prompt: plan.prompt, conversationId: chat.id, authorizedFingerprint: plan.authorizedFingerprint })
      const { nextTimes: _nextTimes, latestOccurrence: _latestOccurrence, attentionCount: _attentionCount, enabled: _enabled, revision: _revision, updatedAt: _updatedAt, syncedAt: _syncedAt, appliedRevision: _appliedRevision, ...originalDefinition } = plan
      const { enabled: _pausedEnabled, revision: _pausedRevision, updatedAt: _pausedUpdatedAt, syncedAt: _pausedSyncedAt, appliedRevision: _pausedAppliedRevision, ...pausedDefinition } = pausedPlan
      expect(pausedDefinition).toEqual(originalDefinition); expect(pausedPlan.appliedRevision).toBe(plan.revision + 1)
      expect(Date.parse(pausedPlan.updatedAt)).toBeGreaterThanOrEqual(Date.parse(plan.updatedAt))
      expect(plan.syncedAt).toBeTruthy(); expect(pausedPlan.syncedAt).toBeTruthy()
      expect(Date.parse(pausedPlan.syncedAt!)).toBeGreaterThanOrEqual(Date.parse(plan.syncedAt!))
      expect(dispatch).toMatchObject({ origin: { occurrenceId: admitted.id }, definition: { revision: plan.revision, executionRevision: plan.executionRevision, enabled: true } })
      expect(['admitted', 'running']).toContain(admitted.status); expect(['pending', 'started']).toContain(dispatch.status)
      await expect.poll(async () => await clockRecords(), { timeout: 30000 }).toMatchObject([{ scheduleId: plan.scheduleId, runId: admitted.nativeRunId, scheduledFireAt: due!.getTime(), outcome: 'published' }])
      const nativeTriggers = await clockRecords(); expect(nativeTriggers).toHaveLength(1); expect(nativeTriggers[0].actualFireAt).toBeGreaterThanOrEqual(due!.getTime())
      await runtime.reviewData('真实日历原受理后仅暂停后续计划', { claimedBeforePause: calendarClaim, budgetBeforePause: calendarBudget, admitted, initial, limits, plan, pausedPlan, dispatch, nativeTriggers, manualRunActionUsed: false, clockOrLedgerSeeded: false, currentOccurrenceCancelledByPause: false })
      await runtime.reviewNativeCheckpoint('真实日历本次受理后后续计划已暂停')
    }
    await expect.poll(async () => {
      const actual = await records()
      return actual.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || actual.works.some(work => work.ownerAgentId === peer.id && work.status === 'delivered') && actual.runs.some(run => run.agentId === owner.id && run.phase === 'execution' && run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed')) && actual.runs.filter(run => run.agentId === peer.id).every(run => run.status === 'completed')
    }, { timeout: 300000, intervals: [50, 100, 250] }).toBe(true)
    const before = await records(), detail = await read(), work = before.works.find(value => value.ownerAgentId === owner.id)!, peerWork = before.works.find(value => value.ownerAgentId === peer.id)!, run = before.runs.find(value => value.workId === work?.id && value.phase === 'execution')!, peerFile = detail.artifacts.find(value => peerWork?.artifactIds.includes(value.id!))!
    expect(before.works).toHaveLength(2); expect(before.budgets).toHaveLength(1)
    expect(work).toMatchObject({ status: 'running', requiresReview: true, budgetId: initial.id, origin: { occurrenceId: admitted.id } })
    expect(peerWork).toMatchObject({ status: 'delivered', requiresReview: false, budgetId: initial.id, origin: { occurrenceId: admitted.id } })
    expect(work.parentWorkId).toBeUndefined(); expect(peerWork.parentWorkId).toBeUndefined()
    expect(run).toMatchObject({ status: 'running', backend: { kind: owner.executionBackend!.kind } })
    if (scheduled) {
      expect(before.occurrences).toHaveLength(1)
      expect(before.occurrences[0]).toMatchObject({ id: admitted.id, source: 'schedule', revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduledFor: due!.toISOString(), nativeRunId: admitted.nativeRunId, budgetId: initial.id, status: 'running' })
      expect(before.occurrences[0].cancellationRequestedAt).toBeUndefined(); expect(before.occurrences[0].manualRequestId).toBeUndefined()
      expect(before.plans.find(value => value.id === plan.id)).toMatchObject({ enabled: false, sync: 'synced', revision: plan.revision + 1 })
      expect(before.budgets[0]).toMatchObject(limits); expect(before.nativeTriggers).toHaveLength(1)
    }
    expect(before.runs.filter(value => value.agentId === peer.id).every(value => value.status === 'completed')).toBe(true)
    expect(peerFile).toMatchObject({ name: 'completed-peer.md', ownerAgentId: peer.id }); expect(detail.artifacts).toHaveLength(1)
    const peerBytes = await readFile(peerFile.path), peerModified = (await stat(peerFile.path)).mtimeMs
    expect(createHash('sha256').update(peerBytes).digest('hex')).toBe(peerFile.contentHash); expect(peerBytes.toString()).toContain(state.token)
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: owner.id, conversationId: chat.id })
    const receipt = run.toolEvents.find(value => value.name === 'write_file' && value.status === 'completed' && JSON.parse(value.detail ?? '{}').path?.endsWith('/stop-proof.txt'))
    expect(receipt).toBeDefined()
    const written = JSON.parse(receipt!.detail!).path as string
    expect(['self:/work/stop-proof.txt', `self:/runs/${run.id}/stop-proof.txt`]).toContain(written)
    const path = join(home.sessionPath!, written.slice('self:/'.length)), bytes = await readFile(path)
    expect(bytes.toString()).toContain(state.token); prepared = { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), modified: (await stat(path)).mtimeMs }
    await runtime.reviewFile('混合自动化停止前负责人未发布原件', path, { required: true, expectedSha256: prepared.sha256 })
    await runtime.reviewFile('混合自动化停止前同事已交付原件', peerFile.path, { required: true, expectedSha256: peerFile.contentHash })
    const pids = await runtimeChildProcessIds(runtime); expect(pids.length).toBeGreaterThan(0); identities = await observedProcessStarts(pids); expect(identities.size).toBe(pids.length)
    await runtime.reviewData('混合自动化中断前实际写入与同事交付', { before, limits, admitted, work, peerWork, run, identities: [...identities], prepared: { path, sha256: prepared.sha256, modified: prepared.modified }, peerFile })
    if (crashed) {
      await crashAutomationRuntime(runtime); await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
      await expect.poll(async () => [...await observedProcessStarts(pids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
      await runtime.reviewNativeCheckpoint('混合自动化服务实际退出原界面'); await restart()
    } else {
      await openSchedule(page, title); expect((await records()).runs.find(value => value.id === run.id)?.status).toBe('running')
      await page.locator(`[data-occurrence-id="${admitted.id}"]`).getByRole('button', { name: '停止本次', exact: true }).click()
    }
    await expect.poll(async () => [...await observedProcessStarts(pids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
    const expectedStatus = crashed ? 'interrupted' : 'cancelled'
    await expect.poll(async () => (await records()).works.find(value => value.id === work.id)?.status, { timeout: 30000 }).toBe(expectedStatus)
    await expect.poll(async () => (await records()).runs.every(value => ['completed', 'failed', 'cancelled', 'interrupted'].includes(value.status)), { timeout: 30000 }).toBe(true)
    const stopped = await records(), originalBudget = stopped.budgets[0], occurrence = stopped.occurrences[0]
    expect(stopped.works.find(value => value.id === work.id)).toMatchObject({ id: work.id, status: expectedStatus, requiresReview: true, sourceMessageId: work.sourceMessageId, budgetId: initial.id, artifactIds: [], resultMessageIds: [] })
    expect(stopped.runs.find(value => value.id === run.id)).toMatchObject({ status: expectedStatus, backend: { kind: owner.executionBackend!.kind } })
    expect(stopped.works.find(value => value.id === peerWork.id)).toEqual(peerWork)
    expect(stopped.runs.filter(value => value.agentId === peer.id)).toEqual(before.runs.filter(value => value.agentId === peer.id))
    expect(stopped.artifacts).toEqual(before.artifacts); expect(stopped.agents).toEqual(configured.agents)
    expect(stopped.runs.filter(value => value.agentId === owner.id && value.phase === 'memory')).toEqual([])
    expect(originalBudget).toMatchObject({ ...limits, callUnit: 'mixed', unknownCalls: 1, usageIncomplete: true })
    expect(stopped.calls.filter(value => value.runId === run.id)).toHaveLength(1); expect(stopped.calls.find(value => value.runId === run.id)?.usageComplete).toBe(false)
    expect(new Set(stopped.calls.map(value => value.id)).size).toBe(stopped.calls.length)
    expect(stopped.calls.every(value => value.origin?.occurrenceId === admitted.id && value.budgetId === initial.id)).toBe(true)
    expect(occurrence).toMatchObject({ id: admitted.id, status: expectedStatus, conversationId: chat.id, budgetId: initial.id, usageIncomplete: true })
    if (scheduled) {
      expect(stopped.occurrences).toHaveLength(1)
      expect(occurrence).toMatchObject({ source: 'schedule', revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, scheduledFor: due!.toISOString(), nativeRunId: admitted.nativeRunId })
      expect(occurrence.manualRequestId).toBeUndefined(); expect(stopped.nativeTriggers).toEqual(before.nativeTriggers)
      expect(stopped.plans.find(value => value.id === plan.id)).toMatchObject({ enabled: false, sync: 'synced', revision: plan.revision + 1 })
    }
    const originalFiles = async () => {
      expect(await readFile(path)).toEqual(bytes); expect((await stat(path)).mtimeMs).toBe(prepared!.modified)
      expect(await readFile(peerFile.path)).toEqual(peerBytes); expect((await stat(peerFile.path)).mtimeMs).toBe(peerModified)
    }
    await originalFiles(); await navigate()
    const tasks = runtime.page.locator('.chat-panel:visible').getByRole('region', { name: '任务工作视图', exact: true })
    await expect(tasks.locator(`[data-work-id="${work.id}"]`)).toContainText(crashed ? '已中断' : '已停止'); await expect(tasks.locator(`[data-work-id="${peerWork.id}"]`)).toContainText('已交付')
    await runtime.reviewNativeCheckpoint('混合自动化原负责人已结束且同事仍已交付')
    await runtime.reviewData('混合自动化中断后的原共享预算与业务', { stopped, originalBudget, occurrence, allObservedProcessesExited: true, publishedOnlyPeer: true })
    for (let index = 1; index <= 2; index++) {
      await restart(); const restored = await records()
      const { plans: restoredPlans, ...restoredBusiness } = restored, { plans: stoppedPlans, ...stoppedBusiness } = stopped
      expect(restoredBusiness).toEqual(stoppedBusiness); expect(restoredPlans).toHaveLength(stoppedPlans.length)
      for (const [position, savedPlan] of stoppedPlans.entries()) {
        const { syncedAt: originalSync, ...originalDefinition } = savedPlan, { syncedAt: latestSync, ...restoredDefinition } = restoredPlans[position]
        expect(restoredDefinition).toEqual(originalDefinition)
        expect(originalSync).toBeTruthy(); expect(latestSync).toBeTruthy()
        expect(Date.parse(latestSync!)).toBeGreaterThanOrEqual(Date.parse(originalSync!))
      }
      await originalFiles(); await navigate()
      await runtime.reviewData(`混合自动化第${index}次重启零重放`, { stopped, restored, prepared: { sha256: prepared.sha256, modified: prepared.modified }, peerFile: { sha256: peerFile.contentHash, modified: peerModified } })
    }
    await runtime.reviewNativeCheckpoint('混合自动化两次重启后的原负责人和同事交付'); expect(runtime.errors).toEqual([])
  } catch (error) { scenarioFailure = error; await runtime.reviewData('混合自动化中断原场景失败', { failure: error instanceof Error ? error.message : '本场失败' }); throw error }
  finally {
    try {
      if (prepared) await runtime.reviewFile('混合自动化最终未发布原件', prepared.path, { required: true, expectedSha256: prepared.sha256 })
      await archiveNativeFinalReview(runtime, { label: '混合自动化中断', records: async () => ({ ...await records(), traces: await store.load('traceSpans') }) })
    } catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], '混合自动化中断原场景或结束留证失败') }
    finally {
      const remaining = [...await observedProcessStarts([...identities.keys()])].filter(([pid, started]) => identities.get(pid) === started), cleanup: number[] = []
      for (const [pid] of remaining) { try { process.kill(pid, 'SIGKILL'); cleanup.push(pid) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
      await runtime.reviewData('混合自动化中断测试清理不计产品通过', { cleanup }); await store.close()
    }
  }
}

Then('混合本机自动化在{string}实际写入后以{string}结束且保留同事交付', async ({ runtime, claudeEmployee: state }, ownerKind: string, ending: string) => {
  await mixedAutomationInterruption(runtime, state, ownerKind, ending, false)
})

Then('真实Mastra日历触发的混合本机自动化在{string}实际写入后以{string}结束且保留同事交付', async ({ runtime, claudeEmployee: state }, ownerKind: string, ending: string) => {
  await mixedAutomationInterruption(runtime, state, ownerKind, ending, true)
})

Then('用户让两种本机员工通过{string}共用原自动化预算并分别交付', async ({ runtime, claudeEmployee: state }, trigger: string) => {
  expect(state.real).toBe(true); expect(['手动触发', '日历触发']).toContain(trigger)
  test.skip(process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  test.setTimeout(720000)
  const scheduled = trigger === '日历触发'
  const { page, codexProfile, configured, claude, codex, chat } = await mixedAutomationMembers(runtime, state.employeeId!)
  const title = '两种本机员工自动交付', request = `这次定时任务给两位员工分别明确分配独立文件工作，每位都是自己工作的负责人：${claude.name}只创建并正式发布 claude-auto.md，正文包含“${state.token}”；${codex.name}只创建并正式发布 codex-auto.md，正文包含同一核对码。每位只处理并汇报自己的一个文件，不代替对方、不委派、不等待对方、不联网、不运行命令，不要求用户补充，不保存长期记忆。`
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill(title)
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'conversation', chat.title + ' · 群聊')
  await selectScheduleOption(page, '通知', '静音')
  const due = new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000)
  await editor.getByRole('button', { name: '时间', exact: true }).click()
  await page.getByLabel('执行时间', { exact: true }).fill(due.toISOString().slice(11, 16))
  await page.getByLabel('时区', { exact: true }).fill('UTC'); await page.keyboard.press('Escape')
  await runtime.reviewData('混合本机自动化原请求配置与实际时间', { request, trigger, scheduledFor: scheduled ? due.toISOString() : undefined, configuredTime: due.toISOString(), claude, codex, codexProfile, target: chat, manualRunActionUsed: !scheduled, clockOrLedgerSeeded: false, modelMode: 'real-provider', humanReview: 'pending' })
  await runtime.reviewNativeCheckpoint('七项表单明确选择混合本机群与时间')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  if (!scheduled) await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === title)!
  expect(plan).toMatchObject({ enabled: scheduled, sync: 'synced', conversationPolicy: 'existing-conversation', conversationId: chat.id, notificationPolicy: 'muted' })
  if (scheduled) expect(plan.nextTimes[0]).toBe(due.toISOString())
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const clockRecords = async () => {
    const filename = join(runtime.root, 'v2', 'automation-mastra.sqlite'); expect((await stat(filename)).isFile()).toBe(true)
    const client = createClient({ url: pathToFileURL(filename).href, concurrency: 1 })
    try {
      await client.execute('PRAGMA query_only=ON')
      const rows = await client.execute({ sql: `SELECT id,schedule_id,run_id,scheduled_fire_at,actual_fire_at,outcome FROM "${TABLE_SCHEDULE_TRIGGERS}" WHERE schedule_id=? ORDER BY actual_fire_at,id`, args: [plan.scheduleId!] })
      return rows.rows.map(row => ({ id: String(row.id), scheduleId: String(row.schedule_id), runId: row.run_id === null ? null : String(row.run_id), scheduledFireAt: Number(row.scheduled_fire_at), actualFireAt: Number(row.actual_fire_at), outcome: String(row.outcome) }))
    } finally { client.close() }
  }
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), plans: await store.load<AutomationDefinition>('automations'), occurrences: await store.load<AutomationOccurrence>('automationOccurrences'), messages: await store.load('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), traces: await store.load('traceSpans'), dispatches: await store.load('automationDispatches'), claudeSessions: await store.load('claudeSessions'), codexSessions: await store.load('codexSessions'), nativeTriggers: await clockRecords(), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') })
  let scenarioFailure: unknown
  try {
    const ready = await records(); expect(ready.runs).toEqual([]); expect(ready.works).toEqual([]); expect(ready.budgets).toEqual([]); expect(ready.nativeTriggers).toEqual([])
    await runtime.reviewData('混合自动化触发前原计划与零业务状态', ready)
    if (!scheduled) await scheduleAction(page, '立即运行一次')
    await expect.poll(async () => (await store.load<AutomationOccurrence>('automationOccurrences')).filter(o => o.automationId === plan.id).length, { timeout: 160000, intervals: [500, 1000, 2500] }).toBe(1)
    const admitted = (await store.load<AutomationOccurrence>('automationOccurrences'))[0], initial = (await store.load<WorkBudget>('workBudgets'))[0]
    expect(admitted).toMatchObject({ source: scheduled ? 'schedule' : 'manual', conversationId: chat.id, budgetId: initial.id })
    if (scheduled) { expect(admitted.scheduledFor).toBe(due.toISOString()); expect(admitted.nativeRunId).toBeTruthy(); expect(Date.parse(admitted.admittedAt ?? admitted.startedAt)).toBeGreaterThanOrEqual(due.getTime()) }
    const limits = { id: initial.id, deadlineAt: initial.deadlineAt, maxModelCalls: initial.maxModelCalls, maxOutputTokens: initial.maxOutputTokens }
    await runtime.reviewData('混合自动化唯一受理与最初预算', { admitted, initial, nativeTriggers: await clockRecords() })
    expect(initial).toMatchObject({ maxModelCalls: 24, maxOutputTokens: 16000, accounting: 'model-calls-v1' })
    await expect.poll(async () => {
      const r = await records(), occurrence = r.occurrences.find(o => o.id === admitted.id)!
      if (['failed', 'cancelled', 'interrupted', 'needs_review', 'waiting_user', 'waiting_approval', 'waiting_work'].includes(occurrence.status) || r.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))) return true
      return occurrence.status === 'completed' && r.runs.length > 0 && r.runs.every(run => run.status === 'completed')
    }, { timeout: 420000, intervals: [500, 1000, 2500] }).toBe(true)
    const actual = await records(); await runtime.reviewData('混合自动化本次终态与原账本', actual)
    const occurrence = actual.occurrences[0], budget = actual.budgets[0]
    expect(actual.occurrences).toHaveLength(1); expect(actual.budgets).toHaveLength(1)
    expect(occurrence).toMatchObject({ id: admitted.id, status: 'completed', source: scheduled ? 'schedule' : 'manual', deliveryStatus: 'delivered', conversationId: chat.id, budgetId: initial.id, usageIncomplete: false })
    expect(budget).toMatchObject({ ...limits, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false }); expect(budget.renewals).toBeUndefined()
    expect(actual.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(new Set(actual.runs.map(run => run.agentId))).toEqual(new Set([claude.id, codex.id]))
    for (const member of [claude, codex]) expect(actual.runs.filter(run => run.agentId === member.id).every(run => run.backend?.kind === member.executionBackend?.kind)).toBe(true)
    expect(actual.works).toHaveLength(2); expect(new Set(actual.works.map(work => work.ownerAgentId))).toEqual(new Set([claude.id, codex.id]))
    for (const work of actual.works) { expect(work.parentWorkId).toBeUndefined(); expect(work).toMatchObject({ status: 'delivered', sourceMessageId: occurrence.messageId, budgetId: initial.id, origin: { occurrenceId: occurrence.id } }); expect(work.requiresReview).toBe(false) }
    expect(actual.calls).toHaveLength(budget.modelCalls); expect(new Set(actual.calls.map(call => call.id)).size).toBe(actual.calls.length)
    expect(actual.calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && !!call.settledAt && call.origin?.occurrenceId === occurrence.id)).toBe(true)
    for (const member of [claude, codex]) { expect(actual.calls.some(call => actual.runs.find(run => run.id === call.runId)?.agentId === member.id && call.phase === 'decision')).toBe(true); expect(actual.calls.some(call => actual.runs.find(run => run.id === call.runId)?.agentId === member.id && call.phase === 'memory')).toBe(true) }
    expect(actual.artifacts).toHaveLength(2)
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
    for (const member of [claude, codex]) {
      const work = actual.works.find(w => w.ownerAgentId === member.id)!, file = detail.artifacts.find(a => work.artifactIds.includes(a.id!))!
      expect(file).toMatchObject({ ownerAgentId: member.id, name: member.id === claude.id ? 'claude-auto.md' : 'codex-auto.md' })
      const bytes = await readFile(file.path); expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.contentHash); expect(bytes.toString()).toContain(state.token)
      await runtime.reviewFile('混合自动化实际交付原件-'+file.name, file.path, { required: true, expectedSha256: file.contentHash })
    }
    if (scheduled) {
      expect(actual.nativeTriggers).toHaveLength(1); expect(actual.nativeTriggers[0]).toMatchObject({ scheduleId: plan.scheduleId, runId: occurrence.nativeRunId, scheduledFireAt: due.getTime(), outcome: 'published' }); expect(actual.nativeTriggers[0].actualFireAt).toBeGreaterThanOrEqual(due.getTime())
    } else expect(actual.nativeTriggers).toEqual([])
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents).toEqual(configured.agents)
    await page.locator(`[data-occurrence-id="${occurrence.id}"]`).getByText('运行明细', { exact: true }).click()
    await expect(page.getByText('本机请求按外部回合计数，Agent 内部模型调用次数未知；未完整返回的用量继续标记为未知。', { exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合本机自动化实际触发与原计量')
    await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    for (const name of ['claude-auto.md', 'codex-auto.md']) await expect(page.getByText(name, { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合本机自动化两员工原群实际交付')
    const committed = await records()
    await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime))
    const restored = await records(); await runtime.reviewData('混合自动化重启前后原记录', { committed, restored })
    for (const key of ['agents', 'messages', 'runs', 'turns', 'works', 'budgets', 'calls', 'profileCalls', 'dispatches', 'claudeSessions', 'codexSessions', 'nativeTriggers', 'artifacts'] as const) expect(restored[key]).toEqual(committed[key])
    expect(restored.occurrences).toHaveLength(1); expect(restored.occurrences[0]).toMatchObject({ id: occurrence.id, status: 'completed', budgetId: initial.id, source: occurrence.source, resultMessageIds: occurrence.resultMessageIds, usage: occurrence.usage })
    expect(restored.occurrences[0].nativeRunId).toBe(occurrence.nativeRunId)
    expect(restored.plans).toHaveLength(1); expect(restored.plans[0]).toMatchObject({ id: plan.id, revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, enabled: scheduled, authorizedFingerprint: plan.authorizedFingerprint, prompt: request, conversationId: chat.id })
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
    for (const name of ['claude-auto.md', 'codex-auto.md']) await expect(runtime.page.getByText(name, { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('重启后混合本机自动化同次交付保持')
    const publicText = detail.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').map(m => m.content).join('\n')
    for (const artifact of detail.artifacts) { expect(publicText).not.toContain(artifact.id); expect(publicText).not.toContain(artifact.path) }
    expect(publicText).not.toContain('self:/'); expect(runtime.errors).toEqual([])
  } catch (error) { scenarioFailure = error; await runtime.reviewData('混合本机自动化原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' }); throw error }
  finally {
    try { await runtime.reviewData('混合本机自动化最终状态含失败', await records()); await archiveNativeFinalReview(runtime, { label: '混合本机自动化', records }) }
    catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], '混合本机自动化原场景或结束留证失败') }
    finally { await store.close() }
  }
})

Then('用户让{string}以{string}接续混合本机自动化原问题且保留已完成操作', async ({ runtime, claudeEmployee: state }, waitingKind: string, continuation: string) => {
  expect(state.real).toBe(true); expect(['Claude', 'Codex']).toContain(waitingKind); expect(['回复原问题', '追加到期额度']).toContain(continuation)
  test.skip(process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  test.setTimeout(900000)
  const renewal = continuation === '追加到期额度'
  const { page, codexProfile, configured, claude, codex, chat } = await mixedAutomationMembers(runtime, state.employeeId!)
  const owner = waitingKind === 'Claude' ? claude : codex, peer = waitingKind === 'Claude' ? codex : claude
  const title = '混合本机等待补充', request = `这次定时任务给两位员工分别分配自己的独立文件工作，每位都是自己工作的负责人。${owner.name}：这是已经授权且具备开工条件的文件工作，第一阶段只准备文件，无需最终标题；必须先开始并执行自己的文件任务，用宿主工具在 self:/work/prepared.txt 写入 prepared-once，写入成功后才报告自己的工作等待用户补充，并公开提问“最终文件标题用什么？”。在我明确回复之前不要创建或发布最终文件。收到补充后保留已经写好的 prepared.txt，不重写它；只创建并正式发布 waiting-final.md，正文包含我补充的标题，并以实际文件证据汇报原工作交付。${peer.name}：独立创建并正式发布 completed-peer.md，正文包含“${state.token}”，汇报自己的工作已交付，不等待对方。每位只处理自己的工作，不代替对方、不委派、不另建额外工作、不联网、不运行命令，不把本场保存为长期偏好。`
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill(title); await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'conversation', chat.title + ' · 群聊'); await selectScheduleOption(page, '通知', '静音')
  const due = new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000)
  await editor.getByRole('button', { name: '时间', exact: true }).click()
  await page.getByLabel('执行时间', { exact: true }).fill(due.toISOString().slice(11, 16))
  await page.getByLabel('时区', { exact: true }).fill('UTC'); await page.keyboard.press('Escape')
  await runtime.reviewData('混合接续原七项配置及明确分工', { request, waitingKind, continuation, owner, peer, codexProfile, chat, expiryMode: renewal ? 'actual-original-deadline' : 'not-expired', modelMode: 'real-provider', clockOrLedgerSeeded: false, humanReview: 'pending' })
  await runtime.reviewNativeCheckpoint('混合接续原七项表单与具名分工')
  await editor.getByRole('button', { name: '创建', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(p => p.name === title)!
  expect(plan).toMatchObject({ enabled: false, sync: 'synced', conversationPolicy: 'existing-conversation', conversationId: chat.id, notificationPolicy: 'muted' })
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), plans: await store.load<AutomationDefinition>('automations'), occurrences: await store.load<AutomationOccurrence>('automationOccurrences'), messages: await store.load<Message>('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), traces: await store.load('traceSpans'), dispatches: await store.load('automationDispatches'), wakes: await store.load('workWakes'), claudeSessions: await store.load('claudeSessions'), codexSessions: await store.load('codexSessions'), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') })
  const fileIdentity = async (path: string) => { const bytes = await readFile(path), info = await stat(path); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mtimeMs: info.mtimeMs, text: bytes.toString() } }
  let scenarioFailure: unknown
  try {
    const empty = await records(); expect(empty.runs).toEqual([]); expect(empty.works).toEqual([]); expect(empty.budgets).toEqual([])
    await runtime.reviewData('混合接续启动前原零业务状态', empty)
    await scheduleAction(page, '立即运行一次')
    await expect.poll(async () => (await store.load<AutomationOccurrence>('automationOccurrences')).length).toBe(1)
    const admitted = (await records()).occurrences[0], initial = (await records()).budgets[0]
    expect(admitted).toMatchObject({ source: 'manual', conversationId: chat.id, budgetId: initial.id })
    expect(initial).toMatchObject({ maxModelCalls: 24, maxOutputTokens: 16000, accounting: 'model-calls-v1' })
    const limits = { id: initial.id, deadlineAt: initial.deadlineAt, maxModelCalls: initial.maxModelCalls, maxOutputTokens: initial.maxOutputTokens }
    await runtime.reviewData('混合接续原唯一受理与最初期限', { admitted, initial })
    await expect.poll(async () => {
      const r = await records(), occurrence = r.occurrences[0]
      if (['failed', 'cancelled', 'interrupted', 'needs_review'].includes(occurrence.status) || r.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))) return 'terminal-failure'
      if (occurrence.status !== 'waiting_user' || !r.runs.length || !r.runs.every(run => run.status === 'completed') || r.budgets[0].unknownCalls !== 0) return 'pending'
      return r.works.length === 2 && r.works.find(w => w.ownerAgentId === peer.id)?.status === 'delivered' && r.works.find(w => w.ownerAgentId === owner.id)?.status === 'waiting' ? 'steady-question' : 'wrong-initial-work-shape'
    }, { timeout: 240000, intervals: [500, 1000, 2500] }).toBe('steady-question')
    const before = await records(), waiting = before.occurrences[0], budget = before.budgets[0]
    const work = before.works.find(w => w.ownerAgentId === owner.id)!, completed = before.works.find(w => w.ownerAgentId === peer.id)!
    expect(before.occurrences).toHaveLength(1); expect(before.budgets).toHaveLength(1); expect(before.artifacts).toHaveLength(1)
    expect(budget).toMatchObject({ ...limits, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false })
    for (const original of [work, completed]) { expect(original.parentWorkId).toBeUndefined(); expect(original).toMatchObject({ sourceMessageId: waiting.messageId, budgetId: initial.id, origin: { occurrenceId: waiting.id } }) }
    const item = await page.evaluate(id => window.boai.request('getInboxItem', { id: `question:occurrence:${id}` }), waiting.id)
    expect(item?.question).toBeDefined(); expect(work.userQuestion?.messageId).toBe(item!.question!.messageId)
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: owner.id, conversationId: chat.id })
    const prepared = await fileIdentity(join(home.sessionPath!, 'work', 'prepared.txt')), originalFile = before.artifacts[0], peerFile = await fileIdentity(originalFile.path)
    expect(prepared.text).toBe('prepared-once'); expect(originalFile.name).toBe('completed-peer.md'); expect(peerFile.text).toContain(state.token); expect(peerFile.sha256).toBe(originalFile.contentHash)
    expect(completed.artifactIds).toEqual([originalFile.id])
    await runtime.reviewFile('混合接续补充前实际准备原件', prepared.path, { required: true, expectedSha256: prepared.sha256 })
    await runtime.reviewFile('混合接续另一员工已交付原件', peerFile.path, { required: true, expectedSha256: peerFile.sha256 })
    await runtime.reviewData('混合接续原问题与另一员工完整交付', { records: before, waiting, work, completed, budget, item, prepared, peerFile })
    await page.getByRole('button', { name: '补充信息', exact: true }).click()
    await expect(page.locator(`#message-${item!.question!.messageId}`)).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合接续原员工问题与另一位正式文件')
    const answer = `${owner.name}：标题用“${state.token}”。保留 prepared.txt，不重写它，继续原未完成工作并正式交付 waiting-final.md。${peer.name}的 completed-peer.md 已交付，保持原件和原工作，不再次执行。`
    let stoppedBudget = budget
    if (renewal) {
      await expect.poll(async () => (await records()).occurrences[0].status, { timeout: 340000, intervals: [1000, 5000] }).toBe('cancelled')
      const stopped = await records(); stoppedBudget = stopped.budgets[0]
      expect(stopped.occurrences[0]).toMatchObject({ id: waiting.id, cancellationCause: 'budget', budgetId: budget.id })
      expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(initial.deadlineAt))
      expect(stopped.works.find(w => w.id === completed.id)).toEqual(completed)
      expect(stoppedBudget).toMatchObject(limits); expect(stopped.calls).toEqual(before.calls)
      expect(await fileIdentity(prepared.path)).toEqual(prepared); expect(await fileIdentity(peerFile.path)).toEqual(peerFile)
      await runtime.reviewData('混合接续实际原期限到期与已交付保持', { stopped, actualWallClock: true, originalDeadline: initial.deadlineAt })
      await page.getByRole('button', { name: '定时任务', exact: true }).click(); await openSchedule(page, title)
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click(); await expect(page.getByText(/累计请求上限将为 48 次/)).toBeVisible()
      await runtime.reviewNativeCheckpoint('混合原期限到期的明确累计追加确认')
      await page.getByRole('button', { name: '取消', exact: true }).click()
      expect((await records()).budgets).toEqual(stopped.budgets); expect((await records()).calls).toEqual(stopped.calls)
      await runtime.reviewData('混合接续取消追加后零受理', await records())
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
      await page.getByLabel('继续未完成工作的说明', { exact: true }).fill(answer)
      await page.getByRole('button', { name: '确认追加额度并继续', exact: true }).click()
    } else {
      await page.locator(`#message-${item!.question!.messageId}`).getByRole('button', { name: '回复此问题', exact: true }).click()
      await expect(page.locator('.reply-preview')).toContainText('正在补充这一次定时任务')
      await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(answer)
      await runtime.reviewNativeCheckpoint('混合同一输入框绑定原问题版本')
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
    }
    await expect.poll(async () => {
      const r = await records(), occurrence = r.occurrences[0]
      if (['failed', 'cancelled', 'interrupted', 'needs_review'].includes(occurrence.status) || r.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))) return 'terminal-failure'
      return occurrence.status === 'completed' && r.runs.every(run => run.status === 'completed') && r.budgets[0].unknownCalls === 0 ? 'delivered-and-settled' : 'pending'
    }, { timeout: 300000, intervals: [500, 1000, 2500] }).toBe('delivered-and-settled')
    const actual = await records(), result = actual.occurrences[0], spent = actual.budgets[0]
    await runtime.reviewData('混合接续本次终态与全部真实账本', actual)
    expect(actual.occurrences).toHaveLength(1); expect(actual.budgets).toHaveLength(1)
    expect(result).toMatchObject({ id: waiting.id, conversationId: chat.id, budgetId: budget.id, deliveryStatus: 'delivered', usageIncomplete: false })
    expect(actual.works.map(w => w.id).sort()).toEqual(before.works.map(w => w.id).sort())
    expect(actual.works.find(w => w.id === work.id)).toMatchObject({ status: 'delivered', budgetId: work.budgetId, sourceMessageId: work.sourceMessageId, origin: work.origin, requiresReview: false })
    expect(actual.works.find(w => w.id === completed.id)).toEqual(completed)
    const peerExecutions = (runs: AgentRun[]) => runs.filter(r => r.agentId === peer.id && r.responseKind === 'task')
    expect(peerExecutions(actual.runs)).toEqual(peerExecutions(before.runs))
    expect(await fileIdentity(prepared.path)).toEqual(prepared); expect(await fileIdentity(peerFile.path)).toEqual(peerFile)
    expect(actual.artifacts.find(a => a.id === originalFile.id)).toEqual(originalFile); expect(actual.artifacts).toHaveLength(2)
    expect(actual.runs.filter(r => r.agentId === owner.id).flatMap(r => r.toolEvents).filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(2)
    expect(actual.runs.filter(r => r.agentId === peer.id).flatMap(r => r.toolEvents).filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(1)
    expect(spent).toMatchObject({ id: budget.id, maxModelCalls: renewal ? 48 : 24, maxOutputTokens: renewal ? 32000 : 16000, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false })
    expect(spent.modelCalls).toBeGreaterThan(budget.modelCalls)
    const replies = actual.messages.filter(m => m.content === answer && m.senderType === 'user')
    expect(replies).toHaveLength(1); expect(replies[0].origin?.occurrenceId).toBe(waiting.id)
    if (renewal) {
      expect(spent.renewals).toHaveLength(1)
      expect(spent.renewals![0]).toMatchObject({ messageId: replies[0].id, used: { modelCalls: stoppedBudget.modelCalls, usage: stoppedBudget.usage, unknownCalls: stoppedBudget.unknownCalls } })
      expect(spent.renewals![0].workVersions.map(w => w.id)).toEqual([work.id])
      expect(spent.renewals![0].before).toMatchObject({ deadlineAt: budget.deadlineAt, maxModelCalls: 24, maxOutputTokens: 16000 })
      expect(spent.renewals![0].after).toMatchObject({ deadlineAt: spent.deadlineAt, maxModelCalls: 48, maxOutputTokens: 32000 })
      expect(Date.parse(spent.deadlineAt)).toBeGreaterThan(Date.parse(budget.deadlineAt))
    } else {
      expect(spent.deadlineAt).toBe(budget.deadlineAt); expect(spent.renewals).toBeUndefined()
      expect(replies[0].inboxReply).toMatchObject({ questionId: `occurrence:${waiting.id}`, questionMessageId: item!.question!.messageId, questionRevision: item!.question!.revision, workId: work.id })
    }
    expect(actual.calls).toHaveLength(spent.modelCalls); expect(new Set(actual.calls.map(c => c.id)).size).toBe(actual.calls.length)
    expect(actual.calls.every(c => c.callUnit === 'external-turn' && c.usageComplete && !!c.settledAt && c.origin?.occurrenceId === waiting.id)).toBe(true)
    for (const member of [owner, peer]) expect(actual.runs.filter(r => r.agentId === member.id).every(r => r.backend?.kind === member.executionBackend?.kind)).toBe(true)
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
    const finalFile = detail.artifacts.find(a => a.name === 'waiting-final.md')!
    expect(finalFile).toMatchObject({ ownerAgentId: owner.id }); expect(actual.works.find(w => w.id === work.id)!.artifactIds).toEqual([finalFile.id])
    const finalIdentity = await fileIdentity(finalFile.path); expect(finalIdentity.sha256).toBe(finalFile.contentHash); expect(finalIdentity.text).toContain(state.token)
    await runtime.reviewFile('混合接续原等待工作实际最终原件', finalFile.path, { required: true, expectedSha256: finalFile.contentHash })
    await runtime.reviewFile('混合接续准备原件保持同一hash', prepared.path, { required: true, expectedSha256: prepared.sha256 })
    await runtime.reviewData('混合接续原身份与不可重放核对', { owner, peer, waitingKind, continuation, prepared, peerFile, finalIdentity, originalWork: work, originalCompletedWork: completed, originalBudget: budget, actual, question: item!.question, reply: replies[0], additionalPeerNonTaskRuns: actual.runs.filter(r => r.agentId === peer.id && r.responseKind !== 'task' && !before.runs.some(old => old.id === r.id)) })
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents).toEqual(configured.agents)
    if (renewal) {
      await page.getByText('运行明细', { exact: true }).click(); await page.getByText('额度追加记录（1 次）', { exact: true }).click()
      const grant = page.getByText(/API／本机请求上限 24 → 48/); await grant.scrollIntoViewIfNeeded(); await expect(grant).toBeVisible()
      await expect.poll(() => grant.evaluate(element => {
        const rect = element.getBoundingClientRect(); if (rect.height <= 0 || rect.top < 0 || rect.bottom > innerHeight) return false
        for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && rect.bottom > parent.getBoundingClientRect().bottom + 1) return false
        return true
      })).toBe(true)
      await runtime.reviewNativeCheckpoint('混合明确追加后的原累计账本'); await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    }
    for (const name of ['completed-peer.md', 'waiting-final.md']) await expect(page.getByText(name, { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合本机原问题接续后两份实际文件')
    const committed = await records()
    await runtime.close(); await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime))
    const restored = await records(); await runtime.reviewData('混合接续原记录重启前后', { committed, restored })
    for (const key of ['agents', 'messages', 'runs', 'turns', 'works', 'budgets', 'calls', 'profileCalls', 'dispatches', 'wakes', 'claudeSessions', 'codexSessions', 'artifacts'] as const) expect(restored[key]).toEqual(committed[key])
    expect(restored.occurrences).toHaveLength(1); expect(restored.occurrences[0]).toMatchObject({ id: waiting.id, status: 'completed', budgetId: initial.id, source: 'manual', resultMessageIds: result.resultMessageIds, usage: result.usage })
    expect(restored.occurrences[0].nativeRunId).toBe(result.nativeRunId)
    expect(restored.plans).toHaveLength(1); expect(restored.plans[0]).toMatchObject({ id: plan.id, revision: plan.revision, executionRevision: plan.executionRevision, scheduleGeneration: plan.scheduleGeneration, enabled: false, prompt: request, conversationId: chat.id })
    expect(await fileIdentity(prepared.path)).toEqual(prepared); expect(await fileIdentity(peerFile.path)).toEqual(peerFile); expect(await fileIdentity(finalFile.path)).toEqual(finalIdentity)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
    for (const name of ['completed-peer.md', 'waiting-final.md']) await expect(runtime.page.getByText(name, { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合本机原问题接续重启后同次交付')
    const publicText = detail.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').map(m => m.content).join('\n')
    for (const artifact of detail.artifacts) { expect(publicText).not.toContain(artifact.id); expect(publicText).not.toContain(artifact.path) }
    expect(publicText).not.toContain('self:/'); expect(runtime.errors).toEqual([])
  } catch (error) { scenarioFailure = error; await runtime.reviewData('混合本机接续原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' }); throw error }
  finally {
    try { await runtime.reviewData('混合本机接续最终状态含失败', await records()); await archiveNativeFinalReview(runtime, { label: '混合本机接续', records }) }
    catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], '混合本机接续原场景或结束留证失败') }
    finally { await store.close() }
  }
})
