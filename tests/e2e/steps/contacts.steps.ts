/*
 * [INPUT]: 通讯录配置与会话复用的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 通讯录配置与会话复用的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/contacts.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  openContacts?: Awaited<ReturnType<typeof openContacts>>
  filterContacts?: Awaited<ReturnType<typeof filterContacts>>
  editContactWithGuard?: Awaited<ReturnType<typeof editContactWithGuard>>
  reuseDirectConversation?: Awaited<ReturnType<typeof reuseDirectConversation>>
  editGroupWithGuard?: Awaited<ReturnType<typeof editGroupWithGuard>>
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
