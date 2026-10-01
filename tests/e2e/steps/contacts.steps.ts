/*
 * [INPUT]: 通讯录配置/清理/分类管理的中文场景、Electron fixture、真实产品 IPC 和隔离工作区文件。
 * [OUTPUT]: 配置与会话复用、固定启用隐藏、分类菜单标题/行图标悬停同色与确认保留、群配置解散及草稿丢弃、单员工/整类删除与记录/文件清理、保留成员和重启持久的真实桌面断言。
 * [POS]: tests/e2e/steps/contacts.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  openContacts?: Awaited<ReturnType<typeof openContacts>>
  filterContacts?: Awaited<ReturnType<typeof filterContacts>>
  editContactWithGuard?: Awaited<ReturnType<typeof editContactWithGuard>>
  reuseDirectConversation?: Awaited<ReturnType<typeof reuseDirectConversation>>
  editGroupWithGuard?: Awaited<ReturnType<typeof editGroupWithGuard>>
  removal?: Awaited<ReturnType<typeof prepareContactRemoval>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

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
  await people.getByRole('button', { name: '研究员', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await expect(detail).toContainText('Prompt')
  await expect(detail).toContainText('你是一名研究员')
  await expect(page.getByRole('textbox', { name: '消息内容' })).toHaveCount(0)
  expect((await snapshot()).conversations).toHaveLength(1)
  return { app, page, errors, snapshot, group, nav, contacts, list, detail, people, groups }
}

async function filterContacts(previous: Awaited<ReturnType<typeof openContacts>>) {
  let { app, page, errors, snapshot, group, nav, contacts, list, detail, people, groups } = previous
  // Search and collapsing never change the inspected identity or create a chat.
  await list.getByRole('button', { name: /^联系人/ }).click()
  await expect(people).toBeHidden()
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('研究')
  await expect(people.getByRole('button')).toHaveCount(1)
  await expect(people.getByRole('button')).toBeVisible()
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('不存在的名字')
  await expect(list).toContainText('没有匹配的联系人')
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('')
  return { app, page, errors, snapshot, group, nav, contacts, list, detail, groups }
}

async function editContactWithGuard(previous: Awaited<ReturnType<typeof filterContacts>>) {
  let { app, page, errors, snapshot, group, nav, contacts, list, detail, groups } = previous
  // Save and continue must save the form in the main area before switching selection.
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '职责简介' }).fill('核对来源并整理研究结论')
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(detail.getByRole('textbox', { name: '职责简介' })).toHaveValue('核对来源并整理研究结论')
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await page.getByRole('button', { name: '保存并退出', exact: true }).click()
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
  await page.getByRole('textbox', { name: '搜索会话' }).fill('隐藏全部会话')
  await contacts.click()
  await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(input).toHaveValue('通讯录往返后保留这份草稿')
  await expect(page.getByRole('textbox', { name: '搜索会话' })).toHaveValue('')
  await expect(page.locator('.conversation-item.selected')).toContainText('研究员')
  expect((await snapshot()).conversations).toHaveLength(2)
  expect((await page.evaluate((id) => window.boai.request('getConversation', { id }), direct.id)).messages).toHaveLength(0)
  return { app, page, errors, snapshot, group, contacts, list, detail, groups, input }
}

async function editGroupWithGuard(previous: Awaited<ReturnType<typeof reuseDirectConversation>>) {
  let { app, page, errors, snapshot, group, contacts, list, detail, groups, input } = previous
  await contacts.click()
  await groups.getByRole('button', { name: '内容协作群' }).click()
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '群聊名称' }).fill('研究写作组')
  await detail.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
  await expect(groups.getByRole('button', { name: '研究写作组' })).toBeVisible()
  expect((await snapshot()).conversations.find((c) => c.id === group.id)?.title).toBe('研究写作组')

  // Discard resets the editor; opening a group must reuse the group and not send content.
  await detail.getByRole('button', { name: '编辑配置' }).click()
  await detail.getByRole('textbox', { name: '群聊名称' }).fill('这项修改不保存')
  await detail.getByRole('button', { name: '发消息', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
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
const removalMenu = async (runtime: Desktop, name: string, action: string) => {
  await removalList(runtime).getByRole('button', { name, exact: true }).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: action, exact: true }).click()
}
const categoryMenu = async (runtime: Desktop, name: string, action: string) => {
  await removalList(runtime).locator('.contacts-category-heading').filter({ hasText: name }).click({ button: 'right' })
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

async function createRemovalCategory(runtime: Desktop, name: string) {
  await runtime.page.evaluate(async name => {
    let value = await window.boai.request('getContactList', undefined)
    value = await window.boai.request('updateContactList', { expectedRevision: value.revision, action: { kind: 'create-category', name } })
    const categoryId = value.categories.find(category => category.name === name)!.id
    for (const agentId of ['researcher', 'writer']) value = await window.boai.request('updateContactList', { expectedRevision: value.revision, action: { kind: 'assign-category', agentId, categoryId } })
  }, name)
  await expect(removalList(runtime).getByRole('group', { name: `员工分类 ${name}`, exact: true }).getByRole('button')).toHaveCount(2)
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

Given('通讯录分类包含两位具有独立记录的员工', async ({ runtime, scenario }) => {
  scenario.removal = await prepareContactRemoval(runtime)
  await createRemovalCategory(runtime, '待管理团队')
})

When('通过分类标题右键修改名称并解散分类', async ({ runtime }) => {
  const page = runtime.page
  await removalList(runtime).getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '分类', exact: true }).hover()
  const label = page.getByText('员工分类', { exact: true }), create = page.getByRole('menuitem', { name: '新建员工分类', exact: true })
  await label.locator('..').hover()
  await expect(create).toHaveCSS('opacity', '1')
  await expect(create).toHaveCSS('color', await label.evaluate(element => getComputedStyle(element).color))
  const row = page.getByRole('menuitem', { name: '员工分类 待管理团队', exact: true })
  const rename = row.getByRole('button', { name: '重命名分类 待管理团队', exact: true }), remove = row.getByRole('button', { name: '删除分类 待管理团队', exact: true })
  await row.hover()
  const nameColor = await row.locator('[title="待管理团队"]').evaluate(element => getComputedStyle(element).color)
  await expect(rename).toHaveCSS('opacity', '1'); await expect(remove).toHaveCSS('opacity', '1')
  await expect(rename).toHaveCSS('color', nameColor); await expect(remove).toHaveCSS('color', nameColor)
  await remove.click()
  await expect(page.getByText('删除“待管理团队”？', { exact: true })).toBeVisible()
  await label.hover()
  await expect(remove).toHaveCSS('opacity', '1')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await categoryMenu(runtime, '待管理团队', '重命名分类')
  const dialog = page.getByRole('dialog', { name: '修改分类名称', exact: true })
  await dialog.getByRole('textbox', { name: '员工分类名称', exact: true }).fill('已更名团队')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(removalList(runtime).getByRole('group', { name: '员工分类 已更名团队', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('getContactList', undefined))).categories.map(category => category.name)).toEqual(['已更名团队'])
  await categoryMenu(runtime, '已更名团队', '解散分类')
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(removalList(runtime).getByRole('group', { name: '员工分类 已更名团队', exact: true })).toBeVisible()
  await categoryMenu(runtime, '已更名团队', '解散分类')
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toContainText('员工和聊天记录保留')
  await confirmation.getByRole('button', { name: '解散分类', exact: true }).click()
  await expect(removalList(runtime).locator('.contacts-category-heading').filter({ hasText: '已更名团队' })).toHaveCount(0)
})

Then('原分类消失但员工和聊天及工作区都保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect((await runtime.page.evaluate(() => window.boai.request('getContactList', undefined))).categories).toEqual([])
  for (const id of ['researcher', 'writer', 'reviewer']) expect(state.agents.some(agent => agent.id === id)).toBe(true)
  expect(state.conversations.map(item => item.id).sort()).toEqual([group.id, direct.id, writerDirect.id].sort())
  for (const conversation of [group, direct, writerDirect]) expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).messages).not.toHaveLength(0)
  for (const [kind, file] of Object.entries(files)) expect(await readFile(file, 'utf8')).toBe(`保留边界：${kind}`)
})

When('在搜索仅显示一位员工时确认删除整个分类的所有员工', async ({ runtime }) => {
  const page = runtime.page
  await createRemovalCategory(runtime, '整类删除团队')
  const list = removalList(runtime)
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('研究')
  await expect(list.getByRole('group', { name: '员工分类 整类删除团队', exact: true }).getByRole('button')).toHaveCount(1)
  await categoryMenu(runtime, '整类删除团队', '删除分类及全部员工')
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toContainText('全部 2 位员工')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  expect((await removalSnapshot(runtime)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))).toHaveLength(2)
  await categoryMenu(runtime, '整类删除团队', '删除分类及全部员工')
  await confirmation.getByRole('button', { name: '删除分类及全部员工', exact: true }).click()
  await expect(list.getByRole('button', { name: '研究员', exact: true })).toHaveCount(0)
  await list.getByRole('textbox', { name: '搜索通讯录' }).fill('')
  await expect(list.getByRole('button', { name: '写手', exact: true })).toHaveCount(0)
})

Then('分类全部员工及单聊被清空且其他成员的群历史保留', async ({ runtime, scenario }) => {
  const { group, direct, writerDirect, files } = scenario.removal!, state = await removalSnapshot(runtime)
  expect(state.agents.filter(agent => ['researcher', 'writer'].includes(agent.id))).toEqual([])
  expect(state.agents.some(agent => agent.id === 'reviewer')).toBe(true)
  expect(state.agents.some(agent => agent.id === 'bobo' && agent.systemRole === 'core')).toBe(true)
  expect(state.conversations.map(item => item.id)).toEqual([group.id])
  expect(state.conversations[0].agentIds).toEqual(['reviewer'])
  await expectMissingConversation(runtime, direct.id)
  await expectMissingConversation(runtime, writerDirect.id)
  const history = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(history.messages.some(message => message.content === '其他群成员仍可阅读的历史')).toBe(true)
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(files.writer)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  const preferences = await runtime.page.evaluate(() => window.boai.request('getContactList', undefined))
  expect(preferences.categories).toEqual([])
  expect(preferences.categoryByAgentId).toEqual({})
})

Then('重启后分类及全部员工删除结果仍然保留', async ({ runtime, scenario }) => {
  await runtime.restart()
  const state = await removalSnapshot(runtime), { group, direct, writerDirect, files } = scenario.removal!
  expect(state.agents.filter(agent => agent.systemRole !== 'core').map(agent => agent.id)).toEqual(['reviewer'])
  expect(state.conversations.map(item => item.id)).toEqual([group.id])
  expect(state.conversations[0].agentIds).toEqual(['reviewer'])
  await expectMissingConversation(runtime, direct.id)
  await expectMissingConversation(runtime, writerDirect.id)
  expect((await runtime.page.evaluate(() => window.boai.request('getContactList', undefined))).categories).toEqual([])
  await expect(readFile(files.researcher)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(files.writer)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(files.group, 'utf8')).toBe('保留边界：group')
  expect(runtime.errors).toEqual([])
})
