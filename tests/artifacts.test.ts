/*
 * [OUTPUT]: 新增真实PDF核源字节、错误hash/外改拒绝与不能作为文本采用的验证。
 * [OUTPUT]: 新增发布准备身份/事务回滚与提交消耗、缺失/未改/外改原件清理边界的真实SQLite验证。
 * [INPUT]: 真实 ProductStore 事务、受管成果原件与明确本人修订/采用请求。
 * [OUTPUT]: 受控群bobo未选模型的修订目标复用有效默认；显式失效选择拒绝、不影响普通员工。
 * [OUTPUT]: 成果复制到登记的外改拒绝、独立内容身份/版本、Markdown/代码/纯文本原文预览与二进制/编码/容量隔离、修订消息原子绑定/负责人边界、跨连接幂等采用与真实回执写失败整体回滚、来源撤权、hash 清理和迁移恢复仅核对验证。
 * [POS]: tests/artifacts.test.ts；离线持久化回归，不调用模型，不使用假事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cp, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import type { Conversation, DigitalAgent, Message, WorkItem } from '../src/shared/domain'
import { ARTIFACT_LIMITS, type ArtifactAdoptionInput, type ArtifactPublication, type ArtifactRegistration, type ArtifactRevisionInput, type ArtifactRevisionRequest, type ArtifactVersion } from '../src/shared/domain/artifacts'
import type { MaterialReadRef } from '../src/shared/domain/materials'
import { FILE_PREVIEW_LIMITS } from '../src/shared/domain/file-preview'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ArtifactRepository } from '../src/runtime/modules/workspaces/artifact-repository'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
const employee = (id: string): DigitalAgent => ({ id, name: id, role: 'writer', instructions: '', color: '', connectionId: 'local', modelId: 'model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
const chat = (id: string): Conversation => ({ id, agentIds: ['alice', 'bob'], kind: 'group', title: id, mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '', updatedAt: '' })
const message = (id: string, content = '请补充对比'): Message => ({ id, conversationId: 'chat', senderType: 'user', senderId: 'user', senderName: '本人', content, sequence: 1, createdAt: '', status: 'completed' })
const work = (id: string, sourceMessageId = 'original-message'): WorkItem => ({ schemaVersion: 2, id, conversationId: 'chat', sourceMessageId, key: id, scope: '报告', deliverable: '可检查报告', ownerAgentId: 'alice', version: 1, status: 'running', budgetId: `budget-${id}`, rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: '', updatedAt: '' })
const binding = (patch: Partial<ArtifactRegistration> = {}): ArtifactRegistration => ({ conversationId: 'chat', revisionRequestId: null, sourceWorkId: null, sourceMessageId: null, ...patch })
type Options = ConstructorParameters<typeof ArtifactRepository>[2]

async function fixture(options: Options = {}) {
  const rawRoot = await mkdtemp(join(tmpdir(), 'boai-artifacts-')), root = await realpath(rawRoot); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  await store.write([
    ...['alice', 'bob', 'outsider'].map(id => ({ collection: 'agents', id, value: employee(id) })),
    ...['chat', 'other'].map(id => ({ collection: 'conversations', id, value: chat(id) })),
    { collection: 'connections', id: 'local', value: { id: 'local', provider: 'openai-compatible', name: 'local', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'model', hasApiKey: false } },
  ])
  const repository = new ArtifactRepository(store, rawRoot, options)
  const publication = async (id = 'original', text: string | Buffer = '# 原版\r\n第一行\n', name = '报告.md'): Promise<ArtifactPublication> => {
    const directory = join(root, 'workspaces', 'chat', 'artifacts', id); await mkdir(directory, { recursive: true })
    const path = join(directory, name); await writeFile(path, text)
    return { id, conversationId: 'chat', contentHash: hash(text), name, path, size: Buffer.byteLength(text), ownerAgentId: 'alice' }
  }
  const register = async (id = 'original', text: string | Buffer = '# 原版\r\n第一行\n', name = '报告.md') => {
    const input = await publication(id, text, name)
    return store.transaction(tx => repository.register(tx, input, binding()))
  }
  const revise = async (artifact: ArtifactVersion, requestId = 'revision', messageId = 'revision-message', targetAgentId = 'alice') => {
    const input: ArtifactRevisionInput = { conversationId: 'chat', artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId, content: '请补充对比', requestId }
    const committed = message(messageId, input.content)
    const request = await store.transaction(async tx => { await tx.put({ collection: 'messages', id: committed.id, value: committed }); return repository.commitRevision(tx, input, committed) })
    return { input, request, committed }
  }
  const revised = async (artifact: ArtifactVersion, id = 'new-version', requestId = 'revision') => {
    const revision = await revise(artifact, requestId, `message-${requestId}`), rootWork = { ...work(`work-${requestId}`, revision.request.messageId), revisionRequestId: requestId }
    await store.write([
      { collection: 'artifactRevisionRequests', id: requestId, value: { ...revision.request, rootWorkId: rootWork.id } },
      { collection: 'workItems', id: rootWork.id, value: rootWork },
    ])
    const input = await publication(id, `# 新版 ${id}\n`)
    const result = await store.transaction(tx => repository.register(tx, input, binding({ revisionRequestId: requestId, sourceWorkId: rootWork.id })))
    return { artifact: result, revision, rootWork }
  }
  const adoption = (artifact: ArtifactVersion, requestId = 'adoption', expectedAdoptionRevision = 0): ArtifactAdoptionInput => ({ artifactId: artifact.id, contentHash: artifact.contentHash, expectedAdoptionRevision, requestId })
  return { root, rawRoot, store, repository, publication, register, revise, revised, adoption }
}

describe('binary preview preserves artifact identity', () => {
  it('returns checked bytes without turning preview into adoption or model text', async () => {
    const { store, repository, register } = await fixture(), bytes = Buffer.from('%PDF-1.4\nchecked binary')
    const artifact = await register('pdf-preview', bytes, 'report.pdf')
    const result = await repository.preview(artifact.id, artifact.contentHash)
    expect(result.binaryPreview).toEqual({ kind: 'pdf', bytes: Uint8Array.from(bytes) }); expect(result.text).toBe('')
    expect(result.filePreview?.kind).toBe('unsupported'); expect(await store.load('artifactAdoptionEvents')).toEqual([])
    await expect(repository.preview(artifact.id, '0'.repeat(64))).rejects.toThrow('身份')
    await writeFile(artifact.path, '%PDF-1.4\nchanged binary')
    await expect(repository.preview(artifact.id, artifact.contentHash)).rejects.toThrow('外部修改')
  })
})

describe('durable artifact identity and explicit user decisions', () => {
  it('binds a pending copy to its original publication and removes that reservation only with the artifact commit', async () => {
    const { store, repository, publication } = await fixture(), input = await publication()
    await rm(input.path)
    await store.transaction(tx => repository.preparePublication(tx, input, binding()))
    await writeFile(input.path, '# 原版\r\n第一行\n')
    await expect(store.transaction(tx => repository.registerLegacy(tx, input, 'chat'))).rejects.toThrow('未提交')
    await expect(store.transaction(tx => repository.register(tx, { ...input, ownerAgentId: 'bob' }, binding()))).rejects.toThrow('发布身份不一致')
    await expect(store.transaction(tx => repository.preparePublication(tx, { ...input, name: 'another.md' }, binding()))).rejects.toThrow('不同内容或来源')
    await expect(store.transaction(async tx => { await repository.register(tx, input, binding()); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await store.load('artifacts')).toEqual([])
    expect(await store.load('artifactPublicationIntents')).toHaveLength(1)
    const committed = await store.transaction(tx => repository.register(tx, input, binding()))
    expect(committed).toMatchObject({ id: input.id, contentHash: input.contentHash, registrationSource: 'publication' })
    expect(await store.load('artifactPublicationIntents')).toEqual([])
  })

  it.each(['unchanged', 'missing', 'external-edit'])('cleans an interrupted %s copy without adopting or overwriting it', async state => {
    const { store, repository, publication } = await fixture(), input = await publication()
    await rm(input.path)
    await store.transaction(tx => repository.preparePublication(tx, input, binding()))
    if (state !== 'missing') await writeFile(input.path, state === 'unchanged' ? '# 原版\r\n第一行\n' : '保留外部编辑')
    await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    expect(await store.load('artifacts')).toEqual([])
    expect(await store.load('artifactPublicationIntents')).toEqual([])
    if (state === 'external-edit') {
      await expect(repository.cleanupConversation('chat')).rejects.toThrow('外部修改')
      expect(await readFile(input.path, 'utf8')).toBe('保留外部编辑')
      expect(await store.load('artifactCleanups')).toEqual([expect.objectContaining({ id: input.id, status: 'conflict' })])
    } else {
      await repository.cleanupConversation('chat')
      await expect(readFile(input.path)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await store.load('artifactCleanups')).toEqual([])
    }
  })

  it('preserves exact Markdown and gives same-name originals independent identities without trusting model chain fields', async () => {
    const { store, repository, publication, register } = await fixture()
    const first = await register(), input = { ...await publication('second', '# 另一份\n'), logicalArtifactId: first.id, contentVersion: 9, previousArtifactId: first.id, requiresReview: true }
    const second = await store.transaction(tx => repository.register(tx, input, binding()))
    expect(first.name).toBe(second.name); expect(first.contentHash).not.toBe(second.contentHash)
    expect(second).toMatchObject({ logicalArtifactId: 'second', contentVersion: 1, registrationSource: 'publication' })
    expect(second).not.toHaveProperty('previousArtifactId'); expect(second).not.toHaveProperty('requiresReview')
    const preview = await repository.preview(first.id, first.contentHash)
    expect(preview.text).toBe('# 原版\r\n第一行\n'); expect(preview.artifact.contentHash).toBe(hash(preview.text))
    expect(preview.versions).toHaveLength(1); expect(preview.adoption).toMatchObject({ revision: 0, current: null, events: [] })
  })

  it('publishes only inside a real commit and accepts the same host identity once', async () => {
    const { store, repository, publication } = await fixture(), input = await publication()
    await expect(store.transaction(async tx => { await repository.register(tx, input, binding()); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await store.load('artifacts')).toHaveLength(0)
    const first = await store.transaction(tx => repository.register(tx, input, binding()))
    expect(await store.transaction(tx => repository.register(tx, input, binding()))).toEqual(first)
    await writeFile(input.path, 'changed')
    await expect(store.transaction(tx => repository.register(tx, input, binding()))).rejects.toThrow('外部修改')
    expect(await store.load('artifacts')).toHaveLength(1)
    await expect(store.transaction(tx => repository.register(tx, { ...input, id: 'cross-chat' }, binding({ conversationId: 'other' })))).rejects.toThrow('聊天不一致')
  })

  it('preserves a UTF-8 BOM and line endings as original Markdown rather than silently rewriting preview text', async () => {
    const { repository, register } = await fixture(), text = '\ufeff# 原文\r\n正文\r\n', artifact = await register('bom', text)
    expect((await repository.preview(artifact.id)).text).toBe(text)
    expect(artifact.contentHash).toBe(hash(text))
  })

  it('keeps ACP publication compatible while only API members can receive a new revision', async () => {
    const { store, repository, register } = await fixture()
    await store.write([{ collection: 'agents', id: 'alice', value: { ...employee('alice'), executionBackend: { kind: 'acp-local', command: '/local/acp', args: [] } } }])
    const artifact = await register()
    const input = { conversationId: 'chat', artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: 'alice', content: '修订', requestId: 'rev' }
    await expect(repository.prepareRevision(input)).rejects.toThrow('ACP')
    expect(await repository.prepareRevision({ ...input, targetAgentId: 'bob' })).toMatchObject({ artifact: { id: artifact.id } })
  })

  it.each([
    ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 'UTF-8'],
    ['binary controls', Buffer.from([0, 1, 2]), '二进制'],
    ['byte limit', Buffer.alloc(ARTIFACT_LIMITS.previewBytes + 1, 65), '1 MiB'],
    ['character limit', Buffer.from('字'.repeat(ARTIFACT_LIMITS.previewCharacters + 1)), '200000'],
    ['line limit', Buffer.from('\n'.repeat(FILE_PREVIEW_LIMITS.lines)), '10000 行'],
  ])('retains %s as a checked original with an explicit unsupported preview and no adoption', async (_name, bytes, reason) => {
    const { repository, register, adoption } = await fixture(), artifact = await register('invalid', bytes)
    expect(artifact).toMatchObject({ contentStatus: 'unsupported', contentError: expect.stringContaining(reason), contentHash: hash(bytes) })
    expect(await repository.preview(artifact.id)).toMatchObject({ text: '', filePreview: { kind: 'unsupported', text: '', reason: expect.stringContaining(reason) } })
    await expect(repository.adopt(adoption(artifact))).rejects.toThrow(reason)
    expect((await repository.list('chat'))[0].contentStatus).toBe('unsupported')
  })

  it('records a hash for other formats but requires external opening and refuses adoption', async () => {
    const { repository, register, adoption } = await fixture(), artifact = await register('pdf', '%PDF fixture', '报告.pdf')
    expect(artifact).toMatchObject({ contentStatus: 'unsupported', contentHash: hash('%PDF fixture') })
    expect(await repository.preview(artifact.id)).toMatchObject({ text: '', filePreview: { kind: 'unsupported', text: '', reason: expect.stringContaining('外部打开') } })
    await expect(repository.adopt(adoption(artifact))).rejects.toThrow('外部打开')
    expect((await repository.list('chat'))[0].contentStatus).toBe('unsupported')
  })

  it.each([
    ['module.tsx', 'export const Page = () => <h1>你好</h1>\r\n', 'code', 'tsx'],
    ['page.html', '<script>globalThis.unsafe = true</script>', 'code', 'html'],
    ['image.svg', '<svg onload="alert(1)"></svg>', 'code', 'xml'],
    ['notes.unknown', '原文\r\n第二行\n', 'text', undefined],
    ['empty.txt', '', 'text', undefined],
  ])('previews and adopts checked %s without expanding body search formats', async (name, text, kind, language) => {
    const { repository, register, adoption, store } = await fixture(), artifact = await register('text-file', text, name)
    expect(artifact.contentStatus).toBe('ready')
    expect(await repository.preview(artifact.id, artifact.contentHash)).toMatchObject({ artifact: { contentHash: hash(text) }, text, filePreview: { kind, text, ...(language ? { language } : {}) } })
    const receipt = await repository.adopt(adoption(artifact))
    expect(receipt.contentHash).toBe(hash(text))
    expect((await repository.preview(artifact.id)).adoption.current?.artifactId).toBe(artifact.id)
    if (!name.endsWith('.txt')) await expect(store.transaction(tx => repository.readSearchText(tx, artifact.id, artifact.contentHash))).rejects.toThrow('仅支持 TXT 和 Markdown')
  })

  it('restores preview support for a legacy code artifact but still checks its immutable hash', async () => {
    const { repository, register, store } = await fixture(), artifact = await register('legacy-code', 'export const x = 1', 'module.ts')
    await store.write([{ collection: 'artifacts', id: artifact.id, value: { ...artifact, contentStatus: 'unsupported', contentError: '首批仅支持 Markdown 预览和采用' } }])
    const preview = await repository.preview(artifact.id, artifact.contentHash)
    expect(preview.artifact).toMatchObject({ contentStatus: 'ready', contentHash: artifact.contentHash })
    expect(preview.artifact.contentError).toBeUndefined()
    await writeFile(artifact.path, 'export const x = 2')
    await expect(repository.preview(artifact.id, artifact.contentHash)).rejects.toThrow('外部修改')
    expect((await repository.list('chat'))[0].contentStatus).toBe('unavailable')
  })

  it('rejects escaped, linked-parent, final-link and hardlinked publication files without records', async () => {
    const { root, store, repository, publication } = await fixture(), input = await publication()
    const external = join(root, 'external.md'); await writeFile(external, '# external')
    const symbolic = join(root, 'workspaces', 'chat', 'artifacts', 'symbolic.md'); await symlink(input.path, symbolic)
    const hard = join(root, 'workspaces', 'chat', 'artifacts', 'hard.md'); await link(input.path, hard)
    const directory = join(root, 'source'); await mkdir(directory); await writeFile(join(directory, 'child.md'), '# child')
    const parent = join(root, 'workspaces', 'chat', 'artifacts', 'linked-parent'); await symlink(directory, parent)
    for (const [id, path] of [['external', external], ['symbolic', symbolic], ['hard', hard], ['parent', join(parent, 'child.md')]]) await expect(store.transaction(tx => repository.register(tx, { ...input, id, path }, binding()))).rejects.toThrow()
    expect(await store.load('artifacts')).toHaveLength(0)
    await rm(hard)
    await writeFile(input.path, Buffer.alloc(ARTIFACT_LIMITS.publicationBytes + 1))
    await expect(store.transaction(tx => repository.register(tx, input, binding()))).rejects.toThrow('20 MiB')
  })

  it('detects original mutation between descriptor read and publication instead of blessing the new bytes', async () => {
    let path = ''
    const { store, repository, publication } = await fixture({ checkpoint: async stage => { if (stage === 'after-read') await writeFile(path, '# changed') } })
    const input = await publication(); path = input.path
    await expect(store.transaction(tx => repository.register(tx, input, binding()))).rejects.toThrow('读取时已改变')
    expect(await store.load('artifacts')).toHaveLength(0)
  })

  it('rejects post-copy mutation before host registration rather than adopting external bytes as model output', async () => {
    const { store, repository, publication } = await fixture(), input = await publication()
    await expect(store.transaction(tx => repository.register(tx, { ...input, contentHash: undefined }, binding()))).rejects.toThrow('复制时')
    await writeFile(input.path, '# 发布后的外部修改\n')
    await expect(store.transaction(tx => repository.register(tx, input, binding()))).rejects.toThrow('发布后已被外部修改')
    expect(await store.load('artifacts')).toHaveLength(0)
    expect(await readFile(input.path, 'utf8')).toBe('# 发布后的外部修改\n')
  })

  it('persists external mutation and missing originals as visible unavailable versions without changing hashes', async () => {
    const { store, repository, register, adoption } = await fixture(), first = await register(), second = await register('missing')
    await writeFile(first.path, '# external change'); await rm(second.path)
    await expect(repository.preview(first.id)).rejects.toThrow('外部修改')
    await expect(repository.adopt(adoption(first))).rejects.toThrow('外部修改')
    const versions = await repository.list('chat')
    expect(versions).toHaveLength(2); expect(versions.every(value => value.contentStatus === 'unavailable')).toBe(true)
    expect(versions.find(value => value.id === first.id)?.contentHash).toBe(first.contentHash)
    expect((await store.load('artifactAdoptionEvents'))).toHaveLength(0)
  })

  it('controls historical registration with stable IDs and no inferred chain or hidden missing/link originals', async () => {
    const { root, store, repository, publication } = await fixture(), a = await publication('old-one'), b = await publication('old-two', '# different')
    const one = await store.transaction(tx => repository.registerLegacy(tx, { ...a, id: undefined, previousArtifactId: 'forged' } as ArtifactPublication, 'chat'))
    const again = await store.transaction(tx => repository.registerLegacy(tx, { ...a, id: undefined }, 'chat'))
    const two = await store.transaction(tx => repository.registerLegacy(tx, { ...b, id: undefined }, 'chat'))
    expect(again.id).toBe(one.id); expect(one.logicalArtifactId).not.toBe(two.logicalArtifactId)
    expect(one).toMatchObject({ registrationSource: 'legacy_verified', contentVersion: 1 }); expect(one).not.toHaveProperty('previousArtifactId')
    const missing = { ...await publication('missing'), id: undefined }; await rm(missing.path)
    const absent = await store.transaction(tx => repository.registerLegacy(tx, missing, 'chat'))
    expect(absent).toMatchObject({ contentStatus: 'unavailable', contentHash: '', contentError: expect.stringContaining('不存在') })
    const linked = join(root, 'workspaces', 'chat', 'artifacts', 'old-linked.md'); await symlink(a.path, linked)
    const unavailable = await store.transaction(tx => repository.registerLegacy(tx, { name: 'old-linked.md', path: linked, size: 0 }, 'chat'))
    expect(unavailable).toMatchObject({ contentStatus: 'unavailable', contentError: expect.stringContaining('符号链接') })
    expect(await repository.list('chat')).toHaveLength(4)
  })

  it('commits revisions only with their exact fixed-user message and durable stable payload identity', async () => {
    const { store, repository, register } = await fixture(), artifact = await register()
    const input: ArtifactRevisionInput = { conversationId: 'chat', artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: 'alice', content: '请补充对比', requestId: 'revision' }, committed = message('rev-message')
    await expect(store.transaction(tx => repository.commitRevision(tx, input, committed))).rejects.toThrow('同事务')
    await expect(store.transaction(async tx => { await tx.put({ collection: 'messages', id: committed.id, value: committed }); await repository.commitRevision(tx, input, committed); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await store.load('messages')).toHaveLength(0); expect(await repository.revisionReceipt(input.requestId)).toBeNull()
    const request = await store.transaction(async tx => { await tx.put({ collection: 'messages', id: committed.id, value: committed }); return repository.commitRevision(tx, input, committed) })
    expect(await repository.revisionForMessage(committed.id)).toEqual(request)
    const reordered = { requestId: input.requestId, content: input.content, targetAgentId: input.targetAgentId, contentHash: input.contentHash, artifactId: input.artifactId, conversationId: input.conversationId }
    expect((await repository.prepareRevision(reordered)).request).toEqual(request)
    expect(await store.transaction(tx => repository.commitRevision(tx, reordered, committed))).toEqual(request)
    await expect(repository.prepareRevision({ ...input, content: '另一个请求' })).rejects.toThrow('不同内容')
    await expect(store.transaction(tx => repository.commitRevision(tx, input, { ...committed, id: 'another-message' }))).rejects.toThrow('唯一用户消息')
    await store.write([{ collection: 'messages', id: committed.id, value: { ...committed, content: '篡改要求' } }])
    await expect(repository.revisionReceipt(input.requestId)).rejects.toThrow('本人消息不一致')
  })

  it('requires an explicitly valid current revision target even when the original author disappears', async () => {
    const { store, repository, register } = await fixture(), artifact = await register()
    await store.write([{ collection: 'agents', id: 'alice', value: { ...employee('alice'), active: false } }])
    const input = { conversationId: 'chat', artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: 'alice', content: '修订', requestId: 'rev' }
    await expect(repository.prepareRevision(input)).rejects.toThrow('明确选择')
    await expect(repository.prepareRevision({ ...input, targetAgentId: 'outsider' })).rejects.toThrow('明确选择')
    expect((await repository.prepareRevision({ ...input, targetAgentId: 'bob' })).input.targetAgentId).toBe('bob')
    await store.write([{ collection: 'connections', id: 'local', value: { id: 'local', provider: 'openai-compatible', defaultModel: 'model' } }])
    await expect(repository.prepareRevision({ ...input, targetAgentId: 'bob' })).rejects.toThrow('API 模型')
  })

  it('gives explicit revisions new root work identities and unique family versions while preserving original delivery and adoption', async () => {
    const { store, repository, register, revised, adoption } = await fixture(), original = await register()
    const delivered = { ...work('old-work'), status: 'delivered', resultVersion: 7, requiresReview: true, artifactIds: [original.id] }
    await store.write([{ collection: 'workItems', id: delivered.id, value: delivered }, { collection: 'workBudgets', id: delivered.budgetId, value: { id: delivered.budgetId, tokens: 99 } }])
    await repository.adopt(adoption(original))
    const second = await revised(original, 'second', 'revision-a'), branch = await revised(original, 'third', 'revision-b')
    expect(second.artifact).toMatchObject({ logicalArtifactId: original.id, previousArtifactId: original.id, contentVersion: 2, sourceWorkId: second.rootWork.id })
    expect(branch.artifact).toMatchObject({ logicalArtifactId: original.id, previousArtifactId: original.id, contentVersion: 3 })
    expect(second.artifact).not.toHaveProperty('requiresReview'); expect(second.artifact).not.toHaveProperty('resultVersion')
    const preview = await repository.validateRevision(second.revision.request.id, 'alice', 'chat')
    expect(preview.text).toBe('# 原版\r\n第一行\n'); expect(preview.versions.map(value => value.contentVersion)).toEqual([1, 2, 3])
    expect((await repository.preview(second.artifact.id)).adoption.current?.artifactId).toBe(original.id)
    expect((await store.load('workItems')).find((value: unknown) => (value as WorkItem).id === delivered.id)).toEqual(delivered)
    expect(await store.load('workBudgets')).toEqual([{ id: delivered.budgetId, tokens: 99 }])
  })

  it('refuses replacement publication from a child, another root, wrong actor or rebound source message', async () => {
    const { store, repository, register, revise, publication } = await fixture(), original = await register(), revision = await revise(original), input = await publication('new')
    const root = { ...work('new-root', revision.request.messageId), revisionRequestId: revision.request.id }
    await store.write([{ collection: 'artifactRevisionRequests', id: revision.request.id, value: { ...revision.request, rootWorkId: root.id } }])
    for (const invalid of [{ ...root, parentWorkId: 'parent' }, { ...root, id: 'another-root' }, { ...root, ownerAgentId: 'bob' }, { ...root, sourceMessageId: 'old-message' }]) {
      await store.write([{ collection: 'workItems', id: invalid.id, value: invalid }])
      await expect(store.transaction(tx => repository.register(tx, input, binding({ revisionRequestId: revision.request.id, sourceWorkId: invalid.id })))).rejects.toThrow()
    }
    expect(await store.load('artifacts')).toHaveLength(1)
    await expect(repository.validateRevision(revision.request.id, 'bob', 'chat')).rejects.toThrow('获准负责人')
  })

  it.each(['report.md', 'report.ts'])('uses the supplied same-transaction material authority for all %s stages and does not invent grants', async name => {
    const refs: MaterialReadRef[] = [{ id: 'material', revision: 1, contentHash: 'a'.repeat(64), parseVersion: 'text-v1', conversationId: 'chat' }]
    const { store, root, publication } = await fixture()
    await store.write([{ collection: 'materials', id: 'material', value: { id: 'material', conversationId: 'chat', revision: 1, contentHash: refs[0].contentHash, authorizedAgentIds: ['alice'] } }])
    const calls: string[] = [], repository = new ArtifactRepository(store, root, { validateSources: async (sources, agentId, conversationId, tx) => {
      calls.push(agentId ?? 'user')
      for (const ref of sources) { const current = await tx.get<{ revision: number; contentHash: string; authorizedAgentIds: string[]; conversationId: string }>('materials', ref.id); if (!current || current.conversationId !== conversationId || current.revision !== ref.revision || current.contentHash !== ref.contentHash || agentId && !current.authorizedAgentIds.includes(agentId)) throw new Error('材料来源当前未授权') }
    } })
    const input = { ...await publication('original', '# 原版\n', name), materialSources: refs }, original = await store.transaction(tx => repository.register(tx, input, binding()))
    await expect(new ArtifactRepository(store, root).preview(original.id)).rejects.toThrow('尚未接入')
    await expect(repository.preview(original.id, original.contentHash, 'bob')).rejects.toThrow('未授权')
    expect((await repository.preview(original.id, original.contentHash, 'alice')).text).toContain('原版')
    const revisionInput: ArtifactRevisionInput = { conversationId: 'chat', artifactId: original.id, contentHash: original.contentHash, targetAgentId: 'alice', content: '请补充对比', requestId: 'rev' }, committed = message('revision')
    await store.transaction(async tx => { await tx.put({ collection: 'messages', id: committed.id, value: committed }); await repository.commitRevision(tx, revisionInput, committed) })
    expect((await repository.validateRevision('rev', 'alice', 'chat')).text).toBe('# 原版\n')
    await expect(repository.validateRevision('rev', 'bob', 'chat')).rejects.toThrow('获准负责人')
    await store.write([{ collection: 'materials', id: 'material', value: { id: 'material', conversationId: 'chat', revision: 2, contentHash: refs[0].contentHash, authorizedAgentIds: [] } }])
    await expect(repository.preview(original.id)).rejects.toThrow('未授权')
    await expect(repository.validateRevision('rev', 'alice', 'chat')).rejects.toThrow('未授权')
    await expect(repository.adopt({ artifactId: original.id, contentHash: original.contentHash, requestId: 'adopt', expectedAdoptionRevision: 0 })).rejects.toThrow('未授权')
    expect(await store.load('artifactAdoptionEvents')).toHaveLength(0); expect(calls).toContain('alice'); expect(calls).toContain('user')
  })

  it('makes adoption one conditional SQLite event across connections, with stable receipts and explicit current changes', async () => {
    const { root, store, repository, register, revised, adoption } = await fixture(), original = await register()
    const secondStore = new ProductStore(store.filename); stores.push(secondStore); await secondStore.init()
    const secondRepository = new ArtifactRepository(secondStore, root)
    const receipts = await Promise.all([repository.adopt(adoption(original)), secondRepository.adopt(adoption(original))])
    expect(receipts[0]).toEqual(receipts[1]); expect(await store.load('artifactAdoptionEvents')).toHaveLength(1)
    const repeated = await secondRepository.adopt(adoption(original, 'another-key'))
    expect(repeated.eventId).toBe(receipts[0].eventId); expect(repeated.adoptionRevision).toBe(1)
    const reordered = { requestId: 'adoption', expectedAdoptionRevision: 0, contentHash: original.contentHash, artifactId: original.id }
    expect(await repository.adopt(reordered)).toEqual(receipts[0])
    await expect(repository.adopt({ ...adoption(original), expectedAdoptionRevision: 1 })).rejects.toThrow('不同内容')
    const next = await revised(original)
    await expect(repository.adopt(adoption(next.artifact, 'stale'))).rejects.toThrow('刷新')
    expect((await repository.adopt(adoption(next.artifact, 'adopt-new', 1))).adoptionRevision).toBe(2)
    const state = await repository.adoptionState(original.logicalArtifactId)
    expect(state.current?.artifactId).toBe(next.artifact.id); expect(state.events.map(value => value.contentVersion)).toEqual([1, 2])
    expect(state.events.every(value => value.userId === 'user')).toBe(true)
    expect(await store.load('workBudgets')).toHaveLength(0)
    expect(await repository.adoptionReceipt('unknown')).toBeNull()
  })

  it('rechecks actual bytes before adoption commit and keeps an already committed receipt historical after later external edits', async () => {
    const { root, store, repository, register, adoption } = await fixture(), original = await register()
    const changing = new ArtifactRepository(store, root, { checkpoint: async stage => { if (stage === 'before-adoption-commit') await writeFile(original.path, '# changed') } })
    await expect(changing.adopt(adoption(original))).rejects.toThrow('外部修改')
    expect(await store.load('artifactAdoptionEvents')).toHaveLength(0); expect(await repository.adoptionReceipt('adoption')).toBeNull()
    await writeFile(original.path, '# 原版\r\n第一行\n')
    const accepted = await repository.adopt(adoption(original))
    expect((await repository.preview(original.id)).artifact.contentStatus).toBe('ready')
    await writeFile(original.path, '# external after commit')
    expect(await repository.adoptionReceipt('adoption')).toEqual(accepted)
    expect(await repository.adopt(adoption(original))).toEqual(accepted)
    expect(await store.load('artifactAdoptionEvents')).toHaveLength(1)
  })

  it('rolls back adoption event and current pointer if the real SQLite receipt commit fails', async () => {
    const { store, repository, register, adoption } = await fixture(), original = await register()
    const fault = createClient({ url: pathToFileURL(store.filename).href })
    try {
      await fault.execute("CREATE TRIGGER fail_artifact_receipt BEFORE INSERT ON records WHEN NEW.collection = 'artifactAdoptionReceipts' BEGIN SELECT RAISE(ABORT, 'artifact receipt failure'); END")
      await expect(repository.adopt(adoption(original))).rejects.toThrow('artifact receipt failure')
      expect(await store.load('artifactAdoptionEvents')).toHaveLength(0)
      expect(await store.load('artifactAdoptionCurrent')).toHaveLength(0)
      expect(await repository.adoptionReceipt('adoption')).toBeNull()
      await fault.execute('DROP TRIGGER fail_artifact_receipt')
      expect((await repository.adopt(adoption(original))).adoptionRevision).toBe(1)
      expect(await store.load('artifactAdoptionEvents')).toHaveLength(1)
    } finally { fault.close() }
  })

  it('clears authority atomically, leaves opaque old-key tombstones, and removes only matching managed originals', async () => {
    const { store, repository, register, revise, adoption } = await fixture(), original = await register(), revision = await revise(original)
    await repository.adopt(adoption(original))
    await expect(store.transaction(async tx => { await repository.invalidateConversation(tx, 'chat'); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await store.load('artifacts')).toHaveLength(1); expect(await store.load('artifactCleanups')).toHaveLength(0)
    await store.transaction(async tx => { await tx.put({ collection: 'conversationCleanup', id: 'chat', value: { id: 'chat' } }); await repository.invalidateConversation(tx, 'chat') })
    await expect(repository.preview(original.id)).rejects.toThrow()
    await expect(repository.prepareRevision(revision.input)).rejects.toThrow('已清理')
    await expect(repository.adopt(adoption(original))).rejects.toThrow('已清理')
    const tombstones = [...await store.load('artifactRevisionReceipts'), ...await store.load('artifactAdoptionReceipts')]
    expect(tombstones.every(value => Object.keys(value as object).sort().join(',') === 'cleared,conversationId,fingerprint,id')).toBe(true)
    expect(await store.load('artifactRevisionRequests')).toHaveLength(0); expect(await store.load('artifactAdoptionEvents')).toHaveLength(0)
    await repository.cleanupConversation('chat')
    await expect(readFile(original.path)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await store.load('artifactCleanups')).toHaveLength(0)
  })

  it('preserves externally changed cleanup originals and clears their journal only after the conflicting file is removed', async () => {
    const { store, repository, register } = await fixture(), original = await register()
    await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    await writeFile(original.path, '# external preserved')
    await expect(repository.cleanupConversation('chat')).rejects.toThrow('外部修改')
    expect(await readFile(original.path, 'utf8')).toBe('# external preserved')
    expect((await store.load<{ status: string }>('artifactCleanups'))[0].status).toBe('conflict')
    await repository.recover(); expect(await readFile(original.path, 'utf8')).toBe('# external preserved')
    await rm(original.path); await repository.recover(); expect(await store.load('artifactCleanups')).toHaveLength(0)
  })

  it('never follows or deletes a cleanup symlink even when its target bytes match', async () => {
    const { root, store, repository, register } = await fixture(), original = await register(), external = join(root, 'outside.md')
    await writeFile(external, '# 原版\r\n第一行\n'); await store.transaction(tx => repository.invalidateConversation(tx, 'chat'))
    await rm(original.path); await symlink(external, original.path)
    await expect(repository.cleanupConversation('chat')).rejects.toThrow('符号链接')
    expect(await readFile(external, 'utf8')).toBe('# 原版\r\n第一行\n'); expect(await store.load('artifactCleanups')).toHaveLength(1)
  })

  it('restores content identities and decisions in a relocated host root by verifying only local originals without replaying revisions', async () => {
    const { root, store, repository, register, revise, adoption } = await fixture(), original = await register(), absent = await register('absent'), revision = await revise(original)
    await repository.adopt(adoption(original))
    const destination = await mkdtemp(join(tmpdir(), 'boai-artifact-restore-')); roots.push(destination)
    await store.backup(join(destination, 'product.sqlite')); await cp(join(root, 'workspaces'), join(destination, 'workspaces'), { recursive: true })
    await rm(join(destination, absent.managedRelativePath.replace(/^artifacts\//, 'workspaces/chat/artifacts/')))
    const restoredStore = new ProductStore(join(destination, 'product.sqlite')); stores.push(restoredStore); await restoredStore.init()
    const restored = new ArtifactRepository(restoredStore, destination); await rm(join(root, 'workspaces'), { recursive: true })
    await restored.recover()
    const preview = await restored.preview(original.id)
    expect(preview.artifact.path).toContain(await realpath(destination)); expect(preview.artifact.contentHash).toBe(original.contentHash)
    expect(preview.adoption.current?.artifactId).toBe(original.id)
    expect(await restored.revisionReceipt(revision.request.id)).toEqual(revision.request)
    expect((await restored.list('chat')).find(value => value.id === absent.id)?.contentStatus).toBe('unavailable')
    expect(await restoredStore.load('workItems')).toHaveLength(0); expect(await restoredStore.load('runs')).toHaveLength(0)
    expect(await restoredStore.load('artifactAdoptionEvents')).toHaveLength(1)
  })
})

it('resolves an unselected core revision target through the valid default connection without masking an invalid explicit choice',async()=>{
 const f=await fixture(),artifact=await f.register(),core={...employee('bobo'),systemRole:'core' as const,connectionId:'',modelId:''}
 await f.store.write([{collection:'agents',id:core.id,value:core},{collection:'conversations',id:'chat',value:{...chat('chat'),agentIds:['alice','bobo']}}])
 expect((await f.revise(artifact,'core-default','core-message','bobo')).request.targetAgentId).toBe('bobo')
 await f.store.write([{collection:'agents',id:core.id,value:{...core,connectionId:'missing-explicit'}}])
 await expect(f.revise(artifact,'invalid-explicit','invalid-message','bobo')).rejects.toThrow('模型连接')
 await f.store.write([{collection:'agents',id:core.id,value:{...core,systemRole:undefined}}])
 await expect(f.revise(artifact,'fake-core','fake-message','bobo')).rejects.toThrow('模型连接')
})
