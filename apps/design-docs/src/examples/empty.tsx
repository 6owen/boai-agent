/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { Button } from '@boai/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@boai/ui/empty'
export default function EmptyExample() { return <Empty><EmptyHeader><EmptyMedia variant="icon">◇</EmptyMedia><EmptyTitle>还没有项目</EmptyTitle><EmptyDescription>从一个小项目开始整理工作。</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={event => { event.currentTarget.textContent = '已点击创建（示例）' }}>创建项目</Button></EmptyContent></Empty> }
