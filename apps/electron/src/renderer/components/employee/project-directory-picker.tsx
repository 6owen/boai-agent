/*
 * [INPUT]: 员工配置草稿、系统目录选择器与草稿变更回调。
 * [OUTPUT]: 标题/标签/图标沿网页检索默认样式；目录按钮沿同一select-trigger皮肤和统一尺寸，固定左右行与直接选择保持。
 * [POS]: 员工项目目录的共享分区与控件，保存由原员工表单负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { FolderOpen } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { errorText, showErrorToast } from '@/components/common'
import { ConnectionSettingRow } from '@/pages/settings/connection-layout'
import { EmployeeFormSection } from './profile-card'

type ProjectDirectoryProps = {
  api: DesktopApi; directory?: string; disabled?: boolean; active?: boolean; label?: string
  id?: string; 'aria-label'?: string
  onChange?(directory: string): void | Promise<void>; onBusyChange?(busy: boolean): void
}

export function ProjectDirectorySection({ actions, ...props }: ProjectDirectoryProps & { actions?: ReactNode }) {
  return <EmployeeFormSection title="项目目录" hint="未设置时在工作区工作；设置后用于后续主聊天和新任务，已有任务保留原目录。" actions={actions}>
    <ConnectionSettingRow label="工作目录" icon={<FolderOpen />}><ProjectDirectoryPicker {...props} /></ConnectionSettingRow>
  </EmployeeFormSection>
}

export function ProjectDirectoryPicker({ api, directory, disabled = false, active = true, label = '项目目录', id, 'aria-label': ariaLabel, onChange, onBusyChange }: ProjectDirectoryProps) {
  const [busy, setBusy] = useState(false)
  const flight = useRef(false), alive = useRef(true), currentActive = useRef(active); currentActive.current = active
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const path = directory || '未设置'
  const change = async () => {
    if (!onChange || disabled || !currentActive.current || flight.current) return
    flight.current = true; setBusy(true); onBusyChange?.(true)
    try {
      const next = await api.request('chooseProjectDirectory', undefined)
      if (next !== null && alive.current && currentActive.current) await onChange(next)
    } catch (error) { showErrorToast(errorText(error)) }
    finally { flight.current = false; if (alive.current) { setBusy(false); onBusyChange?.(false) } }
  }
  const className = 'project-directory-control inline-flex w-56 max-w-full min-w-0 items-center justify-start justify-self-end px-3 font-normal'
  const name = `${ariaLabel ?? label}：${path}`
  return <Tooltip>
    <TooltipTrigger delay={500} data-slot={onChange ? 'select-trigger' : undefined} render={onChange
      ? <Button id={id} type="button" variant="secondary" size="lg" data-slot="select-trigger" className={className} disabled={disabled || busy || !active} aria-label={name} onClick={() => void change()} />
      : <span id={id} className={className} aria-label={name} />}><span className="min-w-0 truncate">{directory || (onChange ? '选择工作目录' : '未设置')}</span></TooltipTrigger>
    <TooltipContent side="top" className="max-w-96 break-all">{directory || '未配置项目目录时，在员工工作区工作'}</TooltipContent>
  </Tooltip>
}
