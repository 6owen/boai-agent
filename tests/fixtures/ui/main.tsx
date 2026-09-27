/*
 * [INPUT]: 全部基础组件、实际全局样式与受控外观初始化。
 * [OUTPUT]: Dialog/Popover/Menu/Select/Toast 等跨 Portal 的实际组合验收页。
 * [POS]: Vite 测试页面，独立于生产入口与业务导航。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { initializeAppearance } from '@/stores/appearance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Toaster, toast } from '@/components/ui/toast'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import '@/styles/global.css'

// Eager imports ensure every installed module and its dependencies compile in Vite.
const modules = import.meta.glob('../../../src/renderer/components/ui/*.tsx', { eager: true })
const items = [{ label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]
initializeAppearance()
createRoot(document.getElementById('root')!).render(<React.StrictMode><TooltipProvider><Toaster>
  <main className="app-shell overflow-auto! p-8" data-module-count={Object.keys(modules).length}>
    <Card className="w-full max-w-2xl">
      <CardHeader><CardTitle>基础组件验收</CardTitle><CardDescription>使用生产全局样式与真实主题。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-3">
          <Dialog><DialogTrigger render={<Button />}>打开对话框</DialogTrigger><DialogContent><DialogHeader><DialogTitle>对话框标题</DialogTitle><DialogDescription>焦点应在弹层中，关闭后返回触发按钮。</DialogDescription></DialogHeader>
            <FieldGroup><Field><FieldLabel htmlFor="dialog-name">名称</FieldLabel><Input id="dialog-name" /></Field></FieldGroup>
            <Popover><PopoverTrigger render={<Button variant="outline" />}>嵌套浮层</PopoverTrigger><PopoverContent><PopoverHeader><PopoverTitle>嵌套浮层标题</PopoverTitle><PopoverDescription>显示在对话框上方。</PopoverDescription></PopoverHeader></PopoverContent></Popover>
          </DialogContent></Dialog>
          <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" />}>打开菜单</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuItem onClick={() => toast.add({ title: '操作完成', type: 'success' })}>执行操作</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
          <Tooltip><TooltipTrigger render={<Button variant="ghost" />}>查看提示</TooltipTrigger><TooltipContent>快捷操作提示</TooltipContent></Tooltip>
        </div>
        <FieldGroup><Field><FieldLabel>显示模式</FieldLabel><Select items={items} defaultValue="light"><SelectTrigger aria-label="显示模式"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field orientation="horizontal"><Checkbox id="check" defaultChecked /><FieldLabel htmlFor="check">启用选项</FieldLabel></Field>
          <Field orientation="horizontal"><Switch id="toggle" /><FieldLabel htmlFor="toggle">通知开关</FieldLabel></Field>
        </FieldGroup>
        <Accordion><AccordionItem value="details"><AccordionTrigger>展开详情</AccordionTrigger><AccordionContent>基础组件支持键盘操作。</AccordionContent></AccordionItem></Accordion>
        <Calendar mode="single" />
      </CardContent>
      <CardFooter><Label>界面颜色从应用主题继承。</Label></CardFooter>
    </Card>
  </main>
</Toaster></TooltipProvider></React.StrictMode>)
