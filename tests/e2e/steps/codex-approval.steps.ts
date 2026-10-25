/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 真实审批请求不带夹具标记或工具名，按产品默认任务目录发起；观察覆盖原生任务期限，最终保留阶段Trace。
 * [OUTPUT]: 待批准执行及故障重启后的待核对工作从聊天底部打开原员工编辑器拒绝换绑；显式载入原配置，身份/版本/原工作保持。
 * [INPUT]: 隔离桌面、本机员工与原消息审批；离线协议或显式真实供应商。
 * [OUTPUT]: 拒绝、待批准服务退出、批准已提交但回复丢失分开验证；原命令至多一次、旧审批失效、重启零重放。
 * [POS]: 本机员工审批故障 BDD；故障只注入本场宿主回执传输，不替换工具或业务事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { openBindingEmployee } from '../support/skill-binding'
import { crashAutomationRuntime, processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
Then('原命令审批以{string}结束后旧批准不执行也不重放', async ({ runtime, codexEmployee }, mode: string) => {
  test.setTimeout(660000)
  const id = codexEmployee.conversationId!, page = runtime.page
  const crashed = mode === '待批准时服务退出', lost = mode === '批准回执丢失'
  const command = "printf 'command-proof\\n' >> command-proof.txt"
  await openBindingEmployee(runtime, '本机 Codex 同事')
  await page.getByRole('checkbox', { name: /允许申请运行命令/ }).check()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === codexEmployee.employeeId)?.allowCommands).toBe(true)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  const request = (codexEmployee.real ? '' : 'NATIVE_FILE_TASK NATIVE_COMMAND NATIVE_APPROVAL_PROBE：') + `这是明确工作。请在本次任务的默认工作目录原样执行以下命令一次，先把命令显示给我批准，批准前不能执行：\n${command}\n如果我拒绝，就停止并如实说明，不再申请或改用其他方式绕过。如果批准且成功，再创建并正式发布 codex-proof.md，正文为“本次命令已确认完成”。不要使用其他命令或重复执行。`
  await runtime.reviewData('本机审批原始请求与处理方式', { request, mode, realSupplier: !!codexEmployee.real })
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const rejectSwitch = async (reason: string, stage: string) => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    const snapshot = () => runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    const before = (await snapshot()).agents.find(agent => agent.id === codexEmployee.employeeId)!
    const detail = await read()
    await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '员工设置', exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue(before.name)
    await runtime.page.getByRole('combobox', { name: '执行后端', exact: true }).click()
    await runtime.page.getByRole('option', { name: '模型 API · 聊天与协作', exact: true }).click()
    await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(runtime.page.getByText(reason, { exact: true })).toBeVisible()
    await expect(runtime.page.getByRole('button', { name: '保存修改', exact: true })).toBeDisabled()
    expect((await snapshot()).agents.find(agent => agent.id === before.id)).toEqual(before)
    expect((await read()).workItems).toEqual(detail.workItems)
    expect((await read()).runs).toEqual(detail.runs)
    await runtime.reviewData(stage + '原配置及工作未变', { agent: before, detail: await read() })
    await runtime.page.getByText(reason, { exact: true }).scrollIntoViewIfNeeded()
    await runtime.reviewCheckpoint(stage + '拒绝切换运行方式')
    await runtime.page.getByRole('button', { name: '载入已提交配置', exact: true }).click()
    await runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true }).getByRole('button', { name: '退出', exact: true }).click()
    await expect(runtime.page.getByRole('combobox', { name: '执行后端', exact: true })).toContainText('本机 Codex')
    await runtime.page.getByRole('button', { name: '取消', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const detail = await read(), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
      return snapshot.approvals.some(approval => approval.conversationId === id) || detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')
    }, { timeout: 480000 }).toBe(true)
    const approval = (await page.evaluate(() => window.boai.request('snapshot', undefined))).approvals.find(value => value.conversationId === id)!
    expect(approval).toBeDefined(); expect(approval.command.trim()).toBe(command)
    const card = page.locator(`[data-approval-id="${approval.id}"]`)
    await expect(card).toBeVisible()
    const work = (await read()).workItems!.find(value => value.activeRunId === approval.runId)!
    expect(work.ownerAgentId).toBe(codexEmployee.employeeId)
    const proof = join(approval.cwd, 'command-proof.txt')
    await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await runtime.reviewData('原审批未执行状态', { approval, detail: await read() })
    await runtime.reviewCheckpoint('原员工消息中的待批准命令')
    if (crashed) {
      await rejectSwitch('员工仍在执行，请等实际执行退出后再切换运行方式', '原命令待批准时')
      expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).approvals.find(value => value.id === approval.id)).toEqual(approval)
      const children = await runtimeChildProcessIds(runtime)
      expect(children.length).toBeGreaterThan(0)
      await crashAutomationRuntime(runtime)
      await expect(page.getByText(/本地运行服务已退出/)).toBeVisible()
      await expect.poll(() => children.some(processIsRunning), { timeout: 10000 }).toBe(false)
      await runtime.reviewData('待批准时故障的实际子进程退出', { children, exited: true })
      await runtime.reviewCheckpoint('待批准期间运行服务退出')
      await runtime.restart()
      await rejectSwitch('员工仍有未结束或待核对工作，请先处理原工作再切换运行方式', '服务退出并重启后')
    } else {
      if (lost) await runtime.app.evaluate(({ ipcMain }, approvalId) => {
        const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
        const original = handlers.get('boai:request')!
        let lostOnce = false
        ipcMain.removeHandler('boai:request')
        ipcMain.handle('boai:request', async (event, payload) => {
          const result = await original(event, payload)
          if (!lostOnce && payload.method === 'approve' && payload.input.id === approvalId && payload.input.approved) {
            lostOnce = true
            throw new Error('验收：原审批已受理，但界面答复丢失')
          }
          return result
        })
      }, approval.id)
      await card.getByRole('button', { name: lost ? '允许这次执行' : '拒绝', exact: true }).click()
      if (lost) await expect(page.getByText(/原审批已受理，但界面答复丢失/)).toBeVisible()
      await expect.poll(async () => {
        const detail = await read()
        return detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
      }, { timeout: 260000 }).toBe(true)
    }
    const detail = await read(), calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(detail.workItems).toHaveLength(1)
    expect(detail.workItems![0]).toMatchObject({ id: work.id, status: crashed ? 'interrupted' : lost ? 'delivered' : 'blocked', budgetId: work.budgetId })
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals).toEqual([])
    await expect(runtime.page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    if (lost) {
      expect(await readFile(proof, 'utf8')).toBe('command-proof\n')
      expect(detail.artifacts).toHaveLength(1)
      await runtime.reviewFile('回执失联后只执行一次的命令原件', proof)
      await runtime.reviewFile('回执失联后实际交付原件', detail.artifacts[0].path)
      expect(calls.every(call => call.usageComplete)).toBe(true)
    } else {
      await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(detail.artifacts).toEqual([])
    }
    if (crashed) expect(calls.some(call => call.phase === 'execution' && !call.usageComplete)).toBe(true)
    else expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.reviewData('审批处理后原工作和调用', { mode, detail, calls })
    await runtime.reviewCheckpoint('审批结束后的原聊天与工作状态')
    await runtime.restart()
    const recovered = await read()
    expect(recovered.runs).toEqual(detail.runs); expect(recovered.workItems).toEqual(detail.workItems); expect(recovered.messages).toEqual(detail.messages)
    expect(await store.load('budgetModelCalls')).toEqual(calls)
    if (crashed) await rejectSwitch('员工仍有未结束或待核对工作，请先处理原工作再切换运行方式', '再次重启核对后')
    await expect(runtime.page.evaluate(id => window.boai.request('approve', { id, approved: true }), approval.id)).rejects.toThrow(/审批已失效|审批对应任务/)
    if (lost) expect(await readFile(proof, 'utf8')).toBe('command-proof\n')
    else await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.reviewCheckpoint('重启后旧审批不恢复且副作用不重放')
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('本机审批最终原始状态', { works: await store.load('workItems'), calls: await store.load('budgetModelCalls'), runs: await store.load('runs'), approvals: await store.load('approvals'), phaseTrace: await store.load('traceSpans') })
    await store.close()
  }
})
