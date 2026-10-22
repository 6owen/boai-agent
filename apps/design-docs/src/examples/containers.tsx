/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import { Input } from '@boai/ui/input'
import * as D from '@boai/ui/dialog'
import * as A from '@boai/ui/alert-dialog'
import * as S from '@boai/ui/sheet'
import * as W from '@boai/ui/drawer'
export default function Containers() {
 const [removed, setRemoved] = useState(false)
 return <div className="example-stack"><div className="example-row">
 <D.Dialog><D.DialogTrigger render={<Button />}>打开 Dialog</D.DialogTrigger><D.DialogContent><D.DialogHeader><D.DialogTitle>项目名称</D.DialogTitle><D.DialogDescription>尝试输入、Tab 切换焦点，以及按 Escape 关闭。</D.DialogDescription></D.DialogHeader><Input aria-label="项目名称" defaultValue="设计系统" /><D.DialogFooter><D.DialogClose render={<Button variant="secondary" />}>关闭</D.DialogClose></D.DialogFooter></D.DialogContent></D.Dialog>
 <A.AlertDialog><A.AlertDialogTrigger render={<Button variant="destructive" />}>确认移除</A.AlertDialogTrigger><A.AlertDialogContent><A.AlertDialogHeader><A.AlertDialogTitle>移除示例项目？</A.AlertDialogTitle><A.AlertDialogDescription>仅改变此预览的状态，可以还原。</A.AlertDialogDescription></A.AlertDialogHeader><A.AlertDialogFooter><A.AlertDialogCancel>取消</A.AlertDialogCancel><A.AlertDialogAction onClick={() => setRemoved(true)}>移除</A.AlertDialogAction></A.AlertDialogFooter></A.AlertDialogContent></A.AlertDialog>
 <S.Sheet><S.SheetTrigger render={<Button variant="secondary" />}>打开 Sheet</S.SheetTrigger><S.SheetContent><S.SheetHeader><S.SheetTitle>详情</S.SheetTitle><S.SheetDescription>从侧边展开的补充内容。</S.SheetDescription></S.SheetHeader><S.SheetClose render={<Button />}>关闭详情</S.SheetClose></S.SheetContent></S.Sheet>
 <W.Drawer><W.DrawerTrigger render={<Button variant="secondary" />}>打开 Drawer</W.DrawerTrigger><W.DrawerContent><W.DrawerHeader><W.DrawerTitle>更多操作</W.DrawerTitle><W.DrawerDescription>支持拖动手柄关闭。</W.DrawerDescription></W.DrawerHeader><W.DrawerFooter><W.DrawerClose render={<Button />}>完成</W.DrawerClose></W.DrawerFooter></W.DrawerContent></W.Drawer></div>
 <output>{removed ? '示例项目已移除' : '示例项目存在'}</output><Button variant="ghost" onClick={() => setRemoved(false)} disabled={!removed}>还原项目</Button></div>
}
