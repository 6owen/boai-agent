/*
 * [INPUT]: 无密钥 ACP 登录扫描合同、已有启动项、草稿预填接口、Agent 插画/品牌图标、共用弹窗布局和配置编辑器。
 * [OUTPUT]: 仅 ACP 的 520px 首级/620px 二级扫描向导，自动预填/高级来源详情、手动目录加载、测试/保存与未保存保护。
 * [POS]: 本机 Agent 独立扫描入口；模型 API 导入内容归 local-model-import，不保存或执行扫描结果。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useState, type RefObject } from 'react'
import type { LaunchProfile } from '@shared/domain'
import type { DetectedOAuthConfig, LocalConfigScanResult } from '@shared/domain/local-configs'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Check, ChevronRight, FolderOpen, LoaderCircle, Plus, RefreshCw } from '@/components/icons/index'
import { Banner, GuardContext, useMutation } from '@/components/common/index'
import { AgentBrandIcon, LocalAgentIllustration } from './local-agent-visuals'
import { LocalAgentEditor, type LocalAgentDraft } from './local-agent-editor'
import { ConnectionDialogLayout, ConnectionSettingRow } from './connection-layout'

type Selection = { draft: LocalAgentDraft; manual?: boolean; source?: DetectedOAuthConfig }
const candidates = (scan: LocalConfigScanResult | null) => scan?.logins.filter(item => item.authType === 'oauth') ?? []
const profileDraft = ({ revision, executableHash: _, verified: _verified, hostAccessAcknowledged: _ack, ...fields }: LaunchProfile): LocalAgentDraft => ({ ...fields, expectedRevision: revision })

export function LocalConnections({ profiles, api, initialProfile, onSaved, onClose, finalFocus }: {
  profiles: LaunchProfile[]; api: DesktopApi; initialProfile?: LaunchProfile
  onSaved: () => Promise<void>; onClose: () => void; finalFocus: RefObject<HTMLButtonElement | null>
}) {
  const [selection, setSelection] = useState<Selection | null>(() => initialProfile ? { draft: profileDraft(initialProfile) } : null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [result, setResult] = useState<LocalConfigScanResult | null>(null)
  const [directoryResult, setDirectoryResult] = useState<LocalConfigScanResult | null>(null)
  const [operation, setOperation] = useState<'scan' | 'directory' | 'select' | null>(null)
  const { busy, error, run, setError } = useMutation(), guard = useContext(GuardContext)
  const working = busy || editorBusy
  const close = () => { if (!working) guard.navigate(onClose, { resetOnDiscard: false }) }
  const scan = () => void run(async () => {
    setOperation('scan')
    try { const found = await api.request('scanLocalConnections', {}); if (found) setResult(found) }
    finally { setOperation(null) }
  })
  const back = () => { setSelection(null); setDirectoryResult(null); setError(''); if (!result) scan() }
  const select = (item: DetectedOAuthConfig) => guard.navigate(() => void run(async () => {
    setOperation('select')
    try {
      const existing = profiles.find(profile => profile.localConfigId === item.configId)
      const draft = existing ? profileDraft(existing) : item.acp ? await api.request('prepareLocalAgent', { configId: item.configId }) : {
        name: 'Codex', executable: '', args: [], useExistingLogin: true,
        codexHome: item.sourcePath.replace(/[\\/][^\\/]+$/, ''),
      }
      setSelection({ draft, source: item })
      setDirectoryResult(null)
    } finally { setOperation(null) }
  }), { resetOnDiscard: false })
  const loadDirectory = () => void run(async () => {
    setOperation('directory')
    try {
      const found = await api.request('scanLocalConnections', { chooseDirectory: true })
      if (found) { setDirectoryResult(found); setResult(found) }
    } finally { setOperation(null) }
  })
  useEffect(() => { if (!initialProfile) scan() }, [])
  const options = (items: DetectedOAuthConfig[]) => items.map(item => {
    const imported = profiles.some(profile => profile.localConfigId === item.configId)
    return <Button key={item.configId} type="button" variant="surface" size="content" className="connection-provider-option" aria-label="Codex 配置" disabled={working} onClick={() => select(item)}>
      <AgentBrandIcon name="Codex" /><span><strong>Codex</strong><small>使用本机登录接入 Agent</small></span>
      {imported && <span className="local-agent-imported"><Check size={13} />已导入</span>}<ChevronRight size={16} />
    </Button>
  })
  const directoryLoader = <div>
    <div className="py-3"><Button type="button" variant="ghost" size="sm" disabled={working} onClick={loadDirectory}>{operation === 'directory' ? <LoaderCircle className="spinner" /> : <FolderOpen />}选择目录加载</Button></div>
    {directoryResult && <>
      {candidates(directoryResult).length ? <div className="connection-provider-options mb-3" aria-label="目录中的配置">{options(candidates(directoryResult))}</div> : <p className="connection-model-message mb-3" role="status">这个目录没有找到 Agent 登录配置，可以换个目录或继续手动填写。</p>}
      {(directoryResult.truncated || directoryResult.skippedFiles > 0) && <p className="connection-model-message mt-2">部分文件未能读取，可选择更具体的目录。</p>}
    </>}
  </div>
  const sourceDetails = selection?.source ? <>
    <ConnectionSettingRow label="配置文件" icon={<FolderOpen />}><Input aria-label="配置文件" readOnly value={selection.source.sourcePath ?? ''} title={selection.source.sourcePath} /></ConnectionSettingRow>
  </> : undefined
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <ConnectionDialogLayout choosing={!selection} label={initialProfile ? '编辑 Agent 配置' : '添加本机 Agent'}
      title={selection ? selection.manual ? '手动添加 Agent' : '配置本机 Agent' : '选择本机 Agent'}
      illustration={<LocalAgentIllustration configuring={!!selection} />} description="读取本机 Agent 登录配置，启动信息会自动填写；扫描不会运行或安装程序。" working={working} onClose={close} closeLabel="关闭 Agent 配置" finalFocus={finalFocus} initialFocus={false}
      steps={{ label: '添加 Agent 进度', first: '扫描与选择', second: '配置 Agent' }}>
      {selection ? <LocalAgentEditor key={selection.draft.id ?? selection.source?.configId ?? 'manual'} api={api} initial={selection.draft} manual={selection.manual} onBack={back} onWorking={setEditorBusy} pending={busy} leading={<>{error && <Banner>{error}</Banner>}{selection.manual && directoryLoader}</>} details={sourceDetails} onSaved={async () => { await onSaved(); guard.saved(onClose) }} /> : <>
          {error && <Banner>{error}</Banner>}
          {operation === 'scan' && !result && <p className="connection-model-message flex items-center gap-2" role="status"><LoaderCircle className="spinner" />正在扫描本地配置…</p>}
          {result && <>
            {(result.truncated || result.skippedFiles > 0) && <p className="connection-model-message" role="status">部分文件未能读取，可在手动添加中选择具体目录。</p>}
            {!candidates(result).length && <p className="connections-empty">还没找到本机 Agent，可以从下方手动添加。</p>}
          </>}
          <div className="connection-provider-options" aria-busy={operation === 'scan'}>
            {options(candidates(result))}
            <Button variant="surface" size="content" className="connection-provider-option" disabled={working} onClick={() => { setError(''); setSelection({ manual: true, draft: { name: '', executable: '', args: [], useExistingLogin: true } }) }}><span className="connection-provider-icon"><Plus /></span><span><strong>手动添加</strong><small>填写启动命令，或从目录加载</small></span><ChevronRight /></Button>
          </div>
        <div className="connection-wizard-note"><RefreshCw size={14} /><span>没有找到你的 Agent？</span><Button variant="link" size="content" className="local-agent-rescan" disabled={working} onClick={scan}>{operation === 'scan' ? '正在扫描…' : '重新扫描'}</Button></div>
      </>}
    </ConnectionDialogLayout>
  </Dialog>
}
