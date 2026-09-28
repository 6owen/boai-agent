/*
 * [INPUT]: 创建员工或群聊回调与统一 UI 菜单。
 * [OUTPUT]: 会话和通讯录共用的单个加号入口。
 * [POS]: 跨页面的创建菜单，不持有业务数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Contact, Plus, Users } from '@/components/icons'

export function AddContactMenu({ onCreate }: { onCreate(kind: 'agent' | 'group'): void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="新建" title="添加" />}><Plus /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup>
      <DropdownMenuItem onClick={() => onCreate('agent')}><Contact />新建员工</DropdownMenuItem>
      <DropdownMenuItem onClick={() => onCreate('group')}><Users />新建群聊</DropdownMenuItem>
    </DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>
}
