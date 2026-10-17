/*
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [OUTPUT]: 当前员工的Magpie三协议目录沿保存版本读取，模型展示名与推理原值来自结构化目录。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 当前员工、原连接快照、原生目录和已提交配置保存回调。
 * [OUTPUT]: 当前连接内模型与推理菜单；保留目录/顺序且无顶部或读取提示，保存不插入锁定说明；管理入口在关闭动画完成后跳转通讯录。
 * [POS]: Composer轻量模型菜单；交互参考Craft ComposerModelMenu（22c9f041），使用BOAI组件。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { ErrorToast } from '@/components/common/error-feedback'
import { useEffect, useRef, useState } from 'react'
import type { AgentRun, DigitalAgent, LaunchProfile, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { sameBackendBinding } from '@shared/domain/backends'
import { errorText } from '@/components/common'
import { ChevronDownIcon, RefreshCw, Settings } from '@/components/icons'
import { ChatComposerSelect } from '@/components/ui/chat-composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { composerEffortPatch, composerEfforts, composerModelPatch, effortNames, type ComposerModel, type ComposerModelPatch } from '../composer-model-state'
import type { ComposerAgentSaveResult } from './composer-toolbar'

export function ComposerModelMenu({ api, agent, snapshot, locked, runs, onSave, onConfigure }: {
  api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; locked: boolean; runs?: AgentRun[]
  onSave(agent: DigitalAgent, patch: ComposerModelPatch): Promise<ComposerAgentSaveResult>; onConfigure(agent: DigitalAgent): void
}) {
  const [open, setOpen] = useState(false), [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [catalog, setCatalog] = useState<{ source: string; revision: number; models: ComposerModel[] }>(), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [unknown, setUnknown] = useState(false), [revision, setRevision] = useState(0)
  const [committed, setCommitted] = useState(agent)
  const flight = useRef(false), alive = useRef(true)
  const trigger = useRef<HTMLButtonElement>(null), pendingConfigure = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setCommitted(agent) }, [agent])
  useEffect(() => { setUnknown(false); setError('') }, [agent.id, agent.configVersion])
  const backend = committed.executionBackend, native = backend && backend.kind !== 'mastra-model'
  const profileId = native ? backend.profileId : ''
  const connection = snapshot.connections.find(item => item.id === committed.connectionId)
  const profile = profiles.find(item => item.id === profileId)
  const nativeInfo = runs?.filter(run => run.agentId === committed.id && sameBackendBinding(run.backend, backend) && run.backend?.profileRevision === profile?.revision && run.bootstrap?.configVersion === committed.configVersion).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find(run => run.backend?.nativeInfo)?.backend?.nativeInfo
  const source = JSON.stringify([agent.id, backend, connection, profile?.revision, profile?.verified?.checkedAt])
  useEffect(() => {
    if (!open || !native) return
    let current = true
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) setProfiles(value) }, failure => { if (current) setError(errorText(failure)) })
    return () => { current = false }
  }, [api, open, native, profileId])
  useEffect(() => {
    if (!open || (catalog?.source === source && catalog.revision === revision)) return
    let current = true
    if (!unknown) setError('')
    const request = backend?.kind === 'codex-local' && !committed.connectionId && profile?.verified
      ? api.request('getLaunchProfileModelCatalog', { id: profile.id })
      : connection?.gateway
        ? api.request('getConnectionModelCatalog', { id: connection.id, baseUrl: connection.baseUrl, gateway: connection.gateway, expectedRevision: connection.revision }).then(value => value.models.map(model => ({ value: model.id, displayName: model.name, supportedEffortLevels: model.reasoningLevels })))
      : (!native || backend?.kind === 'claude-local') && connection && (connection.provider === 'openai-compatible' || connection.gateway)
        ? api.request('listConnectionModels', { id: connection.id, baseUrl: connection.baseUrl, ...(connection.gateway ? { gateway: connection.gateway, expectedRevision: connection.revision } : {}) }).then(models => models.map(value => ({ value })))
        : undefined
    if (!request) { setLoading(false); return }
    setLoading(true)
    void request.then(value => { if (current) { setCatalog({ source, revision, models: value }); setLoading(false) } }, failure => { if (current) { setError(errorText(failure)); setLoading(false) } })
    return () => { current = false }
  }, [api, open, source, revision])
  const effective = committed.modelId || connection?.defaultModel || ''
  const modelMap = new Map<string, ComposerModel>()
  for (const model of [...(!connection?.gateway ? nativeInfo?.models ?? [] : []), ...(catalog?.source === source ? catalog.models : [])]) modelMap.set(model.value, { ...modelMap.get(model.value), ...model })
  if (effective && !modelMap.has(effective)) modelMap.set(effective, { value: effective })
  const models = [...modelMap.values()]
  const options = native ? [{ value: '', displayName: connection?.gateway ? '使用网关连接默认模型' : '使用本机 Agent 默认模型' }, ...models] : models
  const canRefresh = connection?.gateway ? true : backend?.kind === 'codex-local' ? !committed.connectionId && Boolean(profile?.verified) : (!native || backend?.kind === 'claude-local') && connection?.provider === 'openai-compatible'
  const efforts = composerEfforts(committed, connection, models)
  const effort = native ? committed.nativeOptions?.effort ?? '' : committed.thinkingLevel ?? 'auto'
  const unavailable = native ? !profile?.verified || !!committed.connectionId && !connection : !connection
  const disabled = locked || saving || unknown || unavailable
  const save = async (patch: ComposerModelPatch) => {
    if (disabled || flight.current) return
    flight.current = true; setSaving(true); setError('')
    try {
      const result = await onSave(committed, patch)
      if (!alive.current) return
      if (result.status === 'saved') { setCommitted(result.agent); setOpen(false) }
      else if (result.status === 'not-submitted') setError('当前无法保存，请等待进行中的操作结束。')
      else { setUnknown(true); setError('保存结果尚未确认，请在员工设置中核对当前配置。') }
    } catch (failure) { if (alive.current) { setUnknown(true); setError(`保存结果尚未确认：${errorText(failure)}`) } }
    finally { flight.current = false; if (alive.current) setSaving(false) }
  }
  return <DropdownMenu open={open} onOpenChange={value => { if (!saving) { if (value) pendingConfigure.current = false; setOpen(value) } }} onOpenChangeComplete={value => {
    if (value || !pendingConfigure.current) return
    pendingConfigure.current = false
    if (!trigger.current?.getClientRects().length) return
    trigger.current.focus({ preventScroll: true }); onConfigure(committed)
  }}>
    <DropdownMenuTrigger render={<ChatComposerSelect ref={trigger} kind="model" aria-label="选择模型" title={effective || '本机默认模型'} />}><span>{effective || (native ? '本机默认模型' : '选择模型')}</span><ChevronDownIcon /></DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="end" sideOffset={8} className="chat-composer-menu w-[280px] max-w-[calc(100vw-32px)]" aria-label="选择模型">
      <DropdownMenuGroup>
        <DropdownMenuRadioGroup value={native ? committed.modelId : effective} onValueChange={value => { const model = options.find(item => item.value === value); if (model && value !== (native ? committed.modelId : effective)) void save(composerModelPatch(committed, model)) }} className="max-h-64 overflow-y-auto">
          {options.map(model => <DropdownMenuRadioItem key={model.value} value={model.value} disabled={disabled} closeOnClick={false}><span className="min-w-0 truncate" title={model.displayName ?? model.value}>{model.displayName ?? model.value}</span></DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      {!loading && !models.length && <p className="px-3 py-2 text-xs text-muted-foreground">尚无可用模型目录，可在员工设置中填写模型。</p>}
      {efforts.length > 0 && <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger disabled={disabled}><span className="flex-1">推理强度</span><span className="text-muted-foreground">{effortNames[effort] ?? (effort || '默认')}</span></DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40" aria-label="推理强度"><DropdownMenuRadioGroup value={effort} onValueChange={value => { if (efforts.includes(value) && value !== effort) void save(composerEffortPatch(committed, value)) }}>{efforts.map(value => <DropdownMenuRadioItem key={value} value={value} closeOnClick={false}>{effortNames[value] ?? (value || '默认')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent>
      </DropdownMenuSub></>}
      <DropdownMenuSeparator />
      <DropdownMenuItem closeOnClick={false} disabled={!canRefresh || loading || saving} onClick={() => setRevision(value => value + 1)}><RefreshCw />刷新模型</DropdownMenuItem>
      <DropdownMenuItem disabled={saving} onClick={() => { pendingConfigure.current = true; setOpen(false) }}><Settings />{unknown ? '核对员工配置' : '管理模型'}</DropdownMenuItem>
      {locked && !saving && <p className="px-3 py-2 text-xs text-muted-foreground">员工正在执行或有未保存配置，暂不可修改。</p>}
      {error && <ErrorToast>{error}</ErrorToast>}
    </DropdownMenuContent>
  </DropdownMenu>
}
