/*
 * [INPUT]: 会话管理中文场景、隔离 Electron fixture 与产品 IPC。
 * [OUTPUT]: 原生鼠标排序、右键管理、重启保留历史、通讯录创建与头像布局验证。
 * [POS]: 会话列表 BDD 步骤；进程生命周期复用 Desktop。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

export const test = base.extend<{ listScenario: { order: string[]; removedId?: string; removedTitle?: string } }>({
  listScenario: async ({}, use) => use({ order: [] }),
})
const { Given, When, Then } = createBdd(test)
const list = (runtime: Desktop) => runtime.page.getByRole('navigation', { name: '会话列表' })
const titles = (runtime: Desktop) => list(runtime).locator('.conversation-item').evaluateAll(items => items.map(item => item.getAttribute('aria-label')!))
const snapshot = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
const context = async (runtime: Desktop, title: string, action: string) => {
  await list(runtime).getByRole('button', { name: title, exact: true }).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: action, exact: true }).click()
}

Given('三个群聊出现在会话列表且标题只有添加入口', async ({ runtime }) => {
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(async () => {
    for (const title of ['协作甲', '资料库项目', '协作乙']) await window.boai.request('createConversation', { title, kind: 'group', agentIds: ['researcher', 'writer'] })
  })
  await expect(list(runtime).getByRole('button')).toHaveCount(3)
  await expect(runtime.page.locator('.conversation-list-panel .list-heading button')).toHaveCount(1)
  await runtime.page.getByRole('button', { name: '新建', exact: true }).click()
  await expect(runtime.page.getByRole('menuitem', { name: '新建员工' })).toBeVisible()
  await expect(runtime.page.getByRole('menuitem', { name: '新建群聊' })).toBeVisible()
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('menu')).toBeHidden()
  await expect(runtime.page.getByRole('button', { name: '新建', exact: true })).toBeFocused()
})
When('把最后一个会话拖到首位并置顶另一个会话', async ({ runtime, listScenario }) => {
  const before = await titles(runtime)
  const source = list(runtime).getByRole('button', { name: before[2], exact: true })
  const target = list(runtime).getByRole('button', { name: before[0], exact: true })
  const from = (await source.boundingBox())!, to = (await target.boundingBox())!
  await runtime.page.mouse.move(from.x + 80, from.y + from.height / 2)
  await runtime.page.mouse.down()
  await runtime.page.mouse.move(to.x + 80, to.y + 4, { steps: 10 })
  await runtime.page.mouse.move(to.x + 81, to.y + 4)
  await expect(list(runtime).locator('[data-drop=before]')).toBeVisible()
  await runtime.page.screenshot({ path: 'test-results/conversation-list-drag.png' })
  await runtime.page.mouse.up()
  listScenario.order = [before[2], before[0], before[1]]
  await expect.poll(() => titles(runtime)).toEqual(listScenario.order)
  await context(runtime, before[0], '置顶')
  listScenario.order = [before[0], before[2], before[1]]
  await expect.poll(() => titles(runtime)).toEqual(listScenario.order)
  await list(runtime).getByRole('button', { name: before[0], exact: true }).click({ button: 'right' })
  await expect(runtime.page.getByRole('menuitem', { name: '取消置顶' })).toBeVisible()
  await runtime.page.screenshot({ path: 'test-results/conversation-list-menu.png' })
  await runtime.page.keyboard.press('Escape')
})
Then('重启后手动顺序和置顶状态仍然保留', async ({ runtime, listScenario }) => {
  await runtime.restart()
  await expect.poll(() => titles(runtime)).toEqual(listScenario.order)
  await expect(list(runtime).getByRole('button').first().locator('.conversation-pin')).toBeVisible()
  await context(runtime, listScenario.order[0], '取消置顶')
  await expect(list(runtime).locator('.conversation-pin')).toHaveCount(0)
})
When('在搜索结果中排序并从右键菜单删除当前会话', async ({ runtime, listScenario }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '搜索会话' }).fill('协作')
  const filtered = await titles(runtime)
  await list(runtime).getByRole('button').last().press('Alt+ArrowUp')
  await expect.poll(() => titles(runtime)).toEqual([...filtered].reverse())
  await page.getByRole('textbox', { name: '搜索会话' }).fill('')
  await expect(list(runtime).getByRole('button')).toHaveCount(3)
  listScenario.removedTitle = filtered[1]
  listScenario.removedId = (await snapshot(runtime)).conversations.find(c => c.title === filtered[1])!.id
  await list(runtime).getByRole('button', { name: filtered[1], exact: true }).click()
  await page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '删除列表后应保留的历史', mentionIds: [], requestId: 'list-history' }), listScenario.removedId)
  await expect(page.getByText('删除列表后应保留的历史', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '消息内容' }).fill('保留这份草稿')
  await context(runtime, filtered[1], '删除会话')
  await expect(list(runtime).getByRole('button', { name: filtered[1], exact: true })).toHaveCount(0)
  await expect(list(runtime).locator('.selected')).not.toHaveAttribute('aria-label', filtered[1])
  expect((await snapshot(runtime)).conversations.find(c => c.id === listScenario.removedId)?.list?.hidden).toBe(true)
})
Then('重启后会话仍隐藏且可以从通讯录恢复原记录', async ({ runtime, listScenario }) => {
  await runtime.restart()
  const page = runtime.page
  await expect(list(runtime).getByRole('button')).toHaveCount(2)
  await expect(list(runtime).getByRole('button', { name: listScenario.removedTitle!, exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: listScenario.removedTitle!, exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(list(runtime).locator('.selected')).toHaveAttribute('aria-label', listScenario.removedTitle!)
  await expect(page.getByText('删除列表后应保留的历史', { exact: true })).toBeVisible()
  const state = await snapshot(runtime)
  expect(state.conversations).toHaveLength(3)
  expect(state.conversations.find(c => c.id === listScenario.removedId)?.list?.hidden).toBe(false)
  expect(runtime.errors).toEqual([])
})
Given('通讯录具有一至十位成员的群聊', async ({ runtime }) => {
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(async () => {
    const ids = ['researcher', 'writer', 'reviewer']
    for (let i = 4; i <= 10; i++) {
      const agent = await window.boai.request('saveAgent', { name: `同事${i}`, role: '协作成员', instructions: '帮助完成工作', color: '#6675a4', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], active: true, allowCommands: false })
      ids.push(agent.id)
    }
    for (let n = 1; n <= 10; n++) await window.boai.request('createConversation', { title: `${n}人群`, kind: 'group', agentIds: ids.slice(0, n) })
  })
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
})
Then('群头像按人数居中排列并且最多显示九位真实成员', async ({ runtime }) => {
  const page = runtime.page, contacts = page.getByRole('complementary', { name: '通讯录列表' })
  const patterns = [[1], [2], [1, 2], [2, 2], [1, 2, 2], [3, 3], [1, 3, 3], [2, 3, 3], [3, 3, 3], [3, 3, 3]]
  await expect(contacts.locator('.list-heading button')).toHaveCount(1)
  for (let n = 1; n <= 10; n++) {
    const item = contacts.getByRole('button', { name: `${n}人群`, exact: true })
    await item.scrollIntoViewIfNeeded()
    await expect(item.locator('.group-avatar img')).toHaveCount(Math.min(n, 9))
    expect(await item.locator('.group-avatar-row').evaluateAll(rows => rows.map(row => row.children.length))).toEqual(patterns[n - 1])
    await item.click()
    const detail = page.locator('.contact-profile-heading .group-avatar')
    await expect(detail.locator('img')).toHaveCount(Math.min(n, 9))
    expect(await detail.locator('img').evaluateAll(imgs => imgs.map(img => img.getAttribute('src')))).toEqual(await item.locator('img').evaluateAll(imgs => imgs.map(img => img.getAttribute('src'))))
    const cells = await detail.locator('.group-avatar-tile').evaluateAll(tiles => tiles.map(tile => { const b = tile.getBoundingClientRect(); return [b.width, b.height] }))
    expect(cells.every(([w, h]) => w > 10 && Math.abs(w - h) < 1)).toBe(true)
    expect(await detail.evaluate(group => { const bounds = group.getBoundingClientRect(); return [...group.querySelectorAll('img')].every(img => { const b = img.getBoundingClientRect(); return b.top >= bounds.top && b.bottom <= bounds.bottom && b.left >= bounds.left && b.right <= bounds.right }) })).toBe(true)
  }
  await contacts.getByRole('button', { name: '9人群', exact: true }).click()
  await page.screenshot({ path: 'test-results/group-avatar-mosaics.png' })
})
When('从通讯录添加菜单创建员工和群聊', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工' }).click()
  const dialog = page.getByRole('dialog', { name: '新建数字员工' })
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('通讯录新同事')
  await dialog.getByRole('button', { name: '创建员工' }).click()
  await expect(list(runtime).locator('.selected')).toHaveAttribute('aria-label', '通讯录新同事')
  const directId = (await snapshot(runtime)).conversations.find(item => item.title === '通讯录新同事')!.id
  await page.getByRole('textbox', { name: '消息内容' }).fill('隐藏后保留的草稿')
  await context(runtime, '通讯录新同事', '删除会话')
  await expect(list(runtime).getByRole('button', { name: '通讯录新同事', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '通讯录新同事', exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '消息内容' })).toHaveValue('隐藏后保留的草稿')
  const directs = (await snapshot(runtime)).conversations.filter(item => item.kind === 'direct')
  expect(directs.map(item => item.id)).toEqual([directId])
  expect(directs[0].list?.hidden).toBe(false)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建群聊' }).click()
  const group = page.getByRole('dialog', { name: '发起群聊' })
  await group.getByRole('checkbox', { name: /研究员/ }).check()
  await group.getByRole('checkbox', { name: /写手/ }).check()
  await group.getByRole('button', { name: '完成', exact: true }).click()
  await expect(group).toBeHidden()
  await expect(list(runtime).locator('.selected .group-avatar img')).toHaveCount(2)
})
Then('新会话显示成员头像且窄窗口深色菜单仍然可用', async ({ runtime }) => {
  const page = runtime.page
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.evaluate(async () => { const a = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: a.revision }) })
  const selected = list(runtime).locator('.selected')
  const name = (await selected.getAttribute('aria-label'))!
  await selected.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '置顶', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '删除会话', exact: true })).toBeVisible()
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)))
  await page.screenshot({ path: 'test-results/conversation-list-dark.png' })
  await page.keyboard.press('Escape')
  await expect(list(runtime).getByRole('button', { name, exact: true })).toBeFocused()
  expect(runtime.errors).toEqual([])
})
