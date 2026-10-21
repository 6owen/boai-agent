/*
 * [OUTPUT]: 永久命令授权撤销沿当前模型与权限分区保存请求审批，原授权/撤销/重启/零重放断言保持；旧撤销按钮退役。
 * [OUTPUT]: 按当前“运行命令审批”可访问名称定位实际审批卡，永久允许/撤销和零重放断言保持。
 * [INPUT]: 隔离Electron、真实IPC和原群聊本地模型协议。
 * [OUTPUT]: 真实审批卡记住授权、命令文件、配置版本/重启与通讯录撤销闭环；返回会话后明确选中原群。
 * [POS]: 员工永久命令权限BDD；不使用真实供应商或用户数据库。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'

type State = { fixture?: Awaited<ReturnType<typeof prepareGroupChat>>; version?: number; cwd?: string }
export const test = base.extend<{ commandPermission: State }>({ commandPermission: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('命令审批员工与本地模型已准备好', async ({ runtime, commandPermission: state }) => {
  state.fixture = await prepareGroupChat(runtime, { emulateViewport: false })
  state.version = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'reviewer')!.configVersion
})
When('在命令卡选择始终允许此类操作', async ({ runtime, commandPermission: state }) => {
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '检查排版目录', mentionIds: ['reviewer'], requestId: 'remember-command' }), state.fixture!.group.id)
  const card = runtime.page.getByRole('region', { name: '设计师 的运行命令审批', exact: true })
  await expect(card).toBeVisible()
  state.cwd = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals[0].cwd
  await runtime.reviewNativeCheckpoint('员工命令审批可选择始终允许')
  await card.getByRole('button', { name: '始终允许此类操作', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(async () => readFile(join(state.cwd!, 'approval-marker.txt'), 'utf8').catch(() => '')).toBe('group-chat-approved')
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.fixture!.group.id)).runs.filter(run => run.phase === 'execution').every(run => !['running', 'queued', 'waiting_approval'].includes(run.status))).toBe(true)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'reviewer')!.configVersion).toBe(state.version)
})
Then('同一员工重启后执行命令不再询问且可以恢复确认', async ({ runtime, commandPermission: state }) => {
  await runtime.restart()
  const page = runtime.page
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).commandPermissions?.map(permission => permission.agentId)).toEqual(['reviewer'])
  await page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '再次检查排版目录', mentionIds: ['reviewer'], requestId: 'remember-after-restart' }), state.fixture!.group.id)
  await expect.poll(async () => {
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), state.fixture!.group.id)
    const runs = detail.runs.filter(run => run.phase === 'execution' && run.agentId === 'reviewer')
    return runs.length === 2 ? runs.at(-1)?.status : 'waiting'
  }).toBe('completed')
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), state.fixture!.group.id)
  expect(detail.runs.filter(run => run.phase === 'execution' && run.agentId === 'reviewer')).toHaveLength(2)
  expect(detail.runs.filter(run => run.phase === 'execution').at(-1)?.toolEvents.some(event => event.name === 'execute_command' && event.status === 'completed')).toBe(true)
  await expect(page.locator('[data-approval-id]')).toHaveCount(0)
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.locator('.contacts-list').getByRole('button', { name: '设计师', exact: true }).click()
  await page.getByRole('button', { name: '编辑模型与权限', exact: true }).click()
  await runtime.reviewNativeCheckpoint('通讯录可恢复逐次确认')
  await page.getByRole('combobox', { name: '执行权限', exact: true }).click()
  await page.getByRole('option', { name: '请求审批', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).commandPermissions).toEqual([])
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: state.fixture!.group.title, exact: true }).click()
  await page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '恢复确认后检查排版目录', mentionIds: ['reviewer'], requestId: 'remember-revoked' }), state.fixture!.group.id)
  const card = page.getByRole('region', { name: '设计师 的运行命令审批', exact: true })
  await expect(card).toBeVisible()
  await runtime.reviewNativeCheckpoint('撤销永久授权后重新出现命令审批')
  await card.getByRole('button', { name: '拒绝', exact: true }).click()
  expect(runtime.errors).toEqual([])
})
