/*
 * [INPUT]: Explicit Magpie connection draft, shared DesktopApi and controlled gateway updates.
 * [OUTPUT]: Read-only local discovery/manual identity checks and source-scoped feedback; discovery changes only the draft.
 * [POS]: Gateway-specific fields within the existing connection editor.
 * [PROTOCOL]: Update Header and settings/.folder.md when changing this component.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { ErrorToast } from '@/components/common/error-feedback'
import { errorText } from '@/components/common'
import { ConnectionSettingRow } from './connection-layout'
import type { ModelGateway } from '@shared/domain/model-gateway'
import type { DesktopApi } from '@shared/ipc'

export function GatewayConnectionFields({ api, baseUrl, gateway, disabled, onChange, onDiscover }: { api: DesktopApi; baseUrl: string; gateway: ModelGateway; disabled: boolean; onChange(value: ModelGateway): void; onDiscover(baseUrl: string): void }) {
  const generation = useRef(0)
  const [status, setStatus] = useState<{ source: string; loading?: boolean; version?: string; error?: string }>()
  useEffect(() => () => { generation.current++ }, [baseUrl])
  const current = status?.source === baseUrl ? status : undefined
  const probe = async (discover = false) => {
    const request = ++generation.current
    setStatus({ source: baseUrl, loading: true })
    try {
      const result = discover ? await api.request('discoverModelGateway', undefined) : await api.request('probeModelGateway', { baseUrl })
      if (request === generation.current) {
        if (discover) onDiscover(result.baseUrl)
        setStatus({ source: discover ? result.baseUrl : baseUrl, version: result.version })
      }
    } catch (error) { if (request === generation.current) setStatus({ source: baseUrl, error: errorText(error) }) }
  }
  return <>
    <ConnectionSettingRow label="Magpie 服务">
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={disabled || current?.loading} onClick={() => { void probe(true) }}>发现本机服务</Button><Button type="button" variant="outline" disabled={disabled || current?.loading || !baseUrl.trim()} onClick={() => { void probe() }}>{current?.loading ? '正在检测…' : '检测地址'}</Button>{current?.version && <span role="status">已识别 Magpie {current.version}</span>}</div>
      {current?.error && <ErrorToast>{current.error}</ErrorToast>}
    </ConnectionSettingRow>
    <ConnectionSettingRow label="接口协议"><SelectField aria-label="Magpie 接口协议" disabled={disabled} value={gateway.protocol} onValueChange={value => onChange({ ...gateway, protocol: value as ModelGateway['protocol'] })} options={[{ value: 'chat', label: 'Chat Completions' }, { value: 'responses', label: 'Responses' }, { value: 'messages', label: 'Anthropic Messages' }]} /></ConnectionSettingRow>
    <ConnectionSettingRow label="认证方式"><SelectField aria-label="Magpie 认证方式" disabled={disabled} value={gateway.auth} onValueChange={value => onChange({ ...gateway, auth: value as ModelGateway['auth'] })} options={[{ value: 'local', label: '本机连接（无需密钥）' }, { value: 'key', label: '网关密钥' }]} /></ConnectionSettingRow>
  </>
}
