/*
 * [INPUT]: 提示词最新版本、用户草稿、保存回执及可见详情订阅。
 * [OUTPUT]: 干净表单跟随AI更新，脏草稿保留原CAS版本；取消草稿恢复最新已读版本，隐藏停读与迟到响应隔离。
 * [POS]: 提示词右侧编辑器状态，不执行提示词正文或调用模型。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { DesktopApi } from '@boai/shared/ipc'
import type { PromptTemplate } from '@boai/shared/domain/prompt-templates'

export type PromptDraft = Pick<PromptTemplate, 'name' | 'description' | 'content'>
export const promptDraft = (value?: PromptTemplate | null): PromptDraft => ({ name: value?.name ?? '', description: value?.description ?? '', content: value?.content ?? '' })
export type PromptEditorState = { base?: PromptTemplate; latest?: PromptTemplate | null; draft: PromptDraft; ready: boolean }
export const promptEditorState = (create: boolean): PromptEditorState => ({ draft: promptDraft(), ready: create })
export const promptEditorDirty = (state: PromptEditorState) => JSON.stringify(state.draft) !== JSON.stringify(promptDraft(state.base))
type Action = { type: 'edit'; draft: PromptDraft } | { type: 'receive'; value: PromptTemplate | null } | { type: 'saved'; value: PromptTemplate } | { type: 'discard' }
export function promptEditorReducer(state: PromptEditorState, action: Action): PromptEditorState {
  if (action.type === 'edit') return { ...state, draft: action.draft }
  if (action.type === 'discard') { const base = state.latest ?? state.base; return { ...state, base, draft: promptDraft(base) } }
  if (action.type === 'saved') {
    const latest = state.latest === null ? null : state.latest && state.latest.revision > action.value.revision ? state.latest : action.value
    return { base: latest ?? action.value, latest, draft: promptDraft(latest ?? action.value), ready: true }
  }
  if (action.value && state.latest && action.value.revision < state.latest.revision) return state
  const next = { ...state, latest: action.value, ready: true }
  return !action.value || promptEditorDirty(state) ? next : { ...next, base: action.value, draft: promptDraft(action.value) }
}

export function observePromptDetail(api: DesktopApi, id: string, onValue: (value: PromptTemplate | null) => void, onError: (error: unknown) => void) {
  let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined
  const load = async () => {
    const token = ++request
    try { const values = await api.request('listPromptTemplates', undefined); if (live && token === request) onValue(values.find(value => value.id === id) ?? null) }
    catch (error) { if (live && token === request) onError(error) }
  }
  const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !event.conversationId) { request++; timer ??= setTimeout(() => { timer = undefined; void load() }, 120) } })
  void load()
  return () => { live = false; request++; clearTimeout(timer); unsubscribe() }
}
