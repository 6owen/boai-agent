/*
 * [INPUT]: 无密钥本地扫描合同、已有模型连接与统一 Dialog/Card/表单控件。
 * [OUTPUT]: 扫描/选择目录、API 导入、Codex 现有登录的 ACP 接入和防止重复导入的反馈。
 * [POS]: 模型连接页的本地 Agent 配置导入入口；扫描不保存或测试模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState } from 'react'
import type { Connection, LaunchProfile } from '@shared/domain'
import type { LocalConfigIssue, LocalConfigScanResult } from '@shared/domain/local-configs'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Check, FolderOpen, LoaderCircle, Search } from '@/components/icons/index'
import { Banner, Field, useMutation } from '@/components/common/index'

const issues: Record<LocalConfigIssue, string> = {
  'missing-api-key': '未找到 API Key，请先完善源配置。',
  'missing-model': '请补填默认模型 ID。',
  'invalid-base-url': '接口地址无效，请先修正源配置。',
  'unsupported-config': '包含暂不支持的协议或认证配置，请手动添加连接。',
  'invalid-config': '无法解析配置文件，请先修正源配置。',
}

export function LocalConnections({ connections, api, refresh, onAgentImported }: { connections: Connection[]; api: DesktopApi; refresh: () => Promise<void>; onAgentImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<LocalConfigScanResult | null>(null)
  const [models, setModels] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState('')
  const [operation, setOperation] = useState<string | null>(null)
  const { busy, error, run } = useMutation()
  const trigger = useRef<HTMLButtonElement>(null)
  const scan = (chooseDirectory = false) => void run(async () => {
    setOperation('scan'); setNotice('')
    try {
      const found = await api.request('scanLocalConnections', { chooseDirectory })
      if (found) { setResult(found); setModels({}); setAcknowledged({}) }
      setProfiles(await api.request('listLaunchProfiles', undefined))
    } finally { setOperation(null) }
  })
  return <>
    <Button ref={trigger} variant="outline" onClick={() => { setOpen(true); scan() }}><Search />扫描本地 Agent</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <DialogContent className="local-connections-dialog" style={{ width: 620, maxWidth: 'calc(100vw - 32px)' }} finalFocus={trigger}>
        <DialogTitle>导入本地 Agent 配置</DialogTitle>
        <DialogDescription>导入 Codex、Claude Code 的模型配置，或使用 Codex 已有登录接入本地 Agent。扫描只读取本地文件。</DialogDescription>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => scan()}>{operation === 'scan' ? <LoaderCircle className="spinner" /> : <Search />}重新扫描默认目录</Button>
          <Button variant="outline" disabled={busy} onClick={() => scan(true)}><FolderOpen />选择其他目录</Button>
        </div>
        {error && <Banner>{error}</Banner>}
        {notice && <p className="connection-feedback" role="status">{notice}</p>}
        {operation === 'scan' && <p role="status">正在扫描本地配置…</p>}
        {result && <div className="local-connections-results" aria-busy={operation === 'scan'}>
          <p className="connection-model-message">{result.directory ? `扫描目录：${result.directory}` : '已扫描 Codex 和 Claude Code 的默认配置目录。'}</p>
          {(result.truncated || result.skippedFiles > 0) && <p className="connection-model-message" role="status">部分文件无法读取或超出扫描范围，可选择更具体的配置目录重试。</p>}
          {!result.logins.length && <p className="connections-empty">未找到可识别的模型配置。可以选择其他目录，或手动添加连接。</p>}
          {result.logins.map(item => {
            const config = item.authType === 'api_key' ? item : null
            const imported = config ? connections.find(connection => connection.localConfigId === item.configId) : profiles.find(profile => profile.localConfigId === item.configId)
            const source = item.sourceId === 'codex-api-key' || item.sourceId === 'codex-cli' ? 'Codex' : item.sourceId === 'claude-code-api-key' ? 'Claude Code' : config?.providerName ?? 'OpenAI'
            const model = config?.model ?? models[item.configId] ?? ''
            const usable = config && (config.usable || config.issue === 'missing-model')
            return <Card key={item.configId} className="local-connection-card gap-3 p-4" aria-label={`${source} 配置`}>
              <div className="flex items-center justify-between gap-3"><strong>{source}</strong>{imported && <span className="flex items-center gap-1 text-muted-foreground"><Check size={14} />已导入</span>}</div>
              {config && <div><p className="connection-row-description">{config.providerName} · {config.api === 'anthropic-messages' ? 'Anthropic' : config.api === 'openai-responses' ? 'Responses' : 'Chat Completions'}{config.model ? ` · ${config.model}` : ''}</p><p className="connection-endpoint" title={config.baseUrl}>{config.baseUrl}</p></div>}
              <p className="connection-model-message">{item.sourcePath}</p>
              {item.authType === 'oauth' ? <>
                <p className="connection-model-message">检测到 Codex 登录。通过 ACP 使用这个账号执行任务，登录由 Codex 管理。</p>
                {item.acp ? <p className="connection-model-message">已找到 ACP 程序：{item.acp.executable}</p> : <p className="connection-model-message">未找到 codex-acp。安装 @agentclientprotocol/codex-acp 后重新扫描，或手动添加启动项。</p>}
                {item.acp && !imported && <label className="toggle-row"><span><strong>允许此 Codex 程序在主机上运行</strong><small>使用现有登录与用户配置，可访问本机文件和网络；BoAI 仅能审批程序通过协议发来的请求。</small></span><Checkbox disabled={busy} checked={!!acknowledged[item.configId]} onCheckedChange={checked => setAcknowledged(current => ({ ...current, [item.configId]: checked }))} /></label>}
                <Button className="self-end" disabled={busy || !!imported || !item.acp || !acknowledged[item.configId]} onClick={() => void run(async () => {
                  setOperation(item.configId); setNotice('')
                  try {
                    await api.request('importLocalAgent', { configId: item.configId, hostAccessAcknowledged: true })
                    setProfiles(await api.request('listLaunchProfiles', undefined))
                    onAgentImported()
                    setNotice('已接入 Codex。点击完成后，在本地 Agent 中测试启动与登录，再为员工选择此启动项。')
                  } finally { setOperation(null) }
                })}>{operation === item.configId && <LoaderCircle className="spinner" />}{imported ? '已导入' : '接入 Codex'}</Button>
              </> : config && <>
                {config.issue && config.issue !== 'missing-model' && <p className="connection-model-message">{issues[config.issue]}</p>}
                {usable && !config.model && !imported && <Field label={`${source} 默认模型 ID`}><Input value={model} maxLength={300} placeholder="填写服务支持的模型 ID" disabled={busy} onChange={event => setModels(current => ({ ...current, [item.configId]: event.target.value }))} /></Field>}
                <Button className="self-end" disabled={busy || !!imported || !usable || !model.trim()} onClick={() => void run(async () => {
                  setOperation(item.configId); setNotice('')
                  try {
                    const saved = await api.request('importLocalConnection', { configId: item.configId, ...(!config.model ? { model: model.trim() } : {}) })
                    await refresh()
                    setNotice(`已导入「${saved.name}」，可在连接菜单中测试。`)
                  } finally { setOperation(null) }
                })}>{operation === item.configId && <LoaderCircle className="spinner" />}{imported ? '已导入' : '导入连接'}</Button>
              </>}
            </Card>
          })}
        </div>}
        <div className="flex justify-end"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>完成</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
