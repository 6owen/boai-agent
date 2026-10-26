/*
 * [OUTPUT]: 清理后的拒绝提示明确重新选择，留证等待提示不透明且完全进入窗口。
 * [INPUT]: 原IM本机员工、原生选择的文本/图片/二进制附件与原发送IPC故障。
 * [OUTPUT]: 三附件未知发送跨重启仅恢复冻结引用；已受理只读核对不重跑，未受理材料真实清理且旧版本拒绝，明确重选使用新请求。
 * [POS]: LR2/3材料发送BDD；原材料/消息事务、模型与宿主回收不替换，正文与媒体仅在本场受管原件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { test } from './codex-employee.steps'
import { materialSendReplyFault, nextMaterialDialog } from '../support/materials'
import { prepareCodexSendMaterials } from '../support/codex-resources'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { ConversationMaterial } from '../../../packages/shared/src/domain/materials'

const { Then } = createBdd(test)
Then('三附件消息在{string}失联后重启只核对原请求且清理不重读来源', async ({ runtime, codexEmployee }, boundary: string) => {
  test.setTimeout(700000)
  const beforeAdmission = boundary === '受理前', id = codexEmployee.conversationId!
  expect(['受理前', '受理后']).toContain(boundary)
  const { source, files } = await prepareCodexSendMaterials(runtime.root)
  const hashes = await Promise.all(files.map(async path => createHash('sha256').update(await readFile(path)).digest('hex')))
  const request = '这是普通聊天，不执行工具。请只回复本条Markdown附件中的完整暗号；不创建任何工作或文件。'
  const content = beforeAdmission ? '' : request
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const raw = async () => {
    const { messages, runs, turns, workItems, workBudgets, artifacts } = await read()
    return { messages, runs, turns, workItems, workBudgets, artifacts, requests: await store.load('requests'), receipts: await store.load('messageReceipts'), calls: await store.load('budgetModelCalls'), materials: await store.load<ConversationMaterial>('materials'), sessions: await store.load('codexSessions') }
  }
  const business = ({ materials: _, ...value }: Awaited<ReturnType<typeof raw>>) => value
  const pending = () => runtime.page.evaluate(() => JSON.parse(localStorage.getItem('boai:external-tasks:pending') ?? '{}'))
  const openChat = async () => {
    await read() // The bridge can be present before runtime recovery has completed.
    await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: '本机 Codex 同事', exact: true }).click()
  }
  const addFiles = async () => {
    for (const [index, path] of files.entries()) {
      await nextMaterialDialog(runtime, { path })
      await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
      await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
      await expect(runtime.page.locator('[data-material-status="ready"]')).toHaveCount(index + 1)
    }
  }
  const waitChat = async () => {
    await expect.poll(async () => {
      const d = await read()
      return d.runs.some(run => ['failed', 'cancelled', 'interrupted'].includes(run.status)) || d.runs.some(run => run.phase === 'memory' && run.status === 'completed') && d.turns!.every(turn => turn.status === 'completed')
    }, { timeout: 390000 }).toBe(true)
    const d = await raw()
    expect(d.runs.filter(run => run.status !== 'completed')).toEqual([])
    expect(d.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toContain(source.code)
    expect(d.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    expect(d.workItems).toEqual([]); expect(d.calls).toEqual([])
    return d
  }
  const originalPath = (material: ConversationMaterial) => join(runtime.root, 'v2', 'materials', id, material.id, 'original')
  try {
    for (const path of files) await runtime.reviewFile(`明确选择的附件原件-${basename(path)}`, path)
    await addFiles()
    const prepared = (await raw()).materials
    expect(prepared).toHaveLength(3)
    expect(prepared.map(material => material.format).sort()).toEqual(['file', 'image', 'markdown'])
    const frozenSelections = files.map(path => prepared.find(material => material.name === basename(path))!).map(material => ({ id: material.id, revision: material.revision }))
    const fault = await materialSendReplyFault(runtime, beforeAdmission ? 'before' : 'after')
    if (content) await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
    await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
    await expect(runtime.page.getByText('本次发送包含 3 份材料。', { exact: true })).toBeVisible()
    const lost = await fault.inspect(), original = lost.sends[0]
    expect(lost.sends).toHaveLength(1); expect(lost.committedMessages).toHaveLength(beforeAdmission ? 0 : 1)
    expect(original.content).toBe(content)
    expect(original.materialSelections).toEqual(frozenSelections)
    const frozen = await pending()
    expect(frozen).toEqual({ [id]: { schemaVersion: 2, kind: 'message', requestId: original.requestId, input: { content, mentionIds: [], materialSelections: frozenSelections } } })
    expect(JSON.stringify(frozen)).not.toContain(source.code)
    for (const path of files) expect(JSON.stringify(frozen)).not.toContain(path)
    expect(JSON.stringify(frozen)).not.toMatch(/data:image|base64|imageUrl|selectionId|contentHash/)
    if (!beforeAdmission) await waitChat()
    const before = await raw()
    if (beforeAdmission) { expect(before.messages).toEqual([]); expect(before.runs).toEqual([]); expect(before.requests).toEqual([]) }
    await runtime.reviewData('三附件原发送失联与原版本', { boundary, original, frozen, fault: await fault.inspect(), hashes, before })
    await runtime.reviewCheckpoint('三附件原发送结果未知')
    await runtime.restart(); await openChat()
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
    await expect(runtime.page.getByText('本次发送包含 3 份材料。', { exact: true })).toBeVisible()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue(content)
    expect(await pending()).toEqual(frozen)
    const restarted = await raw()
    expect(business(restarted)).toEqual(business(before))
    if (beforeAdmission) {
      expect(restarted.materials).toHaveLength(3)
      for (const old of prepared) {
        expect(restarted.materials.find(material => material.id === old.id)).toMatchObject({ status: 'removed', revision: old.revision + 1, authorizedAgentIds: [] })
        await expect(stat(originalPath(old))).rejects.toMatchObject({ code: 'ENOENT' })
      }
    } else expect(restarted.materials).toEqual(before.materials)
    await runtime.reviewData('三附件重启后原引用与业务事实', { frozen: await pending(), restarted })
    await runtime.reviewCheckpoint('重启保留三附件冻结引用')
    const observer = await materialSendReplyFault(runtime, 'observe')
    await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
    await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toHaveCount(0)
    expect(await raw()).toEqual(restarted)
    expect((await observer.inspect()).sends).toEqual([])
    expect((await observer.inspect()).lookups).toEqual([original.requestId])
    if (beforeAdmission) {
      await runtime.page.getByRole('button', { name: '重试原消息', exact: true }).click()
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toBeEnabled()
      const error = runtime.page.locator('[data-sonner-toast][data-type="error"]', { hasText: '附件草稿已在重启时清理。请放弃未受理发送，重新选择附件后发送。' })
      await expect(error).toBeVisible()
      expect((await observer.inspect()).sends).toEqual([original])
      expect((await observer.inspect()).committedMessages).toEqual([])
      expect(await raw()).toEqual(restarted)
      expect((await pending())[id].input.materialSelections).toEqual(frozenSelections)
      await runtime.reviewData('旧附件版本重试被拒且未受理', { observation: await observer.inspect(), facts: await raw() })
      await expect.poll(() => error.evaluate(node => {
        const rect = node.getBoundingClientRect()
        return getComputedStyle(node).opacity === '1' && rect.top >= 0 && rect.bottom <= innerHeight && node.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished')
      })).toBe(true)
      await runtime.reviewCheckpoint('重启已清理材料拒绝原版本')
      await runtime.page.getByRole('button', { name: '放弃未受理发送', exact: true }).click()
      await expect(runtime.page.getByRole('button', { name: '重试原消息', exact: true })).toHaveCount(0)
      expect(await pending()).toEqual({})
      expect(await raw()).toEqual(restarted)
      await addFiles()
      const newMaterials = (await raw()).materials.filter(material => material.status === 'ready')
      expect(newMaterials).toHaveLength(3)
      expect(newMaterials.every(material => !prepared.some(old => old.id === material.id))).toBe(true)
      await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
      await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
      await waitChat()
      const observation = await observer.inspect()
      expect(observation.sends).toHaveLength(2); expect(observation.committedMessages).toHaveLength(1)
      expect(observation.sends[1].requestId).not.toBe(original.requestId)
      expect(observation.sends[1].materialSelections?.map(material => material.id)).toEqual(files.map(path => newMaterials.find(material => material.name === basename(path))!.id))
    }
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
    expect(await pending()).toEqual({})
    await expect(runtime.page.getByRole('region', { name: '消息材料', exact: true }).locator('[data-material-id]')).toHaveCount(3)
    const complete = await raw()
    const activeMaterials = complete.materials.filter(material => material.status === 'ready')
    expect(activeMaterials).toHaveLength(3)
    expect(complete.receipts).toHaveLength(1); expect(complete.requests).toHaveLength(1)
    const actualHashes = await Promise.all(activeMaterials.map(async material => createHash('sha256').update(await readFile(originalPath(material))).digest('hex')))
    expect(actualHashes.sort()).toEqual([...hashes].sort())
    expect(await Promise.all(files.map(async path => createHash('sha256').update(await readFile(path)).digest('hex')))).toEqual(hashes)
    await runtime.page.getByRole('button', { name: '预览材料 来源核对.md', exact: true }).click()
    await expect(runtime.page.locator('.detail-content:visible')).toContainText(source.code)
    await runtime.reviewCheckpoint(beforeAdmission ? '明确重选后新消息读取三附件' : '只读核对后原三附件消息保持唯一')
    await runtime.reviewData('三附件恢复最终事实', { boundary, original, observation: await observer.inspect(), complete, activeHashes: actualHashes })
    await runtime.restart(); await openChat()
    expect(await raw()).toEqual(complete)
    expect(await pending()).toEqual({})
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('三附件失联最终原始状态', { ...await raw(), traces: await store.load('traceSpans') })
    await store.close()
  }
})
