/*
 * [INPUT]: 全部基础组件、实际全局样式、生产 MessageCard/Sonner 与受控外观初始化。
 * [OUTPUT]: 六种表单控件与 secondary 共用表面、聚焦/展开保持中性边缘及错误红边/禁用/只读组合验收；聊天输入聚焦保持中性细边缘/独立背景圆角和禁用发送按钮焦点；跨 Portal 弹层、复制短错误、四状态/折叠堆叠及长短正文固定左右控件/状态同色纯 X/悬停背景预览。
 * [POS]: Vite 测试页面，独立于生产入口与业务导航。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import type { Message } from '@boai/shared/domain'
import { initializeAppearance, useAppearance } from '@/stores/appearance'
import { MessageCard } from '@/pages/conversations/-components/message-card'
import { ChatComposer, ChatComposerInput, ChatComposerFooter } from '@/components/ui/chat-composer'
import { ArrowUp, FolderOpen } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Combobox, ComboboxChips, ComboboxChipsInput } from '@/components/ui/combobox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import '@/styles/global.css'

// Eager imports ensure every installed module and its dependencies compile in Vite.
const modules = import.meta.glob('../../../apps/electron/src/renderer/components/ui/*.tsx', { eager: true })
const items = [{ label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]
const toastPreviews = [
  { type: 'success', label: '成功提示', title: '操作完成', description: '你的更改已保存。' },
  { type: 'error', label: '错误提示', title: '操作失败', description: '请检查权限后再试一次。' },
  { type: 'warning', label: '警告提示', title: '请注意', description: '继续操作前请确认当前设置。' },
  { type: 'info', label: '信息提示', title: '新消息', description: '你有一条新的任务更新。' },
] as const
const longToastTitle = `操作失败：无法访问资源，请核对来源。${'VeryLongContinuousResourceIdentifierWithoutWhitespace'.repeat(4)}`
const message: Message = { id: 'toast-error-message', conversationId: 'component-fixture', senderType: 'user', senderId: 'user', senderName: 'Arvin', content: '能给我生成一个日记的 markdown 模板吗', status: 'completed', sequence: 1, createdAt: '2026-10-02T00:00:00.000Z' }
initializeAppearance()
function FormSurfaceFixture() {
  return <Card id="form-surfaces" className="w-full max-w-4xl shrink-0">
    <CardHeader><CardTitle>统一表单样式</CardTitle><CardDescription>输入和选择共用按钮表面，聚焦与校验保留清晰边缘。</CardDescription></CardHeader>
    <CardContent className="grid grid-cols-3 items-start gap-5">
      <Field className="col-span-3"><FieldLabel>按钮参照</FieldLabel><Button id="surface-reference" variant="secondary" className="w-fit">次要按钮</Button></Field>
      <Field><FieldLabel htmlFor="surface-input">单行输入</FieldLabel><Input id="surface-input" defaultValue="项目名称" /></Field>
      <Field><FieldLabel htmlFor="surface-textarea">多行输入</FieldLabel><Textarea id="surface-textarea" rows={2} defaultValue="记录工作进度" /></Field>
      <Field><FieldLabel htmlFor="surface-group-input">组合输入</FieldLabel><InputGroup id="surface-group"><InputGroupAddon>https://</InputGroupAddon><InputGroupInput id="surface-group-input" defaultValue="example.com" /></InputGroup></Field>
      <Field><FieldLabel htmlFor="surface-chips-input">多项选择</FieldLabel><Combobox multiple items={['研究', '设计']} defaultValue={[]}><ComboboxChips id="surface-chips"><ComboboxChipsInput id="surface-chips-input" placeholder="添加标签" /></ComboboxChips></Combobox></Field>
      <Field><FieldLabel htmlFor="surface-select">下拉选择</FieldLabel><Select items={items} defaultValue="light"><SelectTrigger id="surface-select" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="surface-native">原生选择</FieldLabel><NativeSelect id="surface-native" className="w-full" defaultValue="light">{items.map(item => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="surface-invalid">校验错误</FieldLabel><Input id="surface-invalid" aria-invalid="true" defaultValue="请检查此项" /></Field>
      <Field><FieldLabel htmlFor="surface-invalid-child">组合校验错误</FieldLabel><InputGroup id="surface-invalid-group"><InputGroupAddon>@</InputGroupAddon><InputGroupInput id="surface-invalid-child" aria-invalid="true" defaultValue="请检查此项" /></InputGroup></Field>
      <Field><FieldLabel htmlFor="surface-disabled">暂不可用</FieldLabel><Input id="surface-disabled" disabled defaultValue="暂不可编辑" /></Field>
      <Field><FieldLabel htmlFor="surface-disabled-child">组合不可用</FieldLabel><InputGroup id="surface-disabled-group"><InputGroupAddon>@</InputGroupAddon><InputGroupInput id="surface-disabled-child" disabled defaultValue="暂不可编辑" /></InputGroup></Field>
      <Field><FieldLabel htmlFor="surface-readonly">只读输入</FieldLabel><Input id="surface-readonly" readOnly defaultValue="已保存的内容" /></Field>
      <Field><FieldLabel htmlFor="surface-readonly-child">只读组合</FieldLabel><InputGroup id="surface-readonly-group"><InputGroupAddon>@</InputGroupAddon><InputGroupInput id="surface-readonly-child" readOnly defaultValue="已保存的内容" /></InputGroup></Field>
    </CardContent>
  </Card>
}
function ComponentFixture() {
  const mode = useAppearance(state => state.preview.resolvedMode)
  const [expanded, setExpanded] = React.useState(false)
  return <TooltipProvider><Toaster theme={mode} duration={Infinity} visibleToasts={4} expand={expanded} />
  <main className="app-shell overflow-auto! p-8" data-module-count={Object.keys(modules).length}>
    <Card className="w-full max-w-4xl shrink-0">
      <CardHeader><CardTitle>基础组件验收</CardTitle><CardDescription>Soft 表面 · 生产全局样式与真实主题。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-3">
          <Button>主要操作</Button><Button variant="ink">深色按钮</Button><Button variant="secondary">次要操作</Button><Button variant="outline">描边按钮</Button><Button variant="ghost">轻量操作</Button><Button variant="destructive">删除</Button><Button disabled>不可操作</Button>
        </div>
        <div className="flex flex-wrap gap-3" role="group" aria-label="提示状态预览">
          {toastPreviews.map(preview => <Button key={preview.type} variant="outline" onClick={() => toast[preview.type](preview.title, { description: preview.description })}>{preview.label}</Button>)}
          <Button variant="secondary" onClick={() => { setExpanded(true); toastPreviews.forEach(preview => toast[preview.type](preview.title, { description: preview.description })) }}>预览所有提示</Button>
          <Button variant="outline" onClick={() => { setExpanded(false); [1, 2, 3].forEach(() => toast.error('复制失败：未获得剪贴板权限。')) }}>预览重叠错误</Button>
          <Button variant="outline" onClick={() => toast.error(longToastTitle)}>预览长错误</Button>
        </div>
        <div className="button-row"><Button size="sm">紧凑操作</Button><Button variant="surface" size="content" className="p-4">内容卡片操作</Button></div>
        <ChatComposer id="surface-composer"><ChatComposerInput aria-label="验收消息" placeholder="说说你想完成什么…" /><ChatComposerFooter><Button variant="secondary" size="icon" round aria-label="工作目录"><FolderOpen /></Button><Button size="icon" round disabled aria-label="发送验收消息"><ArrowUp /></Button></ChatComposerFooter></ChatComposer>
        <section className="chat-panel" aria-label="消息错误提示验收"><div className="message-row user" id={message.id}><div className="message-main"><MessageCard message={message} profile={{ displayName: 'Arvin' }} onReply={() => {}} onTrace={() => {}}><div className="message-bubble">{message.content}</div></MessageCard></div></div></section>
        <div className="flex flex-wrap gap-3">
          <Dialog><DialogTrigger render={<Button />}>打开对话框</DialogTrigger><DialogContent><DialogHeader><DialogTitle>对话框标题</DialogTitle><DialogDescription>焦点应在弹层中，关闭后返回触发按钮。</DialogDescription></DialogHeader>
            <FieldGroup><Field><FieldLabel htmlFor="dialog-name">名称</FieldLabel><Input id="dialog-name" /></Field></FieldGroup>
            <Popover><PopoverTrigger render={<Button variant="outline" />}>嵌套浮层</PopoverTrigger><PopoverContent><PopoverHeader><PopoverTitle>嵌套浮层标题</PopoverTitle><PopoverDescription>显示在对话框上方。</PopoverDescription></PopoverHeader></PopoverContent></Popover>
          </DialogContent></Dialog>
          <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" />}>打开菜单</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup><DropdownMenuItem onClick={() => toast.success('操作完成')}>执行操作</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
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
    <FormSurfaceFixture />
  </main>
</TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ComponentFixture /></React.StrictMode>)
