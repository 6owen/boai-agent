/*
 * [INPUT]: 中文更新场景、生产组件、受控传输的真实 AppService。
 * [OUTPUT]: 批量只读、文件差异/员工影响、明确替换与稳定资源/授权的 UI 断言。
 * [POS]: Skills 更新业务步骤；服务/网络 fixture 位于 support。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { startSkillUpdatesFixture } from '../support/skill-updates'

export const test = base.extend<{ updates: { fixture?: Awaited<ReturnType<typeof startSkillUpdatesFixture>> } }>({ updates: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('已绑定技能使用独立桌面与受控更新来源', async ({ runtime, updates }) => {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'The fixture connects production components to a controlled service; native IPC is covered separately.')
  updates.fixture = await startSkillUpdatesFixture(runtime)
  updates.fixture.changeUpstream('经过确认的新上游说明')
})
When('检查全部技能的上游更新', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '检查全部更新', exact: true }).click()
})
Then('检查结果显示新内容但没有替换本地文件', async ({ runtime, updates }) => {
  await expect(runtime.page.getByLabel('全部技能更新检查')).toContainText('update-helper · 有可用更新')
  expect((await updates.fixture!.api('getSkillDetail', { resourceId: updates.fixture!.resource.id })).content).toContain('原始上游说明')
})
When('查看差异并确认更新这个副本', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '查看 update-helper', exact: true }).click()
  const panel = runtime.page.getByLabel('技能更新详情')
  await expect(panel.getByLabel('更新文件变化')).toContainText('新增 1 · 修改 1 · 删除 0')
  await expect(panel.getByText(/受影响员工：/)).toContainText('研究员')
  await expect(panel.getByRole('heading', { name: '经过确认的新上游说明', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '更新此副本', exact: true }).click()
})
Then('新内容可读且原收藏和员工绑定保留', async ({ runtime, updates }) => {
  const fixture = updates.fixture!
  await expect.poll(async () => (await fixture.api('listSkillOperations', undefined)).find(value => value.kind === 'update')?.status).toBe('completed')
  expect((await fixture.api('listSkillOperations', undefined)).find(value => value.kind === 'update')?.items[0].status).toBe('updated')
  expect((await fixture.api('getSkillDetail', { resourceId: fixture.resource.id })).installation?.revision).toBe(2)
  await expect(runtime.page.getByLabel('技能更新详情').getByRole('heading', { name: '经过确认的新上游说明', exact: true })).toBeVisible()
  await expect(runtime.page.getByLabel('技能更新详情').getByRole('heading', { name: '原始上游说明', exact: true })).toHaveCount(0)
  const snapshot = await fixture.api('snapshot', undefined), agent = snapshot.agents.find(value => value.id === fixture.bound.id)!
  expect(snapshot.resources[0].id).toBe(fixture.resource.id)
  expect(agent.skillIds).toEqual([fixture.resource.id]); expect(agent.configVersion).toBe(fixture.bound.configVersion + 1); expect(agent.allowCommands).toBe(false)
  expect((await fixture.api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([fixture.resource.id])
  expect(runtime.errors).toEqual([])
})
When('已安装技能发生本地修改后检查更新', async ({ runtime, updates }) => {
  await updates.fixture!.editLocally('请保留我的本地修改')
  await runtime.page.getByRole('button', { name: /update-helper 可更新的离线技能/ }).click()
  await runtime.page.getByLabel('技能更新详情').getByRole('button', { name: '检查更新', exact: true }).click()
})
Then('未确认替换时更新按钮不可用且可以保留本地内容', async ({ runtime, updates }) => {
  const panel = runtime.page.getByLabel('技能更新详情')
  await expect(panel.getByRole('checkbox', { name: '我已保留需要的内容，确认替换本地修改', exact: true })).not.toBeChecked()
  await expect(panel.getByRole('button', { name: '更新此副本', exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: '保留当前内容', exact: true }).click()
  expect((await updates.fixture!.api('getSkillDetail', { resourceId: updates.fixture!.resource.id })).content).toContain('请保留我的本地修改')
  await expect(panel.getByRole('button', { name: '更新此副本', exact: true })).toHaveCount(0)
})
When('重新检查并明确确认替换本地修改', async ({ runtime }) => {
  const panel = runtime.page.getByLabel('技能更新详情')
  await panel.getByRole('button', { name: '检查更新', exact: true }).click()
  await panel.getByRole('checkbox', { name: '我已保留需要的内容，确认替换本地修改', exact: true }).check()
  await panel.getByRole('button', { name: '更新此副本', exact: true }).click()
})
