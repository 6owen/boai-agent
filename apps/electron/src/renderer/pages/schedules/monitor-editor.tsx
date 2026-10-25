/*
 * [INPUT]: 当前监控规则、聊天来源身份与编辑回调。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；明确文件名、字段比较、新鲜度和冷却设置；展示来源数据格式，不执行数据检查。
 * [POS]: 自动化编辑器的监控配置部分，草稿由父表单持有。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationMonitorPolicy } from '@boai/shared/domain'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'

export const newMonitorPolicy = (conversationId = ''): AutomationMonitorPolicy => ({ comparator: 'json-fields-v1', source: { kind: 'conversation-artifact', conversationId, name: 'metrics.json' }, maxAgeSeconds: 86400, cooldownSeconds: 3600, rules: [{ pointer: '/count', mode: 'changed' }] })
export function validMonitorPolicy(p?: AutomationMonitorPolicy) {
  return !!p && /^[^\\/:\0]+\.json$/i.test(p.source.name.trim()) && !!p.source.conversationId && Number.isInteger(p.maxAgeSeconds) && p.maxAgeSeconds >= 1 && p.maxAgeSeconds <= 604800 && Number.isInteger(p.cooldownSeconds) && p.cooldownSeconds >= 0 && p.cooldownSeconds <= 604800 && p.rules.length > 0 && p.rules.length <= 32 && new Set(p.rules.map(r => r.pointer)).size === p.rules.length && p.rules.every(r => (r.pointer === '' || r.pointer.startsWith('/') && !/~(?![01])/.test(r.pointer)) && (r.mode === 'changed' || Number.isFinite(r.threshold) && r.threshold > 0))
}
export function MonitorEditor({ policy: p, onChange }: { policy: AutomationMonitorPolicy; onChange(value: AutomationMonitorPolicy): void }) {
  const rule = (index: number, value: AutomationMonitorPolicy['rules'][number]) => onChange({ ...p, rules: p.rules.map((r, i) => i === index ? value : r) })
  return <>
    <h4 className="full">监控规则</h4>
    <Field label="已发布的 JSON 文件名" full hint="读取目标聊天中同名文件的最新发布版本。文件必须先由任务发布到该聊天。"><Input required maxLength={200} value={p.source.name} onChange={e => onChange({ ...p, source: { ...p.source, name: e.target.value } })} /></Field>
    {p.rules.map((r, index) => <div className="full form-grid" key={index}>
      <Field label={`比较字段 ${index + 1}`} full hint="相对于 data，例如 /count 或 /items/0/price；留空比较整个 data。"><Input maxLength={1000} value={r.pointer} onChange={e => rule(index, { ...r, pointer: e.target.value })} /></Field>
      <Field label={`变化条件 ${index + 1}`}><SelectField value={r.mode} onValueChange={selectedValue => rule(index, selectedValue === 'changed' ? { pointer: r.pointer, mode: 'changed' } : { pointer: r.pointer, mode: 'numeric_delta', threshold: 1 })} options={[{ value: 'changed', label: '内容发生变化' }, { value: 'numeric_delta', label: '数值累计变化达到阈值' }]} /></Field>
      {r.mode === 'numeric_delta' && <Field label={`变化阈值 ${index + 1}`} hint="与基线或上次重要结果相比的绝对差值，增加和减少均计入。"><Input type="number" step="any" min="0" required value={Number.isFinite(r.threshold) ? r.threshold : ''} onChange={e => rule(index, { ...r, threshold: e.target.valueAsNumber })} /></Field>}
      {p.rules.length > 1 && <Button type="button" variant="ghost" onClick={() => onChange({ ...p, rules: p.rules.filter((_, i) => i !== index) })}>移除字段 {index + 1}</Button>}
    </div>)}
    <div className="full"><Button type="button" variant="secondary" disabled={p.rules.length >= 32} onClick={() => onChange({ ...p, rules: [...p.rules, { pointer: '', mode: 'changed' }] })}>添加比较字段</Button></div>
    <Field label="数据最长有效时间（秒）" hint="依据文件声明的实际观测时间；过期或缺失数据会进入待处理。"><Input type="number" min={1} max={604800} required value={p.maxAgeSeconds || ''} onChange={e => onChange({ ...p, maxAgeSeconds: e.target.valueAsNumber })} /></Field>
    <Field label="重要变化提醒间隔（秒）" hint="0 为不冷却。间隔内的变化保留到下次检查；仍达到阈值才提醒。"><Input type="number" min={0} max={604800} required value={Number.isFinite(p.cooldownSeconds) ? p.cooldownSeconds : ''} onChange={e => onChange({ ...p, cooldownSeconds: e.target.valueAsNumber })} /></Field>
    <p className="field-hint full">首次有效检查建立基线；来源或规则改变后重新建立。默认无变化不提醒；选择“每次运行结束”时，每次检查结果都会提醒。</p>
    <details className="full"><summary>来源文件格式</summary><p className="field-hint">JSON 顶层需要 schemaVersion: 1、observedAt（真实采集时刻，UTC ISO 格式）、complete: true 和 data。比较字段从 data 内选择；不完整、过期或时间倒退时保留上次成功检查点。此检查不获取外部数据，不调用模型。</p><pre className="automation-result-text">{'{\n  "schemaVersion": 1,\n  "observedAt": "实际采集时刻，例如 2026-09-29T01:00:00Z",\n  "complete": true,\n  "data": { "count": 100 }\n}'}</pre></details>
  </>
}
