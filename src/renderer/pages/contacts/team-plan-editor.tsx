/*
 * [INPUT]: 本地可编辑团队方案、现有员工姓名和只读状态。
 * [OUTPUT]: 可聚焦方案标题、字段原生校验及重名错误关联；成员增删/排序/预设头像及用途/协作建议编辑，同名提示不合并身份。
 * [POS]: 团队创建表单的方案正文，不调用模型或创建对象。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { TeamEditable } from '@shared/domain/team-creation'
import { teamColors, TEAM_LIMITS } from '@shared/domain/team-creation'
import { avatarPresets } from '@shared/domain/avatars'
import { Banner, Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { useId, type Ref } from 'react'
type Plan = NonNullable<TeamEditable['plan']>
export function TeamPlanEditor({ plan, names, disabled, onChange, titleRef }: { plan: Plan; names: string[]; disabled: boolean; onChange(plan: Plan): void; titleRef?: Ref<HTMLLegendElement> }) {
  const errorPrefix = useId()
  const member = (index: number, patch: Partial<Plan['members'][number]>) => onChange({ ...plan, members: plan.members.map((value, i) => i === index ? { ...value, ...patch } : value) })
  return <fieldset className="full min-w-0 space-y-3" disabled={disabled}>
    <legend ref={titleRef} tabIndex={-1}>团队方案 · {plan.members.length} 位成员</legend>
    <Field label="团队名称"><Input required maxLength={80} value={plan.name} onChange={e => onChange({ ...plan, name: e.target.value })} /></Field>
    <Field label="团队目的"><Textarea required maxLength={1000} value={plan.purpose} onChange={e => onChange({ ...plan, purpose: e.target.value })} /></Field>
    {!!plan.assumptions.length && <div><strong>方案假设</strong><ul>{plan.assumptions.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
    {!!plan.capabilityNotes.length && <Banner kind="notice">能力说明：{plan.capabilityNotes.join('；')}</Banner>}
    {plan.members.map((value, index) => {
      const duplicate = !!value.name.trim() && plan.members.some((other, i) => i !== index && other.name.trim() === value.name.trim())
      const errorId = `${errorPrefix}-${index}`
      return <details key={value.memberKey ?? `new-${index}`} className="space-y-2 rounded-lg border p-3" open>
      <summary>{value.name || `成员 ${index + 1}`} · {value.role}</summary>
      <Field label={`成员 ${index + 1} 姓名`}><Input required maxLength={80} value={value.name} aria-invalid={duplicate || undefined} aria-describedby={duplicate ? errorId : undefined} ref={node => { node?.setCustomValidity(duplicate ? '本方案内成员姓名不能重复' : '') }} onChange={e => member(index, { name: e.target.value })} /></Field>
      {duplicate && <p id={errorId} className="muted">本方案内成员姓名不能重复</p>}
      {names.includes(value.name.trim()) && <p className="muted">已有同名员工；本次会创建独立身份。</p>}
      <Field label={`成员 ${index + 1} 职责`}><Input required maxLength={300} value={value.role} onChange={e => member(index, { role: e.target.value })} /></Field>
      <Field label={`成员 ${index + 1} 工作规则`}><Textarea required maxLength={2000} value={value.instructions} onChange={e => member(index, { instructions: e.target.value })} /></Field>
      <Field label={`成员 ${index + 1} 头像`}><SelectField disabled={disabled} value={value.avatarId} options={avatarPresets.map(preset => ({ value: preset.id, label: preset.name }))} onValueChange={id => member(index, { avatarId: id as typeof value.avatarId })} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!index} onClick={() => { const members = [...plan.members]; [members[index - 1], members[index]] = [members[index], members[index - 1]]; onChange({ ...plan, members }) }}>上移成员 {index + 1}</Button>
        <Button type="button" variant="outline" disabled={plan.members.length <= 1} onClick={() => onChange({ ...plan, members: plan.members.filter((_, i) => i !== index) })}>移除成员 {index + 1}</Button>
      </div>
    </details>})}
    <Button type="button" variant="outline" disabled={plan.members.length >= TEAM_LIMITS.members} onClick={() => onChange({ ...plan, members: [...plan.members, { name: `新成员 ${plan.members.length + 1}`, role: '请填写职责', instructions: '请填写工作规则与表达风格', avatarId: 'owl', color: teamColors[plan.members.length % teamColors.length] }] })}>增加成员</Button>
    <Field label="协作建议"><Textarea maxLength={2000} value={plan.collaborationGuide} onChange={e => onChange({ ...plan, collaborationGuide: e.target.value })} /></Field>
  </fieldset>
}
