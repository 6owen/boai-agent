/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@boai/ui/resizable'
import { ScrollArea } from '@boai/ui/scroll-area'
import { ScrollFade } from '@boai/ui/scroll-fade'
import { AspectRatio } from '@boai/ui/aspect-ratio'
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@boai/ui/item'
import { Button } from '@boai/ui/button'
import { Separator } from '@boai/ui/separator'
export default function Layout() {
 return <div className="example-stack"><ResizablePanelGroup className="example-resizable"><ResizablePanel defaultSize="40%" minSize="20%"><div className="p-4">拖动分割线</div></ResizablePanel><ResizableHandle withHandle /><ResizablePanel minSize="20%"><ScrollArea className="h-48"><div className="p-4">{Array.from({length:12},(_,index) => <p key={index}>内容行 {index + 1}</p>)}</div></ScrollArea></ResizablePanel></ResizablePanelGroup><Separator /><Item variant="outline"><ItemContent><ItemTitle>项目说明</ItemTitle><ItemDescription>标题、说明与操作共享同一行。</ItemDescription></ItemContent><ItemActions><Button variant="ghost">查看</Button></ItemActions></Item><ScrollFade className="h-24 overflow-auto">{Array.from({length:8},(_,index) => <p key={index}>渐隐滚动内容 {index + 1}</p>)}</ScrollFade><AspectRatio ratio={16/9} className="flex items-center justify-center bg-muted">16 : 9</AspectRatio></div>
}
