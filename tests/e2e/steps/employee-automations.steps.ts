/*
 * [INPUT]: 生产Electron、实际IPC与员工/群配置UI、固定资源采样。
 * [OUTPUT]: 群计划真实保存/编辑/暂停、总览同ID与员工隔离及零运行阅读证据。
 * [POS]: EA1桌面BDD；只预置连接/员工/群，计划通过UI保存。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { resourceSample, verifyResources, type ResourceSample } from '../support/background-resources'
import { selectScheduleOption } from '../support/schedule-controls'
import type { AutomationDefinition } from '../../../packages/shared/src/domain'

export const test = base.extend<{ employeeAutomation: { groupId?: string; planId?: string } }>({ employeeAutomation: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('员工自动化场景具备三名员工和经营群', async ({ runtime, employeeAutomation }) => {
  await runtime.start()
  employeeAutomation.groupId = await runtime.page.evaluate(async () => {
    const connection = await window.boai.request('saveConnection', { name: '配置验收', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' })
    for (const id of ['researcher', 'writer', 'reviewer']) {
      const agent = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === id)!
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, connectionId: connection.id, allowCommands: false })
    }
    return (await window.boai.request('createConversation', { kind: 'group', title: '经营自动化组', agentIds: ['researcher', 'reviewer', 'writer'] })).id
  })
  await runtime.page.getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.locator('.contacts-list').getByRole('button', { name: '经营自动化组', exact: true }).click()
  await runtime.page.locator('.contacts-detail').getByRole('button', { name: '编辑配置', exact: true }).click()
  await runtime.page.getByRole('tab', { name: '自动化', exact: true }).click()
})
When('我在群详情创建双采集后汇总的自动化', async ({ runtime, employeeAutomation }) => {
  const page = runtime.page, detail = page.locator('.contacts-detail')
  await detail.getByRole('button', { name: '新建自动化', exact: true }).click()
  await detail.getByLabel('标题', { exact: true }).fill('每日经营报告')
  await detail.getByLabel('任务描述', { exact: true }).fill('分别获取销售和成本，使用本次两份结果汇总利润。')
  const participants = detail.getByRole('group', { name: '参与员工（至少两名）', exact: true })
  for (const name of ['研究员', '审核员', '写手']) await participants.getByRole('checkbox', { name, exact: true }).check()
  await selectScheduleOption(page, '汇总负责人', '写手')
  for (const [name, instruction, deliverable] of [['研究员', '读取本次销售数据', '本次销售数据'], ['审核员', '读取本次成本数据', '本次成本数据'], ['写手', '等待两份本次数据，汇总利润', '本次经营报告']]) {
    const assignment = detail.getByRole('group', { name, exact: true })
    await assignment.getByLabel('工作内容', { exact: true }).fill(instruction)
    await assignment.getByLabel('交付要求', { exact: true }).fill(deliverable)
  }
  await runtime.reviewNativeCheckpoint('群自动化固定分工配置')
  await detail.getByRole('button', { name: '创建', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '每日经营报告', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '暂停计划', exact: true }).click()
  await expect(detail.getByRole('button', { name: '恢复计划', exact: true })).toBeVisible()
  const plan = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).definitions.find(d => d.name === '每日经营报告')!)
  employeeAutomation.planId = plan.id
  expect(plan).toMatchObject({ owner: { kind: 'group', conversationId: employeeAutomation.groupId }, enabled: false, conversationPolicy: 'new-conversation', collaboration: { coordinatorId: 'writer' } })
  expect(plan.collaboration!.assignments.filter(a => a.employeeId !== 'writer').map(a => a.dependsOn)).toEqual([[], []])
  expect(plan.collaboration!.assignments.find(a => a.employeeId === 'writer')!.dependsOn.sort()).toEqual(['researcher', 'reviewer'])
  await runtime.reviewData('群计划创建回执', plan)
})
Then('群计划分工可编辑且总览与员工页保持归属隔离', async ({ runtime, employeeAutomation }) => {
  const page = runtime.page, detail = page.locator('.contacts-detail')
  await detail.getByRole('button', { name: '编辑配置', exact: true }).click()
  const writer = detail.getByRole('group', { name: '写手', exact: true })
  await expect(writer.getByLabel('工作内容', { exact: true })).toHaveValue('等待两份本次数据，汇总利润')
  await writer.getByLabel('交付要求', { exact: true }).fill('本次经营报告与来源')
  await detail.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(detail.getByText('本次经营报告与来源', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click()
  await selectScheduleOption(page, '按归属筛选', '经营自动化组')
  await expect(page.locator('.schedule-overview-plan:visible')).toHaveCount(1)
  await expect(page.locator('.schedule-overview-plan:visible')).toContainText('每日经营报告')
  await runtime.reviewNativeCheckpoint('同一群计划全局总览')
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await page.locator('.conversation-item').filter({ hasText: '经营自动化组' }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const right = page.locator('.detail-panel:visible')
  await right.getByRole('tab', { name: '自动化', exact: true }).click()
  await right.getByRole('button').filter({ hasText: '每日经营报告' }).click()
  await expect(right.getByRole('heading', { name: '每日经营报告', exact: true })).toBeVisible()
  await expect(right.getByText('本次经营报告与来源', { exact: false })).toBeVisible()
  await runtime.reviewNativeCheckpoint('原群右侧自动化计划与执行历史')

  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.locator('.contacts-list').getByRole('button', { name: '研究员', exact: true }).click()
  await detail.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '自动化', exact: true }).click()
  await expect(detail.getByText('暂无自动化计划', { exact: true })).toBeVisible()
  const plan = await page.evaluate(id => window.boai.request('getAutomation', { id }), employeeAutomation.planId!) as AutomationDefinition
  expect(plan).toMatchObject({ id: employeeAutomation.planId, enabled: false, revision: 3 })
  expect(plan.collaboration!.assignments.find(a => a.employeeId === 'writer')!.deliverable).toBe('本次经营报告与来源')
})
Then('反复查看自动化不创建任务且短期资源有界', async ({ runtime, employeeAutomation }) => {
  const page = runtime.page, cdp = await runtime.app.context().newCDPSession(page), samples: ResourceSample[] = []
  try {
    samples.push(await resourceSample(runtime, cdp))
    for (let i = 0; i < 20; i++) {
      const started = Date.now()
      await page.getByRole('tab', { name: '配置', exact: true }).click()
      await page.getByRole('tab', { name: '自动化', exact: true }).click()
      await expect(page.locator('.contacts-detail').getByText('暂无自动化计划', { exact: true })).toBeVisible()
      expect(Date.now() - started).toBeLessThan(3000)
      if (i % 5 === 4) samples.push(await resourceSample(runtime, cdp))
    }
    for (let i = 0; i < 5; i++) { await new Promise(resolve => setTimeout(resolve, 2000)); samples.push(await resourceSample(runtime, cdp)) }
    await runtime.reviewData('自动化页签短期资源采样', samples)
    verifyResources(samples)
    const state = await page.evaluate(() => window.boai.request('listAutomations', undefined))
    expect(state.definitions.map(d => d.id)).toEqual([employeeAutomation.planId]); expect(state.occurrences).toHaveLength(0)
    expect(runtime.errors).toEqual([])
    await runtime.reviewNativeCheckpoint('员工归属隔离与空列表')
  } finally { await cdp.detach() }
})
