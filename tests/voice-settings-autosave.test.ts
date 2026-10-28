/*
 * [OUTPUT]: 语音缓存/失效、背景草稿保护与API读写隔离，同多模型目录回归共同验证。
 * [OUTPUT]: v3模型选择沿CAS保存；目录轮询不覆盖草稿，旧目录回执不能回退新安装状态。
 * [INPUT]: 真实语音设置 controller 与可控制延迟、失败、版本冲突的宿主端口。
 * [OUTPUT]: 编辑提交时机、串行回执、新草稿保护、错误恢复及关闭前排空回归。
 * [POS]: 语音设置持久化测试，不访问麦克风或下载模型。
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { defaultVoiceSettings, type VoiceApi, type VoiceSnapshot } from '../packages/shared/src/plugins/voice-input'
import { VoiceSettingsController } from '../apps/electron/src/renderer/stores/voice-settings'

const controllers: VoiceSettingsController[] = []
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
async function fixture() {
  const controller = new VoiceSettingsController(); controllers.push(controller)
  let snapshot: VoiceSnapshot = { settings: defaultVoiceSettings(), models: [], localReady: false, supported: true, onlineKeyPresent: false, modelBytes: 100 }
  const listeners = new Set<(event: AppEvent) => void>()
  const control: { gate?: Promise<void>; failure?: string; readFailure?: boolean } = {}
  const voice = {
    snapshot: vi.fn(async () => { if (control.readFailure) throw new Error('读取失败'); return structuredClone(snapshot) }),
    configure: vi.fn(async (input: Parameters<VoiceApi['configure']>[0]) => {
      await control.gate
      if (control.failure) throw new Error(control.failure)
      if (input.expectedRevision !== snapshot.settings.revision) throw new Error('语音设置已变化，请重新读取')
      snapshot = { ...snapshot, settings: { ...input.settings, schemaVersion: 3, revision: input.expectedRevision + 1 } }
      return structuredClone(snapshot)
    }),
  }
  const request = vi.fn(async () => {})
  const api = { voice, request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } } as unknown as DesktopApi
  controller.initialize(api); await controller.load()
  return { controller, voice, control, request, read: () => snapshot, external: () => { snapshot.settings.revision++; snapshot.settings.language = 'en' }, emit: (event: AppEvent) => { for (const listener of listeners) listener(event) } }
}
afterEach(() => { for (const controller of controllers.splice(0)) controller.dispose(); vi.restoreAllMocks() })

test('文本先保留草稿，clickoutside/离页 flush 后提交；无修改不重复写入', async () => {
  const { controller, voice, request, read } = await fixture()
  controller.edit(draft => ({ ...draft, terms: 'BOAI | 波艾' }))
  expect(voice.configure).not.toHaveBeenCalled(); expect(controller.hasWork()).toBe(true)
  expect(request).toHaveBeenCalledWith('setUnsavedChanges', { source: 'voice', dirty: true })
  expect(await controller.flush()).toBe(true)
  expect(read().settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾'] }])
  await controller.flush(); expect(voice.configure).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenLastCalledWith('setUnsavedChanges', { source: 'voice', dirty: false })
})

test('选择即时提交，连续选择串行使用上次回执版本，旧回执不覆盖新内容', async () => {
  const { controller, voice, control, read } = await fixture(), gate = deferred()
  control.gate = gate.promise
  controller.edit(draft => ({ ...draft, settings: { ...draft.settings, language: 'zh' } }), true)
  await Promise.resolve(); expect(voice.configure).toHaveBeenCalledTimes(1)
  controller.edit(draft => ({ ...draft, settings: { ...draft.settings, language: 'ja' } }), true)
  expect(voice.configure).toHaveBeenCalledTimes(1)
  gate.resolve(); expect(await controller.flush()).toBe(true)
  expect(voice.configure.mock.calls.map(([input]) => input.expectedRevision)).toEqual([0, 1])
  expect(read().settings.language).toBe('ja'); expect(controller.hasWork()).toBe(false)
})

test('保存途中继续打字不被旧回执覆盖，也不提前保存尚未结束的输入', async () => {
  const { controller, voice, control } = await fixture(), gate = deferred()
  control.gate = gate.promise
  controller.edit(draft => ({ ...draft, terms: '第一版' }))
  const saving = controller.flush(); await Promise.resolve()
  controller.edit(draft => ({ ...draft, terms: '继续编辑中' }))
  gate.resolve(); expect(await saving).toBe(false)
  expect(controller.store.getState().draft?.terms).toBe('继续编辑中')
  expect(voice.configure).toHaveBeenCalledTimes(1)
  await controller.flush(); expect(voice.configure.mock.calls[1]![0].expectedRevision).toBe(1)
})

test('失败保留草稿，不显示成功；用户重试后才确认并清除', async () => {
  const { controller, control, voice } = await fixture(), success = vi.spyOn(toast, 'success')
  control.failure = '磁盘写入失败'
  controller.edit(draft => ({ ...draft, terms: '保留我' }))
  expect(await controller.flush()).toBe(false); expect(success).not.toHaveBeenCalled()
  expect(controller.store.getState().draft?.terms).toBe('保留我')
  expect(voice.configure).toHaveBeenCalledTimes(1)
  control.failure = undefined
  expect(await controller.flush()).toBe(true); expect(success).toHaveBeenCalledTimes(1)
})

test('外部版本冲突不得自动换 revision 覆盖；明确放弃后读取最新内容', async () => {
  const { controller, voice, external, read } = await fixture()
  controller.edit(draft => ({ ...draft, terms: '本页修改' })); external()
  expect(await controller.flush()).toBe(false); expect(await controller.flush()).toBe(false)
  expect(voice.configure.mock.calls.map(([input]) => input.expectedRevision)).toEqual([0, 0])
  expect(read().settings.language).toBe('en')
  expect(await controller.discard()).toBe(true)
  expect(controller.store.getState().snapshot?.settings.language).toBe('en')
  expect(controller.hasWork()).toBe(false)
})

test('关闭请求等待正在写入及最后输入，真实完成后才回执 clean', async () => {
  const { controller, control, request, emit, read } = await fixture(), gate = deferred()
  control.gate = gate.promise
  controller.edit(draft => ({ ...draft, terms: '第一版' }))
  void controller.flush(); await Promise.resolve()
  controller.edit(draft => ({ ...draft, terms: '关闭前' }))
  emit({ type: 'voice-settings:flush', requestId: 'closing' }); await Promise.resolve()
  expect(request.mock.calls.some(call => (call as unknown[])[0] === 'completeVoiceSettingsFlush')).toBe(false)
  gate.resolve()
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('completeVoiceSettingsFlush', { requestId: 'closing', clean: true, settled: true }))
  expect(read().settings.terms[0]?.word).toBe('关闭前')
})

test('放弃也等待正在写入，读取失败不能清除草稿；再次读取才放行', async () => {
  const { controller, control } = await fixture(), gate = deferred()
  control.gate = gate.promise; control.failure = '写入失败'
  controller.edit(draft => ({ ...draft, terms: '不能静默丢弃' }))
  void controller.flush(); await Promise.resolve()
  control.readFailure = true
  const discarding = controller.discard(); gate.resolve()
  expect(await discarding).toBe(false); expect(controller.hasWork()).toBe(true)
  control.readFailure = false
  expect(await controller.discard()).toBe(true); expect(controller.hasWork()).toBe(false)
})

test('当前模型选择保存真实模型身份，重载后仍使用该模型', async () => {
  const { controller, voice, read } = await fixture()
  controller.edit(draft => ({ ...draft, settings: { ...draft.settings, localModelId: 'whisper-tiny', language: 'de' } }), true)
  expect(await controller.flush()).toBe(true)
  expect(voice.configure).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ localModelId: 'whisper-tiny', language: 'de' }) }))
  expect(read().settings.localModelId).toBe('whisper-tiny')
  await controller.load()
  expect(controller.store.getState().snapshot?.settings.localModelId).toBe('whisper-tiny')
})

test('下载目录刷新保留尚未保存的模型选择和术语，不提交或覆盖设置', async () => {
  const { controller, voice, read } = await fixture()
  controller.edit(draft => ({ ...draft, settings: { ...draft.settings, localModelId: 'whisper-base' }, terms: '继续编辑的术语' }))
  read().models = [{ id: 'whisper-tiny', name: 'Whisper Tiny', languages: ['auto', 'en'], licenseUrl: 'https://example.test/license', bytes: 42, ready: true }]
  await controller.refreshModels()
  expect(controller.store.getState().models).toEqual(read().models)
  expect(controller.store.getState().draft?.settings.localModelId).toBe('whisper-base')
  expect(controller.store.getState().draft?.terms).toBe('继续编辑的术语')
  expect(controller.store.getState().snapshot?.settings.localModelId).toBe('sensevoice-small')
  expect(voice.configure).not.toHaveBeenCalled()
})

test('迟到的目录轮询不能把已完成下载恢复成旧下载进度', async () => {
  const { controller, voice, read } = await fixture(), gate = deferred()
  const model = { id: 'whisper-tiny' as const, name: 'Whisper Tiny', languages: ['auto' as const], licenseUrl: 'https://example.test/license', bytes: 42, ready: false, download: { received: 3, total: 42 } }
  const previous: VoiceSnapshot = { ...structuredClone(read()), models: [model] }
  voice.snapshot.mockImplementationOnce(async () => { await gate.promise; return previous })
  const polling = controller.refreshModels()
  read().models = [{ ...model, ready: true, download: undefined }]
  await controller.refreshModels()
  gate.resolve(); await polling
  expect(controller.store.getState().models?.[0]).toMatchObject({ ready: true, download: undefined })
})

test('离开再进入复用已确认快照，过期后才背景读取', async () => {
  const { controller, voice } = await fixture(), now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const stop = controller.activate(); stop()
  const stopAgain = controller.activate(); await controller.load(); stopAgain()
  expect(voice.snapshot).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + 60_001)
  const stopExpired = controller.activate(); await controller.load(); stopExpired()
  expect(voice.snapshot).toHaveBeenCalledTimes(2)
})

test('重进复用新鲜模型目录，过期或操作后仍可重新核实', async () => {
  const { controller, voice } = await fixture(), now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  await controller.refreshModels(false); await controller.refreshModels(false)
  expect(voice.snapshot).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + 5001)
  await controller.refreshModels(false)
  expect(voice.snapshot).toHaveBeenCalledTimes(2)
  await controller.refreshModels()
  expect(voice.snapshot).toHaveBeenCalledTimes(3)
})

test('未显示时变更只失效，重进才读取并更新', async () => {
  const { controller, voice, external, emit } = await fixture()
  external(); emit({ type: 'changed' })
  expect(voice.snapshot).toHaveBeenCalledTimes(1)
  expect(controller.store.getState().snapshot?.settings.language).toBe('auto')
  const stop = controller.activate(); await controller.load(); stop()
  expect(voice.snapshot).toHaveBeenCalledTimes(2)
  expect(controller.store.getState().snapshot?.settings.language).toBe('en')
})

test('背景读取合并并发请求，期间编辑的草稿不被返回覆盖', async () => {
  const { controller, voice, read } = await fixture(), gate = deferred(), old = structuredClone(read())
  voice.snapshot.mockImplementationOnce(async () => { await gate.promise; return old })
  const first = controller.load(true), second = controller.load(true)
  expect(voice.snapshot).toHaveBeenCalledTimes(2)
  expect(controller.store.getState().snapshot).toBeDefined()
  controller.edit(draft => ({ ...draft, terms: '读取途中输入' }))
  gate.resolve(); await Promise.all([first, second])
  expect(controller.store.getState().draft?.terms).toBe('读取途中输入')
  expect(await controller.flush()).toBe(true)
  expect(voice.configure.mock.calls[0]![0].settings.terms[0]?.word).toBe('读取途中输入')
})

test('刷新失败保留上次数据，随后重进重试而不误判为新鲜', async () => {
  const { controller, voice, control } = await fixture()
  control.readFailure = true; await controller.load(true)
  expect(controller.store.getState().snapshot).toBeDefined()
  expect(controller.store.getState().error).toBe('读取失败')
  control.readFailure = false; await controller.load()
  expect(voice.snapshot).toHaveBeenCalledTimes(3)
  expect(controller.store.getState().error).toBeUndefined()
})

test('API切换后旧读取及旧写入回执均不能进入新环境', async () => {
  const { controller, voice, control, read } = await fixture(), readGate = deferred(), writeGate = deferred(), old = structuredClone(read())
  voice.snapshot.mockImplementationOnce(async () => { await readGate.promise; return old })
  const reading = controller.load(true)
  controller.edit(draft => ({ ...draft, terms: '旧环境草稿' }))
  control.gate = writeGate.promise
  const writing = controller.flush(); await Promise.resolve()
  const nextSnapshot = { ...old, settings: { ...old.settings, revision: 9, language: 'ja' as const } }
  const nextVoice = { snapshot: vi.fn(async () => nextSnapshot) }
  controller.initialize({ voice: nextVoice, request: vi.fn(async () => {}), subscribe: () => () => {} } as unknown as DesktopApi)
  await controller.load()
  readGate.resolve(); writeGate.resolve(); await reading
  expect(await writing).toBe(false)
  expect(controller.store.getState().snapshot?.settings).toEqual(nextSnapshot.settings)
  expect(controller.store.getState().draft).toBeUndefined()
  expect(controller.store.getState().saving).toBe(false)
})

test('下载目录刷新只更新模型状态，不覆盖配置或草稿', async () => {
  const { controller, voice, read } = await fixture()
  controller.edit(draft => ({ ...draft, terms: '保留输入' }))
  const model = { id: 'whisper-tiny' as const, name: 'Whisper Tiny', languages: ['auto' as const], licenseUrl: 'https://example.test/license', bytes: 42, ready: true }
  voice.snapshot.mockResolvedValueOnce({ ...read(), models: [model], settings: { ...read().settings, language: 'en' } })
  await controller.refreshModels()
  expect(controller.store.getState().models).toEqual([model])
  expect(controller.store.getState().snapshot?.settings.language).toBe('auto')
  expect(controller.store.getState().draft?.terms).toBe('保留输入')
})
