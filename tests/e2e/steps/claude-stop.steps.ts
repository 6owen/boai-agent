/*
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 原自动化停止/故障finally另留外部阶段Trace、普通调用及原生会话映射；阶段失败时仍保留格式计数与等待位置，原业务断言和清理分界保持。
 * [OUTPUT]: 原UI建立可选独立来源或同程序的独立本机配置；模型ID/本机配置分别在执行、退出待核对及重启时拒绝，原API/来源场景及完整停止断言保持。
 * [INPUT]: 原Claude员工创建、定时表单、真实独立进程、生产文件工具和隔离SQLite。
 * [OUTPUT]: 文件已写后底部拒绝活动换绑，正常停止/运行服务实际SIGKILL及两次待核对换绑保持原配置、工作/账本；实际子进程退出/未知用量/原件及重启零重放；失败先留原件，测试补救清理单列不计产品通过。
 * [POS]: Claude自动化故障BDD；协议与真实供应商分别留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { openSchedule, scheduleAction, scheduleTarget } from '../support/schedule-controls'
import { crashAutomationRuntime, processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../packages/shared/src/domain'
const { When, Then } = createBdd(test)
When('用户为Claude换绑核对准备不同模型ID和独立本机配置', async ({ runtime, claudeEmployee }) => {
  const page = runtime.page, before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const profiles = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const agent = before.agents.find(value => value.id === claudeEmployee.employeeId)!
  expect(agent.executionBackend?.kind).toBe('claude-local')
  const original = profiles.find(value => value.id === (agent.executionBackend as { profileId: string }).profileId)!
  const source = before.connections.find(value => value.id === agent.connectionId)!
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: '本机 Claude 使用已安装程序，在员工设置中选择模型 API', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '手动添加 Agent', exact: true }), name = '本场独立Claude配置'
  await dialog.getByRole('textbox', { name: 'Agent 名称', exact: true }).fill(name)
  await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(claudeEmployee.program!)
  await dialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('程序已核对', { timeout: 30000 })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  const after = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const afterProfiles = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined)), target = afterProfiles.find(value => value.name === name)!
  expect(target.id).not.toBe(original.id)
  expect(target).toMatchObject({ protocol: original.protocol, executable: original.executable, executableHash: original.executableHash, verified: { name: original.verified!.name, version: original.verified!.version, protocolVersion: original.verified!.protocolVersion } })
  expect(afterProfiles.find(value => value.id === original.id)).toEqual(original)
  expect(after.agents).toEqual(before.agents)
  expect(after.connections).toEqual(before.connections)
  claudeEmployee.switchBindings = { modelId: source.defaultModel + '-binding-rejection-only', profile: { id: target.id, name: target.name } }
  expect(claudeEmployee.switchBindings.modelId).not.toBe(agent.modelId)
  await runtime.reviewData('本场模型ID与独立本机配置仅供拒绝保存', { agent, source, original, target, candidate: claudeEmployee.switchBindings, sameProgramDifferentProfile: true, targetModelNeverExecuted: true })
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: agent.name, exact: true }).click()
})
When('用户为Claude换绑核对建立独立模型来源', async ({ runtime, claudeEmployee }) => {
  const page = runtime.page, before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const source = before.connections.find(value => value.id === claudeEmployee.connectionId)!
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog'), name = '本场换绑目标'
  await dialog.getByRole('button', { name: /^Anthropic/ }).click()
  await dialog.getByLabel('连接名称', { exact: true }).fill(name)
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill('http://127.0.0.1:9')
  await dialog.getByLabel('API Key', { exact: true }).fill('synthetic-binding-only')
  await dialog.getByLabel('默认模型 ID', { exact: true }).fill(source.defaultModel)
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(dialog).toBeHidden()
  const after = await page.evaluate(() => window.boai.request('snapshot', undefined)), target = after.connections.find(value => value.name === name)!
  expect(target).toMatchObject({ provider: 'anthropic', baseUrl: 'http://127.0.0.1:9', hasApiKey: true })
  expect(after.agents).toEqual(before.agents)
  expect(after.connections.find(value => value.id === source.id)).toEqual(source)
  claudeEmployee.switchSource = { id: target.id, name: target.name }
  await runtime.reviewData('本场换绑目标与原来源保持', { source, target, agentsUnchanged: true, syntheticTargetNotSupplier: true })
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
})
async function processStarts(pids: number[]) {
  if (!pids.length) return new Map<number, string>()
  try {
    const { stdout } = await promisify(execFile)('ps', ['-p', pids.join(','), '-o', 'pid=,lstart='])
    return new Map(stdout.trim().split('\n').filter(Boolean).map(line => { const match = /^\s*(\d+)\s+(.+)$/.exec(line)!; return [Number(match[1]), match[2]] }))
  } catch (error) { if ((error as { code?: number }).code === 1) return new Map<number, string>(); throw error }
}

Then('Claude员工在定时文件工作执行期间以{string}结束并核对重启没有重放', async ({ runtime, claudeEmployee }, ending: string) => {
  test.setTimeout(600000)
  expect(['停止本次', '运行服务意外退出']).toContain(ending)
  const crashed = ending === '运行服务意外退出'
  const page = runtime.page, title = 'Claude自动化停止验证'
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await editor.getByLabel('标题', { exact: true }).fill(title)
  const request = claudeEmployee.real
    ? `明确文件工作：先用 write_file 在 self:/work/stop-proof.txt 写入“${claudeEmployee.token}”。然后依次用 write_file 创建 self:/work/check-01.txt 至 check-30.txt，每个文件写入其编号与暗号“${claudeEmployee.token}”。每次只写一个文件，不使用命令或脚本。全部完成前不要发布任何文件；全部完成后只发布 stop-proof.txt 并报告交付。这是用来核对停止行为的实际文件任务。`
    : '模块文件任务 empty-memory CLAUDE_AUTOMATION_HOLD'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Claude 同事')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  await scheduleAction(page, '立即运行一次')
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const rejectOneSwitch = async (conversationId: string, reason: string, stage: string, active: boolean, binding: 'model-id' | 'profile' | 'source' | 'api') => {
    const currentPage = runtime.page
    const snapshot = () => currentPage.evaluate(() => window.boai.request('snapshot', undefined))
    const agent = (await snapshot()).agents.find(value => value.id === claudeEmployee.employeeId)!
    const facts = async () => ({ detail: await currentPage.evaluate(id => window.boai.request('getConversation', { id }), conversationId), calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load('workBudgets'), profileCalls: await store.load<import('../../../packages/runtime/src/modules/profile/profile-activity').ProfileModelCall>('profileModelCalls'), sessions: await store.load('claudeSessions') })
    const before = await facts()
    expect(agent.executionBackend?.kind).toBe('claude-local')
    expect(before.detail.workItems).toHaveLength(1)
    expect(before.detail.workItems![0].requiresReview).toBe(true)
    if (active) expect(before.detail.runs.some(run => run.phase === 'execution' && run.status === 'running')).toBe(true)
    await currentPage.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await currentPage.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: agent.name, exact: true }).click()
    await currentPage.getByRole('button', { name: '选择模型', exact: true }).click()
    await currentPage.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    const employeeEditor = currentPage.locator('.detail-content:visible')
    await expect(employeeEditor.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(agent.name)
    if (binding === 'model-id') {
      await employeeEditor.getByRole('textbox', { name: '模型 ID', exact: true }).fill(claudeEmployee.switchBindings!.modelId)
    } else if (binding === 'profile') {
      await employeeEditor.getByRole('combobox', { name: '本机连接', exact: true }).click()
      await currentPage.getByRole('option', { name: claudeEmployee.switchBindings!.profile.name, exact: true }).click()
    } else if (binding === 'source') {
      await employeeEditor.getByRole('combobox', { name: '模型连接', exact: true }).click()
      await currentPage.getByRole('option', { name: claudeEmployee.switchSource!.name, exact: true }).click()
    } else {
      await employeeEditor.getByRole('combobox', { name: '执行后端', exact: true }).click()
      await currentPage.getByRole('option', { name: '模型 API · 聊天与协作', exact: true }).click()
    }
    await employeeEditor.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(employeeEditor.getByText(reason, { exact: true })).toBeVisible()
    await expect(employeeEditor.getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
    expect((await snapshot()).agents.find(value => value.id === agent.id)).toEqual(agent)
    const after = await facts()
    expect(after.calls.map(call => call.id).sort()).toEqual(before.calls.map(call => call.id).sort())
    expect(after.profileCalls.map(call => call.id).sort()).toEqual(before.profileCalls.map(call => call.id).sort())
    expect(after.detail.workItems!.map(work => ({ id: work.id, ownerAgentId: work.ownerAgentId, budgetId: work.budgetId, origin: work.origin, activeRunId: work.activeRunId }))).toEqual(before.detail.workItems!.map(work => ({ id: work.id, ownerAgentId: work.ownerAgentId, budgetId: work.budgetId, origin: work.origin, activeRunId: work.activeRunId })))
    expect(after.detail.artifacts).toEqual(before.detail.artifacts)
    if (active) {
      // The original CLI may legitimately append file-tool observations while
      // settings are open. Its execution identity must remain active and unchanged.
      expect(after.detail.runs.find(run => run.id === before.detail.runs.find(value => value.phase === 'execution')!.id)?.status).toBe('running')
    } else expect(after).toEqual(before)
    const suffix = binding === 'model-id' ? '更换Claude模型ID' : binding === 'profile' ? '更换Claude本机配置' : binding === 'source' ? '更换Claude模型来源' : '切换Claude运行方式'
    const target = binding === 'model-id' ? claudeEmployee.switchBindings!.modelId : binding === 'profile' ? claudeEmployee.switchBindings!.profile : claudeEmployee.switchSource ?? 'model-api'
    await runtime.reviewData(stage + (claudeEmployee.switchBindings ? suffix : '') + '底部拒绝换绑及原事实', { reason, active, binding, agent, target, before, after })
    await employeeEditor.getByText(reason, { exact: true }).scrollIntoViewIfNeeded()
    await runtime.reviewNativeCheckpoint(stage + '底部拒绝' + suffix)
    if (binding === 'model-id' || binding === 'profile') {
      const field = binding === 'model-id' ? employeeEditor.getByRole('textbox', { name: '模型 ID', exact: true }) : employeeEditor.getByRole('combobox', { name: '本机连接', exact: true })
      if (binding === 'model-id') await expect(field).toHaveValue(claudeEmployee.switchBindings!.modelId)
      else await expect(field).toContainText(claudeEmployee.switchBindings!.profile.name)
      await expect(field).toBeDisabled()
      await field.scrollIntoViewIfNeeded()
      await runtime.reviewNativeCheckpoint(stage + '拒绝保存后待核对的Claude' + (binding === 'model-id' ? '模型ID' : '本机配置'))
    }
    await employeeEditor.getByRole('button', { name: '载入已提交配置', exact: true }).click()
    await currentPage.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
    await expect(employeeEditor.getByRole('combobox', { name: '执行后端', exact: true })).toContainText('本机 Claude')
    await employeeEditor.getByRole('button', { name: '取消', exact: true }).click()
    await currentPage.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '定时任务', exact: true }).click()
    await openSchedule(currentPage, title)
  }
  const rejectSwitch = async (conversationId: string, reason: string, stage: string, active: boolean) => {
    const bindings: ('model-id' | 'profile' | 'source' | 'api')[] = claudeEmployee.switchBindings ? ['model-id', 'profile'] : [claudeEmployee.switchSource ? 'source' : 'api']
    for (const binding of bindings) await rejectOneSwitch(conversationId, reason, stage, active, binding)
  }
  let processIdentities = new Map<number, string>()
  let originalFile: string | undefined
  try {
    await expect.poll(async () => {
      const runs = await store.load<import('../../../packages/shared/src/domain').AgentRun>('runs')
      return runs.some(run => run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed')) || runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))
    }, { timeout: 210000, intervals: [100, 250, 500] }).toBe(true)
    expect((await store.load<import('../../../packages/shared/src/domain').AgentRun>('runs')).filter(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))).toEqual([])
    const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(value => value.name === title)!
    const occurrence = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(value => value.automationId === plan.id)!
    expect(occurrence.status).toBe('running')
    const before = await page.evaluate(id => window.boai.request('getConversation', { id }), occurrence.conversationId)
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: claudeEmployee.employeeId!, conversationId: occurrence.conversationId })
    const file = claudeEmployee.real ? join(home.sessionPath!, 'work', 'stop-proof.txt') : join(home.sessionPath!, 'runs', before.runs.find(run => run.phase === 'execution')!.id, 'proof.txt')
    originalFile = file
    const content = await readFile(file, 'utf8'), modified = (await stat(file)).mtimeMs
    await runtime.reviewFile('故障前已写但未发布原件', file)
    const callIds = (await store.load<BudgetModelCall>('budgetModelCalls')).map(call => call.id).sort()
    await rejectSwitch(occurrence.conversationId, '员工仍在执行，请等实际执行退出后再切换运行方式', '文件执行中', true)
    const processes = await runtimeChildProcessIds(runtime)
    expect(processes.length).toBeGreaterThan(0)
    processIdentities = await processStarts(processes)
    expect(processIdentities.size).toBe(processes.length)
    await runtime.reviewData('停止前实际运行与本场子进程', { detail: before, processes, processIdentities: [...processIdentities], ending, request, realSupplier: !!claudeEmployee.real })
    if (crashed) {
      await crashAutomationRuntime(runtime)
      await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
      await expect.poll(() => processes.filter(processIsRunning), { timeout: 30000 }).toEqual([])
      await runtime.reviewCheckpoint('运行服务意外退出后的原界面')
      await runtime.restart()
    } else {
      await page.locator(`[data-occurrence-id="${occurrence.id}"]`).getByRole('button', { name: '停止本次', exact: true }).click()
      await expect.poll(() => processes.filter(processIsRunning), { timeout: 30000 }).toEqual([])
    }
    const expectedStatus = crashed ? 'interrupted' : 'cancelled'
    await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)).status, { timeout: 30000 }).toBe(expectedStatus)
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), occurrence.conversationId)
    expect(detail.artifacts).toEqual([])
    expect(detail.workItems).toHaveLength(1)
    expect(detail.workItems![0]).toMatchObject({ status: expectedStatus, origin: { occurrenceId: occurrence.id }, budgetId: occurrence.budgetId })
    expect(detail.runs.some(run => run.status === expectedStatus && run.backend?.kind === 'claude-local')).toBe(true)
    await rejectSwitch(occurrence.conversationId, '员工仍有未结束或待核对工作，请先处理原工作再切换运行方式', crashed ? '故障首次重启后' : '实际停止退出后', false)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls'), budgets = await store.load<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets')
    expect(calls.some(call => call.phase === 'execution' && !call.usageComplete)).toBe(true)
    expect(budgets).toHaveLength(1)
    expect(calls.map(call => call.id).sort()).toEqual(callIds)
    expect(budgets[0]).toMatchObject({ id: occurrence.budgetId, unknownCalls: 1, usageIncomplete: true })
    expect(content).toContain(claudeEmployee.real ? claudeEmployee.token! : '生产工具真实原件')
    await runtime.reviewFile('停止前已写但未发布的原件', file)
    if (crashed) {
      await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
      await openSchedule(runtime.page, title)
    }
    const record = runtime.page.locator(`[data-occurrence-id="${occurrence.id}"]`)
    await record.getByText('运行明细', { exact: true }).click()
    const accounting = record.getByText('本机请求按外部回合计数，Agent 内部模型调用次数未知；未完整返回的用量继续标记为未知。', { exact: true })
    await accounting.scrollIntoViewIfNeeded()
    await record.locator('details').first().evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))) })
    await expect(accounting).toBeVisible()
    // Chromium's details-content pseudo-element transition is not consistently
    // exposed by getAnimations(). Require the last accounting line to fit inside
    // the actual details box instead of relying on a fixed delay or visibility alone.
    await expect.poll(() => accounting.evaluate(element => {
      const content = element.getBoundingClientRect(), details = element.closest('details')!.getBoundingClientRect()
      return content.height > 0 && content.bottom <= details.bottom + 1
    })).toBe(true)
    await expect(record.getByText(/已知部分，用量不完整|用量未知/)).toBeVisible()
    await runtime.reviewCheckpoint('Claude自动化停止后保留未知用量且未交付')
    const runs = await store.load('runs'), works = await store.load('workItems')
    await runtime.restart()
    const after = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)
    expect(after).toMatchObject({ id: occurrence.id, status: expectedStatus, budgetId: occurrence.budgetId })
    expect(await store.load('runs')).toEqual(runs); expect(await store.load('workItems')).toEqual(works)
    expect(await store.load('budgetModelCalls')).toEqual(calls); expect(await store.load('workBudgets')).toEqual(budgets)
    expect(await readFile(file, 'utf8')).toBe(content); expect((await stat(file)).mtimeMs).toBe(modified)
    await rejectSwitch(occurrence.conversationId, '员工仍有未结束或待核对工作，请先处理原工作再切换运行方式', '再次重启后', false)
    await runtime.reviewCheckpoint('停止后重启没有恢复执行或发布原件')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('Claude自动化停止最终原始状态', { occurrences: await store.load('automationOccurrences'), works: await store.load('workItems'), calls: await store.load('budgetModelCalls'), budgets: await store.load('workBudgets'), runs: await store.load('runs'), traces: await store.load('traceSpans'), profileCalls: await store.load('profileModelCalls'), sessions: await store.load('claudeSessions') })
    if (originalFile) await runtime.reviewFile('故障最终未发布原件', originalFile)
    const live = await processStarts([...processIdentities.keys()]), cleanup: number[] = []
    for (const [pid, started] of live) if (processIdentities.get(pid) === started) {
      // Test cleanup is recorded separately and can never satisfy the earlier product-exit assertion.
      try { process.kill(pid, 'SIGKILL'); cleanup.push(pid) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
    await runtime.reviewData('故障场景人工清理进程不计产品通过', { cleanup })
    await store.close()
  }
})
