/*
 * [INPUT]: 原Claude员工/明确API来源、原通讯录两员工普通群、实际文件工具和只读SQLite。
 * [OUTPUT]: 主任务区域按明确region核对原工作，右侧同一Work投影不制造重复匹配；独立同事先正式交付，Claude实际写入尚未发布时沿原工作停止/服务SIGKILL/移出成员；原工作与未知用量、真实进程退出、重新加入及两次重启零重放逐项核对。
 * [POS]: Claude普通群中断BDD；离线协议与真实供应商分场，不替代自动化或核心组织故障。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header，并上浮检查所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { crashAutomationRuntime, runtimeChildProcessIds } from '../support/automation-recovery'
import { systemKeychainLaunch } from '../support/saved-model'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { AgentRun, ArtifactVersion, BudgetModelCall, WorkBudget, WorkItem } from '../../../src/shared/domain'

const { Then } = createBdd(test)
async function processStarts(pids: number[]) {
  if (!pids.length) return new Map<number, string>()
  try {
    const { stdout } = await promisify(execFile)('ps', ['-p', pids.join(','), '-o', 'pid=,lstart='])
    return new Map(stdout.trim().split('\n').filter(Boolean).map(line => {
      const match = /^\s*(\d+)\s+(.+)$/.exec(line)
      if (!match) throw new Error('本场群工作进程身份无法核对')
      return [Number(match[1]), match[2]] as const
    }))
  } catch (error) { if ((error as { code?: number }).code === 1) return new Map<number, string>(); throw error }
}

Then('Claude普通群文件工作在{string}后保留同事交付并重启不续做', async ({ runtime, claudeEmployee: state }, ending: string) => {
  test.setTimeout(720000)
  expect(['停止原工作', '运行服务意外退出', '移出群成员']).toContain(ending)
  const crashed = ending === '运行服务意外退出', removed = ending === '移出群成员'
  const page = runtime.page, ownerName = '本机 Claude 同事', peerName = 'Claude独立同事'
  const contacts = async () => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  }
  await contacts(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const employeeEditor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await employeeEditor.getByRole('textbox', { name: '名称', exact: true }).fill(peerName)
  await employeeEditor.getByRole('textbox', { name: '角色', exact: true }).fill('独立文件交付')
  await employeeEditor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('用中文简短回复。只处理本人被点名的独立任务，不代替其他员工、不委派、不接手他人停止的工作。文件用宿主工具实际写入和发布；不联网、不运行命令，不把本场核对码保存为长期记忆。')
  await employeeEditor.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Claude', exact: true }).click()
  await employeeEditor.getByRole('combobox', { name: '模型来源', exact: true }).click()
  await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  await employeeEditor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(employeeEditor).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const owner = snapshot.agents.find(a => a.id === state.employeeId)!, peer = snapshot.agents.find(a => a.name === peerName)!
  for (const agent of [owner, peer]) expect(agent).toMatchObject({ executionBackend: { kind: 'claude-local' }, connectionId: state.connectionId, allowCommands: false })
  await contacts(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const groupEditor = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of [ownerName, peerName]) await groupEditor.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await groupEditor.getByRole('button', { name: '完成', exact: true }).click(); await expect(groupEditor).toBeHidden()
  const chat = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(c => c.kind === 'group' && c.agentIds.includes(owner.id) && c.agentIds.includes(peer.id))!
  expect(chat.agentIds.slice().sort()).toEqual([owner.id, peer.id].sort())
  expect(chat.creationSource).toBeUndefined()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  const records = async () => ({ agents: await store.load('agents'), messages: await store.load('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), deliveries: await store.load('deliveries'), events: await store.load('events'), decisions: await store.load('decisions'), contributions: await store.load('contributions'), memories: await store.load('memory'), wakes: await store.load('workWakes'), sessions: await store.load('claudeSessions'), artifacts: await store.load<ArtifactVersion>('artifacts') })
  const navigate = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).click()
  }
  const send = async (name: string, content: string) => {
    await runtime.page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
    await runtime.page.getByRole('option', { name: `@${name}`, exact: true }).click()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).pressSequentially(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  }
  const restart = async () => {
    await runtime.close(); await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
  }
  let identities = new Map<number, string>(), originalFile: string | undefined, scenarioFailure: unknown
  try {
    const peerRequest = state.real ? `这是已经具备开工条件的独立文件任务。仅被点名的${peerName}负责，用宿主工具创建并正式发布 completed-peer.md，正文包含“${state.token}”，报告本人工作已交付。另一位不执行或接手，不委派、不运行命令。` : 'CLAUDE_GROUP_FILES empty-memory 独立创建并正式发布本人的实际文件，不委派。'
    await send(peerName, peerRequest)
    await expect.poll(async () => {
      const d = await read()
      return d.runs.some(r => ['failed', 'cancelled', 'interrupted'].includes(r.status)) || (d.workItems?.length === 1 && d.workItems[0].status === 'delivered' && d.runs.every(r => r.status === 'completed') && d.turns!.every(t => t.status === 'completed'))
    }, { timeout: 240000, intervals: [250, 500] }).toBe(true)
    const deliveredPeer = await read(), peerWork = deliveredPeer.workItems![0], peerArtifact = deliveredPeer.artifacts[0]
    expect(peerWork).toMatchObject({ ownerAgentId: peer.id, status: 'delivered', requiresReview: false })
    expect(deliveredPeer.runs.every(r => r.status === 'completed')).toBe(true)
    expect(deliveredPeer.artifacts).toHaveLength(1)
    expect(peerArtifact.name).toBe(state.real ? 'completed-peer.md' : 'proof.txt')
    const peerBytes = await readFile(peerArtifact.path), peerStat = await stat(peerArtifact.path)
    expect(createHash('sha256').update(peerBytes).digest('hex')).toBe(peerArtifact.contentHash)
    if (state.real) expect(peerBytes.toString()).toContain(state.token)
    await runtime.reviewFile('Claude普通群停止前同事已交付原件', peerArtifact.path, { required: true, expectedSha256: peerArtifact.contentHash })
    await runtime.reviewData('Claude普通群停止前独立同事完整交付', { detail: deliveredPeer, records: await records(), owner, peer, peerWork, peerArtifact, peerFile: { bytes: peerBytes.length, sha256: peerArtifact.contentHash, mtimeNs: (await stat(peerArtifact.path, { bigint: true })).mtimeNs.toString() } })
    const ownerRequest = state.real ? `这是已经授权且具备开工条件的独立文件工作，仅被点名的${ownerName}负责。先用 write_file 在 self:/work/stop-proof.txt 写入“${state.token}”。然后依次用 write_file 创建 self:/work/check-01.txt 至 check-30.txt，每个写入编号和暗号“${state.token}”。每次只写一个文件，不用命令、脚本或委派。全部写完前不要发布任何文件；全部完成后只发布 stop-proof.txt 并报告交付。${peerName}的工作已交付，保持原件和原工作，不重复执行，不接手本人工作。` : '模块文件任务 empty-memory CLAUDE_AUTOMATION_HOLD 实际写入文件后保持运行，不发布；独立同事的原交付保持。'
    await send(ownerName, ownerRequest)
    await expect.poll(async () => {
      const d = await read()
      return d.runs.some(r => r.agentId === owner.id && r.phase === 'execution' && r.toolEvents.some(e => e.name === 'write_file' && e.status === 'completed')) || d.runs.some(r => ['failed', 'cancelled', 'interrupted'].includes(r.status))
    }, { timeout: 210000, intervals: [50, 100, 250] }).toBe(true)
    const before = await read(), work = before.workItems!.find(w => w.ownerAgentId === owner.id)!, run = before.runs.find(r => r.workId === work?.id && r.phase === 'execution')!
    expect(before.workItems).toHaveLength(2); expect(work).toMatchObject({ status: 'running', requiresReview: true }); expect(run).toMatchObject({ status: 'running', backend: { kind: 'claude-local' } })
    expect(work.budgetId).not.toBe(peerWork.budgetId)
    expect(before.workItems!.find(w => w.id === peerWork.id)).toEqual(peerWork)
    expect(before.runs.filter(r => r.agentId === peer.id).every(r => r.status === 'completed')).toBe(true)
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: owner.id, conversationId: chat.id })
    const file = state.real ? join(home.sessionPath!, 'work', 'stop-proof.txt') : join(home.sessionPath!, 'runs', run.id, 'proof.txt'); originalFile = file
    const content = await readFile(file), modified = (await stat(file)).mtimeMs, preparedHash = createHash('sha256').update(content).digest('hex')
    expect(content.toString()).toContain(state.real ? state.token! : '生产工具真实原件')
    await runtime.reviewFile('Claude普通群结束前实际未发布原件', file, { required: true, expectedSha256: preparedHash })
    const pids = await runtimeChildProcessIds(runtime); expect(pids.length).toBeGreaterThan(0); identities = await processStarts(pids); expect(identities.size).toBe(pids.length)
    await runtime.reviewData('Claude普通群结束前原工作和实际进程', { ending, ownerRequest, before, work, run, identities: [...identities], originalFile: { bytes: content.length, sha256: preparedHash, modified }, peerFile: { bytes: peerBytes.length, sha256: peerArtifact.contentHash, modified: peerStat.mtimeMs } })
    if (crashed) {
      await crashAutomationRuntime(runtime)
      await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
      await expect.poll(async () => [...await processStarts(pids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
      await runtime.reviewNativeCheckpoint('Claude普通群运行服务实际退出的原界面')
      await restart()
    } else if (removed) {
      await page.getByRole('button', { name: '会话操作', exact: true }).click(); await page.getByRole('menuitem', { name: '配置', exact: true }).click()
      const panel = page.locator('.detail-content:visible')
      await panel.getByRole('button', { name: `查看 ${ownerName}`, exact: true }).hover()
      await panel.getByRole('button', { name: `从群中移除 ${ownerName}`, exact: true }).click(); await page.getByRole('button', { name: '确认移除', exact: true }).click()
      expect((await read()).runs.find(r => r.id === run.id)?.status).toBe('running')
      await panel.getByRole('button', { name: '保存设置', exact: true }).click(); await expect(panel).toBeHidden()
      await expect.poll(async () => (await read()).conversation.agentIds).toEqual([peer.id])
    } else {
      await page.locator('.chat-header').getByRole('button', { name: '会话操作', exact: true }).click(); await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
      const card = page.locator(`.activity-detail [data-work-id="${work.id}"]`)
      expect((await read()).runs.find(r => r.id === run.id)?.status).toBe('running')
      await card.getByRole('button', { name: '停止此工作及子工作', exact: true }).click()
    }
    await expect.poll(async () => [...await processStarts(pids)].filter(([pid, started]) => identities.get(pid) === started), { timeout: 30000 }).toEqual([])
    const expectedStatus = crashed ? 'interrupted' : 'cancelled'
    await expect.poll(async () => (await read()).workItems!.find(w => w.id === work.id)?.status, { timeout: 30000 }).toBe(expectedStatus)
    await expect.poll(async () => (await read()).turns!.every(t => ['completed', 'cancelled', 'failed', 'interrupted', 'budget_exhausted'].includes(t.status)), { timeout: 30000 }).toBe(true)
    const stopped = await read(), stoppedRecords = await records(), originalBudget = stoppedRecords.budgets.find(b => b.id === work.budgetId)!
    expect(stopped.workItems!.find(w => w.id === work.id)).toMatchObject({ id: work.id, ownerAgentId: owner.id, sourceMessageId: work.sourceMessageId, budgetId: work.budgetId, status: expectedStatus, requiresReview: true, artifactIds: [], resultMessageIds: [] })
    expect(stopped.runs.find(r => r.id === run.id)).toMatchObject({ status: expectedStatus, backend: { kind: 'claude-local' } })
    if (removed) expect(stopped.runs.find(r => r.id === run.id)?.error).toBe('群成员或共享资料权限已变更')
    expect(stopped.workItems!.find(w => w.id === peerWork.id)).toEqual(peerWork)
    expect(stopped.runs.filter(r => r.agentId === peer.id && r.responseKind === 'task')).toEqual(deliveredPeer.runs.filter(r => r.agentId === peer.id && r.responseKind === 'task'))
    expect(stopped.artifacts).toEqual(deliveredPeer.artifacts)
    expect(stopped.runs.filter(r => r.agentId === owner.id && r.phase === 'memory')).toEqual([])
    expect(originalBudget).toMatchObject({ unknownCalls: 1, usageIncomplete: true })
    expect(stoppedRecords.calls.filter(c => c.runId === run.id)).toHaveLength(1); expect(stoppedRecords.calls.find(c => c.runId === run.id)?.usageComplete).toBe(false)
    const assertOriginalFiles = async () => {
      expect(await readFile(file)).toEqual(content); expect((await stat(file)).mtimeMs).toBe(modified)
      expect(await readFile(peerArtifact.path)).toEqual(peerBytes); expect((await stat(peerArtifact.path)).mtimeMs).toBe(peerStat.mtimeMs)
    }
    await assertOriginalFiles()
    await navigate()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    await expect(runtime.page.locator('.chat-panel:visible').getByRole('region', { name: '任务工作视图', exact: true }).locator(`[data-work-id="${work.id}"]`)).toContainText(crashed ? '已中断' : '已停止')
    await runtime.reviewNativeCheckpoint('Claude普通群原工作停止且另一独立工作已交付')
    await runtime.reviewData('Claude普通群结束后原账本与零交付', { ending, expectedStatus, stopped, records: stoppedRecords, originalBudget, observedProcessesExited: true })
    await restart()
    expect(await records()).toEqual(stoppedRecords); await assertOriginalFiles()
    await navigate()
    if (removed) {
      await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '配置', exact: true }).click()
      const panel = runtime.page.locator('.detail-content:visible')
      await panel.getByRole('button', { name: '添加群成员', exact: true }).click()
      const add = runtime.page.getByRole('dialog', { name: '添加群成员', exact: true }); await add.getByRole('checkbox', { name: new RegExp(ownerName) }).check(); await add.getByRole('button', { name: '添加', exact: true }).click()
      await panel.getByRole('button', { name: '保存设置', exact: true }).click(); await expect(panel).toBeHidden()
      expect((await read()).conversation.agentIds.slice().sort()).toEqual([owner.id, peer.id].sort())
      expect(await records()).toEqual(stoppedRecords); await assertOriginalFiles()
      await runtime.reviewData('Claude普通群重新加入不接续原停止工作', { records: await records(), conversation: (await read()).conversation })
    }
    await restart(); expect(await records()).toEqual(stoppedRecords); await assertOriginalFiles(); await navigate()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
    await expect(runtime.page.locator('.chat-panel:visible').getByRole('region', { name: '任务工作视图', exact: true }).locator(`[data-work-id="${work.id}"]`)).toContainText(crashed ? '已中断' : '已停止')
    await runtime.reviewNativeCheckpoint('Claude普通群两次重启后的原工作与同事交付')
    await runtime.reviewData('Claude普通群两次重启与未发布原件不重放', { ending, stopped: stoppedRecords, restored: await records(), prepared: { bytes: content.length, sha256: preparedHash, modified }, peerFile: { bytes: peerBytes.length, sha256: peerArtifact.contentHash, modified: peerStat.mtimeMs }, originalWork: work, originalPeerWork: peerWork, allObservedProcessesExited: true })
    expect(runtime.errors).toEqual([])
  } catch (error) {
    scenarioFailure = error; await runtime.reviewData('Claude普通群中断原场景失败', { failure: error instanceof Error ? error.message : '本场失败' }); throw error
  } finally {
    try {
      if (originalFile) await runtime.reviewFile('Claude普通群最终未发布原件', originalFile, { required: true })
      await archiveNativeFinalReview(runtime, { label: 'Claude普通群中断', records: async () => ({ ...await records(), traces: await store.load('traceSpans') }) })
    } catch (error) { throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], 'Claude普通群中断原场景或结束留证失败') }
    finally {
      const remaining = [...await processStarts([...identities.keys()])].filter(([pid, started]) => identities.get(pid) === started), cleanup: number[] = []
      for (const [pid] of remaining) { try { process.kill(pid, 'SIGKILL'); cleanup.push(pid) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
      await runtime.reviewData('Claude普通群中断测试清理不计产品通过', { cleanup }); await store.close()
    }
  }
})
