// @vitest-environment jsdom
/*
 * [INPUT]: Production web-search settings UI and controlled desktop responses.
 * [OUTPUT]: Draft tests use edited keys without saving, prevent duplicate calls and report through Sonner; saved service actions respect availability.
 * [POS]: React interaction regression; no Electron or external provider requests.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { WebSearchSettings } from '../packages/shared/src/domain/web-search'
import { WebSearchSettingsPage } from '../apps/electron/src/renderer/pages/settings/web-search'

let host: HTMLDivElement, root: Root, api: DesktopApi, settings: WebSearchSettings
const success = { status: 'success' as const, checkedAt: '2026-10-28T00:00:00Z', message: 'DeepSeek 搜索请求成功' }
const service = { id: 'search', revision: 3, provider: 'deepseek' as const, name: 'DeepSeek', enabled: true, pluginEnabled: true, hasCredential: true }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(toast, 'success').mockImplementation(() => 'success')
  vi.spyOn(toast, 'error').mockImplementation(() => 'error')
  settings = { revision: 0, default: { mode: 'browser' }, services: [] }
  api = { request: vi.fn(async (method: string) => {
    if (method === 'getWebSearchSettings') return settings
    if (method === 'getWebSearchCredential') return 'original-key'
    if (method === 'testWebSearchServiceDraft') return success
    if (method === 'testWebSearchService') return { ...service, test: success }
    throw new Error(`Unexpected request: ${method}`)
  }), subscribe: () => () => {} } as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (name: string) => {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)
  if (!element) throw new Error(`Missing button: ${name}`)
  return element
}
async function render() { await act(async () => root.render(createElement(WebSearchSettingsPage, { api, active: true }))) }
async function click(name: string) { await act(async () => button(name).click()) }
async function fillKey(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="DeepSeek API Key"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('tests the current unsaved key without saving or closing the dialog and blocks duplicate submission', async () => {
  await render(); await click('配置'); await fillKey(' draft-key ')
  let finish!: (value: typeof success) => void
  vi.mocked(api.request).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }) as never)
  await act(async () => { button('测试').click(); button('测试').click() })
  expect(button('测试').disabled).toBe(true)
  expect(button('保存连接').disabled).toBe(true)
  expect(vi.mocked(api.request).mock.calls.filter(([method]) => method === 'testWebSearchServiceDraft')).toEqual([
    ['testWebSearchServiceDraft', { provider: 'deepseek', credential: 'draft-key' }],
  ])
  await act(async () => finish(success))
  expect(toast.success).toHaveBeenCalledWith(success.message)
  expect(document.querySelector('[role=dialog]')).not.toBeNull()
  expect(document.querySelector<HTMLInputElement>('[aria-label="DeepSeek API Key"]')!.value).toBe(' draft-key ')
  expect(button('保存连接').disabled).toBe(false)
  expect(vi.mocked(api.request).mock.calls.some(([method]) => method === 'saveWebSearchService')).toBe(false)
  expect(document.body.textContent).not.toContain(success.message)
})

it('validates missing keys and retains the draft after a test failure without writing a connection', async () => {
  await render(); await click('配置'); await click('测试')
  expect(toast.error).toHaveBeenCalledWith('请填写 API Key 后测试连接', expect.objectContaining({ id: 'error:请填写 API Key 后测试连接' }))
  expect(vi.mocked(api.request).mock.calls.some(([method]) => method === 'testWebSearchServiceDraft')).toBe(false)
  await fillKey('incorrect-key')
  vi.mocked(api.request).mockRejectedValueOnce(new Error('DeepSeek 请求失败（HTTP 401）'))
  await click('测试')
  expect(toast.error).toHaveBeenCalledWith('DeepSeek 请求失败（HTTP 401）', expect.objectContaining({ id: 'error:DeepSeek 请求失败（HTTP 401）' }))
  expect(button('测试').disabled).toBe(false)
  expect(document.querySelector<HTMLInputElement>('[aria-label="DeepSeek API Key"]')!.value).toBe('incorrect-key')
  expect(vi.mocked(api.request).mock.calls.some(([method]) => method === 'saveWebSearchService')).toBe(false)
  expect(document.body.textContent).not.toContain('HTTP 401')
})

it.each([true, false])('keeps the saved test menu consistent with plugin availability (%s)', async pluginEnabled => {
  settings.services = [{ ...service, pluginEnabled }]
  await render(); await click('管理 DeepSeek')
  const test = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '测试连接')!
  expect(test).toBeDefined()
  expect(test.getAttribute('aria-disabled') === 'true').toBe(!pluginEnabled)
  if (pluginEnabled) {
    await act(async () => test.click())
    expect(api.request).toHaveBeenCalledWith('testWebSearchService', { id: service.id, expectedRevision: service.revision })
    expect(toast.success).toHaveBeenCalledWith(success.message)
  }
})
