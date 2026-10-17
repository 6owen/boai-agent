/*
 * [INPUT]: 群聊配置草稿、当前快照及可选的编辑分区。
 * [OUTPUT]: 资料页和高级配置共用群聊设置/团队背景/共享知识字段与原保存载荷映射。
 * [POS]: employee 群配置字段，不自行提交或持有草稿。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { ReactNode } from 'react'
import type { Conversation, ConversationInput, Snapshot } from '@shared/domain'
import { ResourcePicker } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { ConnectionSettingRow } from '@/pages/settings/connection-layout'
import { EmployeeFormSection } from './profile-card'

export type GroupSection = 'settings' | 'team' | 'knowledge'
export function groupConfigurationDraft(conversation?: Conversation) {
  return { title: conversation?.title ?? '', ids: conversation?.agentIds ?? [], knowledge: conversation?.sharedKnowledgeIds ?? [], teamSetup: conversation?.teamSetup ?? null, memoryScope: conversation?.memoryScope ?? 'employee', memoryContextId: conversation?.memoryContextRef?.kind === 'conversation' ? conversation.memoryContextRef.id : '' }
}
export type GroupConfigurationDraft = ReturnType<typeof groupConfigurationDraft>
export function groupConfigurationInput(conversation: Conversation | undefined, draft: GroupConfigurationDraft): ConversationInput {
  return { id: conversation?.id, expectedConfigVersion: conversation?.configVersion, kind: 'group', title: draft.title.trim(), agentIds: draft.ids, mode: conversation?.mode ?? 'natural', sharedKnowledgeIds: draft.knowledge, memoryScope: draft.memoryScope, memoryContextRef: draft.memoryContextId ? { kind: 'conversation', id: draft.memoryContextId } : null, ...(conversation?.teamSetup ? { teamSetup: draft.teamSetup } : {}) }
}
export function GroupConfigurationFields({ value, onChange, snapshot, conversationId, section, actions, includeTitle = true }: {
  value: GroupConfigurationDraft; onChange(value: GroupConfigurationDraft): void; snapshot: Snapshot; conversationId?: string
  section?: GroupSection; actions?: ReactNode; includeTitle?: boolean
}) {
  const { title, ids, knowledge, teamSetup, memoryScope, memoryContextId } = value
  const setTitle = (title: string) => onChange({ ...value, title })
  const setKnowledge = (knowledge: string[]) => onChange({ ...value, knowledge })
  const setTeamSetup = (teamSetup: GroupConfigurationDraft['teamSetup']) => onChange({ ...value, teamSetup })
  const setMemoryScope = (memoryScope: GroupConfigurationDraft['memoryScope']) => onChange({ ...value, memoryScope })
  const setMemoryContextId = (memoryContextId: string) => onChange({ ...value, memoryContextId })
  return <>{(!section || section === 'settings') && <EmployeeFormSection title="群聊设置" actions={actions}>
        {includeTitle && <ConnectionSettingRow label="群聊名称"><Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：我的内容工作室" /></ConnectionSettingRow>}
        <ConnectionSettingRow label="新交流的记忆范围" hint="收紧立即生效；放宽后只有新交流使用新范围，旧记录不自动升级。"><SelectField value={memoryScope} onValueChange={value => setMemoryScope(value as 'employee' | 'conversation')} options={[{ value: 'employee', label: '各员工在相关聊天中使用' }, { value: 'conversation', label: '仅在此聊天使用' }]} /></ConnectionSettingRow>
        <ConnectionSettingRow label="关联事项（可选）" hint="明确关联已有聊天中的临时约定，同名聊天不会自动关联。"><SelectField value={memoryContextId} onValueChange={setMemoryContextId} options={[{ value: '', label: '不关联' }, ...snapshot.conversations.filter(c => c.id !== conversationId && ids.every(id => c.agentIds.includes(id))).map(c => ({ value: c.id, label: c.title }))]} /></ConnectionSettingRow>
      </EmployeeFormSection>}
      {(teamSetup || section === 'team') && (!section || section === 'team') && <EmployeeFormSection title="团队背景" actions={<>{actions}{teamSetup && <Button type="button" variant="ghost" size="sm" onClick={() => setTeamSetup(null)}>移除团队背景</Button>}</>}>
        {teamSetup ? <><ConnectionSettingRow label="团队目的"><Textarea className="max-h-[200px] resize-y overflow-y-auto py-1.5 text-[12px] leading-[18px] md:text-[12px]" rows={3} required maxLength={1000} value={teamSetup.purpose} onChange={e => setTeamSetup({ ...teamSetup, purpose: e.target.value })} /></ConnectionSettingRow>
        <ConnectionSettingRow label="协作建议" hint="这是背景建议，不改变发言调度或工具权限"><Textarea className="max-h-[200px] resize-y overflow-y-auto py-1.5 text-[12px] leading-[18px] md:text-[12px]" rows={3} maxLength={2000} value={teamSetup.collaborationGuide} onChange={e => setTeamSetup({ ...teamSetup, collaborationGuide: e.target.value })} /></ConnectionSettingRow></> : <p className="contact-card-empty">未设置团队背景</p>}
      </EmployeeFormSection>}
      {(!section || section === 'knowledge') && <EmployeeFormSection title="群内共享知识" actions={actions}><div className="field full"><p className="field-hint">只有明确共享的资料才可用于这个群的任务。员工私聊不会自动加入群上下文。</p><ResourcePicker resources={snapshot.resources.filter(item => item.kind === 'knowledge' && !item.ownerAgentId)} selected={knowledge} onChange={setKnowledge} empty="还没有可共享的知识资料。" /></div></EmployeeFormSection>}</>
}
