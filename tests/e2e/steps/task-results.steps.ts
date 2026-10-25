/*
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

When('我从聊天任务结果打开阶段报告', async ({ runtime, taskResultState }) => {
  const fixture = taskResultState.fixture!
  const card = runtime.page.locator(`[data-chat-execution-run="${fixture.runId}"]`)
  await card.getByRole('button', { name: '任务结果', exact: true }).click()
  const result = runtime.page.getByRole('dialog', { name: '任务结果', exact: true })
  await expect(result).toContainText('阶段报告已保存')
  await expect(result.getByRole('region', { name: '关键执行记录', exact: true })).toContainText('工具成功 1')
  await expect(result).toContainText('后续步骤失败')
  const cli = await promisify(execFile)(process.execPath, [resolve('dist/cli/index.mjs'), 'task', 'result', fixture.workId, '--data-dir', fixture.dataPath, '--json'], { timeout: 15000 })
  const task = JSON.parse(cli.stdout)
  expect(task.work.id).toBe(fixture.workId)
  expect(task.files.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: '阶段报告.md', contentHash: fixture.hash, status: 'available' })]))
  await runtime.reviewCheckpoint('任务结果读取原失败与交付记录')
  await result.getByRole('button', { name: '阶段报告.md', exact: true }).click()
  const preview = runtime.page.getByRole('dialog', { name: '阶段报告.md', exact: true })
  await expect(preview).toContainText('这是从真实受管文件读取的结果。')
  await runtime.reviewCheckpoint('任务结果真实受管文件预览')
})

Then('外改阶段报告后结果入口拒绝旧文件且没有重做任务', async ({ runtime, taskResultState }) => {
  const fixture = taskResultState.fixture!
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('dialog')).toHaveCount(0)
  await writeFile(fixture.file, '此内容已在产品外部修改，不得冒充原交付版本。')
  await runtime.page.locator(`[data-chat-execution-run="${fixture.runId}"]`).getByRole('button', { name: '任务结果', exact: true }).click()
  const result = runtime.page.getByRole('dialog', { name: '任务结果', exact: true })
  await expect(result).toContainText('文件缺失、内容已变化或原来源授权失效')
  await expect(result.getByRole('button', { name: '阶段报告.md', exact: true })).toHaveCount(0)
  await runtime.reviewCheckpoint('文件外改后拒绝原版本预览')
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.conversationId)
  expect(after.messages.map(message => message.id)).toEqual(taskResultState.messageIds)
  expect(after.runs.map(run => run.id)).toEqual(taskResultState.runIds)
  expect(after.runs.find(run => run.id === fixture.runId)?.status).toBe('failed')
  expect(runtime.errors).toEqual([])
})
