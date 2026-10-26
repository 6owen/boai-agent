/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 真正窗口关闭的未保存测试显式关闭后台常驻，保留原原生关闭/草稿断言。
 * [OUTPUT]: 核心助手未发送首发的正常/受理前后未知保存沿原配置，草稿与零业务调用分别核对；两次实际重启不重放，只有明确发送才建立核心聊天并调用当前本机员工。
 * [OUTPUT]: 同程序独立profile正常保存及切回保留员工/聊天历史，保存与两次重启无调用；明确新消息用当前profile重建原生thread，不把正常换绑继承为其他程序/模型验证。
 * [OUTPUT]: 保存答复故障复用agent-config-save原IPC支撑，原正常/核心/未知/重启断言保持。
 * [OUTPUT]: 本场真实额外BrowserWindow经明确测试桥发送实际IPC，被原主窗口身份门禁拒绝，主编辑草稿/配置及明确Codex新消息保持；不开放双主窗口编辑。
 * [OUTPUT]: 额外窗口场景明确核对本人公开回复与原chat运行，异常独立清理窗口/留证/数据库并保留原错误；原本轮及阶段时限保持。
 * [OUTPUT]: 额外窗口场景结束复用本场实际进程身份退出核对，正常关闭前后只读facts与Trace分别留证，关闭后不请求已退出窗口；不证明未观察到的孤儿进程或原生未保存弹窗。
 * [INPUT]: 原界面创建的本机Codex/Claude员工、底部员工设置、真实IPC和只读SQLite。
 * [OUTPUT]: 正常保存及受理前/后答复丢失保留草稿，未知时只读核对并显式载入；同员工配置往返API/本机不重放；实际原生关闭弹窗由CUA操作，真实继续/放弃结果及窗口关闭后重启保持原配置。
 * [POS]: 本机底部配置保存BDD；故障只作用于本场IPC答复，不替换员工保存、模型或业务事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { AgentRun, ArtifactVersion, DiscussionTurn } from '../../../packages/shared/src/domain'
import type { ProfileModelCall } from '../../../packages/runtime/src/modules/profile/profile-activity'
import { test } from '../support/test'
import type { Desktop } from '../support/desktop'
import { installSaveProbe, type SaveProbe } from '../support/agent-config-save'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { openBindingEmployee } from '../support/skill-binding'

type NativeCloseProbe = typeof globalThis & { __nativeClose: { calls: { title: string; message: string; buttons: string[]; response?: number }[]; dispose(): void } }
const { Then } = createBdd(test)

async function configurationContext(runtime: Desktop) {
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const initial = await snapshot()
  const employee = initial.agents.find(value => !value.systemRole && ['codex-local', 'claude-local'].includes(value.executionBackend?.kind ?? ''))!
  expect(employee).toBeDefined()
  const kind = employee.executionBackend!.kind as 'codex-local' | 'claude-local'
  const id = initial.conversations.find(value => value.kind === 'direct' && value.agentIds[0] === employee.id)!.id
  const agent = async () => (await snapshot()).agents.find(value => value.id === employee.id)!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const chat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: employee.name, exact: true }).click()
  }
  const editor = () => runtime.page.locator('.detail-content:visible')
  const open = async () => {
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(employee.name)
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const facts = async () => ({ conversations: await store.load('conversations'), messages: await store.load('messages'), turns: await store.load('turns'), runs: await store.load('runs'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), artifacts: await store.load('artifacts') })
  const sessionCollection = kind === 'codex-local' ? 'codexSessions' : 'claudeSessions'
  return { snapshot, initial, employee, kind, id, agent, read, chat, editor, open, store, facts, sessionCollection }
}

Then('本机核心助手未知保存保持首发草稿并在两次重启后只响应明确消息', async ({ runtime }) => {
  test.setTimeout(600000)
  let page = runtime.page
  const snapshot = () => page.evaluate(() => window.boai.request('snapshot', undefined))
  const initial = await snapshot(), employee = initial.agents.find(a => !a.systemRole && ['codex-local', 'claude-local'].includes(a.executionBackend?.kind ?? ''))!
  expect(employee).toBeDefined()
  const kind = employee.executionBackend!.kind, real = test.info().annotations.some(a => a.type === 'model-mode' && a.description === 'real-provider')
  const core = async () => (await snapshot()).agents.find(a => a.id === 'bobo')!
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
  await page.getByRole('combobox', { name: '执行后端', exact: true }).click()
  await expect(page.getByRole('option', { name: '外部 ACP · 仅显式任务', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: kind === 'codex-local' ? '本机 Codex · 聊天与协作' : '本机 Claude · 聊天与协作', exact: true }).click()
  if (kind === 'claude-local') {
    await page.getByRole('combobox', { name: '模型连接', exact: true }).click()
    await page.getByRole('option', { name: initial.connections.find(c => c.id === employee.connectionId)!.name, exact: true }).click()
  }
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await core()).executionBackend).toEqual(employee.executionBackend)
  const configured = await core(), store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ conversations: await store.load('conversations'), messages: await store.load('messages'), turns: await store.load<DiscussionTurn>('turns'), runs: await store.load<AgentRun>('runs'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load<ProfileModelCall>('profileModelCalls'), artifacts: await store.load('artifacts'), codexSessions: await store.load('codexSessions'), claudeSessions: await store.load('claudeSessions') })
  const before = await records(), draft = '核心助手配置核对期间保留、尚未发送的首条消息', attempts: unknown[] = [], stages: unknown[] = []
  const editor = () => page.locator('.detail-content:visible')
  const blank = async () => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
  }
  const open = async () => {
    await page.getByRole('button', { name: '选择模型', exact: true }).click()
    await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '助手名称', exact: true })).toHaveValue(configured.name)
  }
  const unchanged = async () => {
    expect(await records()).toEqual(before)
    expect((await snapshot()).agents.find(a => a.id === employee.id)).toEqual(employee)
    expect((await snapshot()).conversations.filter(c => c.purpose === 'core')).toEqual([])
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
  }
  let installed = false
  try {
    await blank(); await installSaveProbe(runtime); installed = true
    await open(); await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill('核心助手正常保存的职责')
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await core()).configVersion).toBe(configured.configVersion + 1)
    await unchanged()
    for (const mode of ['before', 'after'] as const) {
      const previous = await core(), role = `核心助手${mode}未知保存的职责`
      await open(); await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
      await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
      await editor().getByRole('button', { name: '保存修改', exact: true }).click()
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
      const committed = await core(), calls = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
      expect(committed.configVersion).toBe(previous.configVersion + (mode === 'after' ? 1 : 0))
      expect(committed.role).toBe(mode === 'after' ? role : previous.role)
      expect({ ...committed, role: previous.role, configVersion: previous.configVersion }).toEqual(previous)
      await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
      await expect(editor().getByText(mode === 'before' ? /版本未变也不作为本次保存的请求回执/ : /配置版本已经变化/)).toBeVisible()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
      expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(calls)
      await unchanged()
      await runtime.reviewData(`核心助手${mode}未知配置与首发未提交`, { kind, previous, committed, draft, calls, before, after: await records() })
      if (mode === 'after') await runtime.reviewNativeCheckpoint('核心助手受理后未知保存保留原首发草稿')
      await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
      await page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(committed.role)
      await editor().getByRole('button', { name: '取消', exact: true }).click(); await unchanged()
      attempts.push(...calls); await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
      await runtime.restart(); page = runtime.page; expect(await core()).toEqual(committed); expect(await records()).toEqual(before)
      await blank(); await unchanged(); stages.push({ mode, previous, committed, afterRestart: await records() })
      if (mode === 'before') { await installSaveProbe(runtime); installed = true }
    }
    expect(attempts).toHaveLength(3)
    expect(attempts.every(call => (call as { method: string }).method === 'saveAgent')).toBe(true)
    const saved = await core(); expect(saved.configVersion).toBe(configured.configVersion + 2)
    const code = `CHAT_CODE_${randomUUID()}`, content = `现在只是普通聊天，不创建员工、群聊或任务，不执行工具，不保存长期记忆。临时暗号为 ${code}，只回复这个暗号。${!real && kind === 'claude-local' ? ' empty-memory' : ''}`
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const r = await records()
      return r.runs.some(v => ['failed', 'cancelled', 'interrupted'].includes(v.status)) || r.runs.length === 3 && r.runs.every(v => v.status === 'completed') && r.turns.every(v => v.status === 'completed')
    }, { timeout: 300000 }).toBe(true)
    const final = await records()
    expect(final.runs).toHaveLength(3)
    for (const r of final.runs) expect(r).toMatchObject({ agentId: saved.id, status: 'completed', backend: saved.executionBackend })
    expect(final.profileCalls).toHaveLength(3); expect(final.profileCalls.every(c => final.runs.some(r => r.id === c.runId && r.agentId === saved.id))).toBe(true)
    for (const k of ['works', 'budgets', 'calls', 'artifacts'] as const) expect(final[k]).toEqual(before[k])
    const current = await snapshot(), conversation = current.conversations.find(c => c.purpose === 'core')!
    expect(current.conversations.filter(c => c.purpose === 'core')).toHaveLength(1)
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    expect(detail.messages.filter(m => m.senderType === 'agent').at(-1)!.content).toContain(!real && kind === 'claude-local' ? '首次公开回复' : code)
    expect(current.agents.find(a => a.id === employee.id)).toEqual(employee); expect(await core()).toEqual(saved); expect(current.connections).toEqual(initial.connections)
    await runtime.reviewData('核心未知保存两重启及明确新消息最终核对', { kind, configured, saved, attempts, stages, before, final, conversationId: conversation.id, firstExplicitContent: content, internalModelCalls: 'unknown', controlledRestarts: 2, nativeCloseTested: false })
    await runtime.reviewNativeCheckpoint('核心助手两次重启后明确首发使用当前本机配置回复')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('核心助手配置验收最终原状态', { core: await core(), records: await records() })
    if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose())
    await store.close()
  }
})

Then('原员工正常更换独立本机配置并切回后只执行明确新交流', async ({ runtime }) => {
  test.setTimeout(600000)
  const { initial, employee, kind, id, agent, read, chat, editor, open, store, facts, sessionCollection } = await configurationContext(runtime)
  const real = test.info().annotations.some(value => value.type === 'model-mode' && value.description === 'real-provider')
  const profiles = () => runtime.page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const originalProfiles = await profiles(), original = originalProfiles.find(value => value.id === (employee.executionBackend as { profileId: string }).profileId)!
  const records = async () => ({ ...await facts(), profileCalls: await store.load<import('../../../packages/runtime/src/modules/profile/profile-activity').ProfileModelCall>('profileModelCalls'), sessions: await store.load<{ id: string; threadId: string; fingerprint: string; state: string }>(sessionCollection) })
  const code = `CHAT_CODE_${randomUUID()}`, draft = '更换配置期间保留的原聊天草稿'
  const send = async (content: string, profileId: string) => {
    const before = await records()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const d = await read(), added = d.runs.filter(run => !before.runs.some(value => (value as { id: string }).id === run.id))
      return added.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || added.length === 3 && added.every(run => run.status === 'completed') && d.turns!.every(turn => turn.status === 'completed')
    }, { timeout: 240000 }).toBe(true)
    const after = await records(), detail = await read(), added = detail.runs.filter(run => !before.runs.some(value => (value as { id: string }).id === run.id))
    expect(added).toHaveLength(3)
    expect(added.every(run => run.status === 'completed' && run.backend?.kind === kind && run.backend.profileId === profileId)).toBe(true)
    expect(detail.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(kind === 'claude-local' && !real ? '首次公开回复' : code)
    for (const name of ['messages', 'turns', 'runs', 'profileCalls'] as const) {
      for (const row of before[name] as { id: string }[]) expect((after[name] as { id: string }[]).find(value => value.id === row.id)).toEqual(row)
    }
    expect(after.profileCalls).toHaveLength(before.profileCalls.length + 3)
    expect(after.profileCalls.filter(value => !before.profileCalls.some(row => row.id === value.id)).every(value => added.some(run => run.id === value.runId))).toBe(true)
    for (const name of ['works', 'budgets', 'calls', 'artifacts'] as const) expect(after[name]).toEqual([])
    expect(after.sessions).toHaveLength(1); expect(after.sessions[0].state).toBe('completed')
    if (before.sessions.length) {
      expect(after.sessions[0].id).toBe(before.sessions[0].id)
      expect(after.sessions[0].threadId).not.toBe(before.sessions[0].threadId)
      expect(after.sessions[0].fingerprint).not.toBe(before.sessions[0].fingerprint)
    }
    await expect(runtime.page.getByText('处理中', { exact: true })).toHaveCount(0)
    await runtime.reviewData('明确新聊天使用当前本机配置且保留原历史', { kind, profileId, employeeId: employee.id, conversationId: id, before, after, internalModelCalls: 'unknown' })
    return after
  }
  try {
    await chat()
    const first = await send(`现在只是普通聊天，不执行任何工具，不保存长期记忆。临时暗号为 ${code}，只回复这个暗号。${!real && kind === 'claude-local' ? ' empty-memory' : ''}`, original.id)
    const originalAgent = await agent()
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
    await runtime.page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
    await runtime.page.getByRole('button', { name: kind === 'codex-local' ? '本机 Codex 使用已安装的 Codex 和本机登录，支持连续聊天' : '本机 Claude 使用已安装程序，在员工设置中选择模型 API', exact: true }).click()
    const dialog = runtime.page.getByRole('dialog', { name: '手动添加 Agent', exact: true }), name = kind === 'codex-local' ? '本场正常换绑Codex配置' : '本场正常换绑Claude配置'
    await dialog.getByRole('textbox', { name: 'Agent 名称', exact: true }).fill(name)
    await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(original.executable)
    if (kind === 'codex-local' && !real) {
      await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
      await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).uncheck()
    }
    await dialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
    await dialog.getByRole('button', { name: '测试', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText(kind === 'codex-local' ? '测试成功' : '程序已核对', { timeout: 30000 })
    await runtime.reviewNativeCheckpoint('正常换绑目标配置在原设置实际核对')
    await dialog.getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog).toBeHidden()
    const all = await profiles(), target = all.find(value => value.name === name)!
    expect(target.id).not.toBe(original.id)
    expect(target).toMatchObject({ protocol: original.protocol, executable: original.executable, executableHash: original.executableHash, verified: { name: original.verified!.name, version: original.verified!.version, protocolVersion: original.verified!.protocolVersion } })
    expect(all.find(value => value.id === original.id)).toEqual(original)
    expect(await agent()).toEqual(originalAgent); expect(await records()).toEqual(first)
    await chat()
    const stages = []
    for (const profile of [target, original]) {
      const before = await records(), beforeAgent = await agent()
      await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
      await open(); await editor().getByRole('combobox', { name: '本机连接', exact: true }).click()
      await runtime.page.getByRole('option', { name: profile.name, exact: true }).click()
      await editor().getByRole('button', { name: '保存修改', exact: true }).click()
      await expect.poll(async () => (await agent()).configVersion).toBe(beforeAgent.configVersion + 1)
      const saved = await agent()
      expect(saved.executionBackend).toEqual({ kind, profileId: profile.id })
      for (const field of ['id', 'name', 'instructions', 'role', 'workspaceRef', 'memoryNamespace', 'connectionId', 'modelId'] as const) expect(saved[field]).toEqual(originalAgent[field])
      expect(await records()).toEqual(before); expect(await profiles()).toEqual(all)
      await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
      await runtime.reviewData('正常配置保存不创建消息或重放原生调用', { kind, profile, beforeAgent, saved, before, after: await records() })
      await runtime.reviewNativeCheckpoint('正常换绑后保持原聊天草稿及准确绑定')
      await runtime.restart(); expect(await agent()).toEqual(saved); expect(await records()).toEqual(before); expect(await profiles()).toEqual(all)
      await chat(); await runtime.reviewNativeCheckpoint('正常换绑重启只显示原已提交聊天')
      const after = await send(`这是明确的新普通聊天：刚才当前聊天的临时暗号是什么？只回复暗号，不执行任何工作或长期记忆。${!real && kind === 'claude-local' ? ' empty-memory' : ''}`, profile.id)
      stages.push({ profileId: profile.id, saved, before, after })
      await runtime.reviewNativeCheckpoint('正常换绑后明确新消息使用当前配置回复')
    }
    expect((await agent()).executionBackend).toEqual(originalAgent.executionBackend)
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual(initial.connections)
    expect(runtime.errors).toEqual([])
    await runtime.reviewData('同员工独立本机配置往返及两次重启最终核对', { kind, originalAgent, original, target, first, stages, finalAgent: await agent(), final: await records(), sameProgramDifferentProfile: true, noOtherProgramOrModelClaim: true })
  } finally {
    await runtime.reviewData('正常本机配置换绑最终原状态', { kind, agent: await agent(), profiles: await profiles(), records: await records() })
    await store.close()
  }
})




Then('用户从聊天底部保存原员工并核对两种丢失答复且重启不重放', async ({ runtime }) => {
  test.setTimeout(600000)
  const { snapshot, initial, employee, kind: localKind, id, agent, read, chat, editor, open, store, facts, sessionCollection } = await configurationContext(runtime)
  const real = test.info().annotations.some(annotation => annotation.type === 'model-mode' && annotation.description === 'real-provider')
  const code = `CHAT_CODE_${randomUUID()}`
  const send = async (content: string) => {
    const before = (await read()).messages.length
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.messages.length > before + 1 && detail.turns!.every(turn => turn.status === 'completed') && detail.runs.every(run => run.status === 'completed')
    }, { timeout: 300000 }).toBe(true)
    const detail = await read()
    expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
    expect(detail.messages.filter(message => message.senderType === 'agent').at(-1)!.content).toContain(localKind === 'claude-local' && !real ? '首次公开回复' : code)
    expect(detail.workItems).toEqual([]); expect(detail.workBudgets).toEqual([])
  }
  let installed = false
  try {
    await chat()
    await send(`现在只是普通聊天，不执行任何工具。不保存长期记忆。临时暗号是 ${code}，只回复这个暗号。${!real && localKind === 'claude-local' ? ' empty-memory' : ''}`)
    const originalAgent = await agent(), originalFacts = await facts(), originalSessions = await store.load(sessionCollection)
    const draft = '设置保存期间保留的普通聊天草稿'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
    await installSaveProbe(runtime); installed = true
    const unchanged = async () => {
      expect(await facts()).toEqual(originalFacts)
      await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    }
    await open()
    const normalRole = '通过底部保存的独立聊天员工'
    await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(normalRole)
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await agent()).configVersion).toBe(originalAgent.configVersion + 1)
    expect((await agent()).role).toBe(normalRole)
    await unchanged()
    await runtime.reviewNativeCheckpoint('底部正常保存原员工且聊天草稿保留')
    for (const mode of ['before', 'after'] as const) {
      const before = await agent(), role = mode === 'before' ? '受理前失联的未保存职责' : '受理后失联的已提交职责'
      await open()
      await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
      await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
      await editor().getByRole('button', { name: '保存修改', exact: true }).click()
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
      const committed = await agent()
      expect(committed.configVersion).toBe(before.configVersion + (mode === 'after' ? 1 : 0))
      expect(committed.role).toBe(mode === 'after' ? role : before.role)
      const attempts = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
      await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
      await expect(editor().getByText(mode === 'before' ? /版本未变也不作为本次保存的请求回执/ : /配置版本已经变化/)).toBeVisible()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
      expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(attempts)
      expect(await facts()).toEqual(originalFacts)
      await runtime.reviewData(`底部保存${mode}原草稿与提交事实`, { before, committed, draftRole: role, calls: attempts, facts: await facts() })
      await runtime.reviewNativeCheckpoint(`底部保存${mode}答复丢失后只读核对且草稿保留`)
      await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
      await runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(committed.role)
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
      await editor().getByRole('button', { name: '取消', exact: true }).click()
      await unchanged()
    }
    for (const kind of ['mastra-model', localKind] as const) {
      // The existing API menu manages model connections. Return through the
      // original contact editor after explicitly leaving the local backend.
      if (kind === 'mastra-model') await open()
      else await openBindingEmployee(runtime, employee.name)
      await runtime.page.getByRole('combobox', { name: '执行后端', exact: true }).click()
      await runtime.page.getByRole('option', { name: kind === 'mastra-model' ? '模型 API · 聊天与协作' : kind === 'codex-local' ? '本机 Codex · 聊天与协作' : '本机 Claude · 聊天与协作', exact: true }).click()
      if (kind === 'claude-local') {
        await runtime.page.getByRole('combobox', { name: '模型连接', exact: true }).click()
        await runtime.page.getByRole('option', { name: initial.connections.find(value => value.id === employee.connectionId)!.name, exact: true }).click()
      }
      await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
      await expect.poll(async () => (await agent()).executionBackend?.kind).toBe(kind)
      await chat()
      await unchanged()
    }
    const saved = await agent(), calls = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
    expect(calls).toHaveLength(5)
    expect(calls.every(call => call.method === 'saveAgent')).toBe(true)
    expect(calls.filter(call => call.admitted)).toHaveLength(4)
    expect(saved.configVersion).toBe(originalAgent.configVersion + 4)
    expect(saved.executionBackend).toEqual(originalAgent.executionBackend)
    expect(saved.id).toBe(originalAgent.id); expect(saved.workspaceRef).toBe(originalAgent.workspaceRef); expect(saved.memoryNamespace).toBe(originalAgent.memoryNamespace)
    await runtime.reviewData('底部配置往返只保存原员工不执行业务', { originalAgent, saved, originalFacts, originalSessions, sessions: await store.load(sessionCollection), calls, apiInferencePerformed: false })
    await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
    await runtime.restart()
    expect(await agent()).toEqual(saved)
    expect(await facts()).toEqual(originalFacts)
    await chat()
    await runtime.reviewNativeCheckpoint('底部配置保存并往返后重启不重放原聊天')
    await send(`这是普通聊天：刚才当前聊天的临时暗号是什么？只回复该暗号，不执行任何工作。${!real && localKind === 'claude-local' ? ' empty-memory' : ''}`)
    const final = await read()
    for (const message of originalFacts.messages as { id: string }[]) expect(final.messages.find(value => value.id === message.id)).toEqual(message)
    if (localKind === 'claude-local' && !real) {
      const received = JSON.parse(await readFile(join(runtime.root, 'v2', 'agents', employee.id, 'workspace', 'sessions', id, 'work', 'chat-received.json'), 'utf8'))
      expect(received.payload.historicalBackground.some((message: { content: string }) => message.content.includes(code))).toBe(true)
      const sessions = await store.load<{ threadId: string }>(sessionCollection)
      expect(sessions[0].threadId).not.toBe((originalSessions[0] as { threadId: string }).threadId)
      await runtime.reviewData('Claude离线配置换绑后新会话带入原获准背景', received)
    }
    expect((await snapshot()).connections).toEqual(initial.connections)
    expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('配置后明确新交流及原聊天保持', { saved, final, sessions: await store.load(sessionCollection), facts: await facts() })
    await runtime.reviewNativeCheckpoint('配置后明确新消息才接续本机员工')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('底部配置保存最终原状态', { agent: await agent(), detail: await read(), facts: await facts() })
    if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose())
    await store.close()
  }
})

Then('未知员工保存由真实原生关闭弹窗继续或放弃后重启不重放', async ({ runtime }) => {
  test.skip(process.platform !== 'darwin' || process.env.BOAI_TEST_NATIVE_DIALOG !== '1', '真实原生弹窗必须显式开启并由CUA操作，不使用预设按钮结果')
  test.setTimeout(900000)
  expect(process.env.BOAI_NATIVE_DIALOG_COORD_DIR).toBeTruthy()
  const { employee, kind, agent, read, chat, editor, open, store, facts, sessionCollection } = await configurationContext(runtime)
  const desktop = await runtime.page.evaluate(() => window.boai.request('getDesktopSettings', undefined))
  await runtime.page.evaluate(revision => window.boai.request('updateDesktopSettings', { patch: { runInBackground: false }, expectedRevision: revision }), desktop.revision)
  const coordinator = process.env.BOAI_NATIVE_DIALOG_COORD_DIR!
  await mkdir(coordinator, { recursive: true })
  const code = `NATIVE_CLOSE_${randomUUID()}`
  const real = test.info().annotations.some(value => value.type === 'model-mode' && value.description === 'real-provider')
  let saveInstalled = false, dialogInstalled = false
  const allCalls: { method: string; admitted: boolean; expectedConfigVersion?: number }[] = []
  const savedAgent = async () => (await store.load<import('../../../packages/shared/src/domain').DigitalAgent>('agents')).find(value => value.id === employee.id)!
  try {
    await chat()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(`现在只是普通聊天，不执行任何工具，不保存长期记忆。暗号为 ${code}，请只回复这个暗号。${!real && kind === 'claude-local' ? ' empty-memory' : ''}`)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.messages.some(message => message.senderType === 'agent') && detail.turns!.every(turn => turn.status === 'completed') && detail.runs.every(run => run.status === 'completed')
    }, { timeout: 300000 }).toBe(true)
    const original = await read()
    expect(original.runs.every(run => run.status === 'completed')).toBe(true)
    if (real) expect(original.messages.find(message => message.senderType === 'agent')!.content).toContain(code)
    expect(original.workItems).toEqual([]); expect(original.workBudgets).toEqual([])
    const originalFacts = await facts(), originalSessions = await store.load(sessionCollection)
    for (const mode of ['before', 'after'] as const) {
      await chat(); await open()
      const before = await agent(), role = `原生关闭-${mode}-${randomUUID().slice(0, 8)}`
      await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
      await installSaveProbe(runtime); saveInstalled = true
      await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
      await editor().getByRole('button', { name: '保存修改', exact: true }).click()
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
      const committed = await agent()
      expect(committed.configVersion).toBe(before.configVersion + (mode === 'after' ? 1 : 0))
      expect(committed.role).toBe(mode === 'after' ? role : before.role)
      await runtime.app.evaluate(({ dialog }) => {
        const original = dialog.showMessageBox.bind(dialog)
        const state = { calls: [] as { title: string; message: string; buttons: string[]; response?: number }[], dispose: () => { dialog.showMessageBox = original } }
        Object.assign(globalThis, { __nativeClose: state })
        dialog.showMessageBox = (async (...args: any[]) => {
          const options = args.at(-1), call = { title: options.title, message: options.message, buttons: options.buttons } as typeof state.calls[number]
          state.calls.push(call)
          const result = await (original as (...args: any[]) => Promise<import('electron').MessageBoxReturnValue>)(...args)
          call.response = result.response
          return result
        }) as typeof dialog.showMessageBox
      }); dialogInstalled = true
      for (const action of ['continue', 'discard'] as const) {
        const stage = `${kind}-${mode}-${action}-${randomUUID().slice(0, 8)}`
        const screenshotPath = join(runtime.root, `${stage}.png`), receiptPath = join(runtime.root, `${stage}.capture.json`)
        await writeFile(join(coordinator, 'ready.json'), JSON.stringify({ stage, kind, mode, action, employeeName: employee.name, role, screenshotPath, receiptPath, testId: test.info().testId, root: runtime.root, closeMethod: 'CUA native window close' }))
        await runtime.reviewData(`真实原生关闭${mode}-${action}等待实际操作前`, { stage, kind, mode, action, draftRole: role, committed, saveCalls: await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls), nativeDialogCalls: await runtime.app.evaluate(() => (globalThis as NativeCloseProbe).__nativeClose.calls), facts: await facts() })
        const expectedResponses = action === 'continue' ? [0] : [0, 1]
        await expect.poll(() => runtime.app.evaluate(() => (globalThis as NativeCloseProbe).__nativeClose.calls.map(call => call.response)), { timeout: 180000 }).toEqual(expectedResponses)
        await expect.poll(async () => { try { return JSON.parse(await readFile(receiptPath, 'utf8')).stage === stage } catch { return false } }, { timeout: 30000 }).toBe(true)
        const capture = JSON.parse(await readFile(receiptPath, 'utf8')), png = await readFile(screenshotPath)
        expect(capture.source).toBe('cua.App.getScreenshot()')
        expect(capture.pixelTransform).toBe('none')
        expect(capture.sha256).toBe(createHash('sha256').update(png).digest('hex'))
        expect(capture.pngDimensions).toEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) })
        await runtime.reviewFile(`真实原生关闭${mode}-${action}弹窗原图`, screenshotPath, { required: true, expectedSha256: capture.sha256 })
        await runtime.reviewData(`真实原生关闭${mode}-${action}截图来源与实际按钮结果`, { capture, nativeCalls: await runtime.app.evaluate(() => (globalThis as NativeCloseProbe).__nativeClose.calls) })
        expect(await savedAgent()).toEqual(committed)
        expect(await facts()).toEqual(originalFacts)
        expect(await store.load(sessionCollection)).toEqual(originalSessions)
        if (action === 'continue') {
          expect(runtime.page.isClosed()).toBe(false)
          await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
          await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
          await runtime.reviewNativeCheckpoint(`真实原生关闭${mode}继续编辑后保留未知草稿`)
        } else {
          await expect.poll(() => runtime.page.isClosed()).toBe(true)
          expect(await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
        }
      }
      allCalls.push(...await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls))
      await runtime.reviewData(`真实原生关闭${mode}后的原提交事实`, { before, committed: await savedAgent(), originalFacts, facts: await facts(), originalSessions, sessions: await store.load(sessionCollection), allCalls, windowClosed: runtime.page.isClosed() })
      await runtime.app.evaluate(() => { (globalThis as SaveProbe).__bottomSave.dispose(); (globalThis as NativeCloseProbe).__nativeClose.dispose() })
      saveInstalled = dialogInstalled = false
      await runtime.restart({ expectedWindowClosed: true })
      expect(await agent()).toEqual(committed)
      expect(await facts()).toEqual(originalFacts); expect(await store.load(sessionCollection)).toEqual(originalSessions)
      await chat(); await open()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(committed.role)
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
      await runtime.reviewNativeCheckpoint(`真实原生关闭${mode}重启后只显示已提交配置`)
      await editor().getByRole('button', { name: '取消', exact: true }).click()
    }
    expect(allCalls.map(call => call.method)).toEqual(['saveAgent', 'saveAgent'])
    expect(allCalls.map(call => call.admitted)).toEqual([false, true])
    await runtime.reviewData('真实原生关闭最终配置及零重放', { agent: await agent(), originalFacts, facts: await facts(), originalSessions, sessions: await store.load(sessionCollection), allCalls })
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('真实原生关闭最终原状态', { agent: await savedAgent(), facts: await facts(), sessions: await store.load(sessionCollection), allCalls, currentSaveCalls: saveInstalled ? await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls) : null, nativeDialogCalls: dialogInstalled ? await runtime.app.evaluate(() => (globalThis as NativeCloseProbe).__nativeClose.calls) : null })
    if (saveInstalled || dialogInstalled) await runtime.app.evaluate((_electron, input) => { if (input.saveInstalled) (globalThis as SaveProbe).__bottomSave.dispose(); if (input.dialogInstalled) (globalThis as NativeCloseProbe).__nativeClose.dispose() }, { saveInstalled, dialogInstalled })
    await store.close()
  }
})

Then('员工配置答复丢失后离开或重启不重放且并发编辑不覆盖新版本', async ({ runtime }) => {
  test.setTimeout(600000)
  const { initial, agent, read, chat, editor, open, store, facts, sessionCollection } = await configurationContext(runtime)
  const originalFacts = await facts(), originalSessions = await store.load(sessionCollection)
  const allCalls: { method: string; admitted: boolean; expectedConfigVersion?: number }[] = []
  let installed = false
  const inspect = () => runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
  const dispose = async () => {
    allCalls.push(...await inspect())
    await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
  }
  const unchanged = async () => {
    expect(await facts()).toEqual(originalFacts)
    expect(await store.load(sessionCollection)).toEqual(originalSessions)
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual(initial.connections)
  }
  try {
    await chat()
    for (const mode of ['before', 'after'] as const) {
      for (const leave of ['放弃编辑', '受控关闭重启'] as const) {
        await installSaveProbe(runtime); installed = true
        const before = await agent(), role = `${mode}-${leave}-${randomUUID()}`
        await open()
        await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
        await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
        await editor().getByRole('button', { name: '保存修改', exact: true }).click()
        await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
        await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
        const committed = await agent(), attempts = await inspect()
        expect(attempts).toEqual([{ method: 'saveAgent', admitted: mode !== 'before', expectedConfigVersion: before.configVersion }])
        expect(committed.configVersion).toBe(before.configVersion + (mode === 'after' ? 1 : 0))
        expect(committed.role).toBe(mode === 'after' ? role : before.role)
        await unchanged()
        await runtime.reviewData(`未知保存${mode}${leave}前`, { before, committed, draftRole: role, attempts, facts: await facts(), sessions: await store.load(sessionCollection), closeMode: leave })
        await runtime.reviewNativeCheckpoint(`未知保存${mode}${leave}前草稿与核对入口`)
        if (leave === '放弃编辑') {
          await editor().getByRole('button', { name: '取消', exact: true }).click()
          const confirmation = runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true })
          await confirmation.getByRole('button', { name: '取消', exact: true }).click()
          await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
          await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
          expect(await inspect()).toEqual(attempts)
          await editor().getByRole('button', { name: '取消', exact: true }).click()
          await confirmation.getByRole('button', { name: '退出', exact: true }).click()
          expect(await inspect()).toEqual(attempts)
          await dispose()
        } else {
          // The shared lifecycle closes the actual isolated application while
          // bypassing the native unsaved dialog. This is not that dialog's test.
          await dispose()
          await runtime.restart()
        }
        expect(await agent()).toEqual(committed)
        await unchanged()
        await chat()
        await open()
        await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(committed.role)
        await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
        await runtime.reviewData(`未知保存${mode}${leave}后只读取已提交配置`, { committed: await agent(), facts: await facts(), sessions: await store.load(sessionCollection), allCalls })
        await runtime.reviewNativeCheckpoint(`未知保存${mode}${leave}后原配置与聊天保持`)
        await editor().getByRole('button', { name: '取消', exact: true }).click()
      }
    }
    await installSaveProbe(runtime); installed = true
    const before = await agent(), draftRole = '原编辑版本未提交的职责', newerRole = '另一编辑处已提交的新职责'
    await open()
    await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(draftRole)
    // A second writer really uses the product API; no direct SQLite mutation.
    const newer = await runtime.page.evaluate(async ({ employee, role }) => {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, creationSource, systemRole, ...definition } = employee
      return window.boai.request('saveAgent', { ...definition, role, expectedConfigVersion: configVersion })
    }, { employee: before, role: newerRole })
    expect(newer.configVersion).toBe(before.configVersion + 1)
    await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(draftRole)
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(editor().getByText(/员工配置已变更，请刷新后保存/)).toBeVisible()
    await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
    expect(await agent()).toEqual(newer)
    await unchanged()
    const attempts = await inspect()
    expect(attempts).toHaveLength(2)
    expect(attempts.map(call => call.expectedConfigVersion)).toEqual([before.configVersion, before.configVersion])
    await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
    expect(await inspect()).toEqual(attempts)
    await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(draftRole)
    await runtime.reviewData('并发编辑原版本拒绝且草稿保留', { before, newer, draftRole, attempts, facts: await facts(), sessions: await store.load(sessionCollection) })
    await runtime.reviewNativeCheckpoint('并发编辑拒绝覆盖已提交新版本')
    await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
    await runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(newerRole)
    await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
    await editor().getByRole('button', { name: '取消', exact: true }).click()
    await dispose()
    expect(allCalls).toHaveLength(6)
    expect(allCalls.every(call => call.method === 'saveAgent')).toBe(true)
    expect(allCalls.filter(call => !call.admitted)).toHaveLength(2)
    await runtime.restart()
    expect(await agent()).toEqual(newer)
    await unchanged()
    await chat()
    await runtime.reviewData('未知保存与并发配置最终重启零重放', { agent: await agent(), originalFacts, facts: await facts(), originalSessions, sessions: await store.load(sessionCollection), allCalls })
    await runtime.reviewNativeCheckpoint('未知保存与并发配置后最终原聊天')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('未知保存与并发配置最终原状态', { agent: await agent(), detail: await read(), facts: await facts(), sessions: await store.load(sessionCollection), allCalls })
    if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose())
    await store.close()
  }
})

Then('额外窗口的业务请求被拒绝且主窗口保存后只响应明确Codex新消息', async ({ runtime }) => {
  test.setTimeout(600000)
  const { initial, employee, kind, id, agent, read, chat, editor, open, store, facts } = await configurationContext(runtime)
  const records = async () => ({ ...await facts(), artifacts: await store.load<ArtifactVersion>('artifacts'), profileCalls: await store.load<ProfileModelCall>('profileModelCalls'), codexSessions: await store.load('codexSessions'), traces: await store.load('traceSpans') })
  let extra: Page | undefined, extraId: number | undefined
  let failed = false, failure: unknown
  try {
    expect(kind).toBe('codex-local')
    const before = await records(), original = await agent(), draft = '唯一主窗口员工设置期间的未发送聊天草稿', role = '唯一主窗口明确保存的Codex聊天职责'
    await chat(); await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
    await open(); await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
    const bridgePath = join(runtime.root, 'untrusted-renderer-preload.cjs'), bridgeId = randomUUID()
    await writeFile(bridgePath, "const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('boai', { testBridgeId: " + JSON.stringify(bridgeId) + ", request: (method, input) => ipcRenderer.invoke('boai:request', { method, input }) });\n")
    await runtime.reviewFile('本场额外窗口实际IPC测试桥原件', bridgePath)
    const main = await runtime.app.browserWindow(runtime.page), nextWindow = runtime.app.waitForEvent('window')
    let identity
    try {
      identity = await runtime.app.evaluate(async ({ BrowserWindow }, { main, bridgePath }) => {
        const prefs = main.webContents.getLastWebPreferences(), bounds = main.getBounds()
        const extra = new BrowserWindow({ width: bounds.width, height: bounds.height, show: true, webPreferences: { preload: bridgePath, contextIsolation: true, nodeIntegration: false, sandbox: true, zoomFactor: main.webContents.getZoomFactor() } })
        await extra.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh"><body><h1>测试宿主创建的额外窗口</h1><p>此页面是IPC来源验证夹具，不是第二个产品工作台。</p><pre id="results">等待实际接口答复</pre></body></html>'))
        return { mainWindowId: main.id, mainRendererId: main.webContents.id, extraWindowId: extra.id, extraRendererId: extra.webContents.id, productPreloadUsed: false, requestedTestBridgePath: bridgePath, preloadPreferenceObserved: (extra.webContents as typeof extra.webContents & { getLastWebPreferences(): { preload?: string } }).getLastWebPreferences().preload ?? null, contextIsolation: true, nodeIntegration: false, sandbox: true, createdByTestHost: true, originalIPCHandlerUnchanged: true }
      }, { main, bridgePath })
    } finally { await main.dispose() }
    extra = await nextWindow; extraId = identity.extraWindowId
    expect(identity.extraRendererId).not.toBe(identity.mainRendererId); expect(identity.productPreloadUsed).toBe(false); expect(identity.requestedTestBridgePath).toBe(bridgePath)
    await extra.waitForFunction(() => Boolean(window.boai))
    expect(await extra.evaluate(() => (window.boai as typeof window.boai & { testBridgeId: string }).testBridgeId)).toBe(bridgeId)
    const denials = await extra.evaluate(async ({ employee, id, requestId }) => {
      const attempt = async (run: () => Promise<unknown>) => { try { await run(); return { accepted: true, error: '' } } catch (error) { return { accepted: false, error: String(error) } } }
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, creationSource, systemRole, ...definition } = employee
      return [
        { method: 'snapshot', ...await attempt(() => window.boai.request('snapshot', undefined)) },
        { method: 'saveAgent', ...await attempt(() => window.boai.request('saveAgent', { ...definition, role: '额外窗口不得覆盖的职责', expectedConfigVersion: configVersion })) },
        { method: 'sendMessage', ...await attempt(() => window.boai.request('sendMessage', { conversationId: id, content: '额外窗口不得受理的消息', mentionIds: [], requestId })) },
        { method: 'setUnsavedChanges', ...await attempt(() => window.boai.request('setUnsavedChanges', { dirty: false })) },
      ]
    }, { employee: original, id, requestId: randomUUID() })
    expect(denials).toHaveLength(4); expect(denials.every(d => !d.accepted && d.error.includes('不允许的请求来源'))).toBe(true)
    await extra.evaluate(denials => { document.getElementById('results')!.textContent = denials.map(d => `${d.method}: ${d.accepted ? '受理' : d.error}`).join('\n') }, denials)
    expect(await agent()).toEqual(original); expect(await records()).toEqual(before)
    await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    await runtime.reviewData('真实额外窗口身份与原IPC拒绝', { identity, bridgeId, denials, original, before, after: await records(), secondEditableProductWindowSupported: false, testFixtureNotProductRenderer: true })
    await runtime.reviewNativeCheckpoint('额外窗口被拒绝后主窗口编辑与聊天草稿保持')
    await runtime.reviewNativeCheckpoint('实际额外测试窗口显示原IPC拒绝结果', extra)
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await agent()).configVersion).toBe(original.configVersion + 1)
    const saved = await agent(); expect(saved.role).toBe(role)
    expect({ ...saved, role: original.role, configVersion: original.configVersion }).toEqual(original)
    expect(await records()).toEqual(before)
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    await runtime.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), extraId)
    await expect.poll(() => extra!.isClosed()).toBe(true)
    expect(await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    const code = `CHAT_CODE_${randomUUID()}`, request = `现在只是普通聊天，不执行工具，不创建工作，不保存长期记忆。临时暗号是 ${code}，只回复这个暗号。`
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(r => ['failed', 'cancelled', 'interrupted'].includes(r.status)) || detail.runs.length === 3 && detail.runs.every(r => r.status === 'completed') && detail.turns!.every(t => t.status === 'completed')
    }, { timeout: 300000 }).toBe(true)
    const final = await records(); expect(final.runs).toHaveLength(3); expect(final.profileCalls).toHaveLength(3)
    const messages = (await read()).messages, chatCall = final.profileCalls.find(call => call.phase === 'chat')!
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ senderType: 'user', senderId: 'user', status: 'completed', content: request })
    expect(messages[1]).toMatchObject({ senderType: 'agent', senderId: saved.id, status: 'completed', runId: chatCall.runId })
    expect(messages[1].content).toContain(code)
    expect(final.profileCalls.every(c => final.runs.some(r => (r as AgentRun).id === c.runId && (r as AgentRun).agentId === saved.id))).toBe(true)
    expect(final.runs.every(r => (r as AgentRun).status === 'completed' && (r as AgentRun).backend?.kind === 'codex-local')).toBe(true)
    expect(final.works).toEqual([]); expect(final.budgets).toEqual([]); expect(final.calls).toEqual([]); expect(final.artifacts).toEqual([])
    expect(final.codexSessions).toHaveLength(1)
    await runtime.reviewNativeCheckpoint('原主窗口明确新消息使用本机Codex回复')
    await runtime.restart(); expect(await agent()).toEqual(saved); expect(await records()).toEqual(final)
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual(initial.connections)
    expect(await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    expect(runtime.errors).toEqual([])
    await runtime.reviewData('额外窗口拒绝后主窗口配置与明确Codex新消息最终核对', { identity, bridgeId, denials, original, saved, before, final, afterRestart: await records(), controlledRestarts: 1, secondEditableProductWindowSupported: false, nativeUnsavedCloseTested: false })
  } catch (error) {
    failed = true; failure = error; throw error
  } finally {
    const cleanupErrors: unknown[] = []
    try { if (extra && !extra.isClosed() && extraId !== undefined) await runtime.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), extraId) } catch (error) { cleanupErrors.push(error) }
    try { await runtime.reviewData('额外窗口拒绝与原主窗口最终状态', { agent: await agent(), records: await records(), extraWindowClosed: extra?.isClosed() ?? false }) } catch (error) { cleanupErrors.push(error) }
    try { await archiveNativeFinalReview(runtime, { label: '额外窗口拒绝与原主窗口', records }) } catch (error) { cleanupErrors.push(error) }
    try { await store.close() } catch (error) { cleanupErrors.push(error) }
    if (cleanupErrors.length) throw new AggregateError(failed ? [failure, ...cleanupErrors] : cleanupErrors, '额外窗口场景清理未全部完成，原失败与清理错误保持')
  }
})
