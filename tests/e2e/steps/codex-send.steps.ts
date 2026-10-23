/*
 * [INPUT]: 原IM本机员工、真实消息提交与只丢IPC回复的隔离故障。
 * [OUTPUT]: 受理前/受理后失联跨完整重启保留原发送身份；只读核对不执行，确认未受理后显式重试保持唯一工作与Codex调用。
 * [POS]: 本机普通发送回执持久性BDD；生产消息/Work事务与执行器不替换。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { materialSendReplyFault } from '../support/materials'
import type { Desktop } from '../support/desktop'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'

const { Then } = createBdd(test)
Then('已受理的本机消息回执丢失后重启只核对原请求且不重复工作', async ({ runtime, codexEmployee }) => checkSendReceipt(runtime, codexEmployee.conversationId!, false))
Then('未受理的本机消息跨重启核对后显式重试原请求且只执行一次', async ({ runtime, codexEmployee }) => checkSendReceipt(runtime, codexEmployee.conversationId!, true))

async function checkSendReceipt(runtime: Desktop, id: string, beforeAdmission: boolean) {
  test.setTimeout(540000)
  const request = 'NATIVE_FILE_TASK：请创建并正式发布 codex-proof.md，正文精确为“# Codex proof\\nNATIVE_FILE_TASK\\n”（将 \\n 写成换行）。请实际执行文件工具，完成后报告 delivered；不使用命令或联网。'
  const fault = await materialSendReplyFault(runtime, beforeAdmission ? 'before' : 'after')
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => {
    const { messages, runs, turns, workItems, workBudgets, artifacts } = await read()
    return { detail: { messages, runs, turns, workItems, workBudgets, artifacts }, requests: await store.load('requests'), receipts: await store.load('messageReceipts'), calls: await store.load('budgetModelCalls') }
  }
  const waitDelivery = async () => {
    await expect.poll(async () => {
      const d = await read()
      return d.workItems?.some(work => work.status === 'delivered') || d.runs.some(run => run.status === 'failed')
    }, { timeout: 260000 }).toBe(true)
    await expect.poll(async () => (await read()).turns!.every(turn => ['completed', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status)), { timeout: 130000 }).toBe(true)
    await expect.poll(async () => (await read()).runs.some(run => run.phase === 'memory' && run.status === 'completed'), { timeout: 130000 }).toBe(true)
    const facts = await raw()
    expect(facts.detail.workItems).toHaveLength(1); expect(facts.detail.workItems![0].status).toBe('delivered'); expect(facts.detail.artifacts).toHaveLength(1)
    await runtime.reviewFile('原请求唯一工作实际交付文件', facts.detail.artifacts[0].path)
  }
  try {
    if (beforeAdmission) await runtime.page.evaluate(() => {
      const original = Storage.prototype.setItem
      Object.assign(window, { __restoreSendStorage: () => { Storage.prototype.setItem = original } })
      Storage.prototype.setItem = function(key, value) { if (key === 'boai:external-tasks:pending') throw new Error('验收：原发送身份存储不可写'); return original.call(this, key, value) }
    })
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    if (beforeAdmission) {
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toBeVisible()
      expect((await fault.inspect()).sends).toHaveLength(0)
      expect((await raw()).calls).toHaveLength(0)
      await runtime.reviewData('发送身份存储失败时宿主未收到消息', { fault: await fault.inspect(), facts: await raw() })
      await runtime.reviewCheckpoint('发送前存储失败阻止提交')
      await runtime.page.evaluate(() => (window as unknown as { __restoreSendStorage: () => void }).__restoreSendStorage())
      await fault.allowLookup()
      await runtime.page.getByRole('button', { name: '重试原消息', exact: true }).click()
    }
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
    const lost = await fault.inspect()
    expect(lost.sends).toHaveLength(1); expect(lost.committedMessages).toHaveLength(beforeAdmission ? 0 : 1); expect(lost.rejectedBeforeAdmission).toBe(beforeAdmission ? 1 : 0)
    const original = lost.sends[0]
    expect(original.content).toBe(request)
    if (!beforeAdmission) await waitDelivery()
    const before = await raw()
    if (beforeAdmission) { expect(before.detail.messages).toHaveLength(0); expect(before.detail.workItems).toHaveLength(0); expect(before.calls).toHaveLength(0); expect(before.requests).toHaveLength(0) }
    await runtime.reviewData('回执不可读的原冻结请求', { beforeAdmission, original, fault: await fault.inspect(), before })
    await runtime.reviewCheckpoint(beforeAdmission ? '发送尚未受理且原回执待核对' : '原消息已交付但发送结果仍待核对')
    await runtime.restart()
    await read()
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(request)
    expect(await raw()).toEqual(before)
    await runtime.reviewCheckpoint('完整重启后保留原发送身份')
    const observer = await materialSendReplyFault(runtime, 'observe')
    await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toHaveCount(0)
    expect(await raw()).toEqual(before)
    expect((await observer.inspect()).sends).toHaveLength(0)
    expect((await observer.inspect()).lookups).toContain(original.requestId)
    if (beforeAdmission) {
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toBeVisible()
      await runtime.reviewCheckpoint('只读核对确认未受理且未启动工作')
      await runtime.page.getByRole('button', { name: '重试原消息', exact: true }).click()
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toHaveCount(0)
      await waitDelivery()
      expect((await observer.inspect()).sends).toEqual([original])
      expect((await observer.inspect()).committedMessages).toHaveLength(1)
      expect(await store.load('requests')).toHaveLength(1)
    }
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
    await runtime.reviewCheckpoint('只读核对后原消息与工作保持唯一')
    await runtime.reviewData('发送回执核对后最终事实', { beforeAdmission, original, observation: await observer.inspect(), after: await raw() })
    expect(runtime.errors).toEqual([])
  } finally { await runtime.reviewData('本机发送未知回执最终原始状态', { ...await raw(), traces: await store.load('traceSpans') }); await store.close() }
}
