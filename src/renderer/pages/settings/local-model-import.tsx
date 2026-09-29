/*
 * [INPUT]: 无密钥本机 API 配置扫描结果、已有模型连接、DesktopApi 和父级连接弹窗回调。
 * [OUTPUT]: 添加模型连接第二步的内嵌扫描/详情；复用兼容接口横向字段、卡片和操作栏，返回居左、目录操作居右，重扫为底部文字链接。
 * [POS]: settings 的本机模型导入内容，不创建 Dialog、不重置父级步骤或弹窗尺寸。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { Connection } from '@shared/domain'
import type { DetectedApiKeyConfig, LocalConfigScanResult } from '@shared/domain/local-configs'
import type { DesktopApi } from '@shared/ipc'
import { Banner, useMutation } from '@/components/common'
import { ArrowLeft, Check, ChevronRight, FolderOpen, LoaderCircle, RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { FieldTitle } from '@/components/ui/field'
import { ConnectionForm, ConnectionSettingRow } from './connection-layout'
import { LocalApiConfigEditor } from './local-api-config-editor'

const sourceName = (item: DetectedApiKeyConfig) => item.sourceId === 'codex-api-key' ? 'Codex' : item.sourceId === 'claude-code-api-key' ? 'Claude Code' : item.providerName

export function LocalModelImport({ api, connections, onBack, onSaved, onWorking }: {
  api: DesktopApi; connections: Connection[]; onBack(): void; onSaved(): Promise<void>; onWorking(busy: boolean): void
}) {
  const [result, setResult] = useState<LocalConfigScanResult | null>(null)
  const [selected, setSelected] = useState<DetectedApiKeyConfig | null>(null)
  const [operation, setOperation] = useState<'scan' | 'directory'>('scan')
  const { busy, error, run } = useMutation()
  const scan = (chooseDirectory = false) => void run(async () => {
    setOperation(chooseDirectory ? 'directory' : 'scan')
    const found = await api.request('scanLocalConnections', { chooseDirectory })
    if (found) setResult(found)
  })
  useEffect(() => { scan() }, [])
  useEffect(() => { onWorking(busy); return () => onWorking(false) }, [busy, onWorking])

  if (selected) return <LocalApiConfigEditor key={selected.configId} api={api} config={selected} imported={connections.some(connection => connection.localConfigId === selected.configId)} onBack={() => setSelected(null)} onWorking={onWorking} onSaved={onSaved} />

  const configs = result?.logins.filter(item => item.authType === 'api_key') ?? []
  return <>
    <ConnectionForm disabled={busy} onSubmit={event => event.preventDefault()} footer={<>
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft />返回</Button>
      <div className="connection-editor-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => scan(true)}>{busy && operation === 'directory' ? <LoaderCircle className="spinner" /> : <FolderOpen />}选择其他目录</Button></div>
    </>}>
      {error && <Banner>{error}</Banner>}
      <div className="connection-provider-group">
        <div className="connection-group-heading"><FieldTitle><FolderOpen />本机配置</FieldTitle></div>
        {busy && !result && <p className="connection-model-message flex items-center gap-2 py-3" role="status"><LoaderCircle className="spinner" />正在扫描本机配置…</p>}
        {result && !configs.length && <p className="connection-model-message py-3">没有找到模型配置，可以选择其他目录。</p>}
        <div className="soft-divide-y" aria-busy={busy}>
          {configs.map(config => {
            const name = sourceName(config), imported = connections.some(connection => connection.localConfigId === config.configId)
            return <ConnectionSettingRow key={config.configId} label={name}>
              <Button type="button" variant="outline" className="w-full min-w-0 justify-between" aria-label={`${name} 配置`} title={config.sourcePath} onClick={() => setSelected(config)}>
                <span className="truncate">{config.model ?? '查看配置'}</span>
                {imported ? <span className="local-agent-imported"><Check size={13} />已导入</span> : <ChevronRight />}
              </Button>
            </ConnectionSettingRow>
          })}
        </div>
      </div>
      {result && (result.truncated || result.skippedFiles > 0) && <p className="connection-model-message py-3" role="status">部分文件未能读取，可选择更具体的目录。</p>}
    </ConnectionForm>
    <p className="connection-wizard-note"><RefreshCw size={14} />没有找到你的配置？<Button type="button" variant="link" size="content" className="local-agent-rescan" disabled={busy} onClick={() => scan()}>{busy && operation === 'scan' ? '正在扫描…' : '重新扫描'}</Button></p>
  </>
}
