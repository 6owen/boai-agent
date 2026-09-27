/*
 * [INPUT]: 真实 Electron、隔离员工/模型连接与等待取消的本地模型服务。
 * [OUTPUT]: Composer 权限/模型选择持久化、群聊成员隔离、任务期间锁定与窄窗口菜单回归。
 * [POS]: 会话工具栏的 UI 到运行配置验收，不使用固定 CDP 视口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('composer menus save actual agent settings and keep group members and active work isolated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-composer-e2e-'))
  const server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write(': waiting\n\n') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const app = await electron.launch({ args: [resolve('.')], env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  const page = await app.firstWindow(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await expect(page.locator('.app-shell')).toBeVisible()
    const data = await page.evaluate(async baseUrl => {
      const a = await window.boai.request('saveConnection', { name: '研究连接', provider: 'openai-compatible', baseUrl, defaultModel: 'research-v1' })
      const b = await window.boai.request('saveConnection', { name: '写作连接', provider: 'openai-compatible', baseUrl, defaultModel: 'writing-v1' })
      const direct = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
      const group = await window.boai.request('createConversation', { kind: 'group', title: '工具栏协作', agentIds: ['researcher', 'writer'] })
      return { a, b, direct, group }
    }, `http://127.0.0.1:${address.port}/v1`)
    const employee = (id: string) => page.evaluate(async id => (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === id)!, id)
    await page.locator('.conversation-item').filter({ hasText: '研究员' }).click()
    const input = page.getByRole('textbox', { name: '消息内容' })
    await input.fill('这是一份未发送的草稿')

    const more = page.getByRole('button', { name: '添加或更多操作' })
    await more.click(); await expect(page.getByRole('menuitem', { name: '打开会话工作目录' })).toBeVisible()
    await page.keyboard.press('Escape'); await expect(more).toBeFocused()
    const permission = page.getByRole('button', { name: '权限批准', exact: true })
    await permission.click()
    await expect(page.getByRole('menuitemradio', { name: /^禁止命令/ })).toBeChecked()
    await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
    await expect.poll(async () => (await employee('researcher')).allowCommands).toBe(true)
    await expect(permission).toHaveText('请求批准')
    await expect(page.getByRole('menu', { name: '权限批准', exact: true })).toBeHidden()

    const model = page.getByRole('button', { name: '选择模型', exact: true })
    await model.click(); await page.getByRole('menuitemradio', { name: /research-v1/ }).click()
    await expect.poll(async () => (await employee('researcher')).connectionId).toBe(data.a.id)
    await expect(model).toHaveText('research-v1')
    await expect(page.getByRole('menu', { name: '选择模型', exact: true })).toBeHidden()
    await model.click(); await page.getByRole('menuitemradio', { name: /writing-v1/ }).click()
    await expect.poll(async () => (await employee('researcher')).connectionId).toBe(data.b.id)
    await expect(input).toHaveValue('这是一份未发送的草稿')
    await page.reload()
    await expect(model).toHaveText('writing-v1'); await expect(permission).toHaveText('请求批准')

    // A task using this employee in another conversation must not be cancelled by a menu edit.
    await input.fill('保持运行，验证设置锁定')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(c => c.id === data.direct.id)?.activity).toBe('running')
    await page.locator('.conversation-item').filter({ hasText: '工具栏协作' }).click()
    await model.click()
    const researcherModels = page.getByRole('group', { name: /研究员的模型/ })
    await expect(researcherModels.getByRole('menuitemradio').first()).toBeDisabled()
    const writerModels = page.getByRole('group', { name: /写手的模型/ })
    await writerModels.getByRole('menuitemradio', { name: /research-v1/ }).click()
    await expect.poll(async () => (await employee('writer')).connectionId).toBe(data.a.id)
    expect((await employee('researcher')).connectionId).toBe(data.b.id)
    await page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), data.direct.id)
    await more.click(); await page.getByRole('menuitem', { name: '提及成员' }).click()
    await expect(page.locator('.mention-bar')).toBeVisible()

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
    await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
    await permission.click()
    await expect(page.getByRole('menu', { name: '权限批准' })).toBeVisible()
    const fits = await page.getByRole('menu', { name: '权限批准' }).evaluate(element => {
      const rect = element.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && document.documentElement.scrollWidth === innerWidth
    })
    expect(fits).toBe(true)
    await page.keyboard.press('Escape'); await expect(permission).toBeFocused()
    expect(errors).toEqual([])
  } finally {
    await app.close()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
