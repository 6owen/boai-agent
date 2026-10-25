/*
 * [INPUT]: Actual personality activity receipts and scoped refresh/stop/delete/clear callbacks.
 * [OUTPUT]: Compact activity rows; detail/delete icons share hover/focus visibility and stay visible while their Popover is open.
 * [POS]: Personality page, independent of employee automation tasks; no schedule creation controls.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useState } from 'react'
import type { AgentBehaviorRun } from '@boai/shared/domain/agent-profile'
import { Button } from '@/components/ui/button'
import { Clock, Eye, Trash2 } from '@/components/icons'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ContactProfileSection } from './profile-card'

const statuses = { running: '运行中', completed: '已完成', skipped: '已跳过', failed: '失败', interrupted: '已中断', cancelled: '已停止' }
const names = { emotion: '情绪更新', reflection: '日终反思', greeting: '主动交流', travel: '虚拟旅行', 'follow-up': '旧版跟进' }
export function AgentActivityHistory({ history, onStop, onRefresh, onDelete, onClear, disabled = false }: {
  history: AgentBehaviorRun[]; onStop(id: string): void; onRefresh(): void; onDelete(id: string): void; onClear(before: string): void; disabled?: boolean
}) {
  return <ContactProfileSection title="后台活动记录" hint="记录自动更新情绪、反思成长、虚拟旅行和主动交流的结果。删除记录不会重置当前状态或删除聊天消息。" actions={<div className="automation-record-actions">
    <ClearHistory disabled={disabled || !history.some(record => record.status !== 'running')} onClear={onClear} />
    <Button variant="ghost" size="sm" disabled={disabled} onClick={onRefresh}>刷新记录</Button>
  </div>}>
    <div className="automation-record-list soft-divide-y" role="region" aria-label="后台活动记录详情">
      {history.map(record => <ActivityRow key={record.id} record={record} disabled={disabled} onDelete={onDelete} onStop={onStop} />)}
      {!history.length && <p className="field-hint">暂无后台活动记录</p>}
    </div>
  </ContactProfileSection>
}

function ActivityRow({ record, disabled, onDelete, onStop }: { record: AgentBehaviorRun; disabled: boolean; onDelete(id: string): void; onStop(id: string): void }) {
  const title = record.kind ? names[record.kind] : '历史活动'
  const subtitle = `${new Date(record.startedAt).toLocaleString('zh-CN', { hour12: false })} · ${statuses[record.status]}`
  return <article className="automation-history-row min-w-0 py-3 first:pt-0 last:pb-0" data-activity-id={record.id}>
    <div className="relative flex items-center gap-3 pr-11">
      <span className="skill-list-icon"><Clock /></span>
      <span className="conversation-copy"><strong className="conversation-title">{title}</strong><small className="conversation-preview" title={subtitle}>{subtitle}</small></span>
      {record.status === 'running' && <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onStop(record.id)}>停止</Button>}
      <Popover><PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="automation-record-detail shrink-0 text-muted-foreground hover:text-foreground" aria-label={`查看${title}详情`} title="查看详情" />}><Eye /></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-32px)]">
        <PopoverTitle>{title}详情</PopoverTitle>
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto text-sm">
          <p className="m-0 text-xs text-muted-foreground">{subtitle}</p>
          {(record.result || record.error) && <p className="m-0 whitespace-pre-wrap break-words">{record.result === 'skip' ? '本次没有需要更新的内容。' : record.result || record.error}</p>}
          {record.promptEvidence && <div className="flex flex-col gap-1 text-xs text-muted-foreground"><p className="m-0 font-medium">实际使用的提示词</p>{record.promptEvidence.modules.map(module => <p key={module.id} className="m-0 break-words">{module.source} · {module.characters} 字符 · {module.hash.slice(0, 12)}</p>)}</div>}
        </div>
      </PopoverContent></Popover>
      <DeleteHistory record={record} title={title} disabled={disabled} onDelete={onDelete} />
    </div>
  </article>
}

function ClearHistory({ disabled, onClear }: { disabled: boolean; onClear(before: string): void }) {
  const [before, setBefore] = useState<string>()
  return <Popover open={Boolean(before)} onOpenChange={open => setBefore(open ? new Date().toISOString() : undefined)}>
    <PopoverTrigger render={<Button variant="ghost" size="sm" disabled={disabled} />}>全部清空</PopoverTrigger>
    <PopoverContent align="end"><PopoverTitle>清空这位员工的后台活动记录？</PopoverTitle><PopoverDescription>清空此刻之前已结束的记录，包括更早的记录。运行中的活动、当前状态和聊天消息会保留。</PopoverDescription><div className="button-row justify-end"><Button variant="secondary" size="sm" onClick={() => setBefore(undefined)}>取消</Button><Button variant="destructive" size="sm" disabled={disabled || !before} onClick={() => { if (before) onClear(before); setBefore(undefined) }}>确认清空</Button></div></PopoverContent>
  </Popover>
}

function DeleteHistory({ record, title, disabled, onDelete }: { record: AgentBehaviorRun; title: string; disabled: boolean; onDelete(id: string): void }) {
  const [open, setOpen] = useState(false), ongoing = record.status === 'running'
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="automation-record-delete absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive" disabled={disabled || ongoing} aria-label={`删除后台活动记录 ${title}`} title={ongoing ? '请先停止本次活动' : '删除记录'} />}><Trash2 /></PopoverTrigger>
    <PopoverContent align="end"><PopoverTitle>删除这条后台活动记录？</PopoverTitle><PopoverDescription>当前状态和聊天消息会保留。</PopoverDescription><div className="button-row justify-end"><Button variant="secondary" size="sm" onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" size="sm" disabled={disabled || ongoing} onClick={() => { onDelete(record.id); setOpen(false) }}>确认删除</Button></div></PopoverContent>
  </Popover>
}
