/*
 * [INPUT]: 员工快照、群成员草稿、选择变更和可选的资料入口。
 * [OUTPUT]: 紧凑头像网格、末尾添加入口、选人弹窗和 16px 悬停移除角标/确认；变更由群编辑器统一保存。
 * [POS]: employee 群配置中的成员编辑组件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { DigitalAgent } from '@shared/domain'
import { Avatar } from '@/components/common'
import { Plus, Search, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

export function GroupMembers({ agents, ids, disabled, onChange, onOpenAgent }: {
  agents: DigitalAgent[]; ids: string[]; disabled: boolean; onChange(ids: string[]): void; onOpenAgent?(id: string): void
}) {
  const [adding, setAdding] = useState(false), [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<DigitalAgent | null>(null)
  const members = ids.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
  const available = agents.filter(agent => !ids.includes(agent.id) && agent.active && agent.executionBackend?.kind !== 'acp-local')
  const matches = available.filter(agent => `${agent.name} ${agent.role}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="group-members" aria-label="群成员">
    <div className="group-member-grid">
      {members.map(agent => <div className="group-member" key={agent.id}>
        <Button variant="ghost" size="content" className="group-member-profile" aria-label={`查看 ${agent.name}`} onClick={() => onOpenAgent?.(agent.id)}>
          <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span>{agent.name}</span>
        </Button>
        <Button variant="destructive" size="icon-2xs" round className="group-member-remove" disabled={disabled || ids.length <= 1} aria-label={`从群中移除 ${agent.name}`} title={ids.length <= 1 ? '至少保留一位成员' : `移除 ${agent.name}`} onClick={() => setRemoving(agent)}><X /></Button>
      </div>)}
      <Button variant="ghost" size="content" className="group-member-profile group-member-add" aria-label="添加群成员" disabled={disabled || ids.length >= 12} onClick={() => { setSelected([]); setQuery(''); setAdding(true) }}><span className="group-member-add-icon"><Plus /></span><span>添加</span></Button>
    </div>
    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>添加群成员</DialogTitle><DialogDescription>已选 {ids.length + selected.length} / 12 位员工，保存群设置后生效。</DialogDescription></DialogHeader>
        <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索可添加的员工" placeholder="搜索名称或角色" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
        <div className="group-add-list">{matches.map(agent => <label className="creation-member" key={agent.id}>
          <Checkbox checked={selected.includes(agent.id)} disabled={ids.length + selected.length >= 12 && !selected.includes(agent.id)} onCheckedChange={checked => setSelected(current => checked ? [...current, agent.id] : current.filter(id => id !== agent.id))} />
          <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><strong className="conversation-title">{agent.name}</strong><small className="conversation-preview">{agent.role || '数字员工'}</small></span>
        </label>)}{!matches.length && <p className="empty-note">{available.length ? '没有匹配的员工' : '暂无可添加的员工'}</p>}</div>
        <DialogFooter><Button variant="secondary" onClick={() => setAdding(false)}>取消</Button><Button disabled={disabled || !selected.length} onClick={() => { onChange([...ids, ...selected]); setAdding(false) }}>添加</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>从群中移除 {removing?.name}？</AlertDialogTitle><AlertDialogDescription>保存群设置后生效，已有聊天记录会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="secondary" onClick={() => setRemoving(null)}>取消</Button><Button variant="destructive" disabled={disabled || ids.length <= 1} onClick={() => { if (removing) onChange(ids.filter(id => id !== removing.id)); setRemoving(null) }}>确认移除</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>
}
