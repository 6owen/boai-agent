/*
 * [INPUT]: 群成员候选、已选ID与受控确认/取消回调。
 * [OUTPUT]: 创建和编辑共用搜索候选/已选成员双栏，1–12人限制、已有成员回填与明确完成；不自行保存。
 * [POS]: employee 群成员选择的共用界面。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useState } from 'react'
import type { DigitalAgent } from '@boai/shared/domain'
import { Avatar } from '@/components/common'
import { LoaderCircle, Search, Users, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

export function GroupMemberSelection({ agents, ids, onChange, onCancel, onConfirm, busy = false, locked = busy, confirmDisabled = locked, title = '群聊成员' }: {
  agents: DigitalAgent[]; ids: string[]; onChange(ids: string[]): void; onCancel(): void; onConfirm(): void
  busy?: boolean; locked?: boolean; confirmDisabled?: boolean; title?: string
}) {
  const [query, setQuery] = useState('')
  const available = agents.filter(agent => ids.includes(agent.id) || agent.active && agent.executionBackend?.kind !== 'acp-local')
  const selected = ids.map(id => agents.find(agent => agent.id === id) ?? { id, name: '已移除的员工', role: '', color: '', active: false } as DigitalAgent)
  const matches = available.filter(agent => `${agent.name} ${agent.role}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="grid min-h-0 grid-cols-1 gap-5 sm:grid-cols-2">
          <FieldSet className="min-w-0 gap-3">
            <FieldLegend className="sr-only">选择群成员</FieldLegend>
            <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索群成员" placeholder="搜索名称或角色" value={query} onChange={e => setQuery(e.target.value)} /></InputGroup>
            <div className="h-[200px] overflow-y-auto sm:h-[340px]">
              {matches.map(agent => <label className="creation-member" key={agent.id}>
                <Checkbox checked={ids.includes(agent.id)} disabled={locked || (ids.length >= 12 && !ids.includes(agent.id))} onCheckedChange={checked => onChange(checked ? [...ids, agent.id] : ids.filter(id => id !== agent.id))} />
                <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><strong className="conversation-title">{agent.name}</strong><small className="conversation-preview">{agent.role || '数字员工'}</small></span>
              </label>)}
              {!matches.length && <p className="empty-note">{available.length ? '没有匹配的员工' : '还没有可加入群聊的员工'}</p>}
            </div>
          </FieldSet>
          <section className="flex min-w-0 flex-col gap-3" aria-label="已选成员">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle>{title}</DialogTitle><span className="creation-selection-heading">已选择 {ids.length} 位员工</span></div>
              <DialogDescription className="sr-only">选择 1–12 位数字员工，群名称和资料可在创建后编辑。</DialogDescription>
            </DialogHeader>
            <div className="h-[160px] overflow-y-auto sm:h-0 sm:flex-1">
              {selected.map(agent => <div className="creation-member" key={agent.id}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><strong className="conversation-title">{agent.name}</strong><small className="conversation-preview">{agent.role || '数字员工'}</small></span><Button variant="ghost" size="icon-sm" round disabled={locked} aria-label={`移除 ${agent.name}`} onClick={() => onChange(ids.filter(id => id !== agent.id))}><X /></Button></div>)}
              {!selected.length && <div className="creation-selection-empty"><Users /><span>选择一起工作的同事</span></div>}
            </div>
            <DialogFooter variant="plain"><Button variant="ghost" disabled={busy} onClick={onCancel}>取消</Button><Button variant="ink" type="button" onClick={onConfirm} disabled={confirmDisabled || !ids.length || ids.length > 12}>{busy && <LoaderCircle className="spinner" />}完成</Button></DialogFooter>
          </section>
        </div>
}

export function GroupMemberDialog({ agents, ids, busy = false, locked = busy, onClose, onConfirm }: {
  agents: DigitalAgent[]; ids: string[]; busy?: boolean; locked?: boolean; onClose(): void; onConfirm(ids: string[]): void
}) {
  const [selected, setSelected] = useState(ids)
  const close = () => { if (!busy) onClose() }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[720px]">
      <GroupMemberSelection agents={agents} ids={selected} onChange={setSelected} busy={busy} locked={locked} onCancel={close} onConfirm={() => { if (!locked && selected.length > 0 && selected.length <= 12) onConfirm(selected) }} />
    </DialogContent>
  </Dialog>
}
