// @vitest-environment jsdom
/*
 * [INPUT]: 生产集合 Hook、可控并发快照与真实 React 生命周期。
 * [OUTPUT]: 正文 CRUD 后强制新读取不复用过期请求，迟到低版本不覆盖，失败回读保留草稿恢复能力。
 * [POS]: 提示词集合异步一致性回归，分组完整交互另由 Electron 验收。
 * [PROTOCOL]: 变化同步 Header 和 tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { PromptCollections } from '../packages/shared/src/domain/prompt-templates'
import { usePromptCollections } from '../apps/electron/src/renderer/pages/library/use-prompt-collections'
let root: Root, host: HTMLDivElement, current: ReturnType<typeof usePromptCollections>
const value = (revision: number, promptIds: string[]): PromptCollections => ({ revision, promptIds, groups: [], groupByPromptId: {} })
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
test('explicit post-CRUD reload bypasses an old coalesced read and ignores its late result', async () => {
  const reads: Array<(value: PromptCollections) => void> = []
  const api = { request: vi.fn(() => new Promise(resolve => reads.push(resolve))), subscribe: () => () => {} } as unknown as DesktopApi
  function View() { current = usePromptCollections(api); return h('p', {}, current.value?.promptIds.join(',')) }
  await act(async () => root.render(h(View)))
  expect(reads).toHaveLength(1)
  let fresh!: Promise<void>
  await act(async () => { fresh = current.reload(true) })
  expect(reads).toHaveLength(2)
  await act(async () => { reads[1](value(2, ['new'])); await fresh })
  await act(async () => reads[0](value(1, ['old'])))
  expect(host.textContent).toBe('new'); expect(current.value?.revision).toBe(2)
})
test('a failed group write refreshes current revision and returns false for the existing editor to retain its draft', async () => {
  let revision = 1
  const api = { request: vi.fn(async (method: string) => { if (method === 'getPromptCollections') return value(revision, ['one']); revision = 2; throw new Error('其他窗口已修改') }), subscribe: () => () => {} } as unknown as DesktopApi
  function View() { current = usePromptCollections(api); return h('p', {}, current.value?.revision) }
  await act(async () => root.render(h(View)))
  let saved = true
  await act(async () => { saved = await current.change({ kind: 'create-group', name: '保留的草稿' }) })
  expect(saved).toBe(false); expect(current.value?.revision).toBe(2); expect(current.error).toContain('其他窗口')
})
