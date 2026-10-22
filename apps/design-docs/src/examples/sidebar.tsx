/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import * as S from '@boai/ui/sidebar'
import { TooltipProvider } from '@boai/ui/tooltip'
export default function SidebarExample() {
 const [selected, setSelected] = useState('会话')
 return <TooltipProvider><S.SidebarProvider persistState={false} defaultOpen className="example-sidebar"><S.Sidebar collapsible="icon"><S.SidebarHeader><strong>我的空间</strong></S.SidebarHeader><S.SidebarContent><S.SidebarGroup><S.SidebarGroupLabel>工作区</S.SidebarGroupLabel><S.SidebarMenu>{['会话','资料','设置'].map(label => <S.SidebarMenuItem key={label}><S.SidebarMenuButton isActive={selected === label} tooltip={label} onClick={() => setSelected(label)}><span aria-hidden="true">◇</span><span>{label}</span></S.SidebarMenuButton></S.SidebarMenuItem>)}</S.SidebarMenu></S.SidebarGroup></S.SidebarContent><S.SidebarFooter>BOAI</S.SidebarFooter></S.Sidebar><S.SidebarInset><S.SidebarTrigger /><p>{selected}的内容</p></S.SidebarInset></S.SidebarProvider></TooltipProvider>
}
