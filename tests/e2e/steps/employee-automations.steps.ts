/*
 * [INPUT]: 生产 Electron 与隔离群聊夹具。
 * [OUTPUT]: 群高级配置仅有基础配置，群成员头像宫格进入员工配置。
 * [POS]: 群资料与高级配置桌面 BDD。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'

const { Given, When, Then } = createBdd(test)

Given('通讯录存在三名员工组成的群聊', async ({ runtime }) => {
  await prepareGroupChat(runtime, { seedBeforeLaunch: true })
  const page = runtime.page
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.locator('.contacts-list').getByRole('button', { name: '产品讨论组', exact: true }).click()
})

When('我打开群聊高级配置', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '高级配置', exact: true }).click()
})

Then('群聊高级配置只显示基础配置', async ({ runtime }) => {
  const dialog = runtime.page.getByRole('dialog', { name: '编辑员工组', exact: true })
  await expect(dialog.getByRole('tab')).toHaveCount(1)
  await expect(dialog.getByRole('tab', { name: '基础配置', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('button', { name: '配置群成员 研究员', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭编辑员工组', exact: true }).click()
})

Then('从头像宫格打开指定数字员工的配置', async ({ runtime }) => {
  const detail = runtime.page.locator('.contacts-detail')
  const members = detail.getByRole('region', { name: '群成员', exact: true }).locator('.group-member-grid')
  await expect(members.getByRole('button')).toHaveCount(3)
  await members.getByRole('button', { name: '查看 研究员 的资料', exact: true }).click()
  await expect(detail.getByRole('textbox', { name: '员工名称', exact: true })).toHaveText('研究员')
})
