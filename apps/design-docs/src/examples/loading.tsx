/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import { Spinner } from '@boai/ui/spinner'
import { Progress, ProgressLabel, ProgressValue } from '@boai/ui/progress'
import { LoadingState } from '@boai/ui/loading-state'
import { ThinkingState } from '@boai/ui/thinking-state'
export default function Loading() {
 const [started, setStarted] = useState<string>(), [value, setValue] = useState(30), [open,setOpen] = useState(false)
 return <div className="example-stack"><Spinner aria-label="加载中" /><Progress value={value}><ProgressLabel>示例进度</ProgressLabel><ProgressValue /></Progress><Button variant="secondary" onClick={() => setValue(value >= 100 ? 0 : value + 10)}>推进进度</Button><Button onClick={() => setStarted(started ? undefined : new Date().toISOString())}>{started ? '停止计时' : '开始计时'}</Button>{(['Drive','Dots','Orbit'] as const).map(variant => <LoadingState key={variant} variant={variant} label={`${variant} 演示`} startedAt={started} active={!!started} working={!!started} />)}<ThinkingState open={open} onOpenChange={setOpen} working={!!started} active={!!started}><p>这是手动控制的展示状态，不会调用模型。</p></ThinkingState></div>
}
