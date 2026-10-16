/*
 * [OUTPUT]: 真实帧核对主内容/提供方/排序/检索结果淡入、32→240检索宽度、系统方圆角和最右安装/检索。
 * [INPUT]: 中文商店业务场景、生产组件与受控商店服务。
 * [OUTPUT]: 常驻Tabs实际帧过渡/窄窗完整与商城筛选对齐、共享详情组件；实际 SkillsWorkspace 的商城/本地 Tabs、详情区域与隔离目录空态；当前排序 Tabs 的能力与禁用断言；搜索/跨提供方迟到响应、分页/详情/来源切换以及本地资料隔离的可访问交互断言。
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
  await runtime.page.getByRole('tab', { name: '商城', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toBeVisible()
})
When('下一页暂时失败后重试', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '加载更多', exact: true }).click()
  await expect(runtime.page.locator('[data-sonner-toast]')).toContainText('503')
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toBeVisible()
  await runtime.page.getByRole('button', { name: '重试加载更多' }).click()
})
Then('已有商店条目保留且重试后没有重复项', async ({ runtime }) => {
  await expect(runtime.page.getByRole('button', { name: /beta owner/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /alpha owner/ })).toHaveCount(1)
})
When('快速切换技能搜索并让旧结果最后返回', async ({ runtime, marketplace }) => {
  await runtime.page.getByRole('button', { name: '搜索 skills.sh', exact: true }).click()
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
  const detail = runtime.page.locator('.marketplace-skill-panel')
  await expect(detail.locator('.chat-title')).toBeVisible()
  await expect(detail.getByText('提供方未提供正文，安装前需要检查实际技能包。')).toBeVisible()
  await expect(detail.getByText('下载：未知 · 安装：未知 · 星标：未知')).toBeVisible()
})
Then('本地技能仍能独立使用', async ({ runtime }) => {
  await runtime.page.getByRole('tab', { name: '本地', exact: true }).click()
  await expect(runtime.page.locator('.skills-list-panel .illustrated-empty img')).toBeVisible()
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect(runtime.errors).toEqual([])
})
When('上一个商店尚未返回时切换到另一家', async ({ runtime, marketplace }) => {
  await runtime.page.getByRole('button', { name: '搜索 skills.sh', exact: true }).click()
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
  await expect(runtime.page.getByRole('button', { name: '搜索 ClawHub', exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /Claw alpha alice/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /provider-slow owner/ })).toHaveCount(0)
  expect(runtime.errors).toEqual([])
})

Then('技能目录标签保留滑动动画且商城筛选对齐', async ({ runtime }) => {
  const page = runtime.page
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const tabs = page.getByRole('tablist', { name: '技能分类' })
  for (const name of ['本地', '收藏', '商城']) {
    const movement = await tabs.evaluate(async (bar, label) => {
      const pill = bar.querySelector<HTMLElement>('[data-slot=tabs-indicator]')!
      const from = pill.getBoundingClientRect().x
      const tab = Array.from(bar.querySelectorAll<HTMLElement>('[role=tab]')).find(el => el.textContent === label)!
      const to = tab.getBoundingClientRect().x
      tab.click()
      const samples: number[] = [], opacity: number[] = [], start = performance.now()
      await new Promise<void>(resolve => { const frame = () => { samples.push(pill.getBoundingClientRect().x); const panel = document.querySelector('.catalog-transition'); if (panel) opacity.push(Number(getComputedStyle(panel).opacity)); if (performance.now() - start < 350) requestAnimationFrame(frame); else resolve() }; requestAnimationFrame(frame) })
      return { same: pill.isConnected && bar.querySelector('[data-slot=tabs-indicator]') === pill, moving: samples.some(x => x > Math.min(from, to) + 1 && x < Math.max(from, to) - 1), end: samples.at(-1)!, to, fading: opacity.some(value => value > 0 && value < 0.99) }
    }, name)
    expect(movement.same).toBe(true)
    expect(movement.moving).toBe(true)
    expect(movement.fading).toBe(true)
    expect(Math.abs(movement.end - movement.to)).toBeLessThan(1)
  }
  const search = page.locator('.catalog-search')
  expect((await search.boundingBox())!.width).toBe(32)
  const widths = await search.evaluate(async el => {
    const values: number[] = [], start = performance.now()
    el.querySelector<HTMLButtonElement>('button')!.click()
    await new Promise<void>(resolve => { const frame = () => { values.push(el.getBoundingClientRect().width); if (performance.now() - start < 400) requestAnimationFrame(frame); else resolve() }; requestAnimationFrame(frame) })
    return values
  })
  expect(widths.some(width => width > 33 && width < 239)).toBe(true)
  expect(widths.at(-1)).toBe(240)
  await expect(page.getByRole('textbox', { name: '搜索 skills.sh' })).toBeFocused()
  const refresh = await page.getByRole('button', { name: '刷新商店', exact: true }).boundingBox()
  expect((await search.boundingBox())!.x).toBeGreaterThan(refresh!.x + refresh!.width)
  await expect(search).toHaveCSS('border-radius', '0px')
  await expect(search.locator('[data-slot=input-group]')).toHaveCSS('corner-shape', 'squircle')
  await runtime.reviewNativeCheckpoint('最右侧展开搜索与系统输入样式')
  await page.getByRole('textbox', { name: '搜索 skills.sh' }).press('Escape')
  await expect.poll(async () => (await search.boundingBox())!.width).toBe(32)
  const providers = page.getByRole('tablist', { name: '技能商店来源' }), sort = page.getByRole('tablist', { name: '商店排序' })
  const [a, b, c, bar] = await Promise.all([tabs.boundingBox(), providers.boundingBox(), sort.boundingBox(), page.locator('.skill-marketplace-filters').boundingBox()])
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(1)
  expect(c!.x).toBeGreaterThan(b!.x + b!.width)
  expect(Math.abs(c!.y - b!.y)).toBeLessThan(1)
  expect(Math.abs(c!.x + c!.width - bar!.x - bar!.width + 8)).toBeLessThan(1)
  await expect(page.getByRole('button', { name: /商店说明/ })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('商城来源与右侧排序对齐')
  for (const label of ['ClawHub', 'skills.sh', '趋势']) {
    const fading = await page.locator('.skill-marketplace').evaluate(async (root, label) => {
      Array.from(root.querySelectorAll<HTMLElement>('[role=tab]')).find(tab => tab.textContent === label)!.click()
      const opacity: number[] = [], start = performance.now()
      await new Promise<void>(resolve => { const frame = () => { const panel = root.querySelector('.catalog-transition'); if (panel) opacity.push(Number(getComputedStyle(panel).opacity)); if (performance.now() - start < 650) requestAnimationFrame(frame); else resolve() }; requestAnimationFrame(frame) })
      return opacity.some(value => value > 0 && value < .99)
    }, label)
    expect(fading).toBe(true)
  }
  await page.getByRole('button', { name: '搜索 skills.sh', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索 skills.sh' }).fill('transition')
  const searchFading = await page.locator('.skill-marketplace').evaluate(async root => {
    const opacity: number[] = [], start = performance.now()
    await new Promise<void>(resolve => { const frame = () => { const panel = root.querySelector('.catalog-transition'); if (panel) opacity.push(Number(getComputedStyle(panel).opacity)); if (performance.now() - start < 900) requestAnimationFrame(frame); else resolve() }; requestAnimationFrame(frame) })
    return opacity.some(value => value > 0 && value < .99)
  })
  expect(searchFading).toBe(true)
  await expect(page.getByRole('button', { name: /transition owner/ })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索 skills.sh' }).fill('')
  await expect(page.getByRole('button', { name: /alpha owner/ })).toBeVisible()
})
Then('商城详情复用本地详情结构且窄窗标签完整', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: /alpha owner/ }).click()
  const panel = page.locator('.marketplace-skill-panel')
  await expect(panel.locator('.chat-header .chat-title')).toHaveText('alpha')
  await expect(panel.locator('.skill-info-heading h2')).toHaveText('alpha')
  await expect(panel.locator('.skill-metadata')).toBeVisible()
  await expect(panel.locator('.skill-document-card')).toBeVisible()
  await expect(panel.locator('.chat-header').getByRole('button', { name: '安装到本地' })).toBeVisible()
  await expect(panel.locator('.chat-header').getByRole('button', { name: '刷新详情' })).toBeVisible()
  const install = await panel.getByRole('button', { name: '安装到本地' }).boundingBox(), refresh = await panel.getByRole('button', { name: '刷新详情' }).boundingBox()
  expect(install!.x).toBeGreaterThan(refresh!.x + refresh!.width)
  await runtime.reviewNativeCheckpoint('商城共享技能详情布局')
  const tabs = page.getByRole('tablist', { name: '技能分类' }), width = (await tabs.boundingBox())!.width
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 680))
  await expect.poll(async () => (await tabs.boundingBox())!.width).toBe(width)
  for (const name of ['本地', '收藏', '商城']) {
    const visible = await tabs.getByRole('tab', { name, exact: true }).evaluate(el => {
      const rect = el.getBoundingClientRect()
      for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) { const box = ancestor.getBoundingClientRect(); if (getComputedStyle(ancestor).overflowX !== 'visible' && (rect.left < box.left - 1 || rect.right > box.right + 1)) return false }
      return rect.left >= 0 && rect.right <= innerWidth
    })
    expect(visible).toBe(true)
  }
  expect(await page.locator('.custom-catalog-toolbar').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await runtime.reviewNativeCheckpoint('窄窗三个目录标签完整')
  expect(runtime.errors).toEqual([])
})
