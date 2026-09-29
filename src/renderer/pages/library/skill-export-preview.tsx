/*
 * [INPUT]: 宿主冻结的 ZIP 文件清单、导出错误、保存状态与返回/保存回调、共享 Card/ScrollFade。
 * [OUTPUT]: 导出向导第二步以全局 Card 皮肤展示无列表标记的真实文件目录与总量；移除导出说明，仅保留阻塞错误；页脚最左侧为带左箭头的 ghost 返回选择按钮、右侧总量与保存 ZIP，保存加载仅显示在按钮内；进入时聚焦标题，不创建额外弹窗或遮罩。
 * [POS]: library 的导出目录预览内容，Dialog/Popup 由选择向导统一持有；不猜测目录、不读取本机绝对路径、不执行包内代码。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { SkillLibraryExportPlan } from '@shared/domain/skills'
import { Banner, sizeText } from '@/components/common'
import { ArrowLeft, ChevronRight, FileText, FolderOpen, LoaderCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollFade } from '@/components/ui/scroll-fade'

type FileNode = { name: string; path: string; directory: boolean; size: number; children: Map<string, FileNode> }

function fileTree(files: SkillLibraryExportPlan['files']) {
  const root = new Map<string, FileNode>()
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let children = root
    for (const [index, name] of parts.entries()) {
      const directory = index < parts.length - 1 || file.kind === 'directory'
      let node = children.get(name)
      if (!node) {
        node = { name, path: parts.slice(0, index + 1).join('/'), directory, size: directory ? 0 : file.size, children: new Map() }
        children.set(name, node)
      }
      children = node.children
    }
  }
  return root
}

function FileTree({ nodes, depth = 0 }: { nodes: Map<string, FileNode>; depth?: number }) {
  const sorted = [...nodes.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  return <ul data-slot="skill-export-tree" className={`m-0 list-none ${depth ? 'ml-3 border-l border-border py-0 pr-0 pl-3' : 'p-0'}`}>{sorted.map(node => <li key={node.path}>
    {node.directory ? <details open={depth === 0} className="[&[open]>summary>.directory-chevron]:rotate-90">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted [&::-webkit-details-marker]:hidden"><ChevronRight className="directory-chevron size-3 shrink-0 transition-transform" /><FolderOpen className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate" title={node.path}>{node.name}</span></summary>
      <FileTree nodes={node.children} depth={depth + 1} />
    </details> : <div className="flex items-center gap-2 px-2 py-1.5 pl-7"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={node.path}>{node.name}</span><span className="shrink-0 text-xs text-muted-foreground">{sizeText(node.size)}</span></div>}
  </li>)}</ul>
}

export function SkillExportPreview({ plan, busy, error, onBack, onSave }: { plan: SkillLibraryExportPlan; busy: boolean; error: string; onBack: () => void; onSave: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  const tree = useMemo(() => fileTree(plan.files), [plan.files])
  const files = plan.files.filter(file => file.kind === 'file')
  const failures = plan.items.filter(item => item.error)
  return <>
    <DialogHeader><DialogTitle ref={title} tabIndex={-1}>预览导出</DialogTitle></DialogHeader>
    {error && <Banner>{error}</Banner>}
    {!!failures.length && <div className="max-h-32 shrink-0 overflow-y-auto">{failures.map(item => <Banner key={item.resourceId}>{item.name}：{item.error}</Banner>)}</div>}
    <Card className="min-h-0 flex-auto gap-0 p-0"><ScrollFade className="h-[420px] flex-auto p-2" aria-label="导出的文件目录"><FileTree nodes={tree} /></ScrollFade></Card>
    <DialogFooter variant="plain" className="shrink-0 flex-wrap items-center justify-start"><Button variant="ghost" disabled={busy} onClick={onBack}><ArrowLeft />返回选择</Button><span className="ml-auto text-xs text-muted-foreground">{files.length} 个文件 · {sizeText(files.reduce((sum, file) => sum + file.size, 0))}</span><Button className="relative" aria-label="保存 ZIP" aria-busy={busy} disabled={busy || !!failures.length} onClick={onSave}><span className={busy ? 'invisible' : undefined}>保存 ZIP</span>{busy && <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><LoaderCircle className="spinner" /></span>}</Button></DialogFooter>
  </>
}
