/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import * as M from '@boai/ui/message'
import { Bubble, BubbleContent } from '@boai/ui/bubble'
import * as S from '@boai/ui/message-scroller'
import * as A from '@boai/ui/attachment'
import { ToolChips, ToolChip } from '@boai/ui/tool-chips'
import { TypesetCode } from '@boai/ui/typeset'
export default function Messages() {
 const [count,setCount] = useState(4), [open,setOpen] = useState(false), [chip,setChip] = useState(false)
 return <div className="example-stack"><div className="h-64"><S.MessageScrollerProvider><S.MessageScroller><S.MessageScrollerViewport><S.MessageScrollerContent><M.MessageGroup>{Array.from({length:count},(_,index) => <S.MessageScrollerItem key={index} scrollAnchor={index === count - 1}><M.Message align={index % 2 ? 'start' : 'end'}><M.MessageContent><M.MessageHeader>{index % 2 ? 'BOAI' : '你'}</M.MessageHeader><Bubble variant={index % 2 ? 'ghost' : 'secondary'} align={index % 2 ? 'start' : 'end'}><BubbleContent>这是第 {index + 1} 条本地示例消息。</BubbleContent></Bubble><M.MessageFooter>演示内容</M.MessageFooter></M.MessageContent></M.Message></S.MessageScrollerItem>)}</M.MessageGroup></S.MessageScrollerContent></S.MessageScrollerViewport><S.MessageScrollerButton /></S.MessageScroller></S.MessageScrollerProvider></div><Button onClick={() => setCount(value => value + 1)}>追加消息</Button><A.AttachmentGroup>{(['idle','uploading','processing','error','done'] as const).map(state => <A.Attachment state={state} size="sm" key={state}><A.AttachmentMedia>◇</A.AttachmentMedia><A.AttachmentContent><A.AttachmentTitle>设计说明.md</A.AttachmentTitle><A.AttachmentDescription>{state} · 状态样本</A.AttachmentDescription></A.AttachmentContent></A.Attachment>)}</A.AttachmentGroup><ToolChips title="工具详情（展示）" open={open} onOpenChange={setOpen}><ToolChip title="读取文件" label="设计说明" chip="read" open={chip} onOpenChange={setChip}><TypesetCode>只读展示，没有执行文件操作。</TypesetCode></ToolChip></ToolChips></div>
}
