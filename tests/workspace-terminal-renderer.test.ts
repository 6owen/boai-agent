// @vitest-environment jsdom
/*
 * [INPUT]: 真实React终端组件、异步IPC夹具与可观测xterm适配器。
 * [OUTPUT]: 100次标签显隐不重建终端、隐藏停测量/读取、稳定尺寸不重复提交及明暗/OSC回归。
 * [POS]: 工作区终端renderer生命周期回归；真实桌面视觉由单独验收覆盖。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Terminal, ITheme } from '@xterm/xterm'
import type { DesktopApi } from '../packages/shared/src/ipc/index'
import type { WorkspaceTerminalRequest, WorkspaceTerminalResponse } from '../packages/shared/src/ipc/workspace-terminal'
import { WorkspaceTerminal } from '../apps/electron/src/renderer/components/detail-panel/workspace-terminal'
import { WorkspaceTerminalTheme, parseTerminalColor, terminalAppearance } from '../apps/electron/src/renderer/components/detail-panel/workspace-terminal-theme'

const mocks = vi.hoisted(() => ({ screens: [] as Array<{ options: Record<string, unknown>; dispose: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; buffer: { active: { viewportY: number; baseY: number } } }>, measure: vi.fn(() => ({ cols: 90, rows: 32 })) }))
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options: Record<string, unknown>; cols = 80; rows = 24
  dispose = vi.fn(); focus = vi.fn(); reset = vi.fn()
  buffer = { active: { viewportY: 30, baseY: 50 } }
  parser = { registerCsiHandler: () => ({ dispose() {} }), registerDcsHandler: () => ({ dispose() {} }), registerOscHandler: () => ({ dispose() {} }), registerEscHandler: () => ({ dispose() {} }) }
  constructor(options: Record<string, unknown>) { this.options = options; mocks.screens.push(this) }
  loadAddon() {} open() {} onData() { return { dispose() {} } }
  resize(cols: number, rows: number) { this.cols = cols; this.rows = rows }
  scrollToLine(line: number) { this.buffer.active.viewportY = line }
  write(_data: string, callback: () => void) { callback() }
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { proposeDimensions = mocks.measure } }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: { children?: React.ReactNode }) => createElement('button', props, children) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

let host: HTMLDivElement, root: Root
let rafs: Map<number, FrameRequestCallback>, resizeCallbacks: Array<ResizeObserverCallback>, rafId: number
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.screens.length = 0; mocks.measure.mockReset(); mocks.measure.mockReturnValue({ cols: 90, rows: 32 })
  rafs = new Map(); resizeCallbacks = []; rafId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { rafs.set(++rafId, callback); return rafId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback) } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.documentElement.className = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function flushFrames() { await act(async () => { const callbacks = [...rafs.values()]; rafs.clear(); callbacks.forEach(callback => callback(1)); for (let i = 0; i < 15; i++) await Promise.resolve() }) }
function apiHarness() {
  const calls: WorkspaceTerminalRequest[] = []
  let pending: ((value: WorkspaceTerminalResponse) => void) | undefined
  const api = { request: vi.fn(async (_method: string, input: WorkspaceTerminalRequest): Promise<WorkspaceTerminalResponse> => {
    calls.push(input)
    switch (input.action) {
      case 'attach': return { kind: 'attached', attachmentId: 'attached', nextInputSequence: 1, frame: { kind: 'snapshot', sequence: 1, data: 'hello', cols: 80, rows: 24, terminal: { id: 'term', employeeId: 'employee', conversationId: 'conversation', title: 'zsh', cwd: '/workspace', createdAt: '', status: 'running' } } }
      case 'read': return new Promise(resolve => { pending = resolve })
      case 'cancelRead': pending?.({ kind: 'frame', frame: null }); pending = undefined; return { kind: 'readCancelled' }
      case 'ack': return { kind: 'acknowledged', sequence: input.sequence }
      case 'resize': return { kind: 'resized' }
      case 'detach': return { kind: 'detached' }
      default: throw new Error('unexpected request')
    }
  }) } as unknown as DesktopApi
  const render = async (active: boolean) => { await act(async () => { root.render(createElement(WorkspaceTerminal, { api, active, terminalId: 'term', onHome() {} })); for (let i = 0; i < 20; i++) await Promise.resolve() }) }
  return { api, calls, render }
}

test('100 active switches retain one emulator/attachment, scroll position and one final dispose', async () => {
  const h = apiHarness(); await h.render(true); await flushFrames()
  expect(host.querySelector('[aria-label="终端屏幕"]')?.getAttribute('aria-busy')).toBe('false')
  expect(mocks.screens).toHaveLength(1)
  const screen = mocks.screens[0]!
  expect(screen.options.minimumContrastRatio).toBe(4.5)
  for (let i = 0; i < 100; i++) { await h.render(false); await h.render(true); await flushFrames() }
  expect(mocks.screens).toHaveLength(1)
  expect(screen.reset).toHaveBeenCalledTimes(1)
  expect(screen.dispose).not.toHaveBeenCalled()
  expect(screen.buffer.active.viewportY).toBe(30)
  expect(h.calls.filter(call => call.action === 'attach')).toHaveLength(1)
  expect(h.calls.filter(call => call.action === 'detach')).toHaveLength(0)
  await act(async () => root.unmount())
  expect(screen.dispose).toHaveBeenCalledTimes(1)
  expect(h.calls.filter(call => call.action === 'detach')).toHaveLength(1)
  root = createRoot(host)
})

test('hidden terminal never measures or reads; redundant resize callbacks do not cause resize loops', async () => {
  const h = apiHarness(); await h.render(true); await flushFrames()
  expect(h.calls.filter(call => call.action === 'resize')).toHaveLength(1)
  for (let i = 0; i < 10; i++) resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver))
  await flushFrames()
  expect(h.calls.filter(call => call.action === 'resize')).toHaveLength(1)
  await h.render(false)
  const measures = mocks.measure.mock.calls.length, reads = h.calls.filter(call => call.action === 'read').length
  for (let i = 0; i < 10; i++) resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver))
  document.documentElement.classList.add('dark'); await flushFrames()
  expect(mocks.measure).toHaveBeenCalledTimes(measures)
  expect(h.calls.filter(call => call.action === 'read')).toHaveLength(reads)
  expect(mocks.screens[0]!.options.disableStdin).toBe(true)
  await h.render(true); await flushFrames()
  expect(h.calls.filter(call => call.action === 'read')).toHaveLength(reads + 1)
  expect(mocks.screens[0]!.options.disableStdin).toBe(false)
})

test('appearance reads effective code font/line-height and updates the ANSI palette with theme', () => {
  host.style.fontFamily = 'Menlo, monospace'; host.style.fontSize = '14px'; host.style.lineHeight = '21px'; host.style.color = 'rgb(20, 21, 22)'
  const light = terminalAppearance(host)
  expect(light.fontFamily).toBe('Menlo, monospace'); expect(light.fontSize).toBe(14); expect(light.lineHeight).toBe(1.5)
  expect(light.theme.cursor).toBe('rgb(20, 21, 22)'); expect(light.theme.cursorAccent).toBe(light.theme.background)
  expect(light.theme.selectionBackground).toBeTruthy()
  document.documentElement.classList.add('dark')
  expect(terminalAppearance(host).theme.red).not.toBe(light.theme.red)
})

test('collapsed or undersized panels do not submit an invalid host resize or disable input', async () => {
  const h = apiHarness(); await h.render(true); await flushFrames()
  for (const size of [{ cols: 9, rows: 20 }, { cols: 80, rows: 1 }]) {
    mocks.measure.mockReturnValue(size)
    resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver)); await flushFrames()
  }
  expect(h.calls.filter(call => call.action === 'resize')).toHaveLength(1)
  expect(mocks.screens[0]!.options.disableStdin).toBe(false)
  mocks.measure.mockReturnValue({ cols: 10, rows: 2 })
  resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver)); await flushFrames()
  expect(h.calls.filter(call => call.action === 'resize').at(-1)).toMatchObject({ cols: 10, rows: 2 })
})

test('program OSC colors survive BOAI theme updates; reset restores current defaults and queries are consumed', () => {
  const handlers = new Map<number, (data: string) => boolean>()
  const terminal = { options: {} as { theme?: ITheme }, parser: { registerOscHandler: (code: number, handler: (data: string) => boolean) => { handlers.set(code, handler); return { dispose() {} } }, registerEscHandler: () => ({ dispose() {} }) } } as unknown as Pick<Terminal, 'options' | 'parser'>
  const theme = new WorkspaceTerminalTheme(terminal)
  theme.update({ background: '#ffffff', foreground: '#111111', red: '#bb0000' })
  handlers.get(4)!('1;rgb:12/34/56;200;#abcdef')
  handlers.get(11)!('#123456')
  theme.update({ background: '#222222', foreground: '#ffffff', red: '#ff8888' })
  expect(terminal.options.theme?.red).toBe('#123456')
  expect(terminal.options.theme?.extendedAnsi?.[184]).toBe('#abcdef')
  expect(terminal.options.theme?.background).toBe('#123456')
  expect(terminal.options.theme?.cursorAccent).toBe('#123456')
  expect(handlers.get(10)!('?')).toBe(true)
  expect(terminal.options.theme?.foreground).toBe('#ffffff')
  handlers.get(104)!('1'); handlers.get(111)!('')
  expect(terminal.options.theme?.red).toBe('#ff8888')
  expect(terminal.options.theme?.background).toBe('#222222')
  handlers.get(104)!(''); expect(terminal.options.theme?.extendedAnsi).toBeUndefined()
  theme.dispose()
})

test('X11 colors use correct channel width and reject malformed payloads', () => {
  expect(parseTerminalColor('#f00')).toBe('#f00000')
  expect(parseTerminalColor('rgb:f/0/0')).toBe('#ff0000')
  expect(parseTerminalColor('#123456789')).toBe('#124578')
  expect(parseTerminalColor('rgb:ffff/8000/0000')).toBe('#ff8000')
  for (const value of ['?', '#xx0000', 'red', 'rgb:fffff/0/0', '#1234']) expect(parseTerminalColor(value)).toBeUndefined()
})
