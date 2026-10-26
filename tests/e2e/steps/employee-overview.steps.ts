/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [INPUT]: 员工概览中文场景、生产Electron UI与原员工等待Work。
 * [OUTPUT]: 同一个Work的员工/全局/会话任务连续事实与原消息导航、能力状态、配置保存或失联只读核对；保留关键画面和明确来源数据。
 * [POS]: WV4员工资料业务步骤，真实协议/受管技能/传输故障归support/employee-overview。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { chmod, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import type { DigitalAgent, LaunchProfile, WorkItem } from '../../../packages/shared/src/domain'
import type { WorkViewQuery } from '../../../packages/shared/src/domain/work-views'
import { artifactDetail } from '../support/artifacts'
import { observeEmployeeOverview, prepareEmployeeAcpOverview, prepareEmployeeOverview } from '../support/employee-overview'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareEmployeeOverview>>
  observer?: Awaited<ReturnType<typeof observeEmployeeOverview>>
  work?: WorkItem
  questionMessageId?: string
  employee?: DigitalAgent
  calls?: number
  entrances?: { scope: 'employee' | 'global' | 'conversation'; work: WorkItem; ownerName?: string; conversationTitle: string }[]
  acp?: Awaited<ReturnType<typeof prepareEmployeeAcpOverview>>
  changedProfile?: LaunchProfile
}
export const test = base.extend<{ employeeOverview: State }>({ employeeOverview: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const detail = (runtime: { page: import('@playwright/test').Page }) => runtime.page.getByRole('region', { name: '通讯录详情', exact: true })
const currentWork = (region: Locator, id: string) => region.locator(`[data-work-id="${id}"]`)
async function recordEntrance(runtime: { page: import('@playwright/test').Page; reviewData(label: string, value: unknown): Promise<void> }, state: State, scope: 'employee' | 'global' | 'conversation', query: WorkViewQuery) {
  const result = await runtime.page.evaluate(input => window.boai.request('queryWorkViews', input), query)
  const item = result.items.find(item => item.work.id === state.work!.id)!
  expect(item.work).toEqual(state.work)
  expect(item.ownerName).toBe(state.employee!.name)
  expect(item.conversationTitle).toBe(state.fixture!.group.title)
  ;(state.entrances ??= []).push({ scope, work: item.work, ownerName: item.ownerName, conversationTitle: item.conversationTitle })
  await runtime.reviewData(`WV-T02同一工作 · ${scope}`, { query, total: result.total, ...state.entrances.at(-1) })
}

Given('员工概览具有真实等待工作和已绑定但未验证执行的技能', async ({ runtime, employeeOverview }) => {
  const fixture = employeeOverview.fixture = await prepareEmployeeOverview(runtime)
  employeeOverview.employee = fixture.employee
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请执行文件任务并交付报告；缺少交付对象先提问。', requestId: 'employee-overview-original', mentionIds: [] }), fixture.group.id)
  await expect.poll(async () => {
    const conversation = await artifactDetail(runtime, fixture.group.id)
    return conversation.workItems?.length === 1 && conversation.workItems[0].status === 'waiting' && conversation.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
  }, { timeout: 30_000 }).toBe(true)
  const conversation = await artifactDetail(runtime, fixture.group.id)
  employeeOverview.work = conversation.workItems![0]
  employeeOverview.questionMessageId = conversation.messages.find(message => message.senderType === 'agent' && message.content.includes('请明确报告交付给谁'))!.id
  expect(employeeOverview.work.ownerAgentId).toBe(fixture.employee.id)
  expect(conversation.artifacts).toEqual([])
  expect(conversation.runs.every(run => run.toolEvents.length === 0)).toBe(true)
  expect(fixture.errors).toEqual([])
  employeeOverview.calls = fixture.endpoint.requests.length
  employeeOverview.observer = await observeEmployeeOverview(runtime)
  await runtime.reviewData('WV4原员工问题与工作来源', { employee: { id: fixture.employee.id, name: fixture.employee.name, role: fixture.employee.role, configVersion: fixture.employee.configVersion }, work: employeeOverview.work, questionMessageId: employeeOverview.questionMessageId, modelProtocolCalls: employeeOverview.calls })
})
When('用户在通讯录查看成果作者的资料概览', async ({ runtime, employeeOverview }) => {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '成果作者', exact: true }).click()
  await expect(detail(runtime).getByRole('heading', { name: '成果作者', exact: true })).toBeVisible()
  await expect(currentWork(detail(runtime), employeeOverview.work!.id)).toBeVisible()
  await expect(detail(runtime).getByText('已绑定 · 说明可读', { exact: true })).toBeVisible()
})
Then('资料显示实际能力和本人当前工作而不运行验证', async ({ runtime, employeeOverview }) => {
  const profile = detail(runtime), capability = profile.getByRole('region', { name: '员工实际能力', exact: true })
  await expect(profile).toContainText('核对来源并整理报告')
  await expect(profile.getByRole('button', { name: '发消息', exact: true })).toBeVisible()
  await expect(profile.getByRole('button', { name: '编辑配置', exact: true })).toBeVisible()
  await expect(capability).toContainText('配置存在不代表连接或输出效果已验证')
  await expect(capability).toContainText('说明读取通过不表示执行依赖或交付效果已验证')
  await expect(capability.getByText('未启用', { exact: true })).toBeVisible()
  await expect(capability.getByRole('button', { name: '查看 overview-writing 的来源与说明', exact: true })).toBeVisible()
  const work = currentWork(profile, employeeOverview.work!.id)
  await expect(work).toContainText('成果作者')
  await expect(work).toContainText('等待输入或依赖')
  await expect(profile.getByRole('button', { name: '查看全部任务', exact: true })).toBeVisible()
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.externalVerifications).toEqual([])
  expect(observation.workQueries.some(query => query.ownerAgentId === 'researcher' && query.limit === 5 && query.states?.join(',') === 'ready,running,waiting,blocked')).toBe(true)
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  await recordEntrance(runtime, employeeOverview, 'employee', { ownerAgentId: employeeOverview.employee!.id, states: ['ready', 'running', 'waiting', 'blocked'], limit: 5 })
  await runtime.reviewCheckpoint('WV4员工独立身份、真实能力与当前负责工作')
})
When('用户从员工概览查看全部任务', async ({ runtime }) => {
  await detail(runtime).getByRole('button', { name: '查看全部任务', exact: true }).click()
})
Then('全局任务固定该员工并保留原工作的身份和状态', async ({ runtime, employeeOverview }) => {
  const tasks = runtime.page.getByRole('main', { name: '全局任务', exact: true })
  await expect(tasks).toBeVisible()
  await expect(tasks.getByRole('combobox', { name: '负责人筛选', exact: true })).toContainText('成果作者')
  const work = currentWork(tasks, employeeOverview.work!.id)
  await expect(work).toBeVisible(); await expect(work).toContainText('等待输入或依赖')
  const result = await runtime.page.evaluate(() => window.boai.request('queryWorkViews', { ownerAgentId: 'researcher' }))
  expect(result.items.map(item => item.work.id)).toEqual([employeeOverview.work!.id])
  expect(result.items[0].work).toEqual(employeeOverview.work)
  await recordEntrance(runtime, employeeOverview, 'global', { ownerAgentId: employeeOverview.employee!.id, states: ['waiting', 'blocked'], limit: 30 })
  await runtime.reviewCheckpoint('WV4从员工资料进入固定负责人的全局任务')
})
When('用户从任务卡返回原聊天并从资料返回原问题', async ({ runtime, employeeOverview }) => {
  await currentWork(runtime.page.getByRole('main', { name: '全局任务', exact: true }), employeeOverview.work!.id).getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect(runtime.page.locator(`#message-${employeeOverview.work!.sourceMessageId}`)).toBeVisible()
  await runtime.reviewCheckpoint('WV4任务精确返回原用户请求')
  await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', 'tasks')
  const conversationWork = currentWork(runtime.page.locator('.chat-panel').getByRole('region', { name: '任务工作视图', exact: true }), employeeOverview.work!.id)
  await expect(conversationWork).toBeVisible()
  await expect(conversationWork).toContainText(employeeOverview.employee!.name)
  await expect(conversationWork).toContainText('等待输入或依赖')
  await recordEntrance(runtime, employeeOverview, 'conversation', { conversationId: employeeOverview.fixture!.group.id, limit: 30 })
  await runtime.reviewCheckpoint('WV-T02同一个等待工作连续进入会话任务，身份与状态保持')
  await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '聊天', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(currentWork(detail(runtime), employeeOverview.work!.id)).toBeVisible()
  await currentWork(detail(runtime), employeeOverview.work!.id).getByRole('button', { name: '查看问题', exact: true }).click()
  await expect(runtime.page.locator(`#message-${employeeOverview.questionMessageId}`)).toBeVisible()
})
Then('两次导航定位原消息且没有新工作工具或模型调用', async ({ runtime, employeeOverview }) => {
  const question = runtime.page.locator(`#message-${employeeOverview.questionMessageId}`)
  await expect(question).toContainText('请明确报告交付给谁？')
  await expect(question.getByRole('button', { name: '回复此问题', exact: true })).toBeVisible()
  const conversation = await artifactDetail(runtime, employeeOverview.fixture!.group.id)
  expect(conversation.workItems).toEqual([employeeOverview.work])
  expect(conversation.artifacts).toEqual([])
  expect(conversation.runs.every(run => run.toolEvents.length === 0)).toBe(true)
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  await runtime.reviewCheckpoint('WV4概览精确返回原员工问题卡片')
  await runtime.reviewData('WV4只读导航核对', { work: conversation.workItems, modelProtocolCalls: employeeOverview.fixture!.endpoint.requests.length, observation: await employeeOverview.observer!.inspect() })
})
Then('同一个工作在员工全局和会话任务三个入口连续保持身份与状态', async ({ runtime, employeeOverview }) => {
  expect(employeeOverview.entrances?.map(entry => entry.scope)).toEqual(['employee', 'global', 'conversation'])
  for (const entry of employeeOverview.entrances!) expect(entry.work).toEqual(employeeOverview.work)
  const conversation = await artifactDetail(runtime, employeeOverview.fixture!.group.id)
  expect(conversation.workItems).toEqual([employeeOverview.work])
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  await runtime.reviewData('WV-T02同一运行三入口连续身份对照', { entrances: employeeOverview.entrances, finalWork: conversation.workItems, observation: await employeeOverview.observer!.inspect(), modelProtocolCalls: employeeOverview.fixture!.endpoint.requests.length })
})
When('用户从资料编辑并保存新的职责', async ({ runtime }) => {
  await detail(runtime).getByRole('button', { name: '编辑配置', exact: true }).click()
  await detail(runtime).getByRole('textbox', { name: '职责简介', exact: true }).fill('核验真实来源并给出清晰交付')
  await runtime.reviewCheckpoint('WV4在原员工配置中修改职责')
  await detail(runtime).getByRole('button', { name: '保存修改', exact: true }).click()
})
Then('返回资料显示真实新职责和原员工身份', async ({ runtime, employeeOverview }) => {
  await expect(detail(runtime).getByRole('heading', { name: '成果作者', exact: true })).toBeVisible()
  await expect(detail(runtime)).toContainText('核验真实来源并给出清晰交付')
  const current = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')!
  expect(current).toMatchObject({ id: employeeOverview.employee!.id, name: employeeOverview.employee!.name, role: '核验真实来源并给出清晰交付', configVersion: employeeOverview.employee!.configVersion + 1 })
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.saves).toHaveLength(1); expect(observation.saves[0].expectedConfigVersion).toBe(employeeOverview.employee!.configVersion)
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  await runtime.reviewCheckpoint('WV4保存后员工资料展示已提交职责')
  await runtime.reviewData('WV4已提交配置版本', { id: current.id, name: current.name, role: current.role, configVersion: current.configVersion, saves: observation.saved })
})
When('员工职责保存已提交但返回回复失联', async ({ runtime, employeeOverview }) => {
  await detail(runtime).getByRole('button', { name: '编辑配置', exact: true }).click()
  await detail(runtime).getByRole('textbox', { name: '职责简介', exact: true }).fill('保存回复失联仍保留的职责草稿')
  await employeeOverview.observer!.loseNextSaveReply()
  await runtime.reviewCheckpoint('WV4原版本职责保存前的草稿')
  await detail(runtime).getByRole('button', { name: '保存修改', exact: true }).click()
})
Then('编辑草稿保留并只读核对当前版本且不能再次保存', async ({ runtime, employeeOverview }) => {
  const editor = detail(runtime)
  await expect(editor.getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue('保存回复失联仍保留的职责草稿')
  await expect(editor).toContainText('员工配置已经提交，保存回复丢失')
  await expect(editor).toContainText(`已读取当前配置版本 ${employeeOverview.employee!.configVersion + 1}`)
  await expect(editor).toContainText(`本次编辑基于版本 ${employeeOverview.employee!.configVersion}`)
  await expect(editor).toContainText('当前草稿保留')
  await expect(editor.getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
  const before = await employeeOverview.observer!.inspect()
  expect(before.saves).toHaveLength(1); expect(before.lostReplies).toBe(1)
  expect(before.methods.slice(before.methods.indexOf('saveAgent') + 1)).toContain('snapshot')
  await editor.getByRole('button', { name: '重新核对配置', exact: true }).click()
  await expect(editor.getByRole('button', { name: '重新核对配置', exact: true })).toBeEnabled()
  const after = await employeeOverview.observer!.inspect()
  expect(after.saves).toHaveLength(1); expect(after.snapshotReads).toBeGreaterThan(before.snapshotReads)
  await expect(editor.getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue('保存回复失联仍保留的职责草稿')
  await runtime.reviewCheckpoint('WV4保存回复失联保留草稿，只读核对当前配置')
  await runtime.reviewData('WV4失联保存与只读核对', { originalVersion: employeeOverview.employee!.configVersion, saved: after.saved, lostReplies: after.lostReplies, snapshotReads: after.snapshotReads, saveRequests: after.saves.map(input => ({ id: input.id, role: input.role, expectedConfigVersion: input.expectedConfigVersion })) })
})
When('用户明确载入已提交配置后再次编辑', async ({ runtime }) => {
  await detail(runtime).getByRole('button', { name: '载入已提交配置', exact: true }).click()
  await runtime.page.getByRole('alertdialog').getByRole('button', { name: '退出', exact: true }).click()
  await expect(detail(runtime).getByRole('textbox', { name: '职责简介', exact: true })).toBeEnabled()
  await detail(runtime).getByRole('textbox', { name: '职责简介', exact: true }).fill('从核对后的版本明确重新编辑')
  await detail(runtime).getByRole('button', { name: '保存修改', exact: true }).click()
})
Then('新保存使用核对后的版本且没有重放失联保存', async ({ runtime, employeeOverview }) => {
  await expect(detail(runtime).getByRole('heading', { name: '成果作者', exact: true })).toBeVisible()
  await expect(detail(runtime)).toContainText('从核对后的版本明确重新编辑')
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.saves).toHaveLength(2)
  expect(observation.saves.map(input => input.expectedConfigVersion)).toEqual([employeeOverview.employee!.configVersion, employeeOverview.employee!.configVersion + 1])
  expect(observation.saves.map(input => input.role)).toEqual(['保存回复失联仍保留的职责草稿', '从核对后的版本明确重新编辑'])
  expect(observation.lostReplies).toBe(1)
  const current = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')!
  expect(current.configVersion).toBe(employeeOverview.employee!.configVersion + 2)
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  await runtime.reviewCheckpoint('WV4核对配置后用新版本保存，不重放失联请求')
  await runtime.reviewData('WV4新版本明确编辑', { current: { id: current.id, role: current.role, configVersion: current.configVersion }, saved: observation.saved, lostReplies: observation.lostReplies })
})

Given('员工概览具有真实已验证的隔离外部启动项', async ({ runtime, employeeOverview }) => {
  const fixture = employeeOverview.acp = await prepareEmployeeAcpOverview(runtime)
  employeeOverview.employee = fixture.employee
  expect(fixture.profile.verified?.name).toBe('boai-protocol-fixture')
  employeeOverview.observer = await observeEmployeeOverview(runtime)
  const page = await runtime.page.evaluate(() => window.boai.request('queryWorkViews', {}))
  expect(page.items).toEqual([])
  await runtime.reviewFile('WV-T11已明确测试的隔离ACP程序原件', fixture.executable)
  await runtime.reviewData('WV-T11原配置真实握手与员工身份', { profile: fixture.profile, employee: fixture.employee, explicitPreparationVerifications: 1, modelCalls: 0, workTotal: page.total })
})
When('用户在通讯录查看外部员工的资料概览', async ({ runtime }) => {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '外部资料员工', exact: true }).click()
  await expect(detail(runtime).getByRole('heading', { name: '外部资料员工', exact: true })).toBeVisible()
})
Then('资料展示原配置握手范围且没有自动外部验证', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('已记录连接验证', { exact: true })).toBeVisible()
  await expect(capability).toContainText(`配置版本 ${employeeOverview.acp!.profile.revision}`)
  await expect(capability).toContainText('仅覆盖当时的连接握手')
  await expect(capability).toContainText('BoAI 的技能、知识和记忆不会自动传给外部程序')
  await expect(detail(runtime).getByText('暂无当前负责的工作。', { exact: true })).toBeVisible()
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.methods).toContain('getLaunchProfileStatus')
  expect(observation.externalVerifications).toEqual([])
  expect(observation.methods).not.toContain('sendExternalTask')
  await runtime.reviewCheckpoint('WV-T11员工资料显示实际原握手范围，查看不重新验证')
})
When('原外部启动项配置实际修改但没有重新测试', async ({ runtime, employeeOverview }) => {
  employeeOverview.changedProfile = await runtime.page.evaluate(async profile => {
    const { revision, executableHash: _hash, verified: _verified, ...input } = profile
    return window.boai.request('saveLaunchProfile', { ...input, args: [...input.args, '--changed-overview-config'], expectedRevision: revision })
  }, employeeOverview.acp!.profile)
  expect(employeeOverview.changedProfile.id).toBe(employeeOverview.acp!.profile.id)
  expect(employeeOverview.changedProfile.revision).toBe(employeeOverview.acp!.profile.revision + 1)
  expect(employeeOverview.changedProfile.verified).toBeUndefined()
})
Then('员工资料展示当前配置未验证且不沿用原握手', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('当前配置未验证', { exact: true })).toBeVisible()
  await expect(capability).toContainText(`配置版本 ${employeeOverview.changedProfile!.revision}`)
  await expect(capability).toContainText('配置修改后不能继续使用旧验证')
  await expect(capability.getByText('已记录连接验证', { exact: true })).toHaveCount(0)
  const status = await runtime.page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), employeeOverview.acp!.profile.id)
  expect(status.profile).toEqual(employeeOverview.changedProfile)
  expect(status.status).toBe('available')
  expect((await employeeOverview.observer!.inspect()).externalVerifications).toEqual([])
  const current = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === employeeOverview.employee!.id)!
  expect(current).toEqual(employeeOverview.employee)
  await runtime.reviewCheckpoint('WV-T11原配置更新使旧握手失效，员工身份保持')
  await runtime.reviewData('WV-T11配置变更前后验证资格', { prior: employeeOverview.acp!.profile, current: status, observation: await employeeOverview.observer!.inspect() })
})
When('员工已绑定的受管技能说明真实失效后刷新能力状态', async ({ runtime, employeeOverview }) => {
  const path = join(employeeOverview.fixture!.skill.path, 'SKILL.md')
  await runtime.reviewFile('WV-T11原已绑定技能说明', path)
  await writeFile(path, '---\nname: changed-invalid-skill\ndescription: 真实外改导致与原绑定名称不一致\n---\n# 不可沿用的说明\n')
  await runtime.reviewFile('WV-T11真实失效的受管技能说明', path)
  await detail(runtime).getByRole('button', { name: '刷新能力状态', exact: true }).click()
})
Then('资料保留实际绑定并显示说明不可读而不执行技能', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('已绑定 · 说明不可读', { exact: true })).toBeVisible()
  await expect(capability).toContainText('SKILL.md 元数据无效或名称与目录不一致')
  await expect(capability.getByText('已绑定 · 说明可读', { exact: true })).toHaveCount(0)
  await expect(currentWork(detail(runtime), employeeOverview.work!.id)).toBeVisible()
  const home = await runtime.page.evaluate(id => window.boai.request('getAgentHome', { agentId: id }), employeeOverview.employee!.id)
  expect(home.environment!.skills.find(skill => skill.resourceId === employeeOverview.fixture!.skill.id)?.instructions).toBe('invalid')
  const current = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === employeeOverview.employee!.id)!
  expect(current.skillIds).toEqual([employeeOverview.fixture!.skill.id])
  expect(current.configVersion).toBe(employeeOverview.employee!.configVersion)
  expect((await artifactDetail(runtime, employeeOverview.fixture!.group.id)).workItems).toEqual([employeeOverview.work])
  expect(employeeOverview.fixture!.endpoint.requests).toHaveLength(employeeOverview.calls!)
  expect((await employeeOverview.observer!.inspect()).externalVerifications).toEqual([])
  await runtime.reviewCheckpoint('WV-T11真实技能说明失效，绑定与原工作保留、不可读显性呈现')
  await runtime.reviewData('WV-T11技能说明真实失效的只读核对', { home, boundSkillIds: current.skillIds, originalWork: employeeOverview.work, observation: await employeeOverview.observer!.inspect(), modelProtocolCalls: employeeOverview.fixture!.endpoint.requests.length })
})
When('原程序真实外改后用户刷新能力状态', async ({ runtime, employeeOverview }) => {
  await writeFile(employeeOverview.acp!.executable, `${employeeOverview.acp!.bytes}\n// 原程序字节已由验收外部修改\n`)
  await detail(runtime).getByRole('button', { name: '刷新能力状态', exact: true }).click()
})
Then('资料显示连接验证失效并保留原验证记录', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('连接验证已失效', { exact: true })).toBeVisible()
  await expect(capability).toContainText('程序文件已变化')
  await expect(capability.getByText('已记录连接验证', { exact: true })).toHaveCount(0)
  const status = await runtime.page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), employeeOverview.acp!.profile.id)
  expect(status.status).toBe('changed'); expect(status.profile).toEqual(employeeOverview.acp!.profile)
  expect((await employeeOverview.observer!.inspect()).externalVerifications).toEqual([])
  await runtime.reviewFile('WV-T11外改后的程序原件', employeeOverview.acp!.executable)
  await runtime.reviewCheckpoint('WV-T11真实程序外改后旧握手不能冒充当前验证')
  await runtime.reviewData('WV-T11外改程序只读核对', status)
})
When('原程序真实删除后用户刷新能力状态', async ({ runtime, employeeOverview }) => {
  await rm(employeeOverview.acp!.executable)
  await detail(runtime).getByRole('button', { name: '刷新能力状态', exact: true }).click()
})
Then('资料显示执行依赖不可用而没有新工作或验证', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('执行依赖不可用', { exact: true })).toBeVisible()
  await expect(capability).toContainText('程序或指定登录目录当前不可读取')
  await expect(capability.getByText('已记录连接验证', { exact: true })).toHaveCount(0)
  const status = await runtime.page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), employeeOverview.acp!.profile.id)
  expect(status.status).toBe('unavailable'); expect(status.profile).toEqual(employeeOverview.acp!.profile)
  const work = await runtime.page.evaluate(() => window.boai.request('queryWorkViews', {}))
  expect(work.items).toEqual([])
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.externalVerifications).toEqual([]); expect(observation.methods).not.toContain('sendExternalTask')
  await runtime.reviewCheckpoint('WV-T11真实程序删除后明确执行依赖不可用')
  await runtime.reviewData('WV-T11删除程序的只读事实', { status, workTotal: work.total, observation })
})
When('原程序恢复但指定登录目录真实删除后刷新能力状态', async ({ runtime, employeeOverview }) => {
  await writeFile(employeeOverview.acp!.executable, employeeOverview.acp!.bytes); await chmod(employeeOverview.acp!.executable, 0o755)
  await rm(employeeOverview.acp!.loginPath, { recursive: true })
  await detail(runtime).getByRole('button', { name: '刷新能力状态', exact: true }).click()
})
Then('资料显示登录依赖不可用且没有启动外部程序', async ({ runtime, employeeOverview }) => {
  const capability = detail(runtime).getByRole('region', { name: '员工实际能力', exact: true })
  await expect(capability.getByText('执行依赖不可用', { exact: true })).toBeVisible()
  await expect(capability).toContainText('程序或指定登录目录当前不可读取')
  const status = await runtime.page.evaluate(id => window.boai.request('getLaunchProfileStatus', { id }), employeeOverview.acp!.profile.id)
  expect(status.status).toBe('unavailable'); expect(status.profile).toEqual(employeeOverview.acp!.profile)
  expect((await employeeOverview.observer!.inspect()).externalVerifications).toEqual([])
  const observation = await employeeOverview.observer!.inspect()
  expect(observation.methods).not.toContain('sendExternalTask')
  await runtime.reviewCheckpoint('WV-T11程序已恢复但指定登录目录失效仍不能沿用握手')
  await runtime.reviewData('WV-T11登录目录失效只读核对', { status, observation })
})
