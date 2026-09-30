/*
 * [INPUT]: 中文商店业务场景、生产组件与受控商店服务。
 * [OUTPUT]: 当前排序 Tabs 的能力与禁用断言；搜索/跨提供方迟到响应、分页/详情/来源切换以及本地资料隔离的可访问交互断言。
 * [POS]: Skills 商店 Electron 步骤；不联网、不安装真实技能。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { startMarketplaceFixture } from '../support/skill-marketplace'

export const test = base.extend<{ marketplace: { fixture?: Awaited<ReturnType<typeof startMarketplaceFixture>> } }>({ marketplace: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('商店使用隔离桌面与受控提供方', async ({ runtime, marketplace }) => {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'Component fixture uses a local test server; installed app behavior has separate coverage.')
  marketplace.fixture = await startMarketplaceFixture(runtime)
  await runtime.page.getByRole('tab', { name: '技能商店', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toBeVisible()
})
When('下一页暂时失败后重试', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '加载更多', exact: true }).click()
  await expect(runtime.page.getByRole('alert')).toContainText('503')
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toBeVisible()
  await runtime.page.getByRole('button', { name: '重试加载更多' }).click()
})
Then('已有商店条目保留且重试后没有重复项', async ({ runtime }) => {
  await expect(runtime.page.getByRole('button', { name: /beta owner/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toHaveCount(1)
})
When('快速切换技能搜索并让旧结果最后返回', async ({ runtime, marketplace }) => {
  await runtime.page.getByRole('textbox', { name: '搜索 skills.sh' }).fill('slow')
  await expect.poll(() => marketplace.fixture!.requests.some(url => url.includes('q=slow'))).toBe(true)
  await runtime.page.getByRole('textbox', { name: '搜索 skills.sh' }).fill('fast')
  await expect(runtime.page.getByRole('button', { name: /fast owner/ })).toBeVisible()
  marketplace.fixture!.releaseSlow()
})
Then('商店只展示最新搜索结果', async ({ runtime }) => {
  await expect(runtime.page.getByRole('button', { name: /fast owner/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /slow owner/ })).toHaveCount(0)
})
When('切换提供方再返回原商店', async ({ runtime }) => {
  await runtime.page.getByRole('tab', { name: 'ClawHub', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: /Claw alpha alice/ })).toBeVisible()
  await runtime.page.getByRole('textbox', { name: '搜索 ClawHub' }).fill('different')
  await runtime.page.getByRole('tab', { name: 'SkillHub', exact: true }).click()
  await expect(runtime.page.getByRole('tablist', { name: '商店排序' }).getByRole('tab', { name: '本页下载量' })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /Hub result/ })).toBeVisible()
  await runtime.page.getByRole('tab', { name: 'skills.sh', exact: true }).click()
})
Then('各商店保留搜索条件并显示各自的能力', async ({ runtime }) => {
  await expect(runtime.page.getByRole('textbox', { name: '搜索 skills.sh' })).toHaveValue('fast')
  for (const name of ['累计安装', '趋势', '热门']) await expect(runtime.page.getByRole('tablist', { name: '商店排序' }).getByRole('tab', { name, exact: true })).toBeDisabled()
  await expect(runtime.page.getByRole('button', { name: /fast owner/ })).toBeVisible()
})
Then('商店详情如实显示缺失正文和未知统计', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: /fast owner/ }).click()
  const detail = runtime.page.getByRole('complementary', { name: '商店详情' })
  await expect(detail.getByRole('heading', { name: 'fast', exact: true })).toBeVisible()
  await expect(detail.getByText('提供方未提供正文，安装前需要检查实际技能包。')).toBeVisible()
  await expect(detail.getByText('下载：未知 · 安装：未知 · 星标：未知')).toBeVisible()
})
Then('本地资料库仍能独立使用', async ({ runtime }) => {
  await runtime.page.getByRole('tab', { name: '本地技能', exact: true }).click()
  await expect(runtime.page.getByRole('heading', { name: '暂无匹配资源' })).toBeVisible()
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect(runtime.errors).toEqual([])
})
When('上一个商店尚未返回时切换到另一家', async ({ runtime, marketplace }) => {
  await runtime.page.getByRole('textbox', { name: '搜索 skills.sh' }).fill('provider-slow')
  await expect.poll(() => marketplace.fixture!.requests.some(url => url.includes('q=provider-slow'))).toBe(true)
  await runtime.page.getByRole('tab', { name: 'ClawHub', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: /Claw alpha alice/ })).toBeVisible()
})
When('上一个商店随后才返回结果', async ({ runtime, marketplace }) => {
  const response = runtime.page.waitForResponse(value => value.url().includes('/fixture-marketplace') && value.request().postDataJSON()?.input?.query === 'provider-slow')
  marketplace.fixture!.releaseSlow()
  await (await response).finished()
  await runtime.page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
})
Then('当前商店的来源与条目保持一致', async ({ runtime }) => {
  await expect(runtime.page.getByRole('tab', { name: 'ClawHub', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(runtime.page.getByRole('textbox', { name: '搜索 ClawHub' })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /Claw alpha alice/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /provider-slow owner/ })).toHaveCount(0)
  expect(runtime.errors).toEqual([])
})
