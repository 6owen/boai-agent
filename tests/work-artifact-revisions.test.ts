/*
 * [INPUT]: 真实 SQLite 中的成果修订请求、本人消息、员工与现有工作/预算。
 * [OUTPUT]: 新根预算与原交付隔离、认领竞争/回滚、目标与来源门禁、聊天附件的新成员子工作/退出阻断与旧显式材料不扩权、重试/子工作/唤醒身份和重启不重放验证。
 * [POS]: tests/work-artifact-revisions.test.ts，直接约束 WorkRepository 的持久修订边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import type { AutomationOrigin, Message, WorkItem } from '../src/shared/domain'
import type { ArtifactRevisionRequest, ArtifactVersion } from '../src/shared/domain/artifacts'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const dispose of disposers.splice(0)) await dispose() })
const origin: AutomationOrigin = { kind: 'automation', automationId: 'old-plan', occurrenceId: 'old-occurrence', name: '原自动化', authorizedFingerprint: 'old-grant' }
const message = (id: string, sequence = 1): Message => ({ id, conversationId: 'group', senderType: 'user', senderId: 'user', senderName: '本人', content: '把结论补充为明确的验收条件', status: 'completed', sequence, createdAt: new Date().toISOString() })
const intent = { key: 'model-selected-key', scope: '根据指定原版修改结论', deliverable: '发布修订后的报告' }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-work-artifact-revision-')), store = new ProductStore(join(root, 'product.sqlite'))
  await store.init(); const works = new WorkRepository(store); await works.init()
  disposers.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  const original = await works.claim({ conversationId: 'group', sourceMessageId: 'original-message', agentId: 'author', runId: 'original-run', intent: { key: 'main', scope: '完成原报告', deliverable: '报告' } })
  await works.settle('original-run', { disposition: 'delivered', summary: '原报告已交付', evidence: [{ kind: 'answer', reference: '原报告' }] }, { messageId: 'original-answer', content: '原报告已交付', artifactIds: [] })
  const originalWork = { ...(await works.view('group')).workItems.find(work => work.id === original.id)!, origin }
  const originalBudget = { ...(await works.view('group')).workBudgets[0], deadlineAt: new Date(0).toISOString(), usage: { outputTokens: 200 }, usageIncomplete: true }
  const artifact: ArtifactVersion = { id: 'original-artifact', conversationId: 'group', logicalArtifactId: 'logical-report', contentVersion: 1, contentHash: 'a'.repeat(64), contentStatus: 'ready', managedRelativePath: 'artifacts/original.md', registrationSource: 'publication', name: '报告.md', path: join(root, 'workspaces/group/artifacts/original.md'), size: 20, ownerAgentId: 'author', runId: 'original-run', sourceWorkId: original.id, sourceMessageId: 'original-answer', publishedAt: new Date().toISOString() }
  const revision: ArtifactRevisionRequest = { id: 'revision-request', fingerprint: 'b'.repeat(64), conversationId: 'group', artifactId: artifact.id, contentHash: artifact.contentHash, logicalArtifactId: artifact.logicalArtifactId, targetAgentId: 'author', content: message('revision-message').content, messageId: 'revision-message', createdAt: new Date().toISOString() }
  const occurrence = { id: origin.occurrenceId, status: 'waiting_input', budgetId: originalBudget.id }
  await store.write([
    { collection: 'conversations', id: 'group', value: { id: 'group', kind: 'group', agentIds: ['author', 'helper'], workspacePath: join(root, 'workspaces/group') } },
    ...['author', 'helper'].map(id => ({ collection: 'agents', id, value: { id, active: true } })),
    { collection: 'messages', id: revision.messageId, value: message(revision.messageId) },
    { collection: 'messages', id: 'latest-automation-message', value: { ...message('latest-automation-message', 2), origin } },
    { collection: 'artifacts', id: artifact.id, value: artifact },
    { collection: 'artifactRevisionRequests', id: revision.id, value: revision },
    { collection: 'workItems', id: originalWork.id, value: originalWork },
    { collection: 'workBudgets', id: originalBudget.id, value: originalBudget },
    { collection: 'automationOccurrences', id: occurrence.id, value: occurrence },
  ])
  const claim = (runId: string) => ({ conversationId: 'group', sourceMessageId: revision.messageId, agentId: revision.targetAgentId, runId, intent, revisionRequestId: revision.id })
  return { root, store, works, revision, artifact, originalWork, originalBudget, occurrence, claim }
}
async function current(works: WorkRepository, id: string) { return (await works.view('group')).workItems.find(work => work.id === id)! }

describe('artifact revision work identity', () => {
  it('uses a new root budget without rewriting delivered work, its exhausted allowance or automation waiting', async () => {
    const { store, works, revision, originalWork, originalBudget, occurrence, claim } = await fixture()
    const revised = await works.claim(claim('revision-run'))
    expect(revised).toMatchObject({ revisionRequestId: revision.id, sourceMessageId: revision.messageId, key: 'artifact-revision', rootWorkId: revised.id, ownerAgentId: 'author', status: 'running', resultVersion: 0, requiresReview: false })
    expect(revised.origin).toBeUndefined(); expect(revised.parentWorkId).toBeUndefined()
    expect(revised.id).not.toBe(originalWork.id); expect(revised.budgetId).not.toBe(originalBudget.id)
    const budgets = await store.load('workBudgets')
    expect(budgets).toContainEqual(originalBudget)
    expect(budgets).toContainEqual(expect.objectContaining({ id: revised.budgetId, runs: 1, modelCalls: 1, usage: {}, usageIncomplete: true, workItems: 1 }))
    expect(await current(works, originalWork.id)).toEqual(originalWork)
    expect(await store.load('automationOccurrences')).toEqual([occurrence])
    expect(await store.load('artifactRevisionRequests')).toEqual([{ ...revision, rootWorkId: revised.id }])
  })

  it('binds only one root and allowance across SQLite connections even when model keys differ', async () => {
    const { root, store, works, claim } = await fixture()
    const competingStore = new ProductStore(join(root, 'product.sqlite')); await competingStore.init()
    disposers.unshift(() => competingStore.close())
    const competing = new WorkRepository(competingStore)
    const attempts = await Promise.allSettled([works.claim(claim('one')), competing.claim({ ...claim('two'), intent: { ...intent, key: 'another-key' } })])
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await store.load<WorkItem>('workItems')).filter(work => work.revisionRequestId)).toHaveLength(1)
    expect(await store.load('workBudgets')).toHaveLength(2)
    expect((await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBeDefined()
  })

  it('rejects old work IDs and occurrence inheritance, including a missing host revision parameter', async () => {
    const { store, works, originalWork, claim } = await fixture()
    const oldIntent = { ...intent, workId: originalWork.id, expectedVersion: originalWork.version }
    await expect(works.claim({ ...claim('old-work'), intent: oldIntent })).rejects.toThrow('原工作')
    await expect(works.claim({ ...claim('old-work-without-marker'), revisionRequestId: undefined, intent: oldIntent })).rejects.toThrow('原工作')
    await expect(works.claim({ ...claim('old-origin'), origin })).rejects.toThrow('occurrence')
    expect(await store.load('workBudgets')).toHaveLength(1)
    expect((await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBeUndefined()
  })

  it.each(['wrong_employee', 'inactive', 'external', 'removed_member', 'wrong_hash', 'wrong_user', 'origin_user', 'different_message', 'different_content'] as const)('refuses %s before binding or reserving any budget', async cause => {
    const { store, works, revision, artifact, claim } = await fixture()
    let input = claim('rejected')
    if (cause === 'wrong_employee') input = { ...input, agentId: 'helper' }
    if (cause === 'inactive') await store.write([{ collection: 'agents', id: 'author', value: { id: 'author', active: false } }])
    if (cause === 'external') await store.write([{ collection: 'agents', id: 'author', value: { id: 'author', active: true, executionBackend: { kind: 'acp-local' } } }])
    if (cause === 'removed_member') await store.write([{ collection: 'conversations', id: 'group', value: { id: 'group', agentIds: ['helper'] } }])
    if (cause === 'wrong_hash') await store.write([{ collection: 'artifacts', id: artifact.id, value: { ...artifact, contentHash: 'c'.repeat(64) } }])
    if (cause === 'wrong_user') await store.write([{ collection: 'messages', id: revision.messageId, value: { ...message(revision.messageId), senderId: 'automation:old-plan' } }])
    if (cause === 'origin_user') await store.write([{ collection: 'messages', id: revision.messageId, value: { ...message(revision.messageId), origin } }])
    if (cause === 'different_message') input = { ...input, sourceMessageId: 'another-user-message' }
    if (cause === 'different_content') await store.write([{ collection: 'messages', id: revision.messageId, value: { ...message(revision.messageId), content: '另一项无关任务' } }])
    await expect(works.claim(input)).rejects.toThrow()
    expect(await store.load('workBudgets')).toHaveLength(1)
    expect((await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBeUndefined()
  })

  it('keeps material grants on the new work and refuses an unauthorized child or a stale source revision', async () => {
    const { store, works, artifact, claim } = await fixture()
    const ref = { id: 'source-material', conversationId: 'group', revision: 3, contentHash: 'd'.repeat(64), parseVersion: 'text-v1' as const }
    const material = { id: ref.id, conversationId: 'group', status: 'ready', messageId: 'material-message', revision: ref.revision, contentHash: ref.contentHash, parseVersion: ref.parseVersion, authorizedAgentIds: ['author'] }
    await store.write([{ collection: 'artifacts', id: artifact.id, value: { ...artifact, materialSources: [ref] } }, { collection: 'materials', id: ref.id, value: material }])
    const parent = await works.claim({ ...claim('material-parent'), materialSources: [ref] })
    expect(parent.materialSources).toEqual([ref])
    await expect(works.delegate('material-parent', { key: 'unauthorized-child', ownerAgentId: 'helper', scope: '检查文案', deliverable: '检查结果' })).rejects.toThrow('执行授权')
    await store.write([{ collection: 'materials', id: ref.id, value: { ...material, revision: 4 } }])
    await expect(works.reserveCall('material-parent')).rejects.toThrow('材料来源')
    expect((await works.view('group')).workBudgets.find(budget => budget.id === parent.budgetId)).toMatchObject({ runs: 1, modelCalls: 1, workItems: 1 })
  })

  it('lets a newly joined member revise conversation attachments under the original root budget and blocks that member after leaving', async () => {
    const { store, works, artifact, claim } = await fixture()
    const ref = { id: 'conversation-material', conversationId: 'group', revision: 3, contentHash: 'd'.repeat(64), parseVersion: 'text-v1' as const }
    const material = { id: ref.id, conversationId: 'group', status: 'ready', messageId: 'material-message', revision: ref.revision, contentHash: ref.contentHash, parseVersion: ref.parseVersion, deliveryScope: 'conversation', authorizedAgentIds: ['author'] }
    await store.write([
      { collection: 'conversations', id: 'group', value: { id: 'group', agentIds: ['author'] } },
      { collection: 'artifacts', id: artifact.id, value: { ...artifact, materialSources: [ref] } },
      { collection: 'materials', id: ref.id, value: material },
    ])
    const parent = await works.claim({ ...claim('conversation-parent'), materialSources: [ref] })
    await store.write([{ collection: 'conversations', id: 'group', value: { id: 'group', agentIds: ['author', 'helper'] } }])
    const child = await works.delegate('conversation-parent', { key: 'joined-helper', ownerAgentId: 'helper', scope: '检查修订文案', deliverable: '检查结果' })
    expect(child).toMatchObject({ parentWorkId: parent.id, rootWorkId: parent.id, budgetId: parent.budgetId, materialSources: [ref] })
    const budgetBefore = (await works.view('group')).workBudgets.find(budget => budget.id === parent.budgetId)!
    expect(budgetBefore).toMatchObject({ workItems: 2, runs: 1, modelCalls: 1 })
    await works.scheduleWake(child.wakeId!, 'joined-helper-turn', [])
    await store.write([{ collection: 'conversations', id: 'group', value: { id: 'group', agentIds: ['author'] } }])
    await expect(works.claim({ conversationId: 'group', sourceMessageId: child.sourceMessageId, agentId: 'helper', runId: 'removed-helper', wakeId: child.wakeId, revisionRequestId: child.revisionRequestId, intent: { ...intent, workId: child.id, expectedVersion: child.version } })).rejects.toThrow('当前有效')
    expect((await works.view('group')).workBudgets.find(budget => budget.id === parent.budgetId)).toEqual(budgetBefore)
    expect(await store.load('workBudgets')).toHaveLength(2)
  })

  it('rolls the root link back with execution and budget records when commit fails', async () => {
    const { store, works, claim } = await fixture(), transaction = store.transaction.bind(store)
    vi.spyOn(store, 'transaction').mockImplementationOnce(operation => transaction(tx => operation({ ...tx, put: async record => {
      if (record.collection === 'workExecutions') throw new Error('execution write rejected')
      await tx.put(record)
    } })))
    await expect(works.claim(claim('failed-commit'))).rejects.toThrow('execution write rejected')
    expect((await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBeUndefined()
    expect((await store.load<WorkItem>('workItems')).filter(work => work.revisionRequestId)).toEqual([])
    expect(await store.load('workBudgets')).toHaveLength(1)
  })

  it('retries the bound revision work without resetting usage or taking the latest automation message as origin', async () => {
    const { works, revision, claim } = await fixture(), initial = await works.claim(claim('first'))
    await works.reserveCall('first'); await works.usage('first', { outputTokens: 7 }); await works.release('first', 'failed')
    await works.authorizeRetry(initial.id, 'author')
    const ready = await current(works, initial.id)
    const retry = await works.claim({ ...claim('retry'), sourceMessageId: 'latest-automation-message', intent: { ...intent, workId: ready.id, expectedVersion: ready.version } })
    expect(retry).toMatchObject({ id: initial.id, sourceMessageId: revision.messageId, rootWorkId: initial.id, budgetId: initial.budgetId, revisionRequestId: revision.id })
    expect(retry.origin).toBeUndefined()
    expect((await works.view('group')).workBudgets.find(budget => budget.id === initial.budgetId)).toMatchObject({ runs: 2, modelCalls: 3, retries: 1, usage: { outputTokens: 7 }, usageIncomplete: true })
    await expect(works.claim({ ...claim('wrong-revision'), revisionRequestId: 'different-revision', intent: { ...intent, workId: retry.id, expectedVersion: retry.version } })).rejects.toThrow('修订请求')
  })

  it('inherits revision source in children and preserves the same root budget through dependency wake', async () => {
    const { store, works, revision, claim } = await fixture(), parent = await works.claim(claim('parent'))
    const child = await works.delegate('parent', { key: 'check', ownerAgentId: 'helper', scope: '检查修订文案', deliverable: '检查结果' })
    expect(child).toMatchObject({ revisionRequestId: revision.id, sourceMessageId: revision.messageId, rootWorkId: parent.id, parentWorkId: parent.id, budgetId: parent.budgetId })
    expect(child.origin).toBeUndefined()
    await works.waitFor('parent', { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '完成修订正文' })
    await works.settle('parent', { disposition: 'waiting', summary: '等待检查' }, { messageId: 'waiting', content: '等待检查', artifactIds: [] })
    await works.scheduleWake(child.wakeId!, 'child-turn', [])
    await works.claim({ conversationId: 'group', sourceMessageId: 'latest-automation-message', agentId: 'helper', runId: 'child', wakeId: child.wakeId, intent: { ...intent, workId: child.id, expectedVersion: child.version } })
    await works.settle('child', { disposition: 'delivered', summary: '检查通过', evidence: [{ kind: 'answer', reference: '通过' }] }, { messageId: 'checked', content: '通过', artifactIds: [] })
    const ready = await current(works, parent.id)
    await works.scheduleWake(ready.wakeId!, 'parent-turn', [])
    const continued = await works.claim({ ...claim('continued'), sourceMessageId: 'latest-automation-message', wakeId: ready.wakeId, intent: { ...intent, workId: ready.id, expectedVersion: ready.version } })
    expect(continued).toMatchObject({ sourceMessageId: revision.messageId, rootWorkId: parent.id, budgetId: parent.budgetId, revisionRequestId: revision.id, resultVersion: 1 })
    expect((await store.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBe(parent.id)
    expect((await works.view('group')).workBudgets.find(budget => budget.id === parent.budgetId)).toMatchObject({ workItems: 2, runs: 3, modelCalls: 3 })
  })

  it('blocks source revocation and cleanup before more effects, without replacing the root budget', async () => {
    const { store, works, artifact, revision, claim } = await fixture(), root = await works.claim(claim('active'))
    await store.write([{ collection: 'artifacts', id: artifact.id, value: { ...artifact, contentStatus: 'unavailable' } }])
    await expect(works.markEffect('active')).rejects.toThrow('内容身份')
    await store.write([{ collection: 'artifacts', id: artifact.id, value: artifact }, { collection: 'conversationCleanup', id: 'group', value: { id: 'group' } }])
    await expect(works.reserveCall('active')).rejects.toThrow('清理')
    await store.transaction(async tx => { await tx.remove('artifactRevisionRequests', revision.id); await tx.remove('messages', revision.messageId); await tx.remove('workItems', root.id); await tx.remove('workBudgets', root.budgetId); await tx.remove('workExecutions', 'active') })
    await expect(works.claim(claim('after-clear'))).rejects.toThrow('已清理')
    expect((await store.load<WorkItem>('workItems')).some(work => work.revisionRequestId)).toBe(false)
    expect(await store.load('workBudgets')).toHaveLength(1)
  })

  it('retains the root binding in a restored database and never starts an interrupted revision automatically', async () => {
    const { root, store, works, revision, claim } = await fixture(), initial = await works.claim(claim('active'))
    await works.usage('active', { outputTokens: 11 })
    const restoredStore = new ProductStore(join(root, 'restored.sqlite')); await store.backup(restoredStore.filename); await restoredStore.init()
    disposers.unshift(() => restoredStore.close())
    const restored = new WorkRepository(restoredStore); await restored.init()
    expect(await current(restored, initial.id)).toMatchObject({ revisionRequestId: revision.id, rootWorkId: initial.id, status: 'interrupted', requiresReview: true })
    await expect(restored.claim({ ...claim('not-replayed'), intent: { ...intent, key: 'new-model-key' } })).rejects.toThrow('不能重复执行')
    expect((await restored.view('group')).workBudgets.find(budget => budget.id === initial.budgetId)).toMatchObject({ runs: 1, usage: { outputTokens: 11 } })
    expect((await restoredStore.load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0].rootWorkId).toBe(initial.id)
  })
})
