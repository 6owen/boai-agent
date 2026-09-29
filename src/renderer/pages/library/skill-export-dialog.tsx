/*
 * [INPUT]: 已发现的本机技能和已安装技能、收藏选择、来源列表和受控的导出预览/保存 IPC。
 * [OUTPUT]: 收藏默认全选、单个实时过滤框与页脚计数；首步仅“预览/导出”操作，直接导出共用冻结准备与原生保存，加载仅显示在当前操作按钮内，无独立状态提示或底部关闭按钮；同一 Dialog/Popup 两步切换与 520/620px 宽度，预览可返回或保存；空选择/冲突不导出，旧后台缺失文件清单时提示重启。
 * [POS]: library 的便携库导出对话框；不接收或传送任意保存路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { SkillLibraryExportPlan } from '@shared/domain/skills'
import { Banner, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { LoaderCircle, Search } from '@/components/icons'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSkillInstallations } from './use-skill-installations'
import { SkillExportPreview } from './skill-export-preview'

export type ExportSkillItem = { id: string; name: string; description: string; ownerAgentId?: string; sourceLabel?: string }

export function SkillExportDialog({ api, resources, favoriteIds, onClose, onOperation }: { api: DesktopApi; resources: ExportSkillItem[]; favoriteIds: string[]; onClose: () => void; onOperation: (id: string) => void }) {
  const [excluded, setExcluded] = useState<string[]>([])
  const favorites = resources.filter(value => favoriteIds.includes(value.id))
  const selected = favorites.filter(value => !excluded.includes(value.id)).map(value => value.id)
  const [plan, setPlan] = useState<SkillLibraryExportPlan | null>(null), [cleanupError, setCleanupError] = useState('')
  const planMatchesSelection = !!plan && plan.items.length === selected.length && plan.items.every(item => selected.includes(item.resourceId))
  const [query, setQuery] = useState(''), searchInput = useRef<HTMLInputElement>(null)
  const [previewing, setPreviewing] = useState(false)
  const [action, setAction] = useState<'preview' | 'export'>('preview')
  const showingPreview = previewing && planMatchesSelection && !!plan
  const planId = useRef(''), preparing = useRef(false), alive = useRef(true), requestId = useRef('')
  const mutation = useMutation(), sources = useSkillInstallations(api)
  const previewBusy = mutation.busy && action === 'preview', exportBusy = mutation.busy && action === 'export'
  const originFor = (resource: ExportSkillItem) => {
    const source = sources.installations.find(value => value.resourceId === resource.id)?.source
    return source?.kind === 'git' ? source.repository : source?.kind === 'marketplace' ? `${source.provider} · ${source.providerItemId}` : source?.kind === 'url' ? source.url : resource.sourceLabel ?? '本地内容'
  }
  const visible = favorites.filter(resource => `${resource.name} ${originFor(resource)}`.toLowerCase().includes(query.trim().toLowerCase()))
  useEffect(() => { alive.current = true; return () => {
    alive.current = false
    if (preparing.current) void api.request('cancelSkillLibraryPreview', undefined).catch(() => {})
    if (planId.current) void api.request('discardSkillLibraryExport', { id: planId.current }).catch(() => {})
  } }, [api])
  const clear = () => {
    if (planId.current) void api.request('discardSkillLibraryExport', { id: planId.current }).catch(error => setCleanupError(String(error)))
    planId.current = ''; requestId.current = ''; setPlan(null); setPreviewing(false)
  }
  const prepare = async () => {
    clear(); preparing.current = true
    try {
      const value = await api.request('planSkillLibraryExport', { resourceIds: selected, name: '我的技能库' })
      if (!alive.current) { await api.request('discardSkillLibraryExport', { id: value.id }); return }
      if (!Array.isArray(value.files)) { await api.request('discardSkillLibraryExport', { id: value.id }); throw new Error('文件目录预览需要新版后台，请完整退出并重启应用') }
      planId.current = value.id; requestId.current = crypto.randomUUID(); setPlan(value)
      return value
    } finally { preparing.current = false }
  }
  const savePlan = async (value: SkillLibraryExportPlan) => {
    const failures = value.items.filter(item => item.error)
    if (failures.length) throw new Error(failures.map(item => `${item.name}：${item.error}`).join('；'))
    const operation = await api.request('exportSkillLibrary', { planId: value.id, requestId: requestId.current })
    if (operation) { planId.current = ''; if (alive.current) onOperation(operation.id) }
  }
  const preview = () => mutation.run(async () => {
    if (!selected.length) return
    setAction('preview')
    if (await prepare()) setPreviewing(true)
  })
  const exportDirectly = () => mutation.run(async () => {
    if (!selected.length) return
    setAction('export')
    const value = await prepare()
    if (value) await savePlan(value)
  })
  const save = () => mutation.run(async () => {
    if (!plan || !planMatchesSelection || !selected.length) return
    setAction('export')
    await savePlan(plan)
  })
  return <Dialog open onOpenChange={open => { if (!open && !mutation.busy) onClose() }}><DialogContent className="flex max-h-[calc(100dvh-48px)] flex-col gap-3 overflow-hidden" style={{ width: showingPreview ? 620 : 520, maxWidth: 'calc(100vw - 32px)' }} showCloseButton={!mutation.busy} aria-describedby={undefined}>
    {showingPreview && plan ? <SkillExportPreview plan={plan} busy={mutation.busy} error={mutation.error} onBack={() => setPreviewing(false)} onSave={() => { void save() }} /> : <>
    <DialogHeader><DialogTitle>导出技能库</DialogTitle></DialogHeader>
    {(mutation.error || sources.error || cleanupError) && <Banner>{mutation.error || sources.error || cleanupError}</Banner>}
    <div className="flex items-center gap-2"><Input ref={searchInput} autoFocus aria-label="筛选收藏技能" placeholder="搜索技能名称或来源" value={query} onChange={event => setQuery(event.target.value)} /><Button variant="secondary" size="icon" aria-label="检索技能" onClick={() => searchInput.current?.focus()}><Search /></Button></div>
    <ScrollFade className="skill-export-list soft-divide-y" aria-label="可导出的收藏技能">{visible.map(resource => {
      const origin = originFor(resource)
      return <label key={resource.id} className="skill-export-row"><Checkbox aria-label={`导出 ${resource.name} ${resource.id.slice(0, 8)}`} disabled={mutation.busy} checked={selected.includes(resource.id)} onCheckedChange={checked => { setExcluded(values => checked ? values.filter(value => value !== resource.id) : [...values, resource.id]); clear() }} /><span className="skill-export-copy"><strong>{resource.name}</strong><small title={origin}>{origin}</small></span></label>
    })}{!visible.length && <p className="py-8 text-center text-muted-foreground">{favorites.length ? '没有匹配的收藏技能' : '暂无收藏的技能'}</p>}</ScrollFade>
    <DialogFooter variant="plain" className="shrink-0 flex-wrap items-center">
      <span className="mr-auto text-xs whitespace-nowrap text-muted-foreground">已选 {selected.length} / {favorites.length}</span>
      <div className="ml-auto flex items-center gap-3">
        <Button variant="secondary" className="relative" aria-label="预览" aria-busy={previewBusy} disabled={mutation.busy || !selected.length} onClick={() => { void preview() }}><span className={previewBusy ? 'invisible' : undefined}>预览</span>{previewBusy && <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><LoaderCircle className="spinner" /></span>}</Button>
        <Button className="relative" aria-label="导出" aria-busy={exportBusy} disabled={mutation.busy || !selected.length} onClick={() => { void exportDirectly() }}><span className={exportBusy ? 'invisible' : undefined}>导出</span>{exportBusy && <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><LoaderCircle className="spinner" /></span>}</Button>
      </div>
    </DialogFooter>
    </>}
  </DialogContent></Dialog>
}
