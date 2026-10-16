/*
 * [OUTPUT]: 普通bobo经真实原生产品桥读取设置指南，创建/测试/删除临时本地数据源，验证实际成功测试回执。
 * [INPUT]: 隔离AppService/SQLite、临时home、确定性员工引擎与原生产品桥。
 * [OUTPUT]: 普通bobo会话管理实际技能/数据源、版本冲突/来源边界/结束运行及结果卡回执检查；不运行E2E或外部模型。
 * [POS]: 全局目录管理模块集成回归。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AppService } from '../src/runtime/service'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { DataSource } from '../src/shared/domain/sources'
import type { LocalSkillDetail, SkillBindingPlan, SkillBindingReceipt } from '../src/shared/domain/skills'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { catalogObservation, manageSkillsSchema, manageSourcesSchema } from '../src/runtime/modules/resources/catalog-commands'
import { LocalSkillCatalogService } from '../src/runtime/modules/resources/local-skill-catalog'
import { LocalSkillEditing } from '../src/runtime/modules/resources/local-skill-editing'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean() })
const document = (body: string) => `---\nname: example-skill\ndescription: Test skill\n---\n${body}\n`
async function directory() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-catalog-'))); cleanups.push(() => rm(root, { recursive: true, force: true })); return root }
const definition = (agent: DigitalAgent) => { const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...value } = agent; return { ...value, expectedConfigVersion: configVersion } }

it('uses normal bobo chat for source CRUD, skill CRUD/binding and real navigation receipts without Work', async () => {
  const root = await directory(), vault = new Map<string, string>()
  await mkdir(join(root, 'documents'))
  let failure: unknown, latest: EngineContext | undefined
  const engine: AgentEngine = {
    test: async () => 'ok',
    decide: async context => { expect(context.manageSkills).toBeUndefined(); expect(context.manageDataSources).toBeUndefined(); return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence } },
    run: async context => {
      latest = context
      try {
        expect(context.conversation.sourceCreation).toBeUndefined(); expect(context.work).toBeUndefined()
        const bridge = createNativeProducts(context)
        const sources = bridge.tools.find(tool => tool.name === 'manage_data_sources')!
        const skills = bridge.tools.find(tool => tool.name === 'manage_skills')!
        expect(sources.inputSchema.type).toBe('object'); expect(skills.inputSchema.type).toBe('object')
        const setup = await sources.execute({ command: { action: 'guide', input: {} } }, 'guide') as { guide: string }
        expect(setup.guide).toContain('Test and validate')
        let source = await sources.execute({ command: { action: 'create', input: { key: 'api', config: { name: 'My API', description: '', guide: '', enabled: true, type: 'api', api: { baseUrl: 'http://localhost:9', authType: 'bearer', testPath: '/', allowWrites: false } }, credential: 'PRIVATE_CATALOG_SECRET' } } }, 'create') as DataSource
        const retry = await sources.execute({ command: { action: 'create', input: { key: 'api', config: { name: 'My API', description: '', guide: '', enabled: true, type: 'api', api: { baseUrl: 'http://localhost:9', authType: 'bearer', testPath: '/', allowWrites: false } }, credential: 'PRIVATE_CATALOG_SECRET' } } }, 'retry') as DataSource
        expect(retry.id).toBe(source.id)
        const sourceConfig = { name: 'Updated API', description: '', guide: '', enabled: true, type: 'api' as const, api: { baseUrl: 'http://localhost:9', authType: 'bearer' as const, testPath: '/', allowWrites: false } }
        source = await sources.execute({ command: { action: 'update', input: { id: source.id, expectedRevision: source.revision, config: sourceConfig } } }, 'update') as DataSource
        expect(source.hasCredential).toBe(true)
        await expect(sources.execute({ command: { action: 'delete', input: { id: source.id, expectedRevision: 1 } } }, 'stale')).rejects.toThrow('变化')
        const employees = await sources.execute({ command: { action: 'employees', input: {} } }, 'employees') as { id: string; configVersion: number }[]
        const researcher = employees.find(agent => agent.id === 'researcher')!
        source = await sources.execute({ command: { action: 'bindings', input: { id: source.id, expectedRevision: source.revision, expectedBindings: [], agents: [{ id: researcher.id, expectedConfigVersion: researcher.configVersion }] } } }, 'bind-source') as DataSource
        expect(JSON.stringify(await sources.execute({ command: { action: 'list', input: {} } }, 'list'))).not.toContain('PRIVATE_CATALOG_SECRET')
        await sources.execute({ command: { action: 'delete', input: { id: source.id, expectedRevision: source.revision } } }, 'delete')
        const folder = await sources.execute({ command: { action: 'create', input: { key: 'documents', config: { name: 'Documents', description: '', guide: '# Documents\nRead local documents.', enabled: true, type: 'local', local: { path: join(root, 'documents'), accessMode: 'read' } } } } }, 'create-folder') as DataSource
        const tested = await sources.execute({ command: { action: 'test', input: { id: folder.id, expectedRevision: folder.revision } } }, 'test-folder') as DataSource
        expect(tested.test?.status).toBe('success')
        await sources.execute({ command: { action: 'delete', input: { id: tested.id, expectedRevision: tested.revision } } }, 'delete-folder')
        let skill = await skills.execute({ command: { action: 'save', input: { name: 'example-skill', content: document('first'), expectedHash: null } } }, 'save') as LocalSkillDetail & { contentHash: string; treeHash: string }
        const oldHash = skill.contentHash
        skill = await skills.execute({ command: { action: 'save', input: { id: skill.skill.id, content: document('second'), expectedHash: oldHash } } }, 'edit') as typeof skill
        await expect(skills.execute({ command: { action: 'save', input: { id: skill.skill.id, content: document('stale'), expectedHash: oldHash } } }, 'stale-edit')).rejects.toThrow('changed')
        const current = (await skills.execute({ command: { action: 'employees', input: {} } }, 'current') as typeof employees).find(agent => agent.id === 'researcher')!
        const plan = await skills.execute({ command: { action: 'binding_plan', input: { localSkillId: skill.skill.id, agentId: current.id, expectedConfigVersion: current.configVersion } } }, 'plan') as SkillBindingPlan
        const receipt = await skills.execute({ command: { action: 'bind', input: { key: 'bind-skill', localSkillId: skill.skill.id, agentId: current.id, expectedConfigVersion: current.configVersion, planId: plan.id, contentHash: plan.contentHash } } }, 'bind') as SkillBindingReceipt
        expect(receipt.status).toBe('completed')
        await skills.execute({ command: { action: 'unbind', input: { agentId: current.id, resourceId: receipt.resource!.id, expectedConfigVersion: receipt.agent!.configVersion } } }, 'unbind')
        const read = await skills.execute({ command: { action: 'read', input: { id: skill.skill.id } } }, 'read') as typeof skill
        expect(read.content).toBe(document('second'))
        await skills.execute({ command: { action: 'delete', input: { id: skill.skill.id, expectedHash: read.treeHash } } }, 'remove')
        await bridge.dispose(); await context.onDelta('管理操作已完成')
      } catch (error) { failure = error; throw error }
    },
  }
  const service = new AppService({ dataPath: join(root, 'app'), skillDiscovery: { homeDir: root }, engine, secrets: { get: async id => vault.get(id), set: async (id, value) => { vault.set(id, value) }, delete: async id => { vault.delete(id) } }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' })
  const room = await service.handle('startCoreConversation', { requestId: randomUUID(), content: '管理全局技能与数据源' }) as Conversation
  await vi.waitFor(async () => { if (failure) throw failure; const detail = await service.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(true) }, { timeout: 15000 })
  expect(await service.handle('listDataSources', undefined)).toEqual([])
  expect((await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')).toMatchObject({ sourceIds: [], skillIds: [] })
  const results = await service.handle('listCatalogResults', { conversationId: room.id }) as { kind: string; removed?: boolean; available: boolean }[]
  expect(results.filter(item => item.kind === 'source')).toHaveLength(7) // Same source-creation receipt is rendered once.
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'skill', removed: true, available: false }), expect.objectContaining({ kind: 'source', removed: true, available: false })]))
  await expect(latest!.manageDataSources!({ command: { action: 'list', input: {} } })).rejects.toThrow('失效')
  expect((await readdir(join(root, '.agents/skills'))).some(name => name.startsWith('.boai-removed-'))).toBe(true)
  await service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await service.handle('listCatalogResults', { conversationId: room.id })).toEqual([])
  const store = new ProductStore(join(root, 'app/boai.sqlite'))
  cleanups.push(() => store.close())
  await store.init()
  expect(await store.load('catalogActivities')).toEqual([])
})

it('does not grant global management to an ordinary employee', async () => {
  const root = await directory(); let count = 0, failure: unknown
  const engine: AgentEngine = { test: async () => 'ok', decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }), run: async context => { try { expect(context.manageSkills).toBeUndefined(); expect(context.manageDataSources).toBeUndefined(); count++; await context.onDelta('普通员工回复') } catch (error) { failure = error; throw error } } }
  const service = new AppService({ dataPath: join(root, 'app'), skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); cleanups.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as { id: string }
  const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  await service.handle('saveAgent', { ...definition(agent), connectionId: connection.id, modelId: 'fixture' })
  const room = await service.handle('createConversation', { kind: 'direct', title: '普通员工', agentIds: ['researcher'] }) as Conversation
  await service.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '管理技能', mentionIds: [] })
  await vi.waitFor(() => { if (failure) throw failure; expect(count).toBe(1) })
})

it('rejects stale deletion, redirected skill paths and writes to another agent catalog', async () => {
  const home = await directory(), store = new ProductStore(join(home, 'db.sqlite')); await store.init(); cleanups.push(() => store.close())
  const catalog = new LocalSkillCatalogService({ homeDir: home }), files = new LocalSkillEditing(catalog, store, () => {}, home)
  let saved = await files.save({ name: 'example-skill', content: document('original'), expectedHash: null })
  await writeFile(join(saved.skill.path, 'extra.md'), 'added externally')
  await expect(files.remove({ id: saved.skill.id, expectedHash: saved.treeHash })).rejects.toThrow('变化')
  expect(await readFile(saved.filePath, 'utf8')).toBe(document('original'))
  const outside = await directory(); await writeFile(join(outside, 'SKILL.md'), document('outside'))
  await rm(saved.filePath); await symlink(join(outside, 'SKILL.md'), saved.filePath)
  await expect(files.save({ id: saved.skill.id, content: document('bad'), expectedHash: saved.contentHash })).rejects.toThrow()
  expect(await readFile(join(outside, 'SKILL.md'), 'utf8')).toBe(document('outside'))
  await mkdir(join(home, '.claude/skills/other'), { recursive: true }); await writeFile(join(home, '.claude/skills/other/SKILL.md'), '---\nname: other\ndescription: other\n---\ntext')
  const other = (await catalog.list(true)).skills.find(skill => skill.source === 'agent')!
  saved = await files.read(other.id)
  await expect(files.save({ id: other.id, content: document('bad'), expectedHash: saved.contentHash })).rejects.toThrow('仅可读取')
})

it('keeps tool schemas as object roots and excludes content and credentials from observations', () => {
  expect(z.toJSONSchema(manageSkillsSchema, { io: 'input' }).type).toBe('object')
  expect(z.toJSONSchema(manageSourcesSchema, { io: 'input' }).type).toBe('object')
  const observed = JSON.stringify(catalogObservation({ command: { action: 'create', input: { credential: 'PRIVATE_SECRET', content: 'PRIVATE_BODY' } } }))
  expect(observed).not.toContain('PRIVATE_SECRET'); expect(observed).not.toContain('PRIVATE_BODY')
})
