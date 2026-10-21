/*
 * [OUTPUT]: 第二轮均已到真实处理/PID终态，失败在读取已自动折叠卡片正文；现显式展开原卡再核原状态，全部断言/期限保持。
 * [OUTPUT]: 首轮4失败为未放弃已核未受理请求及误用region定位普通Card；沿原放弃入口/aria-label修正，180秒与原业务断言保持。
 * [INPUT]: 原stdio双后端/同群双员工、普通composer和原执行面板。
 * [OUTPUT]: 实际无目标拒绝/草稿、逐员工输入/审批/停止、真实文件/PID结束及双次重启原请求不重放。
 * [POS]: DS03新的4场真实Electron场景，180秒测试期限含三次启动，不改变原用例或产品本机预算。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentRun, ConversationDetail } from '../../../src/shared/domain'
import type { NativeAction } from '../../../src/shared/domain/execution'
import type { Desktop } from '../support/desktop'
import { test as base } from '../support/test'
import { messageDraft } from '../support/editor-controls'
import { runtimeChildProcessIds, processIsRunning } from '../support/automation-recovery'
import { prepareNativeGroup, nativeGroupDetail, nativeGroupActions, nativeGroupWork, nativeGroupProtocolFiles, type NativeGroup } from '../support/native-group-pending'

type State = { group?: NativeGroup; runs?: AgentRun[]; actions?: NativeAction[]; pids?: number[] }
export const test = base.extend<{ nativeGroup: State }>({ nativeGroup: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const panel = (runtime: Desktop, run: AgentRun) => runtime.page.locator(`#agent-execution-drawer [data-execution-run-id="${run.id}"]`)
async function expandedExecution(runtime: Desktop, run: AgentRun) {
  const card = panel(runtime, run), toggle = card.getByRole('button', { name: /^(展开|收起)执行：/ })
  await expect(toggle).toBeVisible()
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  return card
}
async function composer(runtime: Desktop, group: NativeGroup) {
  const chat = runtime.page.locator(`[data-conversation-view="chat"][data-conversation-id="${group.chat.id}"]`)
  await expect(chat.locator('.chat-messages-transition')).toHaveAttribute('aria-busy', 'false')
  const input = chat.getByRole('textbox', { name: '消息内容', exact: true }).and(runtime.page.locator('[contenteditable="true"]'))
  await expect(input).toBeEditable()
  return input
}
async function openExecution(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '执行过程', exact: true }).click()
  await expect(runtime.page.locator('#agent-execution-drawer')).toBeVisible()
}
async function endState(runtime: Desktop, state: State, expected: string[]) {
  const group = state.group!
  await expect.poll(async () => (await nativeGroupDetail(runtime, group)).runs.map(run => run.status).sort()).toEqual([...expected].sort())
  const view = await nativeGroupDetail(runtime, group)
  expect(view.runs.map(run => run.id).sort()).toEqual(state.runs!.map(run => run.id).sort())
  expect(view.runs.every(run => run.backend?.externalInvocations === 1)).toBe(true)
  expect(new Set(view.runs.map(run => run.backend?.sessionId)).size).toBe(2)
  expect((await nativeGroupActions(runtime, group, state.runs!)).filter(action => action.status === 'pending')).toEqual([])
  await expect.poll(() => state.pids!.filter(processIsRunning).length).toBe(0)
  return view
}
async function reopenTwice(runtime: Desktop, state: State, view: ConversationDetail) {
  const group = state.group!, actions = await nativeGroupActions(runtime, group, state.runs!), files = await nativeGroupProtocolFiles(group)
  expect(files).toHaveLength(4); expect(files.every(file => file.lines === 1)).toBe(true)
  const runs = view.runs.map(run => ({ id: run.id, status: run.status, triggerMessageId: run.triggerMessageId, backend: run.backend }))
  for (let opening = 1; opening <= 2; opening++) {
    await runtime.restart()
    const after = await nativeGroupDetail(runtime, group)
    expect(after.messages).toEqual(view.messages); expect(after.artifacts).toEqual(view.artifacts)
    expect(after.runs.map(run => ({ id: run.id, status: run.status, triggerMessageId: run.triggerMessageId, backend: run.backend }))).toEqual(runs)
    expect(await nativeGroupActions(runtime, group, state.runs!)).toEqual(actions)
    expect(await nativeGroupProtocolFiles(group)).toEqual(files)
    expect(await runtimeChildProcessIds(runtime)).toEqual([])
    if (group.mode === 'approval') {
      expect(await stat(join(nativeGroupWork(group, group.agents[0]), 'permission-marker')).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
      expect(await readFile(join(nativeGroupWork(group, group.agents[1]), 'permission-marker'), 'utf8')).toBe('approved')
    }
    await runtime.reviewData(`${group.kind}同群${group.mode}第${opening}次重启`, { runs, actions: actions.map(({ id, runId, agentId, status, responseMessageId, delivery }) => ({ id, runId, agentId, status, responseMessageId, delivery })), files, messages: after.messages.map(({ id, senderId, status }) => ({ id, senderId, status })) })
  }
  expect(runtime.errors).toEqual([])
}

Given('{string} 两名原生员工已在同群等待 {string}', async ({ runtime, nativeGroup: state }, kind: string, mode: string) => {
  test.setTimeout(180_000)
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  if (!['codex', 'claude'].includes(kind) || !['input', 'approval'].includes(mode)) throw Error('未知同群原生场景')
  state.group = await prepareNativeGroup(runtime, kind as 'codex' | 'claude', mode as 'input' | 'approval')
  const group = state.group
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: group.chat.title, exact: true }).click()
  await (await composer(runtime, group)).fill(mode === 'input' ? 'NATIVE_QUESTION NATIVE_DELAYED_QUESTION' : 'NATIVE_APPROVAL')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    const view = await nativeGroupDetail(runtime, group)
    return (await nativeGroupActions(runtime, group, view.runs)).filter(action => action.kind === mode && action.status === 'pending').length
  }).toBe(2)
  const view = await nativeGroupDetail(runtime, group)
  expect(view.runs).toHaveLength(2)
  state.runs = group.agents.map(agent => view.runs.find(run => run.agentId === agent.id)!)
  expect(state.runs.every(Boolean)).toBe(true)
  state.actions = await nativeGroupActions(runtime, group, state.runs)
  state.pids = await runtimeChildProcessIds(runtime)
  expect(state.pids.length).toBeGreaterThanOrEqual(2)
  if (mode === 'input') {
    await expect.poll(async () => (await nativeGroupDetail(runtime, group)).messages.filter(message => message.content === '这个文档针对什么产品？').length).toBe(2)
    const questions = (await nativeGroupDetail(runtime, group)).messages.filter(message => message.content === '这个文档针对什么产品？')
    for (const message of questions) await expect(runtime.page.locator(`#message-${message.id}`).getByText('这个文档针对什么产品？', { exact: true })).toBeVisible()
  }
  await runtime.reviewData(`${kind}同群双待决原身份`, { conversationId: group.chat.id, agentIds: group.agents.map(agent => agent.id), runs: state.runs.map(run => ({ id: run.id, agentId: run.agentId, status: run.status, sessionId: run.backend?.sessionId })), actions: state.actions.map(({ id, runId, agentId, kind, status, createdAt }) => ({ id, runId, agentId, kind, status, createdAt })), childPids: state.pids })
  await runtime.reviewNativeCheckpoint(`${kind}同群双${mode}待决`)
})
When('未指定员工的回答被拒绝后我分别点名回答两人', async ({ runtime, nativeGroup: state }) => {
  const group = state.group!, rejected = 'UNADDRESSED_NATIVE_UI_REPLY', input = await composer(runtime, group)
  await input.fill(rejected)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const toast = runtime.page.locator('[data-sonner-toast]').filter({ hasText: '有多个原生问题正在等待' })
  await expect(toast).toBeVisible(); expect(await messageDraft(input)).toBe(rejected)
  const before = await nativeGroupDetail(runtime, group)
  expect(before.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect((await nativeGroupActions(runtime, group, state.runs!)).filter(action => action.status === 'pending')).toHaveLength(2)
  await runtime.reviewNativeCheckpoint(`${group.kind}无目标拒绝并保留草稿`)
  await toast.getByRole('button', { name: '关闭提示', exact: true }).click()
  const abandon = runtime.page.getByRole('button', { name: '放弃未受理发送', exact: true })
  await expect(abandon).toBeVisible()
  await abandon.click()
  await expect(abandon).toHaveCount(0)
  expect(await messageDraft(input)).toBe(rejected)
  for (const [index, agent] of group.agents.entries()) {
    const content = `NATIVE_UI_REPLY_${index + 1}`
    await (await composer(runtime, group)).fill(content)
    await runtime.page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
    await runtime.page.getByRole('option', { name: '@' + agent.name, exact: true }).click()
    await expect(runtime.page.locator('.chat-composer .composer-mention-tag')).toHaveText('@' + agent.name)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await nativeGroupDetail(runtime, group)).runs.find(run => run.id === state.runs![index].id)?.status).toBe('completed')
    const current = await nativeGroupDetail(runtime, group), answer = current.messages.find(message => message.senderType === 'user' && message.content.includes(content))!
    expect(answer.mentionIds).toEqual([agent.id])
    expect(current.runs).toHaveLength(2)
    if (index === 0) {
      const other = (await nativeGroupActions(runtime, group, state.runs!)).find(action => action.agentId === group.agents[1].id)!
      expect(other).toMatchObject({ id: state.actions!.find(action => action.agentId === group.agents[1].id)!.id, status: 'pending' })
      expect(current.runs.find(run => run.agentId === group.agents[1].id)?.status).toBe(state.runs![1].status)
    }
  }
})
Then('原生问题只消费各自回答且两次重启不增加执行', async ({ runtime, nativeGroup: state }) => {
  const group = state.group!, view = await endState(runtime, state, ['completed', 'completed'])
  expect(view.messages.filter(message => message.senderType === 'user')).toHaveLength(3)
  for (const [index, agent] of group.agents.entries()) {
    const reply = view.messages.find(message => message.senderId === agent.id && message.content.includes(`NATIVE_UI_REPLY_${index + 1}`))!
    expect(reply).toBeTruthy(); expect(reply.content).not.toContain(`NATIVE_UI_REPLY_${2 - index}`)
  }
  await openExecution(runtime)
  for (const run of state.runs!) await expect(await expandedExecution(runtime, run)).toContainText('已完成')
  await runtime.reviewNativeCheckpoint(`${group.kind}同群两问题分别回答后实际终态`)
  await reopenTwice(runtime, state, view)
})
When('我从第一名员工的执行记录停止并批准第二名员工', async ({ runtime, nativeGroup: state }) => {
  const group = state.group!, [first, second] = state.runs!
  for (const agent of group.agents) expect(await stat(join(nativeGroupWork(group, agent), 'permission-marker')).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
  await openExecution(runtime)
  const firstCard = panel(runtime, first), secondCard = panel(runtime, second)
  await expect(firstCard.locator('[aria-label="原生执行请求"]')).toBeVisible()
  await expect(secondCard.locator('[aria-label="原生执行请求"]')).toBeVisible()
  await firstCard.getByRole('button', { name: '停止本次执行', exact: true }).click()
  await expect.poll(async () => (await nativeGroupDetail(runtime, group)).runs.find(run => run.id === first.id)?.status).toBe('cancelled')
  const pending = (await nativeGroupActions(runtime, group, state.runs!)).find(action => action.agentId === group.agents[1].id)!
  expect(pending).toMatchObject({ id: state.actions!.find(action => action.agentId === group.agents[1].id)!.id, status: 'pending' })
  await expect(await expandedExecution(runtime, first)).toContainText('已停止')
  await expect(firstCard.getByRole('button', { name: '停止本次执行', exact: true })).toHaveCount(0)
  await expect(secondCard.locator('[aria-label="原生执行请求"]')).toBeVisible()
  const option = pending.options.find(option => /^(accept|allow|approve)(_|$)/.test(option.id))!
  expect(option).toBeTruthy()
  await secondCard.locator('[aria-label="原生执行请求"]').getByRole('button', { name: option.label, exact: true }).click()
})
Then('只有第二名员工产生批准文件且两次重启保持结果', async ({ runtime, nativeGroup: state }) => {
  const group = state.group!, view = await endState(runtime, state, ['cancelled', 'completed'])
  expect(view.runs.find(run => run.agentId === group.agents[0].id)?.status).toBe('cancelled')
  expect(view.runs.find(run => run.agentId === group.agents[1].id)?.status).toBe('completed')
  const marker = join(nativeGroupWork(group, group.agents[1]), 'permission-marker')
  expect(await stat(join(nativeGroupWork(group, group.agents[0]), 'permission-marker')).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
  expect(await readFile(marker, 'utf8')).toBe('approved')
  await expect(await expandedExecution(runtime, state.runs![0])).toContainText('已停止')
  await expect(await expandedExecution(runtime, state.runs![1])).toContainText('已完成')
  await expect(runtime.page.locator('[aria-label="原生执行请求"]')).toHaveCount(0)
  await runtime.reviewFile(`${group.kind}仅第二员工实际批准文件`, marker, { required: true })
  await runtime.reviewNativeCheckpoint(`${group.kind}同群单人停止同事批准后实际终态`)
  await reopenTwice(runtime, state, view)
})
