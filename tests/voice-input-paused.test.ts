// @vitest-environment jsdom
/*
 * [INPUT]: Production catalog, real settings/composer components and previously enabled voice preferences.
 * [OUTPUT]: Hidden settings/plugin entries, old-route fallback and no recording/config reads or shortcut interception.
 * [POS]: Temporary voice-input suspension regression; no microphone, Electron or external model access.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { shortcutDefaults } from '../packages/shared/src/shortcuts'
import { usePlugins } from '../apps/electron/src/renderer/stores/plugins'
import { shortcuts } from '../apps/electron/src/renderer/stores/shortcuts'
import { voiceSettings } from '../apps/electron/src/renderer/stores/voice-settings'
import { useVoiceInput } from '../apps/electron/src/renderer/pages/conversations/-components/use-voice-input'
import type { MentionInputHandle } from '../apps/electron/src/renderer/pages/conversations/-components/mention-input'
import { SettingsPage } from '../apps/electron/src/renderer/pages/settings'
import { PluginSettingsPage } from '../apps/electron/src/renderer/pages/settings/plugins'

// These children are unrelated to the suspended entry points under test.
vi.mock('../apps/electron/src/renderer/pages/settings/connections', () => ({ ConnectionSettings: () => h('div', { 'data-connection-settings': true }, '模型连接') }))
vi.mock('../apps/electron/src/renderer/pages/settings/runtime-plugins', () => ({ RuntimePluginManager: () => null }))
const snapshot = vi.fn(), start = vi.fn(), request = vi.fn()
const api = { voice: { snapshot, start }, request, subscribe: vi.fn(() => () => {}) } as unknown as DesktopApi
const editor = { current: { hasFocus: () => true } as MentionInputHandle }
let host: HTMLDivElement, root: Root
function Probe() {
  const voice = useVoiceInput(api, editor, 'chat:paused-voice', true, false)
  return h('div', null, voice.controls, voice.preview)
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.clearAllMocks(); voiceSettings.dispose()
  usePlugins.setState({ ready: true, settings: { revision: 3, disabledIds: [], enabledIds: ['boai.voice-input'] }, busy: undefined, error: '' })
  shortcuts.store.setState({ capturing: undefined, snapshot: { schemaVersion: 1, revision: 3, platform: 'mac', reserved: [], preferences: { ...shortcutDefaults(), voiceInput: { enabled: true, binding: { code: 'KeyM', shift: true, alt: false } } } } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); voiceSettings.dispose(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('ignores saved enablement and shortcut without reading voice settings or starting capture', async () => {
  await act(async () => root.render(h(Probe)))
  const event = new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
  await act(async () => document.dispatchEvent(event))
  expect(host.querySelector('[aria-label="语音输入"]')).toBeNull()
  expect(event.defaultPrevented).toBe(false)
  expect(snapshot).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled()
  expect(usePlugins.getState().settings.enabledIds).toEqual(['boai.voice-input'])
})

it('falls back from a previously selected voice settings page without mounting it', async () => {
  await act(async () => root.render(h(SettingsPage, {
    api, snapshot: { connections: [] } as unknown as Snapshot, refresh: async () => {}, divider: null,
    tab: 'voice-input', setTab: vi.fn(), active: true, onOpenSkills: vi.fn(),
  })))
  expect(host.querySelector('[data-connection-settings]')).not.toBeNull()
  expect(host.querySelector('[aria-label="语音输入设置"]')).toBeNull()
  expect(host.querySelector('[aria-label="设置分类"]')?.textContent).not.toContain('语音输入')
  expect(snapshot).not.toHaveBeenCalled()
})

it('does not expose the voice plugin or its configuration action even with old enablement', async () => {
  await act(async () => root.render(h(PluginSettingsPage, { api, active: false })))
  expect(host.querySelector('[aria-label="语音输入"]')).toBeNull()
  expect(host.querySelector('[aria-label="配置语音输入"]')).toBeNull()
  expect(host.textContent).not.toContain('语音输入')
})
