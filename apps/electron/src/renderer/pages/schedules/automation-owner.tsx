/*
 * [INPUT]: 计划归属、固定群分工与当前员工/BOAI群快照。
 * [OUTPUT]: 共用归属名称、明确归属选择和成员依赖编辑；宿主再次核验资格和无环依赖。
 * [POS]: 自动化编辑和总览的共享领域投影。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AutomationCollaboration, AutomationOwner, Snapshot } from '@boai/shared/domain'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { Field } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'

export function automationOwnerKey(owner?: AutomationOwner) { return owner ? owner.kind === 'employee' ? `employee:${owner.employeeId}` : `group:${owner.conversationId}` : '' }
export function automationOwnerLabel(owner: AutomationOwner | undefined, snapshot: Snapshot) {
  if (!owner) return '待确认归属'
  return owner.kind === 'employee' ? snapshot.agents.find(a => a.id === owner.employeeId)?.name ?? '员工已不可用' : snapshot.conversations.find(c => c.id === owner.conversationId)?.title ?? '群聊已不可用'
}
export function AutomationOwnerFields({ snapshot, owner, collaboration, locked, eligible, onChange }: {
  snapshot: Snapshot; owner?: AutomationOwner; collaboration?: AutomationCollaboration; locked?: boolean; eligible(id: string): boolean
  onChange(owner: AutomationOwner | undefined, collaboration?: AutomationCollaboration): void
}) {
  const employees = snapshot.agents.filter(a => !isCoreAgent(a))
  const groups = snapshot.conversations.filter(c => c.kind === 'group' && !c.channel && !c.mergedInto && (!c.purpose || c.purpose === 'personal'))
  const members = owner?.kind === 'group' ? snapshot.conversations.find(c => c.id === owner.conversationId)?.agentIds ?? [] : []
  const assignments = collaboration?.assignments ?? []
  const updateMembers = (ids: string[]) => {
    const coordinatorId = ids.includes(collaboration?.coordinatorId ?? '') ? collaboration!.coordinatorId : ids[0] ?? ''
    onChange(owner, { coordinatorId, assignments: ids.map(employeeId => {
      const prior = assignments.find(a => a.employeeId === employeeId)
      return { employeeId, instruction: prior?.instruction ?? '', deliverable: prior?.deliverable ?? '', dependsOn: employeeId === coordinatorId ? ids.filter(id => id !== employeeId) : prior?.dependsOn.filter(id => ids.includes(id) && id !== coordinatorId) ?? [] }
    }) })
  }
  return <section aria-label="自动化归属与分工" className="form-grid">
    <Field label="归属" full>{locked ? <p>{automationOwnerLabel(owner, snapshot)}</p> : <SelectField aria-label="自动化归属" value={automationOwnerKey(owner)} options={[{ value: '', label: '选择员工或群聊' }, ...employees.map(a => ({ value: `employee:${a.id}`, label: `员工 · ${a.name}`, disabled: !eligible(a.id) })), ...groups.map(c => ({ value: `group:${c.id}`, label: `群聊 · ${c.title}`, disabled: c.agentIds.filter(eligible).length < 2 }))]} onValueChange={value => {
      const [kind, ...parts] = value.split(':'); const id = parts.join(':')
      onChange(kind === 'employee' ? { kind, employeeId: id } : kind === 'group' ? { kind, conversationId: id } : undefined)
    }} />}</Field>
    {owner?.kind === 'group' && <>
      <fieldset className="full"><legend>参与员工（至少两名）</legend><div className="button-row">{members.map(id => <label className="flex items-center gap-2" key={id}><Checkbox checked={assignments.some(a => a.employeeId === id)} disabled={!eligible(id)} onCheckedChange={checked => updateMembers(checked ? [...assignments.map(a => a.employeeId), id] : assignments.map(a => a.employeeId).filter(value => value !== id))} /><span>{snapshot.agents.find(a => a.id === id)?.name ?? '员工不可用'}</span></label>)}</div></fieldset>
      <Field label="汇总负责人" full><SelectField value={collaboration?.coordinatorId ?? ''} options={[{ value: '', label: '选择负责人' }, ...assignments.map(a => ({ value: a.employeeId, label: snapshot.agents.find(e => e.id === a.employeeId)?.name ?? '员工不可用' }))]} onValueChange={coordinatorId => onChange(owner, { coordinatorId, assignments: assignments.map(a => ({ ...a, dependsOn: a.employeeId === coordinatorId ? assignments.filter(other => other.employeeId !== coordinatorId).map(other => other.employeeId) : a.employeeId === collaboration?.coordinatorId ? [] : a.dependsOn.filter(id => id !== coordinatorId) })) })} /></Field>
      {assignments.map(assignment => <fieldset key={assignment.employeeId} className="full form-grid"><legend>{snapshot.agents.find(a => a.id === assignment.employeeId)?.name ?? '员工不可用'}</legend>
        <Field label="工作内容" full><Textarea required maxLength={2000} value={assignment.instruction} onChange={event => onChange(owner, { ...collaboration!, assignments: assignments.map(a => a === assignment ? { ...a, instruction: event.target.value } : a) })} /></Field>
        <Field label="交付要求" full><Textarea required maxLength={2000} value={assignment.deliverable} onChange={event => onChange(owner, { ...collaboration!, assignments: assignments.map(a => a === assignment ? { ...a, deliverable: event.target.value } : a) })} /></Field>
        <fieldset className="full"><legend>等待以下员工的本次结果</legend><div className="button-row">{assignments.filter(a => a.employeeId !== assignment.employeeId).map(other => <label className="flex items-center gap-2" key={other.employeeId}><Checkbox checked={assignment.dependsOn.includes(other.employeeId)} onCheckedChange={checked => onChange(owner, { ...collaboration!, assignments: assignments.map(a => a === assignment ? { ...a, dependsOn: checked ? [...a.dependsOn, other.employeeId] : a.dependsOn.filter(id => id !== other.employeeId) } : a) })} /><span>{snapshot.agents.find(a => a.id === other.employeeId)?.name ?? '员工不可用'}</span></label>)}</div></fieldset>
      </fieldset>)}
      <p className="field-hint full">采集员工可并行执行；汇总负责人等待所需结果。保存时检查依赖，执行失败会保留在本次记录中。</p>
    </>}
  </section>
}
