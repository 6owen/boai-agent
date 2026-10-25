/*
 * [INPUT]: 创建员工、群聊或团队回调、可选页面菜单项与统一 UI 菜单。
 * [OUTPUT]: 会话和通讯录共用的员工/群聊加号入口；通讯录追加团队创建，可选插槽承接页面菜单项。
 * [POS]: 跨页面的创建菜单，不持有业务数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Contact, Plus, Users } from '@/components/icons'

export function AddContactMenu({ onCreate, onCreateTeam, children }: { children?: ReactNode; onCreateTeam?(): void; onCreate(kind: 'agent' | 'group'): void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="新建" title="添加" />}><Plus /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup>
      <DropdownMenuItem onClick={() => onCreate('agent')}><Contact />新建员工</DropdownMenuItem>
      <DropdownMenuItem onClick={() => onCreate('group')}><Users />新建群聊</DropdownMenuItem>
      {onCreateTeam && <DropdownMenuItem onClick={onCreateTeam}><Users />创建团队</DropdownMenuItem>}
      {children}
    </DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>
}
