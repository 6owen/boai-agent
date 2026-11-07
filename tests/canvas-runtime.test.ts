/*
 * [INPUT]: Isolated plugin settings/workspaces, scoped employee contexts and controlled host replies.
 * [OUTPUT]: Permissions, scope, cancellation/draining, export integrity and shared API/native media evidence.
 * [POS]: WT4 directed runtime tests; no model, personal profile or visible desktop calls.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { noopObserve, type Tool } from '@mastra/core/tools'
import { createStageAgent } from '../packages/runtime/src/adapters/mastra/agent-factory'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { CanvasService } from '../packages/runtime/src/modules/canvas/service'
import { createCanvasOperations, canvasAgentRequestSchema } from '../packages/runtime/src/adapters/mastra/canvas-tools'
import { createNativeProducts } from '../packages/runtime/src/adapters/native-products'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import { CANVAS_PLUGIN_ID, type CanvasExportResult, type CanvasHostEnvelope, type CanvasHostResponse, type CanvasMutationResult } from '../packages/canvas-plugin/src/protocol'
import { mcpModelContent } from '../packages/runtime/src/modules/sources/mcp-media'
import { summarizeMedia } from '../packages/runtime/src/modules/browser/media'
import { publishArtifact } from '../packages/runtime/src/modules/workspaces/file-access'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const exported = (patch: Partial<CanvasExportResult> = {}): CanvasExportResult => ({ boardId: 'board-a', revision: 2, documentHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', filename: '画板.png', path: '/host-managed/export.png', base64: png.toString('base64'), bytes: png.length, sha256: hash(png), ...patch })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-canvas-runtime-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const settings = new PluginSettingsStore(join(root, 'application-plugins.json'), () => {})
  await settings.init()
  const controller = new AbortController()
  const request = vi.fn<(envelope: CanvasHostEnvelope) => Promise<CanvasHostResponse>>(async envelope => envelope.type === 'cancel' ? { cancelled: true } : [])
  const verify = vi.fn(async (_: EngineContext) => {})
  const service = new CanvasService(join(root, 'v2'), request, verify)
  cleanups.push(() => service.close())
  const privateRoot = join(root, 'employee')
  const context = { agent: { id: 'employee-a', name: '普通设计员工', skillIds: [], knowledgeIds: [], active: true, configVersion: 1, executionPermission: 'full-access' }, conversation: { id: 'conversation-a', kind: 'direct', sharedKnowledgeIds: [] }, resources: [], runId: 'run-a', signal: controller.signal, workspace: { root: privateRoot, workPath: join(privateRoot, 'work'), runPath: join(privateRoot, 'runs/run-a'), sharedPath: join(root, 'shared') }, onTool: vi.fn(async () => {}), onExecutionEvent: vi.fn(async () => {}), beforeEffect: vi.fn(async () => {}), afterEffect: vi.fn(async () => {}) } as unknown as EngineContext
  const enable = (enabled = true) => settings.update({ id: CANVAS_PLUGIN_ID, enabled, expectedRevision: settings.snapshot().revision })
  return { root, service, context, request, verify, enable, controller }
}

it('is disabled by default and fails closed for missing host or malformed settings', async () => {
  const f = await fixture()
  expect(await f.service.enabled()).toBe(false)
  await expect(f.service.call({ action: 'list' }, f.context)).rejects.toThrow('停用')
  expect(f.request).not.toHaveBeenCalled()
  await f.enable()
  expect(await f.service.enabled()).toBe(true)
  expect(await new CanvasService(join(f.root, 'v2')).enabled()).toBe(false)
  await writeFile(join(f.root, 'application-plugins.json'), '{')
  expect(await f.service.enabled()).toBe(false)
})

it('binds the host scope to the employee/run and rejects model-supplied scope, snapshot and import bypasses', async () => {
  const f = await fixture(); await f.enable()
  await f.service.call({ action: 'read', boardId: 'board-a' }, f.context)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({ type: 'call', scope: { employeeId: 'employee-a', conversationId: 'conversation-a' }, command: { action: 'read', offset: 0, limit: 100 } })
  expect(f.verify).toHaveBeenCalled()
  for (const input of [{ action: 'list', employeeId: 'another' }, { action: 'open', boardId: 'board-a' }, { action: 'commit', boardId: 'board-a' }, { action: 'import', operationId: 'import', file: '{}' }]) expect(() => canvasAgentRequestSchema.parse(input)).toThrow()
  expect(f.request).toHaveBeenCalledTimes(1)
})

it('permits read-only observation but refuses writes or declined approval before host dispatch', async () => {
  const f = await fixture(); await f.enable()
  f.context.agent.executionPermission = 'read-only'
  await f.service.call({ action: 'list' }, f.context)
  await expect(f.service.call({ action: 'create', operationId: 'create-a' }, f.context)).rejects.toThrow('只读')
  f.context.agent.executionPermission = 'ask'
  f.context.approveOperation = vi.fn(async () => false)
  await expect(f.service.call({ action: 'create', operationId: 'create-a' }, f.context)).rejects.toThrow('拒绝')
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.context.beforeEffect).not.toHaveBeenCalled()
})

it('rechecks active execution before dispatch and suppresses stale or revoked late replies', async () => {
  const f = await fixture(); await f.enable()
  f.verify.mockRejectedValueOnce(new Error('revoked employee'))
  await expect(f.service.call({ action: 'list' }, f.context)).rejects.toThrow('revoked employee')
  expect(f.request).not.toHaveBeenCalled()
  f.request.mockImplementationOnce(async () => { f.verify.mockRejectedValue(new Error('removed from conversation')); return [] })
  await expect(f.service.call({ action: 'list' }, f.context)).rejects.toThrow('removed from conversation')
  expect(f.request).toHaveBeenCalledTimes(1)
})

it('retains the in-flight run until the original host operation exits after explicit cancellation', async () => {
  const f = await fixture(); await f.enable()
  let finish!: (response: CanvasHostResponse) => void
  f.request.mockImplementation(envelope => envelope.type === 'cancel' ? Promise.resolve({ cancelled: true }) : new Promise(resolve => { finish = resolve }))
  const call = f.service.call({ action: 'read', boardId: 'board-a' }, f.context)
  const rejected = expect(call).rejects.toThrow('取消')
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1))
  let closed = false
  const closing = f.service.closeRun(f.context.runId).then(() => { closed = true })
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2))
  const first = f.request.mock.calls[0]![0], cancel = f.request.mock.calls[1]![0]
  if (first.type !== 'call') throw new Error('Expected employee canvas call')
  expect(cancel).toEqual({ type: 'cancel', executionId: first.executionId, scope: first.scope })
  expect(closed).toBe(false); expect(f.service.busy).toBe(true)
  finish([])
  await closing; await rejected
  expect(f.service.busy).toBe(false)
})

it('disabling the plugin cancels pending work without replaying commands or releasing it early', async () => {
  const f = await fixture(); await f.enable()
  let finish!: (response: CanvasHostResponse) => void
  f.request.mockImplementation(envelope => envelope.type === 'cancel' ? Promise.resolve({ cancelled: true }) : new Promise(resolve => { finish = resolve }))
  const call = f.service.call({ action: 'list' }, f.context), rejected = expect(call).rejects.toThrow('取消')
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1))
  await f.enable(false)
  const refreshing = f.service.refresh()
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2))
  expect(f.service.busy).toBe(true)
  finish([]); await refreshing; await rejected
  await expect(f.service.call({ action: 'list' }, f.context)).rejects.toThrow('停用')
  expect(f.request).toHaveBeenCalledTimes(2)
})

it('returns only mutation identity/receipt to the model, never the full document or embedded asset bytes', async () => {
  const f = await fixture(); await f.enable()
  const mutation = { board: { boardId: 'board-a', revision: 1, documentHash: 'a'.repeat(64), document: { store: { secret: { src: 'PRIVATE_DOCUMENT' } }, schema: {} } }, receipt: { operationId: 'create-a', revision: 1 }, replayed: true } as unknown as CanvasMutationResult
  f.request.mockResolvedValue(mutation)
  const result = await f.service.call({ action: 'create', operationId: 'create-a' }, f.context)
  expect(result).toMatchObject({ board: { boardId: 'board-a', revision: 1 }, replayed: true, receipt: { operationId: 'create-a' } })
  expect(JSON.stringify(result)).not.toContain('PRIVATE_DOCUMENT')
  expect(f.context.afterEffect).toHaveBeenCalledOnce()
})

it('stages verified real bytes, reuses matching exports and feeds original publication with preparation before commit', async () => {
  const f = await fixture(); await f.enable()
  f.request.mockResolvedValue(exported())
  const input = { action: 'export' as const, boardId: 'board-a', revision: 2, format: 'png' as const }
  const result = await f.service.call(input, f.context) as { logicalPath: string; delivery: string }
  expect(result.delivery).toBe('not_published')
  const file = join(f.context.workspace!.root, result.logicalPath.slice('self:/'.length))
  expect(await readFile(file)).toEqual(png)
  expect(await f.service.call(input, f.context)).toEqual(result)
  const order: string[] = []
  f.context.onArtifactPreparing = async () => { order.push('prepare') }
  f.context.onArtifact = async () => { order.push('commit') }
  const published = await publishArtifact(f.context, f.context.workspace!, result.logicalPath, '画板.png')
  expect(order).toEqual(['prepare', 'commit'])
  expect(published.artifact.contentHash).toBe(hash(png))
  expect(await readFile(published.artifact.path)).toEqual(png)
  expect(mcpModelContent(result)).toContainEqual({ type: 'image', mimeType: 'image/png', data: png.toString('base64') })
  expect(JSON.stringify(summarizeMedia(result))).not.toContain(png.toString('base64'))
})

it('rejects mismatched revision/hash and preserves an externally modified export', async () => {
  const f = await fixture(); await f.enable()
  const command = { action: 'export', boardId: 'board-a', revision: 2, format: 'png' }
  f.request.mockResolvedValueOnce(exported({ revision: 3 }))
  await expect(f.service.call(command, f.context)).rejects.toThrow('版本')
  f.request.mockResolvedValueOnce(exported({ sha256: 'b'.repeat(64) }))
  await expect(f.service.call(command, f.context)).rejects.toThrow('hash')
  f.request.mockResolvedValue(exported())
  const result = await f.service.call(command, f.context) as { logicalPath: string }
  const file = join(f.context.workspace!.root, result.logicalPath.slice(6))
  await writeFile(file, 'owner changed')
  await expect(f.service.call(command, f.context)).rejects.toThrow('外部修改')
  expect(await readFile(file, 'utf8')).toBe('owner changed')
})

it('uses the same strict tool schema for API/native, returns PNG separately and redacts persistent native media', async () => {
  const f = await fixture(); await f.enable()
  f.request.mockResolvedValue(exported())
  f.context.canvasEnabled = true; f.context.callCanvas = input => f.service.call(input, f.context)
  const operations = createCanvasOperations(f.context)
  expect(operations.map(value => value.name)).toEqual(['call_canvas'])
  expect(createCanvasOperations({ ...f.context, canvasEnabled: false })).toEqual([])
  expect(createCanvasOperations({ ...f.context, work: { organization: {} } } as EngineContext)).toEqual([])
  const native = createNativeProducts(f.context), tool = native.tools.find(value => value.name === 'call_canvas')!
  expect(tool.inputSchema).toEqual({ ...z.toJSONSchema(operations[0]!.schema, { io: 'input' }), type: 'object' })
  const result = await tool.execute({ action: 'export', boardId: 'board-a', revision: 2, format: 'png' }, 'call-a')
  expect(tool.toModelContent!(result)).toContainEqual({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' })
  expect(JSON.stringify(vi.mocked(f.context.onTool).mock.calls)).not.toContain(png.toString('base64'))
  expect(JSON.stringify(vi.mocked(f.context.onExecutionEvent!).mock.calls)).not.toContain(png.toString('base64'))
  await native.dispose()
})


it('mounts and executes the canvas tool in an ordinary API chat stage without any model request', async () => {
  const f = await fixture(); await f.enable()
  f.context.canvasEnabled = true
  f.context.callCanvas = input => f.service.call(input, f.context)
  f.context.connection = { id: 'fixture-model', name: 'Unused local endpoint', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'unused-model', hasApiKey: false }
  Object.assign(f.context.agent, { connectionId: 'fixture-model', modelId: 'unused-model', instructions: 'Help with the current board.', role: 'Designer', color: '#112233', allowCommands: false, policyVersion: 2 })
  Object.assign(f.context.conversation, { title: 'Canvas', agentIds: [f.context.agent.id], mode: 'natural', createdAt: '', updatedAt: '' })
  f.context.messages = []; f.context.apiKey = ''
  const stage = await createStageAgent('chat', f.context)
  cleanups.push(() => stage.dispose())
  const tool = (await stage.agent.listTools()).call_canvas as Tool
  expect(tool).toBeDefined()
  expect(await tool.execute!({ action: 'list' }, { agent: { toolCallId: 'api-canvas-call' }, abortSignal: f.context.signal, observe: noopObserve } as never)).toEqual([])
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({ type: 'call', scope: { employeeId: 'employee-a', conversationId: 'conversation-a' }, command: { action: 'list' } })
})
