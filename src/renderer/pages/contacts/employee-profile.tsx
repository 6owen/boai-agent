/*
 * [OUTPUT]: 身份自动保存单独标记，顶部操作和悬停编辑保持原外观，同时继续锁定保存期间的导航。
 * [OUTPUT]: 身份保存将服务端回执局部更新到员工快照，避免重新读取整个页面；分区草稿、光标与滚动保持。
 * [INPUT]: 当前员工快照、原版本化编辑器、页面草稿守卫与高级配置弹窗。
 * [OUTPUT]: 顶部保留原资料页头像/标题/描述的排版和按钮间距，文字直接编辑并自动保存，其他分区悬停编辑；共用单个版本化草稿。
 * [POS]: 通讯录员工资料的就地编辑边界，不复制保存或技能绑定协议。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useContext, useEffect, useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GuardContext } from '@/components/common'
import { AgentEditor, type AgentConfigurationSection } from '@/components/employee/editors'
import { EmployeeOverview } from '@/components/employee/overview'
import type { EmployeeSectionEditing } from '@/components/employee/profile-card'
import { MessageCircle, Settings } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ContactEditorDialog } from './contact-editor-layout'

export function EmployeeProfile({ api, snapshot, agent, active, busy, refresh, onAgentSaved, onMessage, advancedOpen, onAdvancedChange, onOpenAgent, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; agent: DigitalAgent; active: boolean; busy: boolean
  refresh(): Promise<void>; onMessage(): void; advancedOpen: boolean; onAdvancedChange(open: boolean): void
  onAgentSaved(agent: DigitalAgent): void
  onOpenAgent(id: string): void; onConversation(id: string, messageId?: string): void
}) {
  const [section, setSection] = useState<AgentConfigurationSection | null>(null)
  const [saving, setSaving] = useState(false)
  const [identitySaving, setIdentitySaving] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [identityTarget, setIdentityTarget] = useState<HTMLElement | null>(null)
  const [sectionTarget, setSectionTarget] = useState<HTMLElement | null>(null)
  const guard = useContext(GuardContext)
  useEffect(() => { if (advancedOpen) { setSection(null); setEditorKey(value => value + 1) } }, [advancedOpen])
  const locked = busy || saving || !active
  const navigate = (action: () => void) => {
    if (locked) return
    guard.navigate(() => { setSection(null); setEditorKey(value => value + 1); action() }, { resetOnDiscard: false })
  }
  const editing: EmployeeSectionEditing = {
    section, locked,
    onEdit: next => { if (next !== section) navigate(() => setSection(next)) },
    render: () => <div ref={setSectionTarget} />,
  }
  return <>
    <div className="contact-document employee-form-layout" data-identity-saving={identitySaving && !busy && active ? '' : undefined}>
      <header className="contact-profile-heading" ref={setIdentityTarget} />
      <AgentEditor key={editorKey} api={api} snapshot={snapshot} agent={agent} active={active && !advancedOpen} scope="contact-profile" section={section ?? 'identity'} inlineIdentity identityTarget={identityTarget} sectionTarget={section ? sectionTarget : undefined} identityDisabled={busy || !active || advancedOpen} onSaved={refresh} onIdentitySaved={onAgentSaved} onClose={() => { setSection(null); setEditorKey(value => value + 1) }} onBusyChange={setSaving} onIdentityBusyChange={setIdentitySaving} />
      <div className="contact-profile-actions mb-6 flex flex-wrap gap-3"><Button disabled={locked} onClick={() => navigate(onMessage)}><MessageCircle />发消息</Button><Button variant="secondary" disabled={locked} onClick={() => navigate(() => onAdvancedChange(true))}><Settings />高级配置</Button></div>
      <div className="employee-form-sections"><EmployeeOverview api={api} snapshot={snapshot} agent={agent} active={active} editing={editing} /></div>
    </div>
    {advancedOpen && <ContactEditorDialog api={api} snapshot={snapshot} agent={agent} active={active} advancedOnly refresh={refresh} onClose={() => onAdvancedChange(false)} onConfigure={() => { onAdvancedChange(false); setSection('model') }} onConversation={onConversation} onOpenAgent={onOpenAgent} />}
  </>
}
