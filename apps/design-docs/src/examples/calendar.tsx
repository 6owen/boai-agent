/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Calendar } from '@boai/ui/calendar'
export default function CalendarExample() {
 const [date, setDate] = useState<Date | undefined>(new Date(2026, 9, 22))
 return <div className="example-stack"><Calendar mode="single" month={undefined} defaultMonth={new Date(2026, 9, 1)} selected={date} onSelect={setDate} /><output>{date ? date.toLocaleDateString() : '请选择日期'}</output></div>
}
