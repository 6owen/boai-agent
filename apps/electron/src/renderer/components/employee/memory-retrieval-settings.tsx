/*
 * [INPUT]: 员工、版本化记忆检索配置、模型连接和编辑守卫。
 * [OUTPUT]: 语义检索在点击区域外/键盘离开时自动保存；Select Portal属于编辑区域，保存锁防重发，失败保留草稿。
 * [POS]: 记忆页的独立配置编辑器，不修改记忆正文或调用模型。
 * [PROTOCOL]: 修改同步Header及employee/.folder.md。
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { DigitalAgent, ManagedMemory, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, GuardContext, showErrorToast } from '@/components/common'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { ConnectionSettingRow as Field } from '@/pages/settings/connection-layout'
import { EmployeeFormSection } from './profile-card'

export function MemoryRetrievalSettings({ active, api, agent, memory, snapshot, saved, onBusyChange }: {
  active: boolean; api: DesktopApi; agent: DigitalAgent; memory: ManagedMemory; snapshot: Snapshot; saved(): void; onBusyChange?(busy: boolean): void
}) {
  const [settings, setSettings] = useState(memory.settings ?? { agentId: agent.id, revision: 0 })
  const [connectionId, setConnectionId] = useState(settings.embedding?.connectionId ?? ''), [modelId, setModelId] = useState(settings.embedding?.modelId ?? '')
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null), locked = useRef(false), mounted = useRef(true)
  const invalidNotified = useRef(false)
  const guard = useContext(GuardContext)
  const dirty = connectionId !== (settings.embedding?.connectionId ?? '') || Boolean(connectionId) && modelId.trim() !== (settings.embedding?.modelId ?? '')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { guard.setDirty(active && dirty) }, [active, dirty, guard.setDirty])
  useEffect(() => () => guard.setDirty(false), [guard.setDirty])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])
  useEffect(() => { invalidNotified.current = false }, [connectionId, modelId])
  useEffect(() => {
    const incoming = memory.settings
    if (!incoming || locked.current || dirty || incoming.revision <= settings.revision) return
    setSettings(incoming); setConnectionId(incoming.embedding?.connectionId ?? ''); setModelId(incoming.embedding?.modelId ?? '')
  }, [memory.settings, settings.revision, dirty])
  useEffect(() => {
    if (!active && !locked.current) { setConnectionId(settings.embedding?.connectionId ?? ''); setModelId(settings.embedding?.modelId ?? '') }
  }, [active, settings])

  const save = useCallback(async () => {
    if (!active || !dirty || locked.current) return
    if (connectionId && !modelId.trim()) {
      if (!invalidNotified.current) { invalidNotified.current = true; showErrorToast('请填写支持向量检索的模型名称') }
      return
    }
    locked.current = true; setBusy(true); onBusyChange?.(true)
    try {
      const result = await api.request('configureMemory', { agentId: agent.id, expectedRevision: settings.revision, embedding: connectionId ? { connectionId, modelId: modelId.trim() } : null })
      if (mounted.current) {
        setSettings(result); setConnectionId(result.embedding?.connectionId ?? ''); setModelId(result.embedding?.modelId ?? '')
        guard.saved(); saved()
      }
    } catch (error) { if (mounted.current) showErrorToast(errorText(error)) }
    finally { locked.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false) } }
  }, [active, dirty, api, agent.id, settings.revision, connectionId, modelId, guard, saved, onBusyChange])

  useEffect(() => {
    if (!active || !dirty) return
    const inside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false
      if (root.current?.contains(target)) return true
      // Select renders its listbox in a Portal outside this section.
      const popupId = root.current?.querySelector('[role="combobox"]')?.getAttribute('aria-controls')
      return Boolean(popupId && document.getElementById(popupId)?.contains(target))
    }
    const outside = (event: Event) => { if (!inside(event.target)) void save() }
    const blur = () => { void save() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside, true)
      window.removeEventListener('blur', blur)
    }
  }, [active, dirty, save])
  const connections = snapshot.connections.filter(connection => connection.provider !== 'anthropic' && connection.gateway?.protocol !== 'messages')
  return <div ref={root}>
    <EmployeeFormSection title="语义检索" hint="选择支持 embeddings 的模型连接以启用向量检索。未配置时，观察记忆仍可整理和回查对话原文。">
      <Field label="Embedding 连接"><SelectField disabled={busy || !active} value={connectionId} onValueChange={setConnectionId} options={[{ value: '', label: '不使用向量检索' }, ...connections.map(connection => ({ value: connection.id, label: connection.name }))]} /></Field>
      {connectionId && <Field label="Embedding 模型"><Input disabled={busy || !active} value={modelId} onChange={event => setModelId(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save() } }} placeholder="例如 text-embedding-3-small" /></Field>}
    </EmployeeFormSection>
  </div>
}
