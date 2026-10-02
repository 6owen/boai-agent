/*
 * [INPUT]: 真实 ProductStore、宿主私有材料文件和可控文件执行断点。
 * [OUTPUT]: 普通附件当前成员动态可见/退出撤权、离线不挡消息、旧名单不扩权和稳定范围回执；准备幂等/事务回滚/严格文本/实际图片/二进制容量/原名/取消退出；hash 外改保留、草稿重启清理和仅已发原件备份核对。
 * [POS]: tests/materials.test.ts；离线模块回归，不调用模型或使用假事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Conversation, DigitalAgent } from '../src/shared/domain'
import { BINARY_MATERIAL_PARSE_VERSION, isConversationMaterialVisible, MATERIAL_LIMITS, MATERIAL_PARSE_VERSION, type ConversationMaterial } from '../src/shared/domain/materials'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { MaterialRepository } from '../src/runtime/modules/materials/material-repository'
import { materialDirectory, materialImageMimeType, readMaterialOriginal, type MaterialCheckpoint } from '../src/runtime/modules/materials/material-files'

const roots: string[] = [], stores: ProductStore[] = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII=', 'base64')
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
    ['report.md', Buffer.from('普通聊天附件正文')],
    ['photo.png', png],
    ['opaque.bin', Buffer.from([0xff, 0, 1])],
  ])('lets current chat members read %s after joining and rejects departed members without widening legacy grants', async (name, bytes) => {
    const setup = await fixture(), source = join(setup.root, name); await writeFile(source, bytes)
    const input = { conversationId: 'chat', path: source, requestId: 'ordinary-attachment', deliveryScope: 'conversation' as const }
    const material = await setup.repository.prepare(input)
    expect(material).toMatchObject({ status: 'ready', deliveryScope: 'conversation', authorizedAgentIds: ['alice', 'bob'] })
    expect(await setup.store.load('messages')).toEqual([]); expect(await setup.store.load('workItems')).toEqual([])
    await setup.attach(material)
    const read = await setup.repository.read(material.id, 'alice', 'chat')
    expect((await setup.repository.read(material.id, 'bob', 'chat')).ref).toEqual(read.ref)
    await expect(setup.repository.read(material.id, 'outsider', 'chat')).rejects.toThrow('不属于')

    const joined = conversation('chat', ['alice', 'bob', 'outsider'])
    await setup.store.write([{ collection: 'conversations', id: joined.id, value: joined }])
    expect(isConversationMaterialVisible(material, joined, 'outsider')).toBe(true)
    expect(material.authorizedAgentIds).not.toContain('outsider')
    expect((await setup.repository.read(material.id, 'outsider', 'chat')).ref).toEqual(read.ref)
    await setup.repository.validateRefs([read.ref], 'outsider', 'chat')
    await setup.store.transaction(tx => setup.repository.validateRefsInTransaction(tx, [read.ref], 'outsider', 'chat'))
    await rm(source)
    expect(await setup.repository.prepare(input)).toEqual({ ...material, messageId: 'message' })
    expect(await setup.store.load('materials')).toHaveLength(1)

    const departed = conversation('chat', ['bob', 'outsider'])
    await setup.store.write([{ collection: 'conversations', id: departed.id, value: departed }])
    expect(isConversationMaterialVisible(material, departed, 'alice')).toBe(false)
    await expect(setup.repository.read(material.id, 'alice', 'chat')).rejects.toThrow('不属于')
    await expect(setup.repository.validateRefs([read.ref], 'alice', 'chat')).rejects.toThrow('不属于')
    await expect(setup.store.transaction(tx => setup.repository.validateRefsInTransaction(tx, [read.ref], 'alice', 'chat'))).rejects.toThrow('不属于')
    expect((await setup.repository.read(material.id, 'outsider', 'chat')).material.revision).toBe(material.revision)
    await new MaterialRepository(setup.store, setup.root).recover()
    expect((await setup.repository.read(material.id, 'outsider', 'chat')).ref).toEqual(read.ref)
  })

  it('accepts ordinary attachments when an existing chat member is offline without requiring a sharing selection', async () => {
    const setup = await fixture()
    await setup.store.write([{ collection: 'agents', id: 'bob', value: { ...employee('bob'), active: false } }])
    const material = await setup.repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'ordinary', deliveryScope: 'conversation' })
    expect(material.status).toBe('ready')
    await setup.attach(material)
    expect((await setup.repository.read(material.id, 'alice', 'chat')).text).toBe('第一行\n第二行\n')
    expect(await setup.store.load('messages')).toEqual([expect.objectContaining({ id: 'message' })])
    expect(await setup.store.load('workItems')).toEqual([])
    await expect(setup.repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'legacy-offline', authorizedAgentIds: ['alice', 'bob'] })).rejects.toThrow('停用')
  })

  it('preserves old explicit grants and prevents converting a conversation attachment into personal sharing', async () => {
    const setup = await fixture(), legacy = await setup.prepare('legacy'); await setup.attach(legacy)
    const expanded = conversation('chat', ['alice', 'bob', 'outsider'])
    await setup.store.write([{ collection: 'conversations', id: expanded.id, value: expanded }])
    expect(legacy.deliveryScope).toBeUndefined()
    for (const agentId of ['bob', 'outsider']) {
      expect(isConversationMaterialVisible(legacy, expanded, agentId)).toBe(false)
      await expect(setup.repository.read(legacy.id, agentId, 'chat')).rejects.toThrow('未获准')
    }
    expect((await setup.repository.read(legacy.id, 'alice', 'chat')).text).toBe('第一行\n第二行\n')
    await expect(setup.repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'legacy', deliveryScope: 'conversation' })).rejects.toThrow('requestId')
    const input = { conversationId: 'chat', path: setup.source, requestId: 'ordinary', deliveryScope: 'conversation' as const }
    const ordinary = await setup.repository.prepare(input)
    await expect(setup.repository.authorize(ordinary.id, ordinary.revision, ['alice'])).rejects.toThrow('不能单独设置')
    await expect(setup.repository.prepare({ ...input, requestId: 'client-selected', authorizedAgentIds: ['alice'] })).rejects.toThrow('不接受指定')
    expect(await setup.repository.preparation('ordinary')).toEqual(ordinary)
    expect(await setup.repository.preparation('client-selected')).toBeNull()
    await setup.store.write([{ collection: 'conversations', id: expanded.id, value: conversation('chat', ['bob']) }])
    await setup.attach(ordinary, 'ordinary-message')
    expect((await setup.repository.read(ordinary.id, 'bob', 'chat')).text).toBe('第一行\n第二行\n')
  })

  it('validates the actual chat and attachment ownership inside the message transaction for ordinary attachments', async () => {
    const setup = await fixture()
    const material = await setup.repository.prepare({ conversationId: 'chat', path: setup.source, requestId: 'ordinary', deliveryScope: 'conversation' })
    await expect(setup.store.transaction(async tx => {
      await tx.put({ collection: 'messages', id: 'foreign', value: { id: 'foreign', conversationId: 'other' } })
      await setup.repository.attach(tx, 'other', 'foreign', [material])
    })).rejects.toThrow('不属于')
    expect(await setup.store.load('messages')).toEqual([])
    await setup.store.transaction(tx => tx.remove('conversations', 'chat'))
    await expect(setup.attach(material)).rejects.toThrow('聊天已不存在')
    expect(await setup.store.load('messages')).toEqual([])
    expect(await setup.repository.preparation('ordinary')).toEqual(material)
  })

  it.each([
    ['empty.txt', Buffer.from(' \r\n\t'), '没有可供处理'],
    ['invalid.txt', Buffer.from([0xc3, 0x28]), 'UTF-8'],
    ['binary.txt', Buffer.from([0, 1, 2]), '二进制'],
    ['huge.txt', Buffer.alloc(MATERIAL_LIMITS.bytes + 1, 65), '128 KiB'],
    ['long.md', Buffer.from('字'.repeat(MATERIAL_LIMITS.characters + 1)), '16000'],
    ['huge.bin', Buffer.alloc(MATERIAL_LIMITS.attachmentBytes + 1), '20 MiB'],
  ])('shows deterministic failure for %s and never makes it readable', async (name, bytes, reason) => {
    const { root, repository, prepare } = await fixture()
    const source = join(root, name); await writeFile(source, bytes)
    const material = await prepare('bad', ['alice'], source)
    expect(material.status).toBe('failed'); expect(material.error).toContain(reason)
    expect(await repository.preparation('bad')).toEqual(material)
    await expect(repository.preview(material.id)).rejects.toThrow()
  })

  it.each(['clipboard-upload', 'report.txt', 'photo.png'])('identifies a real raster from bytes for %s and never persists its preview payload', async name => {
    const setup = await fixture(), source = join(setup.root, name)
    await writeFile(source, png)
    const material = await setup.prepare('image', ['alice'], source)
    expect(material).toMatchObject({ status: 'ready', format: 'image', mimeType: 'image/png', parseVersion: BINARY_MATERIAL_PARSE_VERSION, size: png.length })
    expect(material.characterCount).toBeUndefined(); expect(material.lineCount).toBeUndefined()
    const preview = await setup.repository.preview(material.id, material.revision)
    expect(preview.text).toBe('')
    expect(preview.imageUrl).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(await readFile(join(materialDirectory(setup.root, 'chat', material.id), 'original'))).toEqual(png)
    expect(JSON.stringify(await setup.store.load('materials'))).not.toContain('data:')
    expect(JSON.stringify(await setup.store.load('materials'))).not.toContain(png.toString('base64'))
  })

  it.each([
    ['photo.png', Buffer.from('<html><script>throw new Error("active")</script></html>')],
    ['photo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ['report.pdf', Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00])],
    ['empty.file', Buffer.alloc(0)],
  ])('stores %s as an opaque attachment without guessing text or active-image previews', async (name, bytes) => {
    const setup = await fixture(), source = join(setup.root, name); await writeFile(source, bytes)
    const material = await setup.prepare('file', ['alice'], source)
    expect(material).toMatchObject({ status: 'ready', format: 'file', mimeType: 'application/octet-stream', parseVersion: BINARY_MATERIAL_PARSE_VERSION, size: bytes.length })
    expect(material.characterCount).toBeUndefined(); expect(material.lineCount).toBeUndefined()
    const original = await readMaterialOriginal(setup.root, 'chat', material.id, material.contentHash!)
    expect(original.bytes).toEqual(bytes); expect(original).not.toHaveProperty('text')
    expect(await setup.repository.preview(material.id)).toEqual({ material, text: '' })
    await setup.attach(material)
    expect(await setup.repository.read(material.id, 'alice', 'chat')).toMatchObject({ text: '', ref: { parseVersion: BINARY_MATERIAL_PARSE_VERSION } })
  })

  it('preserves clipboard file names and binds the original name to the preparation identity', async () => {
    const setup = await fixture(), source = join(setup.root, 'host-upload'); await writeFile(source, '原名决定文本格式\r\n')
    const input = { conversationId: 'chat', path: source, name: '原始材料.md', requestId: 'clipboard', authorizedAgentIds: ['alice'] }
    const material = await setup.repository.prepare(input)
    expect(material).toMatchObject({ status: 'ready', name: input.name, format: 'markdown', parseVersion: MATERIAL_PARSE_VERSION })
    expect((await setup.repository.preview(material.id)).text).toBe('原名决定文本格式\n')
    await rm(source)
    expect(await setup.repository.prepare(input)).toEqual(material)
    await expect(setup.repository.prepare({ ...input, name: '另一个名字.pdf' })).rejects.toThrow('requestId')
    await expect(setup.repository.prepare({ ...input, requestId: 'invalid-name', name: 'unsafe\u0000.png' })).rejects.toThrow('附件名称')
    expect(await setup.store.load('materials')).toHaveLength(1)
  })

  it('lets opaque attachments exceed the text byte limit without consuming the text character allowance', async () => {
    const setup = await fixture(), source = join(setup.root, 'archive.zip')
    const bytes = Buffer.alloc(MATERIAL_LIMITS.bytes + 1, 0xff); await writeFile(source, bytes)
    const first = await setup.prepare('binary-a', ['alice'], source), second = await setup.prepare('binary-b', ['alice'], source)
    await writeFile(setup.source, '字'.repeat(MATERIAL_LIMITS.characters))
    const text = await setup.prepare('text')
    await setup.store.transaction(tx => setup.repository.attach(tx, 'chat', 'mixed-message', [first, second, text]))
    expect((await setup.repository.read(text.id, 'alice', 'chat')).text).toHaveLength(MATERIAL_LIMITS.characters)
    for (const material of [first, second]) expect(await setup.repository.read(material.id, 'alice', 'chat')).toMatchObject({ material: { messageId: 'mixed-message' }, text: '' })
    await expect(setup.store.transaction(tx => setup.repository.attach(tx, 'chat', 'too-many', [first, second, text, { id: 'fourth', revision: 1 }]))).rejects.toThrow('三份')
  })

  it('keeps binary refs subject to exact parse versions, revisions and explicit employee authorization', async () => {
    const setup = await fixture(), source = join(setup.root, 'attachment.bin'); await writeFile(source, Buffer.from([0xff, 0, 1]))
    const material = await setup.prepare('binary', ['alice'], source); await setup.attach(material)
    const read = await setup.repository.read(material.id, 'alice', 'chat')
    await setup.repository.validateRefs([read.ref], 'alice', 'chat')
    await setup.store.transaction(tx => setup.repository.validateRefsInTransaction(tx, [read.ref], 'alice', 'chat'))
    const wrongParser = { ...read.ref, parseVersion: MATERIAL_PARSE_VERSION }
    await expect(setup.repository.validateRefs([wrongParser], 'alice', 'chat')).rejects.toThrow('失效')
    await expect(setup.store.transaction(tx => setup.repository.validateRefsInTransaction(tx, [wrongParser], 'alice', 'chat'))).rejects.toThrow('失效')
    await expect(setup.repository.read(material.id, 'bob', 'chat')).rejects.toThrow('未获准')
    await expect(setup.store.transaction(tx => setup.repository.attach(tx, 'other', 'other-message', [material]))).rejects.toThrow('不属于')
    await setup.repository.authorize(material.id, material.revision, ['bob'])
    await expect(setup.repository.validateRefs([read.ref], 'alice', 'chat')).rejects.toThrow()
    expect((await setup.repository.read(material.id, 'bob', 'chat')).text).toBe('')
  })

  it('rejects a stored active MIME or mismatched text parser even when the original hash is unchanged', async () => {
    const setup = await fixture(), source = join(setup.root, 'photo.png'); await writeFile(source, png)
    const image = await setup.prepare('image', ['alice'], source)
    await setup.store.write([{ collection: 'materials', id: image.id, value: { ...image, mimeType: 'image/svg+xml' } }])
    await expect(setup.repository.preview(image.id)).rejects.toThrow('格式')
    expect(await setup.repository.preparation('image')).toMatchObject({ status: 'unavailable' })
    const binarySource = join(setup.root, 'binary.dat'); await writeFile(binarySource, Buffer.from([0xff, 0]))
    const binary = await setup.prepare('binary', ['alice'], binarySource)
    await setup.store.write([{ collection: 'materials', id: binary.id, value: { ...binary, format: 'txt' } }])
    await expect(setup.repository.preview(binary.id)).rejects.toThrow('不可用')
    expect(await readFile(join(materialDirectory(setup.root, 'chat', binary.id), 'original'))).toEqual(Buffer.from([0xff, 0]))
  })

  it('recognizes safe raster signatures while excluding SVG, arbitrary RIFF and misleading prefixes', () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
    const bmp = Buffer.alloc(58); bmp.write('BM'); bmp.writeUInt32LE(58, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(1, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(4, 34)
    const avif = Buffer.alloc(24); avif.writeUInt32BE(24); avif.write('ftypavif', 4); avif.write('mif1avif', 16)
    expect(materialImageMimeType(png)).toBe('image/png')
    expect(materialImageMimeType(gif)).toBe('image/gif')
    expect(materialImageMimeType(webp)).toBe('image/webp')
    expect(materialImageMimeType(bmp)).toBe('image/bmp')
    expect(materialImageMimeType(avif)).toBe('image/avif')
    expect(materialImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe('image/jpeg')
    for (const bytes of [Buffer.from('<svg/>'), Buffer.from('RIFF0000WAVE'), png.subarray(0, 8), Buffer.from('fake.png')]) expect(materialImageMimeType(bytes)).toBeUndefined()
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

  it('preserves changed binary originals during cleanup and removes hash-matching binary drafts after restart', async () => {
    const setup = await fixture(), source = join(setup.root, 'file.dat'), bytes = Buffer.from([0xff, 0, 2])
    await writeFile(source, bytes)
    const changed = await setup.prepare('changed', ['alice'], source), draft = await setup.prepare('draft', ['alice'], source)
    const changedOriginal = join(materialDirectory(setup.root, 'chat', changed.id), 'original'), draftOriginal = join(materialDirectory(setup.root, 'chat', draft.id), 'original')
    const edited = Buffer.from([0xff, 0, 3]); await writeFile(changedOriginal, edited)
    await expect(setup.repository.discard(changed.id, changed.revision)).rejects.toThrow('外部修改')
    expect(await readFile(changedOriginal)).toEqual(edited)
    await rm(source)
    const restored = new MaterialRepository(setup.store, setup.root); await restored.recover()
    expect(await readFile(changedOriginal)).toEqual(edited)
    expect(await restored.preparation('changed')).toMatchObject({ status: 'unavailable', authorizedAgentIds: [] })
    const fenced = await restored.preparation('draft')
    expect(fenced).toMatchObject({ status: 'removed', authorizedAgentIds: [], error: expect.stringContaining('未发送材料草稿') })
    await expect(readFile(draftOriginal)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await restored.prepare({ conversationId: 'chat', path: source, requestId: 'draft', authorizedAgentIds: ['alice'] })).toEqual(fenced)
    expect(await setup.store.load('materialCleanups')).toEqual([expect.objectContaining({ id: changed.id, status: 'conflict' })])
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

  it('backs up sent image and opaque binary originals and restores them without rereading vanished sources', async () => {
    let sourceReads = 0
    const setup = await fixture(async stage => { if (stage === 'source-opened') sourceReads++ })
    const imageSource = join(setup.root, 'photo.png'), fileSource = join(setup.root, 'archive.zip'), bytes = Buffer.from([0x50, 0x4b, 0xff, 0, 1])
    await writeFile(imageSource, png); await writeFile(fileSource, bytes)
    const image = await setup.prepare('image', ['alice'], imageSource), file = await setup.prepare('file', ['alice'], fileSource), draft = await setup.prepare('draft', ['alice'], fileSource)
    await setup.attach(image, 'image-message'); await setup.attach(file, 'file-message')
    await rm(imageSource); await rm(fileSource); sourceReads = 0
    const backupRoot = await realpath(await mkdtemp(join(tmpdir(), 'boai-attachment-backup-'))); roots.push(backupRoot)
    const database = join(backupRoot, 'boai.sqlite'); await setup.store.backup(database)
    await setup.repository.exportSnapshot(backupRoot); await setup.repository.pruneBackup(database)
    expect(sourceReads).toBe(0)
    expect(await readFile(join(materialDirectory(backupRoot, 'chat', image.id), 'original'))).toEqual(png)
    expect(await readFile(join(materialDirectory(backupRoot, 'chat', file.id), 'original'))).toEqual(bytes)
    await expect(readFile(join(materialDirectory(backupRoot, 'chat', draft.id), 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
    const backup = new ProductStore(database); stores.push(backup); await backup.init()
    const restored = new MaterialRepository(backup, backupRoot, { checkpoint: async stage => { if (stage === 'source-opened') throw new Error('恢复不能读取源文件') } }); await restored.recover()
    expect(await restored.read(image.id, 'alice', 'chat')).toMatchObject({ ref: { contentHash: image.contentHash, parseVersion: BINARY_MATERIAL_PARSE_VERSION }, text: '', imageUrl: `data:image/png;base64,${png.toString('base64')}` })
    expect(await restored.read(file.id, 'alice', 'chat')).toMatchObject({ ref: { contentHash: file.contentHash, parseVersion: BINARY_MATERIAL_PARSE_VERSION }, text: '' })
    await expect(restored.read(file.id, 'bob', 'chat')).rejects.toThrow('未获准')
    expect(await restored.preparation('draft')).toBeNull()
    await expect(restored.prepare({ conversationId: 'chat', path: fileSource, requestId: 'draft', authorizedAgentIds: ['alice'] })).rejects.toThrow('已清理')
    await writeFile(join(materialDirectory(backupRoot, 'chat', image.id), 'original'), Buffer.from('<svg/>'))
    await restored.recover()
    expect(await restored.preparation('image')).toMatchObject({ status: 'unavailable', error: expect.stringContaining('外部修改') })
    await expect(restored.preview(image.id)).rejects.toThrow('外部修改')
    expect(JSON.stringify(await backup.load('materials'))).not.toContain('data:')
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
