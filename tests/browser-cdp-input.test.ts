/*
 * [OUTPUT]: 密码焦点输入在首个键盘事件前拒绝，真实WebContents效果另由Electron验收。
 * [INPUT]: Craft v0.15.1 browser-cdp.test.ts输入用例意图、实际BOAI CDP驱动和可控Electron传输。
 * [OUTPUT]: CDP点击/拖动/键盘、仅attach前回退、中途失败零重放与实际drain核验；真实后台网页另验。
 * [POS]: Apache-2.0 upstream 2e3ba53ff80b229a07e9d1884dc58f6733f22e1f；许可见apps/electron/src/main/browser/LICENSE.txt和NOTICE.txt。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { BrowserCDP, resolveCdpKey } from '../apps/electron/src/main/browser/browser-cdp'

const clients: BrowserCDP[] = []
afterEach(() => { for (const cdp of clients.splice(0)) cdp.detach() })
function fixture(command: (method: string, params?: Record<string, unknown>) => Promise<unknown> = async () => ({})) {
  const wc = { debugger: { attach: vi.fn(), detach: vi.fn(), on: vi.fn(), sendCommand: vi.fn(command) }, sendInputEvent: vi.fn() }
  const cdp = new BrowserCDP(wc as unknown as WebContents); clients.push(cdp)
  return { wc, cdp }
}
it('clicks and drags through CDP instead of native focus-dependent events', async () => {
  const { cdp, wc } = fixture()
  await cdp.clickAtCoordinates(10.2, 20.4); await cdp.drag(10, 20, 110, 20)
  expect(wc.sendInputEvent).not.toHaveBeenCalled()
  const events = wc.debugger.sendCommand.mock.calls.filter(([method]) => method === 'Input.dispatchMouseEvent').map(([, params]) => params!)
  expect(events.filter(event => event.type === 'mousePressed')).toEqual([expect.objectContaining({ x: 10, y: 20, buttons: 1 }), expect.objectContaining({ x: 10, y: 20, buttons: 1 })])
  expect(events.filter(event => event.type === 'mouseReleased')).toHaveLength(2)
  expect(events.at(-1)).toMatchObject({ type: 'mouseReleased', x: 110, y: 20, buttons: 0 })
})
it('uses native input only when CDP could not attach before the action', async () => {
  const { cdp, wc } = fixture(); wc.debugger.attach.mockImplementation(() => { throw new Error('attach refused') })
  await cdp.clickAtCoordinates(10, 20)
  expect(wc.debugger.sendCommand).not.toHaveBeenCalled()
  expect(wc.sendInputEvent.mock.calls.map(([event]) => event.type).filter(type => type !== 'mouseMove')).toEqual(['mouseDown', 'mouseUp'])
})
it('does not retry a partially executed CDP click through native input', async () => {
  const { cdp, wc } = fixture(async (_method, params) => { if (params?.type === 'mouseReleased') throw new Error('release acknowledgement lost'); return {} })
  await expect(cdp.clickAtCoordinates(10, 20)).rejects.toThrow('acknowledgement lost')
  expect(wc.sendInputEvent).not.toHaveBeenCalled()
  expect(wc.debugger.sendCommand.mock.calls.filter(([, params]) => params?.type === 'mousePressed')).toHaveLength(1)
})
it('releases a CDP drag after a move fails and keeps the failure', async () => {
  const { cdp, wc } = fixture(async (_method, params) => { if (params?.type === 'mouseMoved') throw new Error('move failed'); return {} })
  await expect(cdp.drag(0, 0, 100, 0)).rejects.toThrow('move failed')
  expect(wc.debugger.sendCommand.mock.calls.at(-1)?.[1]).toMatchObject({ type: 'mouseReleased', buttons: 0 })
  expect(wc.sendInputEvent).not.toHaveBeenCalled()
})
it('dispatches named keys and keeps native command shortcuts on their established path', async () => {
  const { cdp, wc } = fixture()
  expect(await cdp.pressKey('Escape')).toBe(true); expect(await cdp.pressKey('Enter')).toBe(true)
  expect(wc.debugger.sendCommand.mock.calls.filter(([, params]) => params?.type === 'keyUp')).toHaveLength(2)
  expect(wc.debugger.sendCommand.mock.calls[2][1]).toMatchObject({ type: 'keyDown', key: 'Enter', text: '\r' })
  wc.debugger.sendCommand.mockClear()
  expect(await cdp.pressKey('a', ['meta'])).toBe(false); expect(await cdp.pressKey('a', ['control'])).toBe(false)
  expect(await cdp.pressKey('MediaPlayPause')).toBe(false); expect(wc.debugger.sendCommand).not.toHaveBeenCalled()
  expect(resolveCdpKey('Up')).toMatchObject({ key: 'ArrowUp', keyCode: 38 })
  expect(resolveCdpKey('page_down')).toMatchObject({ key: 'PageDown', keyCode: 34 })
  expect(resolveCdpKey('a', true)).toMatchObject({ key: 'A', code: 'KeyA', keyCode: 65, text: 'A' })
  expect(resolveCdpKey('F5')).toMatchObject({ key: 'F5', keyCode: 116 })
})
it('keeps the existing BOAI drain pending until the actual CDP reply', async () => {
  let release!: () => void
  const { cdp } = fixture(async method => { if (method === 'Runtime.evaluate') return { result: { value: false } }; await new Promise<void>(resolve => { release = resolve }); return {} })
  const typing = cdp.typeText('a')
  await vi.waitFor(() => expect(release).toBeDefined())
  let drained = false; const drain = cdp.drain().then(() => { drained = true })
  await Promise.resolve(); expect(drained).toBe(false)
  const first = release; first()
  await vi.waitFor(() => expect(release).not.toBe(first)); release()
  await typing; await drain
})

it('refuses focused password typing before any input event', async () => {
  const { cdp, wc } = fixture(async () => ({ result: { value: true } }))
  await expect(cdp.typeText('secret')).rejects.toThrow('手动输入')
  expect(wc.debugger.sendCommand.mock.calls.some(([method]) => method === 'Input.dispatchKeyEvent')).toBe(false)
})
