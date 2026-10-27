// @vitest-environment jsdom
/*
 * [OUTPUT]: 快捷键第五行默认关闭/未绑定；原捕获、自动保存与未知回执回归保持。
 * [INPUT]: 实际设置组件、页外 Controller 和可控 Main 回执端口。
 * [OUTPUT]: 候选/启停、clickoutside/Tab/失焦、同一行原子提交、并发/失败/未知及原导航确认回归。
 * [POS]: 快捷键组件与状态回归；原五场桌面流程单独保留。
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { shortcutDefaults, reservedShortcuts, validateShortcuts, type ShortcutSnapshot, type ShortcutUpdate } from '../packages/shared/src/shortcuts'
import { shortcuts, ShortcutController } from '../apps/electron/src/renderer/stores/shortcuts'
import { ShortcutSettings } from '../apps/electron/src/renderer/pages/settings/shortcuts'
import { useEditorGuard } from '../apps/electron/src/renderer/components/common/use-editor-guard'

let host: HTMLDivElement, root: Root
const controllers: ShortcutController[] = []
function fixture(controller = new ShortcutController()) {
  controllers.push(controller)
  let snapshot: ShortcutSnapshot = { schemaVersion: 1, revision: 0, platform: 'mac', preferences: shortcutDefaults(), reserved: reservedShortcuts('mac', true) }
  const writes: ShortcutUpdate[] = [], receipts = new Set<string>(), listeners = new Set<(event: AppEvent) => void>()
  const controls: { beforeWrite?: (input: ShortcutUpdate) => Promise<void>; afterWrite?: () => void; receiptError?: boolean; capture?: Promise<boolean> } = {}
  const emit = (event: AppEvent) => { for (const listener of listeners) listener(event) }
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'getShortcutSettings') return structuredClone(snapshot)
    if (method === 'setShortcutCapture') return controls.capture ?? true
    if (method === 'setUnsavedChanges' || method === 'completeShortcutFlush') return
    if (method === 'getShortcutReceipt') {
      if (controls.receiptError) throw new Error('回执暂不可读')
      return { state: receipts.has(input.requestId) ? 'committed' : 'absent', snapshot: structuredClone(snapshot) }
    }
    if (method === 'updateShortcutSettings') {
      writes.push(input); await controls.beforeWrite?.(input)
      if (input.expectedRevision !== snapshot.revision) throw new Error('SHORTCUT_CONFLICT')
      const preferences = { ...snapshot.preferences, ...input.patch }; validateShortcuts(preferences, snapshot.reserved)
      snapshot = { ...snapshot, revision: snapshot.revision + 1, preferences }
      receipts.add(input.requestId); emit({ type: 'shortcuts:changed', settings: structuredClone(snapshot) }); controls.afterWrite?.()
      return structuredClone(snapshot)
    }
    throw new Error(`Unexpected ${method}`)
  })
  const api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } } as unknown as DesktopApi
  controller.initialize(api)
  return { controller, api, writes, controls, emit, request, snapshot: () => snapshot, external(patch: ShortcutUpdate['patch']) { snapshot = { ...snapshot, revision: snapshot.revision + 1, preferences: { ...snapshot.preferences, ...patch } }; emit({ type: 'shortcuts:changed', settings: structuredClone(snapshot) }) } }
}
const binding = (code: string, shift = false, alt = false) => ({ code, shift, alt })
const control = (id = 'search') => document.querySelector<HTMLButtonElement>(`[data-shortcut-recorder=${id}]`)!
const toggle = (id = 'search') => document.querySelector<HTMLButtonElement>(`[data-shortcut-switch=${id}] [role=switch]`)!
const press = (key: string, code: string, extras: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, metaKey: true, ...extras }))
const outside = (target: HTMLElement = document.body) => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
async function setupUI() { const f = fixture(shortcuts); await act(async () => { await shortcuts.reload(); root.render(h(ShortcutSettings)) }); return f }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  vi.spyOn(toast, 'error').mockReturnValue('error')
  shortcuts.store.setState({ snapshot: undefined, drafts: {}, capturing: undefined, captureReady: false, busy: [], unknown: false, error: undefined })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); for (const controller of controllers.splice(0)) controller.dispose(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

test('初次五行稳定占位、不可编辑假默认；已读后有开关和组合键，无保存按钮', async () => {
  let resolve!: (snapshot: ShortcutSnapshot) => void
  const api = { request: vi.fn((method: string) => method === 'getShortcutSettings' ? new Promise(value => { resolve = value }) : Promise.resolve()), subscribe: () => () => {} } as unknown as DesktopApi
  shortcuts.initialize(api); controllers.push(shortcuts)
  await act(async () => root.render(h(ShortcutSettings)))
  expect(document.querySelectorAll('[role=switch]')).toHaveLength(5)
  expect([...document.querySelectorAll<HTMLButtonElement>('[role=switch]')].every(item => item.disabled || item.getAttribute('aria-disabled') === 'true')).toBe(true)
  await act(async () => resolve({ schemaVersion: 1, revision: 0, platform: 'mac', preferences: shortcutDefaults(), reserved: [] }))
  expect(document.querySelectorAll('kbd')).toHaveLength(5)
  expect(document.querySelector('[aria-label="语音输入"]')?.getAttribute('aria-checked')).toBe('false')
  expect(document.querySelector('[data-shortcut-recorder=voiceInput]')?.textContent).toBe('无')
  expect([...document.querySelectorAll('button')].some(item => /^(保存|应用|完成)$/.test(item.textContent ?? ''))).toBe(false)
})
test('候选不替换实际绑定，点击不可聚焦空白和随后 blur 只保存一次', async () => {
  const f = await setupUI()
  await act(async () => control().click())
  expect(control().textContent).toContain('按下组合键')
  await act(async () => press('P', 'KeyP', { shiftKey: true }))
  expect(f.writes).toHaveLength(0); expect(f.snapshot().preferences.search.binding?.code).toBe('KeyK')
  await act(async () => { outside(); control().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
  await shortcuts.flush()
  expect(f.writes).toHaveLength(1); expect(f.snapshot().preferences.search.binding).toEqual(binding('KeyP', true))
  expect(f.request.mock.calls.filter(([method, value]) => method === 'setShortcutCapture' && value.active === false)).toHaveLength(1)
})
test('改键直接点击本行开关只提交一个包含绑定和启停的 patch', async () => {
  const f = await setupUI()
  await act(async () => control().click()); await act(async () => press('p', 'KeyP'))
  await act(async () => { outside(toggle()); control().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: toggle() })); toggle().click() })
  expect(f.writes).toHaveLength(1)
  expect(f.writes[0].patch).toEqual({ search: { enabled: false, binding: binding('KeyP') } })
  expect(f.snapshot().preferences.search.enabled).toBe(false)
})
test.each(['Tab', 'blur'])('%s 退出自动保存；未输入退出不写入', async exit => {
  const f = await setupUI(); await act(async () => control().click())
  await act(async () => { if (exit === 'Tab') press('Tab', 'Tab', { metaKey: false }); else window.dispatchEvent(new Event('blur')) })
  expect(f.writes).toHaveLength(0)
  await act(async () => control().click()); await act(async () => press('p', 'KeyP'))
  await act(async () => { if (exit === 'Tab') press('Tab', 'Tab', { metaKey: false }); else window.dispatchEvent(new Event('blur')) })
  expect(f.writes).toHaveLength(1); expect(shortcuts.store.getState().capturing).toBeUndefined()
})
test('Esc 取消、纯修饰/IME/repeat 忽略、删除清空保留启用，关闭项编辑不自动开启', async () => {
  const f = await setupUI()
  await act(async () => control().click())
  await act(async () => { press('Shift', 'ShiftLeft'); press('p', 'KeyP', { isComposing: true }); press('p', 'KeyP', { repeat: true }); outside() })
  expect(f.writes).toHaveLength(0)
  await act(async () => control().click()); await act(async () => { press('p', 'KeyP'); press('Escape', 'Escape'); outside() })
  expect(f.writes).toHaveLength(0)
  await act(async () => control().click()); await act(async () => { press('Backspace', 'Backspace', { metaKey: false }); outside() })
  expect(f.snapshot().preferences.search).toEqual({ enabled: true, binding: null })
  await act(async () => toggle().click()); await act(async () => control().click()); await act(async () => { press('p', 'KeyP'); outside() })
  expect(f.snapshot().preferences.search).toEqual({ enabled: false, binding: binding('KeyP') })
})
test('非法裸键及菜单保留组合不改保存值，冲突保留草稿且不关掉占用项', async () => {
  const f = await setupUI()
  for (const [key, code, metaKey] of [['p', 'KeyP', false], ['c', 'KeyC', true], ['b', 'KeyB', true]] as const) {
    await act(async () => control().click()); await act(async () => { press(key, code, { metaKey }); outside() })
    expect(f.snapshot().preferences).toEqual(shortcutDefaults()); expect(shortcuts.store.getState().drafts.search).toBeDefined()
    expect(toast.error).toHaveBeenCalled()
    await act(async () => control().click()); await act(async () => press('Escape', 'Escape'))
  }
  expect(f.writes).toHaveLength(0)
})
test('录入捕获未获 Main 确认不接收按键，提前失焦不会重新启用迟到租约', async () => {
  const f = await setupUI(); let release!: (ready: boolean) => void
  f.controls.capture = new Promise(resolve => { release = resolve })
  await act(async () => control().click())
  await act(async () => { press('p', 'KeyP'); window.dispatchEvent(new Event('blur')) })
  await act(async () => release(true))
  expect(shortcuts.store.getState().capturing).toBeUndefined(); expect(f.writes).toHaveLength(0)
})
test('保存失败草稿跨卸载保留，重新录入退出重试', async () => {
  const f = await setupUI(); f.controls.beforeWrite = async () => { throw new Error('磁盘写入失败') }
  await act(async () => control().click()); await act(async () => { press('p', 'KeyP'); outside() })
  expect(shortcuts.store.getState().drafts.search?.error).toContain('磁盘')
  await act(async () => root.render(null)); expect(shortcuts.hasWork()).toBe(true)
  f.controls.beforeWrite = undefined
  await act(async () => root.render(h(ShortcutSettings)))
  await act(async () => control().click()); await act(async () => outside())
  expect(shortcuts.hasWork()).toBe(false); expect(f.snapshot().preferences.search.binding?.code).toBe('KeyP')
})
test('连续两行写入串行，前行在途不会被第二行的旧全量快照覆盖', async () => {
  const f = fixture(); await f.controller.reload()
  let release!: () => void; f.controls.beforeWrite = () => new Promise(resolve => { release = resolve })
  await f.controller.begin('search'); f.controller.record(binding('KeyP')); f.controller.finish()
  await Promise.resolve()
  await f.controller.begin('sidebar'); f.controller.record(binding('KeyL')); f.controller.finish()
  expect(f.writes).toHaveLength(1)
  f.controls.beforeWrite = undefined; release(); await f.controller.flush()
  expect(f.writes).toHaveLength(2)
  expect(f.writes.map(input => input.expectedRevision)).toEqual([0, 1])
  expect(f.snapshot().preferences.search.binding?.code).toBe('KeyP'); expect(f.snapshot().preferences.sidebar.binding?.code).toBe('KeyL')
})
test('不同动作 CAS 冲突重新校验后顺序提交，同动作外改保留草稿不盲覆盖', async () => {
  const f = fixture(); await f.controller.reload()
  f.controls.beforeWrite = async () => { f.controls.beforeWrite = undefined; f.external({ sidebar: { enabled: false, binding: binding('KeyB') } }) }
  await f.controller.begin('search'); f.controller.record(binding('KeyP')); f.controller.finish(); await f.controller.flush()
  expect(f.writes).toHaveLength(2); expect(f.snapshot().preferences.sidebar.enabled).toBe(false)
  await f.controller.begin('search'); f.controller.record(binding('KeyO'))
  f.external({ search: { enabled: false, binding: binding('KeyL') } })
  f.controller.finish(); expect(await f.controller.flush()).toBe(false)
  expect(f.writes).toHaveLength(2); expect(f.controller.store.getState().drafts.search?.changedElsewhere).toBe(true)
  await f.controller.begin('search'); f.controller.cancel()
  expect(f.controller.store.getState().snapshot?.preferences.search).toEqual({ enabled: false, binding: binding('KeyL') })
})
test('已提交但响应丢失按原请求核对，不重复写；未知状态不可放弃到假回滚', async () => {
  const f = fixture(); await f.controller.reload(); f.controls.afterWrite = () => { throw new Error('响应丢失') }
  await f.controller.begin('search'); f.controller.record(binding('KeyP')); f.controller.finish()
  expect(await f.controller.flush()).toBe(true); expect(f.writes).toHaveLength(1)
  f.controls.receiptError = true
  await f.controller.begin('sidebar'); f.controller.record(binding('KeyL')); f.controller.finish()
  expect(await f.controller.flush()).toBe(false); expect(f.controller.store.getState().unknown).toBe(true)
  expect(await f.controller.discard()).toBe(false)
  f.controls.receiptError = false
  expect(await f.controller.flush()).toBe(true); expect(f.writes).toHaveLength(2)
})
test('恢复默认是四行一次提交，失败不产生部分恢复', async () => {
  const f = fixture(); await f.controller.reload()
  f.controller.toggle('search', false); await f.controller.flush()
  f.controls.beforeWrite = async () => { throw new Error('写盘失败') }
  await f.controller.reset(); await f.controller.flush()
  expect(f.writes.at(-1)?.patch).toEqual(shortcutDefaults()); expect(f.snapshot().preferences.search.enabled).toBe(false)
  await f.controller.discard(); f.controls.beforeWrite = undefined
  await f.controller.reset(); expect(await f.controller.flush()).toBe(true)
  expect(f.snapshot().preferences).toEqual(shortcutDefaults())
})

test('原导航守卫等待自动保存，正常离页无确认，失败才使用原放弃对话框', async () => {
  const f = fixture(shortcuts); await shortcuts.reload(); const navigate = vi.fn()
  function Harness() { const guard = useEditorGuard({ reset() {} }); return h('div', {}, h(ShortcutSettings), h('button', { onClick: () => guard.navigate(navigate) }, '离开页面'), guard.confirmation) }
  await act(async () => root.render(h(Harness)))
  const leave = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '离开页面')!
  let release!: () => void; f.controls.beforeWrite = () => new Promise(resolve => { release = resolve })
  await act(async () => control().click()); await act(async () => press('p', 'KeyP')); await act(async () => leave().click())
  expect(navigate).not.toHaveBeenCalled(); expect(document.querySelector('[role=alertdialog]')).toBeNull()
  await act(async () => release()); expect(navigate).toHaveBeenCalledTimes(1)
  f.controls.beforeWrite = async () => { throw new Error('写盘失败') }
  await act(async () => control().click()); await act(async () => press('l', 'KeyL')); await act(async () => leave().click())
  expect(navigate).toHaveBeenCalledTimes(1); expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '退出')!.click())
  expect(navigate).toHaveBeenCalledTimes(2); expect(shortcuts.hasWork()).toBe(false)
})
