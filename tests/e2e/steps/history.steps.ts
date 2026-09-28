/*
 * [INPUT]: 历史失败与当前群聊轮次隔离的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 消息图标锚定、员工筛选、真实节点输入输出、任务面板分离与历史重启验证；从会话菜单进入活动详情，验证历史失败与当前群聊轮次隔离的真实桌面断言。
 * [POS]: tests/e2e/steps/history.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { createServer } from 'node:http'

import { join } from 'node:path'
import type { ConversationDetail, Snapshot } from '../../../src/shared/domain'

type Scenario = {
  prepareHistory?: Awaited<ReturnType<typeof prepareHistory>>
  startFreshGreeting?: Awaited<ReturnType<typeof startFreshGreeting>>
  inspectRoundActivity?: Awaited<ReturnType<typeof inspectRoundActivity>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareHistory(runtime: Desktop) {
  const decisions: { employee: string; data: any }[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const request = JSON.parse(body),
      employee = request.model.replace('test-', '')
    const system = request.messages
      .filter((m: any) => m.role === 'system')
      .map((m: any) => m.content)
      .join('\n')
    const lastUser = request.messages.filter((m: any) => m.role === 'user').at(-1)?.content ?? ''
    let content: string
    if (system.includes('Private participation decision')) {
      const data = JSON.parse(lastUser).data
      decisions.push({ employee, data })
      const root = data.currentTurnMessages?.find((m: any) => m.id === data.currentTurn?.rootMessageId)
      if (root?.content === '旧轮故障') content = employee === 'reviewer' ? 'OLD_ERR observedThroughSequence' : '{"action":"pass"}'
      else content = JSON.stringify({ action: !root || data.currentTurn.ownCompletedMessageIds.length ? 'pass' : 'reply', responseKind: 'chat' })
    } else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
    else content = String(lastUser).includes('历史自我介绍') ? `${employee}：这是旧轮的自我介绍，等待主题与素材。` : `${employee}：你好，我在。`
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const chunk = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'history', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      )
    chunk({ role: 'assistant', content })
    chunk({}, 'stop')
    res.end('data: [DONE]\n\n')
  })
  runtime.trackServer(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const root = runtime.root
  const launch = () => runtime.start({ dataDir: root })
  let desktop = await launch()

  let page = await desktop.firstWindow()
  await page.waitForFunction(() => Boolean(window.boai))
  const initial: Snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const connection = await page.evaluate(
    (port) =>
      window.boai.request('saveConnection', {
        name: '历史回归连接',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        defaultModel: 'test',
      }),
    port,
  )
  for (const agent of initial.agents)
    await page.evaluate(
      ({ agent, connectionId }) => {
        const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
        return window.boai.request('saveAgent', { ...input, connectionId, modelId: `test-${agent.id}`, expectedConfigVersion: configVersion })
      },
      { agent, connectionId: connection.id },
    )
  const group = await page.evaluate(
    (agentIds) => window.boai.request('createConversation', { kind: 'group', title: '已有历史的群', agentIds }),
    initial.agents.map((a) => a.id),
  )
  const detail = () => runtime.page.evaluate((id) => window.boai.request('getConversation', { id }), group.id)
  const send = async (content: string) => {
    const message = await page.evaluate((input) => window.boai.request('sendMessage', input), {
      conversationId: group.id,
      content,
      mentionIds: [],
      requestId: content,
    })
    await expect
      .poll(async () => {
        const state = await detail(),
          turn = state.turns?.find((t) => t.id === message.turnId)
        return (
          !!turn &&
          ['completed', 'failed', 'budget_exhausted'].includes(turn.status) &&
          state.runs.filter((r) => r.turnId === turn.id).every((r) => !['running', 'queued', 'waiting_approval'].includes(r.status))
        )
      })
      .toBe(true)
    return message
  }
  return { runtime, decisions, launch, desktop, page, detail, send }
}

async function startFreshGreeting(previous: Awaited<ReturnType<typeof prepareHistory>>) {
  let { runtime, decisions, launch, desktop, page, detail, send } = previous
  await send('历史自我介绍')
  const failedMessage = await send('旧轮故障')
  const failed = await detail()
  expect(failed.turns?.find((t) => t.id === failedMessage.turnId)?.status).toBe('failed')
  const failedRun = failed.runs.find((r) => r.turnId === failedMessage.turnId && r.status === 'failed')!
  expect(failedRun.error).toContain('OLD_ERR')
  const greeting = await send('你们好啊')
  const successful: ConversationDetail = await detail()
  expect(successful.turns?.find((t) => t.id === greeting.turnId)?.status).toBe('completed')
  expect(new Set(successful.messages.filter((m) => m.turnId === greeting.turnId && m.senderType === 'agent').map((m) => m.senderId)).size).toBe(3)
  const initialDecisions = decisions.filter((d) => d.data.currentTurn?.id === greeting.turnId && d.data.participation.isFirstDecision)
  expect(initialDecisions).toHaveLength(3)
  expect(
    initialDecisions.every(
      (d) =>
        d.data.currentTurn.ownCompletedMessageIds.length === 0 &&
        d.data.historicalBackground.some((m: any) => m.senderId === d.employee) &&
        d.data.currentTurnMessages.length === 1,
    ),
  ).toBe(true)
  return { runtime, launch, desktop, page, detail, failedMessage, failedRun, greeting, successful }
}

async function inspectRoundActivity(previous: Awaited<ReturnType<typeof startFreshGreeting>>) {
  let { runtime, launch, desktop, page, detail, failedMessage, failedRun, greeting, successful } = previous
  const checkActivity = async () => {
    await runtime.page
      .getByRole('navigation', { name: '会话列表', exact: true })
      .getByRole('button', { name: /^已有历史的群/ })
      .click()
    const greetingReply = successful.messages.find(message => message.turnId === greeting.turnId && message.senderId === 'researcher')!
    await expect(runtime.page.locator('.composer-wrap .turn-status')).toHaveCount(0)
    await runtime.page.locator(`#message-${greetingReply.id}`).getByRole('button', { name: '查看 研究员 的执行过程', exact: true }).click()
    const panel = runtime.page.locator('.detail-content:visible')
    await expect(panel.getByRole('combobox', { name: '筛选员工', exact: true })).toHaveValue('researcher')
    await expect(panel.getByRole('region', { name: '调用树与时间线' })).toBeVisible()
    const spans = await runtime.page.evaluate(input => window.boai.request('getConversationTrace', input), { conversationId: successful.conversation.id, messageId: greetingReply.id })
    expect(new Set(spans.map(span => span.agentId)).size).toBe(3)
    expect(spans.every(span => span.turnId === greeting.turnId)).toBe(true)
    expect(spans.some(span => span.name === '模型请求')).toBe(true)
    await panel.getByRole('button', { name: '查看节点 模型请求', exact: true }).first().click()
    await expect(runtime.page.getByRole('dialog', { name: '节点详情', exact: true })).toContainText('输入')
    await expect(runtime.page.getByRole('dialog', { name: '节点详情', exact: true })).toContainText('prompt')
    await expect(runtime.page.getByRole('dialog', { name: '节点详情', exact: true })).toContainText('输出')
    expect((await runtime.page.getByRole('dialog', { name: '节点详情', exact: true }).boundingBox())!.width).toBeGreaterThan(400)
    await runtime.page.screenshot({ path: 'test-results/conversation-trace-current.png', animations: 'disabled' })
    await runtime.page.getByRole('button', { name: '关闭节点详情', exact: true }).click()
    await panel.getByRole('combobox', { name: '筛选员工', exact: true }).selectOption('')
    await panel.locator('.trace-run-summary > summary').click()
    const current = panel.getByRole('region', { name: '本轮详情', exact: true })
    await expect(current).toHaveAttribute('data-turn-id', greeting.turnId!)
    await expect(current).toContainText('你们好啊')
    await expect(current.locator('.delivery-row')).toHaveCount(3)
    await expect(current.locator('.delivery-row small')).toHaveText([/^已回复/, /^已回复/, /^已回复/])
    await expect(current.locator('.run-card[data-run-id="' + failedRun.id + '"]')).toHaveCount(0)
    await expect(panel.getByText('OLD_ERR', { exact: false })).not.toBeVisible()
    await panel.getByRole('combobox', { name: '执行轮次', exact: true }).selectOption(`turn:${failedMessage.turnId}`)
    await expect(panel.locator('.trace-detail')).toHaveAttribute('data-turn-id', failedMessage.turnId!)
    await panel.locator('.trace-run-summary > summary').click()
    const history = panel.getByRole('region', { name: '历史轮次详情', exact: true })
    await expect(history).toHaveAttribute('data-turn-id', failedMessage.turnId!)
    await expect(history.locator('.run-card[data-run-id="' + failedRun.id + '"]')).toBeVisible()
    await expect(history.getByRole('button', { name: '重新尝试', exact: true })).toHaveCount(0)
    await history.locator('.error-details > summary').click()
    await expect(history).toContainText('OLD_ERR')
    await runtime.page.screenshot({ path: 'test-results/conversation-trace.png', animations: 'disabled' })
    await runtime.page.locator(`#message-${greetingReply.id}`).getByRole('button', { name: '查看 研究员 的执行过程', exact: true }).click()
    await expect(panel.locator('.trace-detail')).toHaveAttribute('data-turn-id', greeting.turnId!)
    await expect(panel.getByRole('combobox', { name: '筛选员工', exact: true })).toHaveValue('researcher')
    await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
    await expect(runtime.page.locator('.detail-content:visible')).toContainText('暂无工作任务')
    await expect(runtime.page.locator('.detail-content:visible .activity-round')).toHaveCount(0)

  }
  await checkActivity()
  return { runtime, launch, desktop, page, detail, successful, checkActivity }
}

async function verifyHistoryRestart(previous: Awaited<ReturnType<typeof inspectRoundActivity>>) {
  let { runtime, launch, desktop, page, detail, successful, checkActivity } = previous
  await runtime.close()
  desktop = await launch()
  page = await desktop.firstWindow()
  await checkActivity()
  expect((await detail()).messages).toHaveLength(successful.messages.length)
}

Given('历史群场景具备独立员工模型和已有群聊', async ({ runtime, scenario }) => {
  scenario.prepareHistory = await prepareHistory(runtime)
})

When('旧轮产生回复与失败后再次向全群问候', async ({ scenario }) => {
  scenario.startFreshGreeting = await startFreshGreeting(scenario.prepareHistory!)
})

Then('活动面板区分本轮回复与历史失败', async ({ scenario }) => {
  scenario.inspectRoundActivity = await inspectRoundActivity(scenario.startFreshGreeting!)
})

Then('重启后活动分组与消息数量保持不变', async ({ scenario }) => {
  await verifyHistoryRestart(scenario.inspectRoundActivity!)
})

Then('单聊回复图标打开自己的执行过程且切换会话不漂移', async ({ runtime, scenario }) => {
  const page = runtime.page
  const direct = await page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '研究员单聊', agentIds: ['researcher'] }))
  const message = await page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '单聊问候', mentionIds: [], requestId: 'direct-trace' }), direct.id)
  await expect.poll(async () => {
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), direct.id)
    return detail.turns?.find(turn => turn.id === message.turnId)?.status === 'completed' && detail.runs.every(run => run.status === 'completed')
  }).toBe(true)
  await page.locator('.conversation-item').filter({ hasText: '研究员单聊' }).click()
  await page.locator('.messages').getByRole('button', { name: '查看 研究员 的执行过程', exact: true }).click()
  const panel = page.locator('.detail-content:visible')
  await expect(panel.locator('.trace-detail')).toHaveAttribute('data-turn-id', message.turnId!)
  await expect(panel.getByRole('combobox', { name: '筛选员工', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('region', { name: '调用树与时间线' })).toBeVisible()
  await expect(page.locator('.composer-wrap .turn-status')).toHaveCount(0)
  await page.locator('.conversation-item').filter({ hasText: '已有历史的群' }).click()
  await expect(panel.locator('.trace-detail')).toHaveAttribute('data-turn-id', message.turnId!)
  await expect(panel.locator('.trace-trigger')).toHaveText('单聊问候')
  await page.evaluate(async () => { const appearance = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision }) })
  await page.setViewportSize({ width: 1100, height: 800 })
  await panel.getByRole('button', { name: '查看节点 模型请求', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: '节点详情', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/conversation-trace-dark.png', animations: 'disabled' })
  expect(runtime.errors).toEqual([])
})
