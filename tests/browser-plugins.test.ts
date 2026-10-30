/*
 * [INPUT]: Real settings/SQLite stores, independent browser sessions and the shared tool bridge.
 * [OUTPUT]: Opt-in isolation, revision conflicts, original arguments, approvals, cancellation and media contracts.
 * [POS]: Browser plugin integration boundaries; live upstream browser smoke is recorded separately.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import { BrowserPluginService } from '../packages/runtime/src/modules/browser/plugins'
import { browserPluginId } from '../packages/shared/src/plugins/browser-tools'
import { applicationPlugins } from '../packages/shared/src/plugins/catalog'
import { pluginAvailability } from '../packages/shared/src/plugins/types'
import { createBrowserPluginOperations } from '../packages/runtime/src/adapters/mastra/browser-plugin-tools'
import { mcpModelContent } from '../packages/runtime/src/modules/sources/mcp-media'
import { summarizeMedia } from '../packages/runtime/src/modules/browser/media'

const factory = vi.hoisted(() => vi.fn())
vi.mock('@boai/browser-plugins/host', () => ({ createBrowserPluginSession: factory, browserPluginRuntimeRoot: () => '/unused-fixture' }))
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.clearAllMocks() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-browser-plugins-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'v2'), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const plugins = new PluginSettingsStore(join(root, 'application-plugins.json'), () => {}); await plugins.init()
  const service = new BrowserPluginService(store, path, action => action()); cleanups.push(() => service.close())
  const session = { inspect: vi.fn(() => [{ name: 'browser_snapshot', description: 'upstream', inputSchema: { type: 'object' } }]), call: vi.fn(async () => ({ content: [{ type: 'text', text: 'upstream result' }] })), close: vi.fn(async () => {}) }
  factory.mockResolvedValue(session)
  const controller = new AbortController()
  const context = { runId: 'run-a', signal: controller.signal, agent: { id: 'employee', executionPermission: 'full-access', allowCommands: true }, work: { id: 'work-a' }, beforeEffect: vi.fn(async () => {}), afterEffect: vi.fn(async () => {}) } as unknown as EngineContext
  const enable = (provider: 'agent-browser' | 'browser-viewer', enabled = true) => plugins.update({ id: browserPluginId(provider), enabled, expectedRevision: plugins.snapshot().revision })
  return { root, service, store, plugins, session, context, controller, enable }
}
it('requires explicit plugin opt-in without changing BOAI browser or DeepSeek settings', async () => {
  const f = await fixture()
  for (const provider of ['agent-browser', 'browser-viewer'] as const) expect(pluginAvailability(applicationPlugins.find(plugin => plugin.id === browserPluginId(provider))!, f.plugins.snapshot())).toBe('disabled')
  expect(await f.service.enabled()).toEqual([])
  await expect(f.service.inspect('agent-browser', f.context)).rejects.toThrow('停用')
  expect(factory).not.toHaveBeenCalled()
  await f.enable('agent-browser')
  expect(await f.service.enabled()).toEqual(['agent-browser'])
  expect(await f.service.inspect('agent-browser', f.context)).toMatchObject({ tools: [{ description: 'upstream' }], independentBrowser: true })
  expect(await f.store.get('webSearchSettings', 'default')).toBeUndefined()
  expect(f.plugins.snapshot().disabledIds).not.toContain('boai.search.deepseek')
})
it('saves launch settings by revision and never rewrites another provider configuration', async () => {
  const f = await fixture()
  const saved = await f.service.save({ provider: 'agent-browser', expectedRevision: 0, config: { headless: true, executablePath: '/fixture/chrome' } })
  expect(saved.revision).toBe(1)
  await f.enable('agent-browser'); await f.service.inspect('agent-browser', f.context)
  await expect(f.service.save({ provider: 'agent-browser', expectedRevision: 0, config: {} })).rejects.toThrow('已变化')
  expect(await f.service.settings('agent-browser')).toEqual(saved)
  expect(await f.service.settings('browser-viewer')).toMatchObject({ revision: 0, config: { headless: false, executablePath: '' } })
  expect(f.session.close).not.toHaveBeenCalled()
})
it('preserves upstream arguments and enforces approval before browser interactions', async () => {
  const f = await fixture(); await f.enable('agent-browser')
  f.context.agent.executionPermission = 'read-only'
  await f.service.call({ provider: 'agent-browser', tool: 'browser_snapshot', arguments: { interactiveOnly: true } }, f.context)
  expect(f.session.call).toHaveBeenCalledWith('browser_snapshot', { interactiveOnly: true }, expect.any(String))
  await expect(f.service.call({ provider: 'agent-browser', tool: 'browser_click', arguments: { ref: '@e1' } }, f.context)).rejects.toThrow('只读')
  f.context.agent.executionPermission = 'ask'; f.context.approveOperation = vi.fn(async () => false)
  await expect(f.service.call({ provider: 'agent-browser', tool: 'browser_click', arguments: { ref: '@e1' } }, f.context)).rejects.toThrow('拒绝')
  expect(f.session.call).toHaveBeenCalledTimes(1)
  expect(f.context.beforeEffect).not.toHaveBeenCalled()
})
it('stopping a plugin closes its actual session and rejects late results without replay', async () => {
  const f = await fixture(); await f.enable('agent-browser')
  let finish!: (value: any) => void
  f.session.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  f.session.close.mockImplementation(async () => { finish({ content: [{ type: 'text', text: 'late result' }] }) })
  const call = f.service.call({ provider: 'agent-browser', tool: 'browser_snapshot', arguments: {} }, f.context)
  const result = expect(call).rejects.toThrow('停用')
  await vi.waitFor(() => expect(f.session.call).toHaveBeenCalledTimes(1))
  await f.enable('agent-browser', false); await f.service.refresh(); await result
  expect(f.session.close).toHaveBeenCalledTimes(1)
  expect(f.session.call).toHaveBeenCalledTimes(1)
})
it('cancellation waits for the same session to close and never affects another provider', async () => {
  const f = await fixture(); await f.enable('agent-browser'); await f.enable('browser-viewer')
  const other = { ...f.session, close: vi.fn(async () => {}) }
  factory.mockResolvedValueOnce(f.session).mockResolvedValueOnce(other)
  await f.service.inspect('agent-browser', f.context)
  const otherController = new AbortController()
  await f.service.inspect('browser-viewer', { ...f.context, runId: 'run-b', signal: otherController.signal })
  f.controller.abort(); await f.service.closeRun('run-a')
  expect(f.session.close).toHaveBeenCalledTimes(1)
  expect(other.close).not.toHaveBeenCalled()
  await expect(f.service.call({ provider: 'agent-browser', tool: 'browser_snapshot' }, f.context)).rejects.toThrow()
})
it('BrowserViewer requires command permission before launching a browser', async () => {
  const f = await fixture(); await f.enable('browser-viewer'); f.context.agent.allowCommands = false
  await expect(f.service.call({ provider: 'browser-viewer', tool: 'execute', arguments: { args: ['open', 'https://example.com'] } }, f.context)).rejects.toThrow('命令执行')
  expect(factory).not.toHaveBeenCalled()
})
it('API/native discovery forwards the same upstream call and preserves actual image content', async () => {
  const image = { type: 'image', data: 'fixture-image-bytes', mimeType: 'image/png' }
  const context = { browserPluginProviders: ['agent-browser'], inspectBrowserPlugin: vi.fn(async () => ({})), callBrowserPlugin: vi.fn(async () => ({ content: [image] })) } as unknown as EngineContext
  const tools = createBrowserPluginOperations(context)
  const result = await tools.find(tool => tool.name === 'call_browser_plugin')!.execute({ provider: 'agent-browser', tool: 'browser_screenshot', arguments: { fullPage: true } })
  expect(context.callBrowserPlugin).toHaveBeenCalledWith({ provider: 'agent-browser', tool: 'browser_screenshot', arguments: { fullPage: true } })
  expect(mcpModelContent(result)).toContainEqual(image)
  expect(createBrowserPluginOperations({ ...context, work: { organization: {} } } as EngineContext)).toEqual([])
})
it('keeps independent browser inputs out of persistent traces without changing execution arguments', () => {
  const input = { provider: 'agent-browser', tool: 'browser_type', arguments: { ref: '@e1', text: 'PRIVATE_FIELD_VALUE' } }
  const trace = { input, history: [{ function: { name: 'call_browser_plugin', arguments: JSON.stringify(input) } }] }
  expect(JSON.stringify(summarizeMedia(trace))).not.toContain('PRIVATE_FIELD_VALUE')
  expect(input.arguments.text).toBe('PRIVATE_FIELD_VALUE')
  expect(summarizeMedia(summarizeMedia(trace))).toEqual(summarizeMedia(trace))
})
