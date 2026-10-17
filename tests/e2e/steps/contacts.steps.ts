/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 会话菜单配置往返通讯录并选中实际员工/群，原草稿、配置保存/放弃与会话复用断言保持。
 * [INPUT]: 通讯录配置/清理/标签管理的中文场景、会话常驻名称输入/检索 Dialog、Electron fixture、隔离 SQLite 旧分类、原生鼠标排序、真实产品 IPC 和工作区文件。
 * [OUTPUT]: 员工工作规则经明确配置/系统文件入口核读AGENTS.md后返回资料概览；保留原指令、零会话创建、配置保存/草稿守卫与会话复用断言。
 * [OUTPUT]: 通讯录管理仅经加号菜单打开且无独立按钮；标签增删真实提交停顿期间，筛选/管理搜索及 Portal 标签搜索/未选员工行及人数/取消选择的可用状态、颜色、有效透明度和位置保持；设置标签/删除/关闭按钮及当前标签勾选保持写锁，前三项按钮颜色/背景色与渐变/有效透明度/位置保持，浏览控件可用状态不变，展开权限后永久不可用的完全访问项维持 disabled/半透明；add/remove 前后截图与比较证据独立保存，测试门闩与观测在 finally 恢复；会话检索关闭后常驻名称输入保留且通讯录往返仍复用原私聊与草稿；平面联系人搜索/折叠及跨标签全员工排序；旧分类兼容标签与重启、默认收起筛选/搜索清空选择、浅深/窄窗紧凑双栏管理与底部动画面板、标题可读及搜索/关闭按钮实际布局；常规按钮行内新建标签/取消零写入、标签改名/保留员工删除、即时多标签勾选和 mixed 状态保持未选成员，标签提交零全局读取且保留管理 DOM/选择/滚动及原详情；只读紧凑所选浮层、人数仅数字主色、单位普通颜色且取消选择主色和批量栏无编辑配置、取消选择/改筛选关闭删除浮层并禁用退出缓存动作、危险按钮确认/取消零写入与冻结版本拒绝、真实单聊/工作区清理、空群解散及其他群历史和重启保留；原配置保护/会话复用/默认启用隐藏的桌面断言。
 * [POS]: tests/e2e/steps/contacts.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { contactTagIds } from '../../../src/shared/domain/contact-list'

type Scenario = {
  openContacts?: Awaited<ReturnType<typeof openContacts>>
  filterContacts?: Awaited<ReturnType<typeof filterContacts>>
  editContactWithGuard?: Awaited<ReturnType<typeof editContactWithGuard>>
  reuseDirectConversation?: Awaited<ReturnType<typeof reuseDirectConversation>>
  editGroupWithGuard?: Awaited<ReturnType<typeof editGroupWithGuard>>
  removal?: Awaited<ReturnType<typeof prepareContactRemoval>>
  management?: Awaited<ReturnType<typeof prepareLegacyContactTags>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function expectFlatContacts(list: Locator) {
  await expect(list.locator('.contacts-category-heading')).toHaveCount(0)
  await expect(list.getByRole('group', { name: /^员工分类 / })).toHaveCount(0)
  const people = list.getByRole('group', { name: '联系人', exact: true })
  await expect(people).toBeVisible()
  const names = await people.locator('.conversation-item').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')!))
  expect(new Set(names).size).toBe(names.length)
  await expect(list.getByRole('button', { name: '通讯录管理', exact: true })).toHaveCount(0)
  await expect(list.getByRole('button', { name: '新建', exact: true })).toBeVisible()
}

async function openContacts(runtime: Desktop) {
  const root = runtime.root
  const app = await runtime.start({ dataDir: root })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  await expect(page.locator('.app-shell')).toBeVisible()
  const snapshot = () => page.evaluate(() => window.boai.request('snapshot', undefined))
  const group = await page.evaluate(() =>
    window.boai.request('createConversation', { kind: 'group', title: '内容协作群', agentIds: ['researcher', 'writer'] }),
  )
  const nav = page.getByRole('navigation', { name: '主导航' })
  const contacts = nav.getByRole('button', { name: '通讯录', exact: true })
  await contacts.click()
  await expect(contacts).toHaveAttribute('aria-current', 'page')
  const list = page.getByRole('complementary', { name: '通讯录列表' })
  const detail = page.getByRole('region', { name: '通讯录详情' })
  const people = list.getByRole('group', { name: '联系人', exact: true })
  const groups = list.getByRole('group', { name: '群聊', exact: true })
  await expect(groups.getByRole('button', { name: '内容协作群' })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('getContactList', undefined))).categories).toEqual([])
  await expectFlatContacts(list)
  await expect(people.locator('.conversation-item')).toHaveCount(3)
  await people.getByRole('button', { name: '研究员', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  const original = (await snapshot()).agents.find(agent => agent.id === 'researcher')!
  await detail.getByRole('button', { name: '查看配置与系统文件', exact: true }).click()
  await detail.getByRole('tab', { name: '系统文件', exact: true }).click()
  const files = detail.getByRole('tabpanel', { name: '系统文件', exact: true })
  await files.getByRole('button', { name: /AGENTS\.md/ }).click()
  const instructions = files.getByRole('textbox', { name: 'AGENTS.md 内容', exact: true })
  await expect(instructions).toBeVisible()
  await expect(instructions).toHaveValue(/你是一名研究员/)
  await expect(instructions).toHaveValue(original.instructions)
  await runtime.reviewCheckpoint('通讯录通过系统文件核读原员工工作规则')
  await detail.getByRole('button', { name: '返回资料', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await expect(detail.getByRole('region', { name: '员工当前负责工作', exact: true })).toBeVisible()
  expect((await snapshot()).agents.find(agent => agent.id === 'researcher')).toEqual(original)
  await runtime.reviewCheckpoint('读取规则后返回员工资料概览且配置未改变')
  await expect(page.getByRole('textbox', { name: '消息内容' })).toHaveCount(0)
  expect((await snapshot()).conversations).toHaveLength(1)
  return { app, page, errors, snapshot, group, nav, contacts, list, detail, people, groups }
}

async function filterContacts(previous: Awaited<ReturnType<typeof openContacts>>) {
  let { app, page, errors, snapshot, group, nav, contacts, list, detail, people, groups } = previous
  // Search and collapsing never change the inspected identity or create a chat.
  const heading = list.locator('.contacts-section-heading').filter({ hasText: /^联系人/ })
  await heading.click()
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await expect(people).toBeHidden()
  await expect(groups.getByRole('button', { name: '内容协作群' })).toBeVisible()
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('研究')
  await expect(people.getByRole('button')).toHaveCount(1)
  await expect(people.getByRole('button', { name: '研究员', exact: true })).toBeVisible()
  await expect(heading).toHaveAttribute('aria-expanded', 'true')
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('不存在的名字')
  await expect(list).toContainText('没有匹配的联系人')
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('')
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await expect(people).toBeHidden()
  await heading.click()
  await expect(people.getByRole('button', { name: '研究员', exact: true })).toBeVisible()
  return { app, page, errors, snapshot, group, nav, contacts, list, detail, groups }
}

async function editContactWithGuard(previous: Awaited<ReturnType<typeof filterContacts>>) {
  let { app, page, errors, snapshot, group, nav, contacts, list, detail, groups } = previous
  // Cancel navigation and save through the editor before switching selection.
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '职责简介' }).fill('核对来源并整理研究结论')
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(detail.getByRole('textbox', { name: '职责简介' })).toHaveValue('核对来源并整理研究结论')
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await detail.getByRole('button', { name: '保存修改', exact: true }).click()
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await expect(detail.getByRole('heading', { name: '内容协作群', exact: true })).toBeVisible()
  expect((await snapshot()).agents.find((agent) => agent.id === 'researcher')?.role).toBe('核对来源并整理研究结论')
  await expect(detail.getByRole('region', { name: '群成员' })).toBeVisible()
  await detail.getByRole('button', { name: '查看 研究员 的资料' }).click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  expect((await snapshot()).conversations).toHaveLength(1)
  return { app, page, errors, snapshot, group, nav, contacts, list, detail, groups }
}

async function reuseDirectConversation(previous: Awaited<ReturnType<typeof editContactWithGuard>>) {
  let { app, page, errors, snapshot, group, nav, contacts, list, detail, groups } = previous
  await detail.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(nav.getByRole('button', { name: '会话', exact: true })).toHaveAttribute('aria-current', 'page')
  const input = page.getByRole('textbox', { name: '消息内容' })
  await expect(input).toBeVisible()
  await input.fill('通讯录往返后保留这份草稿')
  const direct = (await snapshot()).conversations.find((c) => c.kind === 'direct')!
  expect(direct.agentIds).toEqual(['researcher'])
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  const search = page.getByRole('dialog', { name: '搜索会话内容', exact: true })
  await search.getByRole('textbox', { name: '搜索关键词', exact: true }).fill('隐藏全部会话')
  await expect(search.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await expect(search).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^研究员/ })).toBeVisible()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /^(取消置顶|置顶|搜索本会话)$/ })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '执行过程', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '渠道', exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await expect(contacts).toHaveAttribute('aria-current', 'page')
  await expect(list.getByRole('button', { name: '研究员', exact: true })).toHaveAttribute('aria-current', 'true')
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(input).toHaveValue('通讯录往返后保留这份草稿')
  await expect(search).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '搜索会话', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '搜索会话', exact: true })).toHaveValue('')
  await expect(page.locator('.conversation-item.selected')).toContainText('研究员')
  expect((await snapshot()).conversations).toHaveLength(2)
  expect((await page.evaluate((id) => window.boai.request('getConversation', { id }), direct.id)).messages).toHaveLength(0)
  return { app, page, errors, snapshot, group, contacts, list, detail, groups, input }
}

async function editGroupWithGuard(previous: Awaited<ReturnType<typeof reuseDirectConversation>>) {
  let { app, page, errors, snapshot, group, contacts, list, detail, groups, input } = previous
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^内容协作群/ }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await expect(contacts).toHaveAttribute('aria-current', 'page')
  await expect(groups.getByRole('button', { name: '内容协作群', exact: true })).toHaveAttribute('aria-current', 'true')
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '群聊名称' }).fill('研究写作组')
  await detail.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
  await expect(groups.getByRole('button', { name: '研究写作组' })).toBeVisible()
  expect((await snapshot()).conversations.find((c) => c.id === group.id)?.title).toBe('研究写作组')

  // Discard resets the editor; opening a group must reuse the group and not send content.
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '群聊名称' }).fill('这项修改不保存')
  await detail.getByRole('button', { name: '返回资料', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await detail.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(input).toBeVisible()
  await expect(page.locator('.conversation-item.selected')).toContainText('研究写作组')
  expect((await snapshot()).conversations).toHaveLength(2)
  await contacts.click()
  await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await expect(detail.getByRole('textbox', { name: '群聊名称' })).toHaveValue('研究写作组')
  await detail.getByRole('button', { name: '返回资料' }).click()
  return { app, page, errors, contacts, list, detail, groups }
}

async function verifyContactsLayout(previous: Awaited<ReturnType<typeof editGroupWithGuard>>) {
  let { app, page, errors, contacts, list, detail, groups } = previous
  const width = (await list.boundingBox())!.width
  for (const size of [760, 1247]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 688), size)
    await page.waitForFunction((width) => innerWidth === width, size)
    await expect(list).toBeVisible()
    expect((await list.boundingBox())!.width).toBe(width)
    expect(await detail.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  const toggle = page.getByRole('button', { name: '显示或隐藏通讯录列表' })
  await toggle.click()
  await expect(list).toBeHidden()
  await toggle.click()
  await expect(list).toBeVisible()
  await page.reload()
  await expect(contacts).toHaveAttribute('aria-current', 'page')
  await expectFlatContacts(list)
  await groups.getByRole('button', { name: '研究写作组' }).click()
  await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
  expect(errors).toEqual([])
}

Given('通讯录展示员工和已有群聊且浏览不创建会话', async ({ runtime, scenario }) => {
  scenario.openContacts = await openContacts(runtime)
})

When('搜索和折叠通讯录保留当前查看对象', async ({ scenario }) => {
  scenario.filterContacts = await filterContacts(scenario.openContacts!)
})

Then('切换联系人时未保存保护能够继续编辑或保存', async ({ scenario }) => {
  scenario.editContactWithGuard = await editContactWithGuard(scenario.filterContacts!)
})

When('从联系人往返会话复用私聊和草稿', async ({ scenario }) => {
  scenario.reuseDirectConversation = await reuseDirectConversation(scenario.editContactWithGuard!)
})

Then('群配置保存和放弃都保留正确持久状态', async ({ scenario }) => {
  scenario.editGroupWithGuard = await editGroupWithGuard(scenario.reuseDirectConversation!)
})

Then('通讯录在窄窗口和重新加载后仍可用', async ({ scenario }) => {
  await verifyContactsLayout(scenario.editGroupWithGuard!)
})

const removalList = (runtime: Desktop) => runtime.page.getByRole('complementary', { name: '通讯录列表' })
const removalDetail = (runtime: Desktop) => runtime.page.getByRole('region', { name: '通讯录详情' })
const removalSnapshot = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
const contactPreferences = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('getContactList', undefined))
const managerDialog = (runtime: Desktop) => runtime.page.locator('.contact-manager')
const managerFilter = (runtime: Desktop, name: string) => managerDialog(runtime).getByRole('button', { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) })
const managerTag = (runtime: Desktop, name: string) => managerFilter(runtime, `筛选标签 ${name}`)
const managerSelection = (runtime: Desktop, name: string) => managerDialog(runtime).getByRole('checkbox', { name: `选择 ${name}`, exact: true })
async function expectContactManagerHeader(runtime: Desktop, title: string) {
  const header = managerDialog(runtime).locator('.contact-manager-header')
  await expect(header.getByRole('heading', { name: title, exact: true })).toHaveText(title)
  await expect(header.getByRole('textbox', { name: '搜索管理通讯录', exact: true })).toBeVisible()
  await expect(header.getByRole('button', { name: '关闭通讯录管理', exact: true })).toBeVisible()
  await expect.poll(() => header.evaluate(element => {
    const title = element.querySelector<HTMLElement>('[data-slot=dialog-title]')!
    const heading = title.getBoundingClientRect(), search = element.querySelector('[data-slot=input-group]')!.getBoundingClientRect()
    const close = element.querySelector('[aria-label="关闭通讯录管理"]')!.getBoundingClientRect(), bounds = element.getBoundingClientRect()
    const inside = (box: DOMRect) => box.width > 0 && box.height > 0 && box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1
    return {
      titleReadable: inside(heading) && title.scrollWidth <= title.clientWidth,
      searchContained: inside(search), closeContained: inside(close),
      wideTitleBeforeSearch: innerWidth <= 760 || heading.right <= search.left + 1,
    }
  })).toEqual({ titleReadable: true, searchContained: true, closeContained: true, wideTitleBeforeSearch: true })
}
async function openContactManager(runtime: Desktop) {
  const list = removalList(runtime)
  await expect(list.getByRole('button', { name: '通讯录管理', exact: true })).toHaveCount(0)
  await list.getByRole('button', { name: '新建', exact: true }).click()
  const menu = runtime.page.getByRole('menu')
  const entry = menu.getByRole('menuitem', { name: '通讯录管理', exact: true })
  await expect(entry).toBeVisible()
  await expect(entry).toBeEnabled()
  await entry.click()
  await expect(menu).toBeHidden()
  await expect(managerDialog(runtime)).toBeVisible()
  await expect.poll(() => managerDialog(runtime).evaluate(element => {
    const sidebar = element.querySelector('.contact-manager-sidebar')!.getBoundingClientRect()
    const tableArea = element.querySelector('.contact-manager-main')!.getBoundingClientRect()
    return tableArea.x >= sidebar.right - 1 && Math.abs(tableArea.y - sidebar.y) < 1
  })).toBe(true)
  await expect.poll(() => managerDialog(runtime).evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return bounds.width <= 940 && bounds.height <= 600 && bounds.width <= innerWidth - 24 && bounds.height <= innerHeight - 32
  })).toBe(true)
  await expectContactManagerHeader(runtime, '通讯录管理')
  for (const name of ['Agent 权限', '标签']) await expect(managerFilter(runtime, name)).toHaveAttribute('aria-expanded', 'false')
  await expect(managerFilter(runtime, '禁止运行命令')).toBeHidden()
  await expect(managerFilter(runtime, '无标签')).toBeHidden()
  await expect(managerDialog(runtime).locator('.contact-manager-toolbar')).toHaveCount(0)
  await expect(managerDialog(runtime).getByRole('button', { name: /^(添加 Agent|新建 Agent)$/ })).toHaveCount(0)
  await managerFilter(runtime, '标签').click()
  await expect(managerFilter(runtime, '标签')).toHaveAttribute('aria-expanded', 'true')
  await expect(managerFilter(runtime, '新建标签')).not.toHaveAttribute('data-variant', 'ghost')
  await expect(managerFilter(runtime, '新建标签')).not.toHaveClass(/soft-button-ghost/)
}
async function manageTag(runtime: Desktop, name: string, action: '重命名标签' | '删除标签') {
  await managerTag(runtime, name).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: action, exact: true }).click()
}
async function createTag(runtime: Desktop, name: string) {
  await managerFilter(runtime, '新建标签').click()
  const input = managerDialog(runtime).getByRole('textbox', { name: '标签名称', exact: true })
  await expect(runtime.page.getByRole('dialog', { name: '新建标签', exact: true })).toHaveCount(0)
  await input.fill(name)
  await managerDialog(runtime).getByRole('button', { name: '保存新标签', exact: true }).click()
  await expect(input).toBeHidden()
  await expect(managerTag(runtime, name)).toBeVisible()
  return (await contactPreferences(runtime)).categories.find(tag => tag.name === name)!.id
}
async function observeContactTagUpdate(runtime: Desktop) {
  await runtime.page.evaluate(() => {
    const selectors = ['.app-shell', '.contacts-page', '.contact-manager', '.contact-manager-table-scroll', '.contact-manager-table-scroll [data-slot=table-container]', '.contacts-detail', '.contact-document', '.contact-tag-assignment[data-open]']
    const elements = selectors.flatMap(selector => { const element = document.querySelector<HTMLElement>(selector); return element ? [{ selector, element }] : [] })
    const scrolls = ['.contact-manager-table-scroll', '.contact-manager-table-scroll [data-slot=table-container]'].map(selector => document.querySelector<HTMLElement>(selector)!)
    for (const scroll of scrolls) scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth
    const position = scrolls.map(scroll => ({ left: scroll.scrollLeft, top: scroll.scrollTop })), removed = new Set<string>()
    let loading = false
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.removedNodes) for (const { selector, element } of elements) if (node === element || node.contains(element)) removed.add(selector)
        for (const node of record.addedNodes) if (node instanceof Element && (node.matches('.inline-loading') || node.querySelector('.inline-loading'))) loading = true
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    Object.assign(window, { __boaiContactTagView: { inspect: () => ({
      retained: elements.every(({ selector, element }) => element.isConnected && document.querySelector(selector) === element),
      removed: [...removed], loading, position, current: scrolls.map(scroll => ({ left: scroll.scrollLeft, top: scroll.scrollTop })),
      title: document.querySelector('.contacts-detail h1')?.textContent ?? '',
    }), dispose: () => observer.disconnect() } })
  })
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const requests: string[] = []
    Object.assign(globalThis, { __boaiContactTagRequests: { requests, dispose: () => { ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) } } })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => { requests.push(payload.method); return original(event, payload) })
  })
  const title = await runtime.page.locator('.contacts-detail h1').allTextContents()
  const dispose = async () => {
    await runtime.page.evaluate(() => (window as typeof window & { __boaiContactTagView: { dispose(): void } }).__boaiContactTagView.dispose())
    await runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiContactTagRequests: { dispose(): void } }).__boaiContactTagRequests.dispose())
  }
  const verify = async () => {
    // Global changed events used a 100 ms refresh timer; inspect beyond that boundary.
    await runtime.page.waitForTimeout(180)
    const view = await runtime.page.evaluate(() => {
      const probe = (window as typeof window & { __boaiContactTagView: { inspect(): { retained: boolean; removed: string[]; loading: boolean; position: { left: number; top: number }[]; current: { left: number; top: number }[]; title: string }; dispose(): void } }).__boaiContactTagView
      const result = probe.inspect(); probe.dispose(); return result
    })
    const requests = await runtime.app.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { __boaiContactTagRequests: { requests: string[]; dispose(): void } }).__boaiContactTagRequests
      probe.dispose(); return probe.requests
    })
    expect(view.retained).toBe(true)
    expect(view.removed).toEqual([])
    expect(view.loading).toBe(false)
    expect(view.current).toEqual(view.position)
    expect(view.title).toBe(title[0] ?? '')
    expect(requests.filter(method => ['snapshot', 'getConversationView', 'getProfileActivity', 'listInbox'].includes(method))).toEqual([])
  }
  return { verify, dispose }
}
async function holdContactTagCommit(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const gate = { entered: false, release, dispose: () => {
      release()
      ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original)
    } }
    Object.assign(globalThis, { __boaiContactTagCommit: gate })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'updateContactList' && payload.input.action.kind === 'set-agent-tags') {
        gate.entered = true
        await pending
      }
      return original(event, payload)
    })
  })
  return {
    entered: () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiContactTagCommit: { entered: boolean } }).__boaiContactTagCommit.entered),
    release: () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiContactTagCommit: { release(): void } }).__boaiContactTagCommit.release()),
    dispose: () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiContactTagCommit: { dispose(): void } }).__boaiContactTagCommit.dispose()),
  }
}
async function contactManagerReadingSurface(runtime: Desktop) {
  return managerDialog(runtime).evaluate(element => {
    const filters = [...element.querySelectorAll<HTMLElement>('.contact-manager-menu')].filter(control => control.getClientRects().length)
    const search = element.querySelector<HTMLElement>('[aria-label="搜索管理通讯录"]')!
    const tagSearch = document.querySelector<HTMLElement>('.contact-tag-assignment[data-open] [aria-label="搜索标签"]')!
    const unselected = [...element.querySelectorAll<HTMLElement>('tr[aria-selected="false"]')]
    const selectionBrowsing = [...element.querySelectorAll<HTMLElement>('.contact-manager-selection button')].filter(control => control.getAttribute('aria-label')?.startsWith('查看已选择的 ') || control.textContent?.trim() === '取消选择')
    const writeLocks = [...element.querySelectorAll<HTMLElement>('button')].filter(control => control.getAttribute('aria-label') === '关闭通讯录管理' || ['设置标签', '删除'].includes(control.textContent?.trim() ?? ''))
    const controls = [...filters, search, tagSearch, ...unselected.flatMap(row => [row, row.querySelector<HTMLElement>('[data-slot=checkbox]')!]), ...selectionBrowsing, ...writeLocks]
    return controls.map(control => {
      const style = getComputedStyle(control), bounds = control.getBoundingClientRect()
      const surface = control.closest('.contact-tag-assignment') ?? element
      let opacity = 1
      for (let parent: HTMLElement | null = control; parent && surface.contains(parent); parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity)
      return {
        name: control.getAttribute('aria-label') ?? control.textContent?.trim(),
        writeLock: writeLocks.includes(control),
        disabled: control.matches(':disabled') || control.hasAttribute('data-disabled') || control.getAttribute('aria-disabled') === 'true',
        color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, opacity,
        bounds: [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Math.round(value * 10) / 10),
      }
    })
  })
}
async function setSelectedTag(runtime: Desktop, names: string[], tagName: string, checked: boolean, inspectPending = false) {
  await managerFilter(runtime, '全部').click()
  if (inspectPending) {
    const permissions = managerFilter(runtime, 'Agent 权限')
    if (await permissions.getAttribute('aria-expanded') !== 'true') await permissions.click()
    const unavailable = managerDialog(runtime).getByRole('button', { name: /^完全访问/ })
    await expect(unavailable).toBeVisible()
    await expect(unavailable).toBeDisabled()
    await expect(unavailable).toHaveCSS('opacity', '0.5')
  }
  const before = await contactPreferences(runtime)
  const agents = (await removalSnapshot(runtime)).agents, ids = agents.filter(agent => names.includes(agent.name)).map(agent => agent.id)
  expect(ids).toHaveLength(names.length)
  const tagId = before.categories.find(tag => tag.name === tagName)!.id
  for (const name of names) { await managerSelection(runtime, name).check(); await expect(managerSelection(runtime, name)).toBeChecked() }
  await managerDialog(runtime).getByRole('button', { name: '设置标签', exact: true }).click()
  const panel = runtime.page.locator('.contact-tag-assignment[data-open]')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('combobox')).toHaveCount(0)
  await expect(panel.getByRole('heading')).toHaveCount(0)
  await expect(panel.getByRole('button')).toHaveCount(0)
  const input = panel.getByRole('textbox', { name: '搜索标签', exact: true })
  await input.fill(tagName)
  await expect(panel.getByRole('checkbox')).toHaveCount(1)
  const checkbox = panel.locator(`[data-slot="checkbox"][aria-label="标签 ${tagName}"]`)
  const matches = ids.filter(id => contactTagIds(before, id).includes(tagId)).length
  await expect(checkbox).toHaveAttribute('aria-checked', matches === ids.length ? 'true' : matches ? 'mixed' : 'false')
  await checkbox.focus()
  const localUpdate = await observeContactTagUpdate(runtime)
  try {
    const gate = inspectPending ? await holdContactTagCommit(runtime) : undefined
    try {
      if (inspectPending) await runtime.page.waitForTimeout(220)
      const beforeSurface = inspectPending ? await contactManagerReadingSurface(runtime) : undefined
      const mode = checked ? 'add' : 'remove'
      if (inspectPending) await runtime.page.screenshot({ path: test.info().outputPath(`contact-tag-commit-${mode}-before.png`), animations: 'disabled' })
      await runtime.page.keyboard.press('Space')
      if (gate) {
        await expect.poll(gate.entered).toBe(true)
        // Let disabled-opacity transitions settle while the actual host transaction is held.
        await runtime.page.waitForTimeout(220)
        const pendingSurface = await contactManagerReadingSurface(runtime)
        await runtime.page.screenshot({ path: test.info().outputPath(`contact-tag-commit-${mode}-in-flight.png`), animations: 'disabled' })
        await writeFile(test.info().outputPath(`contact-tag-commit-${mode}-surface.json`), JSON.stringify({ mode, before: beforeSurface, pending: pendingSurface }, null, 2))
        const comparable = (surface: typeof pendingSurface) => surface.map(({ disabled, ...control }) => control.writeLock ? control : { ...control, disabled })
        expect(comparable(pendingSurface), '标签提交不能使浏览区域、设置标签/删除/关闭按钮变灰或移动').toEqual(comparable(beforeSurface!))
        await expect(managerDialog(runtime).getByRole('button', { name: '设置标签', exact: true })).toBeDisabled()
        await expect(managerDialog(runtime).getByRole('button', { name: '删除', exact: true })).toBeDisabled()
        await expect(managerDialog(runtime).getByRole('button', { name: '关闭通讯录管理', exact: true })).toBeDisabled()
        await expect(checkbox).toBeDisabled()
        await gate.release()
      }
    } finally { await gate?.dispose() }
    await expect.poll(async () => (await contactPreferences(runtime)).revision).toBe(before.revision + 1)
    await expect(checkbox).toHaveAttribute('aria-checked', String(checked))
    const after = await contactPreferences(runtime)
    expect(after.categories).toEqual(before.categories)
    expect(after.agentOrder).toEqual(before.agentOrder)
    for (const agent of agents) {
      const previous = contactTagIds(before, agent.id)
      const expected = ids.includes(agent.id) ? checked ? [...new Set([...previous, tagId])] : previous.filter(id => id !== tagId) : previous
      expect([...contactTagIds(after, agent.id)].sort()).toEqual([...expected].sort())
    }
    await expect(panel).toBeVisible()
    for (const name of names) await expect(managerSelection(runtime, name)).toBeChecked()
    await expect(checkbox).toBeEnabled()
    await localUpdate.verify()
    await runtime.page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
  } finally { await localUpdate.dispose() }
}
async function dragFlatContact(runtime: Desktop, from: Locator, to: Locator) {
  const source = (await from.boundingBox())!, target = (await to.boundingBox())!
  await runtime.page.mouse.move(source.x + 80, source.y + source.height / 2)
  await runtime.page.mouse.down()
  await runtime.page.mouse.move(target.x + 80, target.y + 4, { steps: 10 })
  await runtime.page.mouse.move(target.x + 81, target.y + 4)
  await expect(removalList(runtime).locator('[data-drop=before]')).toBeVisible()
  await expect(from).toHaveClass(/drag-list-dragging/)
  await runtime.page.mouse.up()
  await expect(removalList(runtime).locator('[data-drop]')).toHaveCount(0)
}
const removalMenu = async (runtime: Desktop, name: string, action: string) => {
  await removalList(runtime).getByRole('button', { name, exact: true }).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: action, exact: true }).click()
}
const expectMissingConversation = async (runtime: Desktop, id: string) => {
  expect(await runtime.page.evaluate(async id => {
    try { await window.boai.request('getConversation', { id }); return false } catch { return true }
  }, id)).toBe(true)
}

async function prepareContactRemoval(runtime: Desktop) {
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  const data = await runtime.page.evaluate(async () => {
    const group = await window.boai.request('createConversation', { kind: 'group', title: '通讯录清理验收群', agentIds: ['researcher', 'writer', 'reviewer'] })
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '研究员独立历史', agentIds: ['researcher'] })
    const writerDirect = await window.boai.request('createConversation', { kind: 'direct', title: '写手独立历史', agentIds: ['writer'] })
    for (const [conversation, text] of [[group, '其他群成员仍可阅读的历史'], [direct, '研究员独立聊天记录'], [writerDirect, '写手独立聊天记录']] as const) {
      await window.boai.request('sendMessage', { conversationId: conversation.id, content: text, mentionIds: [], requestId: `contact-removal-${conversation.id}` })
    }
    const researcherHome = await window.boai.request('getAgentHome', { agentId: 'researcher' })
    const writerHome = await window.boai.request('getAgentHome', { agentId: 'writer' })
    return { group, direct, writerDirect, researcherHome, writerHome }
  })
  const files = {
    group: join(data.group.workspacePath, '群聊专属文件.txt'),
    researcher: join(data.researcherHome.workspacePath, '研究员独立文件.txt'),
    writer: join(data.writerHome.workspacePath, '写手独立文件.txt'),
  }
  for (const [kind, file] of Object.entries(files)) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `保留边界：${kind}`)
  }
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(removalList(runtime).getByRole('button', { name: data.group.title, exact: true })).toBeVisible()
  return { ...data, files }
}

async function prepareLegacyContactTags(runtime: Desktop) {
  const setup = await runtime.page.evaluate(async () => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const writer = snapshot.agents.find(agent => agent.id === 'writer')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, creationSource, systemRole, ...input } = writer
    await window.boai.request('saveAgent', { ...input, expectedConfigVersion: configVersion, allowCommands: true })
    let value = await window.boai.request('getContactList', undefined)
    value = await window.boai.request('updateContactList', { expectedRevision: value.revision, action: { kind: 'create-category', name: '原内容团队' } })
    const tagId = value.categories[0].id
    for (const agentId of ['researcher', 'writer']) value = await window.boai.request('updateContactList', { expectedRevision: value.revision, action: { kind: 'assign-category', agentId, categoryId: tagId } })
    const emptyGroup = await window.boai.request('createConversation', { kind: 'group', title: '仅含所选员工的群', agentIds: ['researcher', 'writer'] })
    await window.boai.request('sendMessage', { conversationId: emptyGroup.id, content: '空群清理也必须保留明确删除边界', mentionIds: [], requestId: `contact-bulk-${emptyGroup.id}` })
    return { value, tagId, emptyGroup, reviewerName: snapshot.agents.find(agent => agent.id === 'reviewer')!.name, dataPath: snapshot.dataPath }
  })
  const emptyFile = join(setup.emptyGroup.workspacePath, '空群独立文件.txt')
  await mkdir(dirname(emptyFile), { recursive: true })
  await writeFile(emptyFile, '批量删除仅含所选员工的群清理边界')
  await runtime.close()
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  const { tagIdsByAgentId, ...legacy } = setup.value
  try { await store.write([{ collection: 'contactList', id: 'contacts', value: legacy }]) } finally { await store.close() }
  await runtime.start()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  expect((await contactPreferences(runtime)).tagIdsByAgentId).toBeUndefined()
  return { ...setup, emptyFile }
}

Given('通讯录具有可清理的群聊和员工独立记录', async ({ runtime, scenario }) => {
  scenario.removal = await prepareContactRemoval(runtime)
})

Then('员工默认启用且资料和配置不展示启用标签', async ({ runtime }) => {
  const detail = removalDetail(runtime)
  await removalList(runtime).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(detail.getByText(/^(已启用|已停用)$/)).toHaveCount(0)
  await detail.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(detail.getByText('启用员工', { exact: true })).toHaveCount(0)
  await expect(detail.getByText(/^(已启用|已停用)$/)).toHaveCount(0)
  await detail.getByRole('textbox', { name: '职责简介' }).fill('员工始终可参与新交流')
  await detail.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  expect((await removalSnapshot(runtime)).agents.find(agent => agent.id === 'researcher')?.active).toBe(true)
})

When('在群配置取消解散后再确认丢弃草稿并解散', async ({ runtime, scenario }) => {
  const { group, files } = scenario.removal!, detail = removalDetail(runtime), page = runtime.page
  await removalList(runtime).getByRole('button', { name: group.title, exact: true }).click()
  await detail.getByRole('button', { name: '编辑配置', exact: true }).click()
  await detail.getByRole('textbox', { name: '群聊名称' }).fill('这份群配置草稿会丢弃')
  await detail.getByRole('button', { name: '解散群聊', exact: true }).click()
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toContainText('群内员工及各自工作区保留')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(detail.getByRole('textbox', { name: '群聊名称' })).toHaveValue('这份群配置草稿会丢弃')
  expect((await removalSnapshot(runtime)).conversations.find(item => item.id === group.id)?.title).toBe(group.title)
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  await detail.getByRole('button', { name: '解散群聊', exact: true }).click()
  await confirmation.getByRole('button', { name: '确认解散', exact: true }).click()
  await expect(removalList(runtime).getByRole('button', { name: group.title, exact: true })).toHaveCount(0)
  await expect(detail.getByRole('textbox', { name: '群聊名称' })).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

Then('群聊和专属文件消失但员工私聊及工作区保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect(state.conversations.some(item => item.id === group.id)).toBe(false)
  await expectMissingConversation(runtime, group.id)
  await expect(readFile(files.group)).rejects.toMatchObject({ code: 'ENOENT' })
  for (const id of ['researcher', 'writer', 'reviewer']) expect(state.agents.some(agent => agent.id === id)).toBe(true)
  for (const [conversation, text] of [[direct, '研究员独立聊天记录'], [writerDirect, '写手独立聊天记录']] as const) {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    expect(detail.messages.some(message => message.content === text)).toBe(true)
  }
  expect(await readFile(files.researcher, 'utf8')).toBe('保留边界：researcher')
  expect(await readFile(files.writer, 'utf8')).toBe('保留边界：writer')
})

Then('重启后群聊解散结果仍然保留', async ({ runtime, scenario }) => {
  await runtime.restart()
  const state = await removalSnapshot(runtime), { group, direct, writerDirect, files } = scenario.removal!
  expect(state.conversations.map(item => item.id).sort()).toEqual([direct.id, writerDirect.id].sort())
  await expectMissingConversation(runtime, group.id)
  expect(state.agents.filter(agent => agent.systemRole !== 'core')).toHaveLength(3)
  await expect(readFile(files.group)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(files.researcher, 'utf8')).toBe('保留边界：researcher')
  expect(runtime.errors).toEqual([])
})

When('通过员工右键菜单取消删除后再确认删除', async ({ runtime, scenario }) => {
  const { direct, files } = scenario.removal!, page = runtime.page
  await removalList(runtime).getByRole('button', { name: '研究员', exact: true }).click()
  await removalMenu(runtime, '研究员', '删除员工')
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toContainText('工作区')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  expect((await removalSnapshot(runtime)).agents.some(agent => agent.id === 'researcher')).toBe(true)
  expect((await page.evaluate(id => window.boai.request('getConversation', { id }), direct.id)).messages.some(message => message.content === '研究员独立聊天记录')).toBe(true)
  expect(await readFile(files.researcher, 'utf8')).toBe('保留边界：researcher')
  await removalMenu(runtime, '研究员', '删除员工')
  await confirmation.getByRole('button', { name: '删除员工', exact: true }).click()
  await expect(removalList(runtime).getByRole('button', { name: '研究员', exact: true })).toHaveCount(0)
  await expect(removalDetail(runtime).getByRole('heading', { name: '研究员', exact: true })).toHaveCount(0)
})

Then('员工和单聊及工作区消失但其他群成员和历史保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect(state.agents.some(agent => agent.id === 'researcher')).toBe(false)
  expect(state.conversations.some(item => item.id === direct.id)).toBe(false)
  await expectMissingConversation(runtime, direct.id)
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(state.conversations.find(item => item.id === group.id)?.agentIds).toEqual(['writer', 'reviewer'])
  const history = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(history.messages.some(message => message.content === '其他群成员仍可阅读的历史')).toBe(true)
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), writerDirect.id)).messages.some(message => message.content === '写手独立聊天记录')).toBe(true)
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  expect(await readFile(files.writer, 'utf8')).toBe('保留边界：writer')
})

Then('重启后员工删除结果仍然保留且核心助手不可删除', async ({ runtime, scenario }) => {
  await runtime.restart()
  const state = await removalSnapshot(runtime), { group, direct, files } = scenario.removal!
  expect(state.agents.some(agent => agent.id === 'researcher')).toBe(false)
  expect(state.conversations.find(item => item.id === group.id)?.agentIds).toEqual(['writer', 'reviewer'])
  await expectMissingConversation(runtime, direct.id)
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  const core = state.agents.find(agent => agent.id === 'bobo' && agent.systemRole === 'core')!
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await removalList(runtime).getByRole('button', { name: core.name, exact: true }).click({ button: 'right' })
  await expect(runtime.page.getByRole('menuitem', { name: '删除员工', exact: true })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
  expect(runtime.errors).toEqual([])
})

Given('旧通讯录分类成员具有独立聊天和工作区', async ({ runtime, scenario }) => {
  scenario.removal = await prepareContactRemoval(runtime)
  scenario.management = await prepareLegacyContactTags(runtime)
})

Then('旧分类作为标签恢复且主列表排序跨标签统一', async ({ runtime, scenario }) => {
  const { tagId, reviewerName } = scenario.management!
  for (let launch = 0; launch < 2; launch++) {
    if (launch) {
      await runtime.restart()
      await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
    }
    const value = await contactPreferences(runtime), list = removalList(runtime), people = list.getByRole('group', { name: '联系人', exact: true })
    expect(value.tagIdsByAgentId).toBeUndefined()
    for (const id of ['researcher', 'writer']) expect(contactTagIds(value, id)).toEqual([tagId])
    expect(contactTagIds(value, 'reviewer')).toEqual([])
    await expectFlatContacts(list)
    await expect(people.locator('.conversation-item')).toHaveCount(3)
    await openContactManager(runtime)
    await expect(managerTag(runtime, '原内容团队').locator('.contacts-count')).toHaveText('2')
    await expect(managerFilter(runtime, '无标签').locator('.contacts-count')).toHaveText('1')
    await expect(managerDialog(runtime).getByRole('checkbox', { name: /^选择 / })).toHaveCount(3)
    await expect(managerSelection(runtime, 'bobo')).toHaveCount(0)
    await managerFilter(runtime, '关闭通讯录管理').click()
  }
  const before = await contactPreferences(runtime), people = removalList(runtime).getByRole('group', { name: '联系人', exact: true })
  const previous = await people.locator('.conversation-item').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')!))
  const order = previous.filter(name => name !== '研究员'); order.splice(order.indexOf(reviewerName), 0, '研究员')
  await dragFlatContact(runtime, people.getByRole('button', { name: '研究员', exact: true }), people.getByRole('button', { name: reviewerName, exact: true }))
  await expect(runtime.page.getByRole('alertdialog')).toBeHidden()
  await expect.poll(() => people.locator('.conversation-item').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')!))).toEqual(order)
  const saved = await contactPreferences(runtime)
  expect(saved.revision).toBe(before.revision + 1)
  expect(saved.categories).toEqual(before.categories)
  expect(saved.categoryByAgentId).toEqual(before.categoryByAgentId)
  expect(contactTagIds(saved, 'reviewer')).toEqual([])
  await runtime.restart()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  expect(await contactPreferences(runtime)).toEqual(saved)
  await expect.poll(() => removalList(runtime).getByRole('group', { name: '联系人', exact: true }).locator('.conversation-item').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')!))).toEqual(order)
})

When('管理标签权限与搜索筛选清空选择并保留当前资料', async ({ runtime, scenario }) => {
  const { reviewerName } = scenario.management!
  await removalList(runtime).getByRole('button', { name: '研究员', exact: true }).click()
  await openContactManager(runtime)
  const manager = managerDialog(runtime), search = manager.getByRole('textbox', { name: '搜索管理通讯录', exact: true })
  await managerTag(runtime, '原内容团队').click()
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(2)
  await expect(managerSelection(runtime, reviewerName)).toHaveCount(0)
  await manager.getByRole('row').filter({ hasText: '研究员' }).click()
  await expect(managerSelection(runtime, '研究员')).toBeChecked()
  const panel = manager.locator('.contact-manager-selection[aria-label="批量操作"]')
  await expect(panel).toContainText('已选择 1 人')
  await expect(panel.getByRole('button', { name: '编辑配置', exact: true })).toHaveCount(0)
  await expect.poll(() => panel.evaluate(element => {
    const quantity = element.querySelector<HTMLElement>('.text-primary')!, label = quantity.parentElement!
    const cancel = [...element.querySelectorAll('button')].find(button => button.textContent === '取消选择')!
    return { quantity: quantity.textContent?.trim(), normalLabel: [...label.childNodes].filter(node => node !== quantity).map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(), quantityHighlighted: getComputedStyle(quantity).color !== getComputedStyle(label).color, cancelHighlighted: getComputedStyle(cancel).color === getComputedStyle(quantity).color }
  })).toEqual({ quantity: '1', normalLabel: '已选择 人', quantityHighlighted: true, cancelHighlighted: true })
  const beforeViewing = await contactPreferences(runtime)
  await panel.getByRole('button', { name: '查看已选择的 1 人', exact: true }).click()
  const selectedList = runtime.page.locator('.contact-manager-selected-list[data-open]')
  await expect(selectedList).toHaveAttribute('aria-label', '已选 Agent')
  await expect(selectedList.getByRole('listitem')).toHaveCount(1)
  await expect(selectedList.getByRole('listitem')).toContainText('研究员')
  await expect(selectedList.getByRole('checkbox')).toHaveCount(0)
  await expect(selectedList.getByRole('button')).toHaveCount(0)
  await expect.poll(() => selectedList.evaluate(element => {
    const row = element.querySelector('[role=listitem]')!, avatar = row.querySelector('.avatar')!
    return { compactWidth: element.getBoundingClientRect().width <= 260, compactRow: row.getBoundingClientRect().height <= 48, compactAvatar: avatar.getBoundingClientRect().height <= 28 }
  })).toEqual({ compactWidth: true, compactRow: true, compactAvatar: true })
  expect(await contactPreferences(runtime)).toEqual(beforeViewing)
  await runtime.page.screenshot({ path: test.info().outputPath('contact-manager-selected-list.png'), animations: 'disabled' })
  await runtime.page.keyboard.press('Escape')
  await expect(selectedList).toBeHidden()
  await expect(managerSelection(runtime, '研究员')).toBeChecked()
  for (const mode of ['light', 'dark'] as const) {
    await runtime.page.evaluate(async mode => {
      const appearance = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: appearance.revision })
    }, mode)
    await runtime.page.waitForFunction(mode => document.documentElement.dataset.theme === mode, mode)
    await expect(panel.getByRole('button', { name: '设置标签', exact: true })).toBeVisible()
    await expect.poll(() => panel.evaluate(element => {
      const bounds = element.getBoundingClientRect(), dialog = element.closest('.contact-manager')!.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0 && bounds.left >= dialog.left && bounds.right <= dialog.right && bounds.bottom <= dialog.bottom + 1
    })).toBe(true)
    await expectContactManagerHeader(runtime, '原内容团队')
    await runtime.page.screenshot({ path: test.info().outputPath(`contact-manager-${mode}-selection.png`), animations: 'disabled' })
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 688))
    await runtime.page.waitForFunction(() => innerWidth === 760)
    const control = panel.getByRole('button', { name: '设置标签', exact: true })
    await expect(control).toBeVisible()
    const bounds = (await control.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(760)
    await expectContactManagerHeader(runtime, '原内容团队')
    await runtime.page.screenshot({ path: test.info().outputPath(`contact-manager-${mode}-narrow-selection.png`), animations: 'disabled' })
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1247, 860))
    await runtime.page.waitForFunction(() => innerWidth === 1247)
  }
  await search.fill('写手')
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(1)
  await expect(managerSelection(runtime, '写手')).not.toBeChecked()
  await expect(panel).toHaveCount(0)
  await managerSelection(runtime, '写手').check()
  await managerFilter(runtime, '无标签').click()
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(0)
  await expect(panel).toHaveCount(0)
  await search.fill('')
  await expect(managerSelection(runtime, reviewerName)).toBeVisible()
  await managerFilter(runtime, '全部').click()
  await managerFilter(runtime, 'Agent 权限').click()
  await expect(manager.getByRole('button', { name: /^完全访问/ })).toBeDisabled()
  await managerFilter(runtime, '请求批准').click()
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(1)
  await expect(managerSelection(runtime, '写手')).toBeVisible()
  await managerFilter(runtime, '禁止运行命令').click()
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(2)
  await expect(managerSelection(runtime, '写手')).toHaveCount(0)
  await managerFilter(runtime, '外部 Agent 管理').click()
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(0)
  await managerFilter(runtime, '全部').click()
  await search.fill('原内容团队')
  await expect(manager.getByRole('checkbox', { name: /^选择 / })).toHaveCount(2)
  await search.fill('')
  await managerFilter(runtime, '标签').click()
  await expect(managerTag(runtime, '原内容团队')).toBeHidden()
  await managerFilter(runtime, '标签').click()
  await expect(managerTag(runtime, '原内容团队')).toBeVisible()
  await managerFilter(runtime, '关闭通讯录管理').click()
  await expect(removalDetail(runtime).getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
})

When('标签行内新建与即时勾选只作用明确所选员工且保留页面状态', async ({ runtime, scenario }) => {
  const { tagId, reviewerName } = scenario.management!
  await openContactManager(runtime)
  const beforeCreating = await contactPreferences(runtime)
  await managerFilter(runtime, '新建标签').click()
  const draft = managerDialog(runtime).getByRole('textbox', { name: '标签名称', exact: true })
  await draft.fill('取消后不应创建')
  await managerDialog(runtime).getByRole('button', { name: '取消新建标签', exact: true }).click()
  await expect(draft).toBeHidden()
  expect(await contactPreferences(runtime)).toEqual(beforeCreating)
  const newTagId = await createTag(runtime, '协作标签')
  await manageTag(runtime, '协作标签', '重命名标签')
  const rename = runtime.page.getByRole('dialog', { name: '重命名标签', exact: true })
  await rename.getByRole('textbox', { name: '标签名称', exact: true }).fill('共同标签')
  await rename.getByRole('button', { name: '保存标签', exact: true }).click()
  await expect(managerTag(runtime, '共同标签')).toBeVisible()
  await expect(managerTag(runtime, '协作标签')).toHaveCount(0)
  expect((await contactPreferences(runtime)).categories.find(tag => tag.id === newTagId)?.name).toBe('共同标签')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 688))
  await runtime.page.waitForFunction(() => innerWidth === 760)
  await setSelectedTag(runtime, [reviewerName], '共同标签', true, true)
  const tableScroll = managerDialog(runtime).locator('.contact-manager-table-scroll [data-slot=table-container]')
  await expect(tableScroll).toHaveJSProperty('scrollLeft', await tableScroll.evaluate(element => element.scrollWidth - element.clientWidth))
  expect(await tableScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1247, 860))
  await runtime.page.waitForFunction(() => innerWidth === 1247)
  await setSelectedTag(runtime, ['写手'], '共同标签', true)
  // One selected employee already has the tag: mixed must append to both without replacing their other tags.
  await setSelectedTag(runtime, ['研究员', '写手'], '共同标签', true)
  let saved = await contactPreferences(runtime)
  for (const id of ['researcher', 'writer']) expect(contactTagIds(saved, id)).toEqual([tagId, newTagId])
  expect(contactTagIds(saved, 'reviewer')).toEqual([newTagId])
  await setSelectedTag(runtime, ['研究员', '写手'], '原内容团队', false, true)
  saved = await contactPreferences(runtime)
  for (const id of ['researcher', 'writer', 'reviewer']) expect(contactTagIds(saved, id)).toEqual([newTagId])
  await setSelectedTag(runtime, ['研究员', '写手'], '原内容团队', true)
  await setSelectedTag(runtime, ['研究员', '写手'], '共同标签', false)
  saved = await contactPreferences(runtime)
  for (const id of ['researcher', 'writer']) expect(contactTagIds(saved, id)).toEqual([tagId])
  expect(contactTagIds(saved, 'reviewer')).toEqual([newTagId])
  await managerFilter(runtime, '关闭通讯录管理').click()
  await expectFlatContacts(removalList(runtime))
  await runtime.restart()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  expect(await contactPreferences(runtime)).toEqual(saved)
  await openContactManager(runtime)
  await expect(managerTag(runtime, '原内容团队').locator('.contacts-count')).toHaveText('2')
  await expect(managerTag(runtime, '共同标签').locator('.contacts-count')).toHaveText('1')
})

When('删除标签取消不写入且确认仅解绑保留员工', async ({ runtime }) => {
  const before = await contactPreferences(runtime), snapshot = await removalSnapshot(runtime)
  await manageTag(runtime, '原内容团队', '删除标签')
  const confirmation = runtime.page.getByRole('alertdialog', { name: '删除标签？', exact: true })
  await expect(confirmation).toContainText('员工及聊天记录保留')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  expect(await contactPreferences(runtime)).toEqual(before)
  for (const name of ['原内容团队', '共同标签']) {
    await manageTag(runtime, name, '删除标签')
    await confirmation.getByRole('button', { name: '删除标签', exact: true }).click()
    await expect(managerTag(runtime, name)).toHaveCount(0)
  }
  expect((await removalSnapshot(runtime)).agents).toEqual(snapshot.agents)
  const saved = await contactPreferences(runtime)
  for (const id of ['researcher', 'writer', 'reviewer']) expect(contactTagIds(saved, id)).toEqual([])
  await managerFilter(runtime, '关闭通讯录管理').click()
})

Then('原标签消失但员工和聊天及工作区都保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect((await contactPreferences(runtime)).categories).toEqual([])
  await expectFlatContacts(removalList(runtime))
  for (const id of ['researcher', 'writer', 'reviewer']) expect(state.agents.some(agent => agent.id === id)).toBe(true)
  expect(state.conversations.map(item => item.id).sort()).toEqual([group.id, direct.id, writerDirect.id, scenario.management!.emptyGroup.id].sort())
  for (const conversation of [group, direct, writerDirect]) expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).messages).not.toHaveLength(0)
  for (const [kind, file] of Object.entries(files)) expect(await readFile(file, 'utf8')).toBe(`保留边界：${kind}`)
  expect(await readFile(scenario.management!.emptyFile, 'utf8')).toBe('批量删除仅含所选员工的群清理边界')
})

When('筛选后仅删除当前明确选中员工且确认冻结版本', async ({ runtime }) => {
  await openContactManager(runtime)
  const tagId = await createTag(runtime, '待删除员工')
  await setSelectedTag(runtime, ['研究员', '写手'], '待删除员工', true)
  await managerTag(runtime, '待删除员工').click()
  const manager = managerDialog(runtime), search = manager.getByRole('textbox', { name: '搜索管理通讯录', exact: true }), selected = manager.locator('.contact-manager-selection[aria-label="批量操作"]')
  await search.fill('研究')
  await manager.getByRole('checkbox', { name: '全选当前结果', exact: true }).check()
  await expect(managerSelection(runtime, '研究员')).toBeChecked()
  await expect(selected).toContainText('已选择 1 人')
  await search.fill('')
  await expect(selected).toHaveCount(0)
  await expect(managerSelection(runtime, '写手')).not.toBeChecked()
  await manager.getByRole('checkbox', { name: '全选当前结果', exact: true }).check()
  await expect(selected).toContainText('已选择 2 人')
  const before = await contactPreferences(runtime), snapshot = await removalSnapshot(runtime)
  const deleteTrigger = selected.getByRole('button', { name: '删除', exact: true })
  await expect(deleteTrigger).toHaveAttribute('data-variant', 'destructive')
  await deleteTrigger.click()
  const confirmation = runtime.page.locator('.contact-manager-delete-confirm[data-open]')
  await expect(confirmation).toHaveAttribute('aria-label', '删除选中的 Agent')
  await expect(runtime.page.getByRole('alertdialog')).toHaveCount(0)
  await expect(confirmation).toContainText('删除 2 位 Agent')
  for (const name of ['研究员', '写手', '空群自动解散']) await expect(confirmation).toContainText(name)
  await runtime.page.screenshot({ path: test.info().outputPath('contact-manager-delete-confirm.png'), animations: 'disabled' })
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirmation).toBeHidden()
  expect(await contactPreferences(runtime)).toEqual(before)
  expect((await removalSnapshot(runtime)).agents).toEqual(snapshot.agents)
  for (const clear of ['selection', 'filter'] as const) {
    await deleteTrigger.click()
    const previousTrigger = (await deleteTrigger.elementHandle())!
    if (clear === 'selection') await selected.getByRole('button', { name: '取消选择', exact: true }).click()
    else await managerFilter(runtime, '全部').click()
    // Motion may retain the old footer during exit, but its action must already be disabled.
    expect(await previousTrigger.evaluate(element => !element.isConnected || element.matches(':disabled'))).toBe(true)
    await expect(confirmation).toBeHidden()
    await expect(selected).toHaveCount(0)
    expect(await contactPreferences(runtime)).toEqual(before)
    expect((await removalSnapshot(runtime)).agents).toEqual(snapshot.agents)
    if (clear === 'filter') await managerTag(runtime, '待删除员工').click()
    await manager.getByRole('checkbox', { name: '全选当前结果', exact: true }).check()
    await expect(selected).toContainText('已选择 2 人')
  }
  await selected.getByRole('button', { name: '删除', exact: true }).click()
  const changed = await runtime.page.evaluate(async () => {
    const value = await window.boai.request('getContactList', undefined)
    return window.boai.request('updateContactList', { expectedRevision: value.revision, action: { kind: 'create-category', name: '其他窗口新标签' } })
  })
  await expect.poll(async () => (await contactPreferences(runtime)).revision).toBe(changed.revision)
  await expect(managerDialog(runtime).locator('[aria-label="筛选标签 其他窗口新标签"]')).toHaveCount(1)
  await confirmation.getByRole('button', { name: '确认删除 Agent', exact: true }).click()
  await expect(confirmation).toContainText('通讯录已变化')
  expect((await removalSnapshot(runtime)).agents).toEqual(snapshot.agents)
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await manageTag(runtime, '其他窗口新标签', '删除标签')
  await runtime.page.getByRole('alertdialog', { name: '删除标签？', exact: true }).getByRole('button', { name: '删除标签', exact: true }).click()
  // Tag maintenance clears the old selection; select the complete current result again.
  await manager.getByRole('checkbox', { name: '全选当前结果', exact: true }).check()
  await selected.getByRole('button', { name: '删除', exact: true }).click()
  await confirmation.getByRole('button', { name: '确认删除 Agent', exact: true }).click()
  await expect(managerSelection(runtime, '研究员')).toHaveCount(0)
  await expect(managerSelection(runtime, '写手')).toHaveCount(0)
  expect((await contactPreferences(runtime)).categories.some(tag => tag.id === tagId)).toBe(true)
  await expect(managerTag(runtime, '待删除员工').locator('.contacts-count')).toHaveText('0')
  await manageTag(runtime, '待删除员工', '删除标签')
  await runtime.page.getByRole('alertdialog', { name: '删除标签？', exact: true }).getByRole('button', { name: '删除标签', exact: true }).click()
  await managerFilter(runtime, '关闭通讯录管理').click()
})

Then('所选员工及单聊被清空且其他成员的群历史保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect(state.agents.filter(agent => ['researcher', 'writer'].includes(agent.id))).toEqual([])
  expect(state.agents.some(agent => agent.id === 'reviewer')).toBe(true)
  expect(state.agents.some(agent => agent.id === 'bobo' && agent.systemRole === 'core')).toBe(true)
  expect(state.conversations.map(item => item.id)).toEqual([group.id])
  expect(state.conversations[0].agentIds).toEqual(['reviewer'])
  await expectMissingConversation(runtime, direct.id)
  await expectMissingConversation(runtime, writerDirect.id)
  await expectMissingConversation(runtime, scenario.management!.emptyGroup.id)
  const history = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(history.messages.some(message => message.content === '其他群成员仍可阅读的历史')).toBe(true)
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(files.writer)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(scenario.management!.emptyFile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  const preferences = await contactPreferences(runtime)
  expect(preferences.categories).toEqual([])
  expect(preferences.categoryByAgentId).toEqual({})
  expect(preferences.tagIdsByAgentId).not.toHaveProperty('researcher')
  expect(preferences.tagIdsByAgentId).not.toHaveProperty('writer')
})

Then('重启后所选员工删除结果仍然保留', async ({ runtime, scenario }) => {
  await runtime.restart()
  const state = await removalSnapshot(runtime), { group, direct, writerDirect, files } = scenario.removal!
  expect(state.agents.filter(agent => agent.systemRole !== 'core').map(agent => agent.id)).toEqual(['reviewer'])
  expect(state.conversations.map(item => item.id)).toEqual([group.id])
  expect(state.conversations[0].agentIds).toEqual(['reviewer'])
  await expectMissingConversation(runtime, direct.id)
  await expectMissingConversation(runtime, writerDirect.id)
  await expectMissingConversation(runtime, scenario.management!.emptyGroup.id)
  expect((await contactPreferences(runtime)).categories).toEqual([])
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(files.writer)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(scenario.management!.emptyFile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  expect(runtime.errors).toEqual([])
})
