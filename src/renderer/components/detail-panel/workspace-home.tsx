/*
 * [INPUT]: 原会话成员、明确员工选择和用户终端宿主回执。
 * [OUTPUT]: 工作区开始入口、文件标签和真实终端创建/重连；群聊不自动选择员工。
 * [POS]: 右侧工作区开始页，保留既有联系人和独立浏览器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { Snapshot } from '@shared/domain'
import type { TerminalInfo } from '@shared/domain/workspace-tools'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { toast } from 'sonner'

export function WorkspaceHome({ api, snapshot, active, conversationId, employeeId, onFiles, onTerminal }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId: string; employeeId?: string
  onFiles(employeeId: string): void; onTerminal(terminal: TerminalInfo): void
}) {
  const room = snapshot.conversations.find(item => item.id === conversationId)
  const employees = snapshot.agents.filter(agent => room?.agentIds.includes(agent.id))
  const [selected, select] = useState(employeeId ?? (room?.kind !== 'group' && employees.length === 1 ? employees[0]!.id : ''))
  const owner = employees.find(employee => employee.id === selected)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]), [creating, setCreating] = useState(false), [revision, refresh] = useState(0)
  const pending = useRef(false), request = useRef<{ employeeId: string; requestId: string } | undefined>(undefined), current = useRef({ active, selected })
  current.current = { active, selected }
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
  return <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4" aria-label="工作区开始">
    <div className="flex items-center gap-2 text-sm"><span className="i-solar-folder-linear size-4" /><span>{room?.title ?? '工作区'}</span></div>
    {employees.length > 1 || room?.kind === 'group' ? <SelectField aria-label="工作区员工" placeholder="选择员工工作区" value={selected} disabled={creating} options={employees.map(agent => ({ value: agent.id, label: agent.name }))} onValueChange={select} /> : <p className="text-sm text-muted-foreground">{owner?.name ?? '该员工已不可用'}</p>}
    <Button variant="outline" size="content" className="justify-start gap-3 p-4 text-left" disabled={!owner || creating} onClick={() => owner && onFiles(owner.id)}>
      <span className="i-solar-folder-open-linear size-5 shrink-0" /><span className="flex min-w-0 flex-col gap-1"><span>工作区文件</span><span className="text-xs font-normal text-muted-foreground">浏览员工工作区中的文件</span></span>
    </Button>
    <Button variant="outline" size="content" className="justify-start gap-3 p-4 text-left" disabled={!owner || creating} onClick={() => void create()}>
      <span className="i-carbon-terminal size-5 shrink-0" /><span className="flex min-w-0 flex-col gap-1"><span>{creating ? '正在创建终端…' : '新建终端'}</span><span className="text-xs font-normal text-muted-foreground">在员工工作区运行命令</span></span>
    </Button>
    {!!terminals.length && <div className="flex flex-col gap-1"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">已打开的终端</span><Button variant="ghost" size="icon-sm" aria-label="刷新终端列表" onClick={() => refresh(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button></div>
      {terminals.map(terminal => <Button variant="ghost" size="sm" className="justify-start" key={terminal.id} onClick={() => onTerminal(terminal)}><span className="i-carbon-terminal size-4" /><span className="truncate">{terminal.title}</span><span className="ml-auto text-xs text-muted-foreground">{terminal.status === 'exited' ? '已结束' : '运行中'}</span></Button>)}
    </div>}
  </section>
}
