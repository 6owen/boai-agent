/*
 * [OUTPUT]: 扫描候选与手动添加共用20px图标尺寸，不受Button默认16px图标规则缩小。
 * [OUTPUT]: 运行时插件安装/更新/启停/卸载与当前租约状态；本机扫描及动态配置/测试/保存接入。
 * [OUTPUT]: 首级固定560px高度并受视口约束，扫描结果在共用shadcn ScrollArea内滚动，容器延伸至弹窗边缘、留白归内部内容，标题/步骤/重扫固定；只显示实际程序与一个手动添加，保留候选协议/来源和未接入禁用。
 * [INPUT]: 无密钥登录扫描合同、已有ACP/原生启动项、明确协议草稿预填接口、按真实程序优先匹配的Agent品牌图标/插画、共用弹窗布局和配置编辑器。
 * [OUTPUT]: 520px首级/620px二级本机向导，扫描候选自动预填/高级来源详情、目录加载、测试/保存与未保存保护。
 * [POS]: 本机 Agent 独立扫描入口；模型 API 导入内容归 local-model-import，不保存或执行扫描结果。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useState, type RefObject } from 'react'
import type { LaunchProfile } from '@shared/domain'
import type { DetectedLocalAgent, LocalConfigScanResult } from '@shared/domain/local-configs'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Check, ChevronRight, FolderOpen, LoaderCircle, Plus, RefreshCw } from '@/components/icons/index'
import { Banner, GuardContext, useMutation } from '@/components/common/index'
import { AgentBrandIcon, LocalAgentIllustration } from './local-agent-visuals'
import { LocalAgentEditor, type LocalAgentDraft } from './local-agent-editor'
import { ConnectionDialogLayout, ConnectionSettingRow } from './connection-layout'

type Selection = { draft: LocalAgentDraft; manual?: boolean; source?: DetectedLocalAgent }
const candidates = (scan: LocalConfigScanResult | null) => scan?.agents ?? []
const profileDraft = ({ revision, executableHash: _, verified: _verified, hostAccessAcknowledged: _ack, ...fields }: LaunchProfile): LocalAgentDraft => ({ ...fields, expectedRevision: revision })
const matchesCandidate = (profile: LaunchProfile, item: DetectedLocalAgent) => (profile.protocol ?? 'acp') === item.protocol && profile.runtimePlugin?.pluginId === item.runtimePlugin?.pluginId && profile.runtimePlugin?.providerId === item.runtimePlugin?.providerId && (item.localConfigId ? profile.localConfigId === item.localConfigId : !profile.localConfigId && profile.executable === item.executable)

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
  const select = (item: DetectedLocalAgent) => guard.navigate(() => void run(async () => {
    setOperation('select')
    try {
      const existing = profiles.find(profile => matchesCandidate(profile, item))
      const draft = existing ? profileDraft(existing) : await api.request('prepareDetectedLocalAgent', { candidateId: item.candidateId })
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
  const options = (items: DetectedLocalAgent[]) => items.map(item => {
    const imported = profiles.some(profile => matchesCandidate(profile, item))
    return <Button key={item.candidateId} type="button" variant="surface" size="content" className="connection-provider-option" aria-label={`${item.name} 配置`} title={item.sourcePath ?? item.executable} disabled={working || item.availability !== 'available'} onClick={() => select(item)}>
      <AgentBrandIcon name={item.name} executable={item.executable} /><span><strong>{item.name}</strong><small>{item.availability === 'unsupported' ? '已发现程序 · 插件未启用或尚未接入' : item.sourcePath ?? '已发现程序，点击配置'}</small></span>
      {imported && <span className="local-agent-imported"><Check size={13} />已导入</span>}<ChevronRight size={16} />
    </Button>
  })
  const directoryLoader = <div>
    <div className="py-3"><Button type="button" variant="ghost" size="sm" disabled={working} onClick={loadDirectory}>{operation === 'directory' ? <LoaderCircle className="spinner" /> : <FolderOpen />}选择目录加载</Button></div>
    {directoryResult && <>
      {candidates(directoryResult).length ? <div className="connection-provider-options mb-3" aria-label="目录中的配置">{options(candidates(directoryResult))}</div> : <p className="connection-model-message mb-3" role="status">这个目录没有找到可接入的 Agent 配置，可以换个目录或继续手动填写。</p>}
      {(directoryResult.truncated || directoryResult.skippedFiles > 0) && <p className="connection-model-message mt-2">部分文件未能读取，可选择更具体的目录。</p>}
    </>}
  </div>
  const sourceDetails = selection?.source?.sourcePath ? <>
    <ConnectionSettingRow label="配置文件" icon={<FolderOpen />}><Input aria-label="配置文件" readOnly value={selection.source.sourcePath ?? ''} title={selection.source.sourcePath} /></ConnectionSettingRow>
  </> : undefined
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <ConnectionDialogLayout choosing={!selection} fixedHeight={selection ? undefined : 560} label={initialProfile ? '编辑 Agent 配置' : '添加本机 Agent'}
      title={selection ? selection.manual ? '手动添加 Agent' : '配置本机 Agent' : '选择本机 Agent'}
      illustration={<LocalAgentIllustration configuring={!!selection} />} description="扫描已安装的 Agent 与本机配置，启动信息会自动填写；扫描不会运行或安装程序。" working={working} onClose={close} closeLabel="关闭 Agent 配置" finalFocus={finalFocus} initialFocus={false}
      steps={{ label: '添加 Agent 进度', first: '扫描与选择', second: '配置 Agent' }}>
      {selection ? <LocalAgentEditor key={selection.draft.id ?? selection.source?.candidateId ?? 'manual'} api={api} initial={selection.draft} manual={selection.manual} onBack={back} onWorking={setEditorBusy} pending={busy} leading={<>{error && <Banner>{error}</Banner>}{selection.manual && selection.draft.protocol !== 'claude-cli' && directoryLoader}</>} details={sourceDetails} onSaved={async () => { await onSaved(); guard.saved(onClose) }} /> : <>
        <ScrollArea className="local-agent-scan-results" viewportProps={{ className: 'overscroll-contain' }} contentProps={{ className: 'local-agent-scan-content' }}>
          {error && <Banner>{error}</Banner>}
          {operation === 'scan' && !result && <p className="connection-model-message flex items-center gap-2" role="status"><LoaderCircle className="spinner" />正在扫描本地配置…</p>}
          {result && <>
            {(result.truncated || result.skippedFiles > 0) && <p className="connection-model-message" role="status">部分文件未能读取，可在手动添加中选择具体目录。</p>}
            {!candidates(result).length && <p className="connections-empty">还没找到本机 Agent，可以从下方手动添加。</p>}
          </>}
          <div className="connection-provider-options" aria-busy={operation === 'scan'}>
            {options(candidates(result))}
            <Button variant="surface" size="content" className="connection-provider-option" disabled={working} onClick={() => { setError(''); setSelection({ manual: true, draft: { name: '', executable: '', args: [], useExistingLogin: true } }) }}><span className="connection-provider-icon"><Plus className="connection-brand-icon size-[20px]" /></span><span><strong>手动添加</strong><small>填写启动命令，或从目录加载</small></span><ChevronRight /></Button>
          </div>
        </ScrollArea>
        <div className="connection-wizard-note"><RefreshCw size={14} /><span>没有找到你的 Agent？</span><Button variant="link" size="content" className="local-agent-rescan" disabled={working} onClick={scan}>{operation === 'scan' ? '正在扫描…' : '重新扫描'}</Button></div>
      </>}
    </ConnectionDialogLayout>
  </Dialog>
}
