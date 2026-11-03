/*
 * [INPUT]: API Bobo identity, active memory pane and host revision-checked preferences.
 * [OUTPUT]: Owner controls for history policy, original-time/message neighbors and evidence budget.
 * [POS]: Settings UI only; retrieval and prompt behavior remain runtime-owned.
 * [PROTOCOL]: Update Header and employee/.folder.md on change.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { HISTORY_LIMITS, defaultHistorySettings, type HistorySearchOptions, type HistorySearchSettings } from '@boai/shared/domain/history-search'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Button } from '@/components/ui/button'
import { errorText, showErrorToast } from '@/components/common'
import { ConnectionSettingRow as Field } from '@/pages/settings/connection-layout'
import { EmployeeFormSection } from './profile-card'
export function HistorySearchSettings({ api, agentId, active }: { api: DesktopApi; agentId: string; active: boolean }) {
  const [value, setValue] = useState<HistorySearchSettings | null>(null), [busy, setBusy] = useState(false), [revision, refresh] = useState(0)
  const saving = useRef(false)
  useEffect(() => {
    if (!active) return
    let live = true
    void api.request('getHistorySearchSettings', { agentId }).then(settings => { if (live) setValue(settings) }).catch(error => { if (live) showErrorToast(errorText(error)) })
    return () => { live = false }
  }, [api, agentId, active, revision])
  const save = async (patch: Partial<HistorySearchOptions>) => {
    if (!value || saving.current) return
    const settings = { mode: value.mode, window: value.window, limit: value.limit, maxCharacters: value.maxCharacters, ...patch }
    saving.current = true; setBusy(true)
    try { setValue(await api.request('configureHistorySearch', { agentId, expectedRevision: value.revision, settings })) }
    catch (error) { showErrorToast(errorText(error)) }
    finally { saving.current = false; setBusy(false) }
  }
  return <EmployeeFormSection title="会话历史检索" hint="直接查询已保存原文，无需 Embedding 或提取记忆。模型按需保留自主选择；每轮预检在回答前做有界的本地检索。关闭仅停用主动原文检索，不清除聊天或 Working Memory、OM。修改后下一轮采用新设置，关闭会阻止后续原文查询。">
    <Field label="触发方式"><SelectField disabled={!value || busy} value={value?.mode ?? defaultHistorySettings(agentId).mode} onValueChange={mode => { void save({ mode: mode as HistorySearchOptions['mode'] }) }} options={[{ value: 'agent', label: '模型按需' }, { value: 'prefetch', label: '每轮预检' }, { value: 'off', label: '关闭原文检索' }]} /></Field>
    {value && value.mode !== 'off' && <>
      <Field label="邻近上下文"><SelectField disabled={busy} value={value.window.kind} onValueChange={kind => { void save({ window: kind === 'time' ? { kind: 'time', beforeSeconds: 120, afterSeconds: 120 } : defaultHistorySettings(agentId).window }) }} options={[{ value: 'messages', label: '按前后消息条数' }, { value: 'time', label: '按原始消息时间' }]} /></Field>
      {value.window.kind === 'messages' ? <>
        <NumberSetting label="命中前消息（条）" value={value.window.before} max={HISTORY_LIMITS.neighbors} disabled={busy} save={before => save({ window: { ...value.window as Extract<HistorySearchOptions['window'], { kind: 'messages' }>, before } })} />
        <NumberSetting label="命中后消息（条）" value={value.window.after} max={HISTORY_LIMITS.neighbors} disabled={busy} save={after => save({ window: { ...value.window as Extract<HistorySearchOptions['window'], { kind: 'messages' }>, after } })} />
      </> : <>
        <NumberSetting label="命中前时间（分钟）" value={value.window.beforeSeconds / 60} max={HISTORY_LIMITS.windowSeconds / 60} step="any" disabled={busy} save={minutes => save({ window: { ...value.window as Extract<HistorySearchOptions['window'], { kind: 'time' }>, beforeSeconds: Math.round(minutes * 60) } })} />
        <NumberSetting label="命中后时间（分钟）" value={value.window.afterSeconds / 60} max={HISTORY_LIMITS.windowSeconds / 60} step="any" disabled={busy} save={minutes => save({ window: { ...value.window as Extract<HistorySearchOptions['window'], { kind: 'time' }>, afterSeconds: Math.round(minutes * 60) } })} />
      </>}
      <NumberSetting label="默认命中数量" value={value.limit} min={1} max={HISTORY_LIMITS.hits} disabled={busy} save={limit => save({ limit })} />
      <details><summary className="cursor-pointer text-sm">高级设置</summary><NumberSetting label="原文返回上限（字符）" value={value.maxCharacters} min={HISTORY_LIMITS.minCharacters} max={HISTORY_LIMITS.characters} disabled={busy} save={maxCharacters => save({ maxCharacters })} /></details>
    </>}
    <div className="flex justify-end"><Button variant="ghost" size="sm" disabled={busy} onClick={() => refresh(current => current + 1)}>刷新</Button></div>
  </EmployeeFormSection>
}
function NumberSetting({ label, value, min = 0, max, step = 1, disabled, save }: { label: string; value: number; min?: number; max: number; step?: number | 'any'; disabled: boolean; save(value: number): Promise<void> }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return <Field label={label}><Input aria-label={label} type="number" min={min} max={max} step={step} disabled={disabled} value={draft} onChange={event => setDraft(event.target.value)} onBlur={event => {
    const next = Number(draft)
    if (!draft.trim() || !event.currentTarget.checkValidity() || !Number.isFinite(next)) { setDraft(String(value)); showErrorToast(`请输入 ${min} 到 ${max} 之间的有效数值`); return }
    if (next !== value) void save(next)
  }} /></Field>
}
