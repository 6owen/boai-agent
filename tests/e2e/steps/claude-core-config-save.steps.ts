/*
 * [INPUT]: 原Claude创建、核心组织工具、48共享预算、实际子文件与明确离线负责人屏障。
 * [OUTPUT]: 活动核心从原底部正常/受理前后未知职责保存，未受理不取消，受理后按原服务取消实际执行；子成果/组织身份/原期限保持，两次重启零重放，仅明确新消息执行。
 * [POS]: Claude活动核心配置保存的离线BDD，不代替真实模型、组织树故障或原生关闭验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { AgentRun, ArtifactVersion, BudgetModelCall, DigitalAgent, DiscussionTurn, Message, WorkBudget, WorkItem } from '../../../src/shared/domain'
import type { BoboCollaborationOperation } from '../../../src/shared/domain/bobo-collaboration'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'
import { installSaveProbe, type SaveProbe } from '../support/agent-config-save'
import { runtimeChildProcessIds } from '../support/automation-recovery'
import { archiveNativeFinalReview } from '../support/native-final-review'

const { Then } = createBdd(test)
type ProcessIdentity = { pid: number; group: number; started: string }
async function processes(): Promise<ProcessIdentity[]> {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,pgid=,lstart='])
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) throw new Error('本场活动核心进程身份无法核对')
    return { pid: Number(match[1]), group: Number(match[2]), started: match[3] }
  })
}

Then('活动Claude核心组织从底部{string}后保留子成果且两次重启不重放', async ({ runtime, claudeEmployee: state }, saveCase: string) => {
  test.setTimeout(720000)
  expect(state.real).toBe(false)
  test.skip(process.platform === 'win32', '本场核对POSIX进程组，Windows另行验收')
  expect(['正常保存', '受理前答复丢失', '受理后答复丢失']).toContain(saveCase)
  const mode: SaveProbe['__bottomSave']['mode'] = saveCase === '受理前答复丢失' ? 'before' : saveCase === '受理后答复丢失' ? 'after' : 'normal'
  const markers = ['core-config-save-hold', 'core-config-save-ready', 'core-config-save-release'].map(name => join(runtime.root, name))
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const core = async () => (await snapshot()).agents.find(a => a.id === 'bobo')!
  const records = async () => ({ agents: await store.load<DigitalAgent>('agents'), conversations: await store.load('conversations'), messages: await store.load<Message>('messages'), turns: await store.load<DiscussionTurn>('turns'), runs: await store.load<AgentRun>('runs'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load<ProfileModelCall>('profileModelCalls'), organizations: await store.load<BoboCollaborationOperation>('boboCollaborations'), events: await store.load('events'), deliveries: await store.load('deliveries'), sessions: await store.load('claudeSessions'), traces: await store.load('traceSpans'), artifacts: await store.load<ArtifactVersion>('artifacts') })
  const editor = () => runtime.page.locator('.detail-content:visible')
  let installed = false, scenarioFailure: unknown, preparedFile: string | undefined
  try {
    const initial = await snapshot(), employee = initial.agents.find(a => a.id === state.employeeId)!
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await runtime.page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
    await editor().getByRole('combobox', { name: '执行后端', exact: true }).click()
    await runtime.page.getByRole('option', { name: '本机 Claude · 聊天与协作', exact: true }).click()
    await editor().getByRole('combobox', { name: '模型连接', exact: true }).click()
    await runtime.page.getByRole('option', { name: state.connectionName!, exact: true }).click()
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    await expect.poll(async () => (await core()).executionBackend).toEqual(employee.executionBackend)
    const configured = await core()
    expect(configured).toMatchObject({ systemRole: 'core', active: true, allowCommands: false, connectionId: state.connectionId })
    // Only this explicit offline scenario enables the original protocol's hold after real child delivery.
    await writeFile(markers[0], 'offline-active-core-config-save')
    await runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await runtime.page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    const request = 'CLAUDE_BOBO_EXECUTE empty-memory 创建一名同事，组织群并实际分工交付。'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(() => readFile(markers[1], 'utf8').catch(() => ''), { timeout: 420000, intervals: [50, 100, 250] }).not.toBe('')
    const gate = JSON.parse(await readFile(markers[1], 'utf8')) as { workId: string; runId: string; ownerAgentId: string }
    const before = await records(), operation = before.organizations[0], active = before.works.find(w => w.id === gate.workId)!, run = before.runs.find(r => r.id === gate.runId)!
    const child = before.works.find(w => w.parentWorkId === active.id)!, organization = before.works.find(w => w.id === operation.organizationWorkId)!, budget = before.budgets[0]
    expect(before.organizations).toHaveLength(1); expect(before.works).toHaveLength(3); expect(before.budgets).toHaveLength(1)
    expect(operation).toMatchObject({ status: 'committed', mode: 'organize_and_execute', budgetId: budget.id, groupRootWorkId: active.id, sourceConversationId: organization.conversationId, sourceMessageId: organization.sourceMessageId, executionBackend: configured.executionBackend })
    expect(organization).toMatchObject({ ownerAgentId: configured.id, status: 'delivered', budgetId: budget.id })
    expect(active).toMatchObject({ ownerAgentId: configured.id, status: 'running', activeRunId: run.id, requiresReview: true, budgetId: budget.id })
    expect(run).toMatchObject({ agentId: configured.id, workId: active.id, status: 'running', backend: { kind: 'claude-local' } })
    expect(run.toolEvents.filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(1)
    expect(child).toMatchObject({ status: 'delivered', budgetId: budget.id }); expect(child.ownerAgentId).not.toBe(configured.id)
    expect(active.requiredResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
    expect(active.observedResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
    expect(active.resultMessageIds).toHaveLength(1)
    expect(before.messages.find(message => message.id === active.resultMessageIds[0])).toMatchObject({ senderType: 'agent', senderId: configured.id, status: 'completed', content: '等待同事实际交付。' })
    expect(budget).toMatchObject({ maxModelCalls: 48, maxOutputTokens: 16000, callUnit: 'mixed', accounting: 'model-calls-v1' })
    expect(before.works.every(w => w.budgetId === budget.id)).toBe(true)
    expect(before.artifacts).toHaveLength(1)
    const childFile = before.artifacts[0], childBytes = await readFile(childFile.path), childModified = (await stat(childFile.path)).mtimeMs
    expect(child.artifactIds).toContain(childFile.id)
    expect(createHash('sha256').update(childBytes).digest('hex')).toBe(childFile.contentHash)
    const home = await runtime.page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: configured.id, conversationId: active.conversationId })
    preparedFile = join(home.sessionPath!, 'runs', run.id, 'proof.txt')
    const preparedBytes = await readFile(preparedFile), preparedModified = (await stat(preparedFile)).mtimeMs
    const pids = await runtimeChildProcessIds(runtime), identities = (await processes()).filter(p => pids.includes(p.pid)), groups = [...new Set(identities.filter(p => pids.includes(p.group)).map(p => p.group))]
    expect(pids.length).toBeGreaterThan(0); expect(identities).toHaveLength(pids.length); expect(groups.length).toBeGreaterThan(0)
    const live = async () => (await processes()).filter(p => identities.some(old => old.pid === p.pid && old.started === p.started) || groups.includes(p.group))
    await runtime.reviewFile('活动核心保存前已发布子原件', childFile.path, { required: true, expectedSha256: childFile.contentHash })
    await runtime.reviewFile('活动核心保存前未发布实际原件', preparedFile, { required: true })
    await runtime.reviewData('活动核心保存前原组织工作与共享预算', { saveCase, gate, records: before, identities, groups, preparedFile, childFile })
    const sourceChat = (await snapshot()).conversations.find(c => c.id === operation.sourceConversationId)!
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: sourceChat.title, exact: true }).click()
    const draft = '活动核心配置期间尚未发送的新消息'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
    await expect(editor().getByRole('textbox', { name: '助手名称', exact: true })).toHaveValue(configured.name)
    const role = `活动核心${saveCase}的明确职责`
    await editor().getByRole('textbox', { name: '职责简介', exact: true }).fill(role)
    await installSaveProbe(runtime); installed = true
    await runtime.app.evaluate((_electron, mode) => { (globalThis as SaveProbe).__bottomSave.mode = mode }, mode)
    await editor().getByRole('button', { name: '保存修改', exact: true }).click()
    if (mode !== 'normal') {
      await expect(editor().getByText(/员工保存答复未返回/)).toBeVisible()
      await expect(editor().getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
    }
    const saved = await core(), saveCalls = await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)
    expect(saveCalls).toEqual([{ method: 'saveAgent', admitted: mode !== 'before', expectedConfigVersion: configured.configVersion }])
    expect(saved.configVersion).toBe(configured.configVersion + (mode === 'before' ? 0 : 1))
    expect(saved.role).toBe(mode === 'before' ? configured.role : role)
    expect({ ...saved, role: configured.role, configVersion: configured.configVersion }).toEqual(configured)
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(draft)
    if (mode === 'before') {
      expect(await records()).toEqual(before); expect(await live()).toEqual(identities)
      await runtime.reviewData('核心保存未受理保持实际活动与进程', { saved, saveCalls, records: await records(), live: await live() })
    } else {
      await expect.poll(live, { timeout: 30000 }).toEqual([])
      await expect.poll(async () => (await records()).runs.find(r => r.id === run.id)?.status, { timeout: 30000 }).toBe('cancelled')
      const cancelled = await records()
      expect(cancelled.runs.find(r => r.id === run.id)?.error).toBe('员工配置已变更，请重新执行')
      expect(cancelled.works.find(w => w.id === active.id)).toMatchObject({ status: 'cancelled', requiresReview: true, ownerAgentId: active.ownerAgentId, sourceMessageId: active.sourceMessageId, rootWorkId: active.rootWorkId, budgetId: budget.id, artifactIds: [], resultMessageIds: active.resultMessageIds })
      expect(cancelled.messages.find(message => message.id === active.resultMessageIds[0])).toEqual(before.messages.find(message => message.id === active.resultMessageIds[0]))
      expect(cancelled.artifacts).toEqual(before.artifacts)
      expect(cancelled.budgets[0]).toMatchObject({ id: budget.id, maxModelCalls: 48, maxOutputTokens: 16000, deadlineAt: budget.deadlineAt, unknownCalls: 1, usageIncomplete: true })
      expect(cancelled.calls.find(c => c.runId === run.id)?.usageComplete).toBe(false)
      await runtime.reviewData('核心已受理保存取消后的原工作与实际退出', { saved, saveCalls, records: cancelled, identities, groups, actualExited: true })
    }
    if (mode !== 'normal') {
      await editor().getByRole('button', { name: '重新核对配置', exact: true }).click()
      await expect(editor().getByText(mode === 'before' ? /版本未变也不作为本次保存的请求回执/ : /配置版本已经变化/)).toBeVisible()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(role)
      expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(saveCalls)
      await runtime.reviewNativeCheckpoint('活动核心未知保存的冻结草稿与核读入口')
      await editor().getByRole('button', { name: '载入已提交配置', exact: true }).click()
      await runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '放弃并退出', exact: true }).click()
      await expect(editor().getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue(saved.role)
      await editor().getByRole('button', { name: '取消', exact: true }).click()
    }
    expect(await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.calls)).toEqual(saveCalls)
    await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()); installed = false
    if (mode === 'before') await writeFile(markers[2], 'explicit-offline-release-after-unadmitted-save')
    await expect.poll(async () => (await records()).runs.every(r => ['completed', 'cancelled'].includes(r.status)), { timeout: 420000 }).toBe(true)
    await expect.poll(live, { timeout: 30000 }).toEqual([])
    const settled = await records()
    expect(settled.works.find(w => w.id === child.id)).toEqual(child)
    expect(settled.works.find(w => w.id === organization.id)).toEqual(organization)
    expect(settled.organizations).toEqual(before.organizations)
    expect(settled.agents.find(a => a.id === employee.id)).toEqual(employee)
    expect(settled.agents.filter(a => a.id !== 'bobo')).toEqual(before.agents.filter(a => a.id !== 'bobo'))
    expect(settled.works).toHaveLength(3); expect(settled.budgets).toHaveLength(1)
    expect(settled.budgets[0]).toMatchObject({ id: budget.id, maxModelCalls: 48, maxOutputTokens: 16000, deadlineAt: budget.deadlineAt })
    expect(settled.calls).toHaveLength(settled.budgets[0].modelCalls)
    expect(new Set(settled.calls.map(c => c.id)).size).toBe(settled.calls.length)
    expect(settled.runs.find(r => r.id === run.id)).toMatchObject({ status: mode === 'before' ? 'completed' : 'cancelled' })
    expect(settled.artifacts).toHaveLength(mode === 'before' ? 2 : 1)
    if (mode === 'before') { expect(settled.works.every(w => w.status === 'delivered')).toBe(true); expect(settled.runs.every(r => r.status === 'completed')).toBe(true) }
    const filesUnchanged = async () => {
      expect(await readFile(childFile.path)).toEqual(childBytes); expect((await stat(childFile.path)).mtimeMs).toBe(childModified)
      expect(await readFile(preparedFile!)).toEqual(preparedBytes); expect((await stat(preparedFile!)).mtimeMs).toBe(preparedModified)
    }
    await filesUnchanged()
    await runtime.reviewData('活动核心保存稳定事实与原子成果保持', { saveCase, saveCalls, before, settled, actualExited: true })
    for (let restart = 1; restart <= 2; restart++) {
      await runtime.restart(); expect(await records()).toEqual(settled); await filesUnchanged()
      expect(await core()).toEqual(saved)
      await runtime.reviewData(`活动核心保存第${restart}次受控重启零重放`, { restart, records: await records() })
    }
    await runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await runtime.page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    const explicit = 'empty-memory 这是两次重启后明确发送的新普通交流，不执行工具，不继续之前的组织工作。'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(explicit)
    expect(await records()).toEqual(settled)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await records()).profileCalls.length, { timeout: 300000 }).toBe(settled.profileCalls.length + 3)
    await expect.poll(async () => (await records()).runs.filter(r => !settled.runs.some(old => old.id === r.id)).every(r => r.status === 'completed'), { timeout: 300000 }).toBe(true)
    const final = await records(), newRuns = final.runs.filter(r => !settled.runs.some(old => old.id === r.id))
    expect(newRuns).toHaveLength(3)
    for (const next of newRuns) expect(next).toMatchObject({ agentId: saved.id, status: 'completed', backend: saved.executionBackend })
    expect(newRuns.every(r => r.bootstrap?.configVersion === saved.configVersion && r.bootstrap.instructions.includes(saved.role))).toBe(true)
    expect(final.works).toEqual(settled.works); expect(final.budgets).toEqual(settled.budgets); expect(final.calls).toEqual(settled.calls); expect(final.artifacts).toEqual(settled.artifacts)
    const chat = newRuns.find(r => r.phase === 'execution')!, detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.conversationId)
    expect(detail.messages).toHaveLength(2)
    expect(detail.messages[0]).toMatchObject({ senderType: 'user', content: explicit, status: 'completed' })
    expect(detail.messages[1]).toMatchObject({ senderType: 'agent', senderId: saved.id, runId: chat.id, status: 'completed', content: '首次公开回复' })
    await filesUnchanged(); expect(runtime.errors).toEqual([])
    await runtime.reviewData('活动核心保存两重启与明确新交流最终核对', { saveCase, saved, settled, final, controlledRestarts: 2, launchCount: 3, nativeUnsavedCloseTested: false, realModelTested: false })
    await runtime.reviewNativeCheckpoint('活动核心保存两次重启后明确新交流')
  } catch (error) { scenarioFailure = error; throw error }
  finally {
    const failures: unknown[] = []
    try { if (installed) await runtime.app.evaluate(() => (globalThis as SaveProbe).__bottomSave.dispose()) } catch (error) { failures.push(error) }
    try { if (preparedFile) await runtime.reviewFile('活动核心保存最终未发布或已交付原件', preparedFile, { required: true }) } catch (error) { failures.push(error) }
    try { await archiveNativeFinalReview(runtime, { label: 'Claude活动核心保存', records }) } catch (error) { failures.push(error) }
    for (const marker of markers) try { await rm(marker, { force: true }) } catch (error) { failures.push(error) }
    try { await store.close() } catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(scenarioFailure ? [scenarioFailure, ...failures] : failures, '活动核心保存原场景或独立清理留证失败')
  }
})
