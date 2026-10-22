/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@boai/ui/tabs'
import * as B from '@boai/ui/breadcrumb'
import * as P from '@boai/ui/pagination'
import { DirectionProvider } from '@boai/ui/direction'
export default function Navigation() {
 const [page, setPage] = useState(1)
 return <div className="example-stack"><B.Breadcrumb><B.BreadcrumbList><B.BreadcrumbItem><B.BreadcrumbLink href="/" target="_top">首页</B.BreadcrumbLink></B.BreadcrumbItem><B.BreadcrumbSeparator /><B.BreadcrumbItem><B.BreadcrumbPage>导航</B.BreadcrumbPage></B.BreadcrumbItem></B.BreadcrumbList></B.Breadcrumb>
 {(['default','line','window'] as const).map(variant => <Tabs key={variant} defaultValue="design"><TabsList variant={variant} aria-label={`${variant} 标签`}><TabsTrigger value="design">设计</TabsTrigger><TabsTrigger value="code">代码</TabsTrigger><TabsTrigger value="disabled" disabled>禁用</TabsTrigger></TabsList><TabsContent value="design">{variant} · 设计内容</TabsContent><TabsContent value="code">{variant} · 代码内容</TabsContent></Tabs>)}
 <DirectionProvider direction="rtl"><Tabs defaultValue="one" dir="rtl"><TabsList aria-label="RTL 标签"><TabsTrigger value="one">الأول</TabsTrigger><TabsTrigger value="two">الثاني</TabsTrigger></TabsList><TabsContent value="one">RTL</TabsContent><TabsContent value="two">←</TabsContent></Tabs></DirectionProvider>
 <P.Pagination><P.PaginationContent>{[1,2,3].map(value => <P.PaginationItem key={value}><P.PaginationLink href={`#page-${value}`} isActive={page === value} onClick={event => { event.preventDefault(); setPage(value) }}>{value}</P.PaginationLink></P.PaginationItem>)}</P.PaginationContent></P.Pagination><output>第 {page} 页</output></div>
}
