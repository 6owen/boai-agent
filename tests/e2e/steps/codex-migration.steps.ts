/*
 * [OUTPUT]: 旧ACP显式任务提交前经底部准确配置往返，保留正文与发送语义；零业务调用核对后继续原交付、迁移和重启断言。
 * [OUTPUT]: 旧式ACP经原界面显式任务/人工文件发布、重启再切同员工至Codex；旧无Work/未知用量保持，新请求才生成独立Work。
 * [OUTPUT]: 显式旧ACP迁移保存受理前/后丢答复，经原底部核读/载入和两次重启零重放，再执行原Codex新文件完整断言。
 * [INPUT]: 已交付文件的本机员工、原配置界面及SQLite只读记录。
 * [OUTPUT]: 等原文件工作私有记忆维护结束后建立迁移基线；同员工经API配置往返本机，旧消息/文件/预算和身份保持；換绑零调用，明确新聊天从获准历史新建thread。
 * [POS]: LR4桌面迁移；API阶段仅配置保存，不冒充真实API推理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from './codex-employee.steps'
import { openBindingEmployee } from '../support/skill-binding'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { verifyLocalAgentNavigation } from '../support/local-agent-navigation'
import { installSaveProbe, type SaveProbe } from '../support/agent-config-save'
import type { Desktop } from '../support/desktop'
import type { DigitalAgent } from '../../../src/shared/domain'

const { When, Then } = createBdd(test)
When('本场旧ACP迁移核对受理前后丢失的配置答复', async ({ codexEmployee }) => { codexEmployee.migrationSaveFault = true })
Then('同一员工经API配置切回本机后保留原交付并新建原生会话', async ({ runtime, codexEmployee }) => {
  test.setTimeout(900000)
  const id = codexEmployee.conversationId!, code = `CHAT_CODE_${randomUUID()}`
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const currentAgent = async () => (await snapshot()).agents.find(agent => agent.id === codexEmployee.employeeId)!
  const sessions = () => store.load<{ conversationId: string; threadId: string; inputMessageIds: string[] }>('codexSessions')
  const send = async (content: string) => {
    const repliesBefore = (await read()).messages.filter(message => message.senderType === 'agent').length
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length > repliesBefore && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed')
    }, { timeout: 390000 }).toBe(true)
    expect((await read()).runs.every(run => run.status === 'completed')).toBe(true)
    expect((await read()).messages.filter(message => message.senderType === 'agent').at(-1)!.content).toContain(code)
  }
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const identity = (agent: Awaited<ReturnType<typeof currentAgent>>) => ({ id: agent.id, name: agent.name, workspaceRef: agent.workspaceRef, memoryNamespace: agent.memoryNamespace, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds })
  try {
    // Delivery can precede private memory maintenance. Finish that earlier phase
    // before taking a migration baseline, so the ordinary new-message priority
    // policy does not intentionally cancel maintenance from the delivered Work.
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => turn.status === 'completed')
    }, { timeout: 130000 }).toBe(true)
    expect((await read()).runs.every(run => run.status === 'completed')).toBe(true)
    await send(`文件工作已结束。现在只是普通聊天，不执行任何工具。临时暗号是 ${code}，只回复这个暗号。`)
    const original = await read(), agent = await currentAgent(), native = (await sessions())[0]
    expect(native).toBeDefined(); expect(original.workItems).toHaveLength(1); expect(original.workItems![0].status).toBe('delivered')
    const artifact = original.artifacts[0], bytes = await readFile(artifact.path), modified = (await stat(artifact.path)).mtimeMs
    const calls = await store.load('budgetModelCalls'), memory = await store.load('memory')
    await runtime.reviewData('切换前同员工的原交付聊天和会话', { agent, detail: original, sessions: await sessions(), calls })
    await openBindingEmployee(runtime, '本机 Codex 同事')
    await runtime.page.getByRole('combobox', { name: '执行后端', exact: true }).click()
    await runtime.page.getByRole('option', { name: '模型 API · 聊天与协作', exact: true }).click()
    await expect(runtime.page.getByRole('combobox', { name: '模型连接', exact: true })).toContainText('暂未配置')
    await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await currentAgent()).executionBackend?.kind).toBe('mastra-model')
    expect(identity(await currentAgent())).toEqual(identity(agent))
    expect((await read()).messages).toEqual(original.messages); expect((await read()).runs).toEqual(original.runs)
    await chat(); await runtime.reviewCheckpoint('原员工切换API配置后旧交付仍可读')
    await runtime.restart()
    expect((await currentAgent()).executionBackend?.kind).toBe('mastra-model')
    expect((await read()).runs).toEqual(original.runs); expect(await store.load('memory')).toEqual(memory)
    await openBindingEmployee(runtime, '本机 Codex 同事')
    await runtime.page.getByRole('combobox', { name: '执行后端', exact: true }).click()
    await runtime.page.getByRole('option', { name: '本机 Codex · 聊天与协作', exact: true }).click()
    await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await currentAgent()).executionBackend?.kind).toBe('codex-local')
    expect(identity(await currentAgent())).toEqual(identity(agent))
    expect((await currentAgent()).executionBackend).toEqual(agent.executionBackend)
    expect((await read()).runs).toEqual(original.runs)
    await chat(); await send('这是普通聊天：刚才当前聊天的临时暗号是什么？只回复该暗号，不执行任何工作。')
    const final = await read(), next = (await sessions())[0]
    expect(next.threadId).not.toBe(native.threadId)
    expect(next.inputMessageIds).toEqual(final.messages.filter(message => message.id !== final.messages.at(-1)!.id).map(message => message.id))
    for (const message of original.messages) expect(final.messages.find(value => value.id === message.id)).toEqual(message)
    expect(final.workItems).toEqual(original.workItems); expect(final.workBudgets).toEqual(original.workBudgets); expect(final.artifacts).toEqual(original.artifacts)
    expect(await store.load('budgetModelCalls')).toEqual(calls)
    expect(await readFile(artifact.path)).toEqual(bytes); expect((await stat(artifact.path)).mtimeMs).toBe(modified)
    expect((await snapshot()).connections).toEqual([])
    await runtime.reviewData('同一员工往返切换后的新会话与原事实', { agent: await currentAgent(), detail: final, sessions: await sessions(), calls: await store.load('budgetModelCalls'), apiInferencePerformed: false })
    await runtime.reviewCheckpoint('切回本机后从原获准历史新建会话')
    expect(runtime.errors).toEqual([])
  } finally { await runtime.reviewData('本机配置往返最终原始状态', { detail: await read(), sessions: await sessions(), agent: await currentAgent() }); await store.close() }
})

Then('旧式ACP记录经原界面切到本机Codex后保留原文件并只为新请求建工作', async ({ runtime, codexEmployee }) => {
  test.setTimeout(540000)
  const page = runtime.page, id = codexEmployee.conversationId!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const agent = async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(value => value.id === codexEmployee.employeeId)!
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const native = await agent()
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: /手动添加 填写启动命令/ }).click()
  const dialog = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await dialog.getByRole('textbox', { name: 'Agent 名称', exact: true }).fill('旧式 ACP 验收连接')
  await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(process.execPath)
  await dialog.getByRole('button', { name: '添加参数', exact: true }).click()
  await dialog.getByRole('textbox', { name: '参数 1', exact: true }).fill(resolve('tests/fixtures/acp-agent.mjs'))
  await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
  await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).uncheck()
  await dialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('测试成功', { timeout: 30000 })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  const profile = (await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).find(value => value.name === '旧式 ACP 验收连接')!
  expect(profile.protocol).toBeUndefined()
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await page.getByRole('combobox', { name: '执行后端', exact: true }).click()
  await page.getByRole('option', { name: '外部 ACP · 仅显式任务', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(profile.name)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await agent()).executionBackend?.kind).toBe('acp-local')
  await chat()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('旧式ACP的明确文件任务：生成 report.txt。')
  await verifyLocalAgentNavigation(runtime, { employeeId: native.id, conversationId: id, label: '旧ACP显式任务' })
  await page.getByRole('button', { name: '执行外部任务', exact: true }).click()
  await expect.poll(async () => (await read()).runs[0]?.status).toBe('completed')
  await page.getByRole('button', { name: '查看外部任务文件', exact: true }).click()
  await page.getByRole('button', { name: '发布到会话', exact: true }).click()
  await expect.poll(async () => (await read()).artifacts.length).toBe(1)
  const before = await read(), legacyRun = before.runs[0], file = before.artifacts[0]
  const content = await readFile(file.path), modified = (await stat(file.path)).mtimeMs
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    expect(legacyRun).toMatchObject({ backend: { kind: 'acp-local', sessionPolicy: 'fresh', externalInvocations: 1 } })
    expect(legacyRun.workId).toBeUndefined(); expect(legacyRun.usage).toBeUndefined()
    expect(before.workItems).toEqual([]); expect(before.workBudgets).toEqual([])
    expect(await store.load('budgetModelCalls')).toEqual([])
    expect(content.toString()).toBe('controlled external artifact')
    await runtime.reviewFile('旧式ACP人工发布的原始文件', file.path)
    await runtime.reviewData('切换前旧ACP事实与独立夹具声明', { detail: before, profile, legacyRuntime: 'offline ACP protocol fixture', targetRuntime: codexEmployee.real ? 'real Codex' : 'offline Codex protocol fixture' })
    await page.getByRole('button', { name: '查看外部任务文件', exact: true }).scrollIntoViewIfNeeded()
    await runtime.reviewCheckpoint('旧式ACP的原回复与人工发布文件')
    await runtime.restart()
    expect((await read()).runs).toEqual(before.runs)
    if (codexEmployee.migrationSaveFault) await verifyLegacyMigrationUnknownSave(runtime, { native, conversationId: id })
    else {
      await openBindingEmployee(runtime, '本机 Codex 同事')
      await runtime.page.getByRole('combobox', { name: '执行后端', exact: true }).click()
      await runtime.page.getByRole('option', { name: '本机 Codex · 聊天与协作', exact: true }).click()
      await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
    }
    await expect.poll(async () => (await agent()).executionBackend?.kind).toBe('codex-local')
    expect(await agent()).toMatchObject({ id: native.id, workspaceRef: native.workspaceRef, memoryNamespace: native.memoryNamespace, executionBackend: native.executionBackend })
    expect((await read()).runs).toEqual(before.runs)
    expect((await read()).messages).toEqual(before.messages)
    await chat()
    await expect(runtime.page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible()
    const request = `NATIVE_FILE_TASK：这是切换到Codex后独立的新工作。新建并正式发布 codex-proof.md，正文是“${codexEmployee.token}”。不要修改、复制或重新发布旧ACP的 report.txt。完成后以新文件真实证据报告交付。`
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.workItems?.[0]?.status === 'delivered' && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed')
    }, { timeout: 390000 }).toBe(true)
    const after = await read()
    expect(after.workItems).toHaveLength(1); expect(after.workItems![0].status).toBe('delivered')
    expect(after.workItems![0].sourceMessageId).toBe(after.messages.find(message => message.content === request)!.id)
    expect(after.runs.every(run => run.status === 'completed')).toBe(true)
    expect(after.runs.find(run => run.id === legacyRun.id)).toEqual(legacyRun)
    expect(after.messages.filter(message => before.messages.some(prior => prior.id === message.id))).toEqual(before.messages)
    expect(after.artifacts.find(artifact => artifact.id === file.id)).toEqual(file)
    expect(await readFile(file.path)).toEqual(content); expect((await stat(file.path)).mtimeMs).toBe(modified)
    expect(after.artifacts).toHaveLength(2)
    const delivered = after.artifacts.find(artifact => after.workItems![0].artifactIds.includes(artifact.id!))!
    expect(await readFile(delivered.path, 'utf8')).toContain(codexEmployee.real ? codexEmployee.token! : 'NATIVE_FILE_TASK')
    expect((await store.load<{ runId: string }>('budgetModelCalls')).every(call => call.runId !== legacyRun.id)).toBe(true)
    await runtime.reviewFile('切换后本机Codex新工作原件', delivered.path)
    await runtime.reviewData('旧ACP与新Codex各自的业务事实', { detail: after, agent: await agent(), calls: await store.load('budgetModelCalls') })
    await runtime.page.locator(`#message-${after.messages.find(message => message.runId === legacyRun.id)!.id}`).scrollIntoViewIfNeeded()
    await runtime.reviewCheckpoint('切换本机后旧ACP原消息文件仍可查看')
    await runtime.restart()
    expect((await read()).runs).toEqual(after.runs); expect((await read()).workItems).toEqual(after.workItems)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('旧ACP切换最终原始状态', { detail: await read(), agent: await agent(), calls: await store.load('budgetModelCalls') })
    await store.close()
  }
})

async function verifyLegacyMigrationUnknownSave(runtime: Desktop, input: { native: DigitalAgent; conversationId: string }) {
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const agent = async () => (await snapshot()).agents.find(a => a.id === input.native.id)!
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: input.native.name, exact: true }).click()
  }
  const editor = () => runtime.page.locator('.detail-content:visible')
  const open = async () => {
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(input.native.name)
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ conversations: await store.load('conversations'), messages: await store.load('messages'), turns: await store.load('turns'), runs: await store.load('runs'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), artifacts: await store.load('artifacts'), codexSessions: await store.load('codexSessions'), claudeSessions: await store.load('claudeSessions') })
  const before = await records(), profiles = await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const legacy = await agent(), draft = '旧ACP切到本机Codex的未发送草稿'
  expect(legacy.executionBackend?.kind).toBe('acp-local')
  expect(before.works).toEqual([]); expect(before.budgets).toEqual([]); expect(before.calls).toEqual([])
  const attempts: { method: string; admitted: boolean; expectedConfigVersion?: number }[] = [], stages: unknown[] = []
  let installed = false
  try {
    for (const mode of ['before', 'after'] as const) {
      await chat(); await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
      const previous = await agent(); expect(previous.executionBackend).toEqual(legacy.executionBackend)
      await installSaveProbe(runtime); installed = true
      await open()
      await editor().getByRole('combobox', { name: '执行后端', exact: true }).click()
      await runtime.page.getByRole('option', { name: '本机 Codex · 聊天与协作', exact: true }).click()
      await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
      await editor().getByRole('button', { name: '保存修改', exact: true }).click()
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
      await expect(editor().getByRole('combobox', { name: '执行后端', exact: true })).toContainText('本机 Codex')
      const committed = await agent(), calls = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
      expect(committed.configVersion).toBe(previous.configVersion + (mode === 'after' ? 1 : 0))
      expect(committed.executionBackend).toEqual(mode === 'after' ? input.native.executionBackend : previous.executionBackend)
      expect({ ...committed, executionBackend: previous.executionBackend, configVersion: previous.configVersion }).toEqual(previous)
      expect(calls).toEqual([{ method: 'saveAgent', admitted: mode === 'after', expectedConfigVersion: previous.configVersion }])
      await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
      await expect(editor().getByText(mode === 'before' ? /版本未变也不作为本次保存的请求回执/ : /配置版本已经变化/)).toBeVisible()
      expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(calls)
      expect(await records()).toEqual(before)
      await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
      await runtime.reviewData(`旧ACP迁移${mode}未知保存只读核对`, { previous, committed, draft, calls, before, after: await records(), legacyRuntime: 'offline ACP protocol fixture' })
      await runtime.reviewNativeCheckpoint(`旧ACP迁移${mode}未知保存保持原草稿`)
      await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
      await runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '放弃并退出', exact: true }).click()
      await expect(editor().getByRole('combobox', { name: '执行后端', exact: true })).toContainText(mode === 'after' ? '本机 Codex' : '外部 ACP')
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
      await editor().getByRole('button', { name: '取消', exact: true }).click()
      await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
      attempts.push(...calls); await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
      await runtime.restart(); expect(await agent()).toEqual(committed); expect(await records()).toEqual(before)
      expect(await runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))).toEqual(profiles)
      await chat()
      await expect(runtime.page.getByRole('button', { name: mode === 'after' ? '发送消息' : '执行外部任务', exact: true })).toBeVisible()
      stages.push({ mode, previous, committed, afterRestart: await records(), freshUnsentDraftStagedExplicitly: true })
    }
    expect(attempts).toHaveLength(2); expect(attempts.filter(c => c.admitted)).toHaveLength(1)
    expect((await agent()).configVersion).toBe(legacy.configVersion + 1)
    expect((await agent()).executionBackend).toEqual(input.native.executionBackend)
    expect(await records()).toEqual(before); expect(runtime.errors).toEqual([])
    await runtime.reviewData('旧ACP未知迁移与两次重启最终核对', { conversationId: input.conversationId, legacy, native: input.native, finalAgent: await agent(), attempts, stages, before, after: await records(), legacyRuntime: 'offline ACP protocol fixture', automaticDraftRestorationClaimed: false })
  } finally {
    if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose())
    await runtime.reviewData('旧ACP未知迁移最终原状态', { agent: await agent(), records: await records(), attempts, stages })
    await store.close()
  }
}
