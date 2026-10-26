/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: 剩余异步失败文案统一Sonner，原状态和操作保持。
 * [OUTPUT]: 错误反馈统一Sonner，不渲染内联报错；现有动作和来源校验保持。
 * [INPUT]: 本地/远程来源、扫描预览/当前操作 IPC、技能刷新/导出回调与共享 DropdownMenu/Popover。
 * [OUTPUT]: 单图标右侧菜单合并普通导入/技能库导入/扫描/检查更新/导出；技能库专属弹窗校验 BoAI ZIP/目录，所选项固定加入收藏并恢复分组；普通导入保留 400×420 浮层和当前结果，均固定 ~/.agents/skills，无安装记录入口。
 * [POS]: library 的统一技能操作菜单、本地导入内容与商城安装对话框。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { SkillScan, SkillOperation, ScanSkillSourceInput } from '@boai/shared/domain/skills'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Check, FolderOpen, LoaderCircle, MoreHorizontal, RefreshCw, Search } from '@/components/icons'
import { SkillPreview } from './skill-preview'

const statuses = { pending: '等待处理', installed: '已安装', updated: '已更新', exported: '已导出', reused: '已在本地', failed: '失败', skipped: '已跳过' }
const installPanelClassName = 'flex h-[420px] w-[400px] max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] flex-col gap-0 overflow-hidden rounded-xl p-0'
type ImportProps = { api: DesktopApi; initialSource?: ScanSkillSourceInput; operationId?: string; onClose: () => void; onInstalled: () => Promise<void>; onResource?: (id: string) => void }

export function SkillActionsMenu({ api, onInstalled, onResource, onLibraryInstalled, allowImport, onRescan, onCheckUpdates, onExport, scanning, canExport }: Pick<ImportProps, 'api' | 'onInstalled' | 'onResource'> & { onLibraryInstalled: () => Promise<void>; allowImport: boolean; onRescan: () => void; onCheckUpdates: () => void; onExport: () => void; scanning: boolean; canExport: boolean }) {
  const [panel, setPanel] = useState<'local' | 'github' | null>(null), [busy, setBusy] = useState(false)
  const [libraryImporting, setLibraryImporting] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const close = () => setPanel(null)
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button ref={anchor} variant="ghost" size="icon-sm" aria-label="技能操作" title="技能操作" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8} finalFocus={panel || libraryImporting ? false : undefined} className="w-[248px] p-2">
        {allowImport && <><DropdownMenuItem className="gap-2 px-2.5 py-2" onClick={() => setPanel('local')}><FolderOpen />导入文件夹、ZIP 或链接</DropdownMenuItem><DropdownMenuItem className="gap-2 px-2.5 py-2" onClick={() => setPanel('github')}><i className="app-icon i-carbon-branch" aria-hidden="true" />从 Git 仓库导入</DropdownMenuItem><DropdownMenuSeparator className="my-1.5" /></>}
        <DropdownMenuItem className="gap-2 px-2.5 py-2" disabled={scanning} onClick={onRescan}><RefreshCw />重新扫描技能</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-2.5 py-2" onClick={onCheckUpdates}><i className="app-icon i-carbon-update-now" aria-hidden="true" />检查技能更新</DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem className="gap-2 px-2.5 py-2" onClick={() => setLibraryImporting(true)}><i className="app-icon i-carbon-import-export" aria-hidden="true" />导入技能库</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-2.5 py-2" disabled={!canExport} onClick={onExport}><i className="app-icon i-carbon-export" aria-hidden="true" />导出技能库</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Popover open={panel !== null} onOpenChange={value => { if (!value && !busy) close() }}>
      <PopoverContent anchor={anchor} side="right" align="start" sideOffset={8} finalFocus={anchor} className={`skill-install-popover ${installPanelClassName}`} aria-label="导入技能">
        {panel && <SkillImportContent api={api} variant={panel} onClose={close} onInstalled={onInstalled} onResource={onResource} onBusyChange={setBusy} />}
      </PopoverContent>
    </Popover>
    {libraryImporting && <SkillLibraryImportDialog api={api} onClose={() => setLibraryImporting(false)} onInstalled={onLibraryInstalled} onResource={onResource} />}
  </>
}

function SkillLibraryImportDialog(props: ImportProps) {
  const [busy, setBusy] = useState(false)
  return <Dialog open onOpenChange={open => { if (!open && !busy) props.onClose() }}><DialogContent className="flex h-[560px] max-h-[calc(100dvh-48px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]" showCloseButton={!busy} aria-describedby={undefined}>
    <DialogHeader className="shrink-0 px-4 pt-4 pb-2"><DialogTitle>导入技能库</DialogTitle></DialogHeader>
    <SkillImportContent {...props} variant="library" onBusyChange={setBusy} />
  </DialogContent></Dialog>
}

export function SkillImportDialog(props: ImportProps) {
  return <Dialog open onOpenChange={open => { if (!open) props.onClose() }}><DialogContent className={`skill-install-dialog ${installPanelClassName} sm:max-w-[calc(100vw-24px)]`} showCloseButton={false}>
    <DialogHeader className="sr-only"><DialogTitle>导入技能</DialogTitle><DialogDescription>选择技能并安装到本地 ~/.agents/skills</DialogDescription></DialogHeader>
    <SkillImportContent {...props} variant={props.initialSource?.kind === 'github' ? 'github' : 'local'} />
  </DialogContent></Dialog>
}

function SkillImportContent({ api, initialSource, operationId, onClose, onInstalled, onResource, variant, onBusyChange }: ImportProps & { variant: 'local' | 'github' | 'library'; onBusyChange?: (busy: boolean) => void }) {
  const libraryImport = variant === 'library'
  const [recordId, setRecordId] = useState(operationId)
  const [scan, setScan] = useState<SkillScan | null>(null)
  const [kind, setKind] = useState<NonNullable<ScanSkillSourceInput['kind']>>(initialSource?.kind ?? (variant === 'github' ? 'github' : libraryImport ? 'zip' : 'folder')), [source, setSource] = useState(initialSource?.source ?? '')
  const [ref, setRef] = useState(''), [subpath, setSubpath] = useState(''), [previewId, setPreviewId] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [favorite, setFavorite] = useState(false), [restoreCollections, setRestoreCollections] = useState(true)
  const [preparing, setPreparing] = useState(false), [operation, setOperation] = useState<SkillOperation | null>(null), [pollError, setPollError] = useState('')
  const requestRef = useRef(''), scanRef = useRef(''), alive = useRef(true), sourceInput = useRef<HTMLInputElement>(null)
  const mutation = useMutation(), installing = operation?.status === 'running', busy = mutation.busy || installing
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  useEffect(() => { if (kind === 'url' || kind === 'github') sourceInput.current?.focus() }, [kind])
  useEffect(() => { alive.current = true; return () => {
    alive.current = false
    if (requestRef.current) void api.request('cancelSkillScan', { id: requestRef.current }).catch(() => {})
    if (scanRef.current) void api.request('discardSkillScan', { id: scanRef.current }).catch(() => {})
  } }, [api])
  useEffect(() => {
    if (!recordId) return
    let current = true
    setOperation(null); setPollError('')
    api.request('getSkillOperation', { id: recordId }).then(value => { if (current) setOperation(value) }, error => { if (current) setPollError(errorText(error)) })
    return () => { current = false }
  }, [api, recordId])
  useEffect(() => {
    if (operation?.status !== 'running') return
    let current = true, inFlight = false
    const poll = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const result = await api.request('getSkillOperation', { id: operation.id })
        if (current) { setOperation(result); setPollError(''); if (result.status !== 'running' && result.kind !== 'library-export') await onInstalled() }
      } catch (error) { if (current) setPollError(errorText(error)) }
      finally { inFlight = false }
    }
    const timer = setInterval(() => { void poll() }, 500)
    return () => { current = false; clearInterval(timer) }
  }, [api, operation?.id, operation?.status, onInstalled])
  const clearPreview = () => {
    if (scanRef.current) void api.request('discardSkillScan', { id: scanRef.current }).catch(error => setPollError(errorText(error)))
    scanRef.current = ''; setScan(null); setSelected([]); setPreviewId(''); setOperation(null); setPollError('')
  }
  const selectSource = (dropped?: File) => mutation.run(async () => {
    let selectedSource = source.trim()
    if (kind === 'folder' || kind === 'zip') {
      if (dropped) {
        if (!api.selectSkillFile) throw new Error('拖入文件需要更新后的桌面进程，请完整重启应用')
        selectedSource = await api.selectSkillFile(dropped, kind)
      } else selectedSource = await api.request('chooseSkillSource', { kind }) ?? ''
    }
    if (!selectedSource || !alive.current) return
    clearPreview(); setSource(selectedSource)
    const requestId = crypto.randomUUID(); requestRef.current = requestId; setPreparing(true)
    try {
      const result = await api.request('scanSkillSource', { source: selectedSource, kind, target: 'local', requestId, ...(kind === 'marketplace' ? { provider: initialSource?.provider } : {}), ...(kind === 'github' ? { ...(ref.trim() ? { ref: ref.trim() } : {}), ...(subpath.trim() ? { subpath: subpath.trim() } : {}) } : {}) })
      if (!alive.current) { await api.request('discardSkillScan', { id: result.id }); return }
      if (result.target !== 'local') { await api.request('discardSkillScan', { id: result.id }); throw new Error('当前后台尚未支持安装到本地，请完整退出并重启应用') }
      if (libraryImport && !result.library) { await api.request('discardSkillScan', { id: result.id }); throw new Error('请选择 BoAI 导出的技能库 ZIP，或包含 boai.json 的技能库目录') }
      scanRef.current = result.id; setScan(result); setSelected(result.candidates.filter(candidate => !candidate.error && !candidate.conflict).map(candidate => candidate.id))
    } catch (error) {
      if (/unrecognized_keys/.test(errorText(error))) throw new Error('本地技能安装需要新版后台，请完整退出并重启应用；开发模式请重新运行 pnpm dev')
      throw error
    } finally { requestRef.current = ''; if (alive.current) setPreparing(false) }
  })
  const install = () => mutation.run(async () => {
    if (scan?.target !== 'local') return
    const result = await api.request('installSkills', { requestId: crypto.randomUUID(), scanId: scan.id, candidateIds: selected, addToFavorites: libraryImport || favorite, restoreCollections: !!scan.library && (libraryImport || restoreCollections) })
    if (alive.current) { setOperation(result); if (result.status !== 'running' && result.kind !== 'library-export') await onInstalled() }
  })
  const selectable = scan?.candidates.filter(candidate => !candidate.error && !candidate.conflict).map(candidate => candidate.id) ?? []
  const allSelected = selectable.length > 0 && selectable.every(id => selected.includes(id))
  const urlMode = kind === 'url' || kind === 'github' || kind === 'marketplace'
  const showSource = !recordId && !operation
  return <div className="skill-install-content">
    {!recordId && !initialSource && variant !== 'github' && <Tabs className="skill-install-source-tabs" value={kind} onValueChange={value => { clearPreview(); setKind(value as typeof kind); setSource('') }}><TabsList className={`grid w-full max-w-none ${libraryImport ? 'grid-cols-2' : 'grid-cols-3'}`} aria-label="导入来源"><TabsTrigger value="folder" disabled={busy}><FolderOpen />文件夹</TabsTrigger><TabsTrigger value="zip" disabled={busy}><i className="app-icon i-carbon-zip" aria-hidden="true" />ZIP</TabsTrigger>{!libraryImport && <TabsTrigger value="url" disabled={busy}><i className="app-icon i-carbon-link" aria-hidden="true" />链接</TabsTrigger>}</TabsList></Tabs>}
    <div className="skill-install-body">
      {(mutation.error || pollError) && <Banner>{mutation.error || pollError}</Banner>}
      {recordId && !operation && !pollError && <Loading />}
      {showSource && <>
        {urlMode ? <div className="skill-install-source">
          <label htmlFor="skill-install-source">{kind === 'github' ? 'GitHub 仓库地址' : kind === 'marketplace' ? '商城技能' : '链接'}</label>
          <div className="skill-install-source-row">
            <Input className="text-[length:var(--text-ui-body)]" id="skill-install-source" ref={sourceInput} value={source} readOnly={kind === 'marketplace'} disabled={busy} onChange={event => { setSource(event.target.value); clearPreview() }} onKeyDown={event => { if (event.key === 'Enter' && source.trim() && !busy) void selectSource() }} placeholder={kind === 'github' ? 'https://github.com/user/repo' : 'https://…/skills.zip'} />
            <Button size="sm" className="h-(--control-height)" variant="secondary" disabled={!source.trim() || busy} onClick={() => { void selectSource() }}>{preparing ? <LoaderCircle className="animate-spin" /> : <Search />}扫描</Button>
          </div>
          {kind === 'github' && <details className="skill-install-git-options">
            <summary><i className="app-icon i-carbon-chevron-right" aria-hidden="true" />分支与子目录（可选）</summary>
            <Input className="text-[length:var(--text-ui-body)]" aria-label="分支或 commit" placeholder="默认分支" value={ref} disabled={busy} onChange={event => { setRef(event.target.value); clearPreview() }} />
            <Input className="text-[length:var(--text-ui-body)]" aria-label="仓库内子目录" placeholder="skills/example" value={subpath} disabled={busy} onChange={event => { setSubpath(event.target.value); clearPreview() }} />
          </details>}
        </div> : <div className={`skill-install-picker${scan ? ' has-scan' : ''}`}><Button variant="ghost" size="content" className="skill-install-dropzone" disabled={busy} onClick={() => { void selectSource() }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy' }} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (!busy && file) void selectSource(file) }}>{preparing ? <LoaderCircle className="size-[24px] animate-spin" /> : kind === 'folder' ? <FolderOpen className="size-[24px]" /> : <i className="app-icon i-carbon-zip size-[24px]" aria-hidden="true" />}<span>{source || (libraryImport ? kind === 'folder' ? '选择或拖入包含 boai.json 的技能库目录' : '选择或拖入 BoAI 技能库 ZIP' : kind === 'folder' ? '点击或将 skill 文件夹拖拽到此处' : '点击或将 ZIP 文件拖拽到此处')}</span></Button></div>}
        {urlMode && !scan && <div className="skill-install-empty"><div className="skill-install-empty-icon"><Search size={20} /></div><strong>可安装的技能</strong><p>输入来源并扫描，选择要安装的技能。</p></div>}
        {scan?.warnings?.map(warning => <Banner kind="notice" key={warning}>{warning}</Banner>)}
        {scan && <div className="skill-install-candidates"><div className="skill-install-candidate-heading"><span>{scan.library ? `${scan.library.name} · ` : '发现 '}{scan.candidates.length} 个技能</span><Button variant="ghost" size="sm" disabled={busy || !selectable.length} onClick={() => setSelected(allSelected ? [] : selectable)}>{allSelected ? '取消全选' : '全选'}</Button></div><div className="skill-install-candidate-list" aria-label="技能导入预览">{scan.candidates.map(candidate => <div key={candidate.id} className="skill-install-candidate"><label><Checkbox aria-label={`选择 ${candidate.name}`} disabled={!!candidate.error || !!candidate.conflict || busy} checked={selected.includes(candidate.id)} onCheckedChange={checked => setSelected(values => checked ? [...values, candidate.id] : values.filter(id => id !== candidate.id))} /><span className="skill-install-candidate-copy"><strong>{candidate.name}</strong>{!libraryImport && <small>{candidate.description}</small>}{candidate.existingResourceId && <small>已在本地</small>}{(candidate.error || candidate.conflict) && <Banner>{candidate.error || candidate.conflict}</Banner>}</span></label>{!candidate.error && <Button variant="ghost" size="sm" onClick={() => setPreviewId(previewId === candidate.id ? '' : candidate.id)}>{previewId === candidate.id ? '收起内容' : '查看内容'}</Button>}{previewId === candidate.id && <SkillPreview api={api} scanId={scan.id} candidateId={candidate.id} />}</div>)}</div></div>}
      </>}
      {operation && <div className="skill-install-result" aria-live="polite"><h4>{operation.kind === 'library-export' ? '导出结果' : installing ? '正在安装' : operation.status === 'completed' ? '安装结果' : '安装已停止'}</h4>{operation.outputName && <p>{operation.outputName}</p>}{operation.items.map(item => <div className="skill-operation-row" key={item.candidateId}><strong>{item.name}</strong><span>{item.status === 'pending' && installing ? <LoaderCircle className="animate-spin" /> : item.status === 'installed' || item.status === 'reused' ? <Check /> : null}{statuses[item.status]}</span>{item.error && <Banner>{item.error}</Banner>}{item.resourceId && onResource && <Button variant="ghost" size="sm" onClick={() => { onResource(item.resourceId!); onClose() }}>查看技能</Button>}</div>)}</div>}
    </div>
    <footer className="skill-install-footer">
      {scan && !operation && !libraryImport && <div className="skill-install-options"><label><Checkbox checked={favorite} disabled={busy} onCheckedChange={value => setFavorite(Boolean(value))} />同时加入收藏</label>{scan.library && <label><Checkbox checked={restoreCollections} disabled={busy} onCheckedChange={value => setRestoreCollections(Boolean(value))} />恢复包内收藏与分组</label>}</div>}
      {!recordId && <small>{libraryImport ? '安装到 ~/.agents/skills，加入收藏并恢复分组' : '安装到 ~/.agents/skills'}</small>}
      {(preparing || installing || scan || operation || recordId) && <div className="skill-install-footer-actions">{!busy && (recordId || operation) && <Button variant="ghost" size="sm" onClick={() => { setRecordId(undefined); clearPreview() }}>返回导入</Button>}<span />{preparing && <Button variant="secondary" size="sm" onClick={() => { void api.request('cancelSkillScan', { id: requestRef.current }).catch(error => setPollError(errorText(error))) }}>取消扫描</Button>}{installing && <Button variant="secondary" size="sm" onClick={() => { void mutation.run(() => api.request('cancelSkillOperation', { id: operation!.id })) }}>停止安装</Button>}{showSource && scan && <Button size="sm" disabled={busy || !selected.length} onClick={() => { void install() }}>{libraryImport ? '导入收藏' : '安装所选'} · {selected.length}</Button>}</div>}
    </footer>
  </div>
}
