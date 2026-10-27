/*
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [OUTPUT]: 两轮/重启发送沿原可编辑等待，随后直接核contenteditable与aria-disabled均就绪，不增加第二套等待或放宽业务断言。
 * [OUTPUT]: 原生普通聊天按13组10/11核对零私有memory阶段及两轮/重启线程；重启等实际编辑器可编辑后输入，保留原终态。
 * [OUTPUT]: 新建员工沿现行工作方式/本机Agent两级选择，核对明确profile；其余业务/调用/重启断言保持。
 * [OUTPUT]: 文件修订末尾沿原记忆窗口核对六阶段终态与原账本，并独立保存关闭前页面、实际退出/退出后状态及两版固定hash原件；原错误和留证错误共同保留。
 * [OUTPUT]: Codex连接扫描/测试/保存复用原共享UI步骤，单员工与异构本机群保持相同入口与授权。
 * [OUTPUT]: 首次文件任务观察覆盖原300秒工作期限并在清理前保存实际外部Trace/请求账本；延长测试观察不追加产品预算、重放或放宽交付断言。
 * [OUTPUT]: 修订前记忆结算无论通过或失败均在清理前保存原详情、Trace和调用账本；原成功/失败断言、预算与业务执行保持。
 * [OUTPUT]: 新增建Work前固定问题接续，原判断/请求/预算、首次文件与重启沿共同BDD核验。
 * [OUTPUT]: 原问题与核心首发提交前经底部准确配置往返，保留正文与固定身份；零业务调用核对后继续原完整交付和重启断言。
 * [OUTPUT]: 连续聊天在原轮次/记忆实际结束后核对侧栏不再显示处理中，再采集同次完整界面；失败保留原状态，不以消息正文完成替代界面结束状态。
 * [OUTPUT]: 新建员工选本机运行方式后等待实际选择弹层退场再留证；不把退出动画首帧作为配置审阅画面。
 * [OUTPUT]: 两名本机员工先在原记忆界面限定三个聊天的新交流范围，再验证四个隔离原生会话；以消息/运行时间核对流式普通再发送，跨页隐藏、原调用不取消及重启连续性独立验收。
 * [OUTPUT]: 并发场景额外保存真实外部阶段Trace；成功核对每次调用的结束与原消息入口，浮层须完全显现后留证；失败保留等待位置/协议计数供诊断。
 * [OUTPUT]: 停止后等待运行明细实际边界容纳完整计量说明并核对未知用量可见后留证，不把展开动画首帧当完整证据。
 * [OUTPUT]: 定时文件写入中原记录停止或运行服务意外退出，实际本场子进程退出、未知用量/未发布原件与重启零重放分批验收。
 * [OUTPUT]: 原问题同composer补充/到期明确追加后共原Work预算，已写草稿不重放；真实供应商到期等待原墙钟，离线预置分开标注。
 * [OUTPUT]: 实际七项表单选择本机员工，立即运行与真实墙钟到点触发分别验证；计量/独立聊天/重启逐批留证。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: 资源库存经原生选择准备，UI绑定资源/交付/来源记忆与原请求预算核对；逐场景声明实际模型来源，离线/真实分别留证。
 * [OUTPUT]: 连续IM重启核对新增输入边界，真实供应商等待覆盖原判断/聊天各阶段时限；修订基线等原维护结算后保存，旧预算和原件断言保持。
 * [OUTPUT]: 实际设置导出与原址/异址恢复，保留原记录/不带入导出后消息，明确新发送建立新会话，正常再重启保持。
 * [OUTPUT]: 实际UI员工创建/续聊及文件交付/采用/明确修订留证，原版/新根/预算核对；失败即时保留状态及宿主已脱敏外部阶段Trace。
 * [OUTPUT]: 原聊天批准实际命令、原工作停止、父子进程退出与重启零重放；离线/真实独立留证，不把运行取消当作交付。
 * [OUTPUT]: 本机bobo真实主路径保留对阶段无工具误报阻塞的文字核对，其他工作/预算/重启断言保持。
 * [OUTPUT]: 旧ACP迁移答复故障场景显式选择附加核验，既有员工创建与正常迁移默认保持。
 * [INPUT]: 隔离 Electron 数据、明确选择的离线协议或真实本机 Codex。
 * [OUTPUT]: 实际设置/创建员工/连续 IM/重启界面及独立证据；真实模型仅在显式开关下调用。
 * [POS]: 本机员工桌面 BDD；不替换产品运行时或复制用户登录凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { addCodexConnection, selectNativeEmployee } from '../support/native-connection'
import { createBdd } from 'playwright-bdd'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test as base } from '../support/test'
import { beforeWorkQuestion } from '../support/native-continuation'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { verifyLocalAgentNavigation } from '../support/local-agent-navigation'
import { nextMaterialDialog } from '../support/materials'
import { openBindingEmployee } from '../support/skill-binding'
import { readingBrowserProbe } from '../support/reading'
import { prepareCodexResources } from '../support/codex-resources'
import { openSchedule, scheduleAction, scheduleTarget } from '../support/schedule-controls'
import { crashAutomationRuntime, processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { seedExpiredAutomationBudget } from '../support/automation-history'
import type { ArtifactVersion, BudgetModelCall } from '../../../packages/shared/src/domain'
type State = { real?: boolean; token?: string; employeeId?: string; conversationId?: string; migrationSaveFault?: boolean }
export const test = base.extend<{ codexEmployee: State }>({ codexEmployee: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('本机员工验收使用{string}和隔离产品数据', async ({ runtime, codexEmployee }, mode: string) => {
  codexEmployee.real = mode === '真实Codex'
  test.skip(codexEmployee.real && process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机模型必须显式开启')
  test.info().annotations.push({ type: 'model-mode', description: codexEmployee.real ? 'real-provider' : 'offline-protocol-or-fixture' })
  test.setTimeout(540000)
  codexEmployee.token = `海星-${randomUUID().slice(0, 8)}`
  await runtime.start()
})
When('用户在设置添加并测试本机 Codex', async ({ runtime, codexEmployee }) => {
  await addCodexConnection(runtime, !!codexEmployee.real)
})
Then('用户将 bobo 配置为本机并组织员工完成真实文件交付', async ({ runtime, codexEmployee }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
  await page.getByRole('combobox', { name: '执行后端', exact: true }).click()
  await expect(page.getByRole('option', { name: '外部 ACP · 仅显式任务', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '本机 Codex · 聊天与协作', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '本机连接', exact: true })).toContainText('本机 Codex')
  await runtime.reviewCheckpoint('bobo选择本机Codex且无需API模型')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'bobo')?.executionBackend?.kind).toBe('codex-local')
  const configured = await page.evaluate(() => window.boai.request('snapshot', undefined)), core = configured.agents.find(agent => agent.id === 'bobo')!
  expect(configured.connections).toEqual([])
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
  const request = codexEmployee.real
    ? `请创建一位独立员工“本机新同事”，职责是制作简单文件；建一个有你和他的“本机组织群”，并现在分工让他创建并发布 codex-proof.md，正文为“${codexEmployee.token}”。请在他实际交付后检查文件内容并用一句话确认完成。这是完整组织并执行请求。只有这个简单文件任务，无需研究或联网。员工使用你当前的本机 Codex 运行方式，不用 API 模型。`
    : 'NATIVE_BOBO_EXECUTE 创建一位本机新同事，建群并分工交付文件后汇总。'
  await runtime.reviewData('本机bobo组织原始请求', { request, realSupplier: !!codexEmployee.real, humanReview: 'pending' })
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await verifyLocalAgentNavigation(runtime, { employeeId: core.id, label: 'Codex核心空白页' })
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(chat => chat.purpose === 'core').length).toBe(1)
  const coreId = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(chat => chat.purpose === 'core')!.id
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const works = await store.load<import('../../../packages/shared/src/domain').WorkItem>('workItems')
      return works.length >= 3 && works.every(work => work.status === 'delivered')
    }, { timeout: 360000 }).toBe(true)
    await expect.poll(async () => (await store.load<import('../../../packages/shared/src/domain').AgentRun>('runs')).every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 90000 }).toBe(true)
    const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    expect(snapshot.connections).toEqual([])
    const employee = snapshot.agents.find(agent => agent.name === '本机新同事')!
    expect(employee).toMatchObject({ executionBackend: core.executionBackend, connectionId: '', allowCommands: false })
    expect(employee.systemRole).toBeUndefined()
    const receipt = (await page.evaluate(conversationId => window.boai.request('listBoboCollaborationOperations', { conversationId }), coreId))[0]
    expect(receipt).toMatchObject({ status: 'committed', mode: 'organize_and_execute', sourceConversationId: coreId })
    const groupId = receipt.groupConversationId!, group = await page.evaluate(id => window.boai.request('getConversation', { id }), groupId)
    expect(group.conversation.agentIds.sort()).toEqual(['bobo', employee.id].sort())
    expect(group.messages.map(message => message.content).join('\n')).not.toMatch(/文件系统只读[，、].{0,20}(无法|不能)|没有可用的.{0,10}(文件发布工具|发布工具)/)
    const root = group.workItems!.find(work => work.id === receipt.groupRootWorkId)!, child = group.workItems!.find(work => work.parentWorkId === root.id)!
    expect(root).toMatchObject({ status: 'delivered', ownerAgentId: 'bobo' })
    expect(child).toMatchObject({ status: 'delivered', ownerAgentId: employee.id, rootWorkId: root.id, budgetId: root.budgetId })
    expect(root.requiredResults.some(result => result.workId === child.id && result.resultVersion > 0)).toBe(true)
    const artifact = group.artifacts.find(file => child.artifactIds.includes(file.id!))!
    expect(artifact).toBeDefined()
    expect(await readFile(artifact.path, 'utf8')).toContain(codexEmployee.real ? codexEmployee.token! : 'NATIVE_FILE_TASK')
    for (const file of group.artifacts) await runtime.reviewFile('本机组织群实际交付原件-' + file.name, file.path)
    const works = await store.load<import('../../../packages/shared/src/domain').WorkItem>('workItems'), budgets = await store.load<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets'), calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(budgets).toHaveLength(1)
    expect(works.every(work => work.budgetId === budgets[0].id)).toBe(true)
    expect(budgets[0]).toMatchObject({ maxModelCalls: 48, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false })
    expect(calls.length).toBe(budgets[0].modelCalls)
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete)).toBe(true)
    expect((await store.load<import('../../../packages/shared/src/domain').AgentRun>('runs')).filter(run => run.status !== 'completed')).toEqual([])
    await runtime.reviewData('本机bobo组织与独立群交付证据', { receipt, employee, group, works, budgets, calls })
    await runtime.reviewCheckpoint('原核心讨论保留真实组织回执')
    await page.getByRole('region', { name: '群协作组织结果', exact: true }).getByRole('button', { name: '进入群聊', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewCheckpoint('本机bobo与员工实际分工和文件交付')
    const before = (await store.load('runs')).length
    await runtime.restart()
    const reopened = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    expect(reopened.agents.find(agent => agent.id === 'bobo')).toMatchObject({ executionBackend: core.executionBackend, configVersion: core.configVersion })
    expect((await store.load('runs')).length).toBe(before)
    await runtime.reviewCheckpoint('重启保留本机bobo身份且没有重复组织')
  } finally {
    await runtime.reviewData('本机bobo最终原始状态', { core: await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), coreId), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), runs: await store.load('runs'), operations: await store.load('boboCollaborations') })
    await store.close()
  }
})
When('用户在通讯录创建本机 Codex 员工', async ({ runtime, codexEmployee }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('本机 Codex 同事')
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill('使用原生 Codex 的独立聊天员工')
  await dialog.getByRole('textbox', { name: '工作方式', exact: true }).fill('用中文简短回答当前用户问题。普通聊天不执行工具；明确要求交付文件时使用宿主工具完成并报告实际证据。')
  await selectNativeEmployee(page, dialog, '本机 Codex')
  await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0)
  await runtime.reviewCheckpoint('创建本机Codex员工无API配置')
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const agent = snapshot.agents.find(a => a.name === '本机 Codex 同事')!
  expect(agent.executionBackend?.kind).toBe('codex-local'); expect(agent.connectionId).toBe('')
  expect(snapshot.connections).toEqual([])
  codexEmployee.employeeId = agent.id
  codexEmployee.conversationId = snapshot.conversations.find(c => c.agentIds.includes(agent.id))!.id
})
Then('用户以{string}继续本机定时任务的原问题且不重复已完成操作', async ({ runtime, codexEmployee }, continuation: string) => {
  const renewal = continuation === '追加到期额度', page = runtime.page
  test.setTimeout(900000)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible'), title = '本机等待补充'
  await editor.getByLabel('标题', { exact: true }).fill(title)
  const request = codexEmployee.real
    ? '这是明确的文件工作，请先用宿主工具在 self:/work/prepared.txt 写入 prepared-once，然后报告等待用户补充，并公开提问“最终文件标题用什么？”。在我明确回复之前不要创建或发布最终文件。收到补充后保留已经写好的 prepared.txt，不重写它；只创建并正式发布 codex-proof.md，正文包含我补充的标题，然后用真实文件证据报告交付。无需命令、联网或研究。'
    : 'NATIVE_FILE_TASK NATIVE_QUESTION'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Codex 同事')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  await scheduleAction(page, '立即运行一次')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(value => value.name === title)!
  const occurrence = async () => (await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(value => value.automationId === plan.id)!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => (await occurrence())?.status, { timeout: 210000 }).toBe('waiting_user')
    const waiting = await occurrence(), before = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId)
    expect(before.workItems).toHaveLength(1); expect(before.workBudgets).toHaveLength(1)
    const work = before.workItems![0], budget = before.workBudgets![0]
    expect(work).toMatchObject({ status: 'waiting', origin: { occurrenceId: waiting.id } })
    expect(before.artifacts).toEqual([])
    const item = await page.evaluate(id => window.boai.request('getInboxItem', { id: `question:occurrence:${id}` }), waiting.id)
    expect(item?.question).toBeDefined()
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: codexEmployee.employeeId!, conversationId: waiting.conversationId })
    const prepared = join(home.sessionPath!, 'work', 'prepared.txt'), modified = (await stat(prepared)).mtimeMs
    expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
    await runtime.reviewFile('补充前实际写出的原草稿', prepared)
    await runtime.reviewData('本机原问题与补充前预算', { waiting, work, budget, question: item, realSupplier: !!codexEmployee.real, expiryMode: renewal ? codexEmployee.real ? 'actual-original-deadline' : 'seeded-expired-state' : 'not-expired' })
    await page.getByRole('button', { name: '补充信息', exact: true }).click()
    await expect(page.locator(`#message-${item!.question!.messageId}`)).toBeVisible()
    await runtime.reviewCheckpoint('本机定时任务在原员工消息提出问题')
    const answer = codexEmployee.real ? `标题用“${codexEmployee.token}”。请保留 prepared.txt，完成原 codex-proof.md 文件并正式交付。` : '标题用 Codex proof，完成原文件。'
    if (renewal) {
      if (codexEmployee.real) {
        // Exercise the real original deadline. No clock replacement or database mutation in the provider batch.
        await expect.poll(async () => (await occurrence()).status, { timeout: 340000, intervals: [1000, 5000] }).toBe('cancelled')
      } else await seedExpiredAutomationBudget(join(runtime.root, 'v2'), waiting.id)
      const stopped = await occurrence()
      expect(stopped).toMatchObject({ cancellationCause: 'budget', budgetId: budget.id })
      await runtime.reviewData('原预算到期的实际或预置边界', { stopped, actualWallClock: !!codexEmployee.real })
      await page.getByRole('button', { name: '定时任务', exact: true }).click(); await openSchedule(page, title)
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
      await expect(page.getByText(/累计请求上限将为 48 次/)).toBeVisible()
      await runtime.reviewCheckpoint('本机到期后显示原计量和明确追加额度')
      await page.getByRole('button', { name: '取消', exact: true }).click()
      expect((await store.load<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets'))[0].renewals).toBeUndefined()
      expect(await store.load('budgetModelCalls')).toHaveLength(budget.modelCalls)
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
      await page.getByLabel('继续未完成工作的说明', { exact: true }).fill(answer)
      await page.getByRole('button', { name: '确认追加额度并继续', exact: true }).click()
    } else {
      await page.locator(`#message-${item!.question!.messageId}`).getByRole('button', { name: '回复此问题', exact: true }).click()
      await expect(page.locator('.reply-preview')).toContainText('正在补充这一次定时任务')
      await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(answer)
      await verifyLocalAgentNavigation(runtime, { employeeId: codexEmployee.employeeId!, conversationId: waiting.conversationId, label: 'Codex原问题' })
      await runtime.reviewCheckpoint('同一输入框明确回复本次定时任务原问题')
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
    }
    await expect.poll(async () => (await occurrence()).status, { timeout: 240000 }).toBe('completed')
    const after = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId), result = await occurrence()
    expect(result).toMatchObject({ id: waiting.id, budgetId: budget.id, deliveryStatus: 'delivered' })
    expect(after.workItems).toHaveLength(1); expect(after.workBudgets).toHaveLength(1)
    expect(after.workItems![0]).toMatchObject({ id: work.id, status: 'delivered', budgetId: budget.id, sourceMessageId: work.sourceMessageId, origin: work.origin })
    const spent = after.workBudgets![0]
    expect(spent).toMatchObject({ id: budget.id, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false, maxModelCalls: renewal ? 48 : 24, runs: 2 })
    expect(spent.modelCalls).toBeGreaterThan(budget.modelCalls)
    const reply = after.messages.filter(message => message.content === answer)
    expect(reply).toHaveLength(1); expect(reply[0].origin?.occurrenceId).toBe(waiting.id)
    if (renewal) {
      expect(spent.renewals).toHaveLength(1)
      expect(spent.renewals![0]).toMatchObject({ messageId: reply[0].id, used: { modelCalls: budget.modelCalls, usage: budget.usage, unknownCalls: budget.unknownCalls } })
      expect(Date.parse(spent.deadlineAt)).toBeGreaterThan(Date.parse(budget.deadlineAt))
    } else {
      expect(spent.deadlineAt).toBe(budget.deadlineAt)
      expect(reply[0].inboxReply).toMatchObject({ questionId: `occurrence:${waiting.id}`, questionMessageId: item!.question!.messageId, questionRevision: item!.question!.revision })
    }
    expect((await stat(prepared)).mtimeMs).toBe(modified); expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
    const artifact = after.artifacts.find(file => after.workItems![0].artifactIds.includes(file.id!))!
    expect(artifact).toBeDefined(); expect(await readFile(artifact.path, 'utf8')).toContain(codexEmployee.real ? codexEmployee.token! : 'NATIVE_FILE_TASK')
    await runtime.reviewFile('明确补充后原工作实际交付文件', artifact.path)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls.length).toBe(spent.modelCalls)
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && call.origin?.occurrenceId === waiting.id)).toBe(true)
    if (renewal) {
      await page.getByText('运行明细', { exact: true }).click()
      await page.getByText('额度追加记录（1 次）', { exact: true }).click()
      await expect(page.getByText(/API／本机请求上限 24 → 48/)).toBeVisible()
      await runtime.reviewCheckpoint('追加后累计用量及确认消息可核对')
      await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    }
    await runtime.reviewCheckpoint('原定时工作补充后正式交付')
    const runs = await store.load('runs')
    await runtime.restart()
    expect(await store.load('runs')).toEqual(runs); expect(await store.load('budgetModelCalls')).toEqual(calls)
    expect((await store.load<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets'))[0]).toEqual(spent)
    expect((await stat(prepared)).mtimeMs).toBe(modified)
    await runtime.reviewCheckpoint('重启保留原问题补充及累计预算没有重放')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('本机补充最终原始状态', { plans: await store.load('automations'), occurrences: await store.load('automationOccurrences'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), runs: await store.load('runs') })
    await store.close()
  }
})
Then('用户创建本机员工定时任务并以{string}核对原预算文件交付与重启', async ({ runtime, codexEmployee }, trigger: string) => {
  const scheduled = trigger === '日历触发'
  let due: Date | undefined
  const page = runtime.page, employeeId = codexEmployee.employeeId!
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill('本机每日交付')
  const request = codexEmployee.real
    ? `请现在用宿主工具创建并正式发布 codex-proof.md，正文只需包含“${codexEmployee.token}”。这是本次定时任务的明确文件交付请求；完成后用实际文件证据报告已交付。无需研究、联网或命令。`
    : 'NATIVE_FILE_TASK'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Codex 同事')
  if (scheduled) {
    due = new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000)
    await editor.getByRole('button', { name: '时间', exact: true }).click()
    await page.getByLabel('执行时间', { exact: true }).fill(due.toISOString().slice(11, 16))
    await page.getByLabel('时区', { exact: true }).fill('UTC')
    await page.keyboard.press('Escape')
  }
  await runtime.reviewData('本机自动化原始请求', { request, realSupplier: !!codexEmployee.real, trigger: scheduled ? 'schedule' : 'manual', scheduledFor: due?.toISOString(), humanReview: 'pending' })
  await runtime.reviewCheckpoint('七项定时任务表单选择本机员工无需API')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '本机每日交付', exact: true })).toBeVisible()
  if (!scheduled) await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === '本机每日交付')!
  expect(plan).toMatchObject({ enabled: scheduled, sync: 'synced', employeeIds: [employeeId], conversationPolicy: 'new-conversation' })
  if (scheduled) expect(plan.nextTimes[0]).toBe(due!.toISOString())
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    expect(await store.load('runs')).toEqual([])
    if (!scheduled) await scheduleAction(page, '立即运行一次')
    await expect.poll(async () => (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(o => o.automationId === plan.id)?.status, { timeout: scheduled ? 430000 : 270000 }).toBe('completed')
    const occurrence = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(o => o.automationId === plan.id)!
    expect(occurrence).toMatchObject({ source: scheduled ? 'schedule' : 'manual', deliveryStatus: 'delivered', usageIncomplete: false, budget: { callUnit: 'mixed' } })
    if (scheduled) { expect(occurrence.scheduledFor).toBe(due!.toISOString()); expect(occurrence.nativeRunId).toBeTruthy() }
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), occurrence.conversationId)
    expect(detail.conversation).toMatchObject({ purpose: 'automation', agentIds: [employeeId], occurrenceId: occurrence.id })
    expect(detail.conversation.id).not.toBe(codexEmployee.conversationId)
    expect(detail.workItems).toHaveLength(1)
    const work = detail.workItems![0]!, budget = detail.workBudgets![0]!
    expect(work).toMatchObject({ status: 'delivered', sourceMessageId: occurrence.messageId, budgetId: occurrence.budgetId, origin: { occurrenceId: occurrence.id } })
    expect(budget).toMatchObject({ id: occurrence.budgetId, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false, maxModelCalls: 24 })
    const calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls).toHaveLength(budget.modelCalls)
    expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && call.budgetId === budget.id && call.origin?.occurrenceId === occurrence.id)).toBe(true)
    expect(calls.some(call => call.phase === 'decision')).toBe(true); expect(calls.some(call => call.phase === 'memory')).toBe(true)
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    expect(detail.runs.every(run => run.status === 'completed' && run.backend?.kind === 'codex-local')).toBe(true)
    const artifact = detail.artifacts.find(file => work.artifactIds.includes(file.id!))!
    expect(artifact).toBeDefined()
    const content = await readFile(artifact.path, 'utf8')
    expect(content).toContain(codexEmployee.real ? codexEmployee.token! : 'NATIVE_FILE_TASK')
    await runtime.reviewFile('本机自动化正式交付原件', artifact.path)
    await page.locator(`[data-occurrence-id="${occurrence.id}"]`).getByText('运行明细', { exact: true }).click()
    await expect(page.getByText('本机请求按外部回合计数，Agent 内部模型调用次数未知；未完整返回的用量继续标记为未知。', { exact: true })).toBeVisible()
    await runtime.reviewCheckpoint('本机自动化交付结果及实际计量口径')
    await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewCheckpoint('本机自动化在原IM任务聊天交付')
    const runs = await store.load('runs'), budgets = await store.load('workBudgets')
    await runtime.restart()
    const after = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)
    expect(after).toMatchObject({ id: occurrence.id, status: 'completed', deliveryStatus: 'delivered' })
    expect(await store.load('runs')).toEqual(runs); expect(await store.load('workBudgets')).toEqual(budgets)
    expect(await readFile(artifact.path, 'utf8')).toBe(content)
    await runtime.reviewCheckpoint('重启保留定时任务成果并且没有重复执行')
  } finally {
    await runtime.reviewData('本机自动化最终原始状态', { plans: await store.load('automations'), occurrences: await store.load('automationOccurrences'), works: await store.load('workItems'), calls: await store.load('budgetModelCalls'), budgets: await store.load('workBudgets'), runs: await store.load('runs') })
    await store.close()
  }
})
Then('员工无需模型 API 即可连续回答两轮且重启保持身份', async ({ runtime, codexEmployee }) => {
  if (codexEmployee.real) test.setTimeout(900000)
  const id = codexEmployee.conversationId!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const send = async (content: string, count: number) => {
    const input = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
    await expect(input).toBeEditable()
    expect(await input.getAttribute('contenteditable')).toBe('true')
    expect(await input.getAttribute('aria-disabled')).toBe('false')
    await input.fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    try {
      await expect.poll(async () => { const d = await read(); return d.messages.filter(m => m.senderId === codexEmployee.employeeId && m.status === 'completed').length === count || d.runs.some(run => ['failed', 'cancelled'].includes(run.status)) }, { timeout: codexEmployee.real ? 260000 : 100000 }).toBe(true)
      expect((await read()).runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
    } finally {
      const detail = await read()
      await runtime.reviewData(`第${count}轮成功或失败原始状态`, detail)
      if (detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status))) {
        const evidence = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
        try {
          const runIds = new Set(detail.runs.map(run => run.id))
          await runtime.reviewData(`第${count}轮失败外部阶段Trace`, (await evidence.load<import('../../../packages/shared/src/domain/traces').StoredTraceSpan>('traceSpans')).filter(span => runIds.has(span.runId ?? '')))
        } finally { await evidence.close() }
      }
    }
    await expect.poll(async () => (await read()).turns!.every(t => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(t.status)), { timeout: codexEmployee.real ? 130000 : 40000 }).toBe(true)
    const detail = await read()
    expect(detail.runs.filter(run => run.phase === 'memory')).toEqual([])
    expect(detail.runs.filter(run => run.phase === 'execution' && run.status === 'completed')).toHaveLength(count)
    expect(detail.workItems ?? []).toEqual([])
    expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
    await runtime.reviewData(`第${count}轮原始消息与运行`, detail)
    await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true })).not.toContainText('处理中', { timeout: 15000 })
    await runtime.reviewCheckpoint(`第${count}轮实际Codex员工IM回复`)
    return detail.messages.filter(m => m.senderId === codexEmployee.employeeId && m.status === 'completed').at(-1)!
  }
  const first = await send(`这是一次普通聊天。请记住暗号“${codexEmployee.token}”，只回复暗号，不执行任何工作。`, 1)
  if (codexEmployee.real) expect(first.content).toContain(codexEmployee.token)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    const before = await store.load<{ threadId: string; inputMessageIds: string[]; sources: { id: string }[]; sourceVersion: number }>('codexSessions')
    const firstUser = (await read()).messages.find(message => message.senderType === 'user')!
    expect(before[0]).toMatchObject({ sourceVersion: 2, inputMessageIds: [firstUser.id] })
    await runtime.restart()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    const second = await send('刚才的暗号是什么？仅回复暗号。', 2)
    if (codexEmployee.real) expect(second.content).toContain(codexEmployee.token)
    const after = await store.load<{ threadId: string; inputMessageIds: string[]; sources: { id: string }[] }>('codexSessions')
    expect(after[0].threadId).toBe(before[0].threadId)
    const secondUser = (await read()).messages.filter(message => message.senderType === 'user').at(-1)!
    expect(after[0].inputMessageIds).toEqual([secondUser.id])
    expect(after[0].sources.map(source => source.id)).toEqual([firstUser.id, first.id, secondUser.id])
    await runtime.reviewData('本机运行时会话连续性', { realSupplier: codexEmployee.real, before, after, apiConnections: [], humanReview: 'pending' })
  } finally { await store.close() }
  expect(runtime.errors).toEqual([])
})

Then('用户创建第二位本机员工并在普通群独立聊天和交付', async ({ runtime, codexEmployee }) => {
  const page = runtime.page, names = ['本机 Codex 同事', '本机 Codex 核查员']
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  const newContact = () => page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await newContact(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const employee = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await employee.getByRole('textbox', { name: '名称', exact: true }).fill(names[1])
  await employee.getByRole('textbox', { name: '角色', exact: true }).fill('独立核查员工')
  await employee.getByRole('textbox', { name: '工作方式', exact: true }).fill('按用户请求独立回应和交付自己的工作。简短中文，只有明确文件任务才使用宿主工具。')
  await selectNativeEmployee(page, employee, '本机 Codex')
  await employee.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(employee).toBeHidden()
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await newContact(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const group = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of names) await group.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await runtime.reviewCheckpoint('普通群选择两位本机员工')
  await group.getByRole('button', { name: '完成', exact: true }).click(); await expect(group).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const members = snapshot.agents.filter(agent => names.includes(agent.name))
  const chat = snapshot.conversations.find(chat => chat.kind === 'group' && members.every(member => chat.agentIds.includes(member.id)))!
  expect(chat.agentIds).toHaveLength(2); expect(snapshot.connections).toEqual([])
  const read = () => page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  const send = async (text: string) => { await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click() }
  const idle = async () => expect.poll(async () => {
    const detail = await read()
    return !!detail.turns?.length && detail.turns.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
  }, { timeout: 210000 }).toBe(true)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await send(`两位同事各自用一句话介绍自己的姓名。这只是普通聊天，不执行工作。暗号：${codexEmployee.token}。`)
    await idle()
    const first = await read()
    expect(first.workItems).toEqual([])
    expect(first.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.senderId).sort()).toEqual(members.map(member => member.id).sort())
    expect(first.runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
    const sessions = (await store.load<{ conversationId: string; agentId: string; threadId: string; state: string }>('codexSessions')).filter(session => session.conversationId === chat.id)
    expect(sessions).toHaveLength(2); expect(new Set(sessions.map(session => session.threadId)).size).toBe(2)
    await runtime.reviewData('两位员工独立聊天会话与零Work', { detail: first, sessions })
    await runtime.reviewCheckpoint('本机员工普通群各自回复')
    await send(`NATIVE_GROUP_FILES：现在分别授权两项独立文件任务。${names[0]}负责创建并发布“同事.md”，内容为“同事已核查，暗号${codexEmployee.token}”；${names[1]}负责创建并发布“核查员.md”，内容为“核查员已核查，暗号${codexEmployee.token}”。每位只完成自己这项不同的工作，各自发布一个真实Markdown文件。不委派、不等待对方、不执行命令，简短汇报。`)
    await idle()
    const final = await read(), works = final.workItems!, budgets = final.workBudgets!
    expect(works).toHaveLength(2); expect(works.every(work => work.status === 'delivered' && !work.parentWorkId)).toBe(true)
    expect(new Set(works.map(work => work.ownerAgentId)).size).toBe(2)
    expect(budgets).toHaveLength(1); expect(new Set(works.map(work => work.budgetId))).toEqual(new Set([budgets[0].id]))
    expect(budgets[0]).toMatchObject({ callUnit: 'external-turn', accounting: 'model-calls-v1', unknownCalls: 0 })
    expect(final.runs.filter(run => run.status === 'failed')).toEqual([])
    expect(final.artifacts).toHaveLength(2)
    for (const artifact of final.artifacts) {
      const content = await readFile(artifact.path, 'utf8')
      if (codexEmployee.real) expect(content).toContain(codexEmployee.token)
      else expect(content).toContain('NATIVE_FILE_TASK')
      expect(final.runs.some(run => run.id === artifact.runId && works.some(work => work.id === run.workId && work.artifactIds.includes(artifact.id!)))).toBe(true)
      await runtime.reviewFile(`独立员工交付原件-${artifact.name}`, artifact.path)
    }
    const calls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budgets[0].id)
    expect(calls.length).toBe(budgets[0].modelCalls)
    await runtime.reviewData('普通群两项独立交付和唯一原预算', { detail: final, calls })
    await runtime.reviewCheckpoint('普通群本机员工分别交付文件')
  } finally { await runtime.reviewData('群聊最终成功或失败状态', await read()); await store.close() }
  expect(runtime.errors).toEqual([])
})

Then('用户在原聊天批准命令并停止工作且重启不重跑', async ({ runtime, codexEmployee }) => {
  test.skip(process.platform === 'win32', '此场景验证POSIX继承进程组，Windows单独验收')
  const id = codexEmployee.conversationId!, page = runtime.page
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === 'ESRCH') return false; if (code === 'EPERM') return true; throw error } }
  const commandPath = resolve('tests/fixtures/native-command.sh'), command = await readFile(commandPath, 'utf8')
  const recordedCommand = join(runtime.root, 'authorized-command.sh'); await cp(commandPath, recordedCommand)
  await runtime.reviewFile('本次明确授权的原命令', recordedCommand)
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await page.getByRole('checkbox', { name: /允许申请运行命令/ }).check()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === codexEmployee.employeeId)?.allowCommands).toBe(true)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(`NATIVE_FILE_TASK NATIVE_CANCEL_COMMAND：请实际执行以下命令，这是我要在界面停止的长任务。仅在原聊天请求批准，通过 execute_command 原样执行一次；不要提前结束，不运行其他工具或发布成果。命令只在本次工作目录保存PID和计数。\n\n${command}`)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  try {
    const approvalCard = page.getByRole('region', { name: '本机 Codex 同事 的命令审批', exact: true })
    await expect.poll(async () => {
      const current = await read()
      return (await page.evaluate(() => window.boai.request('snapshot', undefined))).approvals.some(approval => approval.conversationId === id)
        || current.runs.some(run => run.phase === 'execution' && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
    }, { timeout: 210000 }).toBe(true)
    await expect(approvalCard).toBeVisible()
    const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    const approval = snapshot.approvals.find(approval => approval.conversationId === id)!
    expect(approval.command.trim()).toBe(command.trim())
    const before = await read(), work = before.workItems!.find(work => work.activeRunId === approval.runId)!
    expect(work.ownerAgentId).toBe(codexEmployee.employeeId)
    await expect(readFile(join(approval.cwd, 'command-parent.pid'))).rejects.toThrow()
    await runtime.reviewData('原审批与尚未执行的工作', { approval, detail: before })
    await runtime.reviewCheckpoint('本机员工原消息请求命令批准')
    await approvalCard.getByRole('button', { name: '允许这次执行', exact: true }).click()
    await expect.poll(async () => readFile(join(approval.cwd, 'command-child.pid'), 'utf8').catch(() => ''), { timeout: 10000 }).toMatch(/^\d+$/)
    const parent = Number(await readFile(join(approval.cwd, 'command-parent.pid'), 'utf8')), child = Number(await readFile(join(approval.cwd, 'command-child.pid'), 'utf8'))
    expect(alive(parent)).toBe(true); expect(alive(child)).toBe(true)
    await runtime.reviewData('批准后实际父子进程存活', { parent, child, parentAlive: alive(parent), childAlive: alive(child), detail: await read() })
    await page.locator('.chat-header').getByRole('button', { name: '会话操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
    const originalWork = page.locator(`.activity-detail [data-work-id="${work.id}"]`)
    await runtime.reviewCheckpoint('实际命令运行中原工作停止入口')
    await originalWork.getByRole('button', { name: '停止此工作及子工作', exact: true }).click()
    await expect.poll(() => alive(parent) || alive(child) || alive(-parent), { timeout: 10000 }).toBe(false)
    await expect.poll(async () => (await read()).workItems!.find(value => value.id === work.id)?.status).toBe('cancelled')
    const stopped = await read()
    expect(stopped.artifacts).toEqual([])
    expect(stopped.workItems!.find(value => value.id === work.id)).toMatchObject({ status: 'cancelled', requiresReview: true, artifactIds: [] })
    expect(stopped.runs.find(run => run.id === approval.runId)).toMatchObject({ status: 'cancelled', backend: { kind: 'codex-local' } })
    const ticks = await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')
    const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
    try {
      const calls = await store.load<BudgetModelCall>('budgetModelCalls')
      expect(calls.filter(call => call.workId === work.id)).toHaveLength(2)
      await runtime.reviewData('实际退出及未知用量保留', { parent, child, parentAlive: false, childAlive: false, groupAlive: false, detail: stopped, calls, humanReview: 'pending' })
      for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt']) await runtime.reviewFile(`已停止命令原件 · ${name}`, join(approval.cwd, name))
      await runtime.reviewCheckpoint('停止后原工作保留待核对且没有伪交付')
      await runtime.restart()
      await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
      const recovered = await read()
      expect(recovered.messages).toEqual(stopped.messages); expect(recovered.runs).toEqual(stopped.runs); expect(recovered.workItems).toEqual(stopped.workItems)
      expect(await store.load('budgetModelCalls')).toEqual(calls)
      expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks)
      expect(alive(parent) || alive(child) || alive(-parent)).toBe(false)
      expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals).toEqual([])
      await runtime.reviewData('重启不再请求模型或命令', recovered)
      await runtime.reviewCheckpoint('重启后保留已停止原工作')
    } finally { await store.close() }
  } finally { await runtime.reviewData('本机命令停止场景最终原始状态', await read()) }
  expect(runtime.errors).toEqual([])
})

Then('本机员工备份恢复到{string}后新建会话且原聊天保持', async ({ runtime, codexEmployee }, location: string) => {
  const id = codexEmployee.conversationId!, sourceRoot = await realpath(runtime.root)
  const originalDataPath = join(sourceRoot, 'v2')
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const mapping = async (dataPath: string) => {
    const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
    try { return (await store.load<{ threadId: string; runId: string; resumeInvalidated?: string; inputMessageIds: string[]; state: string }>('codexSessions'))[0] } finally { await store.close() }
  }
  const openChat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const send = async (content: string, count: number, label: string) => {
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    try {
      await expect.poll(async () => {
        const detail = await read()
        return detail.runs.some(run => ['failed', 'cancelled'].includes(run.status)) || detail.messages.filter(message => message.senderId === codexEmployee.employeeId && message.status === 'completed').length === count
          && detail.runs.filter(run => run.phase === 'memory' && run.status === 'completed').length === count
          && detail.runs.every(run => run.status === 'completed')
      }, { timeout: 250000 }).toBe(true)
      const detail = await read()
      expect(detail.runs.filter(run => run.status !== 'completed')).toEqual([])
      expect(detail.workItems ?? []).toEqual([])
      await runtime.reviewCheckpoint(label)
      return detail
    } finally { await runtime.reviewData(`${label}原始消息与运行`, await read()) }
  }
  const before = await send(`普通聊天：请记住当前暗号“${codexEmployee.token}”，只回复暗号，不执行工作。`, 1, '本机备份前原聊天')
  const originalMapping = await mapping(originalDataPath)
  const exportRoot = join(sourceRoot, 'backup-exports'); await mkdir(exportRoot)
  await runtime.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, exportRoot)
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '数据与备份', exact: true }).click()
  await runtime.page.getByRole('button', { name: '导出备份', exact: true }).click()
  await expect(runtime.page.getByText(/^备份已导出：/)).toBeVisible({ timeout: 30000 })
  const exports = await readdir(exportRoot); expect(exports).toHaveLength(1)
  const backup = join(exportRoot, exports[0]), backupManifest = JSON.parse(await readFile(join(backup, 'backup.json'), 'utf8'))
  expect(backupManifest).toMatchObject({ nativeAgentRestorePolicy: 'fresh-session', credentialsIncluded: false, appearanceIncluded: true })
  await runtime.reviewFile('本机恢复说明原件', join(backup, 'RESTORE.txt'))
  await runtime.reviewData('本机备份清单', backupManifest)
  await runtime.reviewCheckpoint('原设置界面成功导出本机员工备份')
  expect(await mapping(originalDataPath)).toEqual(originalMapping)
  await openChat()
  const futureToken = `导出之后-${randomUUID().slice(0, 8)}`
  const advanced = await send(`普通聊天：将当前暗号更新为“${futureToken}”，只回复这个新暗号，不执行工作。`, 2, '备份导出之后继续原生聊天')
  if (codexEmployee.real) expect(advanced.messages.filter(message => message.senderId === codexEmployee.employeeId).at(-1)!.content).toContain(futureToken)
  const advancedMapping = await mapping(originalDataPath)
  expect(advancedMapping.threadId).toBe(originalMapping.threadId)
  expect(advancedMapping.runId).not.toBe(originalMapping.runId)
  await runtime.close()
  const restoredRoot = location === '原目录' ? sourceRoot : join(sourceRoot, 'restored-data')
  const restoredDataPath = join(restoredRoot, 'v2')
  if (location === '原目录') await rm(restoredDataPath, { recursive: true, force: true })
  else await mkdir(restoredRoot)
  await cp(backup, restoredDataPath, { recursive: true })
  await runtime.start({ dataDir: restoredRoot }); await openChat()
  const recovered = await read(), invalidated = await mapping(restoredDataPath)
  expect(recovered.messages).toEqual(before.messages)
  expect(recovered.runs).toEqual(before.runs)
  expect(recovered.workItems ?? []).toEqual([])
  expect(invalidated).toEqual({ ...originalMapping, resumeInvalidated: 'restored-backup' })
  await runtime.reviewData('恢复仅核对原事实未新增运行', { location, before, recovered, originalMapping, advancedMapping, invalidated, realSupplier: codexEmployee.real })
  await runtime.reviewCheckpoint('恢复后原消息保留且导出后消息不在产品历史中')
  const after = await send('普通聊天：当前暗号是什么？只回复暗号，不执行工作。', 2, '恢复后明确新发送建立新本机会话')
  const rebuilt = await mapping(restoredDataPath)
  expect(rebuilt.threadId).not.toBe(originalMapping.threadId)
  expect(rebuilt.resumeInvalidated).toBeUndefined()
  const secondUser = after.messages.filter(message => message.senderType === 'user').at(-1)!
  expect(rebuilt.inputMessageIds).toEqual([...before.messages.map(message => message.id), secondUser.id])
  if (codexEmployee.real) {
    const reply = after.messages.filter(message => message.senderId === codexEmployee.employeeId).at(-1)!.content
    expect(reply).toContain(codexEmployee.token); expect(reply).not.toContain(futureToken)
  }
  await runtime.restart(); await openChat()
  expect(await mapping(restoredDataPath)).toEqual(rebuilt)
  expect((await read()).runs).toEqual(after.runs)
  await runtime.reviewData('恢复后新会话与再次正常重启核对', { location, rebuilt, after: await read(), humanReview: 'pending' })
  await runtime.reviewCheckpoint('恢复后再次重启仍保留新会话原记录')
  expect(runtime.errors).toEqual([])
})

Then('用户给本机员工绑定技能知识并发送材料完成真实交付', async ({ runtime, codexEmployee }) => {
  const files = await prepareCodexResources(runtime.root), page = runtime.page, id = codexEmployee.conversationId!
  const read = () => page.evaluate(id => window.boai.request('getConversation', { id }), id)
  for (const [name, path] of Object.entries({ 技能说明: join(files.skill, 'SKILL.md'), 技能参考原件: files.reference, 知识原件: files.knowledge, 材料原件: files.material, 图片原件: files.image })) await runtime.reviewFile(name, path)
  await runtime.reviewData('资源预期结果', { textToken: files.textToken, skillToken: files.skillToken, knowledgeToken: files.knowledgeToken, imageOrder: files.imageOrder, realSupplier: !!codexEmployee.real, humanReview: 'pending' })
  // Prepare the resource inventory through the actual native choice and import.
  // Employee binding and sending below are performed in the product UI.
  for (const [kind, path] of [['skill', files.skill], ['knowledge', files.knowledge]] as const) {
    await nextMaterialDialog(runtime, { path })
    await page.evaluate(async kind => {
      const path = await window.boai.request('choosePath', { kind })
      if (!path) throw new Error('资源选择没有返回路径')
      await window.boai.request('importResource', { kind, path })
    }, kind)
  }
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await page.getByRole('checkbox', { name: /^native-proof / }).check()
  await page.getByRole('checkbox', { name: /^知识\.md / }).check()
  await runtime.reviewCheckpoint('本机员工在原配置绑定技能与知识')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  for (const path of [files.material, files.image]) {
    await nextMaterialDialog(runtime, { path })
    await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  }
  await expect(page.locator('[data-material-status="ready"]')).toHaveCount(2)
  await runtime.reviewCheckpoint('本机员工原输入框中的文本与图片附件')
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('NATIVE_RESOURCE_TASK NATIVE_MEMORY：请实际执行并交付 codex-proof.md。调用 skill 加载 native-proof，使用 skill_read 读取它的 references/proof.md；调用 search_knowledge 查询 KNOWLEDGE_PROOF。文件须写出技能参考、知识和本条 Markdown 附件中的三个完整核对码。还要看本条图片，将从左到右的三块颜色另写一行，颜色名称使用紫色、绿色、橙色，以英文逗号分隔。不能猜测任何核对码。使用发布工具正式交付文件。我有一个长期写作偏好，请记住：报告标题使用紫色。完成后简短说明。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  try {
    await expect.poll(async () => { const d = await read(); return d.workItems?.some(work => work.status === 'delivered') || d.runs.some(run => ['failed', 'cancelled'].includes(run.status)) }, { timeout: 360000 }).toBe(true)
    const delivered = await read()
    expect(delivered.runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
    expect(delivered.workItems).toHaveLength(1); expect(delivered.workItems![0].status).toBe('delivered')
    expect(delivered.artifacts).toHaveLength(1)
    const artifact = delivered.artifacts[0], body = await readFile(artifact.path, 'utf8')
    await runtime.reviewFile('本机员工资源交付原件', artifact.path)
    for (const token of [files.textToken, files.skillToken, files.knowledgeToken]) expect(body).toContain(token)
    if (codexEmployee.real) expect(body.replace(/\s/g, '')).toContain(files.imageOrder)
    const task = delivered.runs.find(run => run.responseKind === 'task')!
    expect(task.backend?.kind).toBe('codex-local')
    expect(task.toolEvents.filter(event => event.status === 'completed').map(event => event.name)).toEqual(expect.arrayContaining(['skill', 'skill_read', 'search_knowledge', 'publish_artifact']))
    await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && ['completed', 'failed', 'cancelled'].includes(run.status)), { timeout: 130000 }).toBe(true)
    const final = await read(); expect(final.runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
    const budget = final.workBudgets![0]
    expect(budget).toMatchObject({ callUnit: 'external-turn', accounting: 'model-calls-v1', modelCalls: 3, runs: 1, unknownCalls: 0, usageIncomplete: false, sourceMessageId: final.workItems![0].sourceMessageId })
    expect(Date.parse(budget.deadlineAt) - Date.parse(final.runs.find(run => run.phase === 'decision')!.createdAt)).toBe(300000)
    expect(final.runs.find(run => run.phase === 'memory')?.workId).toBe(final.workItems![0].id)
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) expect(budget.usage[field]).toBe(final.runs.reduce((sum, run) => sum + run.usage![field]!, 0))
    const ledgerStore = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
    try {
      const calls = await ledgerStore.load<BudgetModelCall>('budgetModelCalls')
      expect(calls.map(call => call.phase).sort()).toEqual(['decision', 'execution', 'memory'])
      expect(calls.every(call => call.budgetId === budget.id && call.workId === final.workItems![0].id && call.usageComplete)).toBe(true)
      await runtime.reviewData('本机员工原工作预算与逐请求账本', { budget, calls })
    } finally { await ledgerStore.close() }
    const memory = await page.evaluate(agentId => window.boai.request('getMemory', { agentId, scope: 'employee' }), codexEmployee.employeeId!)
    expect(memory.entries.some(entry => entry.origin === 'model' && entry.content.includes('紫色') && entry.useScope === 'conversation' && entry.sourceMessageIds.includes(final.messages.find(message => message.senderType === 'user')!.id))).toBe(true)
    await runtime.reviewData('本机员工已保存的来源关联记忆', memory)
    await runtime.reviewCheckpoint('本机员工材料技能与记忆实际交付')
  } finally { await runtime.reviewData('本机员工资源任务最终状态', await read()) }
  expect(runtime.errors).toEqual([])
})

Then('员工通过原聊天交付真实文件并保存同一工作证据', async ({ runtime, codexEmployee }) => {
  const id = codexEmployee.conversationId!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('NATIVE_FILE_TASK：请实际创建 codex-proof.md，正文必须精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行），通过文件发布工具交付给我。这是需要执行工具的文件任务，不要只在聊天里输出正文。完成后简短说明。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  try {
    // Observe the host's original 300-second deadline rather than ending a still
    // authorized external task at 240 seconds. This grants no execution time.
    await expect.poll(async () => { const d = await read(); return d.workItems?.some(work => work.status === 'delivered') || d.runs.some(run => ['failed', 'cancelled'].includes(run.status)) }, { timeout: 360000 }).toBe(true)
    expect((await read()).runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
    await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)), { timeout: 40000 }).toBe(true)
    const detail = await read(), work = detail.workItems!.find(work => work.status === 'delivered')!
    const artifact = detail.artifacts.find(file => work.artifactIds.includes(file.id!))!
    expect(artifact).toBeTruthy(); expect(artifact.ownerAgentId).toBe(codexEmployee.employeeId)
    const content = await readFile(artifact.path)
    await runtime.reviewFile('真实Codex发布原件', artifact.path)
    expect(content.toString('utf8')).toBe('# Codex proof\nNATIVE_FILE_TASK\n')
    expect(createHash('sha256').update(content).digest('hex')).toBe(artifact.contentHash)
    expect(work.resultMessageIds).toHaveLength(1)
    expect(work.outcome?.evidence).toContainEqual({ kind: 'artifact', reference: artifact.id })
    const run = detail.runs.find(run => run.id === artifact.runId)!
    expect(run.backend).toMatchObject({ kind: 'codex-local', toolControl: 'host-bridge', externalInvocations: 1 })
    expect(run.toolEvents.some(tool => tool.name === 'publish_artifact' && tool.status === 'completed')).toBe(true)
    await expect(runtime.page.getByRole('button', { name: '查看外部任务文件', exact: true })).toHaveCount(0)
    const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
    try { await runtime.reviewData('本机工作预算与外部调用计量', await store.load('workBudgets')) } finally { await store.close() }
    await runtime.reviewCheckpoint('真实Codex员工原聊天文件交付')
  } finally {
    await runtime.reviewData('本机文件任务原始工作与消息', await read())
    const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
    try { await runtime.reviewData('本机文件任务外部阶段与原调用', { traces: await store.load('traceSpans'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls') }) }
    finally { await store.close() }
  }
  expect(runtime.errors).toEqual([])
})

Then('用户在原文件卡片采用后要求修改并保留原版', async ({ runtime, codexEmployee }) => {
  const id = codexEmployee.conversationId!, page = runtime.page
  const read = () => page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ messages: await store.load('messages'), turns: await store.load('turns'), runs: await store.load('runs'),
    works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'),
    profileCalls: await store.load('profileModelCalls'), sessions: await store.load('codexSessions'), traces: await store.load('traceSpans'),
    artifacts: await store.load<ArtifactVersion>('artifacts') })
  const reviewFailures: unknown[] = []
  const preserveReview = async (operation: () => Promise<void>) => { try { await operation() } catch (error) { reviewFailures.push(error) } }
  let scenarioFailed = false, scenarioFailure: unknown
  try {
    // Post-delivery memory still settles against the original budget. Capture its
    // completed baseline before attributing any later budget change to revision.
    try {
      await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && ['completed', 'failed', 'cancelled'].includes(run.status)), { timeout: 130000 }).toBe(true)
      expect((await read()).runs.filter(run => run.phase === 'memory').map(run => run.status)).toEqual(['completed'])
    } finally {
      await preserveReview(async () => { await runtime.reviewData('本机修订前记忆结算原始状态', { detail: await read(), traces: await store.load('traceSpans'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls') }) })
    }
    const before = await read(), original = before.artifacts[0]!, work = before.workItems![0]!, budget = before.workBudgets!.find(value => value.id === work.budgetId)!
    const originalCalls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)
    const card = page.locator(`.messages [data-chat-artifact-id="${original.id}"]`)
    await card.getByRole('button', { name: '采用此版本', exact: true }).click()
    await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    await card.getByRole('button', { name: '要求修改', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '修改执行员工', exact: true })).toContainText('本机 Codex 同事')
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('NATIVE_REVISION：请基于我指定的原版，交付同一文件的新版本，正文精确为“# Codex proof revised\\nNATIVE_REVISION\\n”（\\n 写成换行）。发布时显式使用本次修订身份，保留旧文件；这是需要真实工具执行的任务。')
    await runtime.reviewCheckpoint('原聊天同一输入框固定版本修订')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    try {
      await expect.poll(async () => { const d = await read(); return d.artifacts.length === 2 || d.runs.some(run => ['failed', 'cancelled'].includes(run.status)) }, { timeout: 240000 }).toBe(true)
      expect((await read()).runs.filter(run => ['failed', 'cancelled'].includes(run.status))).toEqual([])
      await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)), { timeout: 40000 }).toBe(true)
      const after = await read(), replacement = after.artifacts.find(file => file.id !== original.id)!, next = after.workItems!.find(value => value.id !== work.id)!
      expect(after.workItems).toHaveLength(2)
      expect(replacement).toMatchObject({ logicalArtifactId: original.logicalArtifactId, contentVersion: 2, previousArtifactId: original.id, sourceWorkId: next.id })
      expect(next).toMatchObject({ status: 'delivered', rootWorkId: next.id })
      expect(next.budgetId).not.toBe(work.budgetId)
      expect(after.workItems!.find(value => value.id === work.id)).toEqual(work)
      expect(after.workBudgets!.find(value => value.id === budget.id)).toEqual(budget)
      expect(await readFile(original.path, 'utf8')).toBe('# Codex proof\nNATIVE_FILE_TASK\n')
      expect(await readFile(replacement.path, 'utf8')).toBe('# Codex proof revised\nNATIVE_REVISION\n')
      await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
      await runtime.reviewFile('本机员工明确修订新版原件', replacement.path)
      await runtime.reviewCheckpoint('本机员工新旧版本与原版采用状态')
      await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && run.workId === next.id && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 130000 }).toBe(true)
      const settled = await read(), calls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.conversationId === id)
      expect(settled.runs).toHaveLength(6)
      expect(settled.runs.every(run => run.status === 'completed' && !!run.finishedAt)).toBe(true)
      expect(settled.runs.filter(run => run.phase === 'memory' && run.workId === next.id).map(run => run.status)).toEqual(['completed'])
      expect(settled.workItems!.find(value => value.id === work.id)).toEqual(work)
      expect(settled.workBudgets!.find(value => value.id === budget.id)).toEqual(budget)
      expect(calls).toHaveLength(6)
      expect(calls.filter(call => call.budgetId === budget.id)).toEqual(originalCalls)
      for (const current of [work, next]) {
        const publication = settled.artifacts.find(file => file.sourceWorkId === current.id)!, execution = settled.runs.find(run => run.id === publication.runId)!
        const runs = settled.runs.filter(run => run.turnId === execution.turnId), ownCalls = calls.filter(call => call.budgetId === current.budgetId)
        const currentBudget = settled.workBudgets!.find(value => value.id === current.budgetId)!
        expect(runs.map(run => run.phase).sort()).toEqual(['decision', 'execution', 'memory'])
        expect(ownCalls.map(call => call.phase).sort()).toEqual(['decision', 'execution', 'memory'])
        expect(ownCalls.every(call => call.workId === current.id && call.turnId === execution.turnId && call.callUnit === 'external-turn' && call.usageComplete && !!call.settledAt && runs.some(run => run.id === call.runId && run.phase === call.phase))).toBe(true)
        expect(currentBudget).toMatchObject({ modelCalls: 3, runs: 1, callUnit: 'external-turn', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
        expect(Date.parse(currentBudget.deadlineAt) - Date.parse(runs.find(run => run.phase === 'decision')!.createdAt)).toBe(300000)
        for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) expect(currentBudget.usage[field]).toBe(ownCalls.reduce((sum, call) => sum + call.usage[field]!, 0))
      }
      await runtime.reviewData('本机两版交付与六阶段原预算账本结算', { detail: settled, calls })
    } finally { await preserveReview(async () => { await runtime.reviewData('本机修订原工作与新根状态', await read()) }) }
    expect(runtime.errors).toEqual([])
  } catch (error) { scenarioFailed = true; scenarioFailure = error; throw error }
  finally {
    await preserveReview(async () => { await runtime.reviewData('本机文件修订关闭前页面原状态', await read()) })
    await preserveReview(async () => { await archiveNativeFinalReview(runtime, { label: '本机文件修订', records }) })
    await preserveReview(async () => { await runtime.close() })
    await preserveReview(async () => { await store.close() })
    if (reviewFailures.length) throw new AggregateError(scenarioFailed ? [scenarioFailure, ...reviewFailures] : reviewFailures, '本机文件修订原场景或独立结束留证失败')
  }
})

Then('用户在定时文件工作执行期间以{string}结束并核对重启没有重放', async ({ runtime, codexEmployee }, ending: string) => {
  const crashed = ending === '运行服务意外退出'
  const page = runtime.page, title = '本机自动化停止验证'
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await editor.getByLabel('标题', { exact: true }).fill(title)
  const request = codexEmployee.real
    ? `明确文件工作：先用 write_file 在 self:/work/stop-proof.txt 写入“${codexEmployee.token}”。然后依次用 write_file 创建 self:/work/check-01.txt 至 check-30.txt，每个文件写入其编号与暗号“${codexEmployee.token}”。每次只写一个文件，不使用命令或脚本。全部完成前不要发布任何文件；全部完成后只发布 stop-proof.txt 并报告交付。这是用来核对停止行为的实际文件任务。`
    : 'NATIVE_FILE_TASK NATIVE_AUTOMATION_HANG'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Codex 同事')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  await scheduleAction(page, '立即运行一次')
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
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
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: codexEmployee.employeeId!, conversationId: occurrence.conversationId })
    const file = codexEmployee.real ? join(home.sessionPath!, 'work', 'stop-proof.txt') : join(home.sessionPath!, 'runs', before.runs.find(run => run.phase === 'execution')!.id, 'codex-proof.md')
    const content = await readFile(file, 'utf8'), modified = (await stat(file)).mtimeMs
    const callIds = (await store.load<BudgetModelCall>('budgetModelCalls')).map(call => call.id).sort()
    const processes = await runtimeChildProcessIds(runtime)
    expect(processes.length).toBeGreaterThan(0)
    await runtime.reviewData('停止前实际运行与本场子进程', { detail: before, processes, ending })
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
    expect(detail.runs.some(run => run.status === expectedStatus && run.backend?.kind === 'codex-local')).toBe(true)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls'), budgets = await store.load<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets')
    expect(calls.some(call => call.phase === 'execution' && !call.usageComplete)).toBe(true)
    expect(budgets).toHaveLength(1)
    expect(calls.map(call => call.id).sort()).toEqual(callIds)
    expect(budgets[0]).toMatchObject({ id: occurrence.budgetId, unknownCalls: 1, usageIncomplete: true })
    expect(content).toContain(codexEmployee.real ? codexEmployee.token! : 'NATIVE_FILE_TASK')
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
    await runtime.reviewCheckpoint('本机自动化停止后保留未知用量且未交付')
    const runs = await store.load('runs'), works = await store.load('workItems')
    await runtime.restart()
    const after = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)
    expect(after).toMatchObject({ id: occurrence.id, status: expectedStatus, budgetId: occurrence.budgetId })
    expect(await store.load('runs')).toEqual(runs); expect(await store.load('workItems')).toEqual(works)
    expect(await store.load('budgetModelCalls')).toEqual(calls); expect(await store.load('workBudgets')).toEqual(budgets)
    expect(await readFile(file, 'utf8')).toBe(content); expect((await stat(file)).mtimeMs).toBe(modified)
    await runtime.reviewCheckpoint('停止后重启没有恢复执行或发布原件')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('本机自动化停止最终原始状态', { occurrences: await store.load('automationOccurrences'), works: await store.load('workItems'), calls: await store.load('budgetModelCalls'), budgets: await store.load('workBudgets'), runs: await store.load('runs') })
    await store.close()
  }
})

Then('两位本机员工在四个上下文中续聊且切页和普通发送不打断原回复', async ({ runtime, codexEmployee }) => {
  test.setTimeout(900000)
  const page = runtime.page, names = ['本机 Codex 同事', '本机 Codex 独立同事']
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  const newContact = () => page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  await newContact(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill(names[1])
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('独立聊天同事')
  await editor.getByRole('textbox', { name: '工作方式', exact: true }).fill('根据当前聊天中的明确请求独立回答；普通聊天不执行工具。各会话临时暗号只属于当前会话。')
  await selectNativeEmployee(page, editor, '本机 Codex')
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const initial = await page.evaluate(() => window.boai.request('snapshot', undefined)), second = initial.agents.find(agent => agent.name === names[1])!
  const directB = initial.conversations.find(chat => chat.kind === 'direct' && chat.agentIds.includes(second.id))!
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await newContact(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const groupEditor = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of names) await groupEditor.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await groupEditor.getByRole('button', { name: '完成', exact: true }).click(); await expect(groupEditor).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const group = snapshot.conversations.find(chat => chat.kind === 'group' && chat.agentIds.includes(second.id) && chat.agentIds.includes(codexEmployee.employeeId!))!
  const chats = [codexEmployee.conversationId!, directB.id, group.id], codes = chats.map(() => `CHAT_CODE_${randomUUID()}`)
  expect(snapshot.connections).toEqual([])
  const selectedAgents = snapshot.agents.filter(agent => [codexEmployee.employeeId!, second.id].includes(agent.id))
  expect(selectedAgents[0].executionBackend).toEqual(selectedAgents[1].executionBackend)
  // Employee memory is shared across relevant chats by default. This scenario
  // explicitly restricts each source before sending, so independent transcripts
  // are tested without changing recall authority between native turns.
  for (const [index, name] of names.entries()) {
    await openBindingEmployee(runtime, name)
    const detail = page.locator('.employee-detail')
    await detail.getByRole('tab', { name: '记忆', exact: true }).click()
    const pane = detail.getByRole('tabpanel', { name: '记忆', exact: true })
    for (const chatId of index === 0 ? [chats[0], group.id] : [chats[1]]) {
      await pane.getByRole('combobox', { name: '来源聊天', exact: true }).click()
      await page.getByRole('option', { name: snapshot.conversations.find(chat => chat.id === chatId)!.title, exact: true }).click()
      await pane.getByRole('combobox', { name: '此来源聊天的新交流', exact: true }).click()
      await page.getByRole('option', { name: '仅在此聊天使用', exact: true }).click()
      await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(chat => chat.id === chatId)?.memoryScope).toBe('conversation')
    }
  }
  await runtime.reviewData('聊天隔离的明确记忆范围', { conversations: (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(chat => chats.includes(chat.id)) })
  const navigate = async (name: string) => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name, exact: true }).click()
  }
  const send = async (text: string) => { await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(text); await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click() }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const state = async () => ({ messages: await store.load<import('../../../packages/shared/src/domain').Message>('messages'), runs: await store.load<import('../../../packages/shared/src/domain').AgentRun>('runs'), turns: await store.load<import('../../../packages/shared/src/domain').DiscussionTurn>('turns'), sessions: await store.load<{ agentId: string; conversationId: string; threadId: string; state: string }>('codexSessions'), works: await store.load('workItems') })
  const idle = async (minimum: number) => {
    await expect.poll(async () => {
      const value = await state()
      return value.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || (value.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length >= minimum && value.runs.every(run => run.status === 'completed') && value.turns.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)))
    }, { timeout: codexEmployee.real ? 390000 : 60000 }).toBe(true)
    expect((await state()).runs.filter(run => run.status !== 'completed')).toEqual([])
  }
  try {
    const probe = await readingBrowserProbe(runtime)
    await navigate(names[0])
    const firstPrompt = `这是普通聊天，只在聊天内回答，不是工作任务，不使用任何工具。本会话临时暗号是 ${codes[0]}，不要把它记录为跨会话长期记忆。${codexEmployee.real ? '请先回复一句包含暗号的开场白，然后逐行给出01至100这100个编号，每行写一句不同的简短问候，最后再次写暗号。请完整写完这些聊天内容。' : 'NATIVE_STREAM_HOLD 请回答本会话暗号。'}`
    await send(firstPrompt)
    await expect.poll(async () => (await state()).messages.some(message => message.conversationId === chats[0] && message.senderType === 'agent' && message.status === 'streaming' && message.content.trim().length > 0), { timeout: 260000, intervals: [100, 200] }).toBe(true)
    const during = await state(), first = during.messages.find(message => message.conversationId === chats[0] && message.senderType === 'agent' && message.status === 'streaming')!
    await runtime.reviewCheckpoint('首名员工正在原聊天流式回复')
    await send('普通聊天补充：刚才本会话的暗号是什么？这一次只回复这个暗号。')
    expect((await state()).runs.find(run => run.id === first.runId)?.status).not.toBe('cancelled')
    await navigate(names[1]); await send(`这是普通聊天。本会话临时暗号是 ${codes[1]}，只回复暗号；不要写入跨会话长期记忆，不使用工具。`)
    await navigate(group.title); await send(`两位同事分别独立回答。这是普通群聊，不是任务。本群临时暗号是 ${codes[2]}，每人只回复本群暗号，不引用其他会话，不使用工具，不写入跨会话记忆。`)
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await expect(page.getByRole('complementary', { name: '通讯录列表', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeHidden()
    const hiddenAt = new Date().toISOString(), count = (await probe()).length
    if (!codexEmployee.real) {
      const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: codexEmployee.employeeId!, conversationId: chats[0] })
      await writeFile(join(home.sessionPath!, 'work', 'release-native-chat'), 'release fixture stream')
    }
    await idle(5)
    const hiddenRequests = (await probe()).slice(count).filter(request => ['getConversationView', 'listConversationMessages', 'observeConversationReading'].includes(request.method))
    expect(hiddenRequests).toEqual([])
    const completed = await state()
    expect(completed.messages.find(message => message.id === first.id)).toMatchObject({ status: 'completed', runId: first.runId })
    const firstRun = completed.runs.find(run => run.id === first.runId)!
    expect(firstRun).toMatchObject({ status: 'completed' })
    const secondSent = completed.messages.find(message => message.conversationId === chats[0] && message.content === '普通聊天补充：刚才本会话的暗号是什么？这一次只回复这个暗号。')!
    expect(Date.parse(secondSent.createdAt)).toBeLessThan(Date.parse(firstRun.finishedAt!))
    expect(completed.runs.some(run => run.finishedAt && run.finishedAt >= hiddenAt)).toBe(true)
    expect(completed.works).toEqual([])
    expect(completed.sessions).toHaveLength(4)
    expect(new Set(completed.sessions.map(session => session.threadId)).size).toBe(4)
    expect(completed.sessions.filter(session => session.agentId === codexEmployee.employeeId)).toHaveLength(2)
    expect(completed.sessions.filter(session => session.agentId === second.id)).toHaveLength(2)
    for (const [index, chatId] of chats.entries()) {
      const replies = completed.messages.filter(message => message.conversationId === chatId && message.senderType === 'agent')
      expect(replies).toHaveLength(index === 1 ? 1 : 2)
      for (const reply of replies) { expect(reply.content).toContain(codes[index]); for (const other of codes.filter(code => code !== codes[index])) expect(reply.content).not.toContain(other) }
    }
    await runtime.reviewData('隐藏页面期间完成与四个原生会话隔离', { ...completed, hiddenAt, hiddenRequests, codes })
    await runtime.reviewCheckpoint('隐藏聊天期间原生员工继续处理且不读取隐藏正文')
    await runtime.restart()
    expect((await state()).runs).toEqual(completed.runs)
    await navigate(names[1]); await send('刚才本会话的临时暗号是什么？只回复该暗号。')
    await navigate(group.title); await send('两位同事各自只回复本群刚才的临时暗号，不能引用其他聊天。')
    await idle(8)
    const final = await state()
    expect(final.works).toEqual([])
    expect(final.sessions.map(session => [session.agentId, session.conversationId, session.threadId]).sort()).toEqual(completed.sessions.map(session => [session.agentId, session.conversationId, session.threadId]).sort())
    for (const [index, chatId] of chats.entries()) {
      const replies = final.messages.filter(message => message.conversationId === chatId && message.senderType === 'agent')
      expect(replies).toHaveLength(index === 2 ? 4 : 2)
      for (const reply of replies) { expect(reply.status).toBe('completed'); expect(reply.content).toContain(codes[index]); for (const other of codes.filter(code => code !== codes[index])) expect(reply.content).not.toContain(other) }
    }
    for (const name of [names[0], names[1], group.title]) { await navigate(name); await runtime.reviewCheckpoint('各原聊天保持独立暗号-' + name) }
    const spans = await store.load<import('../../../packages/shared/src/domain/traces').StoredTraceSpan>('traceSpans')
    for (const run of final.runs.filter(run => run.backend?.externalInvocations)) {
      const trace = spans.filter(span => span.runId === run.id)
      expect(trace).toHaveLength(run.backend!.externalInvocations!)
      expect(trace.every(span => span.spanType === 'external_agent' && span.endedAt && !span.error)).toBe(true)
    }
    const reply = final.messages.filter(message => message.conversationId === group.id && message.senderType === 'agent').at(-1)!
    const row = runtime.page.locator(`#message-${reply.id}`)
    await row.hover()
    await row.getByRole('button', { name: `查看 ${reply.senderName} 的执行过程`, exact: true }).click()
    await expect(runtime.page.getByRole('region', { name: '调用树与时间线', exact: true })).toBeVisible()
    await runtime.page.getByRole('button', { name: '查看节点 Codex · chat', exact: true }).first().click()
    const details = runtime.page.getByRole('dialog', { name: '节点详情', exact: true })
    await expect(details).toContainText('turn_wait')
    await expect(details).toHaveCSS('opacity', '1')
    await expect.poll(() => details.evaluate(node => node.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true)
    await runtime.reviewData('节点浮层最终样式', await details.evaluate(node => ({ opacity: getComputedStyle(node).opacity, background: getComputedStyle(node).backgroundColor, animations: node.getAnimations().map(animation => animation.playState) })))
    await runtime.reviewCheckpoint('原消息执行过程显示真实Codex外部阶段')
    await runtime.reviewData('并发本机阶段诊断', spans)
    expect(runtime.errors).toEqual([])
  } finally { await runtime.reviewData('多员工多会话最终原始状态', { ...await state(), traces: await store.load('traceSpans') }); await store.close() }
})

Then('用户在建工作前明确回复Codex员工的原定时问题并完成首次文件交付', async ({ runtime, codexEmployee: state }) => {
  test.setTimeout(660000)
  await beforeWorkQuestion(runtime, { kind: 'Codex', real: !!state.real, employeeId: state.employeeId!, employeeName: '本机 Codex 同事', token: state.token! })
})
