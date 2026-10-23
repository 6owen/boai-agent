/*
 * [INPUT]: 原界面创建的本机员工、已发送附件和真实待批准命令。
 * [OUTPUT]: 审批等待期间原件外改/丢失，批准后宿主重新核对来源并在副作用前失败；实际进程退出、原Work/未知用量、恢复及重启零重放分别留证。
 * [OUTPUT]: 失效消息沿原核对材料入口恢复预览；不查找已经退场的正常预览按钮。
 * [OUTPUT]: 恢复留证等待主聊天重新核验原消息并显示正常材料入口，避免右侧已恢复而主区仍在刷新。
 * [POS]: LR2/3活动任务来源门禁 BDD；故障仅作用本场材料原件，不替换运行时、审批或业务事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../src/shared/domain'
import { openBindingEmployee } from '../support/skill-binding'
import { nextMaterialDialog } from '../support/materials'
import { faultCodexMaterialSource, prepareCodexMaterialSource } from '../support/codex-resources'
import { processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'

const { Then } = createBdd(test)
Then('本机任务待批准时材料出现{string}仍拒绝副作用且恢复不重放', async ({ runtime, codexEmployee }, fault: string) => {
  test.setTimeout(540000)
  const page = runtime.page, id = codexEmployee.conversationId!, source = await prepareCodexMaterialSource(runtime.root)
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const command = "printf 'command-proof\\n' >> command-proof.txt"
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await page.getByRole('checkbox', { name: /允许申请运行命令/ }).check()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await snapshot()).agents.find(agent => agent.id === codexEmployee.employeeId)?.allowCommands).toBe(true)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  await runtime.reviewFile('任务原始材料', source.path)
  await nextMaterialDialog(runtime, { path: source.path })
  await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(page.locator('[data-material-status="ready"]')).toHaveCount(1)
  const request = `NATIVE_FILE_TASK NATIVE_COMMAND NATIVE_APPROVAL_PROBE：这是明确工作。读取本条附件，先通过 execute_command 请求原聊天批准并原样执行以下命令一次：\n${command}\n批准且成功后，在本次获准 runs 目录创建并正式发布 codex-proof.md，正文写附件中的完整暗号，以真实文件证据报告 delivered。如果工具失败或用户拒绝，立即停止，不再请求或改用文件工具绕过，不执行其他命令。`
  await runtime.reviewData('活动材料任务原始输入', { request, fault, realSupplier: !!codexEmployee.real })
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const detail = await read()
      return (await snapshot()).approvals.some(approval => approval.conversationId === id) || detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')
    }, { timeout: 260000 }).toBe(true)
    const approval = (await snapshot()).approvals.find(value => value.conversationId === id)!
    expect(approval).toBeDefined(); expect(approval.command.trim()).toBe(command)
    const before = await read(), material = before.materials![0]
    const work = before.workItems!.find(value => value.activeRunId === approval.runId)!
    expect(work).toBeDefined()
    expect(work.ownerAgentId).toBe(codexEmployee.employeeId)
    expect(work.materialSources?.map(value => value.id)).toContain(material.id)
    expect(material).toMatchObject({ status: 'ready', deliveryScope: 'conversation' })
    const proof = join(approval.cwd, 'command-proof.txt'), pids = await runtimeChildProcessIds(runtime)
    expect(pids.length).toBeGreaterThan(0)
    await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const card = page.locator(`[data-approval-id="${approval.id}"]`)
    await expect(card).toBeVisible()
    await runtime.reviewData('来源变更前的原审批和工作', { approval, before, pids, sessions: await store.load('codexSessions') })
    await runtime.reviewCheckpoint('本机任务读取附件后等待原聊天命令批准')

    const changed = await faultCodexMaterialSource((await snapshot()).dataPath, material, fault)
    expect(createHash('sha256').update(changed.original).digest('hex')).toBe(material.contentHash)
    if (fault === '原件外改') await runtime.reviewFile('待批准时被外改的本场材料原件', changed.path)
    await runtime.reviewData('批准前的原件故障', { fault, materialId: material.id, originalHash: material.contentHash })
    // Do not preview the file first: the actual command effect gate must discover
    // this fault itself, after approval and before the command starts.
    await card.getByRole('button', { name: '允许这次执行', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
    }, { timeout: 260000 }).toBe(true)
    await expect.poll(() => pids.some(processIsRunning), { timeout: 10000 }).toBe(false)
    const failed = await read(), execution = failed.runs.find(run => run.id === approval.runId)!
    expect(execution.status).toBe('failed')
    expect(execution.error).toMatch(/材料|原件/)
    expect(execution.toolEvents.filter(event => event.name === 'execute_command')).toHaveLength(1)
    expect(execution.toolEvents.find(event => event.name === 'execute_command')!.status).toBe('failed')
    expect(execution.toolEvents.some(event => ['write_file', 'publish_artifact'].includes(event.name))).toBe(false)
    expect(failed.workItems).toHaveLength(1)
    expect(failed.workItems![0]).toMatchObject({ id: work.id, status: 'failed', budgetId: work.budgetId, artifactIds: [], resultMessageIds: [] })
    expect(failed.materials![0]).toMatchObject({ id: material.id, status: 'unavailable', contentHash: material.contentHash })
    expect(failed.materials![0].revision).toBeGreaterThan(material.revision)
    expect(failed.artifacts).toEqual([])
    expect(failed.runs.some(run => run.phase === 'memory')).toBe(false)
    expect((await snapshot()).approvals).toEqual([])
    await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls'), sessions = await store.load('codexSessions')
    expect(calls.some(call => call.phase === 'execution' && !call.usageComplete)).toBe(true)
    await runtime.reviewData('批准后原件门禁阻止副作用且实际退出', { failed, calls, sessions, pids, allExited: true, commandFileExists: false })
    await runtime.reviewCheckpoint('原审批已结束但材料门禁阻止命令与交付')

    await changed.restore()
    expect(await readFile(changed.path)).toEqual(changed.original)
    expect((await read()).materials![0].status).toBe('unavailable')
    await page.getByRole('button', { name: '核对材料 来源核对.md', exact: true }).click()
    const preview = page.locator('.detail-content:visible')
    await expect(preview.getByRole('button', { name: '重新核对材料', exact: true })).toBeVisible()
    await preview.getByRole('button', { name: '重新核对材料', exact: true }).click()
    await expect(preview).toContainText(source.code)
    await expect(page.getByRole('button', { name: '预览材料 来源核对.md', exact: true })).toBeVisible()
    await expect(page.getByText('消息原材料身份或关联已失效', { exact: true })).toBeHidden()
    const restored = await read()
    expect(restored.materials![0]).toMatchObject({ status: 'ready', contentHash: material.contentHash })
    expect(restored.runs).toEqual(failed.runs); expect(restored.workItems).toEqual(failed.workItems)
    expect(await store.load('budgetModelCalls')).toEqual(calls); expect(await store.load('codexSessions')).toEqual(sessions)
    await runtime.reviewFile('明确恢复并核对的原字节材料', changed.path)
    await runtime.reviewData('原件恢复不恢复旧工作或审批', { restored, calls, sessions })
    await runtime.reviewCheckpoint('明确核对材料恢复后旧工作保持失败')
    await runtime.restart()
    const reopened = await read()
    expect(reopened.runs).toEqual(restored.runs); expect(reopened.workItems).toEqual(restored.workItems)
    expect(reopened.messages).toEqual(restored.messages); expect(reopened.materials).toEqual(restored.materials)
    expect(await store.load('budgetModelCalls')).toEqual(calls); expect(await store.load('codexSessions')).toEqual(sessions)
    await expect(runtime.page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(reopened.artifacts).toEqual([]); expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('活动材料任务最终原始状态', { detail: await read(), calls: await store.load('budgetModelCalls'), executions: await store.load('workExecutions'), sessions: await store.load('codexSessions'), snapshots: await store.load('snapshots') })
    await store.close()
  }
})
