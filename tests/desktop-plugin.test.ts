/*
 * [INPUT]: Real plugin settings/SQLite and controlled upstream process results.
 * [OUTPUT]: Opt-in, authority, namespace, cancellation, argument and image boundary checks.
 * [POS]: Desktop plugin integration tests; actual native smoke is recorded separately.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import { DesktopPluginService } from '../packages/runtime/src/modules/desktop-plugin/service'
import { DESKTOP_PLUGIN_ID, desktopPluginCallSchema, validateDesktopPluginCall } from '../packages/shared/src/plugins/desktop-tools'
import { createDesktopPluginOperations } from '../packages/runtime/src/adapters/mastra/desktop-plugin-tools'
import { mcpModelContent } from '../packages/runtime/src/modules/sources/mcp-media'
import { summarizeMedia } from '../packages/runtime/src/modules/browser/media'

const upstream = vi.hoisted(() => ({ prepare: vi.fn(), run: vi.fn() }))
vi.mock('@boai/desktop-plugin/host', async importOriginal => ({ ...await importOriginal<object>(), prepareDesktopExecutable: upstream.prepare, runDesktopCommand: upstream.run }))
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.clearAllMocks() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-desktop-plugin-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'v2'), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const plugins = new PluginSettingsStore(join(root, 'application-plugins.json'), () => {}); await plugins.init()
  const service = new DesktopPluginService(store, path, action => action()); cleanups.push(() => service.close())
  upstream.prepare.mockResolvedValue('/fixture/agent-desktop'); upstream.run.mockResolvedValue({ content: [{ type: 'text', text: 'upstream state' }] })
  const controller = new AbortController()
  const context = { runId: 'run-a', conversation: { id: 'conversation-a' }, signal: controller.signal, agent: { id: 'employee-a', executionPermission: 'full-access' }, beforeEffect: vi.fn(async () => {}), afterEffect: vi.fn(async () => {}) } as unknown as EngineContext
  const enable = (enabled = true) => plugins.update({ id: DESKTOP_PLUGIN_ID, enabled, expectedRevision: plugins.snapshot().revision })
  return { root, service, plugins, context, controller, enable }
}
it('does not start any process until the new plugin is explicitly enabled', async () => {
  const f = await fixture()
  expect(await f.service.enabled()).toBe(false)
  await expect(f.service.test()).rejects.toThrow('停用')
  expect(upstream.prepare).not.toHaveBeenCalled()
  await f.enable()
  expect(await f.service.inspect(f.context)).toMatchObject({ provider: 'agent-desktop', config: { allowHeaded: false } })
  expect(upstream.prepare).not.toHaveBeenCalled()
})
it('allows observation but refuses read-only writes and declined approval before dispatch', async () => {
  const f = await fixture(); await f.enable(); f.context.agent.executionPermission = 'read-only'
  await f.service.call({ command: 'snapshot', args: ['--app', 'Notes', '-i'] }, f.context)
  await expect(f.service.call({ command: 'click', args: ['@snapshot:e1'] }, f.context)).rejects.toThrow('只读')
  f.context.agent.executionPermission = 'ask'; f.context.approveOperation = vi.fn(async () => false)
  await expect(f.service.call({ command: 'type', args: ['@snapshot:e1', 'private'] }, f.context)).rejects.toThrow('拒绝')
  expect(upstream.run).toHaveBeenCalledTimes(1)
  expect(f.context.beforeEffect).not.toHaveBeenCalled()
})
it('requires an owner opt-in for physical input and prevents CLI flag bypasses', async () => {
  const f = await fixture(); await f.enable()
  for (const raw of [{ command: 'click', headed: true }, { command: 'press', args: ['cmd+s'] }, { command: 'click', args: ['--headed', '@s:e1'] }, { command: 'snapshot', args: ['--session=other'] }, { command: 'permissions', args: ['--request'] }, { command: 'screenshot', args: ['/tmp/private.png'] }]) {
    await expect(f.service.call(raw, f.context)).rejects.toThrow()
  }
  expect(upstream.run).not.toHaveBeenCalled()
  await f.service.save({ expectedRevision: 0, config: { allowHeaded: true } })
  await f.service.call({ command: 'double-click', args: ['@s:e1'], headed: true }, f.context)
  expect(upstream.run.mock.calls[0]?.[1]).toEqual(['--headed', 'double-click', '@s:e1'])
  await expect(f.service.save({ expectedRevision: 0, config: {} })).rejects.toThrow('已变化')
})
it('isolates ref namespaces between employees and conversations while preserving a conversation across runs', async () => {
  const f = await fixture(); await f.enable()
  await f.service.call({ command: 'status' }, f.context)
  await f.service.call({ command: 'status' }, { ...f.context, runId: 'run-b' })
  await f.service.call({ command: 'status' }, { ...f.context, conversation: { id: 'other' } } as EngineContext)
  const sessions = upstream.run.mock.calls.map(call => call[3])
  expect(sessions[0]).toBe(sessions[1]); expect(sessions[0]).not.toBe(sessions[2])
})
it('retains desktop admission until an in-flight call settles and rejects its result after disablement', async () => {
  const f = await fixture(); await f.enable()
  let finish!: (value: unknown) => void
  upstream.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const call = f.service.call({ command: 'click', args: ['@s:e1'] }, f.context)
  const rejected = expect(call).rejects.toThrow()
  await vi.waitFor(() => expect(upstream.run).toHaveBeenCalledTimes(1))
  await f.enable(false)
  let closed = false
  const closing = f.service.refresh().then(() => { closed = true })
  await Promise.resolve(); expect(closed).toBe(false)
  finish({ content: [{ type: 'text', text: 'late result' }] })
  await closing; await rejected
  expect(upstream.run).toHaveBeenCalledTimes(1)
})
it('returns screenshot bytes as an image without embedding base64 in the text or persistent summary', async () => {
  const { desktopResult } = await import('../packages/desktop-plugin/src/host')
  const image = Buffer.from('real-image-fixture').toString('base64')
  const result = desktopResult({ version: '2.5', ok: true, command: 'screenshot', data: { data: image, format: 'png', width: 1, height: 1 } })
  expect(mcpModelContent(result)).toContainEqual({ type: 'image', data: image, mimeType: 'image/png' })
  expect((result.content[0] as { text: string }).text).not.toContain(image)
  expect(JSON.stringify(summarizeMedia(result))).not.toContain(image)
  expect(JSON.stringify(summarizeMedia({ command: 'type', args: ['@s:e1', 'PRIVATE_TEXT'] }))).not.toContain('PRIVATE_TEXT')
})
it('shares typed discovery/calls between API and native agents and preserves shell metacharacters as arguments', async () => {
  const input = desktopPluginCallSchema.parse({ command: 'type', args: ['@s:e1', '$(touch /tmp/never-run); `secret`'] })
  expect(() => validateDesktopPluginCall(input, { allowHeaded: false })).not.toThrow()
  const callDesktopPlugin = vi.fn(async () => ({ content: [{ type: 'text', text: 'state' }] }))
  const context = { desktopPluginEnabled: true, inspectDesktopPlugin: vi.fn(), callDesktopPlugin } as unknown as EngineContext
  const operations = createDesktopPluginOperations(context)
  await operations.find(value => value.name === 'call_desktop_plugin')!.execute(input)
  expect(callDesktopPlugin).toHaveBeenCalledWith(input)
  expect(createDesktopPluginOperations({ ...context, desktopPluginEnabled: false })).toEqual([])
  expect(createDesktopPluginOperations({ ...context, work: { organization: {} } } as EngineContext)).toEqual([])
})
