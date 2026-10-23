/*
 * [OUTPUT]: 首次认领故障明确区分两次处理尝试和一次真实本机请求；等摘要展开容纳实际内容后截图，保留首批原画面。
 * [OUTPUT]: 重启原消息可见中断说明并打开固定轮次全部真实运行；本机不出现无效重试，读取前后业务记录完全一致。
 * [INPUT]: 原IM创建的本机员工、生产消息/Work事务和回环Inspector；离线协议与显式真实Codex分别运行。
 * [OUTPUT]: 提交前/后精确退出，原消息/请求/判断账本保持原子性；两次重启零重放，确无回执后仅用户显式重试原请求。
 * [POS]: 本机消息受理与工作认领的桌面故障验收；不替换事务、模型或存储内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { runtimeBreakpoint, type RuntimeBoundary } from '../support/runtime-breakpoint'
import { materialSendReplyFault } from '../support/materials'
import { processIsRunning, runtimeChildProcessIds } from '../support/automation-recovery'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { AgentRun, DiscussionTurn, Message, WorkItem, WorkBudget, WorkExecution, BudgetModelCall } from '../../../src/shared/domain'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'

const { Then } = createBdd(test)
Then('本机请求在{string}精确退出后两次重启不丢失已提交事实或重复执行', async ({ runtime, codexEmployee }, boundary: string) => {
  test.setTimeout(540000)
  expect(['消息提交前', '消息提交后未调度', '工作认领提交前', '工作认领提交后未绑定运行']).toContain(boundary)
  const absent = boundary === '消息提交前', claim = boundary.startsWith('工作认领'), claimed = boundary === '工作认领提交后未绑定运行'
  const id = codexEmployee.conversationId!, request = 'NATIVE_FILE_TASK：请实际创建并正式发布 codex-proof.md，正文精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行），再报告真实交付结果。只做这个文件，不执行命令或联网。'
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => ({
    messages: await store.load<Message>('messages'), turns: await store.load<DiscussionTurn>('turns'), runs: await store.load<AgentRun>('runs'),
    requests: await store.load<{ id: string; messageId: string }>('requests'), receipts: await store.load<{ id: string; messageId: string }>('messageReceipts'),
    works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), executions: await store.load<WorkExecution>('workExecutions'),
    calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load<ProfileModelCall>('profileModelCalls'),
    artifacts: await store.load('artifacts'), intents: await store.load('artifactPublicationIntents'), sessions: await store.load('codexSessions'),
  })
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const openChat = async () => {
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '聊天', exact: true }).click()
  }
  let breakpoint: Awaited<ReturnType<typeof runtimeBreakpoint>> | undefined
  try {
    expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toEqual([])
    expect((await raw()).runs).toEqual([])
    breakpoint = await runtimeBreakpoint(runtime, boundary as RuntimeBoundary)
    const observer = await materialSendReplyFault(runtime, 'observe')
    await runtime.reviewData('受理断点与原始请求', { request, ...breakpoint.evidence, modelMode: codexEmployee.real ? 'real-provider' : 'offline-protocol', scope: claim ? 'actual completed decision before task execution' : 'no model call before the message transaction commits' })
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => breakpoint!.hit() !== null || (await raw()).runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 260000, intervals: [50, 100, 200] }).toBe(true)
    const hit = breakpoint.hit(), before = await raw(), sends = await observer.inspect()
    expect(hit, '必须实际命中精确事务边界').not.toBeNull()
    expect(sends.sends).toHaveLength(1)
    const original = sends.sends[0]
    expect(original).toMatchObject({ conversationId: id, content: request })
    expect(before.messages.filter(message => message.senderType === 'user')).toHaveLength(absent ? 0 : 1)
    expect(before.requests).toHaveLength(absent ? 0 : 1)
    expect(before.receipts).toHaveLength(absent ? 0 : 1)
    expect(before.turns).toHaveLength(absent ? 0 : 1)
    if (!absent) {
      expect(before.receipts[0]).toMatchObject({ id: original.requestId, messageId: before.requests[0].messageId })
      expect(before.messages.find(message => message.id === before.requests[0].messageId)?.content).toBe(request)
    }
    expect(before.artifacts).toEqual([]); expect(before.intents).toEqual([])
    expect(before.works).toHaveLength(claimed ? 1 : 0)
    expect(before.budgets).toHaveLength(claimed ? 1 : 0)
    expect(before.executions).toHaveLength(claimed ? 1 : 0)
    expect(before.calls).toHaveLength(claimed ? 1 : 0)
    if (claim) {
      expect(before.profileCalls).toHaveLength(1)
      const decision = before.runs.find(run => run.phase === 'decision')!, execution = before.runs.find(run => run.phase === 'execution')!
      expect(decision).toMatchObject({ status: 'completed', backend: { kind: 'codex-local', externalInvocations: 1 } })
      expect(execution).toMatchObject({ status: 'running' }); expect(execution.workId).toBeUndefined()
      expect(execution.toolEvents).toEqual([])
      expect(Boolean(before.profileCalls[0].budgetOwned)).toBe(claimed)
      if (claimed) {
        expect(before.calls[0]).toMatchObject({ id: before.profileCalls[0].id, phase: 'decision', workId: before.works[0].id, budgetId: before.budgets[0].id })
        expect(before.works[0]).toMatchObject({ status: 'running', activeRunId: execution.id, sourceMessageId: before.requests[0].messageId })
        expect(before.executions[0]).toMatchObject({ id: execution.id, workId: before.works[0].id, status: 'active', modelCalls: 0 })
      }
    } else { expect(before.runs).toEqual([]); expect(before.profileCalls).toEqual([]) }
    const children = await runtimeChildProcessIds(runtime)
    await runtime.reviewData('命中受理断点及独立只读数据库', { hit, original, before, children })
    await breakpoint.kill()
    await expect.poll(() => children.some(processIsRunning), { timeout: 10000 }).toBe(false)
    await read()
    if (absent) await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toBeVisible()
    else await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
    const recovered = await raw()
    expect(recovered.requests).toEqual(before.requests); expect(recovered.receipts).toEqual(before.receipts)
    expect(recovered.calls).toEqual(before.calls); expect(recovered.profileCalls).toEqual(before.profileCalls)
    expect(recovered.artifacts).toEqual([]); expect(recovered.intents).toEqual([])
    expect(recovered.runs.filter(run => run.phase === 'execution').every(run => run.status === 'interrupted')).toBe(true)
    expect(recovered.turns.every(turn => turn.status === 'interrupted')).toBe(true)
    if (claimed) {
      expect(recovered.works[0]).toMatchObject({ id: before.works[0].id, status: 'interrupted', requiresReview: true, artifactIds: [], resultMessageIds: [], resultVersion: 0 })
      expect(recovered.works[0].activeRunId).toBeUndefined()
      expect(recovered.executions[0]).toMatchObject({ id: before.executions[0].id, status: 'released', modelCalls: 0 })
    } else expect(recovered.works).toEqual([])
    await runtime.reviewData('真实退出及首次恢复原事实', { recovered, observation: await observer.inspect(), childrenExited: true })
    for (let restart = 1; restart <= 2; restart++) {
      await runtime.restart(); await read(); await openChat()
      expect(await raw()).toEqual(recovered)
      if (absent) {
        await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
        await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(request)
      } else {
        await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
        await expect(runtime.page.getByText(request, { exact: true })).toHaveCount(1)
        const notice = runtime.page.locator(`#message-${before.requests[0].messageId} [data-interrupted-turn-id="${before.turns[0].id}"]`)
        await expect(notice).toBeVisible()
        await expect(notice).toContainText('该轮处理已中断，已有回复和成果保留；未自动重新执行。')
        await notice.getByRole('button', { name: '查看执行过程', exact: true }).click()
        const trace = runtime.page.locator(`.trace-detail[data-turn-id="${before.turns[0].id}"]`)
        await trace.locator('.trace-run-summary > summary').click()
        await expect(trace.getByRole('heading', { name: '本轮中断', exact: true })).toBeVisible()
        await expect(trace.locator('[data-run-id]')).toHaveCount(recovered.runs.length)
        await expect(trace.getByRole('button', { name: /重试本轮/ })).toHaveCount(0)
        if (!claim) await expect(trace.getByText('本条消息还没有运行记录。', { exact: true })).toBeVisible()
        else {
          await expect(trace).toContainText('本轮处理尝试 2 次')
          await expect(trace).toContainText('当前记录中的本机请求：1 次')
          await expect(trace.getByText('本机 Agent 不会自动续跑；请核对已有结果后，在聊天中发送明确的后续要求。', { exact: true })).toBeVisible()
        }
        await expect.poll(() => trace.locator('.trace-run-summary').evaluate(element => element.getBoundingClientRect().bottom >= element.querySelector('.activity-round')!.getBoundingClientRect().bottom - 1)).toBe(true)
        expect(await raw()).toEqual(recovered)
        await runtime.reviewCheckpoint(`第${restart}次重启原消息中断及固定执行记录`)
        await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
        await expect(trace).toBeHidden()
      }
      if (claimed) {
        await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: '任务', exact: true }).click()
        const card = runtime.page.locator(`[data-work-id="${before.works[0].id}"]:visible`)
        await expect(card).toContainText('已中断')
        await expect(card).toContainText('处理已中断，未自动重新执行。请先核对已有结果。')
        await expect(card).not.toContainText('原因未记录')
        await expect(card.getByRole('button', { name: '查看结果', exact: true })).toHaveCount(0)
      }
      await runtime.reviewCheckpoint(`第${restart}次重启原受理事实无重放`)
    }
    if (absent) {
      const retryObserver = await materialSendReplyFault(runtime, 'observe')
      await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toBeVisible()
      expect(await raw()).toEqual(recovered); expect((await retryObserver.inspect()).sends).toEqual([])
      expect((await retryObserver.inspect()).lookups).toContain(original.requestId)
      await runtime.reviewCheckpoint('确认无回执后仍等待用户明确重试')
      await runtime.page.getByRole('button', { name: '重试原消息', exact: true }).click()
      await expect.poll(async () => { const d = await read(); return d.workItems?.some(work => work.status === 'delivered') || d.runs.some(run => run.status === 'failed') }, { timeout: 260000 }).toBe(true)
      await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && run.status === 'completed'), { timeout: 130000 }).toBe(true)
      const delivered = await read()
      expect(delivered.workItems).toHaveLength(1); expect(delivered.workItems![0].status).toBe('delivered'); expect(delivered.artifacts).toHaveLength(1)
      expect((await retryObserver.inspect()).sends).toEqual([original])
      const final = await raw()
      expect(final.requests).toHaveLength(1); expect(final.receipts).toHaveLength(1)
      expect(final.receipts[0].id).toBe(original.requestId)
      await runtime.reviewFile('未提交原请求显式重试后唯一交付', delivered.artifacts[0].path)
      await runtime.reviewCheckpoint('明确重试原请求后唯一工作交付')
    }
    await runtime.reviewData('两次重启及明确操作后最终事实', { boundary, original, facts: await raw() })
    expect(runtime.errors).toEqual([])
  } finally {
    await breakpoint?.dispose()
    await runtime.reviewData('受理故障最终原始状态', { ...await raw(), traces: await store.load('traceSpans') })
    await store.close()
  }
})
