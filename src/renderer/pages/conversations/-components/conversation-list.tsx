/*
 * [INPUT]: 员工与快照领域类型、草稿与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 紧凑会话列表、统一员工头像、Carbon 操作图标、员工搜索 Popover 和新建 DropdownMenu。
 * [POS]: src/renderer/pages/conversations/-components/conversation-list.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { useRef, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { MoreHorizontal, Plus, Search, Users, X } from '@/components/icons/index'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { Avatar, timeText } from '@/components/common/index'

import { type ChatDraft } from '../presentation'
export function ConversationList({ snapshot, selectedId, query, onQuery, previews, messageTimes, drafts, onSelect, onAgent, onEdit, onCreate }: { snapshot: Snapshot; selectedId: string | null; query: string; onQuery: (value: string) => void; previews: Record<string, string>; messageTimes: Record<string, string>; drafts: Map<string, ChatDraft>; onSelect: (id: string) => void; onAgent: (agent: DigitalAgent) => void; onEdit: (agent: DigitalAgent) => void; onCreate: (kind: 'agent' | 'group') => void }) {
  const [menu, setMenu] = useState<'new' | 'employees' | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const employeeSearch = useRef<HTMLInputElement>(null)
  const lastMessageAt = (conversation: Snapshot['conversations'][number]) => {
    const live = messageTimes[conversation.id] ?? '', saved = conversation.lastMessageAt ?? ''
    return live > saved ? live : saved
  }
  const conversations = snapshot.conversations.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => lastMessageAt(b).localeCompare(lastMessageAt(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
  const agents = snapshot.agents.filter(a => `${a.name} ${a.role}`.toLowerCase().includes(employeeQuery.toLowerCase()))
  return <div className="conversation-list-panel">
    <div className="list-heading"><h2>会话</h2><div className="list-heading-actions">
      <Popover open={menu === 'employees'} onOpenChange={open => setMenu(open ? 'employees' : null)}>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="数字员工" title="数字员工" />}><Users /></PopoverTrigger>
        <PopoverContent align="end" className="w-[290px] max-w-[calc(100vw-80px)]" initialFocus={employeeSearch}>
          <div className="employee-picker-heading"><PopoverTitle>数字员工</PopoverTitle><Button variant="ghost" size="icon-sm" aria-label="关闭员工列表" onClick={() => setMenu(null)}><X /></Button></div>
          <InputGroup><InputGroupAddon><Search size={14} /></InputGroupAddon><InputGroupInput ref={employeeSearch} aria-label="搜索数字员工" placeholder="搜索姓名或职责" value={employeeQuery} onChange={event => setEmployeeQuery(event.target.value)} /></InputGroup>
          <div className="employee-picker-list">{agents.map(agent => <div className="contact-row" key={agent.id}><Button variant="ghost" size="content" className="contact-open" onClick={() => { setMenu(null); onAgent(agent) }}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} /><span className="conversation-copy"><span className="conversation-title">{agent.name}</span><span className="conversation-preview">{agent.active ? agent.role || '数字员工' : '已停用'}</span></span></Button><Button variant="ghost" size="icon-sm" aria-label={`编辑 ${agent.name}`} onClick={() => { setMenu(null); onEdit(agent) }}><MoreHorizontal /></Button></div>)}{!agents.length && <div className="list-empty">{employeeQuery ? '没有匹配的员工' : '创建一位员工，开始新的对话。'}</div>}</div><Button variant="secondary" size="sm" onClick={() => { setMenu(null); onCreate('agent') }}><Plus />新建员工</Button>
        </PopoverContent>
      </Popover>
      <DropdownMenu open={menu === 'new'} onOpenChange={open => setMenu(open ? 'new' : null)}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="新建" />}><Plus /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onCreate('agent')}>新建员工</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCreate('group')}>新建群聊</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </div></div>
    <InputGroup><InputGroupAddon><Search size={14} /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => onQuery(event.target.value)} /></InputGroup>
    <div className="conversation-list" role="navigation" aria-label="会话列表">{conversations.map(conversation => {
      const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0]), messageTime = lastMessageAt(conversation)
      return <Button variant="ghost" size="content" className={`conversation-item${selectedId === conversation.id ? ' selected' : ''}`} key={conversation.id} onClick={() => onSelect(conversation.id)}>{conversation.kind === 'group' ? <span className="group-avatar"><Users /></span> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />}<span className="conversation-copy"><span className="conversation-title">{conversation.title}{conversation.activity && conversation.activity !== 'idle' && <span className={`list-activity ${conversation.activity}`}>{({ running: '处理中', waiting_approval: '待授权', queued: '排队', failed: '失败' } as const)[conversation.activity]}</span>}{messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}</span><span className="conversation-preview">{drafts.get(conversation.id)?.text ? <><em>[草稿]</em> {drafts.get(conversation.id)?.text}</> : previews[conversation.id] || conversation.lastMessagePreview || (conversation.kind === 'group' ? `${conversation.agentIds.length} 位数字员工` : agent?.role || '专属对话')}</span></span></Button>
    })}{!conversations.length && <div className="list-empty">{query ? '没有匹配的会话' : '选择一位数字员工，或创建群聊，开始新的对话。'}</div>}</div>
    <div className="list-footer"><span className="local-dot" />本地工作空间<span>{snapshot.agents.length} 位员工</span></div>
  </div>
}

