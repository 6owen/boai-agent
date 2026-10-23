// @vitest-environment jsdom
/*
 * [INPUT]: Renderer外观状态、共享偏好与隔离DOM/宿主接口。
 * [OUTPUT]: 浅深色默认效果保持；三项归零移除各区域染色/高光/滤镜，独立即时预览、保存及移除图片清理回归。
 * [POS]: 外观Renderer模块回归，不启动Electron或真实用户配置。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appearanceDefaults, applyAppearancePatch, type AppearancePatch, type AppearanceSnapshot } from '../src/shared/appearance'
import type { DesktopApi } from '../src/shared/ipc'

vi.mock('../src/renderer/components/common', () => ({ errorText: (error: unknown) => String(error) }))

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
  const { initializeAppearance, previewAppearance, flushAppearance, appearanceAction } = await import('../src/renderer/stores/appearance')
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
