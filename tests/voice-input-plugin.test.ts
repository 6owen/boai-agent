/*
 * [OUTPUT]: 2026-10-27 默认关闭、设置/凭据、单租约、迟到录音/整理与原草稿回归源码。
 * [INPUT]: Explicit plugin settings, controlled host lifecycle, helper exit and voice event streams.
 * [OUTPUT]: Opt-in migration, endpoint credentials, capture ownership, once-only drafts and late-result regressions.
 * [POS]: Controlled plugin contracts; no microphone, real ASR or online service calls.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import { applicationPlugins } from '../packages/shared/src/plugins/catalog'
import { pluginAvailability } from '../packages/shared/src/plugins/types'
import { VoiceSettingsStore } from '../packages/voice-input-plugin/src/settings'
import { VoiceHost } from '../packages/voice-input-plugin/src/host'
import { VoiceController, type VoiceAnchor } from '../packages/voice-input-plugin/src/controller'
import { defaultVoiceSettings, type VoiceApi, type VoiceEvent, type VoiceIdentity } from '../packages/voice-input-plugin/src/protocol'
const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const directory = async () => { const root = await mkdtemp(join(tmpdir(), 'boai-voice-')); roots.push(root); return root }
const secrets = () => { const values = new Map<string, string>(); return { values, get: async (id: string) => values.get(id), set: async (id: string, value: string) => { values.set(id, value) }, delete: async (id: string) => { values.delete(id) } } }
const identity = (): VoiceIdentity => ({ sessionId: randomUUID(), instanceId: randomUUID(), scope: 'chat:employee', generation: 1, draftRevision: 0, settingsRevision: 0, anchor: { start: 0, end: 0 } })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

it('reads v1 without writing and keeps voice off until a CAS opt-in survives restart', async () => {
  const path = join(await directory(), 'plugins.json'), bytes = JSON.stringify({ schemaVersion: 1, revision: 7, disabledIds: ['unknown.plugin'] })
  await writeFile(path, bytes)
  const store = new PluginSettingsStore(path, () => {}), plugin = applicationPlugins.find(plugin => plugin.id === 'boai.voice-input')!
  await store.init(); expect(await readFile(path, 'utf8')).toBe(bytes)
  expect(pluginAvailability(plugin, store.snapshot())).toBe('disabled')
  await store.update({ id: plugin.id, enabled: true, expectedRevision: 7 })
  const reopened = new PluginSettingsStore(path, () => {}); await reopened.init()
  expect(pluginAvailability(plugin, reopened.snapshot())).toBe('enabled')
  expect(reopened.snapshot().disabledIds).toEqual(['unknown.plugin'])
  expect(pluginAvailability(plugin, { ...reopened.snapshot(), disabledIds: [plugin.id] })).toBe('disabled')
})
it('binds online credentials to the exact endpoint and preserves bad configuration bytes', async () => {
  const root = await directory(), vault = secrets(), path = join(root, 'voice.json'), store = new VoiceSettingsStore(path, vault)
  await store.init()
  const { schemaVersion: _, revision: _revision, ...settings } = defaultVoiceSettings()
  await store.update({ expectedRevision: 0, settings, apiKey: 'secret-1' })
  const ref = store.value.online.credentialRef!
  expect(await vault.get(ref)).toBe('secret-1'); expect(await readFile(path, 'utf8')).not.toContain('secret-1')
  await store.update({ expectedRevision: 1, settings: { ...settings, online: { ...settings.online, endpoint: 'wss://another.example/asr' } } })
  expect(store.value.online.credentialRef).toBeUndefined(); expect(await vault.get(ref)).toBeUndefined()
  await expect(store.update({ expectedRevision: 1, settings })).rejects.toThrow('已变化')
  await writeFile(path, '{broken'); const broken = new VoiceSettingsStore(path, vault); await broken.init()
  await expect(broken.update({ expectedRevision: 0, settings })).rejects.toThrow('不可写')
  expect(await readFile(path, 'utf8')).toBe('{broken')
})
it('keeps the single lease until actual helper exit and rejects late/out-of-order audio', async () => {
  const root = await directory(), exit = deferred<{ complete: boolean }>(), entered = deferred<void>(), events: VoiceEvent[] = []
  const kill = vi.fn(async () => { await exit.promise })
  let enabled = true
  const host = new VoiceHost(root, { secrets: secrets(), enabled: () => enabled, allowed: () => true, supported: () => true, emit: event => events.push(event), refine: async () => '', helper: () => { entered.resolve(); return { result: exit.promise, kill } } })
  await host.init(); vi.spyOn(host.models, 'ready').mockResolvedValue(true)
  const first = identity(); await host.start(first)
  expect(host.canCapture()).toBe(true)
  await expect(host.start(identity())).rejects.toThrow('另一输入框')
  expect(() => host.append({ sessionId: first.sessionId, sequence: 1, pcm: new Uint8Array(2) })).toThrow('顺序')
  await host.append({ sessionId: first.sessionId, sequence: 0, pcm: new Uint8Array([1, 0]) })
  const result = host.finish(first.sessionId); const rejected = result.catch(error => error)
  await entered.promise
  const cancelling = host.cancel(first.sessionId)
  expect(host.canCapture()).toBe(false); expect(kill).toHaveBeenCalledOnce()
  await expect(host.start(identity())).rejects.toThrow('另一输入框')
  exit.resolve({ complete: false }); await cancelling; await rejected
  enabled = false; await expect(host.start(identity())).rejects.toThrow('不能开始录音')
  expect(() => host.append({ sessionId: first.sessionId, sequence: 1, pcm: new Uint8Array(2) })).toThrow('失效')
  expect(events.some(event => event.type === 'cancelled')).toBe(true)
})

it('cancels only the matching pending start and waits for its cleanup before reacquiring', async () => {
  const ready = deferred<boolean>(), root = await directory()
  const host = new VoiceHost(root, { secrets: secrets(), enabled: () => true, allowed: () => true, supported: () => true, emit: () => {}, refine: async () => '', helper: () => { throw new Error('not expected') } })
  await host.init(); vi.spyOn(host.models, 'ready').mockImplementation(() => ready.promise)
  const first = identity(), starting = host.start(first), rejected = starting.catch(error => error)
  await host.cancel(randomUUID()) // A late cancellation from another Composer is harmless.
  const cancelling = host.cancel(first.sessionId)
  await expect(host.start(identity())).rejects.toThrow('另一输入框')
  ready.resolve(true); await cancelling; expect(await rejected).toBeInstanceOf(Error)
  const second = identity(); await host.start(second); await host.cancel(first.sessionId)
  expect(host.canCapture()).toBe(true); await host.cancel(second.sessionId)
})

it('isolates unavailable optional voice storage instead of failing application initialization', async () => {
  const root = await directory(); await writeFile(join(root, 'models'), 'unavailable-directory')
  const host = new VoiceHost(root, { secrets: secrets(), enabled: () => true, allowed: () => true, supported: () => true, emit: () => {}, refine: async () => '', helper: () => { throw new Error('not expected') } })
  await expect(host.init()).resolves.toBeUndefined()
  expect(await host.snapshot()).toMatchObject({ readOnly: true, localReady: false, diagnostic: expect.stringContaining('存储不可用') })
  await expect(host.start(identity())).rejects.toThrow('不能开始录音')
})

function composer() {
  let revision = 0, text = '原草稿', listener: ((event: VoiceEvent) => void) | undefined, started: VoiceIdentity | undefined
  const refine = deferred<{ text: string; settingsRevision: number } | null>()
  const inserted = vi.fn((anchor: VoiceAnchor, value: string) => { if (anchor.revision !== revision) return; text += value; revision++; return { ...anchor, end: anchor.start + value.length, revision } })
  const replaced = vi.fn((anchor: VoiceAnchor, original: string, value: string) => { if (anchor.revision !== revision || text.slice(anchor.start, anchor.end) !== original) return; text = text.slice(0, anchor.start) + value + text.slice(anchor.end); revision++; return { ...anchor, end: anchor.start + value.length, revision } })
  const api = {
    snapshot: async () => ({ settings: defaultVoiceSettings() }),
    start: async (id: VoiceIdentity) => { started = id }, append: async () => {}, cancel: vi.fn(async () => {}),
    finish: vi.fn(async () => ({ sessionId: started!.sessionId, text: '原始转写', complete: true, usage: 'local' })),
    refine: vi.fn(() => refine.promise), subscribe: (callback: (event: VoiceEvent) => void) => { listener = callback; return () => { listener = undefined } },
  } as unknown as VoiceApi
  const cancelCapture = vi.fn(), controller = new VoiceController(api, { snapshot: () => ({ scope: 'chat', revision, start: text.length, end: text.length }), insert: inserted, replace: replaced }, () => {}, () => {}, async () => ({ stop: async () => {}, cancel: cancelCapture }))
  return { controller, api, refine, inserted, replaced, text: () => text, edit: () => { revision++; text += '用户编辑' }, event: (text: string, final = false) => listener?.({ type: 'segment', sessionId: started!.sessionId, id: 'segment', sequence: 0, revision: 1, text, final }) }
}
it('keeps partial previews out of drafts and inserts a final result only once', async () => {
  const f = composer(); await f.controller.start(randomUUID()); f.event('真实预览')
  expect(f.controller.state.preview).toBe('真实预览'); expect(f.text()).toBe('原草稿')
  f.refine.resolve(null); await f.controller.finish(); await f.controller.finish()
  expect(f.text()).toBe('原草稿原始转写'); expect(f.api.finish).toHaveBeenCalledOnce(); expect(f.inserted).toHaveBeenCalledOnce()
})
it('offers explicit insertion after draft edits and never overwrites the changed draft', async () => {
  const f = composer(); await f.controller.start(randomUUID()); f.edit(); f.refine.resolve(null); await f.controller.finish()
  expect(f.controller.state.pending).toBe('原始转写'); expect(f.text()).toBe('原草稿用户编辑')
  f.controller.insertPending(); expect(f.text()).toBe('原草稿用户编辑原始转写')
  f.controller.insertPending(); expect(f.text()).toBe('原草稿用户编辑原始转写')
})
it('rejects late refinement after an edit, undo, send or new capture revision', async () => {
  const f = composer(); await f.controller.start(randomUUID())
  const finishing = f.controller.finish()
  await vi.waitFor(() => expect(f.api.refine).toHaveBeenCalledOnce())
  f.edit(); f.refine.resolve({ text: '整理文字', settingsRevision: 0 }); await finishing
  expect(f.text()).toBe('原草稿原始转写用户编辑')
  expect(f.controller.state.canRestore).not.toBe(true)
})
it('ignores late results after cancellation and drops temporary preview', async () => {
  const f = composer(); await f.controller.start(randomUUID()); f.event('预览'); await f.controller.cancel(); f.event('迟到结果', true)
  expect(f.controller.state.preview).toBe(''); expect(f.text()).toBe('原草稿'); expect(f.inserted).not.toHaveBeenCalled()
})

it('does not resurrect failed-session text when the user cancels while cleanup is pending', async () => {
  const f = composer(), cleanup = deferred<void>()
  await f.controller.start(randomUUID()); f.event('已确认片段', true)
  vi.mocked(f.api.finish).mockRejectedValueOnce(new Error('connection lost'))
  vi.mocked(f.api.cancel).mockImplementationOnce(() => cleanup.promise)
  const finishing = f.controller.finish()
  await vi.waitFor(() => expect(f.api.cancel).toHaveBeenCalledOnce())
  await f.controller.cancel(); cleanup.resolve(); await finishing
  expect(f.controller.state.pending).toBeUndefined(); expect(f.text()).toBe('原草稿')
})
