/*
 * [INPUT]: 工作/文件筛选的受控值、可见会话与员工快照。
 * [OUTPUT]: 同款关键词/Select与中文日期范围；时间转换归纯合同，筛选不会扩大聊天授权。
 * [POS]: 工作视图的筛选组合，复用项目现有控件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import type { Snapshot } from '@shared/domain'
import { CalendarClock, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SelectField } from '@/components/ui/select-field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dateBoundary, emptyWorkFilters, workStateLabels, type WorkViewFilters } from './model'

export function DateFilter({ from, to, onChange }: { from: string; to: string; onChange(from: string, to: string): void }) {
  let range: DateRange | undefined
  try { if (from) range = { from: new Date(dateBoundary(from)!), to: to ? new Date(dateBoundary(to)!) : undefined } } catch { /* Query validation shows the invalid saved range; the trigger must remain usable. */ }
  return <Popover><PopoverTrigger render={<Button variant="secondary" size="sm" data-slot="date-range-trigger" data-placeholder={!from && !to ? '' : undefined} aria-label="时间筛选" />}><CalendarClock />{range?.from ? format(range.from, 'yyyy/MM/dd') + (range.to ? ` 至 ${format(range.to, 'yyyy/MM/dd')}` : ' 起') : '时间'}</PopoverTrigger>
    <PopoverContent align="start" className="max-h-(--available-height) w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0"><Calendar mode="range" selected={range} defaultMonth={range?.from} numberOfMonths={2} locale={zhCN} aria-label="工作时间范围" onSelect={next => onChange(next?.from ? format(next.from, 'yyyy-MM-dd') : '', next?.to ? format(next.to, 'yyyy-MM-dd') : '')} /><Button variant="ghost" size="sm" disabled={!from && !to} onClick={() => onChange('', '')}>清除时间</Button></PopoverContent>
  </Popover>
}
export function WorkFilters({ snapshot, value, onChange, conversationId, ownerAgentId }: { snapshot: Snapshot; value: WorkViewFilters; onChange(value: WorkViewFilters): void; conversationId?: string; ownerAgentId?: string }) {
  const change = (patch: Partial<WorkViewFilters>) => onChange({ ...value, ...patch })
  const conversations = snapshot.conversations.filter(conversation => !conversation.list?.hidden)
  const removedConversation = Boolean(value.conversationId && !conversations.some(item => item.id === value.conversationId))
  const removedOwner = Boolean(value.ownerAgentId && !snapshot.agents.some(item => item.id === value.ownerAgentId))
  return <div className="flex flex-wrap items-center gap-2" aria-label="任务筛选">
    <InputGroup className="w-56"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="任务目标关键词" placeholder="查找工作目标" maxLength={200} value={value.search} onChange={event => change({ search: event.target.value })} /></InputGroup>
    {!ownerAgentId && <SelectField size="sm" className="w-32" aria-label="负责人筛选" value={value.ownerAgentId} onValueChange={(ownerAgentId, details) => { if (removedOwner && !ownerAgentId && details.reason === 'none') { details.cancel(); return } change({ ownerAgentId }) }} options={[{ value: '', label: '全部员工' }, ...(removedOwner ? [{ value: value.ownerAgentId, label: '已移除员工', disabled: true }] : []), ...snapshot.agents.map(agent => ({ value: agent.id, label: agent.name }))]} />}
    {!conversationId && <SelectField size="sm" className="w-40" aria-label="会话筛选" value={value.conversationId} onValueChange={(conversationId, details) => { if (removedConversation && !conversationId && details.reason === 'none') { details.cancel(); return } change({ conversationId }) }} options={[{ value: '', label: '全部会话' }, ...conversations.map(item => ({ value: item.id, label: item.title }))]} />}
    <SelectField size="sm" className="w-32" aria-label="状态筛选" value={value.state} onValueChange={state => change({ state })} options={[{ value: '', label: '全部状态' }, ...Object.entries(workStateLabels).map(([value, label]) => ({ value, label }))]} />
    <SelectField size="sm" className="w-32" aria-label="任务来源筛选" value={value.source} onValueChange={source => change({ source })} options={[{ value: '', label: '全部来源' }, { value: 'ordinary', label: '普通工作' }, { value: 'automation', label: '定时触发' }, { value: 'unknown', label: '来源未知' }]} />
    <DateFilter from={value.from} to={value.to} onChange={(from, to) => change({ from, to })} />
    {Object.values(value).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => onChange({ ...emptyWorkFilters })}>清除筛选</Button>}
  </div>
}
