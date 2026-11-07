/*
 * [INPUT]: Real isolated browser configuration/receipt stores and controllable upstream sessions.
 * [OUTPUT]: Minimal foreground writes preserve drafts, paths and other providers; CAS, cleanup, shutdown and unknown receipts never replay.
 * [POS]: WT1 C contract acceptance, without live browser, model or Electron interaction.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import { BrowserPluginService } from '../packages/runtime/src/modules/browser/plugins'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { pluginConfigurationOperations } from '../packages/runtime/src/modules/application/plugin-configuration'
import type { ApplicationPort } from '../packages/runtime/src/modules/application/operations'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { ApplicationActor } from '../packages/shared/src/domain/application-protocol'
import { browserPluginId, mergeBrowserConfigurationDraft, refreshBrowserConfigurationDraft, type BrowserPluginConfig, type BrowserPluginProvider } from '../packages/shared/src/plugins/browser-tools'

const factory = vi.hoisted(() => vi.fn())
vi.mock('@boai/browser-plugins/host', () => ({ createBrowserPluginSession: factory, browserPluginRuntimeRoot: () => '/unused-fixture' }))
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.clearAllMocks() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-plugin-config-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'v2', 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const plugins = new PluginSettingsStore(join(root, 'application-plugins.json'), () => {}); await plugins.init()
  const changed = vi.fn(), service = new BrowserPluginService(store, join(root, 'v2'), action => action(), changed)
  cleanup.push(() => service.close())
  const session = { inspect: vi.fn(() => []), call: vi.fn(async () => ({ content: [] })), close: vi.fn(async () => {}) }
  factory.mockResolvedValue(session)
  const request = vi.fn(async (method: string, input: unknown) => {
    if (method === 'getPluginSettings') return plugins.snapshot()
    if (method === 'getBrowserPluginSettings') return service.settings((input as { provider: string }).provider)
    if (method === 'saveBrowserPluginSettings') return service.save(input)
    throw new Error('Unexpected fixture request')
  })
  const operations = pluginConfigurationOperations({ request: request as ApplicationPort['request'] }, { available: true })
  const app = new ApplicationService(store, operations, async () => {})
  const context = { runId: 'run-a', signal: new AbortController().signal, agent: { id: 'employee', executionPermission: 'full-access', allowCommands: true }, work: { id: 'work-a' } } as unknown as EngineContext
  const enable = (provider: BrowserPluginProvider) => plugins.update({ id: browserPluginId(provider), enabled: true, expectedRevision: plugins.snapshot().revision })
  const configure = (patch: Record<string, unknown>, expectedRevision = 0, requestId = 'configure-1', provider: BrowserPluginProvider = 'agent-browser') => app.call({ operation: 'plugins.configure', input: { id: browserPluginId(provider), patch, expectedRevision }, requestId })
  return { store, plugins, service, session, request, operations, app, context, changed, enable, configure }
}

it('discovers only real supported fields and reads both providers without launching a browser', async () => {
  const f = await fixture()
  for (const provider of ['agent-browser', 'browser-viewer'] as const) {
    const id = browserPluginId(provider)
    expect(await f.app.call({ operation: 'plugins.describe', input: { id } })).toMatchObject({ status: 'succeeded', data: { id, configurable: true, provider, fields: { defaultForeground: { default: false, writable: true }, executablePath: { writable: false } } } })
    expect(await f.app.call({ operation: 'plugins.options', input: { id } })).toMatchObject({ status: 'succeeded', data: { revisionScope: 'browser-provider-settings', launchVerified: false } })
    expect(await f.app.call({ operation: 'plugins.getConfig', input: { id } })).toMatchObject({ status: 'succeeded', data: { revision: 0, config: { defaultForeground: false }, readiness: 'not-tested', availability: 'disabled' } })
  }
  expect(await f.app.call({ operation: 'plugins.describe', input: { id: 'boai.preview.text' } })).toMatchObject({ status: 'succeeded', data: { configurable: false } })
  expect(await f.app.call({ operation: 'plugins.getConfig', input: { id: 'boai.preview.text' } })).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(factory).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled()
})

it('rejects all fields outside foreground atomically and empty patches have no close or save effects', async () => {
  const f = await fixture(); await f.enable('agent-browser'); await f.service.inspect('agent-browser', f.context)
  for (const field of ['headless', 'executablePath', 'apiKey']) {
    expect(await f.configure({ defaultForeground: true, [field]: 'private' }, 0, `bad-${field}`)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  }
  expect(await f.configure({})).toMatchObject({ status: 'succeeded', data: { revision: 0 } })
  expect(await f.service.settings('agent-browser')).toMatchObject({ revision: 0, config: { headless: true, executablePath: '' } })
  expect(f.session.close).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled()
})

it('persists foreground on the original provider and replays its durable receipt without another cleanup', async () => {
  const f = await fixture()
  await f.service.save({ provider: 'agent-browser', expectedRevision: 0, config: { headless: true, executablePath: '/fixture/chrome' } })
  const other = await f.service.save({ provider: 'browser-viewer', expectedRevision: 0, config: { headless: false, executablePath: '/fixture/other' } })
  const otherSession = { ...f.session, close: vi.fn(async () => {}) }
  factory.mockResolvedValueOnce(f.session).mockResolvedValueOnce(otherSession)
  await f.enable('agent-browser'); await f.enable('browser-viewer')
  await f.service.inspect('agent-browser', f.context)
  await f.service.inspect('browser-viewer', { ...f.context, runId: 'other-provider-run' })
  f.changed.mockClear()
  const original = await f.configure({ defaultForeground: true }, 1)
  expect(original).toMatchObject({ status: 'succeeded', data: { revision: 2, config: { defaultForeground: true, executablePath: '/fixture/chrome' } } })
  expect(await f.service.settings('browser-viewer')).toEqual(other)
  const reconstructed = new ApplicationService(f.store, f.operations, async () => {})
  expect(await reconstructed.call({ operation: 'plugins.configure', input: { id: browserPluginId('agent-browser'), patch: { defaultForeground: true }, expectedRevision: 1 }, requestId: 'configure-1' })).toEqual(original)
  const detached = new ApplicationService(f.store, pluginConfigurationOperations({ request: f.request as ApplicationPort['request'] }), async () => {})
  expect(await detached.call({ operation: 'plugins.configure', input: { id: browserPluginId('agent-browser'), patch: { defaultForeground: true }, expectedRevision: 1 }, requestId: 'configure-1' })).toEqual(original)
  expect(f.session.close).toHaveBeenCalledTimes(1); expect(f.changed).toHaveBeenCalledTimes(1)
  expect(otherSession.close).not.toHaveBeenCalled(); expect(factory).toHaveBeenCalledTimes(2)
})

it('a stale save and a concurrent competing write never close the valid session a second time', async () => {
  const f = await fixture(); await f.enable('agent-browser'); await f.service.inspect('agent-browser', f.context)
  let finishClose!: () => void
  f.session.close.mockImplementationOnce(() => new Promise<void>(resolve => { finishClose = resolve }))
  const first = f.configure({ defaultForeground: true }, 0, 'first')
  await vi.waitFor(() => expect(f.session.close).toHaveBeenCalledTimes(1))
  expect(await f.configure({ defaultForeground: false }, 0, 'second')).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  finishClose(); expect(await first).toMatchObject({ status: 'succeeded', data: { revision: 1 } })
  await f.service.inspect('agent-browser', { ...f.context, runId: 'run-b' })
  expect(await f.configure({ defaultForeground: false }, 0, 'stale')).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  expect(f.session.close).toHaveBeenCalledTimes(1)
  expect(f.changed).toHaveBeenCalledTimes(1)
})

it('failed cleanup leaves settings unchanged and a stable failed request cannot silently retry cleanup', async () => {
  const f = await fixture(); await f.enable('agent-browser'); await f.service.inspect('agent-browser', f.context)
  f.session.close.mockRejectedValueOnce(new Error('private cleanup failure'))
  const rejected = await f.configure({ defaultForeground: true })
  expect(rejected).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(JSON.stringify(rejected)).not.toContain('private cleanup failure')
  expect(await f.service.settings('agent-browser')).toMatchObject({ revision: 0, config: { headless: true } })
  expect(await f.configure({ defaultForeground: true })).toEqual(rejected)
  expect(f.session.close).toHaveBeenCalledTimes(1)
  expect(f.changed).not.toHaveBeenCalled()
  await expect(f.service.inspect('agent-browser', f.context)).rejects.toThrow('关闭')
  expect(await f.configure({ defaultForeground: true }, 0, 'explicit-new-intent')).toMatchObject({ status: 'succeeded' })
  expect(f.session.close).toHaveBeenCalledTimes(2)
})

it('shutdown rejects a new save and also prevents a pending cleanup from committing configuration', async () => {
  const f = await fixture(); await f.enable('agent-browser'); await f.service.inspect('agent-browser', f.context)
  let finishClose!: () => void
  f.session.close.mockImplementationOnce(() => new Promise<void>(resolve => { finishClose = resolve }))
  const saving = f.configure({ defaultForeground: true })
  await vi.waitFor(() => expect(f.session.close).toHaveBeenCalledTimes(1))
  const stopping = f.service.close()
  expect(await f.configure({ defaultForeground: false }, 0, 'late-intent')).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  finishClose(); await stopping
  expect(await saving).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await f.service.settings('agent-browser')).toMatchObject({ revision: 0 })
  expect(f.changed).not.toHaveBeenCalled(); expect(f.session.close).toHaveBeenCalledTimes(1)
})

it('a lost response after the settings write stays unknown across facade reconstruction and never rewrites', async () => {
  const f = await fixture(), originalRequest = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, input) => {
    const result = await originalRequest(method, input)
    if (method === 'saveBrowserPluginSettings') throw new Error('transport gone after commit')
    return result
  })
  expect(await f.configure({ defaultForeground: true })).toMatchObject({ status: 'unknown', error: { code: 'OUTCOME_UNKNOWN' } })
  expect(await f.service.settings('agent-browser')).toMatchObject({ revision: 1, config: { headless: false } })
  f.request.mockImplementation(originalRequest)
  const reconstructed = new ApplicationService(f.store, f.operations, async () => {})
  expect(await reconstructed.call({ operation: 'plugins.configure', input: { id: browserPluginId('agent-browser'), patch: { defaultForeground: true }, expectedRevision: 0 }, requestId: 'configure-1' })).toMatchObject({ status: 'unknown' })
  expect(f.changed).toHaveBeenCalledTimes(1)
  expect(await f.service.settings('agent-browser')).toMatchObject({ revision: 1 })
})

it('background behaviors cannot query or configure this owner-intent-only extension even with global management access', async () => {
  const f = await fixture()
  const behavior: ApplicationActor = { kind: 'behavior', employeeId: 'bobo', conversationId: 'chat', behaviorRunId: 'background' }
  for (const operation of ['plugins.describe', 'plugins.options', 'plugins.getConfig', 'plugins.configure']) {
    const input = { id: browserPluginId('agent-browser'), ...(operation === 'plugins.configure' ? { patch: { defaultForeground: true }, expectedRevision: 0 } : {}) }
    expect(await f.app.call({ operation, input, requestId: operation }, behavior)).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  }
  expect(f.request).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled()
})

it('a missing desktop host explicitly refuses configuration access while the input schemas remain discoverable', async () => {
  const f = await fixture()
  const app = new ApplicationService(f.store, pluginConfigurationOperations({ request: f.request as ApplicationPort['request'] }), async () => {})
  const id = browserPluginId('agent-browser')
  expect(await app.call({ operation: 'plugins.getConfig', input: { id } })).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await app.call({ operation: 'plugins.configure', input: { id, patch: { defaultForeground: true }, expectedRevision: 0 }, requestId: 'no-host' })).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await app.call({ operation: 'plugins.describe', input: { id } })).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect((await app.catalog({ operation: 'plugins.describe', includeSchemas: true })).operations[0]).toMatchObject({ available: false, inputSchema: { type: 'object' } })
  expect(f.request).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled()
})

it('repeated external refreshes keep untouched fields current while retaining a separate path draft', () => {
  const original: BrowserPluginConfig = { headless: true, executablePath: '/original' }
  const first = refreshBrowserConfigurationDraft(original, { ...original, executablePath: '/local-draft' }, { ...original, headless: false })
  expect(first).toEqual({ base: { ...original, headless: false }, draft: { headless: false, executablePath: '/local-draft' } })
  const second = refreshBrowserConfigurationDraft(first.base, first.draft, original)
  expect(second.draft).toEqual({ headless: true, executablePath: '/local-draft' })
  expect(mergeBrowserConfigurationDraft(second.base, second.draft, original)).toEqual({ config: { headless: true, executablePath: '/local-draft' }, conflicts: [] })
})

it('a true path conflict preserves the original baseline until the user explicitly reconsiders it', () => {
  const original: BrowserPluginConfig = { headless: true, executablePath: '/original' }
  const latest = { ...original, executablePath: '/external' }, local = { ...original, executablePath: '/local' }
  const refreshed = refreshBrowserConfigurationDraft(original, local, latest)
  expect(refreshed).toEqual({ base: original, draft: local })
  expect(mergeBrowserConfigurationDraft(refreshed.base, refreshed.draft, latest)).toEqual({ config: local, conflicts: ['executablePath'] })
  const converged = refreshBrowserConfigurationDraft(original, local, local)
  expect(converged).toEqual({ base: local, draft: local })
  expect(mergeBrowserConfigurationDraft(converged.base, converged.draft, latest)).toEqual({ config: latest, conflicts: [] })
})
