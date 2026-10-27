/*
 * [OUTPUT]: 按用户要求删除桌面结果Dialog；核对执行卡无常驻动作，原消息文件预览/CLI核源及零新增业务保持。
 * [INPUT]: Original Desktop fixture, persisted task-result seed and real visible chat controls.
 * [OUTPUT]: Real IPC/file preview, changed-file refusal and zero extra execution/messages, without model calls.
 * [POS]: Focused task-result BDD; does not replace global UI baselines.
 * [PROTOCOL]: Update steps/.folder.md and workspace spec 05 when assertions change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { test as base } from '../support/test'
import { prepareTaskResults } from '../support/task-results'

type State = { fixture?: Awaited<ReturnType<typeof prepareTaskResults>>; messageIds?: string[]; runIds?: string[] }
export const test = base.extend<{ taskResultState: State }>({ taskResultState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('隔离聊天已有失败任务和真实阶段报告', async ({ runtime, taskResultState }) => {
  const fixture = await prepareTaskResults(runtime)
  taskResultState.fixture = fixture
  const before = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.conversationId)
  taskResultState.messageIds = before.messages.map(message => message.id)
  taskResultState.runIds = before.runs.map(run => run.id)
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^任务结果隔离验收/ }).click()
})

When('执行卡没有常驻操作且我从原消息打开阶段报告', async ({ runtime, taskResultState }) => {
  const fixture = taskResultState.fixture!
  const card = runtime.page.locator(`[data-chat-execution-run="${fixture.runId}"]`)
  for (const name of ['任务结果', '查看', '继续']) await expect(card.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(runtime.page.getByRole('dialog', { name: '任务结果', exact: true })).toHaveCount(0)
  await expect(card).toContainText('后续步骤失败')
  const cli = await promisify(execFile)(process.execPath, [resolve('dist/cli/index.mjs'), 'task', 'result', fixture.workId, '--data-dir', fixture.dataPath, '--json'], { timeout: 15000 })
  const task = JSON.parse(cli.stdout)
  expect(task.work.id).toBe(fixture.workId)
  expect(task.files.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: '阶段报告.md', contentHash: fixture.hash, status: 'available' })]))
  await runtime.page.locator('[data-chat-artifact-id="task-result-fixture-file"]').getByRole('button', { name: '打开 阶段报告.md', exact: true }).click()
  await expect(runtime.page.locator('[data-file-preview-kind="markdown"]')).toContainText('这是从真实受管文件读取的结果。')
  await runtime.reviewCheckpoint('原消息真实受管文件预览')
})

Then('外改阶段报告后共享读取拒绝旧文件且没有重做任务', async ({ runtime, taskResultState }) => {
  const fixture = taskResultState.fixture!
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('dialog')).toHaveCount(0)
  await writeFile(fixture.file, '此内容已在产品外部修改，不得冒充原交付版本。')
  const result = await runtime.page.evaluate(workId => window.boai.request('getTaskResult', { workId }), fixture.workId)
  expect(result.files.items.find(file => file.id === 'task-result-fixture-file')?.status).toBe('unavailable')
  expect(result.files.items.find(file => file.id === 'task-result-fixture-file')?.reason).toBeTruthy()
  await expect(runtime.page.getByRole('button', { name: '任务结果', exact: true })).toHaveCount(0)
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.conversationId)
  expect(after.messages.map(message => message.id)).toEqual(taskResultState.messageIds)
  expect(after.runs.map(run => run.id)).toEqual(taskResultState.runIds)
  expect(after.runs.find(run => run.id === fixture.runId)?.status).toBe('failed')
  expect(runtime.errors).toEqual([])
})
