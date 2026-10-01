/*
 * [INPUT]: 会话管理中文场景、普通检索 Dialog、隔离 Electron fixture 与产品 IPC。
 * [OUTPUT]: 标题添加/检索入口同行，加号仅员工/群聊，常驻名称输入与唯一核心头像/名称分组标题与右侧新会话图标；名称筛选暂时展开且禁止子集重排、清除恢复原折叠；Dialog 搜索折叠会话不改变原折叠选择、定位后键盘换序保留非匹配会话；会话行计数/键盘排序排除核心分类导航按钮；无核心历史时仍保留分组标题；整行折叠触发器与12px过渡箭头；单聊文本框和群聊真实编辑器保持同一草稿断言；空态仅保留透明毛绒伙伴图片并验证加载与背景透明；启动/重载忽略旧选中偏好、删除当前后空态与删除其他会话保留当前；原生鼠标排序先等待分组实际展开且高度过渡结束，避免自动悬停滚动改变取点；忽略无限光标动画的稳定截图、置顶/普通组折叠与按实际成员查询的搜索可见性、右键管理、清理后旧请求不可重放且新请求仍可交流、重启保留删除结果、通讯录创建与头像布局验证。
 * [POS]: 会话列表 BDD 步骤；进程生命周期复用 Desktop。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { messageDraft } from '../support/editor-controls'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

export const test = base.extend<{ listScenario: { order: string[]; removedId?: string; removedTitle?: string } }>({
  listScenario: async ({}, use) => use({ order: [] }),
})
const { Given, When, Then } = createBdd(test)
const list = (runtime: Desktop) => runtime.page.getByRole('navigation', { name: '会话列表' })
const titles = (runtime: Desktop) => list(runtime).locator('.conversation-item').evaluateAll(items => items.map(item => item.getAttribute('aria-label')!))
const snapshot = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
const searchDialog = (runtime: Desktop) => runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })
async function searchNames(runtime: Desktop, keyword: string) {
  await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  const dialog = searchDialog(runtime)
  await dialog.getByRole('combobox', { name: '检索类型', exact: true }).click()
  await runtime.page.getByRole('option', { name: '会话', exact: true }).click()
  await dialog.getByRole('textbox', { name: '搜索关键词', exact: true }).fill(keyword)
  return dialog
}
const context = async (runtime: Desktop, title: string, action: string) => {
  await list(runtime).getByRole('button', { name: title, exact: true }).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: action, exact: true }).click()
}

Given('三个群聊出现在会话列表且标题提供添加与检索入口', async ({ runtime }) => {
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(async () => {
    for (const title of ['协作甲', '资料库项目', '协作乙']) await window.boai.request('createConversation', { title, kind: 'group', agentIds: ['researcher', 'writer'] })
  })
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(3)
  await expect(runtime.page.locator('.conversation-list-panel .list-heading button')).toHaveCount(2)
  const search = (await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).boundingBox())!, add = (await runtime.page.getByRole('button', { name: '新建', exact: true }).boundingBox())!
  expect(Math.abs(search.y - add.y)).toBeLessThan(2); expect(Math.min(Math.abs(search.x + search.width - add.x), Math.abs(add.x + add.width - search.x))).toBeLessThan(16)
  await runtime.page.getByRole('button', { name: '新建', exact: true }).click()
  await expect(runtime.page.getByRole('menuitem')).toHaveCount(2)
  await expect(runtime.page.getByRole('menuitem', { name: '新建员工' })).toBeVisible()
  await expect(runtime.page.getByRole('menuitem', { name: '新建群聊' })).toBeVisible()
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('menu')).toBeHidden()
  await expect(runtime.page.getByRole('button', { name: '新建', exact: true })).toBeFocused()
})
When('常驻名称输入筛选会话且清除恢复折叠', async ({ runtime }) => {
  const page = runtime.page, panel = page.locator('.conversation-list-panel')
  const input = panel.getByRole('textbox', { name: '搜索会话', exact: true })
  await expect(input).toBeVisible()
  await expect(input).toHaveAttribute('placeholder', '搜索会话名称')
  const core = (await snapshot(runtime)).agents.find(agent => agent.id === 'bobo' && agent.systemRole === 'core')!
  const entry = panel.getByRole('button', { name: `${core.name} 的会话分组`, exact: true })
  await expect(entry).toHaveText(core.name)
  await expect(entry.locator('.avatar.small img')).toHaveCount(1)
  await expect.poll(() => entry.locator('img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
  expect((await entry.boundingBox())!.y).toBeGreaterThanOrEqual((await input.boundingBox())!.y + (await input.boundingBox())!.height)
  const heading = list(runtime).getByRole('button', { name: '会话', exact: true })
  const group = list(runtime).getByRole('group', { name: '普通会话', exact: true })
  const before = await titles(runtime)
  await heading.click(); await expect(group).toBeHidden()
  await input.fill('协作')
  await expect(group).toBeVisible()
  await expect.poll(() => titles(runtime)).toEqual(before.filter(title => title.includes('协作')))
  const row = list(runtime).getByRole('button', { name: '协作乙', exact: true })
  await expect(row).toHaveAttribute('draggable', 'false')
  await row.press('Alt+ArrowUp')
  await expect.poll(() => titles(runtime)).toEqual(before.filter(title => title.includes('协作')))
  await expect(entry).toBeVisible()
  await input.fill('没有匹配的会话')
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(0)
  await expect(entry).toBeVisible(); await expect(input).toBeVisible()
  expect((await snapshot(runtime)).conversations).toHaveLength(3)
  await input.fill(''); await expect(group).toBeHidden()
  await heading.click(); await expect(group).toBeVisible()
  await expect.poll(() => titles(runtime)).toEqual(before)
})
When('把最后一个会话拖到首位并置顶另一个会话', async ({ runtime, listScenario }) => {
  const before = await titles(runtime)
  const source = list(runtime).getByRole('button', { name: before[2], exact: true })
  const target = list(runtime).getByRole('button', { name: before[0], exact: true })
  await expect(source).toHaveAttribute('draggable', 'true')
  const panel = list(runtime).getByRole('group', { name: '普通会话', exact: true }).locator('..')
  await expect.poll(() => panel.evaluate(element => {
    return Math.abs(element.getBoundingClientRect().height - element.scrollHeight) < 1 && !element.getAnimations().some(animation => animation.playState === 'running')
  })).toBe(true)
  await source.hover()
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
  await expect(list(runtime).getByRole('group', { name: '置顶会话' }).locator('.conversation-item')).toHaveCount(1)
  await expect(list(runtime).locator('.conversation-pin')).toHaveCount(0)
  for (const [name, group] of [['置顶', '置顶会话'], ['会话', '普通会话']]) {
    const heading = list(runtime).getByRole('button', { name, exact: true })
    await runtime.page.mouse.move(700, 200)
    await expect(heading).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(heading.locator('.app-icon')).toHaveCSS('opacity', '0.75')
    await expect(heading.locator('.app-icon')).toHaveCSS('width', '12px')
    await expect(heading.locator('.app-icon')).toHaveCSS('height', '12px')
    const triggerBounds = (await heading.boundingBox())!
    const sectionBounds = (await heading.locator('..').boundingBox())!
    expect(Math.abs(triggerBounds.width - sectionBounds.width)).toBeLessThan(2)
    await heading.hover()
    await expect(heading.locator('.app-icon')).toHaveCSS('opacity', '1')
    await expect(heading).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await heading.click({ position: { x: triggerBounds.width - 4, y: triggerBounds.height / 2 } })
    await expect(list(runtime).getByRole('group', { name: group })).toBeHidden()
    const keyword = group === '置顶会话' ? listScenario.order[0] : '协作', dialog = await searchNames(runtime, keyword)
    const matches = (await snapshot(runtime)).conversations.filter(item => Boolean(item.list?.pinned) === (group === '置顶会话') && item.title.includes(keyword))
    expect(matches.length).toBeGreaterThan(0)
    for (const item of matches) await expect(dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${item.id}"]`)).toBeVisible()
    await runtime.page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
    await expect(list(runtime).getByRole('group', { name: group })).toBeHidden()
    await heading.click()
    await expect(list(runtime).getByRole('group', { name: group })).toBeVisible()
  }
  await context(runtime, listScenario.order[0], '取消置顶')
  await expect(list(runtime).locator('.conversation-pin')).toHaveCount(0)
})
When('检索定位会话后排序并从右键菜单删除当前会话', async ({ runtime, listScenario }) => {
  const page = runtime.page
  const before = await titles(runtime), filtered = before.filter(title => title.includes('协作')), other = before.filter(title => !title.includes('协作'))
  expect(filtered).toHaveLength(2)
  const dialog = await searchNames(runtime, '协作')
  await expect(dialog.locator('[data-search-kind="conversation"]')).toHaveCount(2)
  const selected = (await snapshot(runtime)).conversations.find(item => item.title === filtered[1])!
  await dialog.locator(`[data-search-result-id="${selected.id}"]`).click(); await expect(dialog).toHaveCount(0)
  await expect(list(runtime).getByRole('button', { name: filtered[1], exact: true })).toHaveClass(/selected/)
  await list(runtime).getByRole('button', { name: filtered[1], exact: true }).press('Alt+ArrowUp')
  await expect.poll(() => titles(runtime)).toEqual([...filtered].reverse().concat(other))
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(3)
  listScenario.removedTitle = filtered[1]
  listScenario.removedId = (await snapshot(runtime)).conversations.find(c => c.title === filtered[1])!.id
  await list(runtime).getByRole('button', { name: filtered[1], exact: true }).click()
  await page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '确认前保留、删除后清空的历史', mentionIds: [], requestId: 'list-history' }), listScenario.removedId)
  await expect(page.getByText('确认前保留、删除后清空的历史', { exact: true })).toBeVisible()
  const workspace = (await snapshot(runtime)).conversations.find(item => item.id === listScenario.removedId)!.workspacePath
  await mkdir(workspace, { recursive: true }); await writeFile(join(workspace, 'media.png'), 'conversation-only-file')
  await context(runtime, filtered[1], '清空聊天记录')
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(list(runtime).getByRole('button', { name: filtered[1], exact: true })).toBeVisible()
  await expect(page.getByText('确认前保留、删除后清空的历史', { exact: true })).toHaveCount(0)
  expect((await page.evaluate(id => window.boai.request('getConversation', { id }), listScenario.removedId!)).messages).toEqual([])
  await expect(readFile(join(workspace, 'media.png'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '确认前保留、删除后清空的历史', mentionIds: [], requestId: 'list-history' }), listScenario.removedId)).rejects.toThrow('原消息已清理，旧请求不能重放')
  expect((await page.evaluate(id => window.boai.request('getConversation', { id }), listScenario.removedId!)).messages).toEqual([])
  await page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '确认前保留、删除后清空的历史', mentionIds: [], requestId: 'list-history-after-clear' }), listScenario.removedId)
  await expect(page.getByText('确认前保留、删除后清空的历史', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '消息内容' }).fill('保留这份草稿')
  await context(runtime, filtered[1], '删除会话')
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('确认前保留、删除后清空的历史', { exact: true })).toBeVisible()
  await context(runtime, filtered[1], '删除会话')
  await page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
  await expect(list(runtime).getByRole('button', { name: filtered[1], exact: true })).toHaveCount(0)
  await expect(list(runtime).locator('.selected')).toHaveCount(0)
  await expect(page.locator('img.empty-illustration[alt="等你开聊的小伙伴"]:visible')).toBeVisible()
  expect((await snapshot(runtime)).conversations.find(c => c.id === listScenario.removedId)?.list?.hidden).toBe(true)
})
Then('重启后会话仍隐藏且通讯录恢复的是空会话', async ({ runtime, listScenario }) => {
  await runtime.restart()
  const page = runtime.page
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(2)
  await expect(list(runtime).getByRole('button', { name: listScenario.removedTitle!, exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: listScenario.removedTitle!, exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(list(runtime).locator('.selected')).toHaveAttribute('aria-label', listScenario.removedTitle!)
  await expect(page.getByText('确认前保留、删除后清空的历史', { exact: true })).toHaveCount(0)
  expect((await page.evaluate(id => window.boai.request('getConversation', { id }), listScenario.removedId!)).messages).toEqual([])
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
  await expect(contacts.getByRole('button', { name: '新建', exact: true })).toHaveCount(1)
  await expect(contacts.getByRole('button', { name: /^(新建员工|新建群聊)$/ })).toHaveCount(0)
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
  await page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
  await expect(list(runtime).getByRole('button', { name: '通讯录新同事', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '通讯录新同事', exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('')
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
  await page.screenshot({ path: 'test-results/conversation-list-dark.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(list(runtime).getByRole('button', { name, exact: true })).toBeFocused()
  expect(runtime.errors).toEqual([])
})

When('选中会话后重新加载页面', async ({ runtime }) => {
  const page = runtime.page
  await expect(list(runtime).locator('[aria-current=page]')).toHaveCount(0)
  await list(runtime).getByRole('button', { name: '协作甲', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible()
  // Legacy selection preferences must not reopen a conversation on startup.
  await page.evaluate(() => {
    const selected = document.querySelector('.conversation-item.selected')?.getAttribute('aria-label')
    return window.boai.request('snapshot', undefined).then(snapshot => {
      localStorage.setItem('boai.v2.conversation', snapshot.conversations.find(c => c.title === selected)!.id)
    })
  })
  await page.reload()
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(3)
})
Then('会话默认未选中并显示伙伴插画', async ({ runtime }) => {
  await expect(list(runtime).locator('[aria-current=page]')).toHaveCount(0)
  await expect(runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true })).toHaveCount(1)
  await expect(list(runtime).getByRole('group', { name: 'bobo 的会话', exact: true }).locator('.conversation-item')).toHaveCount(0)
  const stage = runtime.page.locator('.conversation-stage')
  await expect(stage).toHaveText('')
  await expect(stage.getByRole('button')).toHaveCount(0)
  await expect(stage.locator('.starter-cards')).toHaveCount(0)
  const illustration = runtime.page.locator('img.empty-illustration[alt="等你开聊的小伙伴"]:visible')
  await expect(illustration).toBeVisible()
  await expect(illustration).toHaveJSProperty('naturalWidth', 600)
  await expect(illustration).toHaveJSProperty('naturalHeight', 460)
  expect(await illustration.evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = element.naturalWidth; canvas.height = element.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(element, 0, 0)
    return [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]]
      .map(([x, y]) => context.getImageData(x, y, 1, 1).data[3])
  })).toEqual([0, 0, 0, 0])
  await expect(runtime.page.getByRole('textbox', { name: '消息内容' })).toHaveCount(0)
  expect(runtime.errors).toEqual([])
})
When('删除其他会话后再删除当前及最后一个会话', async ({ runtime }) => {
  const page = runtime.page
  await page.screenshot({ path: 'test-results/conversation-empty-light.png', animations: 'disabled' })
  await list(runtime).getByRole('button', { name: '协作甲', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容' }).fill('保留当前会话草稿')
  await context(runtime, '资料库项目', '删除会话')
  await page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
  await expect(list(runtime).getByRole('button', { name: '资料库项目', exact: true })).toHaveCount(0)
  await expect(list(runtime).locator('.selected')).toHaveAttribute('aria-label', '协作甲')
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('保留当前会话草稿')
  await context(runtime, '协作甲', '删除会话')
  await page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(1)
  await expect(list(runtime).locator('.selected')).toHaveCount(0)
  await expect(page.locator('img.empty-illustration[alt="等你开聊的小伙伴"]:visible')).toBeVisible()
  await page.evaluate(async () => { const a = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: a.revision }) })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: 'test-results/conversation-empty-dark.png', animations: 'disabled' })
  await list(runtime).getByRole('button', { name: '协作乙', exact: true }).click()
  await context(runtime, '协作乙', '删除会话')
  await page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
  await expect(list(runtime).locator('.conversation-item')).toHaveCount(0)
})
