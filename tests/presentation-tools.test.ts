/*
 * [OUTPUT]: Scoped project discovery restores IDs across turns; extracted image handles retain original bytes/source gates.
 * [INPUT]: Actual task tools, editable compiler, authorized source files and isolated employee/session workspaces.
 * [OUTPUT]: Durable revision/material flow, CLI schema, source revocation, scope and approved-export boundaries.
 * [POS]: Engineering integration; actual renderer/vision quality is evaluated separately.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { z } from 'zod'
import type { EngineContext } from '../src/runtime/contracts'
import type { DigitalAgent } from '../src/shared/domain'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { mastraCliTools } from '../src/runtime/adapters/mastra/cli-tools'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'
import { PresentationProjects } from '../src/runtime/modules/presentations/presentation-project'
import { createHash } from 'node:crypto'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
const contract = { title: '真实任务演示', theme: { name: 'Test', headFontFace: 'Arial', bodyFontFace: 'Arial' }, story: { audience: '项目成员', purpose: '说明原始事实', coreMessage: '保留来源', narrative: ['证据'] }, design: { visualDirection: 'Simple typography', imageDirection: 'Real source', density: 'balanced' } }
const slide = { id: 's1', role: 'supporting', layoutKey: 'test', elements: [{ type: 'text', id: 'title', x: 1, y: 1, w: 10, h: 1, text: '原始数字 7 和 11', fontSize: 36 }] }
async function directory() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-presentation-tools-'))); cleanup.push(() => rm(root, { recursive: true, force: true })); return root }
async function task(root: string, agentId = 'a', conversationId = 'room', runId = 'r1') {
  const controller = new AbortController(), workspace = join(root, agentId, conversationId)
  let allowed = true, effects = 0
  const ctx: EngineContext = {
    agent: { id: agentId, name: 'PPT', role: '制作', instructions: '', color: '#0077AA', connectionId: 'c', modelId: 'chat', skillIds: [], knowledgeIds: [], allowCommands: false, executionPermission: 'full-access', configVersion: 1, active: true } as DigitalAgent,
    conversation: { id: conversationId, title: 'PPT', kind: 'direct', agentIds: [agentId], mode: 'mention', sharedKnowledgeIds: [], workspacePath: join(root, 'shared', conversationId), createdAt: '', updatedAt: '' },
    connection: { id: 'c', name: 'Chat', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'chat', hasApiKey: false }, apiKey: '',
    messages: [], resources: [], responseKind: 'task', runId, signal: controller.signal,
    workspace: { root: workspace, workPath: join(workspace, 'work'), runPath: join(workspace, 'runs', runId), sharedPath: join(root, 'shared', conversationId) },
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
    canAccessTaskPath: async () => allowed,
    beforeEffect: async () => { effects++ }, afterEffect: async () => {},
    presentations: {
      verify: async () => { controller.signal.throwIfAborted() },
      settings: async () => ({ revision: 0, configured: false, renderer: null, vision: null, verified: false, reasons: ['not selected'] }),
      renderer: async () => { throw new Error('renderer not selected') },
      lease: async () => { throw new Error('vision not selected') },
    },
  }
  const runtime = await createTaskRuntime(ctx); cleanup.push(() => runtime.dispose())
  const call = async (name: string, input: unknown): Promise<any> => {
    const tool = runtime.tools[name as keyof typeof runtime.tools]
    if (!tool) throw new Error(`Missing tool ${name}`)
    return tool.execute!((tool.inputSchema as z.ZodType).parse(input) as never, { requestContext: new RequestContext(), observe: noopObserve } as never)
  }
  return { ctx, runtime, call, controller, revoke: () => { allowed = false }, get effects() { return effects } }
}

test('creates editable revisions with source images, extracts cached material and resumes through the original task/CLI tools', async () => {
  const root = await directory(), t = await task(root), image = gatewayVisionImage()
  await writeFile(join(t.ctx.workspace!.workPath, 'source.md'), '# 原始记录\n甲 7，乙 11。')
  await writeFile(join(t.ctx.workspace!.workPath, 'figure.png'), image)
  const input = { path: 'self:/work/source.md' }
  const first = await t.call('presentation_extract_material', input), cached = await t.call('presentation_extract_material', input)
  expect(first.cacheHit).toBe(false); expect(cached.cacheHit).toBe(true); expect(cached.pages).toEqual(first.pages)
  expect(JSON.stringify(first)).toContain('甲 7'); expect(JSON.stringify(first)).not.toContain(root)
  const created = await t.call('presentation_create', contract)
  expect(created.revision).toBe(0); expect(created).not.toHaveProperty('outputPath'); expect(created).not.toHaveProperty('assetBasePath')
  const updated = await t.call('presentation_upsert_slide', { presentationId: created.id, expectedRevision: 0, slide: { ...slide, elements: [...slide.elements, { id: 'image', type: 'image', x: 1, y: 3, w: 5, h: 3, path: 'self:/work/figure.png', altText: '实际图片' }] } })
  expect(updated.revision).toBe(1); expect(JSON.stringify(updated)).not.toContain(root)
  expect(updated.slides[0].elements[1].path).toBe('self:/work/figure.png')
  const resumed = await task(root, 'a', 'room', 'r2'), cli = mastraCliTools(resumed.ctx, resumed.runtime.tools)
  expect(cli.find(tool => tool.name === 'presentation_get')?.effect).toBe('read')
  expect(cli.find(tool => tool.name === 'presentation_upsert_slide')?.effect).toBe('write')
  expect(cli.filter(tool => tool.name.startsWith('presentation_'))).toHaveLength(14)
  expect(cli.find(tool => tool.name === 'presentation_list')?.effect).toBe('read')
  expect(await cli.find(tool => tool.name === 'presentation_list')!.execute({}, 'list')).toEqual({ items: [{ presentationId: created.id, title: contract.title, revision: 1, slideCount: 1, updatedAt: updated.updatedAt }], unavailableCount: 0, nextOffset: null })
  const read = await cli.find(tool => tool.name === 'presentation_get')!.execute({ presentationId: created.id }, 'read')
  expect(read).toEqual(updated)
  await expect(resumed.call('presentation_upsert_slide', { presentationId: created.id, expectedRevision: 0, slide })).rejects.toThrow('revision conflict')
  expect(await resumed.call('presentation_validate', { presentationId: created.id })).toMatchObject({ revision: 1, valid: true })
  await expect(resumed.call('presentation_export', { presentationId: created.id, path: 'self:/runs/r2/deck.pptx' })).rejects.toThrow('vision not selected')
  await expect(readFile(join(resumed.ctx.workspace!.runPath, 'deck.pptx'))).rejects.toThrow()
}, 30000)

test('prevents another employee/session, read-only modification, hidden project reads and source revocation from authorizing a deck', async () => {
  const root = await directory(), t = await task(root)
  await writeFile(join(t.ctx.workspace!.workPath, 'source.md'), 'Source fact')
  await t.call('presentation_extract_material', { path: 'self:/work/source.md' })
  const deck = await t.call('presentation_create', contract)
  for (const other of [await task(root, 'b'), await task(root, 'a', 'other')]) {
    await expect(other.call('presentation_get', { presentationId: deck.id })).rejects.toThrow()
    expect(await other.call('presentation_list', {})).toEqual({ items: [], unavailableCount: 0, nextOffset: null })
  }
  await expect(t.call('read_file', { path: `self:/.presentations/projects/${deck.id}/current.json` })).rejects.toThrow('exposes only')
  await expect(t.call('presentation_extract_material', { path: 'self:/SOUL.md' })).rejects.toThrow('System files')
  t.ctx.agent.executionPermission = 'read-only'
  await expect(t.call('presentation_upsert_slide', { presentationId: deck.id, expectedRevision: 0, slide })).rejects.toThrow('只读')
  expect((await t.call('presentation_get', { presentationId: deck.id })).revision).toBe(0)
  t.revoke()
  await expect(t.call('presentation_get', { presentationId: deck.id })).rejects.toThrow('not authorized')
  expect(await t.call('presentation_list', {})).toEqual({ items: [], unavailableCount: 1, nextOffset: null })
}, 30000)

test('reuses extracted PPTX images through persistent material handles without exposing parser paths or detaching original sources', async () => {
  const root = await directory(), t = await task(root), image = gatewayVisionImage()
  const fixture = new PresentationProjects(join(root, 'source-fixture'))
  const original = await fixture.create(contract)
  const asset = await fixture.importImage(original.spec.id, { name: 'source.png', bytes: image, verify: async () => {} })
  const input = await fixture.upsert(original.spec.id, 0, { ...slide, elements: [...slide.elements, { id: 'image', type: 'image', x: 1, y: 3, w: 4, h: 3, path: asset.path, altText: '源图片' }] })
  const sourcePath = join(t.ctx.workspace!.workPath, 'source.pptx')
  await writeFile(sourcePath, await readFile(input.filePath))
  const extracted = await t.call('presentation_extract_material', { path: 'self:/work/source.pptx' })
  expect(extracted.pages).toHaveLength(1)
  const handle = extracted.pages[0].images[0].path
  expect(handle).toMatch(/^material:[a-f0-9]{64}\/[a-f0-9]{64}\.png$/)
  expect(JSON.stringify(extracted)).not.toContain(root)
  const resumed = await task(root, 'a', 'room', 'r2')
  const deck = await resumed.call('presentation_create', contract)
  const updated = await resumed.call('presentation_upsert_slide', { presentationId: deck.id, expectedRevision: 0, slide: { ...slide, elements: [...slide.elements, { id: 'copied', type: 'image', x: 1, y: 3, w: 4, h: 3, path: handle, altText: '源图片' }] } })
  expect(updated.slides[0].elements[1].path).toBe(handle)
  const projects = new PresentationProjects(join(resumed.ctx.workspace!.root, '.presentations', 'projects'))
  const actual = await projects.get(deck.id)
  const stored = await readFile(actual.spec.slides[0].elements[1].path!)
  expect(stored).toEqual(image)
  expect(createHash('sha256').update(stored).digest('hex')).toBe(extracted.pages[0].images[0].sha256)
  await writeFile(sourcePath, 'changed source')
  await expect(resumed.call('presentation_get', { presentationId: deck.id })).rejects.toThrow('source changed')
  await writeFile(sourcePath, await readFile(input.filePath))
  resumed.revoke()
  await expect(resumed.call('presentation_get', { presentationId: deck.id })).rejects.toThrow('not authorized')
}, 30000)

test('refuses cached content after the source changes and refuses queued work after cancellation', async () => {
  const root = await directory(), t = await task(root)
  const file = join(t.ctx.workspace!.workPath, 'source.md'); await writeFile(file, 'Original')
  await t.call('presentation_extract_material', { path: 'self:/work/source.md' })
  const deck = await t.call('presentation_create', contract)
  await writeFile(file, 'Changed')
  await expect(t.call('presentation_get', { presentationId: deck.id })).rejects.toThrow('source changed')
  expect(await t.call('presentation_list', {})).toEqual({ items: [], unavailableCount: 1, nextOffset: null })
  t.controller.abort(new Error('stop'))
  await expect(t.call('presentation_create', contract)).rejects.toThrow('stop')
  await expect(t.call('presentation_list', {})).rejects.toThrow('stop')
}, 30000)

test('native discovery reuses every schema, reads catalog without Work and creates a deck through the same lazy task runtime', async () => {
  const root = await directory(), t = await task(root); let claims = 0
  t.ctx.ensureNativeWork = async () => { claims++; t.ctx.work = { id: 'native-ppt', ownerAgentId: 'a' } as EngineContext['work'] }
  const native = createNativeProducts(t.ctx); cleanup.push(() => native.dispose())
  const tools = native.tools.filter(tool => tool.name.startsWith('presentation_'))
  expect(tools).toHaveLength(14)
  for (const tool of tools) expect(tool.inputSchema).toEqual(mastraCliTools(t.ctx, t.runtime.tools).find(entry => entry.name === tool.name)!.inputSchema)
  expect(await tools.find(tool => tool.name === 'presentation_list_designs')!.execute({ query: 'report', limit: 4 }, 'catalog')).toHaveLength(4)
  expect(claims).toBe(0)
  const created = await tools.find(tool => tool.name === 'presentation_create')!.execute(contract, 'create') as { id: string; revision: number }
  expect(created.revision).toBe(0); expect(claims).toBe(1)
  const updated = await tools.find(tool => tool.name === 'presentation_upsert_slide')!.execute({ presentationId: created.id, expectedRevision: 0, slide }, 'slide') as { revision: number }
  expect(updated.revision).toBe(1); expect(claims).toBe(1)
}, 30000)
