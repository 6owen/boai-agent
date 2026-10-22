/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import * as D from '@boai/ui/dropdown-menu'
import * as C from '@boai/ui/context-menu'
import * as M from '@boai/ui/menubar'
import * as N from '@boai/ui/navigation-menu'
import * as K from '@boai/ui/command'
export default function Menus() {
 const [action, setAction] = useState('尚未选择')
 return <div className="example-stack"><D.DropdownMenu><D.DropdownMenuTrigger render={<Button />}>项目菜单</D.DropdownMenuTrigger><D.DropdownMenuContent><D.DropdownMenuGroup><D.DropdownMenuLabel>项目</D.DropdownMenuLabel><D.DropdownMenuItem onClick={() => setAction('重命名')}>重命名</D.DropdownMenuItem><D.DropdownMenuSeparator /><D.DropdownMenuItem disabled>不可用操作</D.DropdownMenuItem><D.DropdownMenuCheckboxItem defaultChecked>显示预览</D.DropdownMenuCheckboxItem></D.DropdownMenuGroup></D.DropdownMenuContent></D.DropdownMenu>
 <C.ContextMenu><C.ContextMenuTrigger className="example-context-target">在这里单击右键</C.ContextMenuTrigger><C.ContextMenuContent><C.ContextMenuItem onClick={() => setAction('复制')}>复制</C.ContextMenuItem><C.ContextMenuItem onClick={() => setAction('粘贴')}>粘贴</C.ContextMenuItem></C.ContextMenuContent></C.ContextMenu>
 <M.Menubar><M.MenubarMenu><M.MenubarTrigger>文件</M.MenubarTrigger><M.MenubarContent><M.MenubarItem onClick={() => setAction('新建')}>新建</M.MenubarItem></M.MenubarContent></M.MenubarMenu><M.MenubarMenu><M.MenubarTrigger>编辑</M.MenubarTrigger><M.MenubarContent><M.MenubarItem onClick={() => setAction('撤销')}>撤销</M.MenubarItem></M.MenubarContent></M.MenubarMenu></M.Menubar>
 <N.NavigationMenu><N.NavigationMenuList><N.NavigationMenuItem><N.NavigationMenuTrigger>资源</N.NavigationMenuTrigger><N.NavigationMenuContent><N.NavigationMenuLink href="/foundations/tokens" target="_top">Token 文档</N.NavigationMenuLink></N.NavigationMenuContent></N.NavigationMenuItem></N.NavigationMenuList></N.NavigationMenu>
 <K.Command><K.CommandInput placeholder="搜索操作…" /><K.CommandList><K.CommandEmpty>没有匹配操作</K.CommandEmpty><K.CommandGroup heading="常用操作">{['新建文件','打开设置','查看帮助'].map(item => <K.CommandItem key={item} onSelect={() => setAction(item)}>{item}</K.CommandItem>)}</K.CommandGroup></K.CommandList></K.Command><output aria-live="polite">最近操作：{action}</output></div>
}
