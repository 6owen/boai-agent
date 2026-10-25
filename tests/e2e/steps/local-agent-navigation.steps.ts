/*
 * [INPUT]: 原界面创建的本机员工、正式成果、独立Electron与解析真实路径后的原生文件选择。
 * [OUTPUT]: 原交付及记忆真实结束、侧栏不再处理中后，附件草稿/固定修订分别核对准确配置和零新增模型/零保存；实际动画结束留证，只读IPC故障不替换业务状态或真实运行时。
 * [POS]: 本机员工配置导航BDD，共用Codex/Claude原场景；故障仅限本场读取回执并在finally恢复。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchProfile } from '../../../packages/shared/src/domain'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { test } from '../support/test'
import { nextMaterialDialog } from '../support/materials'

type Mode = 'normal' | 'missing' | 'late-success' | 'late-error'
type Probe = typeof globalThis & { __localAgentNavigation: { mode: Mode; claimed: boolean; settled: boolean; writes: string[]; release(): void; dispose(): void } }
const { Then } = createBdd(test)

Then('用户从聊天底部准确配置本机员工并保留原草稿与成果引用', async ({ runtime }) => {
  const page = runtime.page, snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const employee = snapshot.agents.find(a => !a.systemRole && ['codex-local', 'claude-local'].includes(a.executionBackend?.kind ?? ''))!
  expect(employee).toBeDefined()
  const profileId = employee.executionBackend && employee.executionBackend.kind !== 'mastra-model' ? employee.executionBackend.profileId : ''
  const conversation = snapshot.conversations.find(c => c.kind === 'direct' && c.purpose !== 'automation' && c.agentIds[0] === employee.id)!
  const profile = (await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).find(p => p.id === profileId)!
  const read = () => page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  await expect.poll(async () => {
    const detail = await read()
    return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.runs.some(run => run.phase === 'memory') && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed')
  }, { timeout: 130000 }).toBe(true)
  const before = await read()
  expect(before.runs.every(run => run.status === 'completed')).toBe(true)
  expect(before.artifacts.length).toBeGreaterThan(0)
  const other = await page.evaluate(agentId => window.boai.request('createConversation', { kind: 'group', title: '独立导航会话', agentIds: [agentId] }), employee.id)
  const select = async (title: string) => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: title, exact: true }).click()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
  }
  await select(conversation.title)
  await expect(page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: conversation.title, exact: true })).not.toContainText('处理中')
  const draft = '配置导航过程中保留的修订说明'
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
  const file = join(await realpath(runtime.root), '导航草稿.txt'); await writeFile(file, '只准备、不发送的导航材料')
  await nextMaterialDialog(runtime, { path: file })
  await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  const material = page.locator('[data-material-draft-id][data-material-status="ready"]:visible')
  await expect(material).toHaveCount(1)
  const materialId = await material.getAttribute('data-material-draft-id')
  let reference: string | undefined, materialRetained = true
  const unchangedDraft = async () => {
    await expect(page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: conversation.title, exact: true })).not.toContainText('处理中')
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    if (reference) await expect(page.locator('.reply-preview:visible')).toHaveText(reference, { useInnerText: true })
    else await expect(page.locator('.reply-preview:visible')).toHaveCount(0)
    if (materialRetained) await expect(page.locator(`[data-material-draft-id="${materialId}"]:visible`)).toHaveAttribute('data-material-status', 'ready')
    else await expect(material).toHaveCount(0)
  }
  const menu = async (item: string) => {
    await page.getByRole('button', { name: '选择模型', exact: true }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
    await expect(page.getByRole('menu', { name: '选择模型', exact: true })).toHaveCount(0)
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const ledger = async () => ({ runs: await store.load('runs'), works: await store.load('workItems'), calls: await store.load('budgetModelCalls'), artifacts: await store.load('artifacts') })
  try {
    const baseline = await ledger()
    await runtime.app.evaluate(({ ipcMain }, profileId) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<any>> })._invokeHandlers, original = handlers.get('boai:request')!
      const state = { mode: 'normal' as Mode, claimed: false, settled: false, writes: [] as string[], release: () => {}, dispose: () => {} }
      state.dispose = () => { state.release(); ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) }
      Object.assign(globalThis, { __localAgentNavigation: state })
      ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
        if (['saveAgent', 'saveLaunchProfile', 'testLaunchProfile', 'sendMessage', 'reviseArtifact'].includes(payload.method)) state.writes.push(payload.method)
        if (payload.method !== 'listLaunchProfiles' || state.mode === 'normal') return original(event, payload)
        const mode = state.mode; state.mode = 'normal'
        const released = new Promise<void>(resolve => { state.release = resolve })
        state.claimed = true
        const result = await original(event, payload)
        if (mode === 'missing') { state.settled = true; return (result as LaunchProfile[]).filter(p => p.id !== profileId) }
        await released
        state.settled = true
        if (mode === 'late-error') throw new Error('本机连接导航读取故障')
        return result
      })
    }, profileId)
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '关闭 Agent 配置', exact: true }) })
    const settingsRoundTrip = async (label: string) => {
      await menu('员工设置')
      const editor = page.locator('.detail-content:visible')
      await expect(editor.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(employee.name)
      await expect(editor.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(profile.name)
      await runtime.reviewNativeCheckpoint(`${label}底部准确打开当前本机员工设置`)
      await editor.getByRole('button', { name: '取消', exact: true }).click()
      await unchangedDraft()
      await menu('管理本机 Agent')
      await expect(dialog.getByRole('textbox', { name: 'Agent 名称', exact: true })).toHaveValue(profile.name)
      if (!await dialog.getByRole('textbox', { name: '启动命令', exact: true }).isVisible()) await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
      await expect(dialog.getByRole('textbox', { name: '启动命令', exact: true })).toHaveValue(profile.executable)
      await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
      await runtime.reviewNativeCheckpoint(`${label}底部准确打开绑定的本机Agent配置`)
      await dialog.getByRole('button', { name: '关闭 Agent 配置', exact: true }).click()
      await select(conversation.title); await unchangedDraft()
      await runtime.reviewNativeCheckpoint(`${label}设置往返后保持原输入`)
    }
    await settingsRoundTrip('附件草稿')
    await page.getByRole('button', { name: '移除材料 导航草稿.txt', exact: true }).click()
    await expect(material).toHaveCount(0); materialRetained = false
    await page.locator('.chat-panel:visible').getByRole('button', { name: '要求修改', exact: true }).last().click()
    await expect(page.locator('.reply-preview:visible')).toContainText(before.artifacts.at(-1)!.name)
    reference = await page.locator('.reply-preview:visible').innerText()
    await settingsRoundTrip('固定修订')

    await runtime.app.evaluate(() => { Object.assign((globalThis as Probe).__localAgentNavigation, { mode: 'missing', claimed: false, settled: false }) })
    await menu('管理本机 Agent')
    await expect(page.getByText('原本机 Agent 配置已不存在，请在列表中核对连接。', { exact: true })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await runtime.reviewNativeCheckpoint('原本机绑定失效只返回原连接列表')
    await select(conversation.title); await unchangedDraft()

    for (const mode of ['late-success', 'late-error'] as const) {
      await runtime.app.evaluate(mode => { Object.assign((globalThis as Probe).__localAgentNavigation, { mode, claimed: false, settled: false }) }, mode)
      await menu('管理本机 Agent')
      await expect.poll(() => runtime.app.evaluate(() => (globalThis as Probe).__localAgentNavigation.claimed)).toBe(true)
      await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: other.title, exact: true }).click()
      await runtime.app.evaluate(() => (globalThis as Probe).__localAgentNavigation.release())
      await expect.poll(() => runtime.app.evaluate(() => (globalThis as Probe).__localAgentNavigation.settled)).toBe(true)
      await expect(page.getByRole('heading', { name: other.title, exact: true })).toBeVisible()
      await expect(page.locator('.settings-page:visible')).toHaveCount(0)
      await expect(page.getByText('本机连接导航读取故障', { exact: false })).toHaveCount(0)
      await select(conversation.title); await unchangedDraft()
    }
    expect(await ledger()).toEqual(baseline)
    expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(a => a.id === employee.id)).toEqual(employee)
    expect(await runtime.app.evaluate(() => (globalThis as Probe).__localAgentNavigation.writes)).toEqual([])
    await runtime.reviewData('底部导航原身份与零业务调用', { employeeId: employee.id, profileId, conversationId: conversation.id, before: baseline, after: await ledger(), materialDraftId: materialId, materialRemovedExplicitlyBeforeRevision: true, reference })
    await runtime.reviewNativeCheckpoint('缺失及迟到核对后原草稿与固定成果引用保持')
    expect(runtime.errors).toEqual([])
  } finally { try { await runtime.app.evaluate(() => (globalThis as Partial<Probe>).__localAgentNavigation?.dispose()) } finally { await store.close() } }
})
