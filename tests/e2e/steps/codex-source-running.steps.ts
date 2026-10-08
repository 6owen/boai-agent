/*
 * [OUTPUT]: 按消息区核对文案定位材料故障阅读提示，标题不被错误覆盖；原件恢复后可显式核对清除提示，原工作/预算不续行。
 * [INPUT]: 原界面创建的本机员工、真实附件和逐次批准的可结束命令。
 * [OUTPUT]: 父子进程实际运行期间外改/移走材料原件；放行命令自然结束后，来源门禁阻止后续成果，原效果、预算、恢复及重启不重放。
 * [OUTPUT]: 失败留证等待原会话侧栏同步失败和材料核对入口，原终态不能用尚在处理中的画面替代。
 * [OUTPUT]: 观察等待覆盖原生判断加五分钟任务期限，失败导出阶段Trace；观察超时不冒充模型已失败。
 * [POS]: LR2/3已开始效果与后续发布分离BDD；故障/结束标记仅写本场目录，不替换产品事务或真实模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../src/shared/domain'
import { openBindingEmployee } from '../support/skill-binding'
import { nextMaterialDialog } from '../support/materials'
import { faultCodexMaterialSource, prepareCodexMaterialSource } from '../support/codex-resources'
import { processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'

const { Then } = createBdd(test)
Then('本机命令实际开始后材料出现{string}阻止后续交付且恢复不重跑', async ({ runtime, codexEmployee }, fault: string) => {
  test.skip(process.platform === 'win32', '本场核对POSIX父子进程和进程组，Windows另行验收')
  test.setTimeout(660000)
  const page = runtime.page, id = codexEmployee.conversationId!, source = await prepareCodexMaterialSource(runtime.root)
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const commandPath = resolve('tests/fixtures/native-source-command.sh'), command = await readFile(commandPath, 'utf8')
  const recorded = join(runtime.root, 'authorized-source-command.sh')
  await cp(commandPath, recorded); await runtime.reviewFile('执行中来源故障的明确命令原件', recorded)
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
  const request = (codexEmployee.real ? '' : 'NATIVE_FILE_TASK NATIVE_SOURCE_COMMAND：') +
    '这是明确工作，请读取本条附件。我选择 BoAI 为本次任务分配的默认运行目录，即 execute_command 工具说明中的 cwd，不另选目录。先通过 execute_command 提交下面命令的原聊天审批卡片，等我在卡片中批准后原样执行一次。验收控制器稍后会在该目录创建 command-release 标记，使命令自然结束；不要自行创建该标记或改写命令。命令成功后，在本次获准 runs 目录创建并正式发布 codex-proof.md，正文写附件中的完整暗号，以真实文件证据报告交付。如果任一工具或来源核对失败，停止，不重跑命令、不更换工具绕过。不要执行其他命令。\n\n' + command
  await runtime.reviewData('活动材料任务原始输入', { request, fault, realSupplier: !!codexEmployee.real })
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true })
  for (const [index, line] of request.split('\n').entries()) {
    if (index) await composer.press('Shift+Enter')
    if (line) await composer.pressSequentially(line)
  }
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const detail = await read()
      return (await snapshot()).approvals.some(approval => approval.conversationId === id) || detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')
    }, { timeout: 480000 }).toBe(true)
    const approval = (await snapshot()).approvals.find(value => value.conversationId === id)!
    expect(approval).toBeDefined(); expect(approval.command.trim()).toBe(command.trim())
    const before = await read(), material = before.materials![0]
    const work = before.workItems!.find(value => value.activeRunId === approval.runId)!
    expect(work).toBeDefined()
    expect(work.ownerAgentId).toBe(codexEmployee.employeeId)
    expect(work.materialSources?.map(value => value.id)).toContain(material.id)
    expect(material).toMatchObject({ status: 'ready', deliveryScope: 'conversation' })
    const proof = join(approval.cwd, 'command-finished.txt')
    await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const card = page.locator(`[data-approval-id="${approval.id}"]`)
    await expect(card).toBeVisible()
    await runtime.reviewData('来源变更前的原审批和工作', { approval, before, sessions: await store.load('codexSessions') })
    await runtime.reviewCheckpoint('本机任务读取附件后等待原聊天命令批准')

    await card.getByRole('button', { name: '允许这次执行', exact: true }).click()
    await expect.poll(() => readFile(join(approval.cwd, 'command-child.pid'), 'utf8').catch(() => ''), { timeout: 10000 }).toMatch(/^\d+$/)
    const parent = Number(await readFile(join(approval.cwd, 'command-parent.pid'), 'utf8')), child = Number(await readFile(join(approval.cwd, 'command-child.pid'), 'utf8'))
    expect(processIsRunning(parent)).toBe(true); expect(processIsRunning(child)).toBe(true)
    await expect.poll(() => readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8').catch(() => ''), { timeout: 10000 }).toContain('tick\n')
    const pids = await runtimeChildProcessIds(runtime)
    expect(pids).toContain(parent); expect(pids).toContain(child)
    expect((await read()).runs.find(run => run.id === approval.runId)?.status).toBe('running')
    const changed = await faultCodexMaterialSource((await snapshot()).dataPath, material, fault)
    expect(createHash('sha256').update(changed.original).digest('hex')).toBe(material.contentHash)
    if (fault === '原件外改') await runtime.reviewFile('命令执行中被外改的本场材料原件', changed.path)
    await runtime.reviewData('命令执行中的原件故障', { fault, materialId: material.id, originalHash: material.contentHash })
    expect(processIsRunning(parent)).toBe(true); expect(processIsRunning(child)).toBe(true)
    await runtime.reviewData('已开始命令时注入原件故障', { fault, material, parent, child, pids, active: await read(), ticks: await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8') })
    // This effect remains approved. Let it finish naturally; the next host gate
    // must discover the source fault without a preview/recheck masking that boundary.
    await writeFile(join(approval.cwd, 'command-release'), 'release-after-source-fault\n')
    await expect.poll(() => readFile(proof, 'utf8').catch(() => ''), { timeout: 10000 }).toBe('finished-once\n')
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
    }, { timeout: 480000 }).toBe(true)
    await expect.poll(() => pids.some(processIsRunning), { timeout: 10000 }).toBe(false)
    expect(processIsRunning(-parent)).toBe(false)
    const failed = await read(), execution = failed.runs.find(run => run.id === approval.runId)!
    expect(execution.status).toBe('failed')
    expect(execution.error).toMatch(/材料|原件/)
    expect(execution.toolEvents.filter(event => event.name === 'execute_command')).toHaveLength(1)
    expect(execution.toolEvents.find(event => event.name === 'execute_command')!.status).toBe('completed')
    expect(execution.toolEvents.some(event => ['write_file', 'publish_artifact'].includes(event.name) && event.status === 'completed')).toBe(false)
    expect(failed.workItems).toHaveLength(1)
    expect(failed.workItems![0]).toMatchObject({ id: work.id, status: 'failed', budgetId: work.budgetId, artifactIds: [], resultMessageIds: [] })
    expect(failed.materials![0]).toMatchObject({ id: material.id, status: 'unavailable', contentHash: material.contentHash })
    expect(failed.materials![0].revision).toBeGreaterThan(material.revision)
    expect(failed.artifacts).toEqual([])
    expect(failed.runs.some(run => run.phase === 'memory')).toBe(false)
    expect((await snapshot()).approvals).toEqual([])
    expect(await readFile(proof, 'utf8')).toBe('finished-once\n')
    await expect(readFile(join(approval.cwd, 'codex-proof.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls'), sessions = await store.load('codexSessions')
    expect(calls.some(call => call.runId === approval.runId)).toBe(true)
    const ticks = await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')
    for (const name of ['command-parent.pid', 'command-child.pid', 'command-ticks.txt', 'command-release', 'command-finished.txt']) await runtime.reviewFile('来源失败后命令事实-' + name, join(approval.cwd, name))
    await runtime.reviewData('已完成命令不构成来源有效交付', { failed, calls, sessions, pids, parent, child, ticks, allExited: true, commandFileExists: true })
    await expect(page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true })).toContainText('失败')
    await expect(page.getByRole('button', { name: '核对材料 来源核对.md', exact: true })).toBeVisible()
    const panel = page.locator('.chat-panel:visible'), readingCheck = panel.getByRole('button', { name: '核对阅读状态', exact: true })
    await expect(panel.locator('.conversation-chat-body > .banner')).toHaveCount(0)
    await expect(panel.locator('.chat-header')).not.toContainText('阅读位置')
    await expect(panel).not.toContainText('ENOENT')
    if (await readingCheck.count()) {
      const banner = panel.locator('.messages').getByRole('alert').filter({ hasText: '核对阅读状态' })
      await expect(banner).toBeVisible()
      await panel.locator('.messages').evaluate(element => element.scrollTo({ top: 0 }))
      await expect.poll(async () => {
        const title = await panel.locator('.chat-header').boundingBox(), error = await banner.boundingBox()
        return Boolean(title && error && error.y >= title.y + title.height)
      }).toBe(true)
    }
    await runtime.reviewCheckpoint('命令已结束但来源门禁阻止后续交付')

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
    if (await readingCheck.count()) { await readingCheck.click(); await expect(readingCheck).toHaveCount(0) }
    expect(await readFile(proof, 'utf8')).toBe('finished-once\n')
    expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks)
    expect(pids.some(processIsRunning)).toBe(false)
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
    expect(await readFile(proof, 'utf8')).toBe('finished-once\n')
    await expect(readFile(join(approval.cwd, 'codex-proof.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(approval.cwd, 'command-ticks.txt'), 'utf8')).toBe(ticks)
    expect(pids.some(processIsRunning)).toBe(false); expect(processIsRunning(-parent)).toBe(false)
    await runtime.reviewData('重启只读取已完成命令和失败工作', { reopened, calls: await store.load('budgetModelCalls'), sessions: await store.load('codexSessions') })
    expect(reopened.artifacts).toEqual([]); expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('命令执行中来源故障最终原始状态', { detail: await read(), calls: await store.load('budgetModelCalls'), executions: await store.load('workExecutions'), sessions: await store.load('codexSessions'), snapshots: await store.load('snapshots'), phaseTrace: await store.load('traceSpans') })
    await store.close()
  }
})
