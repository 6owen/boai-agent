/*
 * [INPUT]: Actual SQLite, private album files, image HTTP transport and employee task/native tools.
 * [OUTPUT]: Persistence, private-owner boundaries, save provenance/deduplication, deletion and source-race regressions.
 * [POS]: Controlled engineering evidence; synthetic one-pixel responses do not prove portrait consistency or real model quality.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import { ImageService } from '../src/runtime/modules/media/image-service'
import { SelfieService, type SelfiePhoto } from '../src/runtime/modules/media/selfie-service'
import { createSelfieOperations } from '../src/runtime/modules/media/selfie-tools'
import { ContactDeletionService } from '../src/runtime/modules/employees/contact-deletion'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import type { ApplicationActor } from '../src/shared/domain/application-protocol'
import type { Connection, Conversation, DigitalAgent, Message } from '../src/shared/domain'
import type { EngineContext } from '../src/runtime/contracts'

const red = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const blue = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64')
const signal = () => new AbortController().signal, validate = async () => {}
const actor: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'private', messageId: 'approval' }
const group: ApplicationActor = { ...actor, conversationId: 'group', messageId: 'group-message' }
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-selfie-')); clean.push(() => rm(root, { recursive: true, force: true }))
  let store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); clean.push(() => store.close())
  const agent = { id: 'a', name: 'A', role: 'designer', instructions: '', color: '#112233', connectionId: 'images', modelId: '', skillIds: [], knowledgeIds: [], active: true, configVersion: 1, executionPermission: 'full-access', allowCommands: false } as DigitalAgent
  const room = (id: string, kind: 'direct' | 'group' = 'direct') => ({ id, kind, agentIds: ['a'], title: id, mode: 'mention', workspacePath: join(root, 'shared', id), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' }) as Conversation
  const message = (id: string, conversationId: string, overrides = {}) => ({ id, conversationId, sequence: 1, senderType: 'user', senderId: 'user', senderName: 'Owner', content: '这个形象可以，保存到你的相册。', status: 'completed', createdAt: new Date().toISOString(), ...overrides }) as Message
  const rooms = [room('private'), room('another-private'), room('group', 'group'), { ...room('channel'), channel: { bindingId: 'channel', platform: 'telegram' } }, { ...room('b-private'), agentIds: ['b'] }]
  await store.write([{ collection: 'agents', id: 'a', value: agent }, { collection: 'agents', id: 'b', value: { ...agent, id: 'b' } }, ...rooms.map(value => ({ collection: 'conversations', id: value.id, value })), ...[message('approval', 'private'), message('another-approval', 'another-private'), message('group-message', 'group'), message('channel-message', 'channel'), message('stranger', 'private', { senderId: 'stranger' }), message('b-approval', 'b-private')].map(value => ({ collection: 'messages', id: value.id, value }))])
  const requests: { path: string; body: Buffer }[] = []
  let respond = (_: IncomingMessage, res: ServerResponse) => res.end(JSON.stringify({ data: [{ b64_json: blue.toString('base64') }] }))
  const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); requests.push({ path: req.url!, body: Buffer.concat(chunks) }); respond(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); clean.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }))
  const connection: Connection = { id: 'images', revision: 1, name: 'Images fixture', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, defaultModel: 'not-image-default', hasApiKey: true }
  let critical: Promise<unknown> = Promise.resolve()
  const host = { critical: <T>(action: () => Promise<T>): Promise<T> => { const result = critical.then(action); critical = result.catch(() => undefined); return result }, changed: () => {} }
  let images = new ImageService(store, { ...host, connection: async () => connection, credential: async () => 'fixture-secret' })
  const imageApplication = new ApplicationService(store, images.operations(), validate)
  expect((await imageApplication.call({ operation: 'images.configure', input: { expectedRevision: 0, selection: { connectionId: 'images', connectionRevision: 1, protocol: 'openai-images', model: 'chosen-portrait-model' } }, requestId: 'configure' })).status).toBe('succeeded')
  let selfies = new SelfieService(store, root, images, host)
  const save = (by = actor, bytes = red) => selfies.save(by.kind === 'employee' ? by.employeeId : 'a', by, { bytes, mimeType: 'image/png' }, '认可形象', signal(), validate)
  const file = (id: string, agentId = 'a') => join(root, 'agents', agentId, 'state', 'selfies', `${id}.png`)
  return { root, agent, room, connection, requests, save, file, get store() { return store }, get selfies() { return selfies }, get images() { return images }, setRespond(fn: typeof respond) { respond = fn }, restart: async () => { await store.close(); store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); images = new ImageService(store, { ...host, connection: async () => connection, credential: async () => 'fixture-secret' }); selfies = new SelfieService(store, root, images, host); await selfies.recover() } }
}
it('persists actual approved bytes across restart and another private chat, with metadata-only listing', async () => {
  const f = await fixture(); const saved = await f.save()
  expect(await readFile(f.file(saved.saved.id))).toEqual(red)
  const record = (await f.store.load<SelfiePhoto>('selfiePhotos'))[0]; expect(record.approvalMessageId).toBe('approval')
  await f.restart()
  const album = await f.selfies.list('a', { ...actor, conversationId: 'another-private', messageId: 'another-approval' })
  expect(album).toMatchObject({ revision: 1, count: 1, latestId: saved.saved.id }); expect(JSON.stringify(album)).not.toContain(f.root); expect(JSON.stringify(album)).not.toContain(red.toString('base64'))
  const exported = await f.selfies.export('a', actor, saved.saved.id, signal(), validate); expect(Buffer.from(exported.bytes)).toEqual(red)
})
it('deduplicates the same approved bytes without overwriting prior identity or falsely updating the label', async () => {
  const f = await fixture(); const first = await f.save(), again = await f.save()
  expect(again).toMatchObject({ saved: first.saved, albumRevision: 1, alreadySaved: true })
  expect((await f.save({ ...actor, conversationId: 'another-private', messageId: 'another-approval' })).alreadySaved).toBe(true)
  expect((await f.selfies.list('a', actor)).count).toBe(1)
})
it('denies private album metadata, writes and originals in groups, channels, stranger and missing-source contexts', async () => {
  const f = await fixture(); const saved = await f.save()
  const deniedActors = [group, { ...actor, conversationId: 'channel', messageId: 'channel-message' }, { ...actor, messageId: 'stranger' }, { ...actor, messageId: 'missing' }]
  for (const by of deniedActors) {
    await expect(f.selfies.list('a', by)).rejects.toThrow('私聊')
    await expect(f.save(by)).rejects.toThrow('私聊')
    await expect(f.selfies.export('a', by, saved.saved.id, signal(), validate)).rejects.toThrow('私聊')
    await expect(f.selfies.remove('a', by, { id: saved.saved.id, expectedRevision: 1 })).rejects.toThrow('私聊')
  }
  expect((await f.selfies.list('a', actor)).count).toBe(1)
})
it('keeps employee albums independent even when a foreign reference ID is known', async () => {
  const f = await fixture(); const saved = await f.save(), by: ApplicationActor = { kind: 'employee', employeeId: 'b', conversationId: 'b-private', messageId: 'b-approval' }
  expect((await f.selfies.list('b', by)).count).toBe(0)
  await expect(f.selfies.export('b', by, saved.saved.id, signal(), validate)).rejects.toThrow('不存在')
  await expect(f.selfies.list('a', by)).rejects.toThrow('私聊')
  await expect(f.selfies.generate('b', by, { prompt: 'new portrait', referenceId: saved.saved.id }, undefined, signal(), validate)).rejects.toThrow('不存在')
  expect(f.requests).toHaveLength(0)
})
it('requires established appearance on the first portrait and preserves all provided appearance/style text', async () => {
  const f = await fixture()
  await expect(f.selfies.generate('a', actor, { prompt: 'at a window' }, undefined, signal(), validate)).rejects.toThrow('外貌描述')
  expect(f.requests).toHaveLength(0)
  const appearance = 'short silver hair; green eyes; round glasses; blue coat'
  const result = await f.selfies.generate('a', actor, { prompt: 'sitting by a window', appearance, style: 'watercolor illustration' }, undefined, signal(), validate)
  expect(result.referenceUsed).toBe(false); expect(f.requests[0].path).toBe('/v1/images/generations')
  const request = JSON.parse(f.requests[0].body.toString()); expect(request.prompt).toContain(appearance); expect(request.prompt).toContain('watercolor illustration'); expect(request.prompt).not.toContain('Photorealistic portrait')
  expect(request.prompt).toContain('not evidence of a real-world event'); expect((await f.selfies.list('a', actor)).count).toBe(0)
})
it('privately uploads an approved reference for a fresh group portrait without exposing or auto-saving the album', async () => {
  const f = await fixture(); await f.save()
  const result = await f.selfies.generate('a', group, { prompt: 'a new pose', appearance: 'preserve green eyes' }, undefined, signal(), validate)
  expect(f.requests[0].path).toBe('/v1/images/edits'); expect(f.requests[0].body.includes(red)).toBe(true)
  expect(result.referenceUsed).toBe(true); expect(Buffer.from(result.bytes)).toEqual(blue)
  expect((await f.selfies.list('a', actor)).count).toBe(1)
  f.setRespond((_, res) => res.end(JSON.stringify({ data: [{ b64_json: red.toString('base64') }] })))
  await expect(f.selfies.generate('a', group, { prompt: 'copy it' }, undefined, signal(), validate)).rejects.toThrow('私聊')
})
it('CAS-deletes the actual original, blocks stale saves from resurrecting it and accepts new owner approval', async () => {
  const f = await fixture(); const saved = await f.save()
  await expect(f.selfies.remove('a', actor, { id: saved.saved.id, expectedRevision: 0 })).rejects.toThrow('相册已改变')
  expect(await f.selfies.remove('a', actor, { id: saved.saved.id, expectedRevision: 1 })).toEqual({ deleted: true, albumRevision: 2, cleanup: 'completed' })
  await expect(readFile(f.file(saved.saved.id))).rejects.toThrow(); expect((await f.selfies.list('a', actor)).count).toBe(0)
  await expect(f.save()).rejects.toThrow('复活')
  const next = await f.save({ ...actor, conversationId: 'another-private', messageId: 'another-approval' }); expect(next.saved.id).not.toBe(saved.saved.id)
  expect((await f.selfies.remove('a', actor, { id: saved.saved.id, expectedRevision: 1 })).albumRevision).toBe(3)
  expect(await readFile(f.file(next.saved.id))).toEqual(red)
})
it('rejects changed/symlink originals and recovers only known unchanged deleted files', async () => {
  const f = await fixture(); const saved = await f.save(), file = f.file(saved.saved.id), foreign = join(f.root, 'foreign.png')
  await writeFile(foreign, red); await rm(file); await symlink(foreign, file)
  await expect(f.selfies.export('a', actor, saved.saved.id, signal(), validate)).rejects.toThrow()
  expect((await f.selfies.remove('a', actor, { id: saved.saved.id, expectedRevision: 1 })).cleanup).toBe('pending')
  expect(await readFile(foreign)).toEqual(red); await rm(file); await writeFile(file, blue)
  await f.restart(); expect(await readFile(file)).toEqual(blue); expect((await f.selfies.list('a', actor)).count).toBe(0)
  await writeFile(file, red); await f.restart(); await expect(readFile(file)).rejects.toThrow(); expect(await readFile(foreign)).toEqual(red)
})
it('rejects an in-flight generation and already-exported snapshot after the reference is deleted', async () => {
  const f = await fixture(); const saved = await f.save(), exported = await f.selfies.export('a', actor, saved.saved.id, signal(), validate)
  let received!: () => void, response!: ServerResponse; const started = new Promise<void>(resolve => { received = resolve })
  f.setRespond((_, res) => { response = res; received(); return res })
  const pending = expect(f.selfies.generate('a', actor, { prompt: 'new pose' }, undefined, signal(), validate)).rejects.toThrow('已删除')
  await started; await f.selfies.remove('a', actor, { id: saved.saved.id, expectedRevision: 1 }); response.end(JSON.stringify({ data: [{ b64_json: blue.toString('base64') }] }))
  await pending; await expect(exported.verify()).rejects.toThrow('已删除'); expect(f.requests).toHaveLength(1)
})
it('uses original employee deletion to remove album metadata/files while preserving another employee', async () => {
  const f = await fixture(); const a = await f.save(), bActor: ApplicationActor = { kind: 'employee', employeeId: 'b', conversationId: 'b-private', messageId: 'b-approval' }; const b = await f.save(bActor)
  // The existing host clears direct/empty rooms before invoking the employee deletion transaction.
  await f.store.transaction(async tx => { for (const room of await tx.list<Conversation>('conversations')) if (room.agentIds.includes('a')) await tx.remove('conversations', room.id) })
  await new ContactDeletionService(f.store, f.root).delete({ agentIds: ['a'] })
  expect((await f.store.load<SelfiePhoto>('selfiePhotos')).map(photo => photo.agentId)).toEqual(['b'])
  await expect(readFile(f.file(a.saved.id))).rejects.toThrow(); expect(await readFile(f.file(b.saved.id, 'b'))).toEqual(red)
})
async function task(f: Awaited<ReturnType<typeof fixture>>, by = actor) {
  if (by.kind !== 'employee') throw new Error('employee expected')
  const workspace = join(f.root, 'agents', by.employeeId, 'workspace', 'sessions', by.conversationId), artifacts: any[] = []
  const ctx: EngineContext = {
    agent: f.agent, conversation: f.room(by.conversationId, by.conversationId === 'group' ? 'group' : 'direct'), connection: f.connection, apiKey: 'fixture-secret', messages: [], resources: [], runId: 'run1', responseKind: 'task', signal: signal(),
    workspace: { root: workspace, workPath: join(workspace, 'work'), runPath: join(workspace, 'runs/run1'), sharedPath: join(f.root, 'shared', by.conversationId) },
    selfies: { list: () => f.selfies.list(by.employeeId, by), save: (image, label) => f.selfies.save(by.employeeId, by, image, label, signal(), validate), remove: input => f.selfies.remove(by.employeeId, by, input), export: id => f.selfies.export(by.employeeId, by, id, signal(), validate), generate: (input, format) => f.selfies.generate(by.employeeId, by, input, format, signal(), validate) },
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false, onArtifact: async value => { artifacts.push(value) },
  }
  const runtime = await createTaskRuntime(ctx); clean.push(() => runtime.dispose())
  const call = (name: string, input: any) => (runtime.tools as any)[name].execute(input, { requestContext: new RequestContext(), observe: noopObserve })
  return { ctx, runtime, call, artifacts }
}
it('saves, exports and delivers actual album pixels through the original authorized file tools', async () => {
  const f = await fixture(), t = await task(f); await writeFile(join(t.ctx.workspace!.runPath, 'approved.png'), red)
  const saved = await t.call('save_selfie', { path: 'self:/runs/run1/approved.png', label: 'approved' })
  expect(saved.alreadySaved).toBe(false)
  const exported = await t.call('export_selfie', { id: saved.saved.id, path: 'self:/runs/run1/album.png' }); expect(exported.original).toBe(true)
  await t.call('publish_artifact', { path: exported.path }); expect(await readFile(t.artifacts[0].path)).toEqual(red)
  const portrait = await t.call('take_selfie', { prompt: 'new pose', path: 'self:/runs/run1/new.png' }); expect(portrait).toMatchObject({ generated: true, referenceUsed: true, published: false })
  await t.call('publish_artifact', { path: portrait.path }); expect(await readFile(t.artifacts[1].path)).toEqual(blue)
  expect((await f.selfies.list('a', actor)).count).toBe(1); expect(f.requests).toHaveLength(1)
})
it('native album inspection creates no Work and exposes the same save/export/take tools', async () => {
  const f = await fixture(); await f.save(); const t = await task(f); let claims = 0
  t.ctx.ensureNativeWork = async () => { claims++; t.ctx.work = { id: 'native-selfie-work', ownerAgentId: 'a' } as any }
  const native = createNativeProducts(t.ctx); clean.push(() => native.dispose())
  expect(native.tools.map(t => t.name)).toEqual(expect.arrayContaining(['list_selfies', 'delete_selfie', 'save_selfie', 'export_selfie', 'take_selfie']))
  const album = await native.tools.find(t => t.name === 'list_selfies')!.execute({}, 'list') as any; expect(album.count).toBe(1); expect(claims).toBe(0)
  await native.tools.find(t => t.name === 'take_selfie')!.execute({ prompt: 'another pose', path: 'self:/runs/run1/native.png' }, 'take'); expect(claims).toBe(1)
  await native.tools.find(t => t.name === 'publish_artifact')!.execute({ path: 'self:/runs/run1/native.png' }, 'publish'); expect(await readFile(t.artifacts[0].path)).toEqual(blue)
})
it('validates original permission again before saving and denies readonly deletion or group export', async () => {
  const f = await fixture(); await expect(f.selfies.save('a', actor, { bytes: red, mimeType: 'image/png' }, '', signal(), async () => { throw new Error('revoked') })).rejects.toThrow('revoked')
  expect((await f.selfies.list('a', actor)).count).toBe(0); const saved = await f.save(), t = await task(f)
  t.ctx.agent.executionPermission = 'read-only'; const remove = createSelfieOperations(t.ctx).find(op => op.name === 'delete_selfie')!
  await expect(remove.execute({ id: saved.saved.id, expectedRevision: 1 })).rejects.toThrow('只读')
  const g = await task(f, group); await expect(g.call('export_selfie', { id: saved.saved.id, path: 'self:/runs/run1/leak.png' })).rejects.toThrow('私聊')
  await expect(readFile(join(g.ctx.workspace!.runPath, 'leak.png'))).rejects.toThrow()
})
