/*
 * [INPUT]: 原会话成员、明确员工选择、原任务/知识导航及终端/浏览器宿主接口。
 * [OUTPUT]: 工具卡片固定60px，文字/图标使用共享Button default中号尺寸且字重normal；沿全局Card细边缘，原终端创建与迟到隔离保持。
 * [POS]: 右侧工作区开始页，复用原任务、知识资料、终端和内置浏览器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot } from '@boai/shared/domain'
import type { TerminalInfo } from '@boai/shared/domain/workspace-tools'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SelectField } from '@/components/ui/select-field'
import { ContactProfileSection } from '@/components/employee/profile-card'
import { errorText } from '@/components/common'
import { toast } from 'sonner'

export function WorkspaceHome({ api, snapshot, active, conversationId, employeeId, onTasks, onKnowledge, onTerminal }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId: string; employeeId?: string
  onTasks(employeeId: string): void; onKnowledge(employeeId: string): void; onTerminal(terminal: TerminalInfo): void
}) {
  const room = snapshot.conversations.find(item => item.id === conversationId)
  const employees = snapshot.agents.filter(agent => room?.agentIds.includes(agent.id))
  const [selected, select] = useState(employeeId ?? (room?.kind !== 'group' && employees.length === 1 ? employees[0]!.id : ''))
  const owner = employees.find(employee => employee.id === selected)
  const browserFlight = useRef(false), [openingBrowser, setOpeningBrowser] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]), [creating, setCreating] = useState(false), [revision, refresh] = useState(0)
  const pending = useRef(false), request = useRef<{ employeeId: string; requestId: string } | undefined>(undefined), current = useRef({ active, selected })
  current.current = { active, selected: owner?.id ?? '' }
  useEffect(() => () => { current.current.active = false }, [])
  useEffect(() => {
    setTerminals([])
    if (!active || !owner) return
    let cancelled = false
    void api.request('workspaceTerminal', { action: 'list', scope: { employeeId: owner.id, conversationId } }).then(result => {
      if (!cancelled && result.kind === 'listed') setTerminals(result.terminals)
    }).catch(error => { if (!cancelled) toast.error(String(error)) })
    return () => { cancelled = true }
  }, [api, active, owner?.id, conversationId, revision])
  const create = async () => {
    if (!active || !owner || pending.current) return
    pending.current = true; setCreating(true)
    if (request.current?.employeeId !== owner.id) request.current = { employeeId: owner.id, requestId: crypto.randomUUID() }
    const input = request.current
    try {
      const result = await api.request('workspaceTerminal', { action: 'create', requestId: input.requestId, scope: { employeeId: owner.id, conversationId } })
      if (result.kind !== 'created') throw new Error('终端创建回执无效')
      request.current = undefined
      if (current.current.active && current.current.selected === owner.id) onTerminal(result.terminal)
    } catch (error) { if (current.current.active) toast.error(String(error)) }
    finally { pending.current = false; setCreating(false); refresh(value => value + 1) }
  }
  const openBrowser = async () => {
    if (!active || browserFlight.current) return
    browserFlight.current = true; setOpeningBrowser(true)
    try { await api.request('openBrowser', {}) }
    catch (error) { if (current.current.active) toast.error(errorText(error)) }
    finally { browserFlight.current = false; setOpeningBrowser(false) }
  }
  const employeeDisabled = !active || !owner || creating
  return <section className="workspace-home" aria-label="工作区开始">
    <div className="workspace-home-content p-6"><div className="employee-form-sections">
      <ContactProfileSection title="工具">
      {(employees.length > 1 || room?.kind === 'group') && <SelectField className="mb-3" aria-label="工作区员工" placeholder="选择员工" value={selected} disabled={!active || creating} options={employees.map(agent => ({ value: agent.id, label: agent.name }))} onValueChange={select} />}
      <div className="workspace-home-actions">
        <Card size="sm" className="h-[60px] gap-0 p-0"><Button variant="ghost" size="default" className="workspace-home-action h-full w-full justify-start rounded-[inherit] font-normal" disabled={employeeDisabled} onClick={() => owner && onTasks(owner.id)}>
          <span className="app-icon i-carbon-task" aria-hidden="true" /><span>任务</span>
        </Button></Card>
        <Card size="sm" className="h-[60px] gap-0 p-0"><Button variant="ghost" size="default" className="workspace-home-action h-full w-full justify-start rounded-[inherit] font-normal" disabled={employeeDisabled} aria-busy={creating} onClick={() => void create()}>
          <span className="app-icon i-carbon-terminal" aria-hidden="true" /><span>终端</span>
        </Button></Card>
        <Card size="sm" className="h-[60px] gap-0 p-0"><Button variant="ghost" size="default" className="workspace-home-action h-full w-full justify-start rounded-[inherit] font-normal" disabled={employeeDisabled} onClick={() => owner && onKnowledge(owner.id)}>
          <span className="app-icon i-carbon-book" aria-hidden="true" /><span>知识资料</span>
        </Button></Card>
        <Card size="sm" className="h-[60px] gap-0 p-0"><Button variant="ghost" size="default" className="workspace-home-action h-full w-full justify-start rounded-[inherit] font-normal" disabled={!active || openingBrowser} aria-busy={openingBrowser} onClick={() => void openBrowser()}>
          <span className="app-icon i-carbon-earth" aria-hidden="true" /><span>浏览器</span>
        </Button></Card>
      </div>
      </ContactProfileSection>
      {!!terminals.length && <ContactProfileSection title="已打开的终端" actions={<Button variant="ghost" size="icon-sm" aria-label="刷新终端列表" disabled={!active} onClick={() => refresh(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button>}><Card size="sm" className="gap-0 p-0 soft-divide-y">
        {terminals.map(terminal => <Button variant="ghost" size="sm" disabled={!active} className="min-w-0 justify-start" key={terminal.id} onClick={() => onTerminal(terminal)}><span className="app-icon i-carbon-terminal" /><span className="truncate">{terminal.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{terminal.status === 'exited' ? '已结束' : '运行中'}</span></Button>)}
      </Card></ContactProfileSection>}
    </div></div>
  </section>
}
