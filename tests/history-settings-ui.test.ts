// @vitest-environment jsdom
/*
 * [INPUT]: History settings UI with host revisions, failed writes and inactive panes.
 * [OUTPUT]: Saves real owner options, converts minutes to seconds and preserves drafts on conflict.
 * [POS]: Settings behavior contract; shared Select rendering and Electron preview are separate.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { defaultHistorySettings } from '../packages/shared/src/domain/history-search'
import { HistorySearchSettings } from '../apps/electron/src/renderer/components/employee/history-search-settings'
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/components/common', () => ({ errorText: (error: Error) => error.message, showErrorToast: toast }))
vi.mock('@/components/ui/select-field', () => ({ SelectField: ({ value, onValueChange, options, disabled }: any) => h('select', { value, disabled, onChange: (event: any) => onValueChange(event.target.value) }, options.map((option: any) => h('option', { value: option.value, key: option.value }, option.label))) }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; vi.clearAllMocks() })
it('loads only when active, saves policy and a two-minute original-time window using host revisions', async () => {
  let settings = defaultHistorySettings('bobo'), fail = false
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'getHistorySearchSettings') return structuredClone(settings)
    if (fail) throw new Error('设置已变化')
    expect(input.expectedRevision).toBe(settings.revision)
    return settings = { ...input.settings, agentId: 'bobo', revision: settings.revision + 1 }
  })
  const api = { request } as unknown as DesktopApi
  const node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node)
  await act(async () => root!.render(h(HistorySearchSettings, { api, agentId: 'bobo', active: false })))
  expect(request).not.toHaveBeenCalled()
  await act(async () => root!.render(h(HistorySearchSettings, { api, agentId: 'bobo', active: true })))
  const select = async (index: number, value: string) => act(async () => { const element = node.querySelectorAll('select')[index]; element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })) })
  await select(0, 'prefetch'); await select(1, 'time')
  expect(settings).toMatchObject({ mode: 'prefetch', revision: 2, window: { kind: 'time', beforeSeconds: 120, afterSeconds: 120 } })
  const input = () => node.querySelector<HTMLInputElement>('[aria-label="命中前时间（分钟）"]')!
  const number = async (value: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value); input().dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  }
  await number('3')
  expect(settings.window).toMatchObject({ beforeSeconds: 180, afterSeconds: 120 })
  fail = true; await number('4')
  expect(input().value).toBe('4'); expect(settings.revision).toBe(3); expect(toast).toHaveBeenCalledWith('设置已变化')
  fail = false
  await select(0, 'off')
  expect(settings.mode).toBe('off'); expect(node.querySelector('[aria-label="命中前时间（分钟）"]')).toBeNull()
})
