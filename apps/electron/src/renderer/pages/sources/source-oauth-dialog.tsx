/*
 * [INPUT]: Fixed Source identity and version, host-owned OAuth request/status/cancel operations.
 * [OUTPUT]: Explicit authorization link, bounded polling and cancellation on close/unmount; no renderer tokens.
 * [POS]: Source connection authentication UI, independent from model connection login.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DataSource, SourceOAuthStatus } from '@boai/shared/domain/sources'
import type { ApplicationRequest } from '@boai/shared/domain/application-protocol'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { errorText, showErrorToast, useMutation } from '@/components/common'
import { ConnectionSettingRow } from '../settings/connection-layout'

const activeAuthorization = (value: SourceOAuthStatus | undefined) => value?.status === 'pending' || value?.status === 'authorizing'
export class RejectedSourceAuthorization extends Error {}
export async function requestSourceOAuth(api: DesktopApi, request: ApplicationRequest) {
  const previous = request.requestId ? await api.request('getApplicationReceipt', { requestId: request.requestId }) : null
  const result = previous ?? await api.request('executeApplicationOperation', request)
  if (result.status === 'rejected') throw new RejectedSourceAuthorization(result.error?.message ?? '授权请求已拒绝。')
  if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '授权操作结果尚未确认，请核对原请求。')
  return result.data
}
export function SourceOAuthDialog({ api, source, onClose, onAuthorized }: { api: DesktopApi; source: DataSource; onClose(): void; onAuthorized(): void }) {
  const [pollRevision, setPollRevision] = useState(0)
  const [metadataUrl, setMetadataUrl] = useState(''), [authorization, setAuthorization] = useState<SourceOAuthStatus>()
  const active = useRef(true), current = useRef<SourceOAuthStatus | undefined>(undefined), pending = useRef<ApplicationRequest | undefined>(undefined)
  const mutation = useMutation()
  const requiresMetadata = source.type === 'mcp' && source.mcp.transport !== 'stdio' && new URL(source.mcp.url).hostname === 'mcp.vercel.com'
  const cancel = async (value = current.current) => {
    if (!value || !activeAuthorization(value)) return
    await requestSourceOAuth(api, { operation: 'sources.oauthCancel', requestId: `oauth-cancel:${value.authorizationId}`, input: { authorizationId: value.authorizationId } })
    current.current = { ...value, status: 'cancelled' }
  }
  useEffect(() => {
    active.current = true
    return () => { active.current = false; void cancel().catch(() => { /* Host deadline remains authoritative after renderer exit. */ }) }
  }, [])
  useEffect(() => {
    if (!authorization || !activeAuthorization(authorization)) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, polls = 0
    const tick = async () => {
      if (!live) return
      try {
        const value = await requestSourceOAuth(api, { operation: 'sources.oauthStatus', input: { authorizationId: authorization.authorizationId } }) as SourceOAuthStatus
        if (!live || !active.current) return
        if (value.authorizationId !== authorization.authorizationId || value.sourceId !== source.id) throw new Error('授权回执与当前连接不一致。')
        current.current = value
        if (value.status === 'authorized') { setAuthorization(value); toast.success('授权已完成'); onAuthorized(); onClose(); return }
        if (!activeAuthorization(value)) { setAuthorization(value); if (value.status === 'failed' || value.status === 'expired') showErrorToast(value.error ?? '授权已失效，请重新授权。'); return }
        if (++polls >= 300 || Date.now() >= Date.parse(value.expiresAt)) { await cancel(value); if (live) { setAuthorization({ ...value, status: 'expired' }); showErrorToast('授权已到期，请重新授权。') }; return }
        timer = setTimeout(() => { void tick() }, 1000)
      } catch (reason) { if (live) showErrorToast(errorText(reason)) }
    }
    timer = setTimeout(() => { void tick() }, 1000)
    return () => { live = false; clearTimeout(timer) }
  }, [authorization?.authorizationId, api, source.id, pollRevision])
  const start = () => { void mutation.run(async () => {
    pending.current ??= { operation: 'sources.oauthStart', requestId: crypto.randomUUID(), input: { id: source.id, expectedRevision: source.revision, ...(metadataUrl.trim() ? { clientMetadataUrl: metadataUrl.trim() } : {}) } }
    let value: SourceOAuthStatus
    try { value = await requestSourceOAuth(api, pending.current) as SourceOAuthStatus } catch (reason) { if (reason instanceof RejectedSourceAuthorization) pending.current = undefined; throw reason }
    if (value.sourceId !== source.id || !value.authorizationId) throw new Error('授权回执缺少当前连接身份。')
    current.current = value
    if (!active.current) { await cancel(value); return }
    setAuthorization(value)
    if (value.status === 'authorized') { toast.success('授权已完成'); onAuthorized(); onClose() }
  }) }
  const close = () => { void mutation.run(async () => { await cancel(); onClose() }) }
  const reset = () => { pending.current = undefined; current.current = undefined; setAuthorization(undefined) }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.busy) close() }}><DialogContent className="sm:max-w-[620px]"><DialogTitle>授权 {source.name}</DialogTitle>
    <div className="space-y-5">
      <ConnectionSettingRow label="客户端元数据地址" hint="使用你控制的公开 HTTPS 地址，声明本客户端和允许的回调。Vercel 需要此项；不能借用其他应用的身份。"><Input type="url" aria-label="客户端元数据地址" placeholder="https://example.com/oauth-client.json" value={metadataUrl} disabled={mutation.busy || Boolean(pending.current)} onChange={event => setMetadataUrl(event.target.value)} /></ConnectionSettingRow>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" disabled={mutation.busy} onClick={close}>取消</Button>
        {authorization && activeAuthorization(authorization) && <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => setPollRevision(value => value + 1)}>核对授权结果</Button>}
        {authorization && !activeAuthorization(authorization) ? <Button size="sm" onClick={reset}>重新授权</Button>
          : authorization?.url ? <Button size="sm" render={<a href={authorization.url} target="_blank" rel="noreferrer" />}>打开授权页面</Button>
            : <Button size="sm" disabled={mutation.busy || requiresMetadata && !metadataUrl.trim()} onClick={start}>{pending.current ? '核对授权请求' : '开始授权'}</Button>}
      </div>
    </div>
  </DialogContent></Dialog>
}
