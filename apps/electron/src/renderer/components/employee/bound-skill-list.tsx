/*
 * [INPUT]: 当前员工草稿的技能ID、可访问资源及原详情/移除操作。
 * [OUTPUT]: 已绑定技能普通行的更多菜单提供详情及红色移除项；移除经按钮旁Popover确认后更新草稿，取消保留绑定。
 * [POS]: 员工基础配置的技能列表；移除只更新现有配置草稿，不删除全局技能。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useRef, useState } from 'react'
import type { Resource } from '@boai/shared/domain'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle } from '@/components/ui/popover'
import { MoreHorizontal } from '@/components/icons'

export function BoundSkillList({ resources, ids, disabled, onOpen, onRemove }: {
  resources: Resource[]; ids: string[]; disabled: boolean; onOpen?(resource: Resource): void; onRemove(id: string): void
}) {
  return <div className="resource-picker">{ids.map(id => {
    const resource = resources.find(item => item.id === id && item.kind === 'skill')
    return <BoundSkillRow key={id} id={id} resource={resource} disabled={disabled} onOpen={onOpen} onRemove={onRemove} />
  })}</div>
}

function BoundSkillRow({ id, resource, disabled, onOpen, onRemove }: {
  id: string; resource?: Resource; disabled: boolean; onOpen?(resource: Resource): void; onRemove(id: string): void
}) {
  const [removing, setRemoving] = useState(false)
  const menuAnchor = useRef<HTMLButtonElement>(null)
  return <div className="flex min-w-0 items-center gap-1">
      <div className="resource-option min-w-0 flex-1 cursor-default"><span><strong>{resource?.name ?? '技能已移除'}</strong>{resource?.description && <small>{resource.description}</small>}</span></div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button ref={menuAnchor} type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={`技能操作 ${resource?.name ?? id}`} />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" finalFocus={removing ? false : undefined}><DropdownMenuGroup>
          {onOpen && <DropdownMenuItem disabled={!resource} onClick={() => { if (resource) onOpen(resource) }}>打开详情</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>移除</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
      <Popover open={removing} onOpenChange={setRemoving}>
        <PopoverContent anchor={menuAnchor} align="end" finalFocus={menuAnchor}>
          <PopoverTitle className="break-words">移除“{resource?.name ?? '技能'}”？</PopoverTitle>
          <PopoverDescription>保存员工配置后生效。</PopoverDescription>
          <div className="button-row justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoving(false)}>取消</Button>
            <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => { setRemoving(false); onRemove(id) }}>确认移除</Button>
          </div>
        </PopoverContent>
      </Popover>
  </div>
}
