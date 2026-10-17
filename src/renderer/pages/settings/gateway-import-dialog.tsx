/*
 * [INPUT]: Durable gateway drafts, current same-source connections and confirmation receipts through DesktopApi.
 * [OUTPUT]: Global import review, explicit versioned save and reload-safe unknown-result lookup; Sonner feedback.
 * [POS]: Connection import UI; OS links never save connections without this confirmation.
 * [PROTOCOL]: Update Header and settings/.folder.md when changing confirmation or recovery behavior.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@shared/ipc'
import type { GatewayImportConfirmation, GatewayImportReceipt, GatewayImportView } from '@shared/domain/gateway-import'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { ConnectionDialogLayout, ConnectionForm, ConnectionSettingRow } from './connection-layout'
import { ConnectionIllustration } from './connection-illustration'
import { errorText } from '@/components/common'

const pendingKey = 'boai.gateway-import.pending.v1'
const protocols = { chat: 'Chat Completions', responses: 'Responses', messages: 'Messages' }
type Pending = { input: GatewayImportConfirmation; absent: boolean }
function restore(): { pending: Pending | null; error?: string } {
  try {
    const raw = localStorage.getItem(pendingKey)
    if (!raw) return { pending: null }
    const input = JSON.parse(raw) as GatewayImportConfirmation
    if (!input || typeof input.draftId !== 'string' || typeof input.requestId !== 'string') throw new Error()
    return { pending: { input, absent: false } }
  } catch { return { pending: null, error: '原模型导入请求无法读取，请恢复本地存储后重新核对。' } }
}

export function GatewayImportDialog({ api }: { api: DesktopApi }) {
  const [restored] = useState(restore)
  const [views, setViews] = useState<GatewayImportView[]>([])
  const [pending, setPending] = useState<Pending | null>(restored.pending)
  const [busy, setBusy] = useState(false)
  const live = useRef(false), generation = useRef(0), lock = useRef(false)
  const load = useCallback(async () => {
    const current = ++generation.current
    try { const result = await api.request('listGatewayImports', undefined); if (live.current && current === generation.current) setViews(result) }
    catch (error) { if (live.current && current === generation.current) toast.error(errorText(error)) }
  }, [api])
  const forget = () => { localStorage.removeItem(pendingKey); setPending(null) }
  const settled = (receipt: GatewayImportReceipt) => { forget(); toast.success(receipt.outcome === 'reused' ? '已确认现有模型连接' : '模型连接已导入'); void load() }
  useEffect(() => {
    live.current = true
    const unsubscribe = api.subscribe(event => { if (event.type === 'gateway-imports:changed') void load() })
    void load()
    if (restored.error) toast.error(restored.error)
    if (restored.pending) {
      const requestId = restored.pending.input.requestId
      void api.request('getGatewayImportReceipt', { requestId }).then(receipt => {
        if (!live.current) return
        if (receipt) { localStorage.removeItem(pendingKey); setPending(null); toast.success('已核对：模型连接已保存'); void load() }
        else setPending(current => current?.input.requestId === requestId ? { ...current, absent: true } : current)
      }).catch(error => { if (live.current) toast.error(errorText(error)) })
    }
    return () => { live.current = false; generation.current++; unsubscribe() }
  }, [api, load, restored])
  const run = async (operation: () => Promise<void>) => {
    if (lock.current || restored.error) return
    lock.current = true; setBusy(true)
    try { await operation() } catch (error) { toast.error(errorText(error)) }
    finally { lock.current = false; if (live.current) setBusy(false) }
  }
  const save = (input: GatewayImportConfirmation) => run(async () => {
    // Persist the exact original confirmation before sending; reload only performs receipt lookup.
    localStorage.setItem(pendingKey, JSON.stringify(input))
    setPending({ input, absent: false })
    const receipt = await api.request('confirmGatewayImport', input)
    settled(receipt)
  })
  const check = () => run(async () => {
    if (!pending) return
    const receipt = await api.request('getGatewayImportReceipt', { requestId: pending.input.requestId })
    if (receipt) settled(receipt)
    else { setPending({ ...pending, absent: true }); toast.info('未找到保存回执，可以重试原保存或重新审阅。') }
  })
  const reviewAgain = () => run(async () => { if (pending?.absent) { forget(); await load() } })
  const view = pending ? views.find(value => value.draft.id === pending.input.draftId) : views[0]
  if (!view && !pending) return null
  const cancel = () => run(async () => { if (!pending && view) { await api.request('cancelGatewayImport', { draftId: view.draft.id }); await load() } })
  return <Dialog open onOpenChange={open => { if (!open && !busy && !pending) void cancel() }}>
    <ConnectionDialogLayout choosing={false} label="模型连接" title={pending ? '核对模型导入' : '导入 Magpie 连接'} illustration={<ConnectionIllustration configuring />} closeLabel="取消导入" working={busy || !!pending || !!restored.error} onClose={() => { void cancel() }} finalFocus={undefined}>
      {view && <ImportReview key={view.draft.id} view={view} disabled={busy || !!pending || !!restored.error} onSave={input => { void save(input) }} onCancel={() => { void cancel() }} />}
      {pending && <div className="flex flex-col gap-3 pt-4">
        <p className="text-sm text-muted-foreground">{pending.absent ? '尚未保存。可重试原请求，或重新审阅连接。' : '保存结果尚待核对，请先查询原请求。'}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => { void check() }}>核对保存结果</Button>
          {pending.absent && <><Button variant="secondary" disabled={busy} onClick={() => { void reviewAgain() }}>重新审阅</Button><Button disabled={busy} onClick={() => { void save(pending.input) }}>重试原保存</Button></>}
        </div>
      </div>}
    </ConnectionDialogLayout>
  </Dialog>
}

function ImportReview({ view, disabled, onSave, onCancel }: { view: GatewayImportView; disabled: boolean; onSave(input: GatewayImportConfirmation): void; onCancel(): void }) {
  const [target, setTarget] = useState('new')
  const { payload } = view.draft
  const selected = view.matches.find(connection => connection.id === target)
  return <ConnectionForm disabled={disabled} onSubmit={event => {
    event.preventDefault()
    if (target !== 'new' && !selected) { toast.error('原连接已变化，请重新选择'); return }
    onSave({ draftId: view.draft.id, requestId: crypto.randomUUID(), ...(selected ? { target: { id: selected.id, revision: selected.revision ?? 1 } } : {}) })
  }} footer={<><Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>取消导入</Button><Button type="submit" disabled={disabled}>{selected ? '确认更新连接' : '确认添加连接'}</Button></>}>
    <ConnectionSettingRow label="连接名称"><span className="break-all text-sm">{payload.name}</span></ConnectionSettingRow>
    <ConnectionSettingRow label="网关地址"><span className="break-all text-sm">{payload.baseUrl}</span></ConnectionSettingRow>
    <ConnectionSettingRow label="接口协议"><span className="text-sm">{protocols[payload.protocol]}</span></ConnectionSettingRow>
    <ConnectionSettingRow label="模型"><span className="break-all text-sm">{payload.modelId}</span></ConnectionSettingRow>
    {view.matches.length > 0 && <ConnectionSettingRow label="保存到" hint="已有相同地址的连接。更新会改变使用该连接的员工后续模型调用。">
      <div className="flex min-w-0 flex-col gap-2"><SelectField value={target} onValueChange={setTarget} options={[{ value: 'new', label: '新增连接' }, ...view.matches.filter(connection => connection.gateway?.auth === 'local').map(connection => ({ value: connection.id, label: `更新：${connection.name}` }))]} />
        {selected && <p className="break-all text-xs text-muted-foreground">当前：{selected.defaultModel} · {selected.gateway && protocols[selected.gateway.protocol]} → {payload.modelId} · {protocols[payload.protocol]}</p>}
      </div>
    </ConnectionSettingRow>}
  </ConnectionForm>
}
