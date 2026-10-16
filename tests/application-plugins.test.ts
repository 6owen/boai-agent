/*
 * [OUTPUT]: 运行时包生命周期/线协议、Pi与ACP连续会话/真实工具副作用及独立模块安装；真实Pi探针显式选择。
 * [INPUT]: 生产插件目录/配置存储/生命周期与真实临时文件、外观配置。
 * [OUTPUT]: 声明边界、持久/CAS/坏配置/写失败及显式深色图片的主题停用恢复合同回归。
 * [POS]: 内置插件平台模块验证；实际设置操作归Electron BDD。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginSettingsStore } from '../src/main/plugin-settings'
import { AppearanceStore } from '../src/main/appearance'
import { applicationPlugins, definePluginCatalog, themePluginId } from '../src/shared/plugins/catalog'
import { pluginAvailability } from '../src/shared/plugins/types'
import { PluginUsage } from '../src/shared/plugins/usage'
import { availableThemes, resolveAppearanceTheme } from '../src/shared/appearance'

const roots: string[] = [], textId = 'boai.preview.text', themeId = 'boai.theme.base46'
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-plugins-')); roots.push(root)
  const path = join(root, 'application-plugins.json'), changed = vi.fn()
  const store = new PluginSettingsStore(path, changed); await store.init()
  return { root, path, changed, store }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

test('one immutable catalog supplies preview and theme identities without mutating declarations', () => {
  expect(applicationPlugins).toHaveLength(6)
  expect(themePluginId('nord')).toBe(themeId)
  expect(themePluginId('boai-dark')).toBeUndefined()
  const input = structuredClone(applicationPlugins), catalog = definePluginCatalog(input)
  Object.assign(input[0], { name: 'changed' })
  expect(catalog[0].name).toBe('文本预览')
  expect(Object.isFrozen(catalog[0].contributions[0])).toBe(true)
  expect(() => definePluginCatalog([input[0], input[0]])).toThrow('Duplicate plugin')
  expect(() => definePluginCatalog([{ ...input[0], contributions: [input[0].contributions[0], input[0].contributions[0]] }])).toThrow('Duplicate contribution')
})

test('invalid declarations, reserved theme ids and CSS injection are rejected', () => {
  const palette = applicationPlugins.find(plugin => plugin.id === themeId)!
  const contribution = palette.contributions[0]
  if (contribution.type !== 'theme') throw new Error('Expected theme')
  for (const theme of [{ ...contribution.themes[0], id: 'boai-dark' }, { ...contribution.themes[0], accent: 'url(https://example.test)' }]) {
    expect(() => definePluginCatalog([{ ...palette, contributions: [{ type: 'theme', themes: [theme] }] }])).toThrow()
  }
  for (const patch of [{ id: '../module' }, { version: 'latest' }, { apiVersion: 0 }, { contributions: [] }, { entry: 'file:///private' }]) {
    expect(() => definePluginCatalog([{ ...applicationPlugins[0], ...patch }] as never)).toThrow()
  }
  const future = { ...applicationPlugins[0], apiVersion: 3 }
  expect(pluginAvailability(future, { disabledIds: [], revision: 0 })).toBe('incompatible')
})

test('settings are serial, CAS-protected, atomically persisted and restored without duplicate events', async () => {
  const { path, store, changed } = await setup()
  const writes = await Promise.allSettled([
    store.update({ id: textId, enabled: false, expectedRevision: 0 }),
    store.update({ id: themeId, enabled: false, expectedRevision: 0 }),
  ])
  expect(writes.map(value => value.status)).toEqual(['fulfilled', 'rejected'])
  expect(store.snapshot()).toEqual({ revision: 1, disabledIds: [textId] })
  expect(changed).toHaveBeenCalledTimes(1)
  await store.update({ id: textId, enabled: false, expectedRevision: 1 })
  expect(changed).toHaveBeenCalledTimes(1)
  await store.flush()
  const reopened = new PluginSettingsStore(path, vi.fn()); await reopened.init()
  expect(reopened.snapshot()).toEqual(store.snapshot())
  const copy = reopened.snapshot(); (copy.disabledIds as string[]).push('fake')
  expect(reopened.snapshot().disabledIds).toEqual([textId])
  await reopened.update({ id: textId, enabled: true, expectedRevision: 1 })
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ schemaVersion: 1, revision: 2, disabledIds: [] })
})

test.each(['{broken', JSON.stringify({ schemaVersion: 2, revision: 7, disabledIds: [] }), 'x'.repeat(32_769)])('unreadable/future configuration is preserved byte for byte and cannot be rewritten (%#)', async bytes => {
  const { path } = await setup(); await writeFile(path, bytes)
  const store = new PluginSettingsStore(path, vi.fn()); await store.init()
  expect(store.snapshot()).toMatchObject({ readOnly: true, disabledIds: applicationPlugins.map(plugin => plugin.id) })
  await expect(store.update({ id: textId, enabled: true, expectedRevision: 0 })).rejects.toThrow('原文件已保留')
  expect(await readFile(path, 'utf8')).toBe(bytes)
})

test('unknown disabled ids survive upgrades while unknown writes and incompatible activation are rejected', async () => {
  const { path } = await setup()
  await writeFile(path, JSON.stringify({ schemaVersion: 1, revision: 4, disabledIds: ['future.pack', 'future.pack'] }))
  const store = new PluginSettingsStore(path, vi.fn(), [...applicationPlugins, { ...applicationPlugins[0], id: 'future.pack', apiVersion: 3 }]); await store.init()
  await expect(store.update({ id: 'unknown', enabled: true, expectedRevision: 4 })).rejects.toThrow('找不到')
  await expect(store.update({ id: 'future.pack', enabled: true, expectedRevision: 4 })).rejects.toThrow('不兼容')
  await store.update({ id: textId, enabled: false, expectedRevision: 4 })
  expect(store.snapshot().disabledIds).toEqual([textId, 'future.pack'])
  for (const patch of [{ enabled: 'yes' }, { path: '/tmp/arbitrary' }, { expectedRevision: -1 }]) {
    await expect(store.update({ id: textId, enabled: true, expectedRevision: 5, ...patch } as never)).rejects.toThrow()
  }
})

test('write failure publishes nothing and a subsequent explicit operation can succeed', async () => {
  const { path, store, changed } = await setup(); await mkdir(path)
  await expect(store.update({ id: textId, enabled: false, expectedRevision: 0 })).rejects.toThrow()
  expect(changed).not.toHaveBeenCalled(); expect(store.snapshot()).toEqual({ revision: 0, disabledIds: [] })
  await rm(path, { recursive: true })
  await store.update({ id: textId, enabled: false, expectedRevision: 0 })
  expect(changed).toHaveBeenCalledTimes(1)
})

test('view leases are independent, release once, and store only a bounded failure category', () => {
  const usage = new PluginUsage([textId]), listener = vi.fn(), stop = usage.subscribe(listener)
  const first = usage.acquire(textId), second = usage.acquire(textId)
  expect(usage.snapshot()[textId].views).toBe(2)
  const snapshot = usage.snapshot(); expect(usage.snapshot()).toBe(snapshot)
  first(); first(); expect(usage.snapshot()[textId].views).toBe(1)
  usage.fail(textId); second()
  expect(usage.snapshot()[textId]).toEqual({ views: 0, failure: 'viewer-failed' })
  usage.clearFailure(textId); expect(usage.snapshot()).toEqual({})
  stop(); const count = listener.mock.calls.length; usage.acquire(textId)()
  expect(listener).toHaveBeenCalledTimes(count)
  expect(() => usage.acquire('unknown')).toThrow()
})

test('disabled theme fallback preserves the saved theme, custom colors and Scenic across restart/re-enable', async () => {
  const { root, path, store } = await setup()
  const disabled = () => store.snapshot().disabledIds
  const appearanceRoot = join(root, 'appearance')
  const appearance = new AppearanceStore(appearanceRoot, () => false, vi.fn(), () => ({ width: 1, height: 1 }), disabled)
  await appearance.init()
  await appearance.update({ mode: 'dark', themeIds: { dark: 'nord' }, customColors: { dark: { accent: '#3399cc' } } }, 0)
  const image = join(root, 'scenery.png')
  await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MxsAAAAASUVORK5CYII=', 'base64'))
  const original = await appearance.import(image)
  const originalBytes = await readFile(join(appearanceRoot, 'settings.json'), 'utf8')
  await store.update({ id: themeId, enabled: false, expectedRevision: 0 })
  expect(appearance.snapshot()).toMatchObject({ resolvedMode: 'dark', resolvedThemeId: 'boai-dark', preferences: original.preferences })
  expect(availableThemes(disabled()).some(theme => theme.id === 'nord')).toBe(false)
  await expect(appearance.update({ themeIds: { dark: 'nord' } }, original.revision)).rejects.toThrow('停用')
  const reloadedSettings = new PluginSettingsStore(path, vi.fn()); await reloadedSettings.init()
  const reopened = new AppearanceStore(appearanceRoot, () => false, vi.fn(), () => ({ width: 1, height: 1 }), () => reloadedSettings.snapshot().disabledIds)
  await reopened.init()
  expect(reopened.snapshot()).toMatchObject({ resolvedThemeId: 'boai-dark', preferences: original.preferences })
  expect(await readFile(join(appearanceRoot, 'settings.json'), 'utf8')).toBe(originalBytes)
  await reloadedSettings.update({ id: themeId, enabled: true, expectedRevision: 1 })
  expect(reopened.snapshot()).toMatchObject({ resolvedThemeId: 'nord', preferences: original.preferences })
  expect(resolveAppearanceTheme(reopened.snapshot().preferences, 'dark', [])).toHaveProperty('id', 'nord')
})
