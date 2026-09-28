/*
 * [INPUT]: 主题外部执行与自动化持久化的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 主题外部执行与自动化持久化的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/extensions.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
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
      response = JSON.stringify({ action: replied ? 'pass' : 'reply', responseKind: 'chat', purpose: '完成例行报告' })
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
  await page!.getByRole('button', { name: '设置', exact: true }).click()
  await page!.getByRole('menuitem', { name: '外观', exact: true }).click()
  await page!.getByRole('button', { name: '外观', exact: true }).click()
  await page!.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page!.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page!.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  await page!.getByLabel('深色配色', { exact: true }).selectOption('nord')
  await expect(page!.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  await page!.getByText('高级', { exact: true }).click()
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
  await page!.getByLabel('图片不透明度', { exact: true }).fill('0')
  await expect(page!.locator('#appearance-background')).toHaveCSS('opacity', '0')
  await page!.getByLabel('图片不透明度', { exact: true }).fill('100')
  await expect(page!.locator('#appearance-background')).toHaveCSS('opacity', '1')
  await page!.getByLabel('图片不透明度', { exact: true }).fill('20')
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
  await desktop!.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setSize(760, 800)
    window.webContents.setZoomFactor(2)
  })
  await page!.getByRole('button', { name: '恢复默认外观' }).scrollIntoViewIfNeeded()
  await expect(page!.getByRole('button', { name: '恢复默认外观' })).toBeInViewport()
  expect(
    await page!.evaluate(() => {
      const nav = document.querySelector('.page-subnav')!
      return (
        nav.scrollWidth <= nav.clientWidth &&
        Array.from(document.querySelectorAll('.appearance-settings button,.appearance-settings select,.appearance-settings input')).every((e) => {
          const r = e.getBoundingClientRect()
          return r.left >= 0 && r.right <= innerWidth
        })
      )
    }),
  ).toBe(true)
  const zoomImage = await desktop!.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  )
  await writeFile('test-results/appearance-zoom.png', Buffer.from(zoomImage, 'base64'))
  await desktop!.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setZoomFactor(1)
    window.setSize(1340, 900)
  })
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

async function runAutomationAndBackup(previous: Awaited<ReturnType<typeof executeExternalTask>>) {
  let { runtime, root, desktop, page, errors, port, launch, fixture } = previous
  const conversation = await page!.evaluate(async (port) => {
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
  await page!.getByRole('button', { name: '定时任务', exact: true }).click()
  await page!.getByRole('button', { name: '新建', exact: true }).click()
  await page!.getByLabel('任务名称', { exact: true }).fill('每日资料整理')
  await page!.getByLabel('目标会话', { exact: true }).selectOption(conversation.id)
  await page!.getByLabel('任务内容', { exact: true }).fill('整理今天的工作要点。')
  await page!.getByRole('button', { name: '保存任务', exact: true }).click()
  await expect(page!.getByRole('button', { name: '立即运行一次' })).toBeVisible()
  await page!.getByRole('button', { name: '立即运行一次' }).click()
  await expect(page!.getByText('已完成', { exact: true })).toBeVisible()
  await page!.screenshot({ path: 'test-results/automation-results.png' })
  const backupDir = join(root, 'exports')
  await mkdir(backupDir)
  await desktop!.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, backupDir)
  const backup = await page!.evaluate(() => window.boai.request('exportBackup', undefined))
  expect(JSON.parse(await readFile(join(backup!, 'backup.json'), 'utf8')).appearanceIncluded).toBe(true)
  return { runtime, desktop, page, errors, launch }
}

async function verifyExtensionsRestart(previous: Awaited<ReturnType<typeof runAutomationAndBackup>>) {
  let { runtime, desktop, page, errors, launch } = previous
  await runtime.close()
  await launch()
  desktop = runtime.app
  page = runtime.page
  await expect(page!.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  const view = await page!.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(view.occurrences).toHaveLength(1)
  expect(view.occurrences[0].status).toBe('completed')
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
