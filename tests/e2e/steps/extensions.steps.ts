/*
 * [INPUT]: 主题外部执行与自动化持久化的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 本人菜单进入设置并保留外观/原生窗口完整断言； 缩放通过产品外观接口覆盖支持上限 150% 和越界 200% 拒绝，保留窄窗全部布局断言；分页最早记录在运行记录区域断言，不命中侧栏同名计划；主题选择使用实际 Base UI 语义操作；适配七项表单/总览筛选/菜单操作与运行明细，保留原业务断言；普通与自动化聊天共同可见，无来源下拉且保留来源标记；330 条新记录后的真实旧等待/筛选/补充解除与最新结果置顶；追加额度确认/取消、累计用量回执与确认消息定位/重启；真实主进程/worker 通知回执、静音、窗口重载与精确消息/无消息记录定位；现有详情标签的多草稿/冲突/窄窗保存、独立聊天/星期多选/纯预览、历史分页/结果消息定位验收；实际补充入口/原始预算及明确轮次关联的重启验收；主题外部执行与自动化持久化、运行结束/交付待核对分别展示、跨轮次来源持久化断言；外观无保存状态提示、高级 Card 的 Slider 键盘预览和持久化。
 * [POS]: tests/e2e/steps/extensions.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { openSchedule, scheduleAction, selectScheduleOption, previewSchedule, scheduleTarget } from '../support/schedule-controls'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { prepareExternalTask, loseExternalTaskReceipt, failExternalTaskStartupSnapshot } from '../support/external-task'
import { captureAutomationNotifications, notificationCount, notificationEvent } from '../support/automation-notifications'
import { seedAutomationHistory, seedExpiredAutomationBudget } from '../support/automation-history'
import type { Desktop } from '../support/desktop'
import { rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'

type Scenario = {
  prepareExtensions?: Awaited<ReturnType<typeof prepareExtensions>>
  customizeThemeAndBackground?: Awaited<ReturnType<typeof customizeThemeAndBackground>>
  executeExternalTask?: Awaited<ReturnType<typeof executeExternalTask>>
  runAutomationAndBackup?: Awaited<ReturnType<typeof runAutomationAndBackup>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareExtensions(runtime: Desktop) {
  const root = runtime.root
  let desktop: ElectronApplication | undefined
  let page: Page
  const errors: string[] = runtime.errors
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const input = JSON.parse(raw),
      system = input.messages
        .filter((m: any) => m.role === 'system')
        .map((m: any) => m.content)
        .join('')
    let response = '定时整理已完成。'
    if (system.includes('Private participation decision')) {
      const payload = JSON.parse(input.messages.at(-1).content),
        replied = payload.data.currentTurnMessages.some((m: any) => m.senderType === 'agent')
      const root = payload.data.currentTurnMessages.find((m: any) => m.id === payload.data.originalUserRequestId)
      if (root?.content === '等待用户补充的自动化') response = JSON.stringify({ action: replied ? 'pass' : 'ask', responseKind: 'chat', purpose: '等待明确补充' })
      else if (root?.content === '收到补充 42' && !payload.data.continuation) throw new Error('Missing host clarification context')
      else response = JSON.stringify({ action: replied ? 'pass' : 'reply', responseKind: 'chat', purpose: '完成例行报告' })
    } else if (system.includes('Private memory maintenance')) response = '{"candidates":[]}'
    if (!input.stream) {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'fixture',
          object: 'chat.completion',
          model: input.model,
          choices: [{ index: 0, message: { role: 'assistant', content: response }, finish_reason: 'stop' }],
        }),
      )
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(
      `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta: { role: 'assistant', content: response }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
    )
  })
  runtime.trackServer(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const launch = async () => {
    desktop = await runtime.start({ dataDir: root })
    page = await desktop.firstWindow()
    await page.waitForFunction(() => Boolean(window.boai))
    await page.evaluate(() => window.boai.request('snapshot', undefined))
  }

  await launch()
  desktop = runtime.app
  page = runtime.page
  return { runtime, root, desktop, page, errors, port, launch }
}

async function customizeThemeAndBackground(previous: Awaited<ReturnType<typeof prepareExtensions>>) {
  let { runtime, root, desktop, page, errors, port, launch } = previous
  await page!.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page!.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page!.getByRole('button', { name: '外观', exact: true }).click()
  await page!.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page!.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { mode: 'dark' } })
  await expect(page!.getByRole('status').filter({ hasText: '已保存' })).toHaveCount(0)
  await page!.getByRole('combobox', { name: '深色配色', exact: true }).click()
  await page!.getByRole('option', { name: 'Nord', exact: true }).click()
  await expect(page!.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  await expect(page!.getByRole('heading', { name: '高级设置', exact: true })).toBeVisible()
  const imagePath = join(root, 'background.png')
  await writeFile(
    imagePath,
    Buffer.from(
      await page!.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        const ctx = canvas.getContext('2d')!,
          gradient = ctx.createLinearGradient(0, 0, 640, 480)
        gradient.addColorStop(0, '#3b526c')
        gradient.addColorStop(1, '#746b61')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 640, 480)
        return canvas.toDataURL('image/png').split(',')[1]
      }),
      'base64',
    ),
  )
  await desktop!.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, imagePath)
  await expect(page!.getByRole('button', { name: '选择图片' })).toBeEnabled()
  await page!.getByRole('button', { name: '选择图片' }).click()
  await expect(page!.getByRole('button', { name: '移除图片' })).toBeVisible()
  await rm(imagePath)
  const webpPath = join(root, 'background.webp')
  await writeFile(
    webpPath,
    Buffer.from(
      await page!.evaluate(() => {
        const c = document.createElement('canvas')
        c.width = 640
        c.height = 480
        const x = c.getContext('2d')!
        x.fillStyle = '#6583a3'
        x.fillRect(0, 0, 640, 480)
        return c.toDataURL('image/webp').split(',')[1]
      }),
      'base64',
    ),
  )
  await desktop!.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, webpPath)
  await page!.getByRole('button', { name: '更换图片' }).click()
  await expect
    .poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined)))
    .toMatchObject({ preferences: { background: { assetId: expect.stringMatching(/\.webp$/) } } })
  await rm(webpPath)
  const appearance = await page!.evaluate(() => window.boai.request('getAppearance', undefined))
  expect(appearance.preferences.background.assetId).toBeTruthy()
  const loaded = await page!.evaluate(
    (id) =>
      new Promise<boolean>((resolve) => {
        const image = new Image()
        image.onload = () => resolve(true)
        image.onerror = () => resolve(false)
        image.src = `boai-asset://appearance/${id}`
      }),
    appearance.preferences.background.assetId,
  )
  expect(loaded).toBe(true)
  const opacity = page!.getByRole('slider', { name: '图片不透明度', exact: true })
  await opacity.press('Home')
  await expect(page!.locator('#appearance-background')).toHaveCSS('opacity', '0')
  await opacity.press('End')
  await expect(page!.locator('#appearance-background')).toHaveCSS('opacity', '1')
  await opacity.press('Home')
  await opacity.press('PageUp')
  await opacity.press('PageUp')
  await expect(page!.locator('#appearance-background')).toHaveCSS('opacity', '0.2')
  await expect.poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { background: { imageOpacity: 0.2 } } })
  await page!.getByRole('button', { name: '跟随系统', exact: true }).click()
  await expect.poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { mode: 'system' } })
  await desktop!.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'shouldUseDarkColors', { configurable: true, get: () => true })
    nativeTheme.emit('updated')
  })
  await expect(page!.locator('html')).toHaveAttribute('data-theme', 'dark')
  await desktop!.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'shouldUseDarkColors', { configurable: true, get: () => false })
    nativeTheme.emit('updated')
  })
  await expect(page!.locator('html')).toHaveAttribute('data-theme', 'light')
  await page!.getByRole('button', { name: '深色', exact: true }).click()
  await page!.screenshot({ path: 'test-results/appearance-dark.png' })
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 800))
  await page!.screenshot({ path: 'test-results/appearance-narrow.png' })
  expect(await page!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1340, 900))
  await expect(page!.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    return window.boai.request('updateAppearance', { expectedRevision: appearance.revision, patch: { zoomFactor: 2 } })
  })).rejects.toThrow()
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 800))
  await page!.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { expectedRevision: appearance.revision, patch: { zoomFactor: 1.5 } })
  })
  expect(await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(1.5)
  await page!.getByRole('button', { name: '恢复默认外观' }).scrollIntoViewIfNeeded()
  await expect(page!.getByRole('button', { name: '恢复默认外观' })).toBeInViewport()
  const zoomLayout = await page!.evaluate(() => {
    const nav = document.querySelector('.page-subnav')!
    return {
      viewport: innerWidth,
      navFits: nav.scrollWidth <= nav.clientWidth,
      outsideControls: Array.from(document.querySelectorAll('.appearance-settings button,.appearance-settings select,.appearance-settings input:not([aria-hidden=true]):not([type=hidden])')).flatMap(element => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth ? [] : [{ name: element.getAttribute('aria-label') ?? element.textContent, left: rect.left, right: rect.right }]
      }),
    }
  })
  expect(zoomLayout.navFits).toBe(true)
  expect(zoomLayout.outsideControls, JSON.stringify(zoomLayout)).toEqual([])
  const zoomImage = await desktop!.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  )
  await writeFile('test-results/appearance-zoom.png', Buffer.from(zoomImage, 'base64'))
  await page!.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { expectedRevision: appearance.revision, patch: { zoomFactor: 1 } })
  })
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1340, 900))
  return { runtime, root, desktop, page, errors, port, launch }
}

async function executeExternalTask(previous: Awaited<ReturnType<typeof customizeThemeAndBackground>>) {
  let { runtime, root, desktop, page, errors, port, launch } = previous
  const node = process.execPath,
    fixture = resolve('tests/fixtures/acp-agent.mjs')
  const profile = await page!.evaluate(
    async ({ node, fixture }) => {
      const p = await window.boai.request('saveLaunchProfile', {
        name: '协议测试 Agent',
        executable: node,
        args: [fixture],
        useExistingLogin: false,
        hostAccessAcknowledged: true,
      })
      return window.boai.request('testLaunchProfile', { id: p.id })
    },
    { node, fixture },
  )
  expect(profile.verified?.name).toBe('boai-protocol-fixture')
  const ext = await page!.evaluate(async (profileId) => {
    const snap = await window.boai.request('snapshot', undefined),
      a = snap.agents.find((a) => a.id === 'writer')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = a
    await window.boai.request('saveAgent', { ...input, executionBackend: { kind: 'acp-local', profileId }, connectionId: '' })
    return window.boai.request('createConversation', { kind: 'direct', title: '外部任务验收', agentIds: [a.id] })
  }, profile.id)
  await page!.evaluate(
    (c) => window.boai.request('sendExternalTask', { conversationId: c, content: '生成验收文件', requestId: 'e2e-external' }),
    ext.id,
  )
  await expect
    .poll(async () => {
      const d = await page!.evaluate((id) => window.boai.request('getConversation', { id }), ext.id)
      return d.runs[0]?.status
    })
    .toBe('completed')
  const extDetail = await page!.evaluate((id) => window.boai.request('getConversation', { id }), ext.id)
  await page!.evaluate((runId) => window.boai.request('publishExternalArtifact', { runId, relativePath: 'report.txt' }), extDetail.runs[0].id)
  expect((await page!.evaluate((id) => window.boai.request('getConversation', { id }), ext.id)).artifacts[0]?.name).toBe('report.txt')
  return { runtime, root, desktop, page, errors, port, launch, fixture }
}

async function prepareAutomationConversation(page: Page, port: number) {
  return page.evaluate(async (port) => {
    const connection = await window.boai.request('saveConnection', {
      name: '本地验收模型',
      provider: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      defaultModel: 'fixture',
    })
    const a = (await window.boai.request('snapshot', undefined)).agents.find((a) => a.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = a
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id })
    return window.boai.request('createConversation', { kind: 'direct', title: '每日整理验收', agentIds: [a.id] })
  }, port)
}

async function runAutomationAndBackup(previous: Awaited<ReturnType<typeof executeExternalTask>>) {
  let { runtime, root, desktop, page, errors, port, launch, fixture } = previous
  const conversation = await prepareAutomationConversation(page!, port)
  await page!.getByRole('button', { name: '定时任务', exact: true }).click()
  await page!.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  await page!.getByLabel('标题', { exact: true }).fill('每日资料整理')
  await scheduleTarget(page!, 'conversation', conversation.title + ' · 单聊')
  await page!.getByLabel('任务描述', { exact: true }).fill('整理今天的工作要点。')
  await page!.locator('.detail-content:visible').getByRole('button', { name: '创建', exact: true }).click()
  await scheduleAction(page!, '暂停计划')
  await expect(page!.getByRole('region', { name: '计划摘要' })).toContainText('已暂停')
  await scheduleAction(page!, '立即运行一次')
  await expect(page!.getByText('运行结束', { exact: true })).toBeVisible()
  await expect(page!.getByText('交付待核对', { exact: true })).toBeVisible()
  await page!.getByText('运行明细', { exact: true }).click()
  await expect(page!.getByText(/本次累计预算：.*24 次模型请求/)).toBeVisible()
  const occurrenceBeforeRestart = (await page!.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences[0]
  expect(occurrenceBeforeRestart.budget).toMatchObject({ maxModelCalls: 24, maxRuns: 8, runs: 0 })
  await page!.screenshot({ path: 'test-results/automation-results.png' })
  const backupDir = join(root, 'exports')
  await mkdir(backupDir)
  await desktop!.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, backupDir)
  const backup = await page!.evaluate(() => window.boai.request('exportBackup', undefined))
  expect(JSON.parse(await readFile(join(backup!, 'backup.json'), 'utf8')).appearanceIncluded).toBe(true)
  return { runtime, desktop, page, errors, launch, occurrenceBeforeRestart }
}

async function verifyExtensionsRestart(previous: Awaited<ReturnType<typeof runAutomationAndBackup>>) {
  let { runtime, desktop, page, errors, launch, occurrenceBeforeRestart } = previous
  await runtime.close()
  await launch()
  desktop = runtime.app
  page = runtime.page
  await expect(page!.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  const view = await page!.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(view.occurrences).toHaveLength(1)
  expect(view.occurrences[0].status).toBe('completed')
  expect(view.occurrences[0].deliveryStatus).toBe('unknown')
  expect(view.occurrences[0].usageIncomplete).toBe(true)
  expect(view.occurrences[0].budgetId).toBe(occurrenceBeforeRestart.budgetId)
  expect(view.occurrences[0].budget).toEqual(occurrenceBeforeRestart.budget)
  expect(view.occurrences[0].modelCalls).toBe(occurrenceBeforeRestart.modelCalls)
  expect(view.occurrences[0].turnIds).toEqual([view.occurrences[0].turnId])
  const detail = await page!.evaluate((id) => window.boai.request('getConversation', { id }), view.occurrences[0].conversationId)
  expect(detail.runs.every(run => run.origin?.occurrenceId === view.occurrences[0].id)).toBe(true)
  expect(errors).toEqual([])
}

Given('扩展场景具备独立桌面与本地模型', async ({ runtime, scenario }) => {
  scenario.prepareExtensions = await prepareExtensions(runtime)
})

When('保存主题和受管背景并验证窄窗口', async ({ scenario }) => {
  scenario.customizeThemeAndBackground = await customizeThemeAndBackground(scenario.prepareExtensions!)
})

Then('外部协议任务发布真实文件', async ({ scenario }) => {
  scenario.executeExternalTask = await executeExternalTask(scenario.customizeThemeAndBackground!)
})

When('手动运行自动化并导出包含外观的备份', async ({ scenario }) => {
  scenario.runAutomationAndBackup = await runAutomationAndBackup(scenario.executeExternalTask!)
})

Then('重启恢复主题与已完成的自动化记录', async ({ scenario }) => {
  await verifyExtensionsRestart(scenario.runAutomationAndBackup!)
})

When('从等待记录补充信息并沿用本次预算', async ({ scenario }) => {
  const { runtime, page, port } = scenario.prepareExtensions!
  const conversation = await prepareAutomationConversation(page, port)
  const plan = await page.evaluate(id => window.boai.request('saveAutomation', { name: '等待补充验收', prompt: '等待用户补充的自动化', conversationId: id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }), conversation.id)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(page, '等待补充验收')
  await scheduleAction(page, '立即运行一次')
  await expect(page.getByText('等待补充', { exact: true })).toBeVisible()
  const before = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences[0]
  await page.getByRole('button', { name: '补充信息', exact: true }).click()
  await page.getByRole('region', { name: '原消息问题', exact: true }).getByRole('button', { name: '回复此问题', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('收到补充 42')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(page.getByText('运行结束', { exact: true })).toBeVisible()
  await expect(page.getByText('交付待核对', { exact: true })).toBeVisible()
  const after = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences[0]
  expect(after.automationId).toBe(plan.id)
  expect(after.budgetId).toBe(before.budgetId)
  expect(after.budget?.deadlineAt).toBe(before.budget?.deadlineAt)
  expect(after.modelCalls!).toBeGreaterThan(before.modelCalls!)
  expect(after.waitingTurnIds).toEqual([])
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  const reply = detail.messages.find(message => message.content === '收到补充 42')!
  expect(reply.senderId).toBe('user')
  expect(reply.origin?.occurrenceId).toBe(before.id)
  expect(reply.inboxReply).toMatchObject({ questionId: `occurrence:${before.id}`, questionRevision: before.stateVersion })
  expect(detail.turns!.find(turn => turn.id === reply.turnId)?.replyToTurnIds).toEqual([before.turnId])
  await runtime.restart()
  const restored = (await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences[0]
  expect(restored).toMatchObject({ id: after.id, status: 'completed', budgetId: after.budgetId, modelCalls: after.modelCalls, waitingTurnIds: [] })
  expect(runtime.errors).toEqual([])
})

When('在详情标签中保存独立计划并验证草稿和任务聊天', async ({ scenario }) => {
  const { runtime, page, port } = scenario.prepareExtensions!
  const personal = await prepareAutomationConversation(page, port)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '定时执行说明', exact: true }).click()
  const tabs = page.getByRole('tablist', { name: '详情标签' })
  const editor = page.locator('.detail-content:visible')
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  await expect(editor.getByLabel('标题', { exact: true })).toBeFocused()
  await expect(editor.getByRole('combobox', { name: '通知', exact: true })).toContainText('重要更新')
  await editor.getByLabel('标题', { exact: true }).fill('面板日报')
  await page.getByLabel('任务描述', { exact: true }).fill('整理本次的资料要点。')
  await scheduleTarget(page, 'employee', '研究员')
  await previewSchedule(page)
  await page.getByRole('button', { name: '时间', exact: true }).click()
  await page.getByLabel('时区', { exact: true }).fill('Invalid/Zone')
  await expect(editor.getByRole('alert')).toContainText('时区')
  await expect(page.locator('.detail-content:visible').getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  await page.getByLabel('时区', { exact: true }).fill('Asia/Singapore')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '重复', exact: true }).click()
  await selectScheduleOption(page, '重复规则', '工作日（周一至周五）')
  await page.keyboard.press('Escape')
  await previewSchedule(page)
  await expect(page.getByRole('checkbox', { name: '星期三', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重复', exact: true }).click()
  await selectScheduleOption(page, '重复规则', '每周选日')
  await page.getByRole('checkbox', { name: '星期三', exact: true }).check()
  await page.getByRole('checkbox', { name: '星期五', exact: true }).check()
  await page.keyboard.press('Escape')
  await previewSchedule(page)
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('面板日报')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 640))
  const draftScroll = await page.locator('.detail-content:visible .editor-scroll').evaluate(element => { element.scrollTop = 160; return element.scrollTop })
  expect(draftScroll).toBeGreaterThan(0)
  await tabs.getByRole('tab', { name: '任务详情', exact: true }).click()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect(page.locator('.detail-panel')).toBeHidden()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await tabs.getByRole('tab', { name: '新建定时任务', exact: true }).click()
  expect(await page.locator('.detail-content:visible .editor-scroll').evaluate(element => element.scrollTop)).toBe(draftScroll)
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('面板日报')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 800))
  const create = page.locator('.detail-content:visible').getByRole('button', { name: '创建', exact: true })
  await expect(create).toBeInViewport()
  await page.screenshot({ path: 'test-results/automation-editor-narrow.png', animations: 'disabled' })
  await create.click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '面板日报', exact: true })).toBeVisible()
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1340, 900))
  await scheduleAction(page, '暂停计划')
  const original = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === '面板日报')!
  expect(original).toMatchObject({ conversationPolicy: 'new-conversation', employeeIds: ['researcher'], daysOfWeek: [1, 3, 5], cron: '0 9 * * 1,3,5', enabled: false, notificationPolicy: 'important_only' })
  expect(original.conversationId).toBeUndefined()
  await page.getByRole('button', { name: /^编辑/ }).click()
  await editor.getByLabel('标题', { exact: true }).fill('A 的未保存草稿')
  const second = await page.evaluate(conversationId => window.boai.request('saveAutomation', { name: '另一计划', prompt: '整理内容', conversationId, frequency: 'daily', time: '10:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }), personal.id)
  await openSchedule(page, '另一计划')
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('A 的未保存草稿')
  await page.getByRole('button', { name: /^编辑/ }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(3)
  await expect(editor.getByRole('combobox', { name: '通知', exact: true })).toContainText('静音')
  await editor.getByLabel('标题', { exact: true }).fill('B 的已保存修改')
  await tabs.getByRole('tab', { name: '面板日报', exact: true }).click()
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('A 的未保存草稿')
  await page.evaluate(d => window.boai.request('saveAutomation', { id: d.id, expectedRevision: d.revision, name: '并发新名称', prompt: d.prompt, conversationPolicy: d.conversationPolicy, employeeIds: d.employeeIds, frequency: d.frequency, time: d.time, weekday: d.weekday, daysOfWeek: d.daysOfWeek, timezone: d.timezone, enabled: false, notify: false }), original)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('配置已变更')
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('A 的未保存草稿')
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await tabs.getByRole('tab', { name: '另一计划', exact: true }).click()
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('B 的已保存修改')
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '保存并退出', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  const saved = await page.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(saved.definitions.find(d => d.id === second.id)?.name).toBe('B 的已保存修改')
  expect(saved.definitions.find(d => d.id === original.id)?.name).toBe('并发新名称')
  await openSchedule(page, '并发新名称')
  await scheduleAction(page, '立即运行一次')
  await expect(page.getByText('运行结束', { exact: true })).toHaveCount(1)
  await scheduleAction(page, '立即运行一次')
  await expect(page.getByText('运行结束', { exact: true })).toHaveCount(2)
  const occurrences = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.filter(o => o.automationId === original.id)
  expect(new Set(occurrences.map(o => o.conversationId)).size).toBe(2)
  expect(occurrences.every(o => o.conversationId !== personal.id)).toBe(true)
  const old = occurrences[1]
  await page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: Array.from({ length: 40 }, (_, index) => `较晚的人工作业备注 ${index}\n\n`).join(''), mentionIds: [], requestId: 'later-human' }), old.conversationId)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), old.conversationId)).turns?.every(turn => turn.status === 'completed')).toBe(true)
  const card = page.locator(`[data-occurrence-id="${old.id}"]`)
  await card.getByText('结果与证据', { exact: true }).click()
  await expect(card.locator('.automation-result-text')).toHaveText('定时整理已完成。')
  await card.getByRole('button', { name: '定位这条结果', exact: true }).click()
  const target = page.locator(`[id="message-${old.resultMessageIds.at(-1)}"]`)
  await expect(target).toBeFocused()
  await expect(target).toBeInViewport()
  expect(await page.locator('.messages').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeGreaterThan(300)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.getByLabel('会话来源', { exact: true })).toHaveCount(0)
  await expect(page.locator('.conversation-item').filter({ hasText: '定时任务 · ' })).toHaveCount(2)
  await expect(page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: personal.title, exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '普通单聊复用', agentIds: ['researcher'] }))).toMatchObject({ id: personal.id })
  await runtime.restart()
  const restored = await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(restored.occurrences.map(o => o.conversationId).sort()).toEqual(occurrences.map(o => o.conversationId).sort())
  expect(runtime.errors).toEqual([])
})

When('按计划分页读取全部历史且不误报未知交付', async ({ scenario }) => {
  const { page, port } = scenario.prepareExtensions!
  const conversation = await prepareAutomationConversation(page, port)
  const plans = await page.evaluate(async conversationId => {
    const input = { prompt: '读取固定历史', conversationId, frequency: 'daily' as const, time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }
    return [await window.boai.request('saveAutomation', { ...input, name: '完整历史' }), await window.boai.request('saveAutomation', { ...input, name: '独立筛选' })]
  }, conversation.id)
  const dataPath = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedAutomationHistory(dataPath, plans[0].id, 65)
  await seedAutomationHistory(dataPath, plans[1].id, 2)
  expect((await page.evaluate(() => window.boai.request('listAutomationHistory', { limit: 100 }))).occurrences).toHaveLength(67)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(page, '完整历史')
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(30)
  await expect(page.getByText('交付待核对', { exact: true })).toHaveCount(30)
  await page.getByRole('button', { name: '加载更早记录', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(60)
  await page.getByRole('button', { name: '加载更早记录', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(65)
  await expect(page.getByRole('region', { name: '运行记录', exact: true }).getByText('过往记录 0', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '加载更早记录', exact: true })).toHaveCount(0)
  expect(new Set(await page.locator('[data-occurrence-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-occurrence-id')))).size).toBe(65)
  await openSchedule(page, '独立筛选')
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '加载更早记录', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(30)
})

When('从完整历史找到待处理事项且优先阅读续行结果', async ({ scenario }) => {
  const { runtime, page, port } = scenario.prepareExtensions!
  const conversation = await prepareAutomationConversation(page, port)
  const plan = await page.evaluate(async conversationId => {
    const input = { conversationId, frequency: 'daily' as const, time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }
    await window.boai.request('saveAutomation', { ...input, name: '无需处理的计划', prompt: '整理资料' })
    return window.boai.request('saveAutomation', { ...input, name: '旧等待验收', prompt: '等待用户补充的自动化' })
  }, conversation.id)
  const original = await page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'old-attention' }), plan.id)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), original.id)).status).toBe('waiting_user')
  const dataPath = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedAutomationHistory(dataPath, plan.id, 330, new Date().toISOString())
  const before = await page.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(before.occurrences).toHaveLength(300)
  expect(before.occurrences.some(o => o.id === original.id)).toBe(false)
  expect(before.attentionCount).toBe(1)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '需处理', exact: true }).click()
  await expect(page.locator('.schedule-overview-plan:visible')).toHaveCount(1)
  await expect(page.locator('.schedule-overview-plan:visible')).toContainText('旧等待验收')
  await page.locator('.schedule-overview-plan:visible').click()
  const latest = page.getByRole('region', { name: '最新结果', exact: true })
  const pending = page.getByRole('region', { name: '需处理运行', exact: true })
  const summary = page.getByRole('region', { name: '计划摘要', exact: true })
  await expect(latest).toContainText('过往记录 329')
  await expect(pending.locator(`[data-occurrence-id="${original.id}"]`)).toHaveCount(1)
  expect(await page.locator('.schedule-document > section, .automation-reading:visible > section').evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')))).toEqual(['计划摘要', '最新结果', '需处理运行', '运行记录'])
  await expect(summary).toContainText('已暂停')
  await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
  await page.getByRole('button', { name: '需处理', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]')).toHaveCount(1)
  await expect(page.locator(`[data-occurrence-id="${original.id}"]`)).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).attentionCount).toBe(1)
  // Reading does not resolve a wait. Only the explicit, occurrence-scoped reply does.
  await openSchedule(page, '旧等待验收')
  await pending.getByRole('button', { name: '补充信息', exact: true }).click()
  await page.getByRole('region', { name: '原消息问题', exact: true }).getByRole('button', { name: '回复此问题', exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('收到补充 42')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(latest.locator(`[data-occurrence-id="${original.id}"]`)).toHaveCount(1)
  await expect(latest.getByText('运行结束', { exact: true })).toBeVisible()
  await expect(latest.locator('.automation-result-text').last()).toHaveText('定时整理已完成。')
  await expect(pending).toHaveCount(0)
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click()
  await expect(page.locator('.schedule-overview-plan:visible')).toHaveCount(0)
  const ids = await page.locator('[data-occurrence-id]').evaluateAll(elements => elements.map(e => e.getAttribute('data-occurrence-id')))
  expect(new Set(ids).size).toBe(ids.length)
  const after = await page.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(after.attentionCount).toBe(0)
  expect(after.definitions.find(d => d.id === plan.id)?.latestOccurrence).toMatchObject({ id: original.id, budgetId: original.budgetId, status: 'completed' })
  expect(after.occurrences.some(o => o.id === original.id)).toBe(false)
  await page.screenshot({ path: 'test-results/automation-latest-result.png', animations: 'disabled' })
  await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
  await page.getByRole('button', { name: '需处理', exact: true }).click()
  await expect(page.getByText('当前没有待处理记录。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click()
  await page.getByRole('button', { name: '已暂停', exact: true }).click()
  await expect(page.locator('.schedule-overview-plan:visible')).toHaveCount(2)
  // New overview sorts next execution then stable identity; latest-result authority is asserted above.
  const pausedIds = await page.locator('.schedule-overview-plan:visible').allTextContents()
  expect(pausedIds.some(text => text.includes('旧等待验收'))).toBe(true)
  expect(runtime.errors).toEqual([])
})

When('提交系统提醒并验证回执静音与精确定位', async ({ scenario }) => {
  const { runtime, page, port } = scenario.prepareExtensions!
  const conversation = await prepareAutomationConversation(page, port)
  await captureAutomationNotifications(runtime.app)
  const input = { name: '提醒验收', prompt: '整理资料', conversationId: conversation.id, frequency: 'daily' as const, time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: true, notificationPolicy: 'all_results' as const }
  const plan = await page.evaluate(input => window.boai.request('saveAutomation', input), input)
  const first = await page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'notice-one' }), plan.id)
  await expect.poll(() => notificationCount(runtime.app)).toBe(1)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), first.id)).notices?.[0]?.status).toBe('submitted')
  const result = await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), first.id)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(page, '提醒验收')
  await page.getByText('运行明细', { exact: true }).click()
  await expect(page.getByText('系统通知已提交（不代表送达或已读）', { exact: true })).toBeVisible()
  await notificationEvent(runtime.app, 0, 'failed')
  await expect(page.getByText(/系统通知提交失败 · 系统提交被测试端拒绝/)).toBeVisible()
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await notificationEvent(runtime.app, 0, 'click')
  await expect(page.locator(`[id="message-${result.resultMessageIds.at(-1)}"]`)).toBeFocused()
  // A newly loaded renderer consumes the pending navigation, even if it missed the wake-up event.
  await page.reload({ waitUntil: 'commit' })
  await notificationEvent(runtime.app, 0, 'click')
  await expect(page.locator(`[id="message-${result.resultMessageIds.at(-1)}"]`)).toBeFocused()
  const muted = await page.evaluate(({ input, plan }) => window.boai.request('saveAutomation', { ...input, id: plan.id, expectedRevision: plan.revision, notificationPolicy: 'muted', notify: false }), { input, plan })
  const second = await page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'notice-muted' }), plan.id)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), second.id)).status).toBe('completed')
  expect(await notificationCount(runtime.app)).toBe(1)
  expect((await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), second.id)).notices).toEqual([])
  await page.evaluate(({ input, muted }) => window.boai.request('saveAutomation', { ...input, id: muted.id, expectedRevision: muted.revision, notificationPolicy: 'important_only' }), { input, muted })
  await page.evaluate(async () => {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, active: false })
  })
  const denied = await page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'notice-permissions' }), plan.id)
  expect(denied.status).toBe('skipped')
  expect(denied.attentionReason).toBe('authorization')
  await expect.poll(() => notificationCount(runtime.app)).toBe(2)
  await notificationEvent(runtime.app, 1, 'click')
  await expect(page.locator(`[data-occurrence-id="${denied.id}"]`)).toBeFocused()
  await expect(page.locator(`[data-occurrence-id="${denied.id}"]`)).toContainText(denied.reason!)
  expect(runtime.errors).toEqual([])
})

When('确认追加到期额度后继续且保留累计用量与历史结果', async ({ scenario }) => {
  const { runtime, page, port } = scenario.prepareExtensions!
  const conversation = await prepareAutomationConversation(page, port)
  const plan = await page.evaluate(id => window.boai.request('saveAutomation', { name: '预算续行验收', prompt: '等待用户补充的自动化', conversationId: id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }), conversation.id)
  const first = await page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'budget-renewal' }), plan.id)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences[0]?.status).toBe('waiting_user')
  const dataPath = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedExpiredAutomationBudget(dataPath, first.id)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(page, '预算续行验收')
  await expect(page.getByText('已停止', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
  await expect(page.getByText(/累计请求上限将为 48 次/)).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  const before = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  expect(before.workBudgets![0].renewals).toBeUndefined()
  await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
  await page.getByLabel('继续未完成工作的说明', { exact: true }).fill('收到补充 42')
  await page.getByRole('button', { name: '确认追加额度并继续', exact: true }).click()
  await expect(page.getByText('运行结束', { exact: true })).toBeVisible()
  await expect(page.getByText('交付待核对', { exact: true })).toBeVisible()
  const after = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  const budget = after.workBudgets![0]
  expect(after.workBudgets).toHaveLength(1)
  expect(budget.id).toBe(before.workBudgets![0].id)
  expect(budget.maxModelCalls).toBe(48)
  expect(budget.modelCalls).toBeGreaterThan(before.workBudgets![0].modelCalls)
  expect(budget.renewals).toHaveLength(1)
  expect(budget.renewals![0].used.modelCalls).toBe(before.workBudgets![0].modelCalls)
  expect(after.messages.filter(m => m.content === '收到补充 42')).toHaveLength(1)
  for (const message of before.messages) expect(after.messages.find(m => m.id === message.id)).toEqual(message)
  await page.getByText('运行明细', { exact: true }).click()
  await page.getByText('额度追加记录（1 次）', { exact: true }).click()
  await expect(page.getByText(/模型请求上限 24 → 48/)).toBeVisible()
  await page.getByRole('button', { name: '定位确认消息', exact: true }).click()
  await expect(page.locator(`[id="message-${budget.renewals![0].messageId}"]`)).toBeFocused()
  await runtime.restart()
  const restored = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  expect(restored.workBudgets![0]).toEqual(budget)
  expect(runtime.errors).toEqual([])
})

When('外部任务丢失受理回复后跨重启只核对并能精确停止', async ({ runtime }) => {
  const conversation = await prepareExternalTask(runtime)
  const open = async () => { await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click(); await runtime.page.locator('.conversation-item').filter({ hasText: conversation.title }).click() }
  await open()
  const fault = await loseExternalTaskReceipt(runtime)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('生成原外部任务文件')
  await runtime.page.getByRole('button', { name: '执行外部任务', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).runs[0]?.status).toBe('completed')
  const attempts = await fault(); expect(attempts.sends).toHaveLength(1); expect(attempts.lost).toBe(1)
  await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
  await expect.poll(async () => (await fault()).lookups).toBeGreaterThan(attempts.lookups)
  expect((await fault()).sends).toHaveLength(1)
  const pendingBefore = await runtime.page.evaluate(() => localStorage.getItem('boai:external-tasks:pending'))
  await failExternalTaskStartupSnapshot(runtime)
  await expect(runtime.page.getByText('验收：启动快照暂不可读').first()).toBeVisible()
  await runtime.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await runtime.page.evaluate(() => localStorage.getItem('boai:external-tasks:pending'))).toBe(pendingBefore)
  await runtime.restart(); await open()
  await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toHaveCount(0)
  const accepted = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  expect(accepted.runs).toHaveLength(1); expect(accepted.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  const receipt = await runtime.page.evaluate(input => window.boai.request('getExternalTaskReceipt', input), { conversationId: conversation.id, requestId: attempts.sends[0].requestId })
  expect(receipt?.id).toBe(accepted.messages.find(message => message.senderType === 'user')!.id)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('WAIT_FOREVER')
  await runtime.page.getByRole('button', { name: '执行外部任务', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).runs.filter(run => run.status === 'running').length).toBe(1)
  const current = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id), run = current.runs.find(run => run.status === 'running')!
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '执行过程', exact: true }).click()
  await runtime.page.getByRole('button', { name: '停止此外部任务', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).runs.find(value => value.id === run.id)?.status).toBe('cancelled')
  await expect(runtime.page.getByRole('button', { name: '停止此外部任务', exact: true })).toHaveCount(0)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('明确新外部任务')
  await runtime.page.getByRole('button', { name: '执行外部任务', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).runs.filter(value => value.status === 'completed').length).toBe(2)
  const after = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  expect(after.runs).toHaveLength(3); expect(after.messages.filter(message => message.senderType === 'user')).toHaveLength(3)
  expect(after.messages.filter(message => message.runId === run.id && message.status === 'completed')).toHaveLength(0)
})
