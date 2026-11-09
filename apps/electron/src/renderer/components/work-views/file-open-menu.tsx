/*
 * [INPUT]: 材料/成果/知识资料身份、页面可用状态与Main的固定系统应用清单。
 * [OUTPUT]: 两类文件行一级菜单仅显示无图标的打开方式；系统默认、应用及文件管理器定位均收进子菜单，原图标与核源保持。
 * [POS]: 会话文件/知识资料的外部打开菜单，不读取或拼接宿主文件路径。
 * [PROTOCOL]: 变化同步Header与work-views/.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ExternalFileOpenInput, ExternalFileTarget, WorkspaceApplication } from '@boai/shared/ipc/workspace-files'
import { errorText, showErrorToast } from '@/components/common'
import { FileText, FolderOpen, RefreshCw } from '@/components/icons'
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'

function ApplicationIcon({ application }: { application?: WorkspaceApplication }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [application?.iconDataUrl])
  if (application?.iconDataUrl && !failed) return <img src={application.iconDataUrl} alt="" className="size-4 shrink-0" onError={() => setFailed(true)} />
  return application?.kind === 'editor' ? <FileText /> : <FolderOpen />
}

export function FileOpenMenuItems({ api, target, disabled }: { api: DesktopApi; target?: ExternalFileTarget; disabled: boolean }) {
  const [applications, setApplications] = useState<WorkspaceApplication[]>([])
  const [opening, setOpening] = useState(false), [loading, setLoading] = useState(false)
  const alive = useRef(true), listing = useRef(false), flight = useRef(false)
  const identity = JSON.stringify(target), current = useRef({ identity, disabled }); current.current = { identity, disabled }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const available = () => alive.current && !current.current.disabled && current.current.identity === identity
  const load = async (refresh = false) => {
    if (!target || !available() || listing.current) return
    listing.current = true; setLoading(true)
    try { const value = await api.request('listWorkspaceApplications', { refresh }); if (available()) setApplications(value) }
    catch (error) { if (available()) showErrorToast(errorText(error)) }
    finally { listing.current = false; if (alive.current) setLoading(false) }
  }
  const open = async (options: Omit<ExternalFileOpenInput, 'target'> = {}) => {
    if (!target || !available() || flight.current) return
    flight.current = true; setOpening(true)
    try { await api.request('openFile', { target, ...options }) }
    catch (error) { showErrorToast(errorText(error)) }
    finally { flight.current = false; if (alive.current) setOpening(false) }
  }
  const locked = disabled || !target || opening
  const system = applications.find(application => application.kind === 'system')
  return <DropdownMenuSub onOpenChange={value => { if (value) void load() }}>
      <DropdownMenuSubTrigger disabled={locked}>打开方式</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44">
        <DropdownMenuItem disabled={locked} onClick={() => void open()}><ApplicationIcon application={system} />系统默认打开</DropdownMenuItem>
        <DropdownMenuItem disabled={locked} onClick={() => void open({ action: 'reveal' })}><ApplicationIcon application={system} />在文件管理器中显示</DropdownMenuItem>
        <DropdownMenuSeparator />
        {applications.filter(application => application.kind === 'editor').map(application => <DropdownMenuItem key={application.id} disabled={locked} onClick={() => void open({ applicationId: application.id })}><ApplicationIcon application={application} />{application.name}</DropdownMenuItem>)}
        {applications.some(application => application.kind === 'editor') && <DropdownMenuSeparator />}
        <DropdownMenuItem disabled={locked || loading} onClick={() => void load(true)}><RefreshCw />刷新打开方式</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
}
