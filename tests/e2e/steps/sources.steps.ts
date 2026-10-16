/*
 * [OUTPUT]: 三类数据源夹具移除已退休的资源级权限字段；本轮未运行E2E。
 * [OUTPUT]: 真实宿主与受控模型覆盖询问缺项/三类型会话保存/重启/手动编辑；两级菜单单行与侧栏滚动边缘核对。
 * [OUTPUT]: 真实帧采样核验会话Collapsible高度过渡；技能选中保留主目录，并使用Shell右侧详情/关闭入口；原收藏和本地扫描流程保持。
 * [INPUT]: Real Electron IPC, isolated skill/folder fixtures and local authenticated HTTP.
 * [OUTPUT]: Integrated navigation, source lifecycle/binding and existing skill favorite flow.
 * [POS]: Desktop source acceptance; no model or external account.
 * [PROTOCOL]: 变化同步 Header 与 steps/.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { startLocalSkills } from '../support/local-skills'
type State = { folder?: string; id?: string; requests: number }
export const test = base.extend<{ sources: State }>({ sources: async ({}, use) => use({ requests: 0 }) })
const { Given, When, Then } = createBdd(test)
Given('自定义工作区已有本机技能和文件夹', async ({ runtime, sources }) => {
  sources.folder = join(runtime.root, 'project-source'); await mkdir(sources.folder); sources.folder = await realpath(sources.folder); await writeFile(join(sources.folder, 'facts.md'), 'SOURCE_ORIGINAL')
  await startLocalSkills(runtime)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '自定义', exact: true }).click()
  await expect(runtime.page.getByRole('complementary', { name: '自定义导航' })).toBeVisible()
  await runtime.page.getByRole('complementary', { name: '自定义导航' }).getByRole('button', { name: '数据源', exact: true }).click()
})
When('添加并测试本地文件夹然后绑定研究员', async ({ runtime, sources }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '添加数据源', exact: true }).first().click(); await page.getByRole('menuitem', { name: '手动添加', exact: true }).hover(); await page.getByRole('menuitem', { name: '本地文件夹', exact: true }).click()
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('项目资料')
  await runtime.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path!] }) }, sources.folder)
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文件夹路径' })).toHaveValue(sources.folder!)
  await page.getByRole('textbox', { name: '使用说明', exact: true }).fill('读取 facts.md 中的项目事实。')
  await page.getByRole('button', { name: '保存数据源', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  sources.id = (await page.evaluate(() => window.boai.request('listDataSources', undefined)))[0].id
  await page.getByRole('button', { name: '测试连接', exact: true }).click(); await expect(page.getByText('连接正常', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '绑定员工', exact: true }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /研究员/ }).check()
  await page.getByRole('button', { name: '保存绑定', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.sourceIds).toEqual([sources.id])
  await runtime.reviewNativeCheckpoint('文件夹详情与员工绑定')
})
Then('技能详情和收藏仍可使用且数据源重启后保留', async ({ runtime, sources }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '技能：agents-sdk', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Agents SDK', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '当前技能操作', exact: true }).click(); await page.getByRole('menuitem', { name: '加入收藏', exact: true }).click()
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('tab', { name: '收藏', exact: true }).click()
  await expect(page.getByRole('button', { name: /agents-sdk Build AI/ })).toBeVisible()
  await page.getByRole('button', { name: '数据源：项目资料', exact: true }).click()
  const before = await page.evaluate(id => window.boai.request('getDataSource', { id: id! }), sources.id)
  await runtime.restart()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '自定义', exact: true }).click()
  await runtime.page.getByRole('button', { name: '数据源：项目资料', exact: true }).click()
  expect(await runtime.page.evaluate(id => window.boai.request('getDataSource', { id: id! }), sources.id)).toEqual(before)
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 680))
  expect(await runtime.page.locator('.custom-content').evaluate(element => { const box = element.getBoundingClientRect(); return box.right <= innerWidth && box.left >= 0 && element.scrollWidth <= element.clientWidth + 1 })).toBe(true)
  await runtime.reviewNativeCheckpoint('自定义整合与窄窗')
})
When('删除已绑定的本地数据源', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '数据源更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '删除数据源', exact: true }).click()
  await runtime.page.getByRole('dialog').getByRole('button', { name: '删除数据源', exact: true }).click()
  await expect(runtime.page.getByRole('dialog')).toHaveCount(0)
})
Then('员工授权已移除而文件夹原件保留', async ({ runtime, sources }) => {
  expect(await runtime.page.evaluate(() => window.boai.request('listDataSources', undefined))).toEqual([])
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.sourceIds).toEqual([])
  expect(await readFile(join(sources.folder!, 'facts.md'), 'utf8')).toBe('SOURCE_ORIGINAL')
  expect(runtime.errors).toEqual([])
})
When('添加使用密钥的本地API数据源并测试连接', async ({ runtime, sources }) => {
  const server = createServer((req, res) => { sources.requests++; res.writeHead(req.headers.authorization === 'Bearer SOURCE_UI_SECRET' ? 200 : 401, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') })
  runtime.trackServer(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const page = runtime.page
  await page.getByRole('button', { name: '添加数据源', exact: true }).first().click(); await page.getByRole('menuitem', { name: '手动添加', exact: true }).hover(); await page.getByRole('menuitem', { name: 'API', exact: true }).click()
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('业务 API')
  await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`)
  await page.getByRole('combobox', { name: '认证方式', exact: true }).click(); await page.getByRole('option', { name: 'Bearer token', exact: true }).click()
  await page.getByLabel('访问密钥', { exact: true }).fill('SOURCE_UI_SECRET')
  await page.getByRole('button', { name: '保存数据源', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sources.requests).toBe(0)
  sources.id = (await page.evaluate(() => window.boai.request('listDataSources', undefined)))[0].id
  await page.getByRole('button', { name: '测试连接', exact: true }).click(); await expect(page.getByText('连接正常', { exact: true })).toBeVisible(); expect(sources.requests).toBe(1)
  await runtime.reviewNativeCheckpoint('API真实测试通过')
})
Then('密钥未回显且停用和MCP配置均可保存', async ({ runtime, sources }) => {
  const page = runtime.page
  expect(JSON.stringify(await page.evaluate(() => window.boai.request('listDataSources', undefined)))).not.toContain('SOURCE_UI_SECRET')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click(); await expect(page.getByLabel('访问密钥', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '数据源更多操作', exact: true }).click(); await page.getByRole('menuitem', { name: '停用数据源', exact: true }).click()
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '返回数据源列表', exact: true }).click()
  await page.getByRole('button', { name: '添加数据源', exact: true }).first().click(); await page.getByRole('menuitem', { name: '手动添加', exact: true }).hover(); await page.getByRole('menuitem', { name: 'MCP', exact: true }).click()
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('工具服务')
  await page.getByRole('textbox', { name: '服务地址', exact: true }).fill('http://127.0.0.1:9/mcp')
  await page.getByRole('button', { name: '保存数据源', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await page.evaluate(() => window.boai.request('listDataSources', undefined))).map(source => source.type).sort()).toEqual(['api', 'mcp'])
  expect(sources.requests).toBe(1)
  await runtime.reviewNativeCheckpoint('MCP配置与混合已安装列表')
  expect(runtime.errors).toEqual([])
})

Then('数据源使用同行标签搜索和系统插画空态', async ({ runtime }) => {
  const page = runtime.page, tabs = page.getByRole('tablist', { name: '数据源类型' }), search = page.getByRole('textbox', { name: '搜索数据源' })
  await expect(tabs.getByRole('tab')).toHaveCount(4)
  await expect(page.getByText('连接工具与资料，让数字员工在工作中使用。', { exact: true })).toHaveCount(0)
  await expect(page.locator('.sources-view .illustrated-empty img')).toBeVisible()
  await page.getByRole('button', { name: '搜索数据源', exact: true }).click()
  const [a, b] = await Promise.all([tabs.boundingBox(), search.boundingBox()])
  expect(b!.x).toBeGreaterThan(a!.x + a!.width)
  expect(Math.abs(a!.y + a!.height / 2 - b!.y - b!.height / 2)).toBeLessThan(2)
  await expect(page.getByRole('button', { name: '已安装的技能', exact: true })).toBeVisible()
  const sidebar = page.locator('.custom-sidebar'), list = page.locator('.custom-installed-list')
  await expect(sidebar.getByText('已安装', { exact: true })).toHaveCount(0)
  expect(Math.abs((await sidebar.boundingBox())!.x + (await sidebar.boundingBox())!.width - (await list.boundingBox())!.x - (await list.boundingBox())!.width)).toBeLessThan(1)
  await runtime.reviewNativeCheckpoint('数据源标签同行检索与系统空态')
})
When('切换技能目录标签并打开技能详情', async ({ runtime }) => {
  const page = runtime.page
  const sourceTabs = (await page.getByRole('tablist', { name: '数据源类型' }).boundingBox())!, sourceHeading = (await page.locator('.custom-content-heading h1').boundingBox())!
  await page.getByRole('complementary', { name: '自定义导航' }).getByRole('button', { name: '技能', exact: true }).click()
  const heading = page.locator('.custom-content-heading h1'), tabs = page.getByRole('tablist', { name: '技能分类' })
  const before = await Promise.all([heading.boundingBox(), tabs.boundingBox()])
  for (const key of ['x', 'y'] as const) {
    expect(Math.abs(before[0]![key] - sourceHeading[key])).toBeLessThan(1)
    expect(Math.abs(before[1]![key] - sourceTabs[key])).toBeLessThan(1)
  }
  for (const name of ['收藏', '商城', '本地']) {
    await tabs.getByRole('tab', { name, exact: true }).click()
    await expect(heading).toHaveText('技能')
    const after = await Promise.all([heading.boundingBox(), tabs.boundingBox()])
    for (let i = 0; i < before.length; i++) for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[i]![key] - after[i]![key])).toBeLessThan(2)
  }
  await expect(page.getByText('为数字员工添加专业知识与工作方法。', { exact: true })).toHaveCount(0)
  const search = page.getByRole('textbox', { name: '搜索本机技能' })
  await page.getByRole('button', { name: '搜索本机技能', exact: true }).click()
  await search.fill('agents-sdk')
  await page.getByRole('button', { name: /agents-sdk Build AI/ }).click()
  await expect(page.locator('.local-skill-panel').getByRole('heading', { name: 'Agents SDK', exact: true })).toBeVisible()
  await expect(search).toHaveValue('agents-sdk')
  await expect(page.getByRole('button', { name: /agents-sdk Build AI/ })).toBeVisible()
  await runtime.reviewNativeCheckpoint('技能目录保留与右侧详情')
})
Then('主目录保持且安装列表按四种类型分组', async ({ runtime, sources }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.evaluate(async folder => {
    const base = { description: '', guide: '', enabled: true }
    await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config: { ...base, name: 'API示例', type: 'api', api: { baseUrl: 'http://127.0.0.1:9', authType: 'none', testPath: '/' } } })
    await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config: { ...base, name: 'MCP示例', type: 'mcp', mcp: { url: 'http://127.0.0.1:9/mcp', transport: 'http', authType: 'none' } } })
    await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config: { ...base, name: '文件夹示例', type: 'local', local: { path: folder! } } })
  }, sources.folder)
  const sidebar = page.getByRole('complementary', { name: '自定义导航' })
  for (const label of ['技能', 'MCP', 'API', '本地文件夹']) await expect(sidebar.getByRole('button', { name: `已安装的${label}`, exact: true })).toHaveAttribute('aria-expanded', 'true')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const heights = await sidebar.getByRole('button', { name: '已安装的技能', exact: true }).evaluate(async trigger => {
    const panel = trigger.parentElement!.querySelector<HTMLElement>('[data-slot=collapsible-content]')!
    const from = panel.getBoundingClientRect().height, samples: number[] = [], start = performance.now()
    ;(trigger as HTMLElement).click()
    await new Promise<void>(resolve => { const frame = () => { samples.push(panel.getBoundingClientRect().height); if (performance.now() - start < 350) requestAnimationFrame(frame); else resolve() }; requestAnimationFrame(frame) })
    return { from, samples }
  })
  expect(heights.samples.some(height => height > 1 && height < heights.from - 1)).toBe(true)
  expect(heights.samples.at(-1)).toBe(0)
  await expect(sidebar.getByRole('button', { name: '技能：agents-sdk', exact: true })).toHaveCount(0)
  await expect(sidebar.getByRole('button', { name: '数据源：MCP示例', exact: true })).toBeVisible()
  await sidebar.getByRole('button', { name: '数据源', exact: true }).click()
  await page.getByRole('tab', { name: 'MCP', exact: true }).click()
  await expect(page.locator('.source-catalog-item')).toHaveCount(1)
  await expect(page.locator('.source-catalog-item')).toContainText('MCP示例')
  await expect(page.getByRole('button', { name: '已安装的MCP', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect.poll(async () => { const tab = await page.getByRole('tab', { name: 'MCP', exact: true }).boundingBox(); const indicator = await page.getByRole('tablist', { name: '数据源类型' }).locator('[data-slot=tabs-indicator]').boundingBox(); return Math.abs(tab!.x - indicator!.x) }).toBeLessThan(1)
  await runtime.reviewNativeCheckpoint('左侧类型分组与数据源Tabs')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 680))
  expect(await page.locator('.source-catalog-toolbar').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  expect(runtime.errors).toEqual([])
})


Given('数据源会话添加使用真实服务和受控模型', async ({ runtime, sources }) => {
  sources.folder = await realpath(runtime.root)
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw), messages = JSON.stringify(body.messages), request = JSON.stringify(body.messages.filter((message: { role: string }) => message.role === 'user').at(-1)?.content ?? '')
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const emit = (delta: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'source-fixture', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    const text = (content: unknown) => { emit({ role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }); emit({}, 'stop'); res.end('data: [DONE]\n\n') }
    if (messages.includes('Private participation decision')) { text({ action: 'reply', responseKind: 'chat' }); return }
    if (messages.includes('Private memory maintenance')) { text({ candidates: [] }); return }
    if (body.messages.some((m: { role: string }) => m.role === 'tool')) { text('已添加数据源，可打开查看。'); return }
    if (!request.includes('mcpServers') && !request.includes('API示例') && !request.includes('文件夹示例')) { text('请提供连接地址、JSON 配置或文件夹路径。'); return }
    const tool = body.tools?.find((t: { function: { name: string } }) => t.function.name === 'create_data_source')
    if (!tool) { text('缺少创建工具'); return }
    const base = { description: '', guide: '', enabled: true }
    const input = request.includes('mcpServers') ? { key: 'mcp', config: { ...base, name: '会话MCP', type: 'mcp', mcp: { transport: 'stdio', command: 'npx', args: ['-y', 'fixture-mcp'] } }, credential: '{"TOKEN":"SOURCE_CHAT_SECRET"}' } : request.includes('API示例') ? { key: 'api', config: { ...base, name: 'API示例', type: 'api', api: { baseUrl: 'http://127.0.0.1:9/v1', authType: 'none', testPath: '/' } } } : { key: 'folder', config: { ...base, name: '文件夹示例', type: 'local', local: { path: sources.folder } } }
    emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: 'source-create', type: 'function', function: { name: 'create_data_source', arguments: JSON.stringify(input) } }] }); emit({}, 'tool_calls'); res.end('data: [DONE]\n\n')
  })
  runtime.trackServer(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await startLocalSkills(runtime)
  await runtime.page.evaluate(port => window.boai.request('saveConnection', { name: '数据源协议模型', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' }), (server.address() as { port: number }).port)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '自定义', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '自定义导航' }).getByRole('button', { name: '数据源', exact: true }).click()
})
When('在会话中澄清并添加三种数据源', async ({ runtime, sources }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '添加数据源', exact: true }).first().click()
  await expect(page.getByRole('menuitem', { name: '手动添加', exact: true })).toBeVisible()
  const manual = page.getByRole('menuitem', { name: '手动添加', exact: true })
  await expect.poll(async () => (await manual.boundingBox())!.width).toBeGreaterThanOrEqual(160)
  await manual.hover()
  const folder = page.getByRole('menuitem', { name: '本地文件夹', exact: true })
  await expect(folder).toBeVisible()
  await expect.poll(async () => (await folder.boundingBox())!.width).toBeGreaterThanOrEqual(160)
  expect((await manual.boundingBox())!.height).toBeLessThan(42)
  await runtime.reviewNativeCheckpoint('数据源两级菜单完整单行')
  await page.getByRole('menuitem', { name: '会话添加', exact: true }).click()
  await expect(page.locator('.schedule-chat-plan')).toHaveCount(0)
  const send = async (content: string) => { await page.getByRole('textbox', { name: '数据源创建要求', exact: true }).fill(content); await page.getByRole('button', { name: '发送创建要求', exact: true }).click() }
  await send('想添加一个数据源')
  await expect(page.locator('.schedule-chat-message').last()).toContainText('请提供连接地址')
  expect(await page.evaluate(() => window.boai.request('listDataSources', undefined))).toHaveLength(0)
  const prompts = [JSON.stringify({ mcpServers: { '会话MCP': { command: 'npx', args: ['-y', 'fixture-mcp'], env: { TOKEN: 'SOURCE_CHAT_SECRET' } } } }), '添加 API示例，地址 http://127.0.0.1:9/v1，无需认证，只读', `添加文件夹示例，只读，路径 ${sources.folder}`]
  for (let i = 0; i < prompts.length; i++) {
    if (i) await page.getByRole('button', { name: '新对话', exact: true }).click()
    await send(prompts[i])
    await expect(page.locator('.schedule-chat-plan')).toHaveCount(1)
    await expect(page.locator('.schedule-chat-message').last()).toContainText('已添加数据源')
    expect((await page.evaluate(() => window.boai.request('listDataSources', undefined))).length).toBe(i + 1)
  }
  await runtime.reviewNativeCheckpoint('数据源会话真实创建和保存卡片')
})
Then('数据源按类型保存且重启无重复创建', async ({ runtime }) => {
  const page = runtime.page
  const saved = await page.evaluate(() => window.boai.request('listDataSources', undefined))
  expect(saved.map(source => source.type).sort()).toEqual(['api', 'local', 'mcp'])
  expect(saved.every(source => source.creationSource?.agentId === 'bobo' && !source.test)).toBe(true)
  expect(saved.find(source => source.type === 'mcp')?.hasCredential).toBe(true)
  expect(JSON.stringify(saved)).not.toContain('SOURCE_CHAT_SECRET')
  for (const source of saved) {
    const view = await page.evaluate(id => window.boai.request('getConversationView', { conversationId: id!, limit: 80 }), source.creationSource?.conversationId)
    expect(view.runs.filter(run => run.phase === 'execution' || !run.phase).every(run => run.status === 'completed')).toBe(true)
  }
  await page.locator('.schedule-chat-plan').getByRole('button', { name: '打开', exact: true }).click()
  await expect(page.getByRole('heading', { name: '文件夹示例', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('文件夹更新')
  await page.getByRole('button', { name: '保存数据源', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const before = await page.evaluate(() => window.boai.request('listDataSources', undefined))
  await runtime.restart()
  expect(await runtime.page.evaluate(() => window.boai.request('listDataSources', undefined))).toEqual(before)
  expect(runtime.errors).toEqual([])
})
