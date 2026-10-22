/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import { Input } from '@boai/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@boai/ui/popover'
import { Popconfirm } from '@boai/ui/popconfirm'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@boai/ui/hover-card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@boai/ui/tooltip'
export default function Overlays() {
 const [open, setOpen] = useState(false), [removed, setRemoved] = useState(false)
 return <div className="example-stack"><div className="example-row"><Popover><PopoverTrigger render={<Button />}>打开 Popover</PopoverTrigger><PopoverContent><label>显示名称<Input aria-label="显示名称" defaultValue="BOAI" /></label></PopoverContent></Popover><TooltipProvider><Tooltip><TooltipTrigger render={<Button variant="secondary" />}>Tooltip</TooltipTrigger><TooltipContent>辅助说明，键盘聚焦也可查看</TooltipContent></Tooltip></TooltipProvider><HoverCard><HoverCardTrigger href="#profile">悬停查看资料</HoverCardTrigger><HoverCardContent><strong>BOAI Design</strong><p>可组合的工作界面组件。</p></HoverCardContent></HoverCard></div><Popconfirm trigger={<Button variant="destructive" disabled={removed}>移除标签</Button>} title="移除这个标签？" description="此操作仅影响当前预览。" open={open} onOpenChange={setOpen} destructive onConfirm={() => { setRemoved(true); setOpen(false) }} /><output>{removed ? '标签已移除' : '标签仍在'}</output><Button variant="ghost" disabled={!removed} onClick={() => setRemoved(false)}>还原标签</Button></div>
}
