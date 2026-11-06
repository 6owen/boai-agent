// @vitest-environment jsdom
/*
 * [OUTPUT]: 未下载/引擎不可用隐藏开始入口及快捷键；下载、配置回执和窗口刷新恢复，录音中停止保持。
 * [INPUT]: Composer voice adapter, original shortcut store, controlled focus and key events.
 * [OUTPUT]: Only the active focused Composer starts; repeated/composing/captured/overlay keys do not start or send.
 * [POS]: Voice keyboard integration regression; microphone and ASR controller are controlled doubles.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVoiceInput } from '../apps/electron/src/renderer/pages/conversations/-components/use-voice-input'
import { usePlugins } from '../apps/electron/src/renderer/stores/plugins'
import { shortcuts } from '../apps/electron/src/renderer/stores/shortcuts'
import { voiceSettings } from '../apps/electron/src/renderer/stores/voice-settings'
import { shortcutDefaults } from '../packages/shared/src/shortcuts'
import { defaultVoiceSettings, type VoiceSnapshot } from '../packages/shared/src/plugins/voice-input'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { MentionInputHandle } from '../apps/electron/src/renderer/pages/conversations/-components/mention-input'
import type { VoiceUi } from '../packages/voice-input-plugin/src/controller'
const calls = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn(), cancel: vi.fn() }))
vi.mock('@boai/voice-input-plugin/controller', () => ({ VoiceController: class {
  state: VoiceUi = { phase: 'idle', preview: '' }
  constructor(_api: unknown, _draft: unknown, private change: (value: VoiceUi) => void) {}
  start() { calls.start(); this.state = { phase: 'recording', preview: '' }; this.change(this.state) }
  finish() { calls.finish(); this.state = { phase: 'idle', preview: '' }; this.change(this.state) }
  cancel() { calls.cancel() }
  insertPending() {}
  restoreRaw() {}
} }))
let root: Root, container: HTMLDivElement, focused: boolean
let snapshot: VoiceSnapshot
const readSnapshot = vi.fn(async () => structuredClone(snapshot))
const api = { voice: { snapshot: readSnapshot }, subscribe: () => () => {}, request: vi.fn() } as unknown as DesktopApi
const editor = { current: { hasFocus: () => focused } as MentionInputHandle }
function Probe({ active = true }: { active?: boolean }) {
  const voice = useVoiceInput(api, editor, 'chat:current', active, false)
  return h('div', null, voice.controls, voice.preview)
}
function key(patch: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', metaKey: true, shiftKey: true, bubbles: true, cancelable: true, ...patch })
  document.dispatchEvent(event); return event
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  focused = true; vi.clearAllMocks(); vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  voiceSettings.dispose()
  snapshot = { settings: defaultVoiceSettings(), models: [{ id: 'sensevoice-small', name: 'SenseVoice', ready: true, bytes: 100, languages: ['auto'], licenseUrl: 'https://example.test/license' }], localReady: true, supported: true, onlineKeyPresent: false, modelBytes: 100 }
  readSnapshot.mockImplementation(async () => structuredClone(snapshot))
  usePlugins.setState({ ready: true, settings: { revision: 0, disabledIds: [], enabledIds: ['boai.voice-input'] } })
  shortcuts.store.setState({ capturing: undefined, snapshot: { schemaVersion: 1, revision: 0, platform: 'mac', reserved: [], preferences: { ...shortcutDefaults(), voiceInput: { enabled: true, binding: { code: 'KeyM', shift: true, alt: false } } } } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(h(Probe)))
})
afterEach(async () => { await act(async () => root.unmount()); voiceSettings.dispose(); container.remove(); vi.restoreAllMocks() })
it('starts and stops the same active Composer and never invokes send', async () => {
  await act(async () => { expect(key().defaultPrevented).toBe(true) })
  expect(calls.start).toHaveBeenCalledOnce()
  await act(async () => { key() }); expect(calls.finish).toHaveBeenCalledOnce()
  expect(api.request).not.toHaveBeenCalled()
})
it('ignores other focus, repeat, composition, shortcut recording and inactive pages', async () => {
  focused = false; await act(async () => { key() }); focused = true
  await act(async () => { key({ repeat: true }); key({ isComposing: true }) })
  shortcuts.store.setState({ capturing: 'search' }); await act(async () => { key() })
  shortcuts.store.setState({ capturing: undefined }); await act(async () => root.render(h(Probe, { active: false })))
  await act(async () => { key() }); expect(calls.start).not.toHaveBeenCalled()
})
it('does not start through an open dialog or a disabled voice plugin', async () => {
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog)
  vi.spyOn(dialog, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  await act(async () => { key() }); expect(calls.start).not.toHaveBeenCalled(); dialog.remove()
  await act(async () => usePlugins.setState({ settings: { revision: 1, disabledIds: ['boai.voice-input'], enabledIds: [] } }))
  await act(async () => { key() }); expect(calls.start).not.toHaveBeenCalled()
})

it.each(['missing-model', 'missing-engine', 'read-only'] as const)('hides voice and leaves its shortcut untouched when %s', async reason => {
  if (reason === 'missing-model') {
    snapshot.localReady = false
    snapshot.models = [{ ...snapshot.models[0]!, id: 'whisper-tiny' }]
  } else if (reason === 'missing-engine') snapshot.supported = false
  else snapshot.readOnly = true
  await act(async () => { await voiceSettings.load(true) })
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
  await act(async () => { expect(key().defaultPrevented).toBe(false) })
  expect(calls.start).not.toHaveBeenCalled()
})

it('stays hidden until the first readiness snapshot arrives', async () => {
  await act(async () => root.render(h(Probe, { active: false })))
  await act(async () => voiceSettings.dispose())
  let resolve!: (value: VoiceSnapshot) => void
  readSnapshot.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await act(async () => root.render(h(Probe)))
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
  await act(async () => { key() })
  expect(calls.start).not.toHaveBeenCalled()
  await act(async () => { resolve(snapshot) })
  expect(container.querySelector('[aria-label="语音输入"]')).not.toBeNull()
})

it('updates from the model catalog after downloading without waiting for the settings cache', async () => {
  snapshot.localReady = false; snapshot.models[0]!.ready = false
  await act(async () => { await voiceSettings.load(true) })
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
  snapshot.localReady = true; snapshot.models[0]!.ready = true
  await act(async () => { await voiceSettings.refreshModels() })
  expect(voiceSettings.store.getState().snapshot?.localReady).toBe(false)
  const button = container.querySelector<HTMLButtonElement>('[aria-label="语音输入"]')
  expect(button).not.toBeNull()
  await act(async () => { button!.click() })
  expect(calls.start).toHaveBeenCalledOnce()
})

it('uses the saved selection and refreshes readiness when the window regains focus', async () => {
  snapshot.settings = { ...snapshot.settings, localModelId: 'whisper-base', revision: 1 }
  snapshot.localReady = false
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
  snapshot.settings = { ...snapshot.settings, localModelId: 'sensevoice-small', revision: 2 }
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(container.querySelector('[aria-label="语音输入"]')).not.toBeNull()
})

it('keeps configured online voice available without local models or a local engine', async () => {
  snapshot.settings = { ...snapshot.settings, mode: 'qwen-realtime', revision: 1 }
  snapshot.models = []; snapshot.localReady = false; snapshot.supported = false
  await act(async () => { await voiceSettings.load(true) })
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
  snapshot.onlineKeyPresent = true
  await act(async () => { await voiceSettings.load(true) })
  expect(container.querySelector('[aria-label="语音输入"]')).not.toBeNull()
  await act(async () => { key() })
  expect(calls.start).toHaveBeenCalledOnce()
})

it('preserves stop and cancel controls while recording if readiness changes', async () => {
  await act(async () => { key() })
  snapshot.models[0]!.ready = false
  await act(async () => { await voiceSettings.refreshModels() })
  expect(container.querySelector('[aria-label="停止录音"]')).not.toBeNull()
  expect(container.querySelector('[aria-label="取消语音输入"]')).not.toBeNull()
  await act(async () => { key() })
  expect(calls.finish).toHaveBeenCalledOnce()
  expect(container.querySelector('[aria-label="语音输入"]')).toBeNull()
})
