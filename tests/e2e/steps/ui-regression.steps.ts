/*
 * [OUTPUT]: 本人菜单明暗两场核对头像与五项导航，菜单分享/帮助消失，逐个入口定位对应设置。
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [OUTPUT]: 新增定时任务历史/管理明暗四场；实际标签CRUD、多选、拖拽/排序、筛选键盘与动效/布局覆盖，原20场保持。
 * [OUTPUT]: 新增语音设置明暗两场，核对默认关闭、紧凑控件/32px、术语真实自动保存及统一快捷键导航；原18项保持。
 * [OUTPUT]: 快捷键页新增第五项语音动作，明确断言默认关闭/未绑定，原四项断言保持。
 * [OUTPUT]: 原18项UI先在本场独立profile准备同一历史再单次启动真实Electron；行为/布局/截图断言保持。
 * [OUTPUT]: 草稿切换先核对应会话数据/编辑器真实就绪，避免空草稿早于消息加载导致侧栏前缀缺失；原18基线/零像素门槛保持。
 * [INPUT]: 版本化UI合同、真实Electron、固定历史与隔离本机技能。
 * [OUTPUT]: 每员工唯一主单聊及明暗/窄窗页面；快捷键页核对四行启停/录入且无保存按钮，保留原搜索断言；既有16场与像素阈值保持。
 * [POS]: UI回归BDD步骤；沿原Desktop生命周期，不修改产品DOM/CSS。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { localSkillsEntry } from '../support/local-skills'
import { prepareGroupChat } from '../support/group-chat'
import { messageDraft } from '../support/editor-controls'
import { compareUiBaseline } from '../support/ui-baseline'
import { seedScheduleUi } from '../support/schedule-ui'
import contract from '../baselines/contract.json' with { type: 'json' }

type Case = typeof contract.cases[number]
type State = { fixture?: Awaited<ReturnType<typeof prepareGroupChat>>; selected?: Case; emptyTitle?: string; emptyId?: string }
export const test = base.extend<{ uiRegression: State }>({ uiRegression: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const fixedNow = new Date('2026-10-20T01:00:00Z').getTime()

async function readyConversation(runtime: import('../support/desktop').Desktop, id: string) {
  const chat = runtime.page.locator(`[data-conversation-view="chat"][data-conversation-id="${id}"]`)
  await expect(chat.locator('.chat-messages-transition')).toHaveAttribute('aria-busy', 'false')
  const input = chat.getByRole('textbox', { name: '消息内容', exact: true }).and(runtime.page.locator('[contenteditable="true"]'))
  await expect(input).toBeEditable()
}

Given('UI回归已准备隔离的固定历史和资源', async ({ runtime, uiRegression }) => {
  const skill = join(runtime.root, 'local-user/.agents/skills/ui-baseline')
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: ui-baseline\ndescription: 核对来源与交付结果。\n---\n# UI 基线技能\n保留明确来源，核对真实文件。\n')
  const original = await localSkillsEntry(runtime), mainEntry = join(runtime.root, 'ui-regression-main.cjs')
  await writeFile(mainEntry, `require('electron').app.commandLine.appendSwitch('lang', 'zh-CN');\nrequire(${JSON.stringify(original)});\n`)
  uiRegression.fixture = await prepareGroupChat(runtime, { mainEntry, now: fixedNow, seedBeforeLaunch: true, seedAdditional: /(?:schedules|schedule-manager)-(?:light|dark)/.test(test.info().title) ? (store, setup) => seedScheduleUi(store, setup.direct.id) : undefined })
  await runtime.page.clock.setFixedTime(fixedNow)
  // Explicit local fault rehearsal: the real appearance buttons still run; only persistence is lost.
  if (process.env.BOAI_UI_FAULT === 'behavior') await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', (event, payload) => original(event, payload.method === 'updateAppearance' ? { ...payload, method: 'getAppearance', input: undefined } : payload))
  })
})

When('用户打开UI基准场景 {string}', async ({ runtime, uiRegression }, caseId: string) => {
  const selected = contract.cases.find(item => item.id === caseId)
  if (!selected) throw new Error(`未登记UI场景：${caseId}`)
  uiRegression.selected = selected
  const page = runtime.page
  await page.setViewportSize({ width: selected.width, height: contract.height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(async mode => {
    const current = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode, zoomFactor: 1 }, expectedRevision: current.revision })
  }, selected.mode as 'light' | 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', selected.mode)
  const scene = selected.scene
  if (scene === 'user-menu') {
    await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  } else if (scene === 'schedules' || scene === 'schedule-manager') {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '定时任务', exact: true }).click()
  } else if (scene === 'employee') {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '研究员', exact: true }).click()
  } else if (scene === 'settings' || scene === 'shortcuts' || scene === 'voice-settings') {
    await page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
    await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: scene === 'shortcuts' ? '快捷键' : scene === 'voice-settings' ? '语音输入' : '外观', exact: true }).click()
  } else if (scene === 'resources') {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '资源库', exact: true }).click()
    await page.getByRole('complementary', { name: '资源库导航', exact: true }).getByRole('button', { name: '技能', exact: true }).click()
    await page.getByRole('tab', { name: '本地', exact: true }).click()
  }
  else if (scene === 'empty-chat') {
    // A personal employee has ONE main private chat. Use a different employee for the empty state.
    const chat = await page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '空白基准会话', agentIds: ['writer'] }))
    uiRegression.emptyTitle = chat.title
    uiRegression.emptyId = chat.id
    await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${chat.title}`) }).click()
  } else if (scene === 'detail') {
    await page.locator('.chat-header').getByRole('button', { name: '会话操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '文件', exact: true }).click()
  } else if (scene === 'preview') await page.locator('[data-chat-artifact-id="report-file"]').getByRole('button', { name: '打开 竞品分析报告.md', exact: true }).click()
})

Then('当前场景的真实交互和布局满足原约定', async ({ runtime, uiRegression }) => {
  const page = runtime.page, selected = uiRegression.selected!
  if (selected.scene === 'chat' || selected.scene === 'empty-chat') {
    const chatId = selected.scene === 'chat' ? uiRegression.fixture!.group.id : uiRegression.emptyId!
    await readyConversation(runtime, chatId)
    const input = page.getByRole('textbox', { name: '消息内容', exact: true })
    await expect(input).toBeVisible()
    await expect(input).toBeInViewport()
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
    await input.fill('UI回归草稿：切换后仍保留。')
    await expect.poll(() => messageDraft(input)).toBe('UI回归草稿：切换后仍保留。')
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled()
    const groupName = selected.scene === 'chat' ? '产品讨论组' : uiRegression.emptyTitle!
    await page.getByRole('button', { name: /^与研究员对话/ }).click()
    await readyConversation(runtime, uiRegression.fixture!.direct.id)
    await expect(page.locator('#message-history-direct-13')).toBeVisible()
    await expect.poll(() => messageDraft(input)).toBe('')
    await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${groupName}`) }).click()
    await readyConversation(runtime, chatId)
    await expect.poll(() => messageDraft(input)).toBe('UI回归草稿：切换后仍保留。')
    await input.click()
    await input.press('ControlOrMeta+A')
    await input.press('Backspace')
    await expect.poll(() => messageDraft(input)).toBe('')
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
    if (selected.scene === 'chat') await expect(page.locator('#message-history-writer')).toContainText('报告初稿')
    const original = uiRegression.fixture!.direct
    const repeated = await page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '重复进入不能新建另一个单聊', agentIds: ['researcher'] }))
    expect(repeated.id).toBe(original.id)
    expect(repeated.title).toBe(original.title)
    const rooms = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).conversations.filter(room => room.kind === 'direct' && !room.channel && !room.mergedInto && room.agentIds[0] === 'researcher'))
    expect(rooms.map(room => room.id)).toEqual([original.id])
  } else if (selected.scene === 'user-menu') {
    await checkUserMenu(runtime)
  } else if (selected.scene === 'schedules' || selected.scene === 'schedule-manager') {
    await checkScheduleUi(runtime, selected.scene === 'schedule-manager')
  } else if (selected.scene === 'employee') {
    const detail = page.getByRole('region', { name: '通讯录详情', exact: true })
    const role = detail.getByRole('textbox', { name: '员工职责', exact: true })
    await role.fill('保留来源，核对真实交付。')
    await role.press('Tab')
    await expect.poll(() => page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!.role)).toBe('保留来源，核对真实交付。')
    await expect(role).toHaveText('保留来源，核对真实交付。')
  } else if (selected.scene === 'settings') {
    await expect(page.getByRole('heading', { name: '外观', exact: true })).toBeVisible()
    for (const mode of [selected.mode === 'light' ? 'dark' : 'light', selected.mode]) {
      await page.getByRole('button', { name: mode === 'light' ? '浅色' : '深色', exact: true }).click()
      await expect.poll(async () => (await page.evaluate(() => window.boai.request('getAppearance', undefined))).preferences.mode).toBe(mode)
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    }
  } else if (selected.scene === 'shortcuts') {
    const content = page.locator('.settings-content')
    await expect(content.getByRole('heading', { name: '快捷键', exact: true })).toBeInViewport()
    await expect(content.locator('.appearance-row')).toHaveCount(5)
    for (const [label, key] of [['Open Search / 全局搜索', 'K'], ['切换侧边栏', 'B'], ['后退', '['], ['前进', ']']]) {
      const row = content.locator('.appearance-row').filter({ hasText: label })
      await expect(row).toBeInViewport()
      await expect(row.locator('kbd')).toHaveText(`${process.platform === 'darwin' ? '⌘' : 'Ctrl'} ${key}`)
      await expect(row.getByRole('switch', { name: label, exact: true })).toBeChecked()
      await expect(row.getByRole('button', { name: `修改${label}快捷键`, exact: true })).toBeEnabled()
    }
    const voice = content.locator('.appearance-row').filter({ hasText: '语音输入' })
    await expect(voice).toBeInViewport()
    await expect(voice.locator('kbd')).toHaveText('无')
    await expect(voice.getByRole('switch', { name: '语音输入', exact: true })).not.toBeChecked()
    await expect(voice.getByRole('button', { name: '修改语音输入快捷键', exact: true })).toBeEnabled()
    await expect(content.getByRole('switch')).toHaveCount(5)
    await expect(content.locator('[data-shortcut-recorder]')).toHaveCount(5)
    await expect(content.getByRole('button', { name: '恢复默认', exact: true })).toBeEnabled()
    await expect(content.getByRole('button', { name: /^(保存|应用)$/ })).toHaveCount(0)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    await expect(page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '搜索关键词', exact: true })).toBeFocused()
    await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
    await expect(content.getByRole('heading', { name: '快捷键', exact: true })).toBeInViewport()
  } else if (selected.scene === 'voice-settings') {
    const voice = page.getByRole('region', { name: '语音输入设置', exact: true })
    const heading = voice.getByRole('heading', { name: '语音输入', exact: true })
    await expect(heading).toBeInViewport()
    await expect(voice.getByRole('switch', { name: '启用语音输入', exact: true })).not.toBeChecked()
    await expect(voice.getByRole('switch', { name: '启用文字整理', exact: true })).not.toBeChecked()
    await expect(voice.getByRole('button', { name: '下载模型', exact: true })).toBeDisabled()
    await expect(voice.getByRole('button', { name: '授权并刷新设备', exact: true })).toBeDisabled()
    const language = voice.getByRole('combobox', { name: '识别语言', exact: true })
    await expect(language).toBeEnabled()
    const languageBox = await language.boundingBox()
    const rowBox = await language.locator('xpath=ancestor::*[@data-voice-setting-row][1]').boundingBox()
    expect(languageBox!.width).toBeLessThan(rowBox!.width / 2)
    expect(Math.abs(languageBox!.x + languageBox!.width - rowBox!.x - rowBox!.width)).toBeLessThanOrEqual(2)
    const microphone = await voice.getByRole('combobox', { name: '麦克风', exact: true }).boundingBox()
    const authorize = await voice.getByRole('button', { name: '授权并刷新设备', exact: true }).boundingBox()
    expect(authorize!.height).toBe(32)
    expect(microphone!.height).toBe(authorize!.height)
    for (const control of [languageBox, microphone]) expect(control!.width).toBe(220)
    await expect(voice.getByRole('button', { name: /^(保存|应用)$/ })).toHaveCount(0)
    await expect(voice.locator('kbd')).toHaveCount(0)
    const terms = voice.getByRole('textbox', { name: '语音术语表', exact: true })
    await terms.fill('BOAI | 波艾')
    await heading.click()
    await expect.poll(async () => (await page.evaluate(() => window.boai.voice!.snapshot())).settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾'] }])
    await voice.getByRole('button', { name: '前往快捷键设置', exact: true }).click()
    await expect(page.locator('.settings-content').getByRole('heading', { name: '快捷键', exact: true })).toBeInViewport()
    await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '语音输入', exact: true }).click()
    await expect(terms).toHaveValue('BOAI | 波艾')
    const snapshot = await page.evaluate(() => window.boai.voice!.snapshot())
    expect(snapshot.localReady).toBe(false)
    expect(snapshot.download).toBeUndefined()
    await heading.click()
    await expect(page.getByText('语音输入设置已保存', { exact: true })).toHaveCount(0)
  } else if (selected.scene === 'resources') {
    await page.getByRole('button', { name: '搜索本机技能', exact: true }).click()
    const search = page.getByRole('textbox', { name: '搜索本机技能', exact: true })
    await search.fill('ui-baseline')
    await expect(page.getByText('ui-baseline', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('tab', { name: '本地', exact: true })).toHaveAttribute('aria-selected', 'true')
  } else if (selected.scene === 'detail') {
    const files = page.getByRole('region', { name: '会话文件', exact: true })
    await expect(files.locator('[data-file-id]')).toHaveCount(2)
    await files.getByRole('textbox', { name: '文件名称筛选', exact: true }).fill('竞品')
    await expect(files.locator('[data-file-id]')).toHaveCount(1)
    await expect(files).toContainText('竞品分析报告.md')
    await files.getByRole('textbox', { name: '文件名称筛选', exact: true }).fill('')
    await expect(files.locator('[data-file-id]')).toHaveCount(2)
  } else if (selected.scene === 'preview') {
    await expect(page.locator('[data-file-preview-kind="markdown"]')).toBeVisible()
    await expect(page.locator('[data-file-preview-kind="markdown"]').getByRole('heading', { name: '竞品分析报告.md', level: 1, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '显示源码', exact: true }).click()
    await expect(page.locator('[data-file-line="1"]')).toContainText('# 竞品分析报告.md')
    await page.getByRole('button', { name: '显示预览', exact: true }).click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(runtime.errors).toEqual([])
  expect(uiRegression.fixture!.state.calls).toBe(0)
  await page.mouse.move(0, 0)
})

Then('当前场景与已接受的UI截图一致', async ({ runtime, uiRegression }) => {
  await compareUiBaseline(runtime, uiRegression.selected!.id, test.info())
})

async function checkScheduleUi(runtime: import('../support/desktop').Desktop, showManager: boolean) {
  const page = runtime.page, list = page.getByRole('complementary', { name: '定时任务列表', exact: true })
  const read = () => page.evaluate(() => window.boai.request('getScheduleList', undefined))
  await expect(list.getByRole('button', { name: '定时任务说明', exact: true })).toBeVisible()
  await list.getByRole('button', { name: '定时任务选项', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '定时执行说明', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: '定时任务管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '定时任务管理', exact: true })
  for (const name of ['日常', '关注', '临时']) {
    await manager.getByRole('button', { name: '新建标签', exact: true }).click()
    await manager.getByRole('textbox', { name: '标签名称', exact: true }).fill(name)
    await manager.getByRole('button', { name: '保存新标签', exact: true }).click()
    await expect.poll(async () => (await read()).tags.some(tag => tag.name === name)).toBe(true)
    await expect(manager.getByRole('button', { name: '新建标签', exact: true })).toBeEnabled()
  }
  await manager.getByRole('checkbox', { name: '全选当前结果', exact: true }).check()
  await manager.getByRole('button', { name: '设置标签', exact: true }).click()
  for (const name of ['日常', '关注']) {
    await page.getByRole('checkbox', { name: `标签 ${name}`, exact: true }).check()
    await expect(page.getByRole('checkbox', { name: `标签 ${name}`, exact: true })).toBeEnabled()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: '搜索标签', exact: true })).toHaveCount(0)
  await manager.getByRole('button', { name: '筛选标签 临时', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '重命名标签', exact: true }).click()
  const rename = page.getByRole('dialog', { name: '重命名标签', exact: true })
  await rename.getByRole('textbox', { name: '标签名称', exact: true }).fill('可删除')
  await rename.getByRole('button', { name: '保存标签', exact: true }).click()
  await expect(manager.getByRole('button', { name: '筛选标签 可删除', exact: true })).toBeEnabled()
  await manager.getByRole('button', { name: '筛选标签 可删除', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除标签', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除标签', exact: true }).click()
  await expect.poll(async () => (await read()).tags.map(tag => tag.name)).toEqual(['日常', '关注'])
  await manager.getByRole('button', { name: '关闭定时任务管理', exact: true }).click()
  await expect(manager).toHaveCount(0)
  const daily = list.getByRole('group', { name: '日常', exact: true })
  const source = daily.getByRole('button', { name: 'AI 新闻早报', exact: true })
  const untagged = list.getByRole('button', { name: /^无标签/ })
  await source.dragTo(untagged)
  await expect.poll(async () => (await read()).tagIdsByAutomationId['ui-schedule-0']).toEqual([])
  await expect(list.getByRole('group', { name: '无标签', exact: true }).getByRole('button', { name: 'AI 新闻早报', exact: true })).toBeVisible()
  const row = daily.getByRole('button', { name: '每周五工作周报', exact: true })
  await row.focus(); await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(async () => (await read()).order.slice(0, 2)).toEqual(['ui-schedule-0', 'ui-schedule-2'])
  const count = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).definitions.length)
  expect(count).toBe(3)
  await list.getByRole('button', { name: '定时任务选项', exact: true }).click()
  await page.getByRole('menuitem', { name: '执行记录', exact: true }).click()
  const history = page.getByRole('region', { name: '执行记录', exact: true })
  await expect(history.locator('[data-occurrence-id]')).toHaveCount(3)
  // Verify real CSS motion, then restore reduced motion for deterministic screenshots.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await history.getByRole('tab', { name: '已完成', exact: true }).click()
  await expect(history.locator('[data-occurrence-id]')).toHaveCount(1)
  await expect(history.locator('[data-slot=tabs-indicator]')).toBeVisible()
  expect(await history.locator('[data-slot=tabs-indicator]').evaluate(el => getComputedStyle(el).transitionDuration)).toContain('0.25s')
  expect(await history.locator('[role=tabpanel] .t-panel-slide').evaluate(el => getComputedStyle(el).transitionDuration)).toContain('0.4s')
  await history.getByRole('tab', { name: '已完成', exact: true }).focus()
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')
  await expect(history.getByRole('tab', { name: '进行中', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(history.locator('[data-occurrence-id]')).toHaveCount(0)
  await history.getByRole('tab', { name: '需处理', exact: true }).click()
  const attention = await page.evaluate(() => window.boai.request('listAutomationHistory', { status: 'attention', limit: 30 }))
  await expect(history.locator('[data-occurrence-id]')).toHaveCount(attention.occurrences.length)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await history.getByRole('tab', { name: '全部', exact: true }).click()
  await expect(history.locator('[data-occurrence-id]')).toHaveCount(3)
  expect(await history.locator('[data-slot=tabs-indicator]').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  if (showManager) {
    await list.getByRole('button', { name: '定时任务选项', exact: true }).click()
    await page.getByRole('menuitem', { name: '定时任务管理', exact: true }).click()
    await manager.getByRole('checkbox', { name: '选择 每日复盘日报', exact: true }).check()
    await manager.getByRole('checkbox', { name: '选择 每周五工作周报', exact: true }).check()
    await expect(manager.getByRole('button', { name: '设置标签', exact: true })).toBeInViewport()
    expect(await manager.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await page.mouse.move(0, 0)
}

async function checkUserMenu(runtime: import('../support/desktop').Desktop) {
  const page = runtime.page
  const destinations = ['个人资料', '外观', '快捷键', '运行选项', '桌面活动与日报', '其他配置']
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveCount(destinations.length)
  await expect(menu.getByRole('menuitem').first()).toHaveAttribute('aria-label', '个人资料')
  await expect(menu.locator('[role=menuitem]:not(.user-menu-profile)')).toHaveText(destinations.slice(1))
  await expect(menu.getByRole('menuitem', { name: /^(分享|设置|帮助)$/ })).toHaveCount(0)
  for (const label of destinations) {
    await menu.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: label === '其他配置' ? '模型连接' : label, exact: true })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  }
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await expect(menu.getByRole('menuitem', { name: '其他配置', exact: true })).toBeInViewport()
  expect(await menu.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.mouse.move(0, 0)
}
