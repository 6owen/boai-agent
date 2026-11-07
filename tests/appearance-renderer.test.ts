// @vitest-environment jsdom
/*
 * [OUTPUT]: 基准快照阻止事件提前到达后的覆盖；同字段冲突丢弃旧意图、保留后来pending，互不相交仅重试一次。
 * [INPUT]: Renderer外观状态、共享偏好与隔离DOM/宿主接口。
 * [OUTPUT]: 浅深色默认效果保持；三项归零移除各区域染色/高光/滤镜，独立即时预览、保存及移除图片清理回归。
 * [POS]: 外观Renderer模块回归，不启动Electron或真实用户配置。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appearanceDefaults, applyAppearancePatch, type AppearancePatch, type AppearanceSnapshot } from '../packages/shared/src/appearance'
import type { DesktopApi } from '../packages/shared/src/ipc'

vi.mock('../apps/electron/src/renderer/components/common', () => ({ errorText: (error: unknown) => String(error) }))

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers()
  Reflect.deleteProperty(window, 'boai')
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('class')
  for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key]
})

it.each(['light', 'dark'] as const)('clears every Scenic surface and blur in %s while keeping controls independent', async mode => {
  let saved: AppearanceSnapshot = {
    preferences: { ...structuredClone(appearanceDefaults), mode, background: { ...appearanceDefaults.background, assetId: '11111111-1111-1111-1111-111111111111.png' } },
    revision: 0, sequence: 0, resolvedMode: mode, resolvedThemeId: `boai-${mode}`,
  }
  const request = vi.fn(async (method: string, args?: { patch: AppearancePatch }) => {
    if (method === 'updateAppearance') saved = { ...saved, preferences: applyAppearancePatch(saved.preferences, args!.patch), revision: saved.revision + 1 }
    if (method === 'removeAppearanceBackground') saved = { ...saved, preferences: { ...saved.preferences, background: { ...saved.preferences.background, assetId: null } }, revision: saved.revision + 1 }
    return structuredClone(saved)
  })
  Object.defineProperty(window, 'boai', { configurable: true, value: { initialAppearance: saved, request, subscribe: vi.fn(() => () => {}) } as unknown as DesktopApi })
  const { initializeAppearance, previewAppearance, flushAppearance, appearanceAction } = await import('../apps/electron/src/renderer/stores/appearance')
  initializeAppearance()
  await Promise.resolve()
  const style = document.documentElement.style
  expect(style.getPropertyValue('--surface-app')).toMatch(/, 0\.12\)$/)
  expect(style.getPropertyValue('--surface-composer')).toMatch(/, 0\.15\)$/)
  expect(style.getPropertyValue('--scenic-backdrop-filter')).toBe('blur(8px)')

  previewAppearance({ background: { glassOpacity: 0 } })
  for (const surface of ['app', 'list', 'detail', 'composer']) expect(style.getPropertyValue(`--surface-${surface}`)).toMatch(/, 0\)$/)
  expect(style.getPropertyValue('--scenic-card-opacity')).toBe('0')
  expect(style.getPropertyValue('--scenic-glass-strength')).toBe('0')
  expect(style.getPropertyValue('--scenic-backdrop-filter')).toBe('blur(8px)')
  expect(style.getPropertyValue('--scenic-overlay-opacity')).toBe('0.4')

  previewAppearance({ background: { overlayOpacity: 0 } })
  previewAppearance({ background: { blurRadius: 0 } })
  expect(style.getPropertyValue('--scenic-overlay-opacity')).toBe('0')
  expect(style.getPropertyValue('--scenic-backdrop-filter')).toBe('none')
  await flushAppearance()
  expect(saved.preferences.background).toMatchObject({ glassOpacity: 0, overlayOpacity: 0, blurRadius: 0 })

  previewAppearance({ background: { glassOpacity: 0.3 } })
  expect(style.getPropertyValue('--surface-app')).not.toMatch(/, 0\)$/)
  expect(style.getPropertyValue('--scenic-overlay-opacity')).toBe('0')
  expect(style.getPropertyValue('--scenic-backdrop-filter')).toBe('none')
  await appearanceAction('removeAppearanceBackground')
  expect(document.documentElement.dataset.scenic).toBeUndefined()
  for (const variable of ['background-image', 'scenic-glass-opacity', 'scenic-glass-strength', 'scenic-card-opacity', 'scenic-overlay-opacity', 'scenic-backdrop-filter']) expect(style.getPropertyValue(`--${variable}`)).toBe('')
  expect(style.getPropertyValue('--surface-app')).toBe(mode === 'light' ? '#f6f6f6' : '#171717')
})

async function concurrentAppearance() {
  let saved: AppearanceSnapshot = { preferences: structuredClone(appearanceDefaults), revision: 0, sequence: 0, resolvedMode: 'light', resolvedThemeId: 'boai-light' }
  let subscribed: ((event: unknown) => void) | undefined
  let beforeWrite: (() => Promise<void>) | undefined
  const request = vi.fn(async (method: string, args?: { patch?: AppearancePatch; expectedRevision: number }) => {
    if (method === 'setUnsavedChanges') return
    if (method === 'updateAppearance') {
      const callback = beforeWrite; beforeWrite = undefined
      await callback?.()
      if (args!.expectedRevision !== saved.revision) throw Object.assign(new Error('APPEARANCE_CONFLICT'), { code: 'REVISION_CONFLICT' })
      saved = { ...saved, preferences: applyAppearancePatch(saved.preferences, args!.patch!), revision: saved.revision + 1, sequence: saved.sequence + 1 }
    }
    if (method === 'removeAppearanceBackground' || method === 'resetAppearance') {
      if (args!.expectedRevision !== saved.revision) throw new Error('APPEARANCE_CONFLICT')
      saved = { ...saved, revision: saved.revision + 1 }
    }
    return structuredClone(saved)
  })
  Object.defineProperty(window, 'boai', { configurable: true, value: { initialAppearance: saved, request, subscribe: (listener: (event: unknown) => void) => { subscribed = listener; return () => {} } } as unknown as DesktopApi })
  const api = await import('../apps/electron/src/renderer/stores/appearance')
  api.initializeAppearance(); await Promise.resolve()
  return { ...api, request, read: () => saved, beforeWrite: (callback: () => Promise<void>) => { beforeWrite = callback }, external: (patch: AppearancePatch, notify = false) => {
    saved = { ...saved, preferences: applyAppearancePatch(saved.preferences, patch), revision: saved.revision + 1, sequence: saved.sequence + 1 }
    if (notify) subscribed?.({ type: 'appearance:changed', appearance: structuredClone(saved) })
  } }
}

it('drops a stale same-field intent even when an event arrives before the pending save', async () => {
  const api = await concurrentAppearance()
  api.previewAppearance({ typography: { ui: { sizePx: 15 } } })
  expect(api.useAppearance.getState().preview.preferences.typography.content.sizePx).toBe(15)
  api.external({ typography: { ui: { sizePx: 18 }, content: { sizePx: 18 } } }, true)
  await api.flushAppearance()
  expect(api.read().preferences.typography.ui.sizePx).toBe(18)
  expect(api.request.mock.calls.filter(([method]) => method === 'updateAppearance')).toHaveLength(1)
  expect(api.useAppearance.getState()).toMatchObject({ status: 'saved', error: expect.stringContaining('冲突'), preview: { preferences: { typography: { ui: { sizePx: 18 } } } } })
  await api.flushAppearance()
  expect(api.request.mock.calls.filter(([method]) => method === 'updateAppearance')).toHaveLength(1)
})

it('merges only disjoint external edits using one checked retry', async () => {
  const api = await concurrentAppearance()
  api.previewAppearance({ mode: 'dark' })
  api.external({ zoomFactor: 1.25 })
  await api.flushAppearance()
  expect(api.read().preferences).toMatchObject({ mode: 'dark', zoomFactor: 1.25 })
  const calls = api.request.mock.calls.filter(([method]) => method === 'updateAppearance')
  expect(calls).toHaveLength(2)
  expect(calls[0][1]).toMatchObject({ expectedRevision: 0, contractVersion: 2 })
  expect(calls[1][1]).toMatchObject({ expectedRevision: 1 })
})

it('preserves later pending edits when the in-flight intent conflicts', async () => {
  const api = await concurrentAppearance()
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  api.beforeWrite(() => { entered(); return new Promise<void>(resolve => { release = resolve }) })
  api.previewAppearance({ typography: { ui: { sizePx: 15 } } })
  const flushing = api.flushAppearance()
  await started
  api.previewAppearance({ zoomFactor: 1.1 })
  api.external({ typography: { ui: { sizePx: 18 }, content: { sizePx: 18 } } })
  release()
  await flushing
  expect(api.read().preferences).toMatchObject({ zoomFactor: 1.1, typography: { ui: { sizePx: 18 }, content: { sizePx: 18 } } })
  const patches = api.request.mock.calls.filter(([method]) => method === 'updateAppearance').map(([, input]) => input?.patch)
  expect(patches.filter(patch => patch?.typography?.ui?.sizePx === 15)).toHaveLength(1)
  expect(api.useAppearance.getState().status).toBe('saved')
})

it('sends the visible revision with destructive appearance actions', async () => {
  const api = await concurrentAppearance()
  api.external({ mode: 'dark' }, true)
  await api.appearanceAction('removeAppearanceBackground')
  expect(api.request).toHaveBeenCalledWith('removeAppearanceBackground', { expectedRevision: 1 })
})


it('retains a later same-field edit for explicit retry without allowing background flush to overwrite it', async () => {
  const api = await concurrentAppearance()
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  api.beforeWrite(() => { entered(); return new Promise<void>(resolve => { release = resolve }) })
  api.previewAppearance({ typography: { ui: { sizePx: 15 } } })
  const flushing = api.flushAppearance()
  await started
  api.previewAppearance({ typography: { ui: { sizePx: 16 } } })
  api.external({ typography: { ui: { sizePx: 18 }, content: { sizePx: 18 } } })
  release(); await flushing
  expect(api.read().preferences.typography.ui.sizePx).toBe(18)
  expect(api.useAppearance.getState()).toMatchObject({ status: 'error', preview: { preferences: { typography: { ui: { sizePx: 16 } } } } })
  await api.flushAppearance()
  expect(api.request.mock.calls.filter(([method]) => method === 'updateAppearance')).toHaveLength(1)
  await api.flushAppearance(true)
  expect(api.read().preferences.typography.ui.sizePx).toBe(16)
  expect(api.request.mock.calls.filter(([method]) => method === 'updateAppearance')).toHaveLength(2)
})
