/*
 * [INPUT]: 员工与快照领域类型、草稿与公共组件。
 * [OUTPUT]: 会话列表和员工导航。
 * [POS]: src/renderer/pages/conversations/-components/conversation-list.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Search, Users, X } from '@/components/icons/index'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { Avatar, timeText } from '@/components/common/index'

import { type ChatDraft } from '../presentation'
export function ConversationList({ snapshot, selectedId, query, onQuery, previews, messageTimes, drafts, onSelect, onAgent, onEdit, onCreate }: { snapshot: Snapshot; selectedId: string | null; query: string; onQuery: (value: string) => void; previews: Record<string, string>; messageTimes: Record<string, string>; drafts: Map<string, ChatDraft>; onSelect: (id: string) => void; onAgent: (agent: DigitalAgent) => void; onEdit: (agent: DigitalAgent) => void; onCreate: (kind: 'agent' | 'group') => void }) {
  const [menu, setMenu] = useState<'new' | 'employees' | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (menu) menuRef.current?.querySelector<HTMLInputElement | HTMLButtonElement>(menu === 'employees' ? 'input' : '[role="menuitem"]')?.focus() }, [menu])
  useEffect(() => {
    if (!menu) return
    const listener = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [menu])
  const lastMessageAt = (conversation: Snapshot['conversations'][number]) => {
    const live = messageTimes[conversation.id] ?? '', saved = conversation.lastMessageAt ?? ''
    return live > saved ? live : saved
  }
  const conversations = snapshot.conversations.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => lastMessageAt(b).localeCompare(lastMessageAt(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
  const agents = snapshot.agents.filter(a => `${a.name} ${a.role}`.toLowerCase().includes(employeeQuery.toLowerCase()))
  return <div className="conversation-list-panel">
    <div className="list-heading"><h2>会话</h2><div className="menu-anchor list-heading-actions" ref={menuRef} onKeyDown={event => {
      if (event.key === 'Escape' && menu) { event.preventDefault(); event.stopPropagation(); setMenu(null); menuTrigger.current?.focus() }
    }}>
      <button className={`icon-button${menu === 'employees' ? ' active' : ''}`} aria-label="数字员工" title="数字员工" aria-haspopup="dialog" aria-expanded={menu === 'employees'} onClick={event => { menuTrigger.current = event.currentTarget; setMenu(menu === 'employees' ? null : 'employees') }}><Users size={20} /></button>
      <button className="icon-button" aria-label="新建" aria-haspopup="menu" aria-expanded={menu === 'new'} onClick={event => { menuTrigger.current = event.currentTarget; setMenu(menu === 'new' ? null : 'new') }}><Plus size={21} /></button>
      {menu === 'new' && <div className="popover-menu" role="menu" onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }
      }}><button role="menuitem" onClick={() => { setMenu(null); onCreate('agent') }}>新建员工</button><button role="menuitem" onClick={() => { setMenu(null); onCreate('group') }}>新建群聊</button></div>}
      {menu === 'employees' && <div className="employee-picker" role="dialog" aria-label="数字员工"><div className="employee-picker-heading"><strong>数字员工</strong><button className="icon-button" aria-label="关闭员工列表" onClick={() => { setMenu(null); menuTrigger.current?.focus() }}><X size={16} /></button></div><label className="search-input"><Search size={15} /><input aria-label="搜索数字员工" placeholder="搜索姓名或职责" value={employeeQuery} onChange={event => setEmployeeQuery(event.target.value)} /></label><div className="employee-picker-list">{agents.map(agent => <div className="contact-row" key={agent.id}><button className="contact-open" onClick={() => { setMenu(null); onAgent(agent) }}><Avatar name={agent.name} color={agent.color} /><span className="conversation-copy"><span className="conversation-title">{agent.name}</span><span className="conversation-preview">{agent.active ? agent.role || '数字员工' : '已停用'}</span></span></button><button className="icon-button" aria-label={`编辑 ${agent.name}`} onClick={() => { setMenu(null); onEdit(agent) }}><MoreHorizontal size={17} /></button></div>)}{!agents.length && <div className="list-empty">{employeeQuery ? '没有匹配的员工' : '创建一位员工，开始新的对话。'}</div>}</div><button className="button subtle small" onClick={() => { setMenu(null); onCreate('agent') }}><Plus size={14} />新建员工</button></div>}
    </div></div>
    <label className="search-input"><Search size={15} /><input aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <div className="conversation-list" role="navigation" aria-label="会话列表">{conversations.map(conversation => {
      const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0]), messageTime = lastMessageAt(conversation)
      return <button className={`conversation-item${selectedId === conversation.id ? ' selected' : ''}`} key={conversation.id} onClick={() => onSelect(conversation.id)}>{conversation.kind === 'group' ? <span className="group-avatar"><Users size={20} /></span> : <Avatar name={agent?.name ?? conversation.title} color={agent?.color} />}<span className="conversation-copy"><span className="conversation-title">{conversation.title}{conversation.activity && conversation.activity !== 'idle' && <span className={`list-activity ${conversation.activity}`}>{({ running: '处理中', waiting_approval: '待授权', queued: '排队', failed: '失败' } as const)[conversation.activity]}</span>}{messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}</span><span className="conversation-preview">{drafts.get(conversation.id)?.text ? <><em>[草稿]</em> {drafts.get(conversation.id)?.text}</> : previews[conversation.id] || conversation.lastMessagePreview || (conversation.kind === 'group' ? `${conversation.agentIds.length} 位数字员工` : agent?.role || '专属对话')}</span></span></button>
    })}{!conversations.length && <div className="list-empty">{query ? '没有匹配的会话' : '选择一位数字员工，或创建群聊，开始新的对话。'}</div>}</div>
    <div className="list-footer"><span className="local-dot" />本地工作空间<span>{snapshot.agents.length} 位员工</span></div>
  </div>
}

