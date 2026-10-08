/*
 * [OUTPUT]: 原群分工增加Codex/Claude双向真实组合，共享原预算/来源记忆及重启；各员工绑定自身协议，Codex不绑定Claude的API连接。
 * [OUTPUT]: 原场景失败与退出清理分开；退出前画面和状态、实际进程退出及退出后SQLite/全部固定hash原件均保留，归档缺口失败终结。
 * [OUTPUT]: 成功/失败均在清理前按原hash导出已发布文件；逐项留证失败并失败终结，不用其他批次原件补齐。
 * [OUTPUT]: 真实群负责人委派后原composer更新核对off/原预算/源消息；普通更新误取定向工作只能保留无Work/无工具的原拒绝，实际工作仍须完整交付；publish/discard不强制。
 * [OUTPUT]: 原群新消息后离线私有discard保留原等待/预算，子工作及负责人继续文件交付、逐员工记忆和重启零重放。
 * [OUTPUT]: 真实重启区分源码系统钥匙串入口与应用包原入口，沿初次加密配置，不重读凭据或增加模型请求。
 * [INPUT]: 原Claude员工创建步骤、独立桌面、明确API来源与真实宿主工作账本。
 * [OUTPUT]: 真实公开回复不作无回执记忆保存/无能力声明；原界面创建Claude/Claude或Claude/API普通群，双向分工、原件/累计预算、逐员工有源非空记忆与重启零重放；窗口关闭后的诊断不覆盖原始失败。
 * [POS]: Claude普通群BDD；离线协议与真实供应商独立运行，不替代核心组织或自动化验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { addCodexConnection } from '../support/native-connection'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { BudgetModelCall, MemoryEntry, MemoryView } from '../../../src/shared/domain'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'

const { Then, When } = createBdd(test)
When('本场在原群消息更新后暂不公开旧等待汇报', async ({ claudeEmployee: state }) => {
  expect(state.real).toBe(false); state.withholdWait = true
})
When('本场在真实委派受理后通过原群发送信息更新', async ({ claudeEmployee: state }) => {
  expect(state.real).toBe(true); state.waitUpdate = true
})
Then('用户让Claude与{string}同事组成普通群并由{string}负责文件分工', async ({ runtime, claudeEmployee: state }, otherKind: string, ownerKind: string) => {
  test.setTimeout(720000)
  expect(['Claude', 'API', 'Codex']).toContain(otherKind)
  if (otherKind !== 'Claude') expect(state.real).toBe(true)
  test.skip(otherKind === 'Codex' && process.env.BOAI_TEST_REAL_CODEX !== '1', '真实本机Codex模型必须显式开启')
  const page = runtime.page, otherName = `${otherKind} 核查同事`
  const codexProfile = otherKind === 'Codex' ? await addCodexConnection(runtime, true) : undefined
  const newContact = async () => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  }
  await newContact(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill(otherName)
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('独立文件核查和正式分工')
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('用中文简短回复；只做明确请求或正式委派的工作。被指定负责人时使用宿主委派与依赖工具组织，未被点名时等待正式分工，不另建根工作。文件用宿主工具实际写入并发布；不联网、不执行命令，不把本场核对码保存为长期记忆。')
  if (otherKind === 'Claude') {
    await editor.getByRole('combobox', { name: '运行方式', exact: true }).click()
    await page.getByRole('option', { name: '本机 Claude', exact: true }).click()
    await editor.getByRole('combobox', { name: '模型来源', exact: true }).click()
    await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  } else if (otherKind === 'Codex') {
    await editor.getByRole('combobox', { name: '运行方式', exact: true }).click()
    await page.getByRole('option', { name: '本机 Codex', exact: true }).click()
    await expect(editor.getByRole('combobox', { name: '本机连接', exact: true })).toContainText(codexProfile!.name)
  }
  await expect(page.locator('[data-slot="select-content"]:visible')).toHaveCount(0)
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const native = snapshot.agents.find(a => a.id === state.employeeId)!, other = snapshot.agents.find(a => a.name === otherName)!
  expect(native.executionBackend?.kind).toBe('claude-local')
  expect(other.executionBackend?.kind).toBe(otherKind === 'Claude' ? 'claude-local' : otherKind === 'Codex' ? 'codex-local' : 'mastra-model')
  expect(other.connectionId).toBe(otherKind === 'Codex' ? '' : state.connectionId)
  if (codexProfile) {
    expect(other.executionBackend).toMatchObject({ kind: 'codex-local', profileId: codexProfile.id })
    await runtime.reviewData('异构本机群员工与独立运行绑定', { native, other, codexProfile })
  }
  await newContact(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of [native.name, other.name]) await dialog.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await runtime.reviewNativeCheckpoint('原群聊入口选择Claude与独立同事')
  await dialog.getByRole('button', { name: '完成', exact: true }).click(); await expect(dialog).toBeHidden()
  const chat = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(c => c.kind === 'group' && c.agentIds.includes(native.id) && c.agentIds.includes(other.id))!
  const owner = ownerKind === '首位Claude' ? native : other, childOwner = owner.id === native.id ? other : native
  const request = state.real
    ? `这是明确的文件协作任务。仅被点名的${owner.name}负责主工作；${childOwner.name}等待正式委派，不另建根工作。负责人用 delegate_work 委派${childOwner.name}创建并发布 group-child.md，正文包含“${state.token}”；随后调用 wait_for_work 等待该子工作结果，结束本次等待回合。接续后核对实际子成果，再创建并发布 group-summary.md，正文包含同一核对码和子成果文件名，再报告主工作已交付。只需要这两个短文件，不联网、不执行命令、不向用户提问、不重复已完成的委派和写入。`
    : `${state.withholdWait ? 'CLAUDE_WITHHOLD_WAIT ' : ''}CLAUDE_GROUP_TASK 负责人正式委派同事，然后等待并交付汇总文件。请两位记住，我的长期偏好是简短答复。`
  const preparation = state.waitUpdate ? ' 补充执行顺序：负责人在delegate_work成功返回后，先用write_file把“等待同事实际交付”写入自己的self:/work/coordination-note.txt，再用read_file核读同一文件，然后调用wait_for_work。以上工具按这个顺序逐个办理；这个私有备注不用发布，不代替子成果或正式汇总。' : ''
  const memoryRequest = state.real ? request + preparation + ' 另外，请两位记住本群今后的固定汇报偏好：先给结论，再列依据，使用简短中文。只保存这条偏好，不把文件核对码保存为长期记忆。' : request
  await page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
  await page.getByRole('option', { name: `@${owner.name}`, exact: true }).click()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).pressSequentially(memoryRequest)
  await runtime.reviewData('Claude普通群本次输入和运行来源', { request: memoryRequest, ownerId: owner.id, childOwnerId: childOwner.id, otherKind, modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  let preferenceSourceId: string | undefined, originalBudget: { id: string; deadlineAt: string } | undefined
  let updatedParentRunId: string | undefined, updateMessageId: string | undefined
  const refusedUnclaimedIntent = (run: Awaited<ReturnType<typeof read>>['runs'][number]) => state.waitUpdate
    && run.triggerMessageId === updateMessageId && run.phase === 'execution' && run.status === 'cancelled'
    && !run.workId && run.backend?.externalInvocations === 0 && !run.toolEvents.length && run.error === '该工作只能由定向接续认领'
  let scenarioFailure: unknown
  try {
    if (state.waitUpdate) {
      await expect.poll(async () => (await read()).runs.some(run => run.phase === 'execution' && run.toolEvents.some(tool => tool.name === 'delegate_work' && tool.status === 'completed')), { timeout: 150000, intervals: [50, 100, 250] }).toBe(true)
      const before = await read(), parent = before.workItems!.find(work => !work.parentWorkId)!
      const execution = before.runs.find(run => run.workId === parent.id && run.phase === 'execution')!
      expect(execution.status).toBe('running'); expect(parent.status).toBe('running')
      originalBudget = { id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt }; updatedParentRunId = execution.id
      await runtime.reviewData('真实委派后群更新前原运行及预算', before)
      const update = '本条仅补充进度信息，不是新任务，不用单独回复，不改变原分工、文件正文或核对码。继续原工作，完成后只公开已经实际交付的文件。'
      await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(update)
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
      await expect.poll(async () => (await read()).messages.some(message => message.senderType === 'user' && message.content === update), { timeout: 5000 }).toBe(true)
      const submitted = await read(); updateMessageId = submitted.messages.find(message => message.senderType === 'user' && message.content === update)!.id
      await runtime.reviewData('真实原群信息更新的消息身份', { updateMessageId, updatedParentRunId, originalBudget, update, submitted })
    }
    if (state.withholdWait) {
      await expect.poll(() => readFile(join(runtime.root, 'withhold-parent-ready'), 'utf8').catch(() => ''), { timeout: 30000 }).not.toBe('')
      const before = await read(), parent = before.workItems!.find(work => !work.parentWorkId)!, child = before.workItems!.find(work => !!work.parentWorkId)!
      originalBudget = { id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt }
      await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('CLAUDE_WITHHOLD_UPDATE 完成后只公开实际文件。请两位记住，我的长期偏好是简短答复。')
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
      await writeFile(join(runtime.root, 'withhold-parent-release'), 'release')
      await expect.poll(async () => (await read()).runs.some(run => run.workId === parent.id && run.draft?.status === 'withheld'), { timeout: 30000 }).toBe(true)
      const waiting = await read()
      preferenceSourceId = waiting.messages.find(message => message.senderType === 'user' && message.content.includes('CLAUDE_WITHHOLD_UPDATE'))!.id
      expect(waiting.workItems!.find(work => work.id === parent.id)).toMatchObject({ status: 'waiting', waitRevision: 1, requiredResults: [{ workId: child.id, resultVersion: 1 }], resultVersion: 0, resultMessageIds: [], requiresReview: false })
      expect(waiting.runs.find(run => run.workId === parent.id && run.phase === 'execution')).toMatchObject({ status: 'completed', disposition: 'waiting', draft: { status: 'withheld', revisions: 1 } })
      expect(waiting.messages.some(message => message.content === '等待同事实际交付。')).toBe(false)
      await runtime.reviewData('旧汇报暂不公开仍保留原等待和预算', waiting)
      await runtime.reviewNativeCheckpoint('原群等待未公开草稿且保留依赖')
      await writeFile(join(runtime.root, 'withhold-child-release'), 'release')
    }
    await expect.poll(async () => {
      const d = await read()
      if (state.waitUpdate && d.workItems!.length > 2) return true
      if (d.runs.some(r => ['failed', 'cancelled', 'interrupted'].includes(r.status) && !refusedUnclaimedIntent(r)) || d.workItems?.some(w => ['blocked', 'failed', 'cancelled', 'interrupted'].includes(w.status))) return true
      return d.workItems?.length === 2 && d.workItems.every(w => w.status === 'delivered') && d.runs.filter(r => r.phase === 'memory').length === 2 && d.runs.every(r => r.status === 'completed' || refusedUnclaimedIntent(r)) && d.turns!.every(t => t.status === 'completed')
    }, { timeout: 420000, intervals: [500, 1000, 2500] }).toBe(true)
    const detail = await read(), works = detail.workItems!, budgets = detail.workBudgets!
    expect(works).toHaveLength(2); expect(works.every(w => w.status === 'delivered' && !w.requiresReview)).toBe(true)
    expect(detail.runs.filter(r => r.status !== 'completed' && !refusedUnclaimedIntent(r))).toEqual([])
    expect(budgets).toHaveLength(1)
    const parent = works.find(w => !w.parentWorkId)!, child = works.find(w => !!w.parentWorkId)!, budget = budgets[0]
    expect(parent.ownerAgentId).toBe(owner.id)
    expect(child).toMatchObject({ parentWorkId: parent.id, rootWorkId: parent.id, ownerAgentId: childOwner.id, budgetId: parent.budgetId, sourceMessageId: parent.sourceMessageId })
    expect(parent.waitRevision).toBeGreaterThan(0)
    if (originalBudget) {
      expect(budget).toMatchObject(originalBudget)
    }
    if (state.withholdWait) {
      expect(parent).toMatchObject({ waitRevision: 1, resultVersion: 1 })
      const initial = detail.runs.find(run => run.workId === parent.id && run.draft?.status === 'withheld')!
      expect(initial.toolEvents.filter(tool => tool.name === 'delegate_work')).toHaveLength(1)
      expect(initial.toolEvents.filter(tool => tool.name === 'wait_for_work')).toHaveLength(1)
      expect(detail.runs.filter(run => run.workId === parent.id && run.phase === 'execution')).toHaveLength(2)
    }
    if (state.waitUpdate) {
      const denied = detail.runs.filter(refusedUnclaimedIntent)
      expect(denied.length).toBeLessThanOrEqual(chat.agentIds.length)
      const profilesAll = await store.load<ProfileModelCall>('profileModelCalls')
      for (const run of denied) {
        expect(profilesAll.filter(call => call.runId === run.id)).toEqual([])
        expect(detail.artifacts.filter(artifact => artifact.runId === run.id)).toEqual([])
        expect(detail.messages.find(message => message.id === run.messageId)).toBeUndefined()
      }
      const initial = detail.runs.find(run => run.id === updatedParentRunId)!
      const profiles = profilesAll.filter(call => call.runId === initial.id && call.phase === 'report')
      expect(profiles.length).toBeGreaterThan(0); expect(profiles.every(call => call.thinking === 'off')).toBe(true)
      expect(initial.disposition).toBe('waiting'); expect(['published', 'withheld']).toContain(initial.draft?.status)
      expect(initial.draft!.revisions).toBeGreaterThan(0)
      for (const name of ['delegate_work', 'wait_for_work']) expect(initial.toolEvents.filter(tool => tool.name === name && tool.status === 'completed')).toHaveLength(1)
      expect(detail.runs.filter(run => run.workId === parent.id && run.phase === 'execution')).toHaveLength(2)
      const snapshots = await store.load<{ id: string; memoryRecall?: MemoryView }>('snapshots')
      expect(snapshots.find(snapshot => snapshot.id === initial.id)?.memoryRecall?.recall?.inputMessageIds).toContain(updateMessageId)
      await runtime.reviewData('真实私有等待汇报配置与原来源结算', { initial, profiles, calls: (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.runId === initial.id), parent, child, budget, updateMessageId, refusedUnclaimedIntents: denied })
      await runtime.reviewNativeCheckpoint('真实群消息更新后原负责人完成文件交付')
    }
    expect(parent.requiredResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
    expect(parent.observedResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
    expect(detail.messages.find(m => m.id === parent.sourceMessageId)?.mentionIds).toEqual([owner.id])
    expect(budget).toMatchObject({ id: parent.budgetId, callUnit: otherKind === 'API' ? 'mixed' : 'external-turn', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
    const calls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(c => c.budgetId === budget.id)
    expect(calls).toHaveLength(budget.modelCalls)
    expect(new Set(calls.map(c => c.id)).size).toBe(calls.length)
    const memories = await store.load<MemoryEntry>('memory')
    await runtime.reviewData('Claude普通群实际记忆与原偏好来源', { memories, workSourceMessageId: parent.sourceMessageId, preferenceSourceMessageId: preferenceSourceId ?? parent.sourceMessageId })
    const publicReplies = detail.messages.filter(m => m.senderType === 'agent').map(m => ({ employeeId: m.senderId, content: m.content }))
    await runtime.reviewData('记忆请求的实际公开回复', publicReplies)
    // Public task replies precede private maintenance and have no persistence receipt.
    // Neither a future successful write nor an absent task tool proves a reply-time status.
    for (const reply of publicReplies) {
      expect(reply.content).not.toMatch(/(?:无法|不能|无权|未获准|未授权|无获准)[^。！？\n]{0,32}(?:记忆|保存偏好)|(?:记忆|偏好)[^。！？\n]{0,32}(?:无法|不能|未保存|已保存|已存储|已记下|已记住)|(?:未保存|已保存|已存储|已记下|已记住)[^。！？\n]{0,32}(?:记忆|偏好)/)
    }

    for (const member of [native, other]) {
      const own = calls.filter(c => detail.runs.find(r => r.id === c.runId)?.agentId === member.id)
      expect(own.length).toBeGreaterThan(0)
      expect(own.every(c => c.usageComplete && c.callUnit === (['claude-local', 'codex-local'].includes(member.executionBackend?.kind ?? '') ? 'external-turn' : undefined))).toBe(true)
      expect(detail.runs.filter(r => r.agentId === member.id).every(r => (r.backend?.kind ?? 'mastra-model') === member.executionBackend?.kind)).toBe(true)
      const work = works.find(w => w.ownerAgentId === member.id)!
      const maintenance = detail.runs.filter(r => r.agentId === member.id && r.phase === 'memory')
      expect(maintenance).toHaveLength(1)
      const published = detail.runs.find(r => r.workId === work.id && r.disposition === 'delivered')!
      expect(maintenance[0]).toMatchObject({ workId: work.id, turnId: published.turnId, status: 'completed' })
      expect(own.filter(c => c.phase === 'memory' && c.runId === maintenance[0].id)).toHaveLength(1)
      const saved = memories.filter(m => m.ownerAgentId === member.id && m.sourceMessageIds.includes(preferenceSourceId ?? parent.sourceMessageId) && !m.deletedAt)
      expect(saved.length).toBeGreaterThan(0)
      expect(saved.every(m => m.conversationId === chat.id && !m.content.includes(state.token!))).toBe(true)
      if (state.real) { expect(saved.map(m => m.content).join('\n')).toContain('结论'); expect(saved.map(m => m.content).join('\n')).toContain('依据') }
    }
    expect(detail.artifacts).toHaveLength(2)
    for (const work of works) {
      const files = detail.artifacts.filter(a => a.id && work.artifactIds.includes(a.id))
      expect(files).toHaveLength(1); expect(files[0].ownerAgentId).toBe(work.ownerAgentId)
      const bytes = await readFile(files[0].path)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(files[0].contentHash)
      if (state.real) expect(bytes.toString()).toContain(state.token)
      else expect(JSON.parse(bytes.toString())).toMatchObject({ work: work.id, owner: work.ownerAgentId })
      await runtime.reviewFile('Claude普通群实际原件-' + files[0].name, files[0].path)
    }
    await runtime.reviewData('Claude普通群工作与原账本', { detail, calls, memories })
    await runtime.reviewNativeCheckpoint('Claude普通群两位员工实际交付')
    await runtime.close(); await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
    const after = await read()
    expect(after.messages).toEqual(detail.messages); expect(after.runs).toEqual(detail.runs)
    expect(after.workItems).toEqual(works); expect(after.workBudgets).toEqual(budgets)
    expect((await store.load<BudgetModelCall>('budgetModelCalls')).filter(c => c.budgetId === budget.id)).toEqual(calls)
    expect(await store.load('memory')).toEqual(memories)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await expect(runtime.page.getByText(state.real ? 'group-summary.md' : 'proof.txt', { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude普通群重启保留原交付')
    expect(runtime.errors).toEqual([])
  } catch (error) {
    scenarioFailure = error
    await runtime.reviewData('Claude普通群原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' })
    throw error
  } finally {
    if (state.withholdWait) for (const name of ['withhold-parent-release', 'withhold-child-release']) await writeFile(join(runtime.root, name), 'release')
    try {
      let detail: unknown
      try { detail = await read() } catch (error) { detail = { unavailable: String(error) } }
      await runtime.reviewData('Claude普通群最终实际状态', { detail, calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), snapshots: await store.load('snapshots'), traces: await store.load('traceSpans') })
      await archiveNativeFinalReview(runtime, { label: 'Claude普通群', records: async () => ({ conversations: await store.load('conversations'), messages: await store.load('messages'), runs: await store.load('runs'), works: await store.load('workItems'), budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), snapshots: await store.load('snapshots'), traces: await store.load('traceSpans'), memories: await store.load('memory'), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') }) })
    } catch (error) {
      throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], 'Claude普通群原场景或结束留证失败')
    } finally { await store.close() }
  }
})
