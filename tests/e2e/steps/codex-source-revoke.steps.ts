/*
 * [INPUT]: 原界面创建的本机员工、已读原件、停机准备的旧显式授权记录和真实命令。
 * [OUTPUT]: 待批准/命令执行中通过保留的旧授权IPC撤权，核对原Work停止、审批失效、真实进程退出、来源session失效及明确恢复/重启零重放。
 * [OUTPUT]: 审批等待只观察新任务的运行，原普通聊天的完成状态不能提前结束等待。
 * [OUTPUT]: 来源撤权后沿工作视图既有规则排除派生工作，原Work取消事实保持；旧入口拒绝，恢复新版本也不复活旧目标。
 * [OUTPUT]: 真实请求不含离线夹具标记，用户明确选用宿主为本次任务分配的默认运行目录；批准仍由原卡片提交。
 * [OUTPUT]: 新回复按明确消息身份滚入主聊天视口再截图，侧栏摘要不能代替原回复可见证据。
 * [POS]: LR2/3旧授权接口兼容BDD；当前UI不提供逐材料选人，不将测试调用描述成新增界面功能。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { cp, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../packages/shared/src/domain'
import { openBindingEmployee } from '../support/skill-binding'
import { legacyMaterialGrant, nextMaterialDialog } from '../support/materials'
import { prepareCodexMaterialSource } from '../support/codex-resources'
import { processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'

const { Then } = createBdd(test)
Then('本机任务在{string}撤回旧材料授权后实际退出且恢复不续做', async ({ runtime, codexEmployee }, stage: string) => {
  test.skip(process.platform === 'win32', '本场验证POSIX继承进程组，Windows另行验收')
  test.setTimeout(780000)
  expect(['等待批准', '命令执行中']).toContain(stage)
  const executing = stage === '命令执行中', id = codexEmployee.conversationId!, agentId = codexEmployee.employeeId!
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const navigate = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '聊天', exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
  }
  const waitIdle = async () => expect.poll(async () => {
    const detail = await read()
    return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
  }, { timeout: 360000 }).toBe(true)
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await runtime.page.getByRole('checkbox', { name: /允许申请运行命令/ }).check()
  await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await snapshot()).agents.find(agent => agent.id === agentId)?.allowCommands).toBe(true)
  await navigate()
  const source = await prepareCodexMaterialSource(runtime.root)
  await runtime.reviewFile('旧授权材料实际原件', source.path)
  await nextMaterialDialog(runtime, { path: source.path })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id][data-material-status="ready"]')).toHaveCount(1)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('这是普通聊天，不执行工具。请读取本条附件，只回复原文中的完整暗号。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await read()).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length, { timeout: 360000 }).toBe(1)
  await waitIdle()
  const original = await read(), material = original.materials![0]
  expect(original.messages.find(message => message.senderType === 'agent')!.content).toContain(source.code)
  expect(original.runs.every(run => run.status === 'completed')).toBe(true)
  expect(original.workItems).toEqual([])
  await runtime.reviewData('撤权场景原员工已读材料', { detail: original, stage })
  await legacyMaterialGrant(runtime, join(runtime.root, 'v2'), material.id, [agentId])
  const legacy = await read()
  expect(legacy.materials![0]).toMatchObject({ id: material.id, authorizedAgentIds: [agentId], revision: material.revision, contentHash: material.contentHash })
  expect(legacy.materials![0].deliveryScope).toBeUndefined()
  expect(legacy.messages).toEqual(original.messages); expect(legacy.runs).toEqual(original.runs)
  await navigate()
  const commandPath = resolve('tests/fixtures/native-command.sh'), command = await readFile(commandPath, 'utf8')
  const recorded = join(runtime.root, 'authorized-material-command.sh')
  await cp(commandPath, recorded); await runtime.reviewFile('本次明确批准的命令原件', recorded)
  const request = `${codexEmployee.real ? '' : 'NATIVE_FILE_TASK NATIVE_CANCEL_COMMAND：'}这是明确工作。请以本聊天之前提供的获准附件为本次工作来源，实际执行下面的长命令。我选择使用 BoAI 为本次任务分配的默认运行目录，即 execute_command 工具说明中的 cwd，不另选目录。请通过 execute_command 提交原聊天命令审批卡片，等我在卡片中批准后原样执行一次；不要提前结束，不运行其他工具或发布成果。稍后将通过撤回材料授权停止此工作，命令只在该目录保存PID和计数。\n\n${command}`
  await runtime.reviewData('旧授权任务明确输入和撤权边界', { stage, request, realSupplier: !!codexEmployee.real, authorizationInterface: 'retained setMaterialAuthorization IPC; no current per-material UI' })
  const composer = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
  for (const [index, line] of request.split('\n').entries()) {
    if (index) await composer.press('Shift+Enter')
    if (line) await composer.pressSequentially(line)
  }
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  type Session = { agentId: string; threadId: string; materials: { id: string }[]; sources: { id: string }[]; memories: { id: string }[] }
  const sessions = () => store.load<Session>('codexSessions')
  try {
    await expect.poll(async () => {
      const detail = await read(), current = detail.runs.filter(run => !original.runs.some(old => old.id === run.id))
      return (await snapshot()).approvals.some(approval => approval.conversationId === id) || current.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || current.some(run => run.phase === 'execution' && run.status === 'completed')
    }, { timeout: 260000 }).toBe(true)
    const approval = (await snapshot()).approvals.find(value => value.conversationId === id)!
    expect(approval).toBeDefined(); expect(approval.command.trim()).toBe(command.trim())
    const before = await read(), work = before.workItems!.find(value => value.activeRunId === approval.runId)!
    expect(before.workItems).toHaveLength(1)
    expect(work).toMatchObject({ ownerAgentId: agentId })
    expect(work.materialSources?.map(value => value.id)).toContain(material.id)
    expect(before.messages.find(message => message.id === work.sourceMessageId)?.content).toContain(command.trim())
    expect(before.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
    const card = runtime.page.locator(`[data-approval-id="${approval.id}"]`)
    await expect(card).toBeVisible()
    await expect(readFile(join(approval.cwd, 'command-parent.pid'))).rejects.toMatchObject({ code: 'ENOENT' })
    await runtime.reviewData('撤权前原材料工作及命令审批', { before, approval, sessions: await sessions() })
    await runtime.reviewCheckpoint('原材料工作等待真实命令审批')
    let parent: number | undefined, child: number | undefined
    if (executing) {
      await card.getByRole('button', { name: '允许这次执行', exact: true }).click()
      await expect.poll(() => readFile(join(approval.cwd, 'command-child.pid'), 'utf8').catch(() => ''), { timeout: 10000 }).toMatch(/^\d+$/)
      parent = Number(await readFile(join(approval.cwd, 'command-parent.pid'), 'utf8')); child = Number(await readFile(join(approval.cwd, 'command-child.pid'), 'utf8'))
      expect(processIsRunning(parent)).toBe(true); expect(processIsRunning(child)).toBe(true)
      await expect.poll(() => readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8').catch(() => ''), { timeout: 10000 }).toContain('tick\n')
    }
    const processes = await runtimeChildProcessIds(runtime), active = await read()
    expect(processes.length).toBeGreaterThan(0)
    if (executing) { expect(processes).toContain(parent); expect(processes).toContain(child) }
    expect(active.runs.find(run => run.id === approval.runId)?.status).toBe(executing ? 'running' : 'waiting_approval')
    await runtime.reviewData('明确撤权时的真实活动边界', { stage, active, processes, parent, child })
    // Retained legacy API: never mutate the running database or invent a retired UI control.
    const revoked = await runtime.page.evaluate(input => window.boai.request('setMaterialAuthorization', input), { id: material.id, expectedRevision: material.revision, authorizedAgentIds: [] })
    expect(revoked).toMatchObject({ id: material.id, authorizedAgentIds: [], revision: material.revision + 1, contentHash: material.contentHash, status: 'ready' })
    await expect.poll(() => processes.filter(processIsRunning), { timeout: 30000 }).toEqual([])
    if (executing) expect(processIsRunning(-parent!)).toBe(false)
    await waitIdle()
    const stopped = await read(), calls = await store.load<BudgetModelCall>('budgetModelCalls'), oldSessions = await sessions()
    expect(stopped.runs.find(run => run.id === approval.runId)).toMatchObject({ status: 'cancelled', error: '聊天材料授权或版本已更新，旧运行已停止' })
    expect(stopped.workItems).toHaveLength(1)
    expect(stopped.workItems![0]).toMatchObject({ id: work.id, status: 'cancelled', budgetId: work.budgetId, requiresReview: executing, resultMessageIds: [], artifactIds: [] })
    expect(stopped.runs.filter(run => !original.runs.some(old => old.id === run.id)).some(run => run.phase === 'memory')).toBe(false)
    expect(calls.some(call => call.runId === approval.runId && !call.usageComplete)).toBe(true)
    expect(stopped.artifacts).toEqual([]); expect((await snapshot()).approvals).toEqual([])
    const snapshots = await store.load<{ id: string; invalidated?: boolean; materialRefs?: { id: string }[] }>('snapshots')
    expect(snapshots.filter(value => value.materialRefs?.some(ref => ref.id === material.id)).every(value => value.invalidated)).toBe(true)
    const ticks = executing ? await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8') : undefined
    if (executing) for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt']) await runtime.reviewFile(`撤权后命令原件-${name}`, join(approval.cwd, name))
    const assertNoEffects = async () => {
      expect(processes.filter(processIsRunning)).toEqual([])
      if (executing) { expect(processIsRunning(-parent!)).toBe(false); expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks) }
      else for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt']) await expect(readFile(join(approval.cwd, name))).rejects.toMatchObject({ code: 'ENOENT' })
      expect((await read()).workItems).toEqual(stopped.workItems)
      expect(await store.load('budgetModelCalls')).toEqual(calls)
      expect((await snapshot()).approvals).toEqual([])
      await expect(runtime.page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    }
    await assertNoEffects()
    await expect(runtime.page.evaluate(input => window.boai.request('recheckMaterial', input), { id: material.id, expectedRevision: revoked.revision })).rejects.toThrow(/已撤权/)
    await runtime.reviewData('旧授权撤回后的原工作和实际退出', { stage, stopped, revoked, calls, oldSessions, snapshots, parent, child, processes, allExited: true, ticks })
    const assertClosedView = async () => {
      const view = await runtime.page.evaluate(conversationId => window.boai.request('queryWorkViews', { conversationId }), id)
      expect(view.total).toBe(0); expect(view.items).toEqual([])
      await expect(runtime.page.evaluate(workId => window.boai.request('resolveWorkViewTarget', { workId, kind: 'source' }), work.id)).rejects.toThrow('原工作或来源已失效')
      await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
      await expect(runtime.page.getByRole('region', { name: '任务工作视图', exact: true }).getByText('暂无符合条件的工作。', { exact: true })).toBeVisible()
      await expect(runtime.page.locator(`[data-work-id="${work.id}"]:visible`)).toHaveCount(0)
      return view
    }
    await runtime.reviewData('撤权后的派生工作查询与入口失效', await assertClosedView())
    await runtime.reviewCheckpoint('材料撤权后旧派生工作退出列表')
    await runtime.restart()
    expect((await read()).runs).toEqual(stopped.runs); expect((await read()).messages).toEqual(stopped.messages)
    expect((await read()).materials![0]).toEqual(revoked); expect(await sessions()).toEqual(oldSessions)
    await assertNoEffects(); await navigate()
    const question = (codexEmployee.real ? '' : 'NATIVE_CLEARED_CONTEXT ') + '这是新的普通聊天，不执行工具，也不继续之前的命令工作。只根据当前仍然获准的附件回答；没有可用的附件暗号时只回复“没有可用暗号”，不要猜测或沿用已撤回来源。'
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(question)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await read()).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length, { timeout: 360000 }).toBe(2)
    await waitIdle()
    const next = await read(), reply = next.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').at(-1)!, nextSessions = await sessions()
    expect(reply.content).toContain('没有可用暗号'); expect(reply.content).not.toContain(source.code)
    expect(next.runs.filter(run => !stopped.runs.some(old => old.id === run.id)).every(run => run.status === 'completed')).toBe(true)
    expect(nextSessions).toHaveLength(1)
    expect(nextSessions[0].threadId).not.toBe(oldSessions[0].threadId); expect(nextSessions[0].materials).toEqual([])
    expect(nextSessions[0].sources.map(value => value.id)).not.toContain(original.messages.find(message => message.senderType === 'agent')!.id)
    const sourceMemories = (await store.load<{ id: string; sourceMessageIds: string[] }>('memory')).filter(entry => entry.sourceMessageIds.includes(material.messageId!))
    for (const entry of sourceMemories) expect(nextSessions[0].memories.map(value => value.id)).not.toContain(entry.id)
    await assertNoEffects()
    const replyRow = runtime.page.locator(`[data-reading-message-id="${reply.id}"]`)
    await replyRow.scrollIntoViewIfNeeded()
    await expect(replyRow).toBeInViewport()
    await expect(replyRow).toContainText('没有可用暗号')
    await runtime.reviewData('撤权后的新交流重新建立无材料会话', { detail: next, oldSessions, nextSessions, excludedMemoryIds: sourceMemories.map(entry => entry.id) })
    await runtime.reviewCheckpoint('撤权后新聊天没有旧材料暗号')
    const restored = await runtime.page.evaluate(input => window.boai.request('setMaterialAuthorization', input), { id: material.id, expectedRevision: revoked.revision, authorizedAgentIds: [agentId] })
    expect(restored).toMatchObject({ authorizedAgentIds: [agentId], revision: revoked.revision + 1, contentHash: material.contentHash })
    expect((await read()).runs).toEqual(next.runs); expect(await sessions()).toEqual(nextSessions)
    await assertNoEffects()
    await runtime.restart()
    expect((await read()).materials![0]).toEqual(restored); expect((await read()).runs).toEqual(next.runs); expect((await read()).messages).toEqual(next.messages)
    expect(await sessions()).toEqual(nextSessions); await assertNoEffects()
    await navigate()
    const view = await assertClosedView()
    await runtime.reviewData('明确恢复授权和再次重启不重做旧工作', { restored, detail: await read(), calls: await store.load('budgetModelCalls'), sessions: await sessions(), view })
    await runtime.reviewCheckpoint('恢复材料授权后不重新开放旧工作入口')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('活动旧材料撤权最终原始状态', { stage, detail: await read(), calls: await store.load('budgetModelCalls'), executions: await store.load('workExecutions'), sessions: await sessions(), snapshots: await store.load('snapshots'), memory: await store.load('memory') })
    await store.close()
  }
})
