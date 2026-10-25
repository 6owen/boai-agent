/*
 * [OUTPUT]: 就地编辑的fieldset清零默认外边距，标题和Card与只读分区保持相同宽度及左右边缘。
 * [INPUT]: 当前群聊/员工快照、版本化群配置IPC及页面草稿守卫。
 * [OUTPUT]: 原排版群名失焦局部保存，分区悬停编辑，群头像打开已选成员双栏弹窗；高级配置仍保留基础配置。
 * [POS]: 通讯录群聊资料的就地配置，保存共用原载荷映射，不重新创建群或刷新整个页面。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Conversation, DigitalAgent, Snapshot } from '@boai/shared/domain'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DesktopApi } from '@boai/shared/ipc'
import { Avatar, GuardContext, showErrorToast, useMutation } from '@/components/common'
import { GroupAvatar } from '@/components/common/group-avatar'
import { GroupConfigurationFields, groupConfigurationDraft, groupConfigurationInput, type GroupConfigurationDraft, type GroupSection } from '@/components/employee/group-configuration-fields'
import { GroupMemberDialog } from '@/components/employee/group-member-selection'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection } from '@/components/employee/profile-card'
import { ProfileText } from '@/components/employee/profile-text'
import { MessageCircle, Pencil, Settings } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContactEditorDialog } from './contact-editor-layout'

const sectionKeys: Record<GroupSection | 'title' | 'members', (keyof GroupConfigurationDraft)[]> = { title: ['title'], members: ['ids'], settings: ['memoryScope', 'memoryContextId'], team: ['teamSetup'], knowledge: ['knowledge'] }
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
export function GroupProfile({ api, snapshot, group, active, busy: externalBusy, refresh, onGroupSaved, onMessage, advancedOpen, onAdvancedChange, onOpenAgent, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; group: Conversation; active: boolean; busy: boolean; refresh(): Promise<void>
  onGroupSaved(group: Conversation): void; onMessage(): void; advancedOpen: boolean; onAdvancedChange(open: boolean): void
  onOpenAgent(id: string): void; onConversation(id: string, messageId?: string): void
}) {
  const baseline = useRef(group)
  const [form, setForm] = useState(() => groupConfigurationDraft(group))
  const current = useRef(form); current.current = form
  const [section, setSection] = useState<GroupSection | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [pendingTitle, setPendingTitle] = useState(false), [savingTitle, setSavingTitle] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const { busy, run } = useMutation(), guard = useContext(GuardContext)
  const dirty = !equal(form, groupConfigurationDraft(baseline.current))
  const locked = externalBusy || busy || pendingTitle || !active || advancedOpen
  useEffect(() => { if (!advancedOpen) guard.setDirty(dirty); return () => guard.setDirty(false) }, [dirty, advancedOpen, guard.setDirty])
  useEffect(() => {
    if (busy || unconfirmed || dirty || (group.configVersion ?? 0) <= (baseline.current.configVersion ?? 0)) return
    baseline.current = group; setForm(groupConfigurationDraft(group))
  }, [group, busy, unconfirmed, dirty])
  const reset = () => { setSection(null); setForm(groupConfigurationDraft(baseline.current)); setPendingTitle(false) }
  const navigate = (action: () => void) => { if (!locked) guard.navigate(() => { reset(); action() }, { resetOnDiscard: false }) }
  const save = async (scope: keyof typeof sectionKeys, memberIds?: string[]) => {
    if (busy || externalBusy || unconfirmed || !active || advancedOpen) return
    const before = current.current, base = groupConfigurationDraft(baseline.current), keys = sectionKeys[scope]
    const submitted = { ...base, ...Object.fromEntries(keys.map(key => [key, key === 'ids' && memberIds ? memberIds : before[key]])) }
    if (!submitted.title.trim()) { showErrorToast('请输入群聊名称。'); return }
    if (submitted.ids.length < 1 || submitted.ids.length > 12) return
    if (equal(submitted, base)) { if (scope === 'members') setMembersOpen(false); else if (scope !== 'title') setSection(null); return }
    if (scope === 'title') setSavingTitle(true)
    await run(async () => {
      let result: Conversation
      const input = groupConfigurationInput(baseline.current, submitted)
      if (scope !== 'settings') input.memoryContextRef = baseline.current.memoryContextRef ?? null
      try { result = await api.request('createConversation', input) }
      catch (reason) { setPendingTitle(false); setUnconfirmed(true); throw reason }
      // Keep drafts from other sections and typing entered while this request was pending.
      const edits = Object.fromEntries(Object.entries(current.current).filter(([key, value]) => !equal(value, keys.includes(key as keyof GroupConfigurationDraft) ? before[key as keyof GroupConfigurationDraft] : base[key as keyof GroupConfigurationDraft])))
      baseline.current = result
      const next = { ...groupConfigurationDraft(result), ...edits }
      current.current = next; setForm(next); onGroupSaved(result)
      if (scope === 'members') setMembersOpen(false)
      else if (scope !== 'title') setSection(null)
      guard.setDirty(!equal(next, groupConfigurationDraft(result)))
    })
    setSavingTitle(false)
  }
  useEffect(() => {
    if (!pendingTitle || busy || unconfirmed || externalBusy || !active || advancedOpen) return
    setPendingTitle(false); void save('title')
  })
  const reload = () => navigate(() => { void run(async () => {
    const result = (await api.request('snapshot', undefined)).conversations.find(item => item.id === group.id)
    if (!result) throw new Error('群聊已移除，请重新打开通讯录。')
    baseline.current = result; setForm(groupConfigurationDraft(result)); setUnconfirmed(false); onGroupSaved(result)
  }) })
  const members = group.agentIds.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
  const candidates = snapshot.agents.filter(agent => !isCoreAgent(agent) || group.creationSource?.kind === 'bobo-collaboration' && group.agentIds.includes(agent.id))
  const editButton = (label: string, action: () => void) => <Button variant="ghost" size="sm" className="contact-section-edit" aria-label={`编辑${label}`} disabled={locked || unconfirmed} onClick={() => navigate(action)}><Pencil />编辑</Button>
  const actions = <div className="flex items-center gap-2"><Button variant="ghost" size="sm" disabled={locked} onClick={() => navigate(() => {})}>取消</Button><Button type="submit" size="sm" disabled={locked || unconfirmed}>保存</Button></div>
  const renderSection = (key: GroupSection, title: string, children: ReactNode, fields = true) => section === key
    ? <form key={key} data-edit-form onSubmit={event => { event.preventDefault(); void save(key) }}><fieldset className="m-0 min-w-0 border-0 p-0" disabled={locked || unconfirmed}><GroupConfigurationFields value={form} onChange={setForm} snapshot={snapshot} conversationId={group.id} section={key} actions={actions} includeTitle={false} /></fieldset></form>
    : <ContactProfileSection key={key} title={title} actions={editButton(title, () => setSection(key))}><ContactProfileCard label={title} fields={fields}>{children}</ContactProfileCard></ContactProfileSection>
  return <>
    <div className="contact-document employee-form-layout" data-identity-saving={(pendingTitle || savingTitle) && !externalBusy && active ? '' : undefined}>
      <header className="contact-profile-heading">
        <Button variant="ghost" size="content" className="contact-group-avatar" aria-label="配置群成员" disabled={locked || unconfirmed} onClick={() => navigate(() => setMembersOpen(true))}><GroupAvatar members={members} /></Button>
        <div className="contact-profile-identity"><ProfileText as="h1" label="群聊名称" value={form.title} placeholder="群聊名称" maxLength={200} disabled={externalBusy || !active || advancedOpen || unconfirmed || busy && !savingTitle} onChange={title => { const next = { ...current.current, title }; current.current = next; setForm(next) }} onBlur={() => { if (!unconfirmed && current.current.title !== baseline.current.title) setPendingTitle(true) }} /><Badge variant="secondary">群聊</Badge></div>
      </header>
      <div className="contact-profile-actions mb-6 flex flex-wrap gap-3"><Button disabled={locked} onClick={() => navigate(onMessage)}><MessageCircle />发消息</Button><Button variant="secondary" disabled={locked} onClick={() => navigate(() => onAdvancedChange(true))}><Settings />高级配置</Button></div>
      {unconfirmed && <Button variant="secondary" size="sm" disabled={locked} onClick={reload}>载入当前配置</Button>}
      <div className="employee-form-sections">
        {renderSection('settings', '群聊设置', <><ContactProfileRow icon={null} title="新交流的记忆范围">{group.memoryScope === 'conversation' ? '仅在此聊天使用' : '各员工在相关聊天中使用'}</ContactProfileRow><ContactProfileRow icon={null} title="关联事项">{group.memoryContextRef?.kind === 'conversation' ? snapshot.conversations.find(item => item.id === group.memoryContextRef?.id)?.title ?? '聊天已移除' : group.memoryContextRef ? '已关联任务' : '不关联'}</ContactProfileRow></>)}
        {(group.teamSetup || section === 'team') && renderSection('team', '团队背景', <><ContactProfileRow icon={null} title="团队目的">{group.teamSetup?.purpose}</ContactProfileRow><ContactProfileRow icon={null} title="协作建议">{group.teamSetup?.collaborationGuide || '未设置'}</ContactProfileRow>{group.teamSetup?.scenarioKind === 'roleplay' && <ContactProfileRow icon={null} title="角色互动">玩家群不包含正式游戏规则、隐藏身份或胜负裁定。</ContactProfileRow>}</>)}
        {renderSection('knowledge', '群内共享知识', group.sharedKnowledgeIds.length ? group.sharedKnowledgeIds.map(id => <div className="contact-resource-row" key={id}><span className="contact-resource-copy"><strong>{snapshot.resources.find(resource => resource.id === id)?.name ?? '资料已移除'}</strong><span className="contact-resource-description">{snapshot.resources.find(resource => resource.id === id)?.description}</span></span></div>) : <p className="contact-card-empty">还没有共享的知识资料。</p>, false)}
        <ContactProfileSection title={`群成员 ${group.agentIds.length}`} actions={editButton('群成员', () => setMembersOpen(true))}><ContactProfileCard label="群成员" fields={false}>{members.map(member => <Button key={member.id} variant="ghost" size="content" className="conversation-item" aria-label={`查看 ${member.name} 的资料`} disabled={locked} onClick={() => navigate(() => onOpenAgent(member.id))}><Avatar name={member.name} seed={member.id} avatar={member.avatar} color={member.color} /><span className="conversation-copy"><strong className="conversation-title">{member.name}</strong><small className="conversation-preview">{member.role || '数字员工'}</small></span></Button>)}</ContactProfileCard></ContactProfileSection>
      </div>
    </div>
    {membersOpen && <GroupMemberDialog agents={candidates} ids={form.ids} busy={busy} locked={locked || unconfirmed} onClose={() => setMembersOpen(false)} onConfirm={ids => { void save('members', ids) }} />}
    {advancedOpen && <ContactEditorDialog api={api} snapshot={snapshot} group={group} active={active} refresh={refresh} onClose={() => onAdvancedChange(false)} onConversation={onConversation} onOpenAgent={onOpenAgent} />}
  </>
}
