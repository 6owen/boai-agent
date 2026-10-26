/*
 * [INPUT]: Real isolated Electron/pnpm dev and built CLI with no external model requests.
 * [OUTPUT]: Default model/persona UI, CLI group/schedule/theme and restart receipt evidence.
 * [POS]: Application protocol desktop integration; does not certify real model reasoning.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { ApplicationResult } from '../../../packages/shared/src/domain/application-protocol'
import type { DigitalAgent } from '../../../packages/shared/src/domain'
import { readLocalConnection } from '../../../packages/transport/src/discovery'
import { test as base } from '../support/test'

type State = { employee?: DigitalAgent; dataPath?: string; group?: ApplicationResult; command?: (args: string[]) => Promise<unknown> }
export const test = base.extend<{ business: State }>({ business: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('应用协议验收已启动隔离开发应用', async ({ runtime, business }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'no-model-requests' })
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  business.dataPath = await runtime.page.evaluate(async () => {
    const saved = await window.boai.request('executeApplicationOperation', { operation: 'connections.create', requestId: 'desktop-model', input: { name: '开发验收模型', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' } })
    if (saved.status !== 'succeeded') throw new Error(JSON.stringify(saved))
    return (await window.boai.request('snapshot', undefined)).dataPath
  })
  const entry = resolve('dist/cli/index.mjs')
  business.command = async args => {
    const result = await promisify(execFile)(process.execPath, [entry, '--data-dir', business.dataPath!, '--json', ...args], { cwd: runtime.root, env: { PATH: process.env.PATH, HOME: runtime.root, TMPDIR: runtime.root }, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })
    return JSON.parse(result.stdout)
  }
})
When('用户以默认模型创建员工并展开人格配置', async ({ runtime, business }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('协议验收小研')
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill('整理事实与来源')
  await expect(dialog.getByRole('button', { name: '创建员工', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('textbox', { name: '工作方式', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '高级配置', exact: true }).click()
  await dialog.getByRole('textbox', { name: '人格与表达', exact: true }).fill('沉稳、直接，遇到未知就说明。')
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.conversation-item').filter({ hasText: '协议验收小研' })).toBeVisible()
  business.employee = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.name === '协议验收小研')!)
  expect(business.employee.modelId).toBe('fixture-model')
  const soul = await page.evaluate(agentId => window.boai.request('readAgentFile', { agentId, name: 'SOUL.md' }), business.employee.id)
  expect(soul.content).toBe('沉稳、直接，遇到未知就说明。')
})
Then('CLI可以创建群和定时计划并更新同一桌面主题', async ({ runtime, business }) => {
  const call = (operation: string, input: unknown, requestId: string) => business.command!(['app', 'call', operation, JSON.stringify(input), '--request-id', requestId]) as Promise<ApplicationResult>
  business.group = await call('groups.create', { title: '协议验收群', agentIds: [business.employee!.id, 'researcher'] }, 'cli-group')
  expect(business.group.status).toBe('succeeded')
  expect(await call('groups.create', { title: '协议验收群', agentIds: [business.employee!.id, 'researcher'] }, 'cli-group')).toEqual(business.group)
  expect(await call('automations.create', { name: '九点观察', prompt: '整理行业动态', owner: { kind: 'employee', employeeId: business.employee!.id }, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Shanghai', enabled: false, notify: false }, 'cli-plan')).toMatchObject({ status: 'succeeded' })
  const appearance = await runtime.page.evaluate(() => window.boai.request('getAppearance', undefined))
  expect(await call('appearance.update', { patch: { mode: 'dark' }, expectedRevision: appearance.revision }, 'cli-theme')).toMatchObject({ status: 'succeeded', data: { preferences: { mode: 'dark' } } })
  await expect.poll(() => runtime.page.evaluate(async () => (await window.boai.request('getAppearance', undefined)).resolvedMode)).toBe('dark')
  const catalog = await business.command!(['app', 'catalog', 'appearance']) as { operations: { available: boolean }[] }
  expect(catalog.operations.length).toBeGreaterThan(0)
  expect(catalog.operations.every(operation => operation.available)).toBe(true)
  expect(await business.command!(['app', 'describe', 'automations.create'])).toMatchObject({ operations: [{ name: 'automations.create', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }] })
})
Then('重启后业务回执与员工人格保持且没有重复执行', async ({ runtime, business }) => {
  const oldServer = (await readLocalConnection(business.dataPath!)).serverId
  await runtime.restart()
  await expect.poll(async () => { try { return (await readLocalConnection(business.dataPath!)).serverId !== oldServer } catch { return false } }).toBe(true)
  expect(await business.command!(['app', 'receipt', 'cli-group'])).toEqual(business.group)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.filter(agent => agent.name === '协议验收小研')).toHaveLength(1)
  expect(snapshot.conversations.filter(room => room.title === '协议验收群')).toHaveLength(1)
  const soul = await runtime.page.evaluate(agentId => window.boai.request('readAgentFile', { agentId, name: 'SOUL.md' }), business.employee!.id)
  expect(soul.content).toBe('沉稳、直接，遇到未知就说明。')
  expect(await runtime.page.evaluate(() => window.boai.request('listAutomationHistory', { limit: 30 }))).toMatchObject({ occurrences: [] })
  expect(runtime.errors).toEqual([])
})
