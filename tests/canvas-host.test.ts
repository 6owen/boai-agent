/*
 * [INPUT]: Isolated managed storage and deterministic renderer protocol fixtures.
 * [OUTPUT]: Host authorization, persistence, fixed-revision/whole-board export guards and cancellation evidence.
 * [POS]: Canvas host boundary tests; renderer pixels and real employee quality are separate checks.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CanvasHost } from '../packages/canvas-plugin/src/host'
import type { CanvasDocument, CanvasExecution, CanvasExecutionResult, CanvasScope } from '../packages/canvas-plugin/src/protocol'

const requireCanvas = createRequire(new URL('../packages/canvas-plugin/package.json', import.meta.url))
const { createTLSchema } = requireCanvas('@tldraw/tlschema') as { createTLSchema(): { serialize(): Record<string, unknown> } }
const roots: string[] = [], hosts: CanvasHost[] = []
const scope = { employeeId: 'employee-one', conversationId: 'conversation-one' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64')
function document(): CanvasDocument { return { schema: createTLSchema().serialize(), store: {
  'document:document': { id: 'document:document', typeName: 'document', name: '', gridSize: 10, meta: {} },
  'page:page': { id: 'page:page', typeName: 'page', name: 'Page', index: 'a1', meta: {} },
} } }
async function fixtureExecution(request: CanvasExecution): Promise<CanvasExecutionResult> {
  if (request.action === 'export') {
    if (request.format === 'png') return { format: 'png', base64: png.toString('base64') }
    if (request.format === 'svg') return { format: 'svg', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString('base64') }
    return { format: 'tldr', base64: Buffer.from(JSON.stringify({ tldrawFileFormatVersion: 1, schema: request.document.schema, records: Object.values(request.document.store) })).toString('base64') }
  }
  if (request.action === 'init') return { document: document() }
  if (request.action === 'import') {
    const file = JSON.parse(request.file) as { schema: Record<string, unknown>; records: CanvasDocument['store'][string][] }
    return { document: { schema: file.schema, store: Object.fromEntries(file.records.map(record => [record.id, record])) } }
  }
  const value = structuredClone(request.document)
  if (request.action === 'edit') value.store['page:page']!.name = 'Edited by employee'
  return { document: value }
}
async function setup(options: Partial<ConstructorParameters<typeof CanvasHost>[0]> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-canvas-host-')); roots.push(root)
  const execute = vi.fn(fixtureExecution)
  const host = new CanvasHost({ rootDirectory: root, authorize: async () => {}, enabled: () => true, execute, ...options }); hosts.push(host)
  return { root, host, execute }
}
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('creates and edits without any visible view, persists receipts and does not re-execute duplicate edits', async () => {
  const { host, root, execute } = await setup()
  const created = await host.handle(scope, { action: 'create', operationId: 'create' })
  const command = { action: 'edit' as const, boardId: created.board.boardId, expectedRevision: 0, operationId: 'edit', operations: [{ type: 'delete' as const, shapeIds: ['shape:fixture'] }] }
  const edited = await host.handle(scope, command)
  const replayed = await host.handle(scope, command)
  expect(replayed.replayed).toBe(true)
  expect(execute).toHaveBeenCalledTimes(2)
  await host.close()
  const reopened = new CanvasHost({ rootDirectory: root, authorize: async () => {}, enabled: () => true, execute }); hosts.push(reopened)
  expect(await reopened.handle(scope, { action: 'open', boardId: created.board.boardId })).toEqual(edited.board)
  expect(await reopened.handle(scope, { action: 'receipt', boardId: created.board.boardId, operationId: 'edit' })).toEqual(edited.receipt)
})

it('exports each supported format as an actual managed file and reuses fixed-version receipts across restart', async () => {
  const { host, root, execute } = await setup()
  const { board } = await host.handle(scope, { action: 'create', operationId: 'create' })
  for (const format of ['png', 'svg', 'tldr'] as const) {
    const output = await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format })
    expect(await readFile(output.path)).toEqual(Buffer.from(output.base64, 'base64'))
    expect(output.documentHash).toBe(board.documentHash)
    expect(output.revision).toBe(0)
    expect(output.sha256).toMatch(/^[a-f0-9]{64}$/)
    const before = execute.mock.calls.length
    const reopened = new CanvasHost({ rootDirectory: root, authorize: async () => {}, enabled: () => true, execute }); hosts.push(reopened)
    expect(await reopened.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format })).toEqual(output)
    expect(execute.mock.calls.length).toBe(before)
  }
})

it('does not bind a new rendering to an old revision and preserves externally changed exports', async () => {
  const { host } = await setup()
  const { board } = await host.handle(scope, { action: 'create', operationId: 'create' })
  const pngResult = await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'png' })
  const page = board.document.store['page:page']!
  await host.handle(scope, { action: 'commit', boardId: board.boardId, expectedRevision: 0, operationId: 'rename-page', changes: { added: {}, removed: {}, updated: { [page.id]: [page, { ...page, name: 'New page name' }] } } })
  await expect(host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'svg' })).rejects.toMatchObject({ code: 'CONFLICT' })
  expect((await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'png' })).sha256).toBe(pngResult.sha256)
  await writeFile(pngResult.path, 'externally changed')
  await expect(host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'png' })).rejects.toMatchObject({ code: 'EXTERNAL_CHANGE' })
  expect(await readFile(pngResult.path, 'utf8')).toBe('externally changed')
})

it('round-trips an editable file through the executor while keeping a distinct board identity', async () => {
  const { host } = await setup()
  const original = await host.handle(scope, { action: 'create', operationId: 'original' })
  const file = await host.handle(scope, { action: 'export', boardId: original.board.boardId, revision: 0, format: 'tldr' })
  const imported = await host.handle(scope, { action: 'import', operationId: 'import-copy', file: Buffer.from(file.base64, 'base64').toString() })
  expect(imported.board.boardId).not.toBe(original.board.boardId)
  expect(imported.board.document).toEqual(original.board.document)
})

it('rejects page or selection tldr exports before reusing any full-board receipt or executing a renderer', async () => {
  const { host, execute } = await setup()
  const { board } = await host.handle(scope, { action: 'create', operationId: 'tldr-scope' })
  await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'tldr' })
  const before = execute.mock.calls.length
  for (const selection of [{ pageId: 'page:page' }, { shapeIds: ['shape:selection'] }]) {
    await expect(host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'tldr', ...selection })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT', message: expect.stringContaining('整份画板') })
  }
  expect(execute).toHaveBeenCalledTimes(before)
})

it('checks availability and scope before calls and immediately before committing', async () => {
  let enabled = true, authorized = true
  const authorize = vi.fn(async (_scope: CanvasScope) => { if (!authorized) throw new Error('scope revoked') })
  const { host, execute } = await setup({ enabled: () => enabled, authorize })
  enabled = false
  await expect(host.handle(scope, { action: 'create', operationId: 'disabled' })).rejects.toMatchObject({ code: 'DISABLED' })
  expect(execute).not.toHaveBeenCalled()
  enabled = true; authorized = false
  await expect(host.handle(scope, { action: 'create', operationId: 'revoked' })).rejects.toThrow('scope revoked')
  expect(execute).not.toHaveBeenCalled()
  authorized = true
  execute.mockImplementationOnce(async request => { authorized = false; return fixtureExecution(request) })
  await expect(host.handle(scope, { action: 'create', operationId: 'revoked-during-render' })).rejects.toThrow()
  authorized = true
  expect(await host.handle(scope, { action: 'list' })).toEqual([])
})

it('waits for actual executor exit when disabling and preserves already committed documents', async () => {
  let enabled = true, releaseExit: (() => void) | undefined, started: (() => void) | undefined
  const startedPromise = new Promise<void>(resolve => { started = resolve })
  const { host, execute } = await setup({ enabled: () => enabled })
  const { board } = await host.handle(scope, { action: 'create', operationId: 'create' })
  execute.mockImplementationOnce(async (_request, ...args: unknown[]) => {
    const signal = args[0] as AbortSignal
    started!()
    await new Promise<void>(resolve => { signal.addEventListener('abort', () => { releaseExit = resolve }, { once: true }) })
    throw new Error('executor exited after cancellation')
  })
  const call = host.handle(scope, { action: 'edit', boardId: board.boardId, expectedRevision: 0, operationId: 'in-flight', operations: [{ type: 'delete', shapeIds: ['shape:fixture'] }] })
  const failed = expect(call).rejects.toThrow()
  await startedPromise
  enabled = false
  let drained = false
  const refresh = host.refresh().then(() => { drained = true })
  await vi.waitFor(() => expect(releaseExit).toBeTypeOf('function'))
  expect(host.busy).toBe(true)
  expect(drained).toBe(false)
  releaseExit!()
  await failed; await refresh
  expect(host.busy).toBe(false)
  enabled = true
  expect(await host.handle(scope, { action: 'open', boardId: board.boardId })).toEqual(board)
})

it('validates changed image assets through the renderer while ordinary gestures stay in Node', async () => {
  const { host, execute } = await setup()
  const { board } = await host.handle(scope, { action: 'create', operationId: 'create' })
  const before = execute.mock.calls.length
  const page = board.document.store['page:page']!
  await host.handle(scope, { action: 'commit', boardId: board.boardId, expectedRevision: 0, operationId: 'rename-page', changes: { added: {}, removed: {}, updated: { [page.id]: [page, { ...page, name: 'New name' }] } } })
  expect(execute.mock.calls.length).toBe(before)
  execute.mockImplementationOnce(async () => { throw new Error('decoded dimensions do not match') })
  const asset = { id: 'asset:fake', typeName: 'asset' as const, type: 'image', props: { src: `data:image/png;base64,${png.toString('base64')}`, w: 40, h: 40, mimeType: 'image/png', name: 'fake.png', isAnimated: false }, meta: {} }
  await expect(host.handle(scope, { action: 'commit', boardId: board.boardId, expectedRevision: 1, operationId: 'fake-image', changes: { added: { [asset.id]: asset }, updated: {}, removed: {} } })).rejects.toThrow('decoded dimensions')
  expect(execute.mock.calls.at(-1)![0].action).toBe('validate')
  expect((await host.handle(scope, { action: 'open', boardId: board.boardId })).revision).toBe(1)
})

it('source cleanup scrubs verified exports, preserves changed files, and remains separate from close or disable', async () => {
  let enabled = true
  const { host } = await setup({ enabled: () => enabled })
  const { board } = await host.handle(scope, { action: 'create', operationId: 'create' })
  const original = await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'png' })
  const customized = await host.handle(scope, { action: 'export', boardId: board.boardId, revision: 0, format: 'svg' })
  await host.closeScope(scope)
  expect(await host.handle(scope, { action: 'open', boardId: board.boardId })).toEqual(board)
  enabled = false; await host.refresh()
  enabled = true
  expect(await host.handle(scope, { action: 'open', boardId: board.boardId })).toEqual(board)
  await writeFile(customized.path, 'user customized export')
  const result = await host.discardScope(scope, 'clear-source')
  expect(result.deletedBoards).toEqual([{ scope, boardId: board.boardId }])
  expect(result.preserved).toHaveLength(1)
  await expect(readFile(original.path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(customized.path, 'utf8')).toBe('user customized export')
  await expect(host.handle(scope, { action: 'create', operationId: 'create' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
