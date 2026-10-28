/*
 * [INPUT]: Pinned catalog, isolated model files, controlled network streams and actual voice host configuration.
 * [OUTPUT]: v2 migration, verified model selection, captured inference identity and model-scoped install/cancel/remove regressions.
 * [POS]: Offline multi-model core regression; no microphone or external downloads.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VoiceModels } from '../packages/voice-input-plugin/src/models'
import { VoiceHost } from '../packages/voice-input-plugin/src/host'
import { VoiceSettingsStore } from '../packages/voice-input-plugin/src/settings'
import { getVoiceModel, voiceModelRevision } from '../packages/voice-input-plugin/src/model-manifest'
import { defaultVoiceSettings, readVoiceSettings, voiceModelLanguages, type VoiceModelId, type VoiceIdentity } from '../packages/voice-input-plugin/src/protocol'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function directory() { const root = await mkdtemp(join(tmpdir(), 'boai-voice-models-')); roots.push(root); return root }
function secrets() { const values = new Map<string, string>(); return { get: async (id: string) => values.get(id), set: async (id: string, value: string) => { values.set(id, value) }, delete: async (id: string) => { values.delete(id) } } }
const identity = (revision = 0): VoiceIdentity => ({ sessionId: randomUUID(), instanceId: randomUUID(), scope: 'chat:test', generation: 1, draftRevision: 0, settingsRevision: revision, anchor: { start: 0, end: 0 } })
function configuration() { const { schemaVersion: _, revision: _revision, ...settings } = defaultVoiceSettings(); return settings }
function fixtureCatalog() {
  return (['sensevoice-small', 'whisper-tiny', 'whisper-base'] as const).map(id => ({
    id, name: id, languages: voiceModelLanguages(id), licenseUrl: 'https://fixture.invalid/LICENSE', revision: id === 'sensevoice-small' ? voiceModelRevision : id + '-fixture',
    assets: [{ name: 'model.onnx', url: `https://fixture.invalid/${id}`, bytes: Buffer.byteLength(id), sha256: createHash('sha256').update(id).digest('hex') }],
  }))
}
function response(body: BodyInit | ReadableStream<Uint8Array>, url: string) {
  const response = new Response(body)
  Object.defineProperty(response, 'url', { value: url })
  return response
}

it('projects v2 to the existing SenseVoice model without rewriting bytes, then persists v3 and rejects unknown IDs', async () => {
  const root = await directory(), path = join(root, 'settings.json'), vault = secrets()
  const { localModelId: _, ...current } = defaultVoiceSettings()
  const previous = { ...current, schemaVersion: 2, revision: 6, language: 'ja', microphoneDeviceId: 'usb-mic', refinement: { ...current.refinement, instructions: '保留语气词' } }
  const bytes = JSON.stringify(previous); await writeFile(path, bytes)
  const store = new VoiceSettingsStore(path, vault); await store.init()
  expect(store.readOnly).toBe(false)
  expect(store.value).toMatchObject({ ...previous, schemaVersion: 3, localModelId: 'sensevoice-small' })
  expect(await readFile(path, 'utf8')).toBe(bytes)
  const { schemaVersion: _version, revision: _revision, ...settings } = store.value
  await store.update({ expectedRevision: 6, settings: { ...settings, localModelId: 'whisper-base' } })
  const reopened = new VoiceSettingsStore(path, vault); await reopened.init()
  expect(reopened.value).toMatchObject({ schemaVersion: 3, revision: 7, localModelId: 'whisper-base', language: 'ja', microphoneDeviceId: 'usb-mic' })
  expect(() => readVoiceSettings({ ...reopened.value, localModelId: '../../outside' })).toThrow()
  expect(() => readVoiceSettings({ ...reopened.value, language: 'yue' })).toThrow('不支持')
})

it('requires a verified installed model to switch, passes that identity to inference and preserves it across restart', async () => {
  const root = await directory(), helper = vi.fn((_directory: string, _audio: string, segment: (index: number, text: string) => void, _language: string, _modelId: VoiceModelId) => {
    segment(0, '识别结果'); return { result: Promise.resolve({ complete: true }), kill: async () => {} }
  })
  const host = new VoiceHost(root, { secrets: secrets(), enabled: () => true, allowed: () => true, supported: () => true, emit: () => {}, refine: async () => '', helper })
  await host.init()
  await expect(host.configure({ expectedRevision: 0, settings: { ...configuration(), localModelId: 'whisper-tiny' } })).rejects.toThrow('先下载')
  expect(host.settings.value.localModelId).toBe('sensevoice-small')
  const ready = vi.spyOn(host.models, 'ready').mockResolvedValue(true)
  await host.configure({ expectedRevision: 0, settings: { ...configuration(), localModelId: 'whisper-tiny', language: 'de' } })
  expect(ready).toHaveBeenCalledWith(true, undefined, 'whisper-tiny')
  const id = identity(1); await host.start(id)
  await expect(host.configure({ expectedRevision: 1, settings: { ...configuration(), localModelId: 'whisper-base' } })).rejects.toThrow('结束当前录音')
  await expect(host.download({ action: 'remove', modelId: 'whisper-tiny' })).rejects.toThrow('结束当前录音')
  await expect(host.download({ action: 'start', modelId: 'whisper-tiny' })).rejects.toThrow('结束当前录音')
  expect(host.canCapture()).toBe(true)
  await host.append({ sessionId: id.sessionId, sequence: 0, pcm: new Uint8Array([1, 0]) })
  expect(await host.finish(id.sessionId)).toMatchObject({ complete: true, text: '识别结果' })
  expect(helper).toHaveBeenCalledWith(join(root, 'models', getVoiceModel('whisper-tiny').revision), expect.any(String), expect.any(Function), 'de', 'whisper-tiny')
  const reopened = new VoiceSettingsStore(join(root, 'settings.json'), secrets()); await reopened.init()
  expect(reopened.value).toMatchObject({ localModelId: 'whisper-tiny', language: 'de', revision: 1 })
  await expect(host.download({ action: 'remove', modelId: 'whisper-tiny' })).rejects.toThrow('选择其他模型')
  await host.close()
})

it('allows editing other settings without a downloaded default and only removes the selected model when it is inactive', async () => {
  let enabled = true
  const host = new VoiceHost(await directory(), { secrets: secrets(), enabled: () => enabled, allowed: () => true, supported: () => true, emit: () => {}, refine: async () => '', helper: () => { throw new Error('unexpected inference') } })
  await host.init()
  await expect(host.configure({ expectedRevision: 0, settings: { ...configuration(), language: 'en' } })).resolves.toMatchObject({ settings: { language: 'en', revision: 1 }, localReady: false })
  const remove = vi.spyOn(host.models, 'remove').mockResolvedValue()
  await expect(host.download({ action: 'remove', modelId: 'sensevoice-small' })).rejects.toThrow('停用')
  enabled = false
  await host.download({ action: 'remove', modelId: 'sensevoice-small' }); expect(remove).toHaveBeenCalledWith('sensevoice-small')
  await host.close()
})

it('keeps installs independent and reuses the legacy SenseVoice directory without downloading it', async () => {
  const root = await directory(), catalog = fixtureCatalog(), models = new VoiceModels(root, catalog)
  await models.recover(); await mkdir(models.directory, { recursive: true }); await writeFile(join(models.directory, 'model.onnx'), 'sensevoice-small')
  const fetch = vi.fn(async (url: string) => response(url.split('/').at(-1)!, url)); vi.stubGlobal('fetch', fetch)
  await models.download('sensevoice-small'); expect(fetch).not.toHaveBeenCalled()
  await Promise.all([models.download('whisper-tiny'), models.download('whisper-base')])
  expect((await models.snapshot()).map(model => [model.id, model.ready])).toEqual([['sensevoice-small', true], ['whisper-tiny', true], ['whisper-base', true]])
  await models.remove('whisper-tiny')
  expect(await models.ready(true, undefined, 'whisper-tiny')).toBe(false)
  expect(await models.ready(true, undefined, 'whisper-base')).toBe(true)
  expect(await models.ready(true)).toBe(true)
  expect(await readFile(join(models.directory, 'model.onnx'), 'utf8')).toBe('sensevoice-small')
})

it('cancels just the requested download and never publishes its partial directory', async () => {
  const root = await directory(), models = new VoiceModels(root, fixtureCatalog())
  await models.recover()
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('whisper-base')) return response('whisper-base', url)
    return response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(Buffer.from('whisper-'))
      init.signal!.addEventListener('abort', () => controller.error(new Error('cancelled')), { once: true })
    } }), url)
  }); vi.stubGlobal('fetch', fetch)
  const downloading = models.download('whisper-tiny'), outcome = downloading.catch(error => error)
  await vi.waitFor(() => expect(models.progressFor('whisper-tiny')?.received).toBe(8))
  await models.download('whisper-base')
  await models.cancel('whisper-tiny'); expect(await outcome).toBeInstanceOf(Error)
  expect(await models.ready(true, undefined, 'whisper-tiny')).toBe(false)
  expect(await models.ready(true, undefined, 'whisper-base')).toBe(true)
  expect(models.progressFor('whisper-tiny')).toBeUndefined()
  expect((await readdir(root)).some(name => name.startsWith('.download-'))).toBe(false)
})

it('rejects hash mismatches without replacing another model or publishing the invalid installation', async () => {
  const root = await directory(), models = new VoiceModels(root, fixtureCatalog())
  await models.recover()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('whisper-tiny') ? 'whisper-fail' : 'whisper-base', url)))
  await models.download('whisper-base')
  await expect(models.download('whisper-tiny')).rejects.toThrow('完整性校验')
  expect(await models.ready(true, undefined, 'whisper-tiny')).toBe(false)
  expect(await models.ready(true, undefined, 'whisper-base')).toBe(true)
  expect((await readdir(root)).some(name => name.startsWith('.download-'))).toBe(false)
})

it('marks same-size tampered files unavailable both after restart and after a previously verified snapshot', async () => {
  const root = await directory(), models = new VoiceModels(root, fixtureCatalog())
  await models.recover(); vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.split('/').at(-1)!, url)))
  await models.download('whisper-tiny')
  expect((await models.snapshot()).find(model => model.id === 'whisper-tiny')?.ready).toBe(true)
  const path = join(models.directoryFor('whisper-tiny'), 'model.onnx')
  await writeFile(path, 'whisper-fail')
  expect((await models.snapshot()).find(model => model.id === 'whisper-tiny')?.ready).toBe(false)
  const reopened = new VoiceModels(root, fixtureCatalog())
  expect((await reopened.snapshot()).find(model => model.id === 'whisper-tiny')?.ready).toBe(false)
  await writeFile(path, 'whisper-tiny')
  expect((await models.snapshot()).find(model => model.id === 'whisper-tiny')?.ready).toBe(true)
})

it('blocks removal during a model selection and blocks capture or selection of a model whose removal is pending', async () => {
  let enabled = true
  const host = new VoiceHost(await directory(), { secrets: secrets(), enabled: () => enabled, allowed: () => true, supported: () => true, emit: () => {}, refine: async () => '', helper: () => { throw new Error('unexpected inference') } })
  await host.init()
  let resolveReady!: (ready: boolean) => void
  const verification = new Promise<boolean>(resolve => { resolveReady = resolve })
  vi.spyOn(host.models, 'ready').mockImplementationOnce(() => verification)
  const selecting = host.configure({ expectedRevision: 0, settings: { ...configuration(), localModelId: 'whisper-tiny' } })
  await expect(host.download({ action: 'remove', modelId: 'whisper-tiny' })).rejects.toThrow('正在更新')
  resolveReady(true); await selecting
  enabled = false
  let finishRemoval!: () => void
  vi.spyOn(host.models, 'remove').mockImplementationOnce(() => new Promise<void>(resolve => { finishRemoval = resolve }))
  const removing = host.download({ action: 'remove', modelId: 'whisper-tiny' })
  await expect(host.configure({ expectedRevision: 1, settings: { ...configuration(), localModelId: 'whisper-tiny' } })).rejects.toThrow('正在移除')
  enabled = true
  await expect(host.start(identity(1))).rejects.toThrow('正在移除')
  finishRemoval(); await removing; await host.close()
})
