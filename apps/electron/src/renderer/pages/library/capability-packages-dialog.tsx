/*
 * [INPUT]: Existing capability package operations and stable application receipts; explicit local paths and employee choices.
 * [OUTPUT]: Manual inspect/install/bind/configure/update/disable/uninstall, with explicit partial and permission review.
 * [OUTPUT]: Running/unknown receipts resolve by identity; update/uninstall committed awaits cleanup, with explicit reconciliation only after the application becomes unknown.
 * [OUTPUT]: Each explicit cleanup attempt persists its own request identity; unknown attempts are read back before another attempt can start.
 * [POS]: Skills management entry; no scripts, model calls or native global configuration writes.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ApplicationRequest, ApplicationResult } from '@boai/shared/domain/application-protocol'
import type { CapabilityBinding, CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '@boai/shared/domain/capability-packages'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { useMutation, showErrorToast, errorText } from '@/components/common'
import { capabilityUpdateReview } from './capability-update-review'

const pendingKey = 'boai.library.pending-capability-request'
const recoveryKey = 'boai.library.pending-capability-recovery'
type Detail = { installation: CapabilityInstallation; bindings: CapabilityBinding[] }
type RecoveryAttempt = { pendingId: string; requestId: string }
function readPending() { try { return localStorage.getItem(pendingKey) } catch { return null } }
function readRecoveryAttempt(pendingId: string): RecoveryAttempt | null {
  try { const value = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null'); return value?.pendingId === pendingId && typeof value.requestId === 'string' && value.requestId ? value : null } catch { return null }
}
function clearRecoveryAttempt(attempt: RecoveryAttempt) {
  if (readRecoveryAttempt(attempt.pendingId)?.requestId === attempt.requestId) localStorage.removeItem(recoveryKey)
}
function pendingCommitCleanup(value: Partial<CapabilityOperation> | undefined) {
  return value?.status === 'completed' && value.phase === 'committed' && ['update', 'uninstall'].includes(value.action ?? '')
}
async function read<T>(api: DesktopApi, action: string, input: Record<string, unknown> = {}): Promise<T> {
  const result = await api.request('executeApplicationOperation', { operation: `capabilityPackages.${action}`, input })
  if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '能力包读取未完成。')
  return result.data as T
}
export function CapabilityPackagesDialog({ api, onClose, onChanged }: { api: DesktopApi; onClose(): void; onChanged(): void }) {
  const [installations, setInstallations] = useState<CapabilityInstallation[]>([]), [detail, setDetail] = useState<Detail>()
  const [employees, setEmployees] = useState<DigitalAgent[]>([]), [employeeId, setEmployeeId] = useState(''), [contributionIds, setContributionIds] = useState<string[]>([])
  const [path, setPath] = useState(''), [inspection, setInspection] = useState<CapabilityInspection>(), [partial, setPartial] = useState(false), [approved, setApproved] = useState<string[]>([])
  const [sourceContribution, setSourceContribution] = useState(''), [credential, setCredential] = useState(''), [removing, setRemoving] = useState(false)
  const [pendingId, setPendingId] = useState(readPending)
  const mutation = useMutation(), generation = useRef(0)
  const installation = detail?.installation, binding = detail?.bindings.find(item => item.employeeId === employeeId)
  const employee = employees.find(item => item.id === employeeId), locked = mutation.busy || Boolean(pendingId)
  const updateReview = installation && inspection ? capabilityUpdateReview(installation.definitions, inspection.definitions) : undefined
  const load = async (selected = installation?.id) => {
    const token = ++generation.current
    const [items, snapshot, next] = await Promise.all([read<CapabilityInstallation[]>(api, 'list'), api.request('snapshot', undefined), selected ? read<Detail>(api, 'get', { installationId: selected }) : undefined])
    if (token !== generation.current) return
    setInstallations(items); setEmployees(snapshot.agents); setDetail(next)
  }
  useEffect(() => { void load().catch(reason => showErrorToast(errorText(reason))); return () => { generation.current++ } }, [api])
  const choose = (item?: CapabilityInstallation) => { void mutation.run(async () => { setInspection(undefined); setPartial(false); setApproved([]); setRemoving(false); setCredential(''); setSourceContribution(''); setEmployeeId(''); setContributionIds([]); if (item) await load(item.id); else { generation.current++; setDetail(undefined) } }) }
  const applyResult = async (requestId: string, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('原操作还没有可核对结果，请保留请求身份。')
    const result = value as Partial<CapabilityOperation> | undefined
    if (pendingCommitCleanup(result)) { toast.info('原能力包操作仍在清理中'); return }
    if (result && ['preparing', 'interrupted', 'failed'].includes(String(result.status))) {
      if (result.status === 'failed') { localStorage.removeItem(pendingKey); setPendingId(null) }
      throw new Error(result.error ?? '能力包操作尚未完成，请核对原请求。')
    }
    if (localStorage.getItem(pendingKey) === requestId) localStorage.removeItem(pendingKey)
    setPendingId(null); setCredential(''); setInspection(undefined); setPartial(false); setRemoving(false)
    await load(); onChanged(); toast.success(result?.retained?.length ? '操作已完成，定制内容已保留' : '能力包操作已完成')
  }
  const submit = async (action: string, input: Record<string, unknown>) => {
    if (pendingId) throw new Error('请先核对原能力包操作。')
    const request: ApplicationRequest = { operation: `capabilityPackages.${action}`, requestId: crypto.randomUUID(), input }
    localStorage.setItem(pendingKey, request.requestId!); setPendingId(request.requestId!)
    const result = await api.request('executeApplicationOperation', request)
    if (result.status === 'rejected') { localStorage.removeItem(pendingKey); setPendingId(null) }
    if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '操作结果尚未确认，请核对原请求。')
    await applyResult(request.requestId!, result.data)
  }
  const applyRecoveryResult = async (attempt: RecoveryAttempt, result: ApplicationResult | null) => {
    if (result?.status === 'rejected') { clearRecoveryAttempt(attempt); throw new Error(result.error?.message ?? '本次清理已拒绝，可重新核对原操作。') }
    if (result?.status !== 'succeeded') throw new Error(result?.error?.message ?? '本次清理结果尚未确认，请核对同一次请求。')
    const operation = result.data as Partial<CapabilityOperation> | undefined
    if (pendingCommitCleanup(operation)) { toast.info('本次清理仍在进行中'); return }
    if (operation?.status === 'interrupted') {
      clearRecoveryAttempt(attempt)
      toast.info('本次清理已结束，仍有保留内容，可再次核对')
      return
    }
    if (operation?.status !== 'completed' && operation?.status !== 'failed') throw new Error('本次清理结果尚未确认，请核对同一次请求。')
    clearRecoveryAttempt(attempt)
    await applyResult(attempt.pendingId, operation)
  }
  const recover = () => { void mutation.run(async () => {
    if (!pendingId) return
    const activeAttempt = readRecoveryAttempt(pendingId)
    if (activeAttempt) {
      await applyRecoveryResult(activeAttempt, await api.request('getApplicationReceipt', { requestId: activeAttempt.requestId }))
      return
    }
    const receipt = await api.request('getApplicationReceipt', { requestId: pendingId })
    if (receipt?.status === 'rejected') { localStorage.removeItem(pendingKey); setPendingId(null); throw new Error(receipt.error?.message ?? '原操作已拒绝。') }
    const recordedOperation = receipt?.data as Partial<CapabilityOperation> | undefined
    if (receipt?.status === 'succeeded' && !['preparing', 'interrupted'].includes(String(recordedOperation?.status)) && !pendingCommitCleanup(recordedOperation)) { await applyResult(pendingId, receipt.data); return }
    const domainRequestId = (receipt?.data as Partial<CapabilityOperation> | undefined)?.requestId
    const identity = domainRequestId ? { requestId: domainRequestId } : receipt?.receiptId ? { applicationReceiptId: receipt.receiptId } : undefined
    if (!identity) throw new Error('原操作还没有可核对的领域回执；请保留请求身份，不会重新提交。')
    const original = await read<CapabilityOperation | undefined>(api, 'receipt', identity)
    const cleanupPending = pendingCommitCleanup(original)
    if (original?.status === 'completed' && !cleanupPending || original?.status === 'failed') { await applyResult(pendingId, original); return }
    if (cleanupPending && receipt?.status !== 'unknown') { toast.info('原能力包操作仍在清理中'); return }
    if (original?.status === 'preparing') { toast.info('原能力包操作仍在进行中'); return }
    if (!original?.requestId || original.status !== 'interrupted' && !cleanupPending) throw new Error('原操作还没有可核对的领域回执；请保留请求身份，不会重新提交。')
    // A settled cleanup may be tried again explicitly; an unknown attempt keeps this exact identity.
    const attempt = { pendingId, requestId: crypto.randomUUID() }
    localStorage.setItem(recoveryKey, JSON.stringify(attempt))
    const result = await api.request('executeApplicationOperation', { operation: 'capabilityPackages.recover', requestId: attempt.requestId, input: { originalRequestId: original.requestId } })
    await applyRecoveryResult(attempt, result)
  }) }
  const inspect = () => { void mutation.run(async () => {
    const value = await read<CapabilityInspection>(api, 'inspect', { path })
    setInspection(value); setPartial(false); setApproved(installation ? capabilityUpdateReview(installation.definitions, value.definitions).approved : [])
  }) }
  const identity = installation ? { installationId: installation.id, expectedRevision: installation.revision } : undefined
  const ready = inspection && (!inspection.unsupported.length || inspection.partialAllowed && partial)
  const execute = (action: string, input: Record<string, unknown>) => { void mutation.run(() => submit(action, input)) }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.busy) onClose() }}><DialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto sm:max-w-[820px]"><DialogTitle>能力包</DialogTitle>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={locked} onClick={() => choose()}>导入本地包</Button><Button variant="ghost" size="sm" disabled={mutation.busy} onClick={() => { void mutation.run(() => load()) }}>刷新</Button>{pendingId && <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={recover}>核对原操作</Button>}</div>
    <div className="grid min-w-0 gap-5 sm:grid-cols-[180px_minmax(0,1fr)]"><div className="space-y-1" aria-label="已安装能力包">{installations.map(item => <Button key={item.id} variant="ghost" size="sm" className="w-full justify-start" disabled={locked} aria-pressed={item.id === installation?.id} onClick={() => choose(item)}><span className="truncate">{item.name} · {item.version}{item.status === 'uninstalled' ? '（已卸载）' : ''}</span></Button>)}</div>
      <div className="min-w-0 space-y-5">
        {installation && identity && <><div className="space-y-1"><h3 className="text-sm font-medium">{installation.name}</h3><p className="break-all text-xs text-muted-foreground">{installation.packageId} · {installation.version} · {installation.format}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={locked || installation.status !== 'installed'} onClick={() => execute('setEnabled', { ...identity, enabled: !installation.enabled })}>{installation.enabled ? '停用' : '启用'}</Button><Button variant="ghost" size="sm" disabled={locked || installation.status === 'uninstalled'} onClick={() => setRemoving(value => !value)}>卸载</Button>{removing && <><Button variant="ghost" size="sm" disabled={locked || installation.status === 'uninstalled'} onClick={() => setRemoving(false)}>取消</Button><Button variant="destructive" size="sm" disabled={locked} onClick={() => execute('uninstall', identity)}>确认卸载</Button></>}</div>
          {installation.partial && <div className="space-y-2"><h4 className="text-sm font-medium">已导入支持部分</h4><ul className="space-y-1 text-sm">{installation.unsupported.map((item, index) => <li key={index}>{item.component}：{item.message}</li>)}</ul></div>}
          {!!installation.retained?.length && <div className="space-y-2"><h4 className="text-sm font-medium">保留内容</h4><ul className="space-y-1 break-all text-sm">{installation.retained.map(item => <li key={item}>{item}</li>)}</ul></div>}
          <fieldset disabled={locked || installation.status !== 'installed'} className="space-y-3"><legend className="mb-2 text-sm font-medium">员工绑定</legend><SelectField aria-label="绑定员工" value={employeeId} options={[{ value: '', label: '选择员工' }, ...employees.map(item => ({ value: item.id, label: item.name }))]} onValueChange={value => { setEmployeeId(value); setContributionIds(detail!.bindings.find(item => item.employeeId === value)?.contributionIds ?? []) }} />
            {installation.contributions.map(item => <label key={item.id} className="flex items-center gap-2 text-sm"><Checkbox checked={contributionIds.includes(item.id)} onCheckedChange={checked => setContributionIds(values => checked ? [...values, item.id] : values.filter(id => id !== item.id))} /><span>{item.key} · {item.kind === 'skill' ? '技能' : '工具'}</span></label>)}
            <div className="flex gap-2"><Button size="sm" disabled={!employee || !contributionIds.length} onClick={() => employee && execute('bind', { ...identity, employeeId: employee.id, expectedConfigVersion: employee.configVersion, expectedBindingRevision: binding?.revision ?? 0, contributionIds })}>保存绑定</Button>{binding && employee && <Button variant="secondary" size="sm" onClick={() => execute('unbind', { ...identity, employeeId: employee.id, expectedConfigVersion: employee.configVersion, expectedBindingRevision: binding.revision })}>解绑员工</Button>}</div>
          </fieldset>
          {installation.contributions.some(item => item.kind === 'source') && <fieldset disabled={locked || installation.status !== 'installed'} className="space-y-3"><legend className="mb-2 text-sm font-medium">连接凭据</legend><SelectField aria-label="配置工具贡献" value={sourceContribution} options={[{ value: '', label: '选择工具贡献' }, ...installation.contributions.filter(item => item.kind === 'source').map(item => ({ value: item.id, label: item.key }))]} onValueChange={value => { setSourceContribution(value); setCredential('') }} /><Input type="password" autoComplete="off" aria-label="能力包连接凭据" value={credential} onChange={event => setCredential(event.target.value)} placeholder="Token 或环境变量 JSON" /><Button size="sm" disabled={!sourceContribution} onClick={() => { void mutation.run(async () => { const contribution = installation.contributions.find(item => item.id === sourceContribution)!; const source = await api.request('getDataSource', { id: contribution.objectId }); await submit('configure', { ...identity, contributionId: sourceContribution, expectedSourceRevision: source.revision, credential }) }) }}>保存凭据</Button></fieldset>}
        </>}
        <fieldset disabled={locked || installation?.status === 'uninstalled'} className="space-y-3"><legend className="mb-2 text-sm font-medium">{installation ? '预检新版本' : '本地包目录'}</legend><div className="flex gap-2"><Input aria-label="能力包目录" value={path} onChange={event => { setPath(event.target.value); setInspection(undefined) }} /><Button variant="secondary" size="sm" onClick={() => { void mutation.run(async () => { const selected = await api.request('chooseDataSourceFolder', undefined); if (selected) { setPath(selected); setInspection(undefined) } }) }}>选择</Button><Button size="sm" disabled={!path.trim()} onClick={inspect}>预检</Button></div></fieldset>
        {inspection && <fieldset disabled={locked} className="space-y-3"><legend className="mb-2 text-sm font-medium">{inspection.name} · {inspection.version}</legend><p className="break-all text-xs text-muted-foreground">{inspection.packageId} · {inspection.contentHash}</p>
          {inspection.unsupported.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">不支持的内容</h4><ul className="space-y-1 text-sm">{inspection.unsupported.map((item, index) => <li key={index}>{item.component}：{item.message}</li>)}</ul>{inspection.partialAllowed && <label className="flex gap-2 text-sm"><Checkbox checked={partial} onCheckedChange={setPartial} />仅导入已支持且可独立运行的部分</label>}</div>}
          {inspection.warnings.map((item, index) => <p key={index} className="text-sm">{item.component}：{item.message}</p>)}
          {updateReview ? <div className="space-y-2"><h4 className="text-sm font-medium">能力变化</h4>{updateReview.rows.map(item => <label key={item.key} className="flex gap-2 text-sm"><Checkbox checked={approved.includes(item.key)} onCheckedChange={checked => setApproved(values => checked ? [...values, item.key] : values.filter(key => key !== item.key))} /><span>{item.key} · {{ added: '新增', changed: '变化', unchanged: '保持' }[item.change]}</span></label>)}{updateReview.removed.map(key => <p key={key} className="text-sm">{key} · 移除</p>)}</div> : <ul className="space-y-1 text-sm">{inspection.definitions.map(item => <li key={item.key}>{item.key} · {item.kind === 'skill' ? '技能' : '工具'}</li>)}</ul>}
          <Button size="sm" disabled={!ready} onClick={() => execute(installation ? 'update' : 'install', { ...(identity ?? {}), path: inspection.source.path, contentHash: inspection.contentHash, allowPartial: partial, ...(installation ? { approvedContributionKeys: approved } : {}) })}>{installation ? '确认更新' : '导入能力包'}</Button>
        </fieldset>}
      </div>
    </div>
  </DialogContent></Dialog>
}
