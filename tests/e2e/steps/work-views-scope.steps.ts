/*
 * [OUTPUT]: 完成式目标原文与八状态分列核对，全局/会话只读不新增Work、运行、预算、调用或成果；原生整幅截图按状态留证。
 * [INPUT]: WV-T03/T07/T08中文场景、实际Electron UI和显式预置/真实执行支撑。
 * [OUTPUT]: 根子/依赖与AND、全部来源/无Work边界、五列75项连续分页/模式/筛选；全局可见main与实际日历浮层精确定位、关键帧及实际查询耗时内存记录。
 * [POS]: 工作视图范围业务步骤；不修改产品状态机、不宣称预置或离线协议为真实供应商成功。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { WorkViewQuery } from '../../../packages/shared/src/domain/work-views'
import { prepareScopeHistory, prepareActualWorkSources, createActualNoWorkSources, observeScopeQueries, scopeMemory, scopeRecords, seedUnknownWorkHistory } from '../support/work-views-scope'
import { openSchedule, selectScheduleOption } from '../support/schedule-controls'

interface State {
  history?: Awaited<ReturnType<typeof prepareScopeHistory>>
  actual?: Awaited<ReturnType<typeof prepareActualWorkSources>>
  noWork?: Awaited<ReturnType<typeof createActualNoWorkSources>>
  queries?: Awaited<ReturnType<typeof observeScopeQueries>>
  before?: Awaited<ReturnType<typeof scopeRecords>>
  calls?: number
  memories?: Awaited<ReturnType<typeof scopeMemory>>[]
  elapsedMs?: number
}
export const test = base.extend<{ workScope: State }>({ workScope: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const labels = ['待开始', '进行中', '等待或受阻', '已交付', '异常或结束']
const main = (page: Page) => page.getByRole('navigation', { name: '主导航', exact: true })
const globalMain = (page: Page) => page.getByRole('main', { name: '全局任务', exact: true })
const board = (page: Page) => globalMain(page).locator('[aria-label="任务看板"]')
const task = (page: Page, id: string) => page.locator(`[data-work-id="${id}"]:visible`)
const workView = (page: Page) => page.getByRole('region', { name: '任务工作视图', exact: true })
async function globalTasks(page: Page) { await main(page).getByRole('button', { name: '任务', exact: true }).click(); await expect(workView(page)).toBeVisible() }
async function option(page: Page, label: string, value: string) { await selectScheduleOption(page, label, value) }
const query = (page: Page, input: WorkViewQuery = {}) => page.evaluate(input => window.boai.request('queryWorkViews', input), input)
async function visibleIds(page: Page) { return workView(page).locator('[data-work-id]:visible').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.workId!)) }

Given('工作视图已有八种状态和完成式目标的明确预置历史', async ({ runtime, workScope }) => {
  workScope.history = await prepareScopeHistory(runtime, 'goals'); workScope.before = await scopeRecords(workScope.history.dataPath)
  expect(workScope.before.works).toHaveLength(8)
  for (const key of ['runs', 'occurrences', 'calls', 'profileCalls', 'budgets', 'artifacts'] as const) expect(workScope.before[key]).toEqual([])
})
When('用户在全局列表和原会话核对目标与状态', async ({ runtime, workScope }) => {
  await globalTasks(runtime.page); await runtime.page.getByRole('tab', { name: '列表', exact: true }).click()
  const expectedStates = { ready: '待开始', running: '进行中', waiting: '等待输入或依赖', blocked: '受阻', delivered: '已交付', failed: '失败', cancelled: '已停止', interrupted: '已中断' }
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(8)
  for (const work of workScope.history!.works) {
    const card = task(runtime.page, work.id), header = card.locator(':scope > [data-slot="card-header"]')
    await expect(header.locator('[data-slot="card-title"]')).toHaveText(`目标：${work.deliverable}`)
    await expect(header.locator(':scope > div > span')).toHaveText(expectedStates[work.status])
    await expect(card.getByRole('button', { name: /^(查看结果|交付文件)/ })).toHaveCount(0)
  }
  await option(runtime.page, '状态筛选', '已停止'); await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(1)
  await expect(runtime.page.getByRole('listbox')).toBeHidden()
  await runtime.reviewNativeCheckpoint('明确预置已停止：完成式文字标为目标，无结果文件入口')
  await workView(runtime.page).getByRole('button', { name: '清除筛选', exact: true }).click()
  await task(runtime.page, 'scope-goal-interrupted').getByRole('button', { name: '查看原聊天', exact: true }).click()
  await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(8)
  await expect(task(runtime.page, 'scope-goal-interrupted').locator('[data-slot="card-title"]')).toHaveText('目标：全部文件已写完并正式发布')
  await expect(task(runtime.page, 'scope-goal-interrupted')).toContainText('已中断')
  await option(runtime.page, '状态筛选', '已中断'); await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(1)
  await expect(runtime.page.getByRole('listbox')).toBeHidden()
  await runtime.reviewNativeCheckpoint('明确预置原会话已中断：目标原文与真实状态保持分离')
})
Then('目标原文和真实状态分别显示且没有新增调用成果或工作', async ({ runtime, workScope }) => {
  const after = await scopeRecords(workScope.history!.dataPath), projected = await query(runtime.page, { conversationId: workScope.history!.group.id })
  expect(after).toEqual(workScope.before)
  expect(new Map(projected.items.map(item => [item.work.id, item.work]))).toEqual(new Map(workScope.history!.works.map(work => [work.id, work])))
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('明确预置目标状态：七类原账本读取前后相同、模型与成果为空', { before: workScope.before, after, projected })
})

Given('工作视图已有明确预置的甲根乙子与独立依赖', async ({ runtime, workScope }) => {
  workScope.history = await prepareScopeHistory(runtime, 'relationships'); workScope.before = await scopeRecords(workScope.history.dataPath)
  await globalTasks(runtime.page)
  await expect(task(runtime.page, 'scope-root')).toBeVisible(); await expect(task(runtime.page, 'scope-independent')).toBeVisible(); await expect(task(runtime.page, 'scope-child')).toHaveCount(0)
  await runtime.reviewCheckpoint('明确预置：默认看板只计甲根和独立根，乙子另计')
})
When('用户筛选乙的进行中工作再筛乙的等待工作', async ({ runtime, workScope }) => {
  const writer = workScope.history!.agents.find(agent => agent.id === 'writer')!
  await option(runtime.page, '负责人筛选', writer.name); await option(runtime.page, '状态筛选', '进行中')
  await expect(task(runtime.page, 'scope-child')).toBeVisible(); await expect(task(runtime.page, 'scope-root')).toHaveCount(0)
  expect(await visibleIds(runtime.page)).toEqual(['scope-child'])
  const owned = await query(runtime.page, { ownerAgentId: 'writer', states: ['running'] })
  expect(owned).toMatchObject({ total: 1, rootTotal: 0, childTotal: 1, counts: { running: 1, waiting: 0 } })
  await runtime.reviewData('同Work AND：乙负责且进行中只命中实际子Work', owned)
  await runtime.reviewCheckpoint('乙的进行中工作：子Work是本人工作，甲根不冒充乙的工作')
  await option(runtime.page, '状态筛选', '等待输入或依赖')
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(0)
  expect((await query(runtime.page, { ownerAgentId: 'writer', states: ['waiting'] })).total).toBe(0)
  await runtime.reviewCheckpoint('乙加等待AND为空，不能借甲根的等待状态命中')
})
Then('乙只拥有实际子工作且取消筛选后真实子与独立依赖分开', async ({ runtime, workScope }) => {
  await workView(runtime.page).getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(task(runtime.page, 'scope-root')).toBeVisible()
  await task(runtime.page, 'scope-root').getByRole('button', { name: '展开子工作 · 1', exact: true }).click()
  await expect(task(runtime.page, 'scope-child')).toBeVisible()
  expect(await task(runtime.page, 'scope-root').locator('[data-work-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.workId))).toEqual(['scope-child'])
  await task(runtime.page, 'scope-root').locator(':scope > [data-slot="card-content"] > details > summary').click()
  await expect(task(runtime.page, 'scope-root').getByRole('button', { name: '查看依赖结果 · 第 1 版起', exact: true })).toBeVisible()
  const roots = await query(runtime.page), children = await query(runtime.page, { parentWorkId: 'scope-root' })
  expect(roots).toMatchObject({ total: 2, rootTotal: 2, childTotal: 1 }); expect(children.items.map(item => item.work.id)).toEqual(['scope-child'])
  await runtime.reviewData('真实父子与独立结果依赖分开', { roots, children })
  await runtime.reviewCheckpoint('甲根展开只有乙子，独立结果根仍在自己的交付列')
  expect(await scopeRecords(workScope.history!.dataPath)).toEqual(workScope.before); expect(runtime.errors).toEqual([])
})

Given('工作视图已实际执行私聊群核心及双员工定时文件任务', async ({ runtime, workScope }) => {
  workScope.actual = await prepareActualWorkSources(runtime)
  const actual = workScope.actual
  await expect.poll(async () => {
    const page = await query(runtime.page, { limit: 100 })
    return page.items.filter(item => ['delivered', 'failed', 'cancelled', 'interrupted'].includes(item.work.status)).length
  }, { timeout: 45_000 }).toBe(5)
  const execution = await runtime.page.evaluate(ids => Promise.all(ids.map(id => window.boai.request('getConversation', { id }))), [actual.fixture.other.id, actual.fixture.group.id, actual.core.id, actual.automated.id])
  await runtime.reviewData('全部来源实际终态：保留失败原Run错误工具及Turn原因', execution.map(detail => ({ conversationId: detail.conversation.id, works: detail.workItems, runs: detail.runs, turns: detail.turns })))
  await runtime.reviewData('全部来源离线请求阶段与真实工具往返摘要', actual.fixture.endpoint.requests.map((request, index) => {
    const messages = request.messages as { role: string; content: unknown; tool_calls?: { function: { name: string } }[] }[]
    const system = messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n')
    return { index, stage: system.includes('Private participation decision') ? 'decision' : system.includes('Private memory maintenance') ? 'memory' : system.includes('Read the actual new conversation facts. Publish a relevant, updated report') ? 'report' : 'execution', tools: messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name), toolReplies: messages.filter(message => message.role === 'tool').map(message => typeof message.content === 'string' ? message.content.slice(0, 2000) : JSON.stringify(message.content).slice(0, 2000)) }
  }))
  expect((await query(runtime.page, { limit: 100 })).counts.delivered).toBe(5)
  await expect.poll(async () => {
    const conversations = [actual.fixture.other.id, actual.fixture.group.id, actual.core.id, actual.automated.id]
    const details = await runtime.page.evaluate(ids => Promise.all(ids.map(id => window.boai.request('getConversation', { id }))), conversations)
    return details.every(detail => detail.runs.length > 0 && detail.runs.every(run => run.status === 'completed') && detail.turns?.every(turn => turn.status === 'completed'))
  }, { timeout: 30_000 }).toBe(true)
  const automation = await query(runtime.page, { conversationId: actual.automated.id, source: 'automation' })
  expect(automation.items).toHaveLength(2); expect(new Set(automation.items.map(item => item.work.ownerAgentId)).size).toBe(2)
  expect(automation.items.every(item => item.work.origin?.occurrenceId === actual.occurrence.id)).toBe(true)
  workScope.calls = actual.fixture.endpoint.requests.length
  await runtime.reviewData('离线协议真实工具：四类会话及同一触发的两个真实Work', { private: await query(runtime.page, { conversationId: actual.fixture.other.id }), group: await query(runtime.page, { conversationId: actual.fixture.group.id }), core: await query(runtime.page, { conversationId: actual.core.id }), automation })
})
When('用户核对全局任务全部来源与原触发历史', async ({ runtime, workScope }) => {
  const actual = workScope.actual!
  await globalTasks(runtime.page); await runtime.page.getByRole('tab', { name: '列表', exact: true }).click()
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(5)
  const all = await query(runtime.page)
  expect(new Set(all.items.map(item => item.work.conversationId))).toEqual(new Set([actual.fixture.other.id, actual.fixture.group.id, actual.core.id, actual.automated.id]))
  await runtime.reviewCheckpoint('实际私聊群核心和同触发两个工作共同出现在全局任务')
  await option(runtime.page, '任务来源筛选', '定时触发')
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(2)
  expect((await query(runtime.page, { source: 'automation' })).items.every(item => item.work.origin?.occurrenceId === actual.occurrence.id)).toBe(true)
  await runtime.reviewCheckpoint('定时来源筛选按真实Work origin保留同触发两位负责人')
  await main(runtime.page).getByRole('button', { name: '定时任务', exact: true }).click(); await openSchedule(runtime.page, actual.plan.name)
  await expect(runtime.page.locator(`[data-occurrence-id="${actual.occurrence.id}"]:visible`)).toBeVisible()
  await runtime.reviewCheckpoint('定时计划历史对照原触发，不把计划本身作为工作卡')
  expect(actual.fixture.endpoint.requests.length).toBe(workScope.calls)
})
Then('无工作失败触发与真实ACP过程保持原历史且不伪造工作卡', async ({ runtime, workScope }) => {
  const actual = workScope.actual!
  workScope.noWork = await createActualNoWorkSources(runtime)
  const { failed, external } = workScope.noWork
  await expect.poll(() => runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), failed.occurrence.id), { timeout: 30_000 }).toMatchObject({ status: 'failed' })
  await expect.poll(async () => {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), external.conversation.id)
    return detail.runs.some(run => run.backend?.kind === 'acp-local' && ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status))
  }).toBe(true)
  expect((await query(runtime.page, { conversationId: external.conversation.id })).total).toBe(0)
  const occurrence = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), failed.occurrence.id)
  expect(occurrence.workIds ?? []).toEqual([])
  await globalTasks(runtime.page); await workView(runtime.page).getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(5)
  await runtime.reviewData('真实失败触发/ACP过程均无Work：保持原记录不伪造', { occurrence, external: await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), external.conversation.id), global: await query(runtime.page) })
  await runtime.reviewCheckpoint('真实无Work失败触发和ACP过程不加入全局任务')
  await main(runtime.page).getByRole('button', { name: '定时任务', exact: true }).click(); await openSchedule(runtime.page, failed.plan.name)
  await expect(runtime.page.locator(`[data-occurrence-id="${occurrence.id}"]:visible`)).toBeVisible(); await runtime.reviewCheckpoint('没有Work的失败触发仍在原计划历史')
  const legacy = await seedUnknownWorkHistory(runtime, actual.fixture.dataPath, actual.fixture.group)
  await globalTasks(runtime.page); await option(runtime.page, '任务来源筛选', '来源未知')
  await expect(task(runtime.page, legacy.id)).toBeVisible(); await expect(task(runtime.page, legacy.id)).toContainText('来源未知')
  await expect(task(runtime.page, legacy.id).getByRole('button', { name: '查看原聊天', exact: true })).toBeDisabled()
  expect((await query(runtime.page, { source: 'unknown' })).items.map(item => item.work.id)).toEqual([legacy.id])
  await runtime.reviewCheckpoint('明确预置旧工作保持来源未知，不按邻近真实请求猜普通工作')
  expect(actual.fixture.errors).toEqual([]); expect(runtime.errors).toEqual([])
})

Given('工作视图已有五组各七十五项明确预置历史', async ({ runtime, workScope }) => {
  workScope.history = await prepareScopeHistory(runtime, 'scale'); workScope.before = await scopeRecords(workScope.history.dataPath)
  workScope.queries = await observeScopeQueries(runtime); workScope.memories = [await scopeMemory(runtime)]
  await globalTasks(runtime.page)
  for (const label of labels) {
    const column = board(runtime.page).getByRole('region', { name: label, exact: true })
    await expect(column.locator('[data-work-id]')).toHaveCount(30); await expect(column.getByRole('heading')).toContainText('75')
  }
  await runtime.reviewCheckpoint('明确预置五列各75项：首屏每列30，总数不是已加载数')
})
When('用户在五列逐页加载并切换列表和全部筛选条件', async ({ runtime, workScope }) => {
  const started = performance.now()
  for (const label of labels) {
    const column = board(runtime.page).getByRole('region', { name: label, exact: true })
    await column.getByRole('button', { name: '加载更多 · 已显示 30 / 75', exact: true }).click(); await expect(column.locator('[data-work-id]')).toHaveCount(60)
    await column.getByRole('button', { name: '加载更多 · 已显示 60 / 75', exact: true }).click(); await expect(column.locator('[data-work-id]')).toHaveCount(75)
    const ids = await column.locator('[data-work-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.workId!))
    expect(new Set(ids).size).toBe(75); expect(await column.getByRole('button', { name: /^加载更多/ }).count()).toBe(0)
    await runtime.reviewData(`75项完整连续分页 · ${label}`, { label, ids })
    await runtime.reviewCheckpoint(`五列连续三页 · ${label}完整75项且顺序稳定`)
  }
  expect(new Set(await visibleIds(runtime.page)).size).toBe(375)
  workScope.memories!.push(await scopeMemory(runtime))
  await runtime.page.getByRole('tab', { name: '列表', exact: true }).click(); await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(30)
  await expect(workView(runtime.page)).toContainText('已加载 30 / 375 项根工作')
  const history = workScope.history!, writer = history.agents.find(agent => agent.id === 'writer')!
  await option(runtime.page, '负责人筛选', writer.name); await option(runtime.page, '会话筛选', history.group.title)
  await option(runtime.page, '状态筛选', '进行中'); await option(runtime.page, '任务来源筛选', '普通工作')
  const expected = history.works.filter(work => work.ownerAgentId === 'writer' && work.conversationId === history.group.id && work.status === 'running')
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(expected.length)
  expect(new Set(await visibleIds(runtime.page))).toEqual(new Set(expected.map(work => work.id)))
  await workView(runtime.page).getByRole('textbox', { name: '任务目标关键词', exact: true }).fill('预置规模 1')
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(expected.length)
  await runtime.reviewCheckpoint('列表员工会话状态来源关键词AND同时命中同一Work')
  await option(runtime.page, '任务来源筛选', '定时触发'); await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(0)
  await runtime.reviewCheckpoint('改变来源AND后为空，不残留旧页或偷换条件')
  await option(runtime.page, '任务来源筛选', '普通工作'); await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(expected.length)
  await workView(runtime.page).getByRole('button', { name: '时间筛选', exact: true }).click()
  const days = await runtime.page.evaluate(() => { const today = new Date(); return [1, 2].map(day => new Date(today.getFullYear(), today.getMonth(), day).toLocaleDateString('zh-CN')) })
  const calendar = runtime.page.locator('[aria-label="工作时间范围"]:visible')
  await calendar.locator(`[data-day="${days[0]}"]`).first().click(); await calendar.locator(`[data-day="${days[1]}"]`).first().click(); await runtime.page.keyboard.press('Escape')
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(0)
  await runtime.reviewCheckpoint('时间范围与其余AND共同前置，固定10月5日数据不落入当月1至2日')
  await workView(runtime.page).getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(workView(runtime.page).locator('[data-work-id]:visible')).toHaveCount(30)
  workScope.elapsedMs = performance.now() - started; workScope.memories!.push(await scopeMemory(runtime))
})
Then('固定规模无重复遗漏每次有界并保留查询耗时与实际内存记录', async ({ runtime, workScope }) => {
  const observations = await workScope.queries!(), pages = observations.filter(value => value.query.group)
  for (const group of ['ready', 'running', 'waiting', 'delivered', 'ended']) {
    const chunks = pages.filter(value => value.query.group === group && !value.query.ownerAgentId)
    expect(chunks.map(chunk => chunk.ids.length)).toEqual([30, 30, 15])
    const ids = chunks.flatMap(chunk => chunk.ids); expect(ids).toHaveLength(75); expect(new Set(ids).size).toBe(75)
    expect(chunks.every(chunk => chunk.total === 75)).toBe(true)
  }
  expect(observations.every(value => value.ids.length <= (value.query.limit ?? 30))).toBe(true)
  expect(observations.some(value => value.query.ownerAgentId === 'writer' && value.query.conversationId === workScope.history!.group.id && value.query.states?.[0] === 'running' && value.query.source === 'ordinary' && value.query.search === '预置规模 1' && value.query.from && value.query.to && value.total === 0)).toBe(true)
  const first = await query(runtime.page, { limit: 30, group: 'running' })
  const stale = await runtime.page.evaluate(async cursor => { try { await window.boai.request('queryWorkViews', { limit: 30, group: 'running', ownerAgentId: 'writer', cursor }); return 'unexpected-success' } catch (error) { return String(error) } }, first.nextCursor!)
  expect(stale).toContain('STALE_CURSOR')
  expect(await scopeRecords(workScope.history!.dataPath)).toEqual(workScope.before)
  await runtime.reviewData('WV-T08固定375项：实际分页/AND查询、UI耗时及内存原始观测', { fixture: 'SQLite explicitly seeded after host startup; not executed Work', workCount: 375, eachGroup: 75, defaultPage: 30, maxPage: 100, uiElapsedMs: workScope.elapsedMs, observations, memory: workScope.memories, memoryPassThreshold: null, memoryConclusion: 'recorded actual values only; no unregistered memory limit or unlimited-history claim', independentModulePerformanceGate: '10000 Work / three bounded queries including counters <3000ms, kept unchanged' })
  await runtime.reviewCheckpoint('规模查询留证：固定总数、连续分页与清除筛选回到新首页')
  expect(runtime.errors).toEqual([])
})
