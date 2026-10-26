/*
 * [INPUT]: 原聊天或未发送核心草稿、实际本机绑定及只读SQLite业务记录。
 * [OUTPUT]: 底部准确打开员工/助手与本机配置，返回后保留正文、固定引用和发送语义；导航零保存/测试/发送，原业务账本与空白会话身份保持。
 * [POS]: Codex/Claude原问题、核心首发及旧ACP任务共用的UI往返核验；不替换业务请求或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { join } from 'node:path'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { Desktop } from './desktop'

type NavigationProbe = typeof globalThis & { __contextNavigation: { writes: string[]; dispose(): void } }

export async function verifyLocalAgentNavigation(runtime: Desktop, input: { employeeId: string; conversationId?: string; label: string }) {
  const page = runtime.page, snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const employee = snapshot.agents.find(agent => agent.id === input.employeeId)!
  const backend = employee.executionBackend
  if (!backend || backend.kind === 'mastra-model') throw new Error('本场导航需要明确本机员工绑定')
  const profile = (await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).find(value => value.id === backend.profileId)!
  expect(profile).toBeDefined()
  const core = !!employee.systemRole, conversation = snapshot.conversations.find(value => value.id === input.conversationId)
  if (input.conversationId) expect(conversation).toBeDefined()
  else expect(snapshot.conversations.filter(value => value.purpose === 'core')).toEqual([])
  const content = await page.getByRole('textbox', { name: '消息内容', exact: true }).inputValue()
  const preview = page.locator('.reply-preview:visible'), reference = await preview.count() ? await preview.innerText() : undefined
  const sendLabel = backend.kind === 'acp-local' ? '执行外部任务' : '发送消息'
  const unchangedDraft = async () => {
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(content)
    if (reference) await expect(preview).toHaveText(reference, { useInnerText: true })
    else await expect(preview).toHaveCount(0)
    await expect(page.getByRole('button', { name: sendLabel, exact: true })).toBeEnabled()
  }
  const menu = async (label: string) => {
    await page.getByRole('button', { name: '选择模型', exact: true }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByRole('menu', { name: '选择模型', exact: true })).toHaveCount(0)
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ agents: await store.load('agents'), conversations: await store.load('conversations'), messages: await store.load('messages'), runs: await store.load('runs'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), occurrences: await store.load('automationOccurrences'), artifacts: await store.load('artifacts'), codexSessions: await store.load('codexSessions'), claudeSessions: await store.load('claudeSessions') })
  try {
    const before = await records()
    await runtime.app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<any>> })._invokeHandlers, original = handlers.get('boai:request')!
      const state = { writes: [] as string[], dispose: () => { ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) } }
      Object.assign(globalThis, { __contextNavigation: state })
      ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', (event, payload) => {
        if (['saveAgent', 'saveLaunchProfile', 'testLaunchProfile', 'testLaunchProfileDraft', 'sendMessage', 'sendExternalTask', 'replyInboxQuestion', 'reviseArtifact', 'createConversation', 'startCoreConversation'].includes(payload.method)) state.writes.push(payload.method)
        return original(event, payload)
      })
    })
    await menu(core ? '助手设置' : '员工设置')
    const editor = page.locator('.detail-content:visible')
    await expect(editor.getByRole('textbox', { name: core ? '助手名称' : '员工名称', exact: true })).toHaveValue(employee.name)
    await expect(editor.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(profile.name)
    await runtime.reviewNativeCheckpoint(`${input.label}底部准确打开原员工配置`)
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await unchangedDraft()
    await menu('管理本机 Agent')
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '关闭 Agent 配置', exact: true }) })
    await expect(dialog.getByRole('textbox', { name: 'Agent 名称', exact: true })).toHaveValue(profile.name)
    if (!await dialog.getByRole('textbox', { name: '启动命令', exact: true }).isVisible()) await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: '启动命令', exact: true })).toHaveValue(profile.executable)
    await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
    await runtime.reviewNativeCheckpoint(`${input.label}底部准确打开原本机配置`)
    await dialog.getByRole('button', { name: '关闭 Agent 配置', exact: true }).click()
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    if (conversation) await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: conversation.title, exact: true }).click()
    await unchangedDraft()
    const after = await records(), writes = await runtime.app.evaluate(() => (globalThis as NavigationProbe).__contextNavigation.writes)
    await runtime.reviewData(`${input.label}导航原身份与零业务调用`, { employeeId: employee.id, profileId: profile.id, conversationId: input.conversationId, coreDraft: !input.conversationId, content, reference, sendLabel, before, after, writes })
    expect(after).toEqual(before)
    expect(writes).toEqual([])
    await runtime.reviewNativeCheckpoint(`${input.label}设置往返后原输入与发送语义保持`)
  } finally {
    try { await runtime.app.evaluate(() => (globalThis as Partial<NavigationProbe>).__contextNavigation?.dispose()) } finally { await store.close() }
  }
}
