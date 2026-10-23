// @vitest-environment jsdom
/*
 * [INPUT]: renderer插件状态与丢失回执/陈旧读数的受控DesktopApi。
 * [OUTPUT]: 单次写入后只读核对、状态不倒退、只读/忙时无重复提交。
 * [POS]: 插件管理IPC客户端合同；主进程与真实UI另有模块/BDD验收。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { setPluginEnabled, usePlugins } from '../src/renderer/stores/plugins'
import type { DesktopApi } from '../src/shared/ipc'

beforeEach(() => usePlugins.setState({ settings: { revision: 0, disabledIds: [] }, ready: true, busy: undefined, error: '' }))
afterEach(() => { delete (window as Partial<Window>).boai; vi.restoreAllMocks() })
test('a lost mutation response triggers one read and never repeats the write', async () => {
  const request = vi.fn(async (method: string) => {
    if (method === 'setPluginEnabled') throw new Error('response lost')
    return { revision: 1, disabledIds: ['boai.preview.pdf'] }
  })
  window.boai = { request } as unknown as DesktopApi
  await setPluginEnabled('boai.preview.pdf', false)
  expect(request.mock.calls.map(call => call[0])).toEqual(['setPluginEnabled', 'getPluginSettings'])
  expect(usePlugins.getState()).toMatchObject({ settings: { revision: 1, disabledIds: ['boai.preview.pdf'] }, busy: undefined, error: 'response lost' })
})
test('late responses cannot overwrite a newer confirmed configuration', async () => {
  window.boai = { request: vi.fn(async () => {
    usePlugins.setState({ settings: { revision: 2, disabledIds: ['boai.preview.office'] } })
    return { revision: 1, disabledIds: ['boai.preview.pdf'] }
  }) } as unknown as DesktopApi
  await setPluginEnabled('boai.preview.pdf', false)
  expect(usePlugins.getState().settings).toEqual({ revision: 2, disabledIds: ['boai.preview.office'] })
})
test('busy, unreadable and uninitialized settings cannot send a mutation', async () => {
  const request = vi.fn(); window.boai = { request } as unknown as DesktopApi
  for (const patch of [{ busy: 'boai.preview.text' }, { busy: undefined, ready: false }, { ready: true, settings: { revision: 0, disabledIds: [], readOnly: true } }]) {
    usePlugins.setState(patch); await setPluginEnabled('boai.preview.pdf', false)
  }
  expect(request).not.toHaveBeenCalled()
})
