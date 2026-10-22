/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@boai/ui/chart'
const data = [{ day:'周一', completed:12 },{ day:'周二', completed:18 },{ day:'周三', completed:9 },{ day:'周四', completed:24 }]
export default function ChartExample() {
 return <div className="example-stack"><p>固定示例数据 · 已完成任务</p><ChartContainer className="h-64 w-full" config={{ completed:{ label:'已完成', color:'var(--primary)' } }}><BarChart accessibilityLayer data={data}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /><Bar dataKey="completed" fill="var(--color-completed)" radius={4} /></BarChart></ChartContainer></div>
}
