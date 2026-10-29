/*
 * [OUTPUT]: 2026-10-29 官方文件浏览器填满右侧面板，内部左预览右树；目录范围保持。
 * [INPUT]: Employee workspace or exact saved directory grants and official plugin availability.
 * [OUTPUT]: File tree and existing inline previews in the shared right panel; scoped read/open only.
 * [POS]: BOAI host for @boai/file-explorer-plugin; delivered conversation files remain separate.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useState } from 'react'
import { FileExplorer } from '@boai/file-explorer-plugin/explorer'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DigitalAgent } from '@boai/shared/domain'
import type { FileExplorerScope, WorkspaceApplication, WorkspaceFilePreview } from '@boai/shared/ipc/workspace-files'
import { FILE_EXPLORER_PLUGIN_ID } from '@boai/shared/plugins/catalog'
import { FilePreview } from '@/components/common/file-preview'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { pluginUsage, useFileExplorerEnabled } from '@/stores/plugins'
import { toast } from 'sonner'

export function WorkspaceFiles({ api, active, agent, conversationId, location, onHome }: {
  api: DesktopApi; active: boolean; agent: DigitalAgent; conversationId?: string; location: 'workspace' | 'authorized'; onHome?(): void
}) {
  const enabled = useFileExplorerEnabled()
  const grants = agent.directoryGrants ?? []
  const [selected, setSelected] = useState(grants[0]?.path ?? '')
  const directory = grants.some(grant => grant.path === selected) ? selected : grants[0]?.path
  const [applications, setApplications] = useState<WorkspaceApplication[]>([])
  useEffect(() => {
    if (!active || !enabled) return
    let cancelled = false
    const release = pluginUsage.acquire(FILE_EXPLORER_PLUGIN_ID)
    void api.request('listWorkspaceApplications', {}).then(value => { if (!cancelled) setApplications(value) }).catch(error => { if (!cancelled) toast.error(String(error)) })
    return () => { cancelled = true; release() }
  }, [api, active, enabled])
  if (!enabled) return null
  if (location === 'authorized' && !directory) return null
  const scope: FileExplorerScope = { employeeId: agent.id, ...(conversationId ? { conversationId } : {}), ...(location === 'authorized' ? { directory } : {}) }
  const open = async (path: string, action: 'open' | 'reveal' = 'open', applicationId?: string) => {
    try { await api.request('openWorkspacePath', { scope, relativePath: path, action, applicationId }) }
    catch (error) { toast.error(String(error)) }
  }
  const actions = (path: string, rootPath?: string) => <>
    <Button variant="ghost" size="icon-sm" aria-label="复制文件路径" disabled={!rootPath} onClick={() => {
      const fullPath = rootPath!.replace(/[\\/]$/, '') + (path ? '/' + path : '')
      void (api.writeClipboardText ? api.writeClipboardText(fullPath) : Promise.reject(new Error('当前宿主不支持复制'))).then(() => toast.success('已复制路径')).catch(error => toast.error(String(error)))
    }}><span className="i-solar-copy-linear size-4" /></Button>
    <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="secondary" size="sm" aria-label="文件外部打开方式" />}>打开<span className="i-solar-alt-arrow-down-linear size-4" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => void open(path)}>系统默认打开</DropdownMenuItem>
      <DropdownMenuItem onClick={() => void open(path, 'reveal')}>在文件管理器中显示</DropdownMenuItem>
      {applications.filter(item => item.kind !== 'system').map(item => <DropdownMenuItem key={item.id} onClick={() => void open(path, 'open', item.id)}>{item.name}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu></>
  const preview = (path: string, content: WorkspaceFilePreview) => {
    const name = path.split('/').pop()!
    return <FilePreview key={path} name={name} active={active} {...('text' in content ? { file: content } : content.kind === 'image' ? { image: { url: content.url } } : { binary: content })} />
  }
  return <div className="workspace-files flex h-full min-h-0 min-w-0 flex-col">
    {(onHome || location === 'authorized') && <div className="flex min-w-0 items-center gap-2 p-2">
      {onHome && <Button variant="ghost" size="icon-sm" aria-label="返回开始" onClick={onHome}><span className="i-solar-home-2-linear size-4" /></Button>}
      {location === 'authorized' && <SelectField className="min-w-0 flex-1" aria-label="授权目录" value={directory} options={grants.map(grant => ({ value: grant.path, label: `${grant.path.split(/[\\/]/).filter(Boolean).pop()} · ${grant.path}` }))} onValueChange={setSelected} />}
    </div>}
    <FileExplorer key={`${JSON.stringify(scope)}:${agent.directoryRevision ?? 0}`} active={active} label={location === 'workspace' ? '员工工作区' : '授权目录文件'} revision={agent.configVersion}
      list={(relativePath, cursor) => api.request('listWorkspaceFiles', { scope, relativePath, cursor })}
      preview={relativePath => api.request('previewWorkspaceFile', { scope, relativePath })}
      onError={error => toast.error(String(error))} renderPreview={preview} toolbar={actions} />
  </div>
}
