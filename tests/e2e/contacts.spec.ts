/*
 * [INPUT]: 隔离 Electron 工作区、通讯录与现有员工/群聊配置和会话功能。
 * [OUTPUT]: 浏览不创建会话、真实编辑/未保存保护、发消息复用会话与草稿、搜索/折叠/手动侧栏回归。
 * [POS]: 通讯录到配置和会话的真实桌面集成验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('contacts browse and edit configuration, then explicitly open reusable conversations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-contacts-e2e-'))
  const app = await electron.launch({ args: [resolve('.')], env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  const page = await app.firstWindow(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await expect(page.locator('.app-shell')).toBeVisible()
    const snapshot = () => page.evaluate(() => window.boai.request('snapshot', undefined))
    const group = await page.evaluate(() => window.boai.request('createConversation', { kind: 'group', title: '内容协作群', agentIds: ['researcher', 'writer'] }))
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
    expect((await snapshot()).agents.find(agent => agent.id === 'researcher')?.role).toBe('核对来源并整理研究结论')
    await expect(detail.getByRole('region', { name: '群成员' })).toBeVisible()
    await detail.getByRole('button', { name: '查看 研究员 的资料' }).click()
    await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
    expect((await snapshot()).conversations).toHaveLength(1)

    await detail.getByRole('button', { name: '发消息', exact: true }).click()
    await expect(nav.getByRole('button', { name: '会话', exact: true })).toHaveAttribute('aria-current', 'page')
    const input = page.getByRole('textbox', { name: '消息内容' })
    await expect(input).toBeVisible()
    await input.fill('通讯录往返后保留这份草稿')
    const direct = (await snapshot()).conversations.find(c => c.kind === 'direct')!
    expect(direct.agentIds).toEqual(['researcher'])
    await page.getByRole('textbox', { name: '搜索会话' }).fill('隐藏全部会话')
    await contacts.click()
    await expect(detail.getByRole('heading', { name: '研究员', exact: true })).toBeVisible()
    await detail.getByRole('button', { name: '发消息', exact: true }).click()
    await expect(input).toHaveValue('通讯录往返后保留这份草稿')
    await expect(page.getByRole('textbox', { name: '搜索会话' })).toHaveValue('')
    await expect(page.locator('.conversation-item.selected')).toContainText('研究员')
    expect((await snapshot()).conversations).toHaveLength(2)
    expect((await page.evaluate(id => window.boai.request('getConversation', { id }), direct.id)).messages).toHaveLength(0)

    await contacts.click()
    await groups.getByRole('button', { name: '内容协作群' }).click()
    await detail.getByRole('button', { name: '编辑配置' }).click()
    await detail.getByRole('textbox', { name: '群聊名称' }).fill('研究写作组')
    await detail.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
    await expect(groups.getByRole('button', { name: '研究写作组' })).toBeVisible()
    expect((await snapshot()).conversations.find(c => c.id === group.id)?.title).toBe('研究写作组')

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

    const width = (await list.boundingBox())!.width
    for (const size of [760, 1247]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 688), size)
      await page.waitForFunction(width => innerWidth === width, size)
      await expect(list).toBeVisible()
      expect((await list.boundingBox())!.width).toBe(width)
      expect(await detail.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    const toggle = page.getByRole('button', { name: '显示或隐藏通讯录列表' })
    await toggle.click(); await expect(list).toBeHidden()
    await toggle.click(); await expect(list).toBeVisible()
    await page.reload()
    await expect(contacts).toHaveAttribute('aria-current', 'page')
    await groups.getByRole('button', { name: '研究写作组' }).click()
    await expect(detail.getByRole('heading', { name: '研究写作组', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await page.evaluate(() => window.boai.request('setUnsavedChanges', { dirty: false })).catch(() => {})
    await app.close(); await rm(root, { recursive: true, force: true })
  }
})
