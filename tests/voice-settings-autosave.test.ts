/*
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
  let snapshot: VoiceSnapshot = { settings: defaultVoiceSettings(), localReady: false, supported: true, onlineKeyPresent: false, modelBytes: 100 }
  const listeners = new Set<(event: AppEvent) => void>()
  const control: { gate?: Promise<void>; failure?: string; readFailure?: boolean } = {}
  const voice = {
    snapshot: vi.fn(async () => { if (control.readFailure) throw new Error('读取失败'); return structuredClone(snapshot) }),
    configure: vi.fn(async (input: Parameters<VoiceApi['configure']>[0]) => {
      await control.gate
      if (control.failure) throw new Error(control.failure)
      if (input.expectedRevision !== snapshot.settings.revision) throw new Error('语音设置已变化，请重新读取')
      snapshot = { ...snapshot, settings: { ...input.settings, schemaVersion: 2, revision: input.expectedRevision + 1 } }
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
