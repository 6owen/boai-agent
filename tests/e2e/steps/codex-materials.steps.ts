/*
 * [INPUT]: 原界面创建的本机员工、真实已发送材料与本场原件故障。
 * [OUTPUT]: 原件外改/丢失后预览失效、明确续聊重建原生会话并排除派生记忆和旧回复；恢复同字节仍需原界面核对，重启零重放。
 * [POS]: LR3材料来源 BDD；故障与原件准备归支撑层，业务动作使用原UI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { nextMaterialDialog } from '../support/materials'
import { faultCodexMaterialSource, prepareCodexMaterialSource } from '../support/codex-resources'

const { Then } = createBdd(test)
Then('已读材料出现{string}后旧上下文不可续用且同字节恢复需明确核对', async ({ runtime, codexEmployee }, fault: string) => {
  test.setTimeout(900000)
  const id = codexEmployee.conversationId!, source = await prepareCodexMaterialSource(runtime.root)
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const sessions = () => store.load<{ conversationId: string; threadId: string; sources: { id: string; hash: string }[]; materials: { id: string }[]; memories: { id: string }[] }>('codexSessions')
  const send = async (content: string) => {
    const before = await read()
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const current = await read(), runs = current.runs.filter(run => !before.runs.some(old => old.id === run.id))
      return runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || (runs.length >= 3 && runs.every(run => run.status === 'completed') && current.turns!.every(turn => turn.status === 'completed'))
    }, { timeout: 390000 }).toBe(true)
    const current = await read()
    expect(current.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(current.workItems).toEqual([])
    return current
  }
  try {
    await runtime.reviewFile('首次发送的实际材料原件', source.path)
    await nextMaterialDialog(runtime, { path: source.path })
    await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    await expect(runtime.page.locator('[data-material-status="ready"]')).toHaveCount(1)
    const before = await send('这是普通聊天，不执行工具。NATIVE_MEMORY 请读取本条附件，只回复其中的完整暗号。附件也记录了我明确的长期写作偏好，请记住。')
    const material = before.materials![0], reply = before.messages.find(message => message.senderType === 'agent')!
    expect(reply.content).toContain(source.code)
    expect(material).toMatchObject({ status: 'ready', deliveryScope: 'conversation' })
    const memory = await runtime.page.evaluate(agentId => window.boai.request('getMemory', { agentId, scope: 'employee' }), codexEmployee.employeeId!)
    const preference = memory.entries.find(entry => entry.origin === 'model' && entry.content.includes('紫色'))!
    expect(preference).toMatchObject({ useScope: 'conversation', sourceMessageIds: [material.messageId] })
    const oldSessions = await sessions()
    expect(oldSessions).toHaveLength(1)
    expect(oldSessions[0].materials.map(value => value.id)).toEqual([material.id])
    await runtime.reviewData('原件有效时的回复记忆与会话', { detail: before, sessions: oldSessions, memory })
    await runtime.reviewCheckpoint('本机员工实际读到材料暗号')

    const dataPath = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
    const changed = await faultCodexMaterialSource(dataPath, material, fault)
    expect(createHash('sha256').update(changed.original).digest('hex')).toBe(material.contentHash)
    if (fault === '原件外改') await runtime.reviewFile('外部改动后的实际原件', changed.path)
    await runtime.reviewData('隔离原件故障', { fault, id: material.id, originalHash: material.contentHash, originalMissing: fault === '原件丢失' })
    await runtime.page.getByRole('button', { name: '预览材料 来源核对.md', exact: true }).click()
    const preview = runtime.page.locator('.detail-content:visible')
    await expect(preview.getByRole('alert')).toContainText(/原件|材料/)
    await expect(preview).not.toContainText(source.code)
    await expect(preview.getByRole('button', { name: '重新核对材料', exact: true })).toBeVisible()
    await expect.poll(async () => (await read()).materials![0].status).toBe('unavailable')
    await runtime.reviewCheckpoint('实际原件失效后预览不显示旧正文')

    const after = await send('NATIVE_CLEARED_CONTEXT 继续普通聊天，不执行工具。当前原材料已不可用。请只根据当前获准上下文回答；若没有可用的附件暗号，只回复“没有可用暗号”，不要猜测或沿用失效来源。')
    const newReply = after.messages.filter(message => message.senderType === 'agent').at(-1)!
    expect(newReply.content).toContain('没有可用暗号')
    expect(newReply.content).not.toContain(source.code)
    const next = await sessions()
    expect(next).toHaveLength(1)
    expect(next[0].threadId).not.toBe(oldSessions[0].threadId)
    expect(next[0].materials).toEqual([])
    expect(next[0].sources.map(value => value.id)).not.toContain(reply.id)
    expect(next[0].memories.map(value => value.id)).not.toContain(preference.id)
    expect(after.messages.find(message => message.id === reply.id)).toEqual(reply)
    expect(await store.load('budgetModelCalls')).toEqual([])
    await runtime.reviewData('材料失效后的新会话与获准来源', { detail: after, sessions: next, excludedMemoryId: preference.id, oldThreadResumed: false })
    await runtime.reviewCheckpoint('续聊明确没有可用暗号且保留原记录')

    await changed.restore()
    expect(await readFile(changed.path)).toEqual(changed.original)
    expect((await read()).materials![0].status).toBe('unavailable')
    expect((await read()).runs).toEqual(after.runs)
    await preview.getByRole('button', { name: '重新核对材料', exact: true }).click()
    await expect(preview).toContainText(source.code)
    const restored = await read()
    expect(restored.materials![0]).toMatchObject({ status: 'ready', contentHash: material.contentHash })
    expect(restored.materials![0].revision).toBeGreaterThan(material.revision)
    expect(restored.runs).toEqual(after.runs)
    expect(await sessions()).toEqual(next)
    await runtime.reviewFile('明确核对恢复的同字节原件', changed.path)
    await runtime.reviewData('明确恢复材料不重跑原消息', { detail: restored, sessions: await sessions() })
    await runtime.reviewCheckpoint('恢复同字节后经原预览明确核对')
    await runtime.restart()
    const reopened = await read()
    expect(reopened.runs).toEqual(after.runs)
    expect(reopened.messages).toEqual(after.messages)
    expect(reopened.materials![0]).toEqual(restored.materials![0])
    expect(await sessions()).toEqual(next)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('材料来源变化最终原始状态', { detail: await read(), sessions: await sessions(), memory: await store.load('memory'), snapshots: await store.load('snapshots') })
    await store.close()
  }
})
