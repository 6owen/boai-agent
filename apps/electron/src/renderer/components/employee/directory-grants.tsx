/*
 * [INPUT]: 员工目录草稿、系统选择器与现有表单保存/忙时守卫。
 * [OUTPUT]: 多目录只读/读写配置及确认移除；添加/按需申请由宿主放在标题右侧，选择只更新原草稿，错误统一Sonner。
 * [POS]: 员工独立工作区的目录授权字段；真实保存和版本检查复用AgentEditor。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { useRef, useState, type ReactNode } from 'react'
import type { DirectoryGrant } from '@boai/shared/domain/directory-access'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from '@/components/ui/popover'
import { FolderOpen, Plus, X } from '@/components/icons'
import { errorText, showErrorToast } from '@/components/common'

export function DirectoryGrantFields({ api, value, disabled, fullAccess, onChange, onBusyChange, renderSection }: {
  api: DesktopApi; value: DirectoryGrant[] | undefined; disabled: boolean; fullAccess: boolean;
  onChange(value: DirectoryGrant[]): void; onBusyChange(busy: boolean): void
  renderSection?(content: ReactNode, actions: ReactNode): ReactNode
}) {
  const [choosing, setChoosing] = useState(false)
  const choose = async () => {
    if (disabled || choosing) return
    setChoosing(true); onBusyChange(true)
    try {
      const path = await api.request('chooseEmployeeDirectory', undefined)
      if (path && !value?.some(item => item.path === path)) onChange([...(value ?? []), { path, access: 'read-write' }])
    } catch (error) { showErrorToast(errorText(error)) }
    finally { setChoosing(false); onBusyChange(false) }
  }
  const actions = <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" size="sm" disabled={disabled || choosing || (value?.length ?? 0) >= 32} onClick={() => { void choose() }}><Plus />添加授权目录</Button>
    {value === undefined && <Button type="button" variant="ghost" size="sm" disabled={disabled || choosing} onClick={() => onChange([])}>启用按需申请</Button>}
  </div>
  const content = <div className="flex min-w-0 flex-col gap-3">
    <p className="field-hint">{fullAccess ? '其他目录自动授权。这里可以保留常用的业务目录。' : '已授权目录按许可访问，其他目录在使用前申请。群聊中仍使用这位员工自己的授权。'}</p>
    <div className="soft-divide-y">{(value ?? []).map(grant => <DirectoryGrantRow key={grant.path} grant={grant} disabled={disabled || choosing}
      onChange={access => onChange((value ?? []).map(item => item.path === grant.path ? { ...item, access } : item))}
      onRemove={() => onChange((value ?? []).filter(item => item.path !== grant.path))} />)}</div>
    <p className="field-hint">保存后生效。移除授权保留目录及其中的文件。</p>
  </div>
  return renderSection ? renderSection(content, actions) : <>{actions}{content}</>
}
function DirectoryGrantRow({ grant, disabled, onChange, onRemove }: { grant: DirectoryGrant; disabled: boolean; onChange(access: DirectoryGrant['access']): void; onRemove(): void }) {
  const [removing, setRemoving] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  return <div className="flex min-w-0 flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0"><FolderOpen /><span className="min-w-0 flex-1 break-all" title={grant.path}>{grant.path}</span>
    <Select value={grant.access} onValueChange={value => { if (value === 'read-only' || value === 'read-write') onChange(value) }} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={`目录权限 ${grant.path}`}><SelectValue>{grant.access === 'read-only' ? '只读' : '读写'}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup><SelectItem value="read-only">只读</SelectItem><SelectItem value="read-write">读写</SelectItem></SelectGroup></SelectContent>
    </Select>
    <Button ref={anchor} type="button" variant="ghost" size="icon-xs" aria-label={`移除目录授权 ${grant.path}`} disabled={disabled} onClick={() => setRemoving(true)}><X /></Button>
    <Popover open={removing} onOpenChange={setRemoving}><PopoverContent anchor={anchor} align="end" finalFocus={anchor}>
      <PopoverTitle>移除此目录授权？</PopoverTitle><PopoverDescription>保存后撤销访问许可，目录和原文件保留。</PopoverDescription>
      <div className="button-row justify-end"><Button type="button" variant="secondary" size="sm" onClick={() => setRemoving(false)}>取消</Button><Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => { setRemoving(false); onRemove() }}>确认移除</Button></div>
    </PopoverContent></Popover>
  </div>
}
