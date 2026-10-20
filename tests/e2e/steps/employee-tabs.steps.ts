/*
 * [OUTPUT]: 人格与行为直接展示配置源文件，文件编辑保持独立Dialog及局部草稿守卫；本批仅维护源码，不运行E2E。
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 技能一级入口随产品统一为自定义。
 * [OUTPUT]: 员工职责定位对齐HEAD已有ARIA名称；保存前配置有效隔离模型来源，六标签尺寸沿现行布局核对，原未保存/键盘/样式断言保持。
 * [INPUT]: 员工共享标签页中文场景、旧资料库启动偏好、Electron fixture 与产品 API。
 * [OUTPUT]: 验证共享滑动层实际中间帧、选中对齐和减少动态效果；保留草稿保护、键盘及明暗窄窗验收。
 * [OUTPUT]: 会话菜单入口、分类面板语义、草稿保护、键盘切换及跨页面/主题/窄窗视觉验收；资料库无主导航和页面，旧偏好重载回会话，技能入口的本地/收藏/商城分类保留。
 * [POS]: tests/e2e/steps/employee-tabs.steps.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'

const { Given, When, Then } = createBdd(test)
const tabStyle = (tab: Locator) => tab.evaluate(element => {
  const style = getComputedStyle(element)
  return { height: element.getBoundingClientRect().height, fontSize: style.fontSize, radius: style.borderRadius, background: style.backgroundColor, shadow: style.boxShadow }
})

Given('在通讯录中编辑研究员配置', async ({ runtime }) => {
  await runtime.start()
  const page = runtime.page
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: appearance.revision })
    const connection = await window.boai.request('saveConnection', { name: '标签页隔离配置', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'unused' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(value => value.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'unused', expectedConfigVersion: configVersion })
  })
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('tablist', { name: '员工详情分类' })).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveText('配置')
  await expect(page.getByRole('tabpanel', { name: '配置', exact: true })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
})

Then('共享标签选中层平滑移动且尊重减少动态效果', async ({ runtime }) => {
  const page = runtime.page
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const list = page.getByRole('tablist', { name: '员工详情分类' })
  const pill = list.locator('[data-slot=tabs-indicator]')
  const aligned = () => list.evaluate(element => {
    const active = element.querySelector('[aria-selected=true]')!.getBoundingClientRect()
    const marker = element.querySelector('[data-slot=tabs-indicator]')!.getBoundingClientRect()
    return Math.max(Math.abs(marker.x - active.x), Math.abs(marker.y - active.y), Math.abs(marker.width - active.width), Math.abs(marker.height - active.height)) < 1
  })
  await expect(pill).toBeVisible()
  await expect.poll(aligned).toBe(true)
  const movement = await list.evaluate(async element => {
    const marker = element.querySelector<HTMLElement>('[data-slot=tabs-indicator]')!
    const positions: number[] = [marker.getBoundingClientRect().x]
    const destination = Array.from(element.querySelectorAll<HTMLElement>('[role=tab]')).find(tab => tab.textContent === '记忆')!
    destination.click()
    for (let frame = 0; frame < 10; frame++) {
      await new Promise(requestAnimationFrame)
      positions.push(marker.getBoundingClientRect().x)
    }
    return { positions, destination: destination.getBoundingClientRect().x, duration: getComputedStyle(marker).transitionDuration }
  })
  expect(movement.duration).toContain('0.25s')
  expect(movement.positions.some(x => x > movement.positions[0]! + 1 && x < movement.destination - 1)).toBe(true)
  await expect(list.getByRole('tab', { name: '记忆', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(aligned).toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await list.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(pill).toHaveCSS('transition-duration', '0s')
  await expect.poll(aligned).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})

When('切换员工标签时继续编辑或放弃修改', async ({ runtime }) => {
  const page = runtime.page
  const role = page.getByRole('textbox', { name: '员工职责', exact: true })
  const original = await role.inputValue()
  await role.fill('尚未保存的职责')
  await page.getByRole('tab', { name: '人格与行为', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByRole('tab', { name: '配置', exact: true, includeHidden: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(role).toHaveValue('尚未保存的职责')
  await page.getByRole('tab', { name: '人格与行为', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '人格与行为', exact: true })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(role).toHaveValue(original)

  // Unsaved system-file drafts must also be unmounted without losing the chosen tab.
  await page.getByRole('tab', { name: '人格与行为', exact: true }).click()
  await page.getByRole('button', { name: /SOUL.md/ }).click()
  const content = page.getByRole('textbox', { name: 'SOUL.md 内容', exact: true })
  const savedContent = await content.inputValue()
  await content.fill('这份文件草稿不应该保存')
  await page.getByRole('button', { name: '关闭配置源文件 SOUL.md', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.getByRole('tab', { name: '工作区', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '工作区', exact: true })).toContainText('独立工作区')
  expect((await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))).content).toBe(savedContent)
})

Then('保存配置后进入目标标签且键盘可以访问其他分类', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await page.getByRole('textbox', { name: '员工职责', exact: true }).fill('核对每条来源')
  await page.getByRole('tab', { name: '记忆', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.getByRole('tab', { name: '记忆', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '记忆', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.role).toBe('核对每条来源')
  const memory = page.getByRole('tab', { name: '记忆', exact: true })
  await memory.focus()
  await memory.press('ArrowLeft')
  const workspace = page.getByRole('tab', { name: '工作区', exact: true })
  await expect(workspace).toBeFocused()
  await expect(memory).toHaveAttribute('aria-selected', 'true')
  await workspace.press('Enter')
  await expect(workspace).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('核对每条来源')
})

Then('会话侧栏使用相同标签样式且深色窄窗口完整显示', async ({ runtime }) => {
  const page = runtime.page
  const profile = page.getByRole('tab', { name: '配置', exact: true })
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish() })
  const contactStyle = await tabStyle(profile)
  expect(contactStyle.fontSize).toBe('13px')
  expect(contactStyle.height).toBeLessThanOrEqual(32)
  const list = page.getByRole('tablist', { name: '员工详情分类' })
  await expect(list).toHaveCSS('height', '32px')
  expect((await list.boundingBox())!.width).toBeLessThan(450)
  await page.getByRole('button', { name: '返回资料', exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  expect(await tabStyle(profile)).toEqual(contactStyle)
  await page.mouse.move(400, 300)
  await page.screenshot({ path: 'test-results/employee-tabs-light.png', animations: 'disabled' })
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision })
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  const panel = page.locator('.detail-panel')
  await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  for (const name of ['配置', '人格与行为', '工作区', '记忆', '执行详情', '渠道']) await expect(list.getByRole('tab', { name, exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/employee-tabs-dark.png', animations: 'disabled' })
  expect(runtime.errors).toEqual([])
})

Then('资料库入口已移除且旧页面偏好回到会话并保留技能分类', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  const navigation = page.getByRole('navigation', { name: '主导航', exact: true })
  await expect(navigation.getByRole('button', { name: '资料库', exact: true })).toHaveCount(0)
  await page.evaluate(() => localStorage.setItem('boai.v2.page', 'library'))
  await page.reload()
  await expect(navigation.getByRole('button', { name: '会话', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation', { name: '会话列表', exact: true })).toBeVisible()
  await expect(navigation.getByRole('button', { name: '资料库', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '资料库', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: '资料库分类', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('boai.v2.page'))).toBe('conversations')
  await navigation.getByRole('button', { name: '自定义', exact: true }).click()
  await expect(navigation.getByRole('button', { name: '自定义', exact: true })).toHaveAttribute('aria-current', 'page')
  const tabs = page.getByRole('tablist', { name: '技能分类', exact: true })
  await expect(tabs).toBeVisible()
  for (const name of ['本地', '收藏', '商城']) await expect(tabs.getByRole('tab', { name, exact: true })).toBeVisible()
  await expect(tabs.getByRole('tab', { name: '本地', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect(runtime.errors).toEqual([])
})
