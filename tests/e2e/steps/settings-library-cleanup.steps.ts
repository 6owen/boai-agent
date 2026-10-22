/*
 * [INPUT]: 原 Desktop、生产设置/分组/删除组件、隔离 SQLite 历史数据。
 * [OUTPUT]: 21 款真实 Tray.setImage/模板代表、空折叠组真实拖拽/分组 UI 持久化及四轮 bobo 清理事件/Toast。
 * [POS]: 五项改进的增量 Electron 验收；原生 Tray 观察包装保持调用，不替换实现。
 * [PROTOCOL]: 变化同步 Header 和所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { appIconPresets, defaultAppIconId } from '../../../src/shared/appearance'
import type { Conversation, Message } from '../../../src/shared/domain'
import type { PromptTemplate, PromptCollections } from '../../../src/shared/domain/prompt-templates'

type State = { prompts?: PromptTemplate[]; collections?: PromptCollections; rooms?: Conversation[]; finalIcon?: string; trayCalls?: unknown[] }
export const test = base.extend<{ improvement: State }>({ improvement: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function appearance(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '外观', exact: true }).click()
}
const iconStatus = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('getAppIconStatus', undefined))
async function applied(runtime: Desktop, id: string) {
  await expect.poll(() => iconStatus(runtime)).toMatchObject({ requestedId: id, pending: false, dock: { appliedId: id, error: null }, tray: { available: true, state: 'applied', appliedId: id, error: null, fallback: null } })
}
Given('隔离桌面已打开应用图标设置', async ({ runtime }) => {
  await runtime.start(); await appearance(runtime)
  await runtime.app.evaluate(({ Tray }) => {
    const target = globalThis as any
    target.trayChanges = []; target.trayObjects = []
    const original = Tray.prototype.setImage
    Tray.prototype.setImage = function(image) {
      original.call(this, image)
      if (!target.trayObjects.includes(this)) target.trayObjects.push(this)
      if (typeof image === 'string') throw new Error('验收预期原 NativeImage')
      target.trayChanges.push({ object: target.trayObjects.indexOf(this), scales: image.getScaleFactors(), template: image.isTemplateImage(), sizes: image.getScaleFactors().map(scale => image.getSize(scale)), pixels: image.getScaleFactors().map(scaleFactor => { const png = image.toPNG({ scaleFactor }); return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } }), bounds: this.getBounds() })
    }
  })
})
When('逐个选择全部图标并快速切换后隐藏恢复窗口', async ({ runtime, improvement }) => {
  for (const icon of appIconPresets) {
    await runtime.page.getByRole('group', { name: '选择应用图标', exact: true }).getByRole('button', { name: icon.name, exact: true }).click()
    await applied(runtime, icon.id)
    if (process.env.BOAI_REVIEW_NATIVE_TRAY === '1' && ['avatar-cat', 'avatar-bear', 'avatar-mint-ring'].includes(icon.id)) {
      const path = join(runtime.root, `${icon.id}-menu-bar.png`)
      await promisify(execFile)('/usr/sbin/screencapture', ['-x', path])
      await runtime.reviewFile(`实际菜单栏 ${icon.id}`, path, { required: true })
    }
  }
  const choices = appIconPresets.slice(2, 5)
  for (const icon of choices) await runtime.page.getByRole('group', { name: '选择应用图标', exact: true }).getByRole('button', { name: icon.name, exact: true }).click()
  improvement.finalIcon = choices.at(-1)!.id
  await applied(runtime, improvement.finalIcon)
  const observed = await runtime.app.evaluate(() => (globalThis as any).trayChanges) as { object: number; scales: number[]; template: boolean; sizes: { width: number; height: number }[]; pixels: { width: number; height: number }[]; bounds: { width: number; height: number } }[]
  expect(observed.length).toBeGreaterThanOrEqual(20)
  expect(new Set(observed.map(item => item.object)).size).toBe(1)
  for (const item of observed) { expect(item.scales).toEqual([1, 2]); expect(item.template).toBe(true); expect(item.sizes).toEqual([{ width: 22, height: 22 }, { width: 22, height: 22 }]); expect(item.pixels).toEqual([{ width: 22, height: 22 }, { width: 44, height: 44 }]); expect(item.bounds.width).toBeGreaterThan(0) }
  improvement.trayCalls = observed
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  await runtime.app.evaluate(({ app }) => app.emit('activate'))
  await expect.poll(() => runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
  await applied(runtime, improvement.finalIcon)
  await runtime.reviewNativeCheckpoint('21款图标切换后窗口恢复')
})
Then('图标重启保持且恢复默认同时更新Dock和托盘', async ({ runtime, improvement }) => {
  await runtime.restart(); await applied(runtime, improvement.finalIcon!); await appearance(runtime)
  await runtime.page.getByRole('button', { name: '恢复默认图标', exact: true }).click(); await applied(runtime, defaultAppIconId)
  const before = (await iconStatus(runtime)).sequence
  await runtime.page.getByRole('button', { name: '深色', exact: true }).click()
  await expect(runtime.page.locator('html')).toHaveClass(/dark/)
  expect((await iconStatus(runtime)).sequence).toBe(before)
  await runtime.reviewData('Tray原生模板与单对象更新', { calls: improvement.trayCalls, final: await iconStatus(runtime), physicalDisplayAppearance: 'not asserted by NativeImage metadata' })
  expect(runtime.errors).toEqual([])
})

async function library(runtime: Desktop) {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '资源库', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '资源库导航', exact: true }).locator('.custom-categories').getByRole('button', { name: '提示词', exact: true }).click()
  await expect(runtime.page.getByLabel('正在读取提示词分组', { exact: true })).toHaveCount(0)
}
const promptArea = (runtime: Desktop) => runtime.page.getByRole('region', { name: '提示词管理', exact: true })
const promptRow = (runtime: Desktop, name: string) => promptArea(runtime).locator('.skill-list-select').filter({ hasText: name })
const collections = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('getPromptCollections', undefined))
async function groupEditor(runtime: Desktop) { await runtime.page.getByRole('button', { name: '提示词分组', exact: true }).click(); await expect(runtime.page.getByRole('button', { name: '新建分组', exact: true })).toBeVisible() }
async function addGroup(runtime: Desktop, name: string) { await runtime.page.locator('.skill-groups-title').hover(); await runtime.page.getByRole('button', { name: '新建分组', exact: true }).click(); await runtime.page.getByRole('textbox', { name: '分组名称', exact: true }).fill(name); await runtime.page.getByRole('button', { name: '保存分组', exact: true }).click(); await expect(runtime.page.getByRole('group', { name: `分组 ${name}`, exact: true })).toBeVisible() }
Given('资源库已有三条独立提示词', async ({ runtime, improvement }) => {
  await runtime.start()
  improvement.prompts = await runtime.page.evaluate(async () => {
    const result = []
    for (const name of ['摘要甲', '摘要乙', '记录丙']) result.push(await window.boai.request('savePromptTemplate', { id: crypto.randomUUID(), expectedRevision: 0, name, description: '分组验收', content: `${name}正文保持不变。` }))
    return result
  })
  await library(runtime)
  await expect(promptArea(runtime).getByRole('group', { name: '未分组', exact: true }).locator('.skill-list-select')).toHaveCount(3)
})
When('我创建分组并移动排序搜索和重命名提示词分组', async ({ runtime, improvement }) => {
  await groupEditor(runtime); await addGroup(runtime, '工作'); await addGroup(runtime, '生活'); await runtime.page.keyboard.press('Escape')
  // Exercise native HTML drag through a collapsed empty header, then restore the original ungrouped item.
  const empty = promptArea(runtime).getByRole('button', { name: /^生活\s+0$/ })
  await empty.click(); await expect(empty).toHaveAttribute('aria-expanded', 'false')
  await promptRow(runtime, '记录丙').dragTo(empty)
  const life = (await collections(runtime)).groups.find(group => group.name === '生活')!
  await expect.poll(async () => (await collections(runtime)).groupByPromptId[improvement.prompts![2].id]).toBe(life.id)
  const filled = promptArea(runtime).getByRole('button', { name: /^生活\s+1$/ })
  await expect(filled).toHaveAttribute('aria-expanded', 'false'); await filled.click()
  await promptRow(runtime, '记录丙').dragTo(promptArea(runtime).getByRole('button', { name: /^未分组\s+2$/ }))
  await expect.poll(async () => (await collections(runtime)).groupByPromptId[improvement.prompts![2].id]).toBeUndefined()
  for (const name of ['摘要甲', '摘要乙']) {
    await runtime.page.getByRole('button', { name: `移动提示词 ${name} 到分组`, exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '工作', exact: true }).click()
    await expect(promptArea(runtime).getByRole('group', { name: '工作', exact: true }).locator('.skill-list-select').filter({ hasText: name })).toBeVisible()
  }
  await promptRow(runtime, '摘要乙').press('Alt+ArrowUp')
  await expect(promptArea(runtime).getByRole('group', { name: '工作', exact: true }).locator('.conversation-title')).toHaveText(['摘要乙', '摘要甲'])
  const trigger = promptArea(runtime).getByRole('button', { name: /^工作\s+2$/ })
  await trigger.click(); await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await runtime.page.getByRole('button', { name: '搜索提示词', exact: true }).click(); await runtime.page.getByRole('textbox', { name: '搜索提示词', exact: true }).fill('摘要甲')
  await expect(promptRow(runtime, '摘要甲')).toBeVisible(); await expect(promptRow(runtime, '摘要乙')).toHaveCount(0)
  const before = await collections(runtime)
  await promptRow(runtime, '摘要甲').press('Alt+ArrowUp'); expect(await collections(runtime)).toEqual(before)
  await runtime.page.getByRole('textbox', { name: '搜索提示词', exact: true }).fill('')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false'); await trigger.click()
  await groupEditor(runtime); await runtime.page.getByRole('button', { name: '重命名 工作', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '分组名称', exact: true }).fill('日常工作'); await runtime.page.getByRole('button', { name: '保存分组', exact: true }).click()
  await expect(runtime.page.getByRole('group', { name: '分组 日常工作', exact: true })).toBeVisible()
  await runtime.page.getByRole('group', { name: '分组 生活', exact: true }).press('Alt+ArrowUp')
  await expect.poll(async () => (await collections(runtime)).groups.map(group => group.name)).toEqual(['生活', '日常工作'])
  await runtime.page.keyboard.press('Escape')
  improvement.collections = await collections(runtime)
  await runtime.reviewCheckpoint('提示词分组排序与重命名')
})
Then('重启保留分组且删除分组保留提示词正文', async ({ runtime, improvement }) => {
  await runtime.restart(); expect(await collections(runtime)).toEqual(improvement.collections); await library(runtime)
  await groupEditor(runtime); await runtime.page.getByRole('button', { name: '删除分组 日常工作', exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(runtime.page.getByRole('group', { name: '分组 日常工作', exact: true })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
  await expect(promptArea(runtime).getByRole('group', { name: '未分组', exact: true }).locator('.conversation-title')).toHaveText(['记录丙', '摘要乙', '摘要甲'])
  const prompts = await runtime.page.evaluate(() => window.boai.request('listPromptTemplates', undefined))
  expect(prompts.sort((a, b) => a.id.localeCompare(b.id))).toEqual(improvement.prompts!.sort((a, b) => a.id.localeCompare(b.id)))
  await promptRow(runtime, '摘要甲').click(); await expect(runtime.page.getByRole('dialog')).toContainText('摘要甲正文保持不变。')
  await runtime.reviewCheckpoint('删除分组后提示词正文保留')
  expect(runtime.errors).toEqual([])
})

Given('隔离桌面有四个bobo历史会话', async ({ runtime, improvement }) => {
  await runtime.start()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await runtime.close()
  const at = new Date().toISOString()
  improvement.rooms = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), title: `bobo清理验收${i + 1}`, kind: 'direct' as const, purpose: 'core' as const, agentIds: ['bobo'], mode: 'natural' as const, workspacePath: join(snapshot.dataPath, 'workspaces', `cleanup-${i}`), configVersion: 1, sharedKnowledgeIds: [], createdAt: at, updatedAt: at }))
  const store = new ProductStore(join(snapshot.dataPath, 'boai.sqlite')); await store.init()
  try {
    for (const room of improvement.rooms) {
      await mkdir(room.workspacePath, { recursive: true })
      const message: Message = { id: randomUUID(), conversationId: room.id, senderType: 'agent', senderId: 'bobo', senderName: 'bobo', content: `待清理历史 ${room.title}`, status: 'completed', sequence: 1, createdAt: at }
      await store.write([{ collection: 'conversations', id: room.id, value: room }, { collection: 'messages', id: message.id, value: message }])
    }
  } finally { await store.close() }
  await runtime.start()
  await runtime.page.evaluate(() => {
    const target = window as any; target.cleanupEvents = []; target.cleanupToasts = []
    window.boai.subscribe(event => { if (event.type.startsWith('conversation:') || event.type === 'runtime-error') target.cleanupEvents.push(event) })
    const seen = new WeakMap<HTMLElement, string>()
    new MutationObserver(() => { for (const node of document.querySelectorAll<HTMLElement>('[data-sonner-toast]')) { const text = node.querySelector('[data-title]')?.textContent ?? node.textContent ?? ''; const key = `${node.dataset.type}:${text}`; if (text && seen.get(node) !== key) { seen.set(node, key); target.cleanupToasts.push({ type: node.dataset.type, text }) } } }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
})
When('我依次删除当前其他及最后一个bobo会话', async ({ runtime, improvement }) => {
  const list = runtime.page.getByRole('navigation', { name: '会话列表', exact: true })
  const row = (index: number) => list.getByRole('button', { name: improvement.rooms![index].title, exact: true })
  for (const index of [0, 2, 1, 3]) {
    if (index !== 2) await row(index).click()
    await row(index).click({ button: 'right' }); await runtime.page.getByRole('menuitem', { name: '删除会话', exact: true }).click()
    await runtime.page.getByRole('button', { name: '删除会话及记录', exact: true }).click()
    await expect(row(index)).toHaveCount(0)
    await expect(runtime.page.locator('[data-sonner-toast][data-type="success"]')).toContainText('会话已删除')
    await runtime.reviewCheckpoint(`bobo第${index + 1}会话删除成功`)
    // Dismiss through the real notification control, allowing the next success to be counted independently.
    const close = runtime.page.locator('[data-sonner-toast][data-type="success"] [data-close-button]')
    if (await close.count()) await close.click()
  }
})
Then('删除事件完成后提示成功且重启不恢复旧内容', async ({ runtime, improvement }) => {
  const result = await runtime.page.evaluate(() => ({ events: (window as any).cleanupEvents, toasts: (window as any).cleanupToasts }))
  expect(result.toasts.filter((item: any) => item.type === 'error')).toEqual([])
  expect(result.toasts.filter((item: any) => item.type === 'success' && item.text === '会话已删除')).toHaveLength(4)
  for (const room of improvement.rooms!) {
    const events = result.events.filter((event: any) => event.conversationId === room.id)
    expect(events.map((event: any) => event.type)).toEqual(['conversation:clearing', 'conversation:cleared'])
  }
  await runtime.restart()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  for (const room of improvement.rooms!) {
    expect(snapshot.conversations.find(item => item.id === room.id)?.list?.hidden).toBe(true)
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), room.id)
    expect(detail.messages).toEqual([]); expect(detail.runs).toEqual([])
  }
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('四次bobo删除真实事件与Toast', result)
})
