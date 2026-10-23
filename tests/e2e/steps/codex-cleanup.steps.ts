/*
 * [INPUT]: 独立本机员工的真实已完成对话、原清空入口与只读产品记录。
 * [OUTPUT]: 清空移除映射和原聊天来源，重启不调用模型，明确新发送建立新原生会话且不回流旧暗号。
 * [POS]: 本机聊天清理 BDD；不声称删除供应商或用户全局CLI历史。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'

const { Then } = createBdd(test)
Then('原聊天清空后重启不恢复外部会话且新发送不带旧暗号', async ({ runtime, codexEmployee }) => {
  test.setTimeout(720000)
  const id = codexEmployee.conversationId!, code = `CHAT_CODE_${randomUUID()}`
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const sessions = () => store.load<{ conversationId: string; threadId: string; inputMessageIds: string[]; sources: { id: string; hash: string }[] }>('codexSessions')
  const send = async (content: string) => {
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || (detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed') && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed'))
    }, { timeout: 390000 }).toBe(true)
    const detail = await read()
    expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
    expect(detail.workItems).toEqual([])
    return detail
  }
  try {
    const initial = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    const agent = initial.agents.find(value => value.id === codexEmployee.employeeId)!
    const before = await send(`这是普通聊天，不执行工具。本聊天临时暗号是 ${code}，请只回复这个暗号，不保存为长期资料。`)
    expect(before.messages.find(message => message.senderType === 'agent')!.content).toContain(code)
    const oldSessions = await sessions()
    expect(oldSessions).toHaveLength(1)
    await runtime.reviewData('清空前原消息与外部会话', { detail: before, sessions: oldSessions })
    await runtime.reviewCheckpoint('原聊天已实际回复临时暗号')
    const item = runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true })
    await item.click({ button: 'right' })
    await runtime.page.getByRole('menuitem', { name: '清空聊天记录', exact: true }).click()
    await runtime.page.getByRole('button', { name: '确认清空', exact: true }).click()
    await expect(runtime.page.getByRole('alertdialog')).toBeHidden()
    await expect.poll(async () => (await read()).messages.length).toBe(0)
    const cleared = await read()
    expect(cleared.runs).toEqual([]); expect(cleared.workItems).toEqual([]); expect(await sessions()).toEqual([])
    const clearedSnapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
    expect(clearedSnapshot.agents.find(value => value.id === agent.id)).toEqual(agent)
    expect(clearedSnapshot.conversations.some(value => value.id === id)).toBe(true)
    await runtime.reviewData('清空后原业务记录与映射', { detail: cleared, sessions: await sessions(), receipts: await store.load('messageReceipts') })
    await runtime.reviewCheckpoint('原聊天清空后没有旧回复')
    await runtime.restart()
    expect((await read()).runs).toEqual([]); expect(await sessions()).toEqual([])
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
    const after = await send('NATIVE_CLEARED_CONTEXT 这是普通聊天，不执行工作或工具。本次没有提供暗号。若当前获准上下文没有本聊天原来的临时暗号，请只回复“没有可用暗号”；不要猜测或编造。')
    const reply = after.messages.find(message => message.senderType === 'agent')!
    expect(reply.content).toContain('没有可用暗号'); expect(JSON.stringify(after)).not.toContain(code)
    const next = await sessions(), currentUser = after.messages.find(message => message.senderType === 'user')!
    expect(next).toHaveLength(1); expect(next[0].threadId).not.toBe(oldSessions[0].threadId)
    expect(next[0].inputMessageIds).toEqual([currentUser.id]); expect(next[0].sources.map(source => source.id)).toEqual([currentUser.id])
    await runtime.reviewData('明确新发送建立新会话且不回流旧来源', { detail: after, sessions: next, oldThreadResumed: false })
    await runtime.reviewCheckpoint('清空后的新交流明确没有旧暗号')
    expect(runtime.errors).toEqual([])
  } finally { await runtime.reviewData('本机清空最终原始状态', { detail: await read(), sessions: await sessions(), memory: await store.load('memory') }); await store.close() }
})
