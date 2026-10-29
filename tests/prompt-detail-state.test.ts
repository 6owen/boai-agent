/*
 * [INPUT]: 提示词版本化草稿、保存回执及可控公开IPC/变更事件。
 * [OUTPUT]: AI刷新不覆盖脏草稿、不升级CAS基线；旧响应/隐藏隔离、删除与读取失败恢复。
 * [POS]: 提示词右侧编辑器状态回归，不启动Electron或调用模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import type { PromptTemplate } from '../packages/shared/src/domain/prompt-templates'
import { observePromptDetail, promptDraft, promptEditorDirty, promptEditorReducer as reduce, promptEditorState } from '../apps/electron/src/renderer/pages/library/prompt-detail-state'

const original: PromptTemplate = { id: 'prompt-a', revision: 1, name: '总结', description: '', content: '原始内容', createdAt: '', updatedAt: '' }
const updated = { ...original, revision: 2, name: 'AI 修改', content: '新内容' }

it('follows AI edits only while clean and preserves the original revision with an unsaved draft', () => {
  const initial = reduce(promptEditorState(false), { type: 'receive', value: original })
  expect(promptEditorDirty(initial)).toBe(false)
  const clean = reduce(initial, { type: 'receive', value: updated })
  expect(clean.base).toBe(updated); expect(clean.draft).toEqual(promptDraft(updated))
  const editing = reduce(initial, { type: 'edit', draft: { ...initial.draft, content: '我的草稿' } })
  const refreshed = reduce(editing, { type: 'receive', value: updated })
  expect(refreshed.base).toBe(original); expect(refreshed.latest).toBe(updated)
  expect(refreshed.draft.content).toBe('我的草稿'); expect(promptEditorDirty(refreshed)).toBe(true)
  expect(reduce(refreshed, { type: 'receive', value: original })).toBe(refreshed)
})

it('keeps drafts after deletion and never overwrites an already newer version with a delayed save receipt', () => {
  const initial = reduce(promptEditorState(false), { type: 'receive', value: original })
  const editing = reduce(initial, { type: 'edit', draft: { ...initial.draft, content: '我的草稿' } })
  const removed = reduce(editing, { type: 'receive', value: null })
  expect(removed.latest).toBeNull(); expect(removed.draft.content).toBe('我的草稿')
  expect(reduce(removed, { type: 'saved', value: updated }).latest).toBeNull()
  const newest = { ...updated, revision: 3, content: '更晚的 AI 内容' }
  const raced = reduce(editing, { type: 'receive', value: newest })
  const saved = reduce(raced, { type: 'saved', value: updated })
  expect(saved.base).toBe(newest); expect(saved.draft.content).toBe(newest.content)
  expect(promptEditorDirty(saved)).toBe(false)
})

it('starts a new prompt with no revision and establishes its identity only after save', () => {
  const state = promptEditorState(true)
  expect(state.ready).toBe(true); expect(state.base).toBeUndefined(); expect(promptEditorDirty(state)).toBe(false)
  const editing = reduce(state, { type: 'edit', draft: promptDraft(original) })
  expect(promptEditorDirty(editing)).toBe(true)
  const saved = reduce(editing, { type: 'saved', value: original })
  expect(saved.base).toBe(original); expect(promptEditorDirty(saved)).toBe(false)
})

function fixture() {
  vi.useFakeTimers()
  const pending: { resolve(value: PromptTemplate[]): void; reject(error: Error): void }[] = []
  const listeners = new Set<(event: AppEvent) => void>()
  const request = vi.fn((method: string) => {
    if (method !== 'listPromptTemplates') throw new Error(`Unexpected request ${method}`)
    return new Promise<PromptTemplate[]>((resolve, reject) => pending.push({ resolve, reject }))
  })
  const api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } } as unknown as DesktopApi
  const value = vi.fn(), error = vi.fn(), stop = observePromptDetail(api, original.id, value, error)
  return { pending, listeners, request, value, error, stop, emit: (event: AppEvent = { type: 'changed' }) => { for (const listener of listeners) listener(event) } }
}
afterEach(() => vi.useRealTimers())

it('refreshes only global changes and invalidates an old response immediately before debounce', async () => {
  const f = fixture()
  f.emit({ type: 'changed', conversationId: 'chat' })
  await vi.advanceTimersByTimeAsync(200); expect(f.pending).toHaveLength(1)
  for (let i = 0; i < 5; i++) f.emit()
  f.pending[0].resolve([original]); await Promise.resolve(); expect(f.value).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(120); expect(f.pending).toHaveLength(2)
  f.pending[1].resolve([{ ...original, id: 'other' }, updated]); await Promise.resolve()
  expect(f.value).toHaveBeenCalledExactlyOnceWith(updated); f.stop()
})

it('cancels hidden refreshes and ignores pending responses or failures after closing', async () => {
  const f = fixture(); f.emit(); f.stop(); f.pending[0].resolve([original])
  await vi.advanceTimersByTimeAsync(200)
  expect(f.request).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(0); expect(f.value).not.toHaveBeenCalled()
  const failing = fixture(); failing.stop(); failing.pending[0].reject(new Error('late failure')); await Promise.resolve()
  expect(failing.error).not.toHaveBeenCalled()
})

it('reports a failed read and can recover with a deleted target without selecting a different prompt', async () => {
  const f = fixture(), reason = new Error('读取失败')
  f.pending[0].reject(reason); await Promise.resolve(); expect(f.error).toHaveBeenCalledExactlyOnceWith(reason)
  f.emit(); await vi.advanceTimersByTimeAsync(120)
  f.pending[1].resolve([{ ...original, id: 'other' }]); await Promise.resolve()
  expect(f.value).toHaveBeenCalledExactlyOnceWith(null); f.stop()
})
