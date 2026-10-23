/*
 * [OUTPUT]: 真实修订请求使用普通中文、不携带内部身份；新版公开答复不泄露内部修订标识，原版本/预算/采用断言保持。
 * [INPUT]: 原Claude创建/连续IM/已采用文件、原composer固定修订和生产Work/成果仓库。
 * [OUTPUT]: 明确原版/hash/执行员工的新根修订、独立预算/版本链/旧采用保留；新版显式采用、原件hash与重启零重放，失败也导出原件及账本。
 * [POS]: Claude成果修订BDD；离线协议、真实源码和应用包分别留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { BudgetModelCall } from '../../../src/shared/domain'
const { Then } = createBdd(test)

Then('用户在Claude原文件卡片要求修改并采用新版且重启保留原记录', async ({ runtime, claudeEmployee: state }) => {
  test.setTimeout(720000)
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ detail: await read(), calls: await store.load<BudgetModelCall>('budgetModelCalls'), revisions: await store.load('artifactRevisionRequests'), adoptions: await store.load('artifactAdoptionEvents'), sessions: await store.load('claudeSessions') })
  try {
    const before = await records(), original = before.detail.artifacts[0], oldWork = before.detail.workItems![0], oldBudget = before.detail.workBudgets![0]
    expect(before.detail.turns!.every(turn => turn.status === 'completed')).toBe(true)
    const originalBytes = await readFile(original.path), originalMtime = (await stat(original.path)).mtimeMs
    await runtime.reviewFile('Claude修订前原版', original.path)
    const page = runtime.page, card = page.locator(`.messages [data-chat-artifact-id="${original.id}"]`)
    await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    await card.getByRole('button', { name: '要求修改', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '修改执行员工', exact: true })).toContainText('本机 Claude 同事')
    const request = state.real
      ? `请修改我选定的 proof.txt，给我这个文件的第二版。正文精确为两行：第一行“# Claude revised”，第二行“${state.token}”，末尾保留换行。保留原文件，完成后交付新版文件并简短说明。无需联网或使用命令，也不需要向我补充提问。`
      : 'CLAUDE_REVISION empty-memory 基于指定原版发布同一成果的新版本'
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await runtime.reviewData('Claude原版本修订明确请求', { request, originalId: original.id, originalHash: original.contentHash, originalWork: oldWork, originalBudget: oldBudget, realSupplier: !!state.real, packaged: !!process.env.BOAI_TEST_PACKAGED_PATH })
    await runtime.reviewNativeCheckpoint('Claude同一输入框固定原版修订')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => {
      const d = await read()
      return d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || d.artifacts.length === 2 && d.turns!.every(turn => turn.status === 'completed') && d.runs.every(run => run.status === 'completed')
    }, { timeout: 300000, intervals: [250, 500, 1000] }).toBe(true)
    const after = await records(), next = after.detail.workItems!.find(work => work.id !== oldWork.id)!, replacement = after.detail.artifacts.find(artifact => artifact.id !== original.id)!
    expect(after.detail.runs.filter(run => run.status !== 'completed')).toEqual([])
    if (state.real) expect(after.detail.messages.filter(message => message.senderType === 'agent').at(-1)?.content).not.toMatch(/revisionRequestId|CLAUDE_REVISION/)
    expect(after.detail.artifacts).toHaveLength(2); expect(after.detail.workItems).toHaveLength(2); expect(after.detail.workBudgets).toHaveLength(2)
    expect(next).toMatchObject({ status: 'delivered', rootWorkId: next.id, ownerAgentId: state.employeeId })
    expect(next.budgetId).not.toBe(oldWork.budgetId)
    expect(after.detail.workItems!.find(work => work.id === oldWork.id)).toEqual(oldWork)
    expect(after.detail.workBudgets!.find(budget => budget.id === oldBudget.id)).toEqual(oldBudget)
    expect(after.calls.filter(call => call.budgetId === oldBudget.id)).toEqual(before.calls.filter(call => call.budgetId === oldBudget.id))
    expect(replacement).toMatchObject({ logicalArtifactId: original.logicalArtifactId, contentVersion: 2, previousArtifactId: original.id, sourceWorkId: next.id, ownerAgentId: state.employeeId })
    expect(replacement.revisionRequestId).toBeTruthy()
    expect(after.revisions).toHaveLength(1)
    expect(after.revisions[0]).toMatchObject({ id: replacement.revisionRequestId, artifactId: original.id, contentHash: original.contentHash, rootWorkId: next.id, targetAgentId: state.employeeId, messageId: next.sourceMessageId })
    const newBytes = await readFile(replacement.path)
    expect(newBytes.toString()).toBe(state.real ? `# Claude revised\n${state.token}\n` : 'CLAUDE_REVISION\n生产工具真实新版\n')
    expect(createHash('sha256').update(newBytes).digest('hex')).toBe(replacement.contentHash)
    expect(await readFile(original.path)).toEqual(originalBytes); expect((await stat(original.path)).mtimeMs).toBe(originalMtime)
    const preview = await page.evaluate(id => window.boai.request('getArtifactPreview', { id }), replacement.id!)
    expect(preview.adoption.current?.artifactId).toBe(original.id)
    for (const budget of after.detail.workBudgets!) {
      const calls = after.calls.filter(call => call.budgetId === budget.id)
      expect(calls).toHaveLength(budget.modelCalls); expect(new Set(calls.map(call => call.id)).size).toBe(calls.length)
      expect(budget).toMatchObject({ callUnit: 'external-turn', unknownCalls: 0, usageIncomplete: false })
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) expect(budget.usage[key]).toBe(calls.reduce((sum, call) => sum + (call.usage?.[key] ?? 0), 0))
    }
    await runtime.reviewFile('Claude明确修订第二版', replacement.path)
    const newCard = page.locator(`.messages [data-chat-artifact-id="${replacement.id}"]`)
    await expect(newCard.getByRole('button', { name: '采用此版本', exact: true })).toBeEnabled()
    await expect(card.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    await runtime.reviewNativeCheckpoint('Claude新旧版本并存且新版未自动采用')
    await newCard.getByRole('button', { name: '采用此版本', exact: true }).click()
    await expect(newCard.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    const adopted = await page.evaluate(id => window.boai.request('getArtifactPreview', { id }), replacement.id!)
    expect(adopted.adoption.current?.artifactId).toBe(replacement.id)
    expect(adopted.adoption.events.map(event => event.artifactId)).toEqual([original.id, replacement.id])
    const settled = await records()
    await runtime.reviewData('Claude修订原版新根与最终账本', settled)
    await runtime.restart()
    expect(await records()).toEqual(settled)
    expect(await readFile(original.path)).toEqual(originalBytes); expect((await stat(original.path)).mtimeMs).toBe(originalMtime)
    expect(await readFile(replacement.path)).toEqual(newBytes)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Claude 同事', exact: true }).click()
    await expect(runtime.page.locator(`.messages [data-chat-artifact-id="${replacement.id}"]`).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
    await runtime.reviewNativeCheckpoint('Claude修订新版采用与重启零重放')
    expect(runtime.errors).toEqual([])
  } finally {
    const final = await records()
    await runtime.reviewData('Claude修订最终状态含失败', final)
    for (const artifact of final.detail.artifacts) await runtime.reviewFile('Claude修订最终已登记原件', artifact.path)
    await store.close()
  }
})
