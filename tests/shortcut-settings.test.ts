/*
 * [INPUT]: 生产快捷键合同、Main Store 与隔离文件。
 * [OUTPUT]: 语音快捷键默认关闭/旧配置投影与统一冲突；原平台、CAS和恢复回归保持。
 * [POS]: 快捷键模块测试，不操作用户偏好或系统热键。
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ShortcutSettingsStore } from '../apps/electron/src/main/shortcut-settings'
import { acceleratorBinding, bindingFromKey, matchShortcut, reservedShortcuts, shortcutDefaults, shortcutText, validateShortcuts, type ShortcutEntry, type ShortcutUpdate } from '../packages/shared/src/shortcuts'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const entry = (code: string | null, enabled = true, shift = false, alt = false): ShortcutEntry => ({ enabled, binding: code ? { code, shift, alt } : null })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-shortcuts-')); roots.push(root)
  const path = join(root, 'shortcut-settings.json'), changed = vi.fn()
  const store = new ShortcutSettingsStore(path, 'mac', reservedShortcuts('mac', true), changed)
  await store.init()
  return { store, path, root, changed }
}
const update = (patch: ShortcutUpdate['patch'], expectedRevision = 0): ShortcutUpdate => ({ patch, expectedRevision, requestId: randomUUID() })

test('缺少文件仅投影五项默认值，读取不写文件；启停和清空跨重启保持', async () => {
  const { store, path, root, changed } = await fixture()
  expect(store.snapshot().preferences).toEqual(shortcutDefaults()); expect(await readdir(root)).toEqual([])
  await store.update(update({ search: entry('KeyP', false, true), forward: entry(null) }))
  const reopened = new ShortcutSettingsStore(path, 'mac', reservedShortcuts('mac', true), changed); await reopened.init()
  expect(reopened.snapshot().revision).toBe(1)
  expect(reopened.snapshot().preferences.search).toEqual(entry('KeyP', false, true))
  expect(reopened.snapshot().preferences.forward).toEqual(entry(null))
  expect(changed).toHaveBeenCalledTimes(1)
})
test('同版本并发只提交一次，旧请求回执幂等且不回退较新配置', async () => {
  const { store, changed } = await fixture(), first = update({ search: entry('KeyP') }), second = update({ sidebar: entry('KeyL') })
  const results = await Promise.allSettled([store.update(first), store.update(second)])
  expect(results.map(value => value.status)).toEqual(['fulfilled', 'rejected'])
  expect((await store.receipt({ requestId: first.requestId, expectedRevision: first.expectedRevision })).state).toBe('committed')
  expect((await store.receipt({ requestId: second.requestId, expectedRevision: second.expectedRevision })).state).toBe('absent')
  await store.update(update({ sidebar: entry('KeyL') }, 1))
  expect((await store.update(first)).revision).toBe(2)
  await expect(store.update({ ...first, patch: { search: entry('KeyO') } })).rejects.toThrow('身份冲突')
  expect(changed).toHaveBeenCalledTimes(2)
})
test('已保存回执跨重启可核对，过旧且已淘汰的未知请求不能冒充未提交', async () => {
  const { store, path } = await fixture(), first = update({ search: entry('KeyP') })
  await store.update(first)
  const reopened = new ShortcutSettingsStore(path, 'mac', reservedShortcuts('mac', true), () => {}); await reopened.init()
  expect((await reopened.receipt({ requestId: first.requestId, expectedRevision: first.expectedRevision })).state).toBe('committed')
  const data = JSON.parse(await readFile(path, 'utf8')); data.revision = 200; data.receipts = [{ requestId: randomUUID(), revision: 200, fingerprint: '{}' }]
  await writeFile(path, JSON.stringify(data))
  const later = new ShortcutSettingsStore(path, 'mac', reservedShortcuts('mac', true), () => {}); await later.init()
  expect((await later.receipt({ requestId: first.requestId, expectedRevision: first.expectedRevision })).state).toBe('unknown')
})
test('重复启用拒绝而禁用重复允许，启用失败不改原配置或禁用另一项', async () => {
  const { store } = await fixture()
  await store.update(update({ sidebar: entry('KeyK', false) }))
  await expect(store.update(update({ sidebar: entry('KeyK') }, 1))).rejects.toThrow('全局搜索')
  expect(store.snapshot().preferences.sidebar).toEqual(entry('KeyK', false))
  expect(store.snapshot().preferences.search.enabled).toBe(true)
  await store.update(update({ search: entry('KeyP'), sidebar: entry('KeyK') }, 1))
  expect(store.snapshot().revision).toBe(2)
})
test('保留编辑/开发/实际菜单组合，恢复默认一次原子写入', async () => {
  const { store } = await fixture()
  store.setMenuReservations([{ binding: { code: 'KeyO', shift: true, alt: false }, label: '实际菜单' }])
  for (const binding of [entry('KeyC'), entry('KeyR'), entry('KeyI', true, false, true), entry('KeyO', true, true)]) {
    await expect(store.update(update({ search: binding }))).rejects.toThrow('占用')
    expect(store.snapshot().revision).toBe(0)
  }
  await store.update(update({ search: entry(null), sidebar: entry('KeyP', false) }))
  await store.update(update(shortcutDefaults(), 1))
  expect(store.snapshot().revision).toBe(2); expect(store.snapshot().preferences).toEqual(shortcutDefaults())
})
test.each(['{broken', JSON.stringify({ schemaVersion: 2, revision: 99, preferences: {} })])('损坏或未来版本文件保持只读且原字节保留：%s', async bytes => {
  const { path } = await fixture(); await writeFile(path, bytes)
  const store = new ShortcutSettingsStore(path, 'mac', reservedShortcuts('mac', true), () => {}); await store.init()
  expect(store.snapshot().error).toContain('原文件保留')
  await expect(store.update(update({ search: entry('KeyP') }))).rejects.toThrow('原文件保留')
  expect(await readFile(path, 'utf8')).toBe(bytes)
  expect((await store.receipt({ requestId: randomUUID(), expectedRevision: 0 })).state).toBe('unknown')
})
test('写盘失败无提交事件、不切换绑定、无成功回执', async () => {
  const { store, path, changed } = await fixture(); await mkdir(path)
  const request = update({ search: entry('KeyP') })
  await expect(store.update(request)).rejects.toThrow()
  expect(store.snapshot().revision).toBe(0); expect(store.snapshot().preferences).toEqual(shortcutDefaults())
  expect(changed).not.toHaveBeenCalled(); expect((await store.receipt({ requestId: request.requestId, expectedRevision: request.expectedRevision })).state).toBe('absent')
})
test('旧版本缺少新增动作使用默认值且不重写原文件', async () => {
  const { path } = await fixture(), bytes = JSON.stringify({ schemaVersion: 1, revision: 3, preferences: { search: entry('KeyP') } })
  await writeFile(path, bytes)
  const store = new ShortcutSettingsStore(path, 'mac', [], () => {}); await store.init()
  expect(store.snapshot().preferences).toEqual({ ...shortcutDefaults(), search: entry('KeyP') }); expect(await readFile(path, 'utf8')).toBe(bytes)
})

test('规范化按物理位置匹配括号/中英文键，精确修饰键并忽略 IME、重复和另一平台主修饰', () => {
  const event = { key: '【', code: 'BracketLeft', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, isComposing: false }
  const snapshot = { schemaVersion: 1 as const, platform: 'mac' as const, revision: 0, preferences: shortcutDefaults(), reserved: [] }
  expect(matchShortcut(event, snapshot)).toBe('back')
  for (const patch of [{ isComposing: true }, { repeat: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) expect(matchShortcut({ ...event, ...patch }, snapshot)).toBeUndefined()
  expect(bindingFromKey({ ...event, metaKey: false, ctrlKey: true }, 'other')?.code).toBe('BracketLeft')
  expect(bindingFromKey({ ...event, code: 'KeyK', key: 'Dead' }, 'mac')).toBeUndefined()
  expect(shortcutText(entry('BracketLeft', true, true, true).binding, 'mac')).toBe('⌘ ⌥ ⇧ [')
  expect(acceleratorBinding('CmdOrCtrl+Shift+P', 'mac')).toEqual({ code: 'KeyP', shift: true, alt: false })
  expect(acceleratorBinding('Control+Command+F', 'mac')).toBeUndefined()
  expect(() => validateShortcuts(shortcutDefaults(), reservedShortcuts('other', true))).not.toThrow()
})

test('legacy shortcut preferences gain disabled unbound voice input without rewriting the source', async () => {
  const { store, path } = await fixture()
  const { voiceInput: _, ...preferences } = shortcutDefaults()
  const bytes = JSON.stringify({ schemaVersion: 1, revision: 4, preferences, receipts: [] })
  await writeFile(path, bytes); await store.init()
  expect(store.snapshot().preferences.voiceInput).toEqual({ enabled: false, binding: null })
  expect(await readFile(path, 'utf8')).toBe(bytes)
  await expect(store.update(update({ voiceInput: entry('KeyK') }, 4))).rejects.toThrow('已用于')
  await store.update(update({ voiceInput: entry('KeyM', true, true) }, 4))
  expect(store.snapshot().preferences.voiceInput).toEqual(entry('KeyM', true, true))
  const key = { code: 'KeyM', key: 'M', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true, repeat: false, isComposing: false }
  expect(matchShortcut(key, store.snapshot())).toBe('voiceInput')
  expect(matchShortcut({ ...key, repeat: true }, store.snapshot())).toBeUndefined()
  expect(matchShortcut({ ...key, isComposing: true }, store.snapshot())).toBeUndefined()
})
