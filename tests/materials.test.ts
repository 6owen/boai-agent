/*
 * [INPUT]: 真实 ProductStore、宿主私有材料文件和可控文件执行断点。
 * [OUTPUT]: 材料准备幂等/事务回滚/授权隔离/严格文本/取消实际退出/外改保留；未发送草稿重启先撤权/hash 清理、稳定失败/冲突与旧请求不重造；受管根系统别名兼容及仅已发送材料备份与重启核对验证。
 * [POS]: tests/materials.test.ts；离线模块回归，不调用模型或使用假事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Conversation, DigitalAgent } from '../src/shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '../src/shared/domain/materials'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { MaterialRepository } from '../src/runtime/modules/materials/material-repository'
import { materialDirectory, type MaterialCheckpoint } from '../src/runtime/modules/materials/material-files'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const employee = (id: string): DigitalAgent => ({ id, name: id, role: 'writer', instructions: '', color: '', connectionId: 'local', modelId: 'model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
const conversation = (id: string, agentIds = ['alice', 'bob']): Conversation => ({ id, agentIds, kind: 'group', title: id, mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '', updatedAt: '' })
function gate() {
  let release!: () => void, entered!: (id: string) => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const reached = new Promise<string>(resolve => { entered = resolve })
  return { release, entered, waiting, reached }
}
async function fixture(checkpoint?: MaterialCheckpoint) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-materials-'))); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  await store.write([
    ...['alice', 'bob', 'outsider'].map(id => ({ collection: 'agents', id, value: employee(id) })),
    ...['chat', 'other'].map(id => ({ collection: 'conversations', id, value: conversation(id) })),
  ])
  const repository = new MaterialRepository(store, root, { checkpoint })
  const source = join(root, 'report.md'); await writeFile(source, '第一行\r\n第二行\n')
  const prepare = (requestId = 'prepare', authorizedAgentIds = ['alice'], path = source) => repository.prepare({ conversationId: 'chat', path, requestId, authorizedAgentIds })
  const attach = (material: ConversationMaterial, messageId = 'message') => store.transaction(async tx => {
    await tx.put({ collection: 'messages', id: messageId, value: { id: messageId, conversationId: 'chat', content: '' } })
    await repository.attach(tx, 'chat', messageId, [{ id: material.id, revision: material.revision }])
  })
  return { root, store, repository, source, prepare, attach }
}

describe('durable conversation materials', () => {
  it('copies actual UTF-8 content privately, normalizes line mapping, and keeps same-name inputs distinct', async () => {
    const { root, store, repository, source, prepare } = await fixture()
    const secondDirectory = join(root, 'other-source'); await mkdir(secondDirectory)
    const secondSource = join(secondDirectory, 'report.md'); await writeFile(secondSource, '同名的另一份材料')
    const first = await prepare(), second = await prepare('second', ['alice'], secondSource)
    expect(first).toMatchObject({ status: 'ready', format: 'markdown', parseVersion: 'text-v1', lineCount: 3, characterCount: 8, authorizedAgentIds: ['alice'] })
    expect(first.id).not.toBe(second.id)
    expect(first.name).toBe(second.name); expect(first.contentHash).not.toBe(second.contentHash)
    expect(await readFile(join(materialDirectory(root, 'chat', first.id), 'original'), 'utf8')).toBe('第一行\r\n第二行\n')
    expect((await repository.preview(first.id, first.revision)).text).toBe('第一行\n第二行\n')
    expect(JSON.stringify(await store.load('materialPreparations'))).not.toContain(source)
    await expect(readFile(join(root, 'workspaces', 'chat', first.id, 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses one durable preparation identity across SQLite connections and after restart without rereading the source', async () => {
    const { root, store, source, prepare, attach } = await fixture()
    const secondStore = new ProductStore(store.filename); stores.push(secondStore); await secondStore.init()
    const second = new MaterialRepository(secondStore, root)
    const results = await Promise.all([prepare(), second.prepare({ conversationId: 'chat', path: source, requestId: 'prepare', authorizedAgentIds: ['alice'] })])
    expect(results[0].id).toBe(results[1].id)
    expect(await store.load('materials')).toHaveLength(1)
    const current = (await store.load<ConversationMaterial>('materials'))[0]
    expect(current.status).toBe('ready'); await attach(current)
    await rm(source)
    const restored = new MaterialRepository(secondStore, root); await restored.recover()
    expect(await restored.prepare({ conversationId: 'chat', path: source, requestId: 'prepare', authorizedAgentIds: ['alice'] })).toMatchObject({ id: results[0].id, status: 'ready' })
    await expect(restored.prepare({ conversationId: 'chat', path: source, requestId: 'prepare', authorizedAgentIds: ['bob'] })).rejects.toThrow('requestId')
  })

  it.each([
    ['empty.txt', Buffer.from(' \r\n\t'), '没有可供处理'],
    ['invalid.txt', Buffer.from([0xc3, 0x28]), 'UTF-8'],
    ['binary.txt', Buffer.from([0, 1, 2]), '二进制'],
    ['huge.txt', Buffer.alloc(MATERIAL_LIMITS.bytes + 1, 65), '128 KiB'],
    ['long.md', Buffer.from('字'.repeat(MATERIAL_LIMITS.characters + 1)), '16000'],
    ['unsupported.pdf', Buffer.from('PDF'), 'TXT'],
  ])('shows deterministic failure for %s and never makes it readable', async (name, bytes, reason) => {
    const { root, repository, prepare } = await fixture()
    const source = join(root, name); await writeFile(source, bytes)
    const material = await prepare('bad', ['alice'], source)
    expect(material.status).toBe('failed'); expect(material.error).toContain(reason)
    expect(await repository.preparation('bad')).toEqual(material)
    await expect(repository.preview(material.id)).rejects.toThrow()
  })

  it('rejects symlink and hardlink inputs even when the target is valid text', async () => {
    const { root, source, prepare } = await fixture()
    const symbolic = join(root, 'linked.md'), hard = join(root, 'hard.md')
    await symlink(source, symbolic); await link(source, hard)
    expect(await prepare('link', ['alice'], symbolic)).toMatchObject({ status: 'failed' })
    expect(await prepare('hard', ['alice'], hard)).toMatchObject({ status: 'failed' })
    const directory = join(root, 'normal-directory'); await mkdir(directory)
    await writeFile(join(directory, 'nested.md'), 'valid text')
    const linkedDirectory = join(root, 'linked-directory'); await symlink(directory, linkedDirectory)
    expect(await prepare('parent-link', ['alice'], join(linkedDirectory, 'nested.md'))).toMatchObject({ status: 'failed', error: expect.stringContaining('符号链接') })
  })

  it('refuses a source changed after the opened descriptor was read', async () => {
    let source = ''
    const setup = await fixture(async stage => { if (stage === 'source-read') await writeFile(source, 'changed') })
    source = setup.source
    const material = await setup.prepare()
    expect(material).toMatchObject({ status: 'failed' }); expect(material.error).toContain('变化')
    await expect(readFile(join(materialDirectory(setup.root, 'chat', material.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('revalidates real employee authority before ready publication after a preparation delay', async () => {
    const barrier = gate()
    const setup = await fixture(async (stage, id) => { if (stage === 'before-ready') { barrier.entered(id); await barrier.waiting } })
    const preparing = setup.prepare(); await barrier.reached
    await setup.store.write([{ collection: 'agents', id: 'alice', value: { ...employee('alice'), active: false } }])
    barrier.release()
    const material = await preparing
    expect(material).toMatchObject({ status: 'failed' }); expect(material.error).toContain('停用')
    await expect(readFile(join(materialDirectory(setup.root, 'chat', material.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('records cancellation before waiting for actual file exit and cannot publish a late ready result', async () => {
    const barrier = gate()
    const setup = await fixture(async (stage, id) => { if (stage === 'after-write') { barrier.entered(id); await barrier.waiting } })
    const preparing = setup.prepare(), id = await barrier.reached
    const current = (await setup.repository.list('chat')).find(material => material.id === id)!
    let exited = false
    const discard = setup.repository.discard(id, current.revision).then(() => { exited = true })
    for (let count = 0; count < 30 && (await setup.repository.preparation('prepare'))?.status !== 'removed'; count++) await new Promise(resolve => setTimeout(resolve, 5))
    expect(await setup.repository.preparation('prepare')).toMatchObject({ status: 'removed' })
    expect(setup.repository.busy).toBe(true); expect(exited).toBe(false)
    barrier.release(); await discard
    expect(await preparing).toMatchObject({ status: 'removed' }); expect(setup.repository.busy).toBe(false)
    await expect(readFile(join(materialDirectory(setup.root, 'chat', id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('publishes the five-second timeout fence without releasing a file executor that has not exited', async () => {
    const barrier = gate()
    const setup = await fixture(async (stage, id) => { if (stage === 'after-write') { barrier.entered(id); await barrier.waiting } })
    const preparing = setup.prepare(), id = await barrier.reached
    await new Promise(resolve => setTimeout(resolve, MATERIAL_LIMITS.preparationMs + 30))
    expect(await setup.repository.preparation('prepare')).toMatchObject({ status: 'failed', error: expect.stringContaining('五秒') })
    expect(setup.repository.busy).toBe(true)
    expect(await readFile(join(materialDirectory(setup.root, 'chat', id), 'original'), 'utf8')).toBe('第一行\r\n第二行\n')
    barrier.release()
    expect(await preparing).toMatchObject({ status: 'failed' }); expect(setup.repository.busy).toBe(false)
    await expect(readFile(join(materialDirectory(setup.root, 'chat', id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  }, 10_000)

  it('commits message association in the caller SQLite transaction and rolls all links back on failure', async () => {
    const { store, repository, prepare, attach } = await fixture()
    const first = await prepare(), second = await prepare('second')
    await expect(store.transaction(async tx => {
      await tx.put({ collection: 'messages', id: 'failed', value: { id: 'failed', conversationId: 'chat' } })
      await repository.attach(tx, 'chat', 'failed', [{ id: first.id, revision: first.revision }, { id: second.id, revision: second.revision }])
      throw new Error('commit intentionally rejected')
    })).rejects.toThrow('intentionally')
    expect(await store.load('messages')).toHaveLength(0)
    expect((await repository.list('chat')).every(material => !material.messageId)).toBe(true)
    await attach(first)
    expect(await repository.read(first.id, 'alice', 'chat')).toMatchObject({ material: { messageId: 'message' }, text: '第一行\n第二行\n' })
    await expect(repository.discard(first.id, first.revision)).rejects.toThrow('已发送')
  })

  it('rejects stale selections, cross-chat links, duplicate material ids and total text overflow atomically', async () => {
    const { root, store, repository, prepare } = await fixture()
    const source = join(root, 'max.txt'); await writeFile(source, 'a'.repeat(MATERIAL_LIMITS.characters))
    const materials = await Promise.all(['a', 'b', 'c'].map(request => prepare(request, ['alice'], source)))
    const link = (conversationId: string, selections: { id: string; revision: number }[]) => store.transaction(tx => repository.attach(tx, conversationId, 'message', selections))
    await expect(link('other', [materials[0]])).rejects.toThrow('不属于')
    await expect(link('chat', [{ id: materials[0].id, revision: 1 }])).rejects.toThrow('版本')
    await expect(link('chat', [materials[0], materials[0]])).rejects.toThrow('重复')
    await expect(link('chat', materials)).rejects.toThrow('32000')
    expect((await repository.list('chat')).every(material => !material.messageId)).toBe(true)
  })

  it('denies ungranted or new members and invalidates prior reads when explicit grants change', async () => {
    const { store, repository, prepare, attach } = await fixture()
    const material = await prepare(); await attach(material)
    const read = await repository.read(material.id, 'alice', 'chat')
    await expect(repository.read(material.id, 'bob', 'chat')).rejects.toThrow('未获准')
    await store.write([{ collection: 'conversations', id: 'chat', value: conversation('chat', ['alice', 'bob', 'outsider']) }])
    await expect(repository.read(material.id, 'outsider', 'chat')).rejects.toThrow('未获准')
    const grant = await repository.authorize(material.id, material.revision, ['bob'])
    expect(grant.revision).toBeGreaterThan(material.revision)
    await expect(repository.validateRefs([read.ref], 'alice', 'chat')).rejects.toThrow()
    await expect(repository.read(material.id, 'alice', 'chat')).rejects.toThrow('未获准')
    expect(await repository.read(material.id, 'bob', 'chat')).toMatchObject({ text: read.text })
    await expect(repository.authorize(material.id, grant.revision, ['missing'])).rejects.toThrow('不属于')
  })

  it('rejects ACP authorization and fails removed-member reads from authoritative records', async () => {
    const { store, repository, prepare, attach } = await fixture()
    const material = await prepare(); await attach(material)
    await store.write([{ collection: 'agents', id: 'bob', value: { ...employee('bob'), executionBackend: { kind: 'acp-local', profileId: 'profile' } } }])
    await expect(repository.authorize(material.id, material.revision, ['bob'])).rejects.toThrow('ACP')
    await store.write([{ collection: 'conversations', id: 'chat', value: conversation('chat', ['bob']) }])
    await expect(repository.read(material.id, 'alice', 'chat')).rejects.toThrow('不属于')
  })

  it('preserves an external edit during discard and leaves a durable visible cleanup conflict', async () => {
    const { root, store, repository, prepare } = await fixture()
    const material = await prepare(), original = join(materialDirectory(root, 'chat', material.id), 'original')
    await writeFile(original, '用户外部修改')
    await expect(repository.discard(material.id, material.revision)).rejects.toThrow('外部修改')
    expect(await readFile(original, 'utf8')).toBe('用户外部修改')
    expect(await repository.preparation('prepare')).toMatchObject({ status: 'unavailable', authorizedAgentIds: [], error: expect.stringContaining('外部修改') })
    expect(await store.load('materialCleanups')).toMatchObject([{ status: 'conflict' }])
    await new MaterialRepository(store, root).recover()
    expect(await readFile(original, 'utf8')).toBe('用户外部修改')
  })

  it('invalidates access before file cleanup, rolls back the fence with its caller, and cleans via durable logs without metadata', async () => {
    const { root, store, repository, prepare, attach } = await fixture()
    const material = await prepare(); await attach(material)
    await expect(store.transaction(async tx => { await repository.invalidateConversation(tx, 'chat'); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect((await repository.read(material.id, 'alice', 'chat')).material.status).toBe('ready')
    await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    const fenced = (await store.load<ConversationMaterial>('materials'))[0]
    await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    expect((await store.load<ConversationMaterial>('materials'))[0].revision).toBe(fenced.revision)
    await store.transaction(async tx => { await repository.invalidateConversation(tx, 'chat'); await tx.remove('materials', material.id) })
    await expect(repository.read(material.id, 'alice', 'chat')).rejects.toThrow('已清理')
    await repository.cleanupConversation('chat')
    await expect(readFile(join(materialDirectory(root, 'chat', material.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await repository.preparation('prepare')).toBeNull()
    await expect(prepare()).rejects.toThrow('已清理')
  })

  it('only reconciles an interrupted preparation on restart and never reads its vanished external source', async () => {
    const { root, store, source, repository } = await fixture()
    const bytes = Buffer.from('已准备但未发布'), contentHash = createHash('sha256').update(bytes).digest('hex')
    const material: ConversationMaterial = { id: 'interrupted', conversationId: 'chat', name: 'report.md', format: 'markdown', status: 'preparing', size: bytes.length, authorizedAgentIds: ['alice'], revision: 2, contentHash, parseVersion: 'text-v1', createdAt: '' }
    const directory = materialDirectory(root, 'chat', material.id); await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'original'), bytes)
    await store.write([{ collection: 'materials', id: material.id, value: material }]); await rm(source)
    await repository.recover()
    const interrupted = (await repository.list('chat'))[0]
    expect(interrupted).toMatchObject({ status: 'failed', authorizedAgentIds: [], error: expect.stringContaining('重启中断') })
    await expect(readFile(join(directory, 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    await repository.recover()
    expect((await repository.list('chat'))[0]).toEqual(interrupted)
    expect(await store.load('materialCleanups')).toEqual([])
  })

  it('fences unsent ready drafts before hash cleanup and keeps their old request from recreating an original', async () => {
    const barrier = gate()
    let sourceReads = 0, cleanups = 0
    const setup = await fixture(async (stage, id) => {
      if (stage === 'source-opened') sourceReads++
      if (stage === 'before-cleanup') { cleanups++; barrier.entered(id); await barrier.waiting }
    })
    const material = await setup.prepare(), original = join(materialDirectory(setup.root, 'chat', material.id), 'original')
    const receipts = await setup.store.load('materialPreparations'); sourceReads = 0
    const recovery = setup.repository.recover()
    try {
      expect(await barrier.reached).toBe(material.id)
      const fenced = await setup.repository.preparation('prepare')
      expect(fenced).toMatchObject({ id: material.id, status: 'removed', revision: material.revision + 1, authorizedAgentIds: [], error: expect.stringContaining('未发送材料草稿') })
      expect(await readFile(original, 'utf8')).toBe('第一行\r\n第二行\n')
      expect(await setup.store.load('materialCleanups')).toEqual([expect.objectContaining({ id: material.id, status: 'pending', contentHash: material.contentHash })])
      await expect(setup.repository.preview(material.id)).rejects.toThrow('未发送材料草稿')
      await expect(setup.attach(material)).rejects.toThrow('版本已更新')
    } finally { barrier.release() }
    await recovery
    await expect(readFile(original)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await setup.store.load('materialCleanups')).toEqual([])
    expect(await setup.store.load('materialPreparations')).toEqual(receipts)
    const fenced = await setup.repository.preparation('prepare')
    await writeFile(setup.source, '同路径新内容也不能被旧请求重新读取')
    expect(await setup.prepare()).toEqual(fenced)
    await setup.repository.recover()
    expect(await setup.repository.preparation('prepare')).toEqual(fenced)
    expect(await setup.store.load('materials')).toHaveLength(1)
    expect(sourceReads).toBe(0); expect(cleanups).toBe(1)
    await expect(readFile(original)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['ready', 'unavailable'] as const)('retains an externally modified unsent %s draft while revoking access and preserving a stable recovery receipt', async status => {
    const setup = await fixture(), material = await setup.prepare()
    const original = join(materialDirectory(setup.root, 'chat', material.id), 'original')
    await writeFile(original, '用户外部修改，不能删除')
    if (status === 'unavailable') await expect(setup.repository.preview(material.id)).rejects.toThrow('外部修改')
    const current = (await setup.repository.list('chat'))[0]
    await rm(setup.source)
    const restored = new MaterialRepository(setup.store, setup.root)
    await restored.recover()
    const fenced = await restored.preparation('prepare')
    expect(fenced).toMatchObject({ id: material.id, status: 'removed', revision: current.revision + 1, authorizedAgentIds: [], error: expect.stringContaining('未发送材料草稿') })
    expect(await readFile(original, 'utf8')).toBe('用户外部修改，不能删除')
    expect(await setup.store.load('materialCleanups')).toEqual([expect.objectContaining({ id: material.id, status: 'conflict', error: expect.stringContaining('外部修改') })])
    await expect(restored.preview(material.id)).rejects.toThrow('未发送材料草稿')
    await expect(restored.read(material.id, 'alice', 'chat')).rejects.toThrow('未发送材料草稿')
    expect(await restored.prepare({ conversationId: 'chat', path: setup.source, requestId: 'prepare', authorizedAgentIds: ['alice'] })).toEqual(fenced)
    await restored.recover()
    expect(await restored.preparation('prepare')).toEqual(fenced)
    expect(await readFile(original, 'utf8')).toBe('用户外部修改，不能删除')
    expect(await setup.store.load('materials')).toHaveLength(1)
  })

  it('revokes failed drafts once without recreating a completed cleanup log or deleting untracked later files', async () => {
    const setup = await fixture(); await writeFile(setup.source, '')
    const failed = await setup.prepare()
    expect(failed.status).toBe('failed'); expect(await setup.store.load('materialCleanups')).toEqual([])
    const directory = materialDirectory(setup.root, 'chat', failed.id), original = join(directory, 'original')
    await mkdir(directory, { recursive: true }); await writeFile(original, '后写入的外部文件必须保留')
    await setup.repository.recover()
    const fenced = await setup.repository.preparation('prepare')
    expect(fenced).toMatchObject({ id: failed.id, status: 'failed', revision: failed.revision + 1, authorizedAgentIds: [], error: failed.error })
    expect(await setup.store.load('materialCleanups')).toEqual([])
    await setup.repository.recover()
    expect(await setup.repository.preparation('prepare')).toEqual(fenced)
    expect(await setup.prepare()).toEqual(fenced)
    expect(await readFile(original, 'utf8')).toBe('后写入的外部文件必须保留')
  })

  it('validates restored originals at a relocated data root and marks missing or changed files unavailable', async () => {
    const setup = await fixture(), material = await setup.prepare(); await setup.attach(material)
    const restored = await realpath(await mkdtemp(join(tmpdir(), 'boai-materials-restored-'))); roots.push(restored)
    await setup.store.backup(join(restored, 'product.sqlite'))
    const directory = materialDirectory(restored, 'chat', material.id); await mkdir(directory, { recursive: true })
    await copyFile(join(materialDirectory(setup.root, 'chat', material.id), 'original'), join(directory, 'original'))
    const restoredStore = new ProductStore(join(restored, 'product.sqlite')); stores.push(restoredStore); await restoredStore.init()
    const repository = new MaterialRepository(restoredStore, restored); await repository.recover()
    expect((await repository.read(material.id, 'alice', 'chat')).text).toBe('第一行\n第二行\n')
    await writeFile(join(directory, 'original'), 'different'); await repository.recover()
    expect((await repository.list('chat'))[0]).toMatchObject({ status: 'unavailable' })
    await expect(repository.read(material.id, 'alice', 'chat')).rejects.toThrow()
  })

  it('exports only sent ready originals and prunes private drafts while preserving opaque replay tombstones', async () => {
    const setup = await fixture()
    const sent = await setup.prepare('sent'), draft = await setup.prepare('draft'), unavailable = await setup.prepare('unavailable')
    await setup.attach(sent, 'sent-message'); await setup.attach(unavailable, 'unavailable-message')
    const badSource = join(setup.root, 'empty.txt'); await writeFile(badSource, '')
    const failed = await setup.prepare('failed', ['alice'], badSource)
    await writeFile(join(materialDirectory(setup.root, 'chat', unavailable.id), 'original'), '外部修改')
    await expect(setup.repository.preview(unavailable.id)).rejects.toThrow('外部修改')
    const backupRoot = await realpath(await mkdtemp(join(tmpdir(), 'boai-material-backup-'))); roots.push(backupRoot)
    const database = join(backupRoot, 'boai.sqlite'); await setup.store.backup(database)
    await setup.repository.exportSnapshot(backupRoot); await setup.repository.pruneBackup(database)
    const backup = new ProductStore(database); stores.push(backup); await backup.init()
    const materials = await backup.load<ConversationMaterial>('materials')
    expect(materials.map(material => material.id).sort()).toEqual([sent.id, unavailable.id].sort())
    expect(await backup.load('materialCleanups')).toHaveLength(0)
    expect(await backup.load('materialPreparations')).toHaveLength(4)
    for (const material of [draft, failed, unavailable]) await expect(readFile(join(materialDirectory(backupRoot, 'chat', material.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(materialDirectory(backupRoot, 'chat', sent.id), 'original'), 'utf8')).toBe('第一行\r\n第二行\n')
    expect((await setup.repository.list('chat')).some(material => material.id === draft.id)).toBe(true)
    const restored = new MaterialRepository(backup, backupRoot); await restored.recover()
    expect(await restored.read(sent.id, 'alice', 'chat')).toMatchObject({ ref: { revision: sent.revision, contentHash: sent.contentHash }, text: '第一行\n第二行\n' })
    await expect(restored.read(sent.id, 'bob', 'chat')).rejects.toThrow('未获准')
    expect(await restored.preparation('draft')).toBeNull()
    await expect(restored.prepare({ conversationId: 'chat', path: setup.source, requestId: 'draft', authorizedAgentIds: ['alice'] })).rejects.toThrow('已清理')
    expect((await restored.list('chat')).find(material => material.id === unavailable.id)).toMatchObject({ status: 'unavailable' })
  })

  it('does not report a successful snapshot for a changed original or follow a replacement link', async () => {
    const setup = await fixture(), sent = await setup.prepare(); await setup.attach(sent)
    const original = join(materialDirectory(setup.root, 'chat', sent.id), 'original')
    const backupRoot = await realpath(await mkdtemp(join(tmpdir(), 'boai-material-bad-backup-'))); roots.push(backupRoot)
    await setup.store.backup(join(backupRoot, 'boai.sqlite'))
    await writeFile(original, '外部改动')
    await expect(setup.repository.exportSnapshot(backupRoot)).rejects.toThrow('外部修改')
    expect(await readFile(original, 'utf8')).toBe('外部改动')
    // The backup database still says ready; a now-unavailable live record cannot silently skip that required original.
    await expect(setup.repository.exportSnapshot(backupRoot)).rejects.toThrow('版本')
    await expect(readFile(join(materialDirectory(backupRoot, 'chat', sent.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    const linked = await setup.prepare('linked'); await setup.attach(linked, 'linked-message')
    const linkedOriginal = join(materialDirectory(setup.root, 'chat', linked.id), 'original')
    await rm(linkedOriginal); await symlink(setup.source, linkedOriginal)
    const linkBackupRoot = await realpath(await mkdtemp(join(tmpdir(), 'boai-material-link-backup-'))); roots.push(linkBackupRoot)
    await setup.store.backup(join(linkBackupRoot, 'boai.sqlite'))
    await expect(setup.repository.exportSnapshot(linkBackupRoot)).rejects.toThrow('符号链接')
    expect(await readFile(setup.source, 'utf8')).toBe('第一行\r\n第二行\n')
  })

  it('keeps preparation and backup gates mutually exclusive until the actual copy exits', async () => {
    const barrier = gate(); let exporting = false
    const setup = await fixture(async (stage, id) => { if (exporting && stage === 'before-write') { barrier.entered(id); await barrier.waiting } })
    const sent = await setup.prepare(); await setup.attach(sent)
    const backupRoot = await realpath(await mkdtemp(join(tmpdir(), 'boai-material-gated-backup-'))); roots.push(backupRoot)
    await setup.store.backup(join(backupRoot, 'boai.sqlite'))
    exporting = true
    const backup = setup.repository.exportSnapshot(backupRoot); await barrier.reached
    expect(setup.repository.busy).toBe(true)
    await expect(setup.prepare('during-backup')).rejects.toThrow('备份')
    await expect(setup.repository.authorize(sent.id, sent.revision, ['bob'])).rejects.toThrow('备份')
    await expect(setup.store.transaction(tx => setup.repository.invalidateConversation(tx, 'chat'))).rejects.toThrow('备份')
    barrier.release(); await backup
    expect(setup.repository.busy).toBe(false)
    const preparingBarrier = gate()
    const active = new MaterialRepository(setup.store, setup.root, { checkpoint: async (stage, id) => { if (stage === 'source-opened') { preparingBarrier.entered(id); await preparingBarrier.waiting } } })
    const preparing = active.prepare({ conversationId: 'chat', path: setup.source, requestId: 'active-prepare', authorizedAgentIds: ['alice'] }); await preparingBarrier.reached
    await expect(active.exportSnapshot(backupRoot)).rejects.toThrow('准备')
    preparingBarrier.release(); await preparing
  })

  it('never prunes the live database or a link that aliases it', async () => {
    const setup = await fixture(), draft = await setup.prepare()
    await expect(setup.repository.pruneBackup(setup.store.filename)).rejects.toThrow('正在使用')
    const alias = join(setup.root, 'database-link.sqlite'); await symlink(setup.store.filename, alias)
    await expect(setup.repository.pruneBackup(alias)).rejects.toThrow('符号链接')
    expect((await setup.repository.list('chat'))[0]).toMatchObject({ id: draft.id, status: 'ready' })
  })

  it('canonicalizes only host-managed roots while retaining strict source and managed-descendant link checks', async () => {
    const setup = await fixture(), managedAlias = join(setup.root, 'host-root-alias')
    await symlink(setup.root, managedAlias)
    const repository = new MaterialRepository(setup.store, managedAlias)
    const sent = await repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'managed-alias', authorizedAgentIds: ['alice'] })
    expect(sent.status).toBe('ready'); await setup.attach(sent)
    expect((await repository.read(sent.id, 'alice', 'chat')).text).toBe('第一行\n第二行\n')
    const refusedSource = await repository.prepare({ conversationId: 'chat', path: join(managedAlias, 'report.md'), requestId: 'source-alias', authorizedAgentIds: ['alice'] })
    expect(refusedSource).toMatchObject({ status: 'failed', error: expect.stringContaining('符号链接') })
    const backupRoot = await mkdtemp(join(tmpdir(), 'boai-material-alias-backup-')); roots.push(backupRoot)
    const backupAlias = join(setup.root, 'host-backup-alias'); await symlink(backupRoot, backupAlias)
    await setup.store.backup(join(backupRoot, 'boai.sqlite'))
    await repository.exportSnapshot(backupAlias); await repository.pruneBackup(join(backupAlias, 'boai.sqlite'))
    expect(await readFile(join(materialDirectory(backupRoot, 'chat', sent.id), 'original'), 'utf8')).toBe('第一行\r\n第二行\n')
    await expect(repository.pruneBackup(join(managedAlias, 'product.sqlite'))).rejects.toThrow('正在使用')
    const materials = join(setup.root, 'materials'); await rm(materials, { recursive: true })
    const otherRoot = join(setup.root, 'foreign-materials'); await mkdir(otherRoot); await symlink(otherRoot, materials)
    const refusedDestination = await repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'destination-alias', authorizedAgentIds: ['alice'] })
    expect(refusedDestination).toMatchObject({ status: 'unavailable', error: expect.stringContaining('符号链接') })
    await expect(readFile(join(otherRoot, 'chat', refusedDestination.id, 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(repository.exportSnapshot(backupAlias)).rejects.toThrow()
  })

  it('backs up an empty materials collection using the host temporary root without requiring a materials directory', async () => {
    const setup = await fixture(), backupRoot = await mkdtemp(join(tmpdir(), 'boai-material-empty-backup-')); roots.push(backupRoot)
    await setup.store.backup(join(backupRoot, 'boai.sqlite'))
    await setup.repository.exportSnapshot(backupRoot); await setup.repository.pruneBackup(join(backupRoot, 'boai.sqlite'))
    const backup = new ProductStore(join(backupRoot, 'boai.sqlite')); stores.push(backup); await backup.init()
    expect(await backup.load('materials')).toEqual([])
    await expect(readFile(join(backupRoot, 'materials'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
