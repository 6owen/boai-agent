/*
 * [OUTPUT]: 2026-10-29 workspace-home仅显示已有授权目录；workspace-files接官方树和原预览；tabs-state区分员工workspace标签。
 * [INPUT]: 原会话成员、明确员工选择和用户终端宿主回执。
 * [OUTPUT]: 全局空态组件/工作区SVG与随全局字号缩放的Solar folder/file-terminal线性图标；真实创建/重连、群员工选择和Sonner反馈保持。
 * [POS]: 右侧工作区开始页，保留既有联系人和独立浏览器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot } from '@boai/shared/domain'
import type { TerminalInfo } from '@boai/shared/domain/workspace-tools'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { useFileExplorerEnabled } from '@/stores/plugins'
import { toast } from 'sonner'

export function WorkspaceHome({ api, snapshot, active, conversationId, employeeId, onFiles, onTerminal }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId: string; employeeId?: string
  onFiles(employeeId: string): void; onTerminal(terminal: TerminalInfo): void
}) {
  const filesEnabled = useFileExplorerEnabled()
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
  return <section className="workspace-home" aria-label="工作区开始">
    <IllustratedEmpty kind="workspace" className="workspace-home-content h-auto min-h-full flex-none gap-7 px-6 py-8">
      <div className="workspace-home-actions">
        {(employees.length > 1 || room?.kind === 'group') && <SelectField aria-label="工作区员工" placeholder="选择员工" value={selected} disabled={creating} options={employees.map(agent => ({ value: agent.id, label: agent.name }))} onValueChange={select} />}
        {filesEnabled && (owner ? owner.directoryGrants?.length : employees.some(employee => employee.directoryGrants?.length)) ? <Button variant="outline" size="content" className="workspace-home-action" disabled={!owner || creating} onClick={() => owner && onFiles(owner.id)}>
          <span className="workspace-home-action-icon workspace-home-files-icon i-solar-folder-linear" aria-hidden="true" />
          <span className="workspace-home-action-text"><span className="workspace-home-action-title">授权目录</span><span className="workspace-home-action-description">浏览员工已获授权的目录</span></span>
        </Button> : null}
        <Button variant="outline" size="content" className="workspace-home-action" disabled={!owner || creating} aria-busy={creating} onClick={() => void create()}>
          <span className="workspace-home-action-icon workspace-home-terminal-icon i-solar-file-terminal-linear" aria-hidden="true" />
          <span className="workspace-home-action-text"><span className="workspace-home-action-title">新建终端</span><span className="workspace-home-action-description">在员工工作区运行命令</span></span>
        </Button>
        {!!terminals.length && <div className="workspace-home-terminals"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">已打开的终端</span><Button variant="ghost" size="icon-sm" aria-label="刷新终端列表" onClick={() => refresh(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button></div>
          {terminals.map(terminal => <Button variant="ghost" size="sm" className="min-w-0 justify-start" key={terminal.id} onClick={() => onTerminal(terminal)}><span className="i-solar-file-terminal-linear size-4 shrink-0" /><span className="truncate">{terminal.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{terminal.status === 'exited' ? '已结束' : '运行中'}</span></Button>)}
        </div>}
      </div>
    </IllustratedEmpty>
  </section>
}
