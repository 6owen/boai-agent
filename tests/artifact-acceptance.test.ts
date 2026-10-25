/*
 * [INPUT]: 真实 SQLite、受管成果原件、显式本人待验收及既有修订/采用事务。
 * [OUTPUT]: 固定版/hash 待验收的显式资格、并发幂等/失败回滚、外改/来源核对、原动作终结、清理 tombstone 及备份重启不重放；资格不证明人工质量通过。
 * [POS]: tests/artifact-acceptance.test.ts；离线持久化验收，不调用模型或 Electron，不使用假事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import type { Conversation, DigitalAgent, Message, WorkItem } from '../packages/shared/src/domain'
import type { ArtifactAcceptanceInput, ArtifactPublication, ArtifactRevisionInput, ArtifactVersion } from '../packages/shared/src/domain/artifacts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ArtifactRepository } from '../packages/runtime/src/modules/workspaces/artifact-repository'
import { MaterialRepository } from '../packages/runtime/src/modules/materials/material-repository'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
type Options = ConstructorParameters<typeof ArtifactRepository>[2]

async function fixture(options: Options = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-acceptance-'))); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  const employee: DigitalAgent = { id: 'alice', name: '作者', role: 'writer', instructions: '', color: '', connectionId: 'local', modelId: 'model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
  const conversation: Conversation = { id: 'chat', kind: 'direct', title: '交付', agentIds: ['alice'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '', updatedAt: '' }
  await store.write([record('agents', employee), record('conversations', conversation), record('connections', { id: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'model' })])
  const repository = new ArtifactRepository(store, root, options)
  const publication = async (id = 'v1', text = '# 原版\n固定内容\n'): Promise<ArtifactPublication> => {
    const directory = join(root, 'workspaces/chat/artifacts', id); await mkdir(directory, { recursive: true })
    const path = join(directory, '报告.md'); await writeFile(path, text)
    return { id, conversationId: 'chat', name: '报告.md', path, size: Buffer.byteLength(text), contentHash: hash(text), ownerAgentId: 'alice' }
  }
  const register = async (id = 'v1', text?: string) => store.transaction(async tx => repository.register(tx, await publication(id, text), { conversationId: 'chat', revisionRequestId: null, sourceWorkId: null, sourceMessageId: null }))
  const input = (artifact: ArtifactVersion, requestId = 'acceptance', expectedAcceptanceRevision = 0): ArtifactAcceptanceInput => ({ artifactId: artifact.id, logicalArtifactId: artifact.logicalArtifactId, contentVersion: artifact.contentVersion, contentHash: artifact.contentHash, expectedAcceptanceRevision, requestId })
  const revision = (artifact: ArtifactVersion, requestId = 'revision'): ArtifactRevisionInput => ({ conversationId: 'chat', artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: 'alice', content: '请补充对比', requestId })
  const userMessage = (request: ArtifactRevisionInput): Message => ({ id: `message-${request.requestId}`, conversationId: 'chat', senderType: 'user', senderId: 'user', senderName: '本人', content: request.content, status: 'completed', sequence: 1, createdAt: '' })
  const revise = async (artifact: ArtifactVersion, requestId = 'revision') => {
    const request = revision(artifact, requestId), message = userMessage(request)
    return store.transaction(async tx => { await tx.put(record('messages', message)); return repository.commitRevision(tx, request, message) })
  }
  const replacement = async (artifact: ArtifactVersion, id = 'v2', rollback = false) => {
    const request = await revise(artifact, `revision-${id}`), workId = `work-${id}`
    const work: WorkItem = { schemaVersion: 2, id: workId, conversationId: 'chat', sourceMessageId: request.messageId, revisionRequestId: request.id, ownerAgentId: 'alice', key: workId, scope: '报告', deliverable: '新版报告', version: 1, status: 'running', budgetId: `budget-${id}`, rootWorkId: workId, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: '', updatedAt: '' }
    await store.write([record('artifactRevisionRequests', { ...request, rootWorkId: workId }), record('workItems', work)])
    return store.transaction(async tx => {
      const result = await repository.register(tx, await publication(id, `# 新版 ${id}\n`), { conversationId: 'chat', revisionRequestId: request.id, sourceWorkId: workId, sourceMessageId: null })
      if (rollback) throw new Error('publication rollback')
      return result
    })
  }
  return { root, store, repository, publication, register, input, revision, userMessage, revise, replacement }
}

async function trigger(store: ProductStore, collection: string, active: boolean) {
  const client = createClient({ url: pathToFileURL(store.filename).href })
  try { await client.execute(active ? `CREATE TRIGGER fail_acceptance_transaction BEFORE INSERT ON records WHEN NEW.collection = '${collection}' BEGIN SELECT RAISE(ABORT, 'receipt transaction failure'); END` : 'DROP TRIGGER fail_acceptance_transaction') }
  finally { client.close() }
}

describe('explicit artifact acceptance qualification', () => {
  it('never creates a qualification from publication, requiresReview, preview, legacy verification or adoption alone', async () => {
    const { store, repository, publication, register } = await fixture(), first = await register()
    await store.write([record('workItems', { id: 'delivered', conversationId: 'chat', status: 'delivered', requiresReview: true, resultVersion: 9 })])
    expect((await repository.preview(first.id)).acceptance).toBeNull()
    await store.transaction(async tx => repository.registerLegacy(tx, await publication('legacy'), 'chat'))
    await repository.adopt({ artifactId: first.id, contentHash: first.contentHash, expectedAdoptionRevision: 0, requestId: 'adopted' })
    expect(await store.load('artifactAcceptances')).toEqual([])
    expect(await store.load('artifactAcceptanceReceipts')).toEqual([])
  })

  it('binds only the explicitly selected user/version/hash and keeps same-name artifacts independent', async () => {
    const { store, repository, register, input } = await fixture(), original = await register(), other = await register('independent', '# 同名另一份\n')
    const receipt = await repository.requestAcceptance(input(original))
    expect(receipt.acceptance).toMatchObject({ id: original.id, artifactId: original.id, logicalArtifactId: original.logicalArtifactId, contentVersion: 1, contentHash: original.contentHash, userId: 'user', revision: 1, status: 'pending' })
    expect(JSON.stringify(receipt)).not.toContain(original.path)
    expect(receipt.acceptance).not.toHaveProperty('qualityApproved')
    expect((await repository.preview(original.id)).acceptance).toEqual(receipt.acceptance)
    expect((await repository.preview(other.id)).acceptance).toBeNull()
    expect(await store.load('messages')).toEqual([]); expect(await store.load('workItems')).toEqual([])
  })

  it('deduplicates stable requests and the same pending version without incrementing its qualification', async () => {
    const { store, repository, register, input } = await fixture(), original = await register(), first = input(original)
    const receipt = await repository.requestAcceptance(first)
    expect(await repository.requestAcceptance(first)).toEqual(receipt)
    expect((await repository.requestAcceptance(input(original, 'second-key', 1))).acceptance).toEqual(receipt.acceptance)
    expect(await repository.acceptanceReceipt('absent')).toBeNull()
    await expect(repository.requestAcceptance({ ...first, contentHash: 'a'.repeat(64) })).rejects.toThrow('不同内容')
    await expect(repository.requestAcceptance(input(original, 'stale-key', 0))).rejects.toThrow('资格已更新')
    expect(await store.load('artifactAcceptances')).toHaveLength(1)
    expect(await store.load('artifactAcceptanceReceipts')).toHaveLength(2)
  })

  it('serializes two real connections into one original qualification and receipt', async () => {
    const { root, store, repository, register, input } = await fixture(), original = await register(), request = input(original)
    const competingStore = new ProductStore(store.filename); stores.push(competingStore); await competingStore.init()
    const competing = new ArtifactRepository(competingStore, root)
    const receipts = await Promise.all([repository.requestAcceptance(request), competing.requestAcceptance(request)])
    expect(receipts[1]).toEqual(receipts[0])
    expect(await store.load('artifactAcceptances')).toHaveLength(1); expect(await store.load('artifactAcceptanceReceipts')).toHaveLength(1)
  })

  it('rolls back the new qualification when its receipt cannot commit', async () => {
    const { store, repository, register, input } = await fixture(), original = await register()
    await trigger(store, 'artifactAcceptanceReceipts', true)
    await expect(repository.requestAcceptance(input(original))).rejects.toThrow('receipt transaction failure')
    expect(await store.load('artifactAcceptances')).toEqual([]); expect(await repository.acceptanceReceipt('acceptance')).toBeNull()
    await trigger(store, 'artifactAcceptanceReceipts', false)
    expect((await repository.requestAcceptance(input(original))).acceptance.status).toBe('pending')
  })

  it.each(['logicalArtifactId', 'contentVersion', 'contentHash'] as const)('rejects a stale %s without invalidating the real original', async field => {
    const { store, repository, register, input } = await fixture(), original = await register()
    const request = { ...input(original), [field]: field === 'contentVersion' ? 2 : field === 'contentHash' ? 'a'.repeat(64) : 'other' }
    await expect(repository.requestAcceptance(request)).rejects.toThrow('具体成果版本')
    expect(await store.load('artifactAcceptances')).toEqual([])
    expect((await repository.preview(original.id)).artifact.contentStatus).toBe('ready')
  })

  it('checks actual bytes again at admission and preserves an externally modified original', async () => {
    const { root, store, register, input } = await fixture(), original = await register()
    const repository = new ArtifactRepository(store, root, { checkpoint: async stage => { if (stage === 'before-acceptance-commit') await writeFile(original.path, '# external change\n') } })
    await expect(repository.requestAcceptance(input(original))).rejects.toThrow('外部修改')
    expect(await store.load('artifactAcceptances')).toEqual([]); expect(await store.load('artifactAcceptanceReceipts')).toEqual([])
    expect(await readFile(original.path, 'utf8')).toBe('# external change\n')
    expect((await store.load<ArtifactVersion>('artifacts'))[0]).toMatchObject({ contentHash: original.contentHash, contentStatus: 'unavailable' })
  })

  it('ends qualification in the adoption transaction, rolls back with it, and never reopens from an old request', async () => {
    const { store, repository, register, input } = await fixture(), original = await register(), request = input(original)
    await repository.requestAcceptance(request)
    const adoption = { artifactId: original.id, contentHash: original.contentHash, expectedAdoptionRevision: 0, requestId: 'adopt' }
    await trigger(store, 'artifactAdoptionReceipts', true)
    await expect(repository.adopt(adoption)).rejects.toThrow('receipt transaction failure')
    expect((await repository.acceptanceState(original.id))?.status).toBe('pending')
    await trigger(store, 'artifactAdoptionReceipts', false); await repository.adopt(adoption)
    expect(await repository.acceptanceState(original.id)).toMatchObject({ status: 'adopted', revision: 2 })
    expect((await repository.acceptanceReceipt(request.requestId))?.acceptance.status).toBe('adopted')
    expect((await repository.requestAcceptance(request)).acceptance.status).toBe('adopted')
    await expect(repository.requestAcceptance(input(original, 'reopen', 2))).rejects.toThrow('已处理')
    expect(await store.load('artifactAdoptionEvents')).toHaveLength(1)
  })

  it('ends the original qualification only when the explicit revision message commits', async () => {
    const { store, repository, register, input, revision, userMessage, revise } = await fixture(), original = await register()
    await repository.requestAcceptance(input(original))
    const request = revision(original), message = userMessage(request)
    await expect(store.transaction(async tx => { await tx.put(record('messages', message)); await repository.commitRevision(tx, request, message); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect((await repository.acceptanceState(original.id))?.status).toBe('pending')
    expect(await store.load('artifactRevisionRequests')).toEqual([]); expect(await store.load('messages')).toEqual([])
    await revise(original)
    expect(await repository.acceptanceState(original.id)).toMatchObject({ status: 'revision_requested', revision: 2 })
    await expect(repository.requestAcceptance(input(original, 'reopen', 2))).rejects.toThrow('已处理')
  })

  it('expires another qualified version only in the new linked publication transaction and leaves same-name families alone', async () => {
    const { store, repository, register, input, replacement } = await fixture(), original = await register(), second = await replacement(original), independent = await register('independent')
    await repository.requestAcceptance(input(second, 'queue-v2')); await repository.requestAcceptance(input(independent, 'queue-independent'))
    await expect(replacement(original, 'v3', true)).rejects.toThrow('publication rollback')
    expect((await repository.acceptanceState(second.id))?.status).toBe('pending')
    const third = await replacement(original, 'v3')
    expect(third.contentVersion).toBe(3)
    expect((await repository.acceptanceState(second.id))?.status).toBe('superseded')
    expect((await repository.acceptanceState(independent.id))?.status).toBe('pending')
    expect((await repository.preview(third.id)).acceptance).toBeNull()
    expect(await store.load('artifactAcceptances')).toHaveLength(2)
  })

  it('keeps external changes visible and restores only the still-unhandled exact original after actual verification', async () => {
    const { repository, register, input } = await fixture(), text = '# fixed original\n', original = await register('v1', text), receipt = await repository.requestAcceptance(input(original))
    await writeFile(original.path, '# external\n')
    expect(await repository.acceptanceState(original.id)).toMatchObject({ status: 'unavailable', revision: 2, contentHash: original.contentHash, createdAt: receipt.acceptance.createdAt })
    expect((await repository.acceptanceReceipt('acceptance'))?.acceptance.reason).toContain('外部修改')
    await expect(repository.preview(original.id)).rejects.toThrow('外部修改')
    await writeFile(original.path, text)
    expect(await repository.acceptanceState(original.id)).toMatchObject({ status: 'pending', revision: 3, requestId: 'acceptance', createdAt: receipt.acceptance.createdAt })
    await repository.adopt({ artifactId: original.id, contentHash: original.contentHash, expectedAdoptionRevision: 0, requestId: 'adopt' })
    await repository.recover()
    expect((await repository.acceptanceState(original.id))?.status).toBe('adopted')
  })

  it('invalidates missing originals and changed source authority without returning old text or granting adoption', async () => {
    const { root, store, publication, register, input } = await fixture(), materials = new MaterialRepository(store, root)
    const repository = new ArtifactRepository(store, root, { validateSources: (refs, agent, conversation, tx) => materials.validateRefsInTransaction(tx, refs, agent, conversation) })
    const sourcePath = join(root, 'input.txt'); await writeFile(sourcePath, '真正的材料来源\n')
    const prepared = await materials.prepare({ conversationId: 'chat', path: sourcePath, requestId: 'prepare-material', authorizedAgentIds: ['alice'] })
    const sourceMessage: Message = { id: 'material-message', conversationId: 'chat', senderType: 'user', senderId: 'user', senderName: '本人', content: '材料', status: 'completed', sequence: 1, createdAt: '' }
    await store.transaction(async tx => { await tx.put(record('messages', sourceMessage)); await materials.attach(tx, 'chat', sourceMessage.id, [{ id: prepared.id, revision: prepared.revision }]) })
    const ref = (await materials.read(prepared.id, 'alice', 'chat')).ref
    const original = await store.transaction(async tx => repository.register(tx, { ...await publication(), materialSources: [ref] }, { conversationId: 'chat', revisionRequestId: null, sourceWorkId: null, sourceMessageId: null }))
    await repository.requestAcceptance(input(original))
    await materials.authorize(prepared.id, prepared.revision, [])
    expect((await repository.acceptanceState(original.id))?.status).toBe('unavailable')
    expect((await repository.acceptanceState(original.id))?.reason).toContain('版本')
    await expect(repository.preview(original.id)).rejects.toThrow('版本')
    await expect(repository.adopt({ artifactId: original.id, contentHash: original.contentHash, expectedAdoptionRevision: 0, requestId: 'bad-adopt' })).rejects.toThrow('版本')
    const missing = await register('missing'); await repository.requestAcceptance(input(missing, 'queue-missing')); await unlink(missing.path)
    expect((await repository.acceptanceState(missing.id))?.reason).toContain('文件不存在')
  })

  it('clears private qualifications transactionally and keeps minimal old-key tombstones across re-created originals', async () => {
    const { store, repository, register, input } = await fixture(), original = await register(), request = input(original)
    await repository.requestAcceptance(request)
    await expect(store.transaction(async tx => { await repository.invalidateConversation(tx, 'chat'); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect((await repository.acceptanceState(original.id))?.status).toBe('pending')
    await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    expect(await store.load('artifactAcceptances')).toEqual([])
    const tombstone = (await store.load<{ id: string; conversationId: string; fingerprint: string; cleared: boolean }>('artifactAcceptanceReceipts'))[0]
    expect(Object.keys(tombstone).sort()).toEqual(['cleared', 'conversationId', 'fingerprint', 'id'])
    await expect(repository.acceptanceReceipt('acceptance')).rejects.toThrow('已清理')
    const recreated = await register()
    await expect(repository.requestAcceptance(input(recreated))).rejects.toThrow('已清理')
    expect((await repository.requestAcceptance(input(recreated, 'new-request'))).acceptance.status).toBe('pending')
  })

  it('preserves the unique qualification and receipts in a moved backup without replay and invalidates missing restored bytes', async () => {
    const { root, store, repository, register, input } = await fixture(), original = await register(), request = input(original), first = await repository.requestAcceptance(request)
    const destination = await realpath(await mkdtemp(join(tmpdir(), 'boai-acceptance-restored-'))); roots.push(destination)
    await store.backup(join(destination, 'product.sqlite')); await cp(join(root, 'workspaces'), join(destination, 'workspaces'), { recursive: true })
    const restoredStore = new ProductStore(join(destination, 'product.sqlite')); stores.push(restoredStore); await restoredStore.init()
    const restored = new ArtifactRepository(restoredStore, destination); await restored.recover()
    expect(await restored.requestAcceptance(request)).toEqual(first)
    expect(await restoredStore.load('artifactAcceptances')).toHaveLength(1); expect(await restoredStore.load('artifactAcceptanceReceipts')).toHaveLength(1)
    expect(await restoredStore.load('messages')).toEqual([]); expect(await restoredStore.load('workItems')).toEqual([])
    await unlink(join(destination, 'workspaces/chat', original.managedRelativePath)); await restored.recover()
    expect(await restored.acceptanceState(original.id)).toMatchObject({ status: 'unavailable', contentHash: original.contentHash })
    expect((await repository.acceptanceState(original.id))?.status).toBe('pending')
  })
})
