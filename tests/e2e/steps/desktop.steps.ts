/*
 * [OUTPUT]: 定时任务标题明确属于原列表侧栏，创建仍核对独立Dialog与会话草稿。
 * [OUTPUT]: bobo固定顶部分组保持；排序断言限定真实普通会话行，仍要求最近群在普通会话首位。
 * [OUTPUT]: 慢回复按当前ExecutionFeed实际流式正文及运行状态核验取消；不再要求过渡正文提前写成持久聊天消息。
 * [OUTPUT]: 私有判断禁工具而普通API聊天沿当前目录，实际零工具/零Work保持；现行定时Dialog/通讯录分区及记忆Dialog替代旧右侧整页。
 * [OUTPUT]: 离线群模型提供当前无工具群语义解释，保持原独立参与/格式修复/取消重启断言。
 * [OUTPUT]: 隔离目录使用实际realpath核验同一目录，保留数据归属和取消重启原断言。
 * [OUTPUT]: 人格与行为直接展示配置源文件，文件编辑保持独立Dialog及局部草稿守卫；本批仅维护源码，不运行E2E。
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 资源库为当前统一入口；群设置草稿沿通讯录导航守卫。
 * [INPUT]: 自主群聊隔离取消与重启的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 核心预置身份隔离、私聊记忆与群共享边界、慢回复取消和重启零重放；会话草稿、定时Dialog、文件详情宽度、通讯录分区放弃保护及员工配置/记忆/窄窗；本地Solar/Carbon图标原断言保持。
 * [POS]: tests/e2e/steps/desktop.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { isCoreAgent } from '../../../src/shared/domain/core-agent'
import { createBdd } from 'playwright-bdd'
import { messageDraft } from '../support/editor-controls'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { createServer } from 'node:http'
import { realpath } from 'node:fs/promises'

import { join } from 'node:path'
import type { ConversationDetail, Snapshot } from '../../../src/shared/domain'

type Scenario = {
  prepareCollaboration?: Awaited<ReturnType<typeof prepareCollaboration>>
  verifyConversationIsolation?: Awaited<ReturnType<typeof verifyConversationIsolation>>
  cancelSlowReply?: Awaited<ReturnType<typeof cancelSlowReply>>
  exerciseNavigation?: Awaited<ReturnType<typeof exerciseNavigation>>
  editEmployeeResources?: Awaited<ReturnType<typeof editEmployeeResources>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareCollaboration(runtime: Desktop) {
  const requests: any[] = []
  let malformedGreetingDecisionSent = false
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body || '{}')
    requests.push(input)
    const system =
      input.messages
        ?.filter((m: any) => m.role === 'system')
        .map((m: any) => m.content)
        .join('\n') ?? ''
    const employee = input.model?.replace('test-', '') ?? 'researcher'
    const visible = (input.messages ?? []).filter((m: any) => m.role !== 'system')
    const lastUser = [...visible].reverse().find((m: any) => m.role === 'user' && !String(m.content).startsWith('[Conversation background'))
    const text = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content)
    let response = ''
    if (system.includes('Private group request interpretation')) {
      response = JSON.stringify({ mode: 'independent' })
    } else if (system.includes('Private participation decision')) {
      const payload = JSON.parse(visible.at(-1)?.content ?? '{}')
      const conversation = payload.data.currentTurnMessages
      const trigger = conversation.find((m: any) => m.id === payload.data.currentTurn.rootMessageId)
      const fresh = conversation.slice(conversation.indexOf(trigger) + 1)
      const alreadyReplied = fresh.some((m: any) => m.senderType === 'agent' && m.senderId === employee)
      const peerResponded = fresh.some((m: any) => m.senderType === 'agent' && m.senderId === 'researcher')
      const action = alreadyReplied
        ? 'pass'
        : trigger?.content.includes('你们好')
          ? employee === 'researcher' || (employee === 'writer' && peerResponded)
            ? 'reply'
            : 'pass'
          : 'reply'
      response = JSON.stringify({ action, responseKind: 'chat', purpose: '自己的有效回应' })
      if (employee === 'researcher' && trigger?.content === '你们好' && !payload.repair && !malformedGreetingDecisionSent) {
        response = '您好，我是研究员。这段错误格式不应作为公开回复。'
        malformedGreetingDecisionSent = true
      }
    } else if (system.includes('Private memory maintenance')) {
      const source = JSON.parse(visible.at(-1)?.content ?? '{}').data?.currentTurnMessages?.find(
        (m: any) => m.senderType === 'user' && m.content.includes('PRIVATE_SENTINEL'),
      )
      response = JSON.stringify({
        candidates: source ? [{ content: 'PRIVATE_SENTINEL_7321 是用户私聊保留的记忆', sourceMessageIds: [source.id], sourceResourceIds: [] }] : [],
      })
    } else
      response =
        employee === 'writer'
          ? '写手补充：我看到了研究员的回复。'
          : employee === 'reviewer'
            ? '审核员的公开回复。'
            : '研究员的公开回复：你好，很高兴一起交流。'
    if (!input.stream) {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'test',
          object: 'chat.completion',
          created: 1,
          model: input.model,
          choices: [{ index: 0, message: { role: 'assistant', content: response }, finish_reason: 'stop' }],
        }),
      )
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const chunk = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      )
    const slow = text?.includes('SLOW_TASK') && !system.includes('Private participation decision') && !system.includes('Private memory maintenance')
    chunk({ role: 'assistant', content: slow ? '正在回复。' : '' })
    const timer = setTimeout(
      () => {
        if (!res.destroyed) {
          chunk({ content: response })
          chunk({}, 'stop')
          res.end('data: [DONE]\n\n')
        }
      },
      slow ? 30_000 : 20,
    )
    res.on('close', () => clearTimeout(timer))
  })
  runtime.trackServer(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const dataPath = runtime.root
  let desktop: ElectronApplication | undefined
  const launch = async () => {
    const launched = await runtime.start({ dataDir: dataPath })
    const page = await launched.firstWindow()
    await page.waitForFunction(() => Boolean(window.boai))
    return { launched, page }
  }
  const snapshot = (page: Page) => page.evaluate(() => window.boai.request('snapshot', undefined))
  const detail = (page: Page, id: string) => page.evaluate((id) => window.boai.request('getConversation', { id }), id)

  let current = await launch()
  desktop = current.launched
  let page = current.page
  const initial = (await snapshot(page)) as Snapshot
  expect(await realpath(initial.dataPath)).toBe(await realpath(join(dataPath, 'v2')))
  const connection = await page.evaluate(
    (port) =>
      window.boai.request('saveConnection', {
        name: '本地协议测试',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        defaultModel: 'test-researcher',
      }),
    port,
  )
  for (const agent of initial.agents.filter(agent => !isCoreAgent(agent)))
    await page.evaluate(
      ({ agent, connectionId }) => {
        const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
        return window.boai.request('saveAgent', { ...input, connectionId, modelId: `test-${agent.id}`, expectedConfigVersion: configVersion })
      },
      { agent, connectionId: connection.id },
    )
  const direct = await page.evaluate(
    (agentId) => window.boai.request('createConversation', { kind: 'direct', title: '私聊验证', agentIds: [agentId] }),
    initial.agents[0].id,
  )
  const send = (conversationId: string, content: string, mentionIds: string[], requestId: string) =>
    page.evaluate((input) => window.boai.request('sendMessage', input), { conversationId, content, mentionIds, requestId })
  const settled = async (id: string) => {
    const d = await detail(page, id)
    return Boolean(
      d.turns?.length &&
      d.turns.every((turn) => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'].includes(turn.status)) &&
      d.runs.every((run) => !['queued', 'running', 'waiting_approval'].includes(run.status)),
    )
  }
  return { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, send, settled }
}

async function verifyConversationIsolation(previous: Awaited<ReturnType<typeof prepareCollaboration>>) {
  let { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, send, settled } = previous
  await page.evaluate(c => window.boai.request('createConversation', { id: c.id, kind: c.kind, title: c.title, agentIds: c.agentIds, memoryScope: 'conversation' }), direct)
  await send(direct.id, 'PRIVATE_SENTINEL_7321，请记住这个私聊约定', [], 'private-1')
  await expect.poll(() => settled(direct.id), { timeout: 40000 }).toBe(true)
  const privateMemory = await page.evaluate((input) => window.boai.request('getMemory', input), {
    agentId: 'researcher',
    scope: 'employee' as const,
    sourceConversationId: direct.id,
  })
  expect(privateMemory.entries[0]?.content).toContain('PRIVATE_SENTINEL')
  const group = await page.evaluate(
    (agentIds) => window.boai.request('createConversation', { kind: 'group', title: '方案讨论群', agentIds }),
    initial.agents.filter(agent => !isCoreAgent(agent)).map((a) => a.id),
  )
  const requestStart = requests.length
  await send(group.id, '你们好', [], 'group-1')
  await expect.poll(() => settled(group.id), { timeout: 40000 }).toBe(true)
  const groupDetail = (await detail(page, group.id)) as ConversationDetail
  const publicMessages = groupDetail.messages.filter((m) => m.senderType === 'agent' && m.status === 'completed')
  expect(publicMessages.map((m) => m.senderId)).toEqual(['researcher', 'writer'])
  expect(groupDetail.deliveries?.some((d) => d.agentId === 'reviewer' && d.status === 'passed')).toBe(true)
  expect(groupDetail.decisions?.some((d) => d.agentId === 'writer' && d.action === 'pass')).toBe(true)
  expect(groupDetail.decisions?.some((d) => d.agentId === 'writer' && d.action === 'reply')).toBe(true)
  expect(groupDetail.turns?.at(-1)?.status).toBe('completed')
  expect(groupDetail.messages.every((message) => !message.content.includes('这段错误格式'))).toBe(true)
  expect(
    requests.slice(requestStart).filter((request) => request.messages.some((m: any) => m.role === 'user' && String(m.content).includes('"repair":'))),
  ).toHaveLength(1)
  expect(JSON.stringify(requests.slice(requestStart))).not.toContain('PRIVATE_SENTINEL')
  const privateRequests = requests.slice(requestStart).filter(request => request.messages.some((message: any) => message.role === 'system' && /Private (participation decision|memory maintenance|group request interpretation)/.test(String(message.content))))
  expect(privateRequests.length).toBeGreaterThan(0)
  expect(privateRequests.every(request => !request.tools?.length)).toBe(true)
  expect(groupDetail.workItems).toHaveLength(0)
  expect(groupDetail.runs.every((run) => run.toolEvents.length === 0)).toBe(true)
  await send(group.id, '你们好', [], 'group-1')
  expect((await detail(page, group.id)).messages.filter((m) => m.senderType === 'user')).toHaveLength(1)
  return { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, send, settled, group }
}

async function cancelSlowReply(previous: Awaited<ReturnType<typeof verifyConversationIsolation>>) {
  let { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, send, settled, group } = previous
  // System-file edit is authoritative and reflected in the next real SDK request.
  const source = await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))
  const agentNow = (await snapshot(page)).agents.find((a) => a.id === 'researcher')!
  await page.evaluate((input) => window.boai.request('saveAgentFile', input), {
    agentId: 'researcher',
    name: 'SOUL.md' as const,
    content: 'STYLE_MARKER_2026。自然清楚地回复。',
    expectedHash: source.hash,
    expectedConfigVersion: agentNow.configVersion,
  })
  const beforeSlow = requests.length
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^方案讨论群/ }).click()
  await send(group.id, 'SLOW_TASK', ['researcher'], 'slow-1')
  await expect(page.getByText('正在回复。', { exact: true })).toBeVisible()
  expect((await detail(page, group.id)).runs.some(run => run.agentId === 'researcher' && run.status === 'running')).toBe(true)
  expect(JSON.stringify(requests.slice(beforeSlow))).toContain('STYLE_MARKER_2026')
  await page.evaluate((id) => window.boai.request('cancelRun', { conversationId: id }), group.id)
  await expect.poll(() => settled(group.id)).toBe(true)
  expect((await detail(page, group.id)).turns?.some((turn) => turn.status === 'cancelled')).toBe(true)
  return { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, group }
}

async function exerciseNavigation(previous: Awaited<ReturnType<typeof cancelSlowReply>>) {
  let { runtime, requests, desktop, launch, snapshot, detail, current, page, initial, direct, group } = previous
  // UI integration checks are kept in this end-to-end flow to cover real preload and process data.
  await expect(page.getByText('最近会话', { exact: true })).toHaveCount(0)
  await page.evaluate(
    (agentIds) => window.boai.request('createConversation', { kind: 'group', title: '尚未发消息的群', agentIds }),
    initial.agents.filter(agent => !isCoreAgent(agent)).map((a) => a.id),
  )
  await expect(page.getByRole('navigation', { name: '会话列表', exact: true }).locator('.conversation-row .conversation-item:not(.conversation-core-item)').first()).toContainText('方案讨论群')
  await expect.poll(() => page.locator('.app-icon').count()).toBeGreaterThan(10)
  const icons = await page.locator('.app-icon').evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length)
      .map((node) => {
        const style = getComputedStyle(node),
          rect = node.getBoundingClientRect()
        return { className: node.className, mask: style.maskImage, width: rect.width, height: rect.height }
      }),
  )
  expect(icons.length).toBeGreaterThan(0)
  expect(icons.every((icon) => /\bi-(?:carbon|solar)-/.test(icon.className))).toBe(true)
  expect(icons.every((icon) => icon.mask.includes('data:image/svg+xml') && icon.width > 0 && icon.height > 0)).toBe(true)
  await page.getByRole('button', { name: /^方案讨论群/ }).click()
  await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible()
  await page.getByRole('textbox', { name: '消息内容' }).fill('保留在这里的草稿')
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '定时任务列表', exact: true }).getByRole('heading', { name: '定时任务', exact: true })).toBeVisible()
  await page.getByRole('complementary', { name: '定时任务列表', exact: true }).getByRole('button', { name: '新建定时任务', exact: true }).click()
  await page.getByRole('menuitem', { name: '手动创建', exact: true }).click()
  const schedule = page.getByRole('dialog', { name: '新建定时任务', exact: true })
  await expect(schedule.getByRole('textbox', { name: '名称', exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await expect(schedule).toBeHidden()
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('保留在这里的草稿')
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '文件', exact: true }).click()
  await expect(page.getByRole('region', { name: '会话文件', exact: true })).toBeVisible()
  const separator = page.getByRole('separator', { name: '调整详情宽度' })
  const previousWidth = Number(await separator.getAttribute('aria-valuenow'))
  await separator.focus(); await separator.press('ArrowLeft')
  await expect(separator).toHaveAttribute('aria-valuenow', String(previousWidth + 10))
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const panel = page.getByRole('region', { name: '通讯录详情', exact: true })
  await expect(panel.getByRole('textbox', { name: '群聊名称', exact: true })).toHaveText('方案讨论群')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const original = (await detail(page, group.id)).conversation
  await panel.getByRole('button', { name: '编辑群聊设置', exact: true }).click()
  const scope = panel.getByRole('combobox', { name: '新交流的记忆范围', exact: true })
  await scope.click(); await page.getByRole('option', { name: '仅在此聊天使用', exact: true }).click()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资源库', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: '有未保存的修改', exact: true })).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(scope).toContainText('仅在此聊天使用')
  expect((await detail(page, group.id)).conversation).toEqual(original)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资源库', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '退出', exact: true }).click()
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: '群聊名称', exact: true })).toHaveText('方案讨论群')
  expect((await detail(page, group.id)).conversation).toEqual(original)
  return { runtime, requests, desktop, launch, snapshot, detail, current, page, direct, group, panel }
}

async function editEmployeeResources(previous: Awaited<ReturnType<typeof exerciseNavigation>>) {
  let { runtime, requests, desktop, launch, snapshot, detail, current, page, direct, group, panel } = previous
  await panel.getByRole('button', { name: '查看 研究员 的资料', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: '员工名称', exact: true })).toHaveText('研究员')
  await panel.getByRole('button', { name: '高级配置', exact: true }).click()
  const advanced = page.getByRole('dialog', { name: '高级配置', exact: true })
  await advanced.getByRole('tab', { name: '人格与行为', exact: true }).click()
  await advanced.getByRole('button', { name: '编辑 SOUL.md', exact: true }).click()
  const file = page.getByRole('dialog', { name: 'SOUL.md', exact: true })
  await file.getByRole('textbox', { name: 'SOUL.md 内容', exact: true }).fill('STYLE_MARKER_2026。由界面保存的新风格。')
  await file.getByRole('button', { name: '保存文件', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))).content).toContain('由界面保存')
  await file.getByRole('button', { name: '关闭配置源文件 SOUL.md', exact: true }).click()
  await advanced.getByRole('tab', { name: '记忆', exact: true }).click()
  await advanced.getByRole('combobox', { name: '来源聊天', exact: true }).click()
  await page.getByRole('option', { name: '方案讨论群', exact: true }).click()
  await advanced.getByRole('button', { name: '添加记忆', exact: true }).click()
  const memory = page.getByRole('dialog', { name: '添加记忆', exact: true })
  await memory.getByRole('textbox', { name: '新增记忆', exact: true }).fill('群内专属约定：所有结论需注明来源。')
  await memory.getByRole('combobox', { name: '使用范围', exact: true }).click()
  await page.getByRole('option', { name: '仅此聊天', exact: true }).click()
  await memory.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(memory).toBeHidden()
  await expect(advanced).toContainText('群内专属约定')
  await advanced.getByRole('button', { name: '忘记', exact: true }).click()
  await advanced.getByRole('button', { name: '确认忘记', exact: true }).click()
  await expect(advanced).toContainText('没有符合条件的记忆。')
  const privateMemory = await page.evaluate(id => window.boai.request('getMemory', { agentId: 'researcher', scope: 'employee', sourceConversationId: id }), direct.id)
  expect(privateMemory.entries).toHaveLength(1)
  expect(privateMemory.entries[0].content).toContain('PRIVATE_SENTINEL')
  await advanced.getByRole('tab', { name: '工作区', exact: true }).click()
  await expect(advanced).toContainText('agents/researcher/workspace')
  await page.screenshot({ path: 'test-results/v02-desktop-group.png', fullPage: true })
  for (const width of [1280, 1100, 900, 760]) {
    await desktop.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900), width)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(advanced.getByRole('button', { name: '关闭高级配置', exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/v02-width-${width}.png`, fullPage: true })
  }
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2))
  await expect(advanced.getByRole('button', { name: '关闭高级配置', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await advanced.getByRole('button', { name: '关闭高级配置', exact: true }).click()
  return { runtime, requests, desktop, launch, snapshot, detail, current, page, direct, group }
}

async function verifyDesktopRestart(previous: Awaited<ReturnType<typeof editEmployeeResources>>) {
  let { runtime, requests, desktop, launch, snapshot, detail, current, page, direct, group } = previous
  await runtime.close()
  const restartRequests = requests.length
  current = await launch()
  desktop = current.launched
  page = current.page
  const restored = await snapshot(page)
  expect(restored.conversations.some((c) => c.id === group.id)).toBe(true)
  expect((await detail(page, group.id)).messages.filter((m) => m.senderType === 'user')).toHaveLength(2)
  expect((await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))).content).toContain(
    'STYLE_MARKER',
  )
  const remembered = await page.evaluate((input) => window.boai.request('getMemory', input), {
    agentId: 'researcher',
    scope: 'employee' as const,
    sourceConversationId: direct.id,
  })
  expect(remembered.entries).toHaveLength(1)
  expect(requests.length).toBe(restartRequests)
  expect(JSON.stringify(restored)).not.toContain('apiKey')
}

Given('群聊场景具备本地模型协议服务和独立员工', async ({ runtime, scenario }) => {
  scenario.prepareCollaboration = await prepareCollaboration(runtime)
})

When('私聊记忆与群聊自主判断按会话隔离', async ({ scenario }) => {
  scenario.verifyConversationIsolation = await verifyConversationIsolation(scenario.prepareCollaboration!)
})

Then('系统文件立即影响模型且慢回复可停止', async ({ scenario }) => {
  scenario.cancelSlowReply = await cancelSlowReply(scenario.verifyConversationIsolation!)
})

When('桌面导航和详情编辑保留草稿与未保存保护', async ({ scenario }) => {
  scenario.exerciseNavigation = await exerciseNavigation(scenario.cancelSlowReply!)
})

Then('员工文件记忆和窄窗口详情正常工作', async ({ scenario }) => {
  scenario.editEmployeeResources = await editEmployeeResources(scenario.exerciseNavigation!)
})

Then('重启保留群聊与私聊记忆且不重放模型调用', async ({ scenario }) => {
  await verifyDesktopRestart(scenario.editEmployeeResources!)
})
