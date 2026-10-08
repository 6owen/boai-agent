/*
 * [OUTPUT]: 草稿生成明确仅使用模型API，具体连接名称与默认模型标签复用全局选择合同，不开放未接入的本机生成路径。
 * [INPUT]: 明确选择的模型连接、当前草稿身份/版本与草稿 IPC。
 * [OUTPUT]: 定时任务页内辅助输入、关键问题/不支持原因与可审阅候选；过期回填由编辑器拒绝。
 * [POS]: 精简编辑器的可选输入方式；不保存或开启计划。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import type { AutomationDraftResult } from '@shared/domain/automations'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Textarea } from '@/components/ui/textarea'
import { modelConnectionOptions } from '@/components/employee/agent-model-selection'

export function AutomationAssistant({ api, snapshot, draftId, timezone, getVersion, onCandidate, onClose }: {
  api: DesktopApi; snapshot: Snapshot; draftId: string; timezone: string; getVersion(): number
  onCandidate(result: AutomationDraftResult): boolean; onClose(): void
}) {
  const [instruction, setInstruction] = useState(''), [connectionId, setConnectionId] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const generation = useRef(0)
  const invalidate = () => { generation.current++; setBusy(false); setMessage('') }
  return <section className="automation-assistant" aria-label="让 Agent 帮我创建">
    <div className="button-row"><strong>让 Agent 帮我创建</strong><Button variant="ghost" size="sm" onClick={() => { invalidate(); onClose() }}>手动填写</Button></div>
    <p className="field-hint">告诉我什么时候、让谁做什么。生成后可以修改，点击创建才会开启。</p>
    <Field label="草稿助手的模型 API"><SelectField value={connectionId} onValueChange={value => { invalidate(); setConnectionId(value) }} options={[{ value: '', label: '选择用于生成草稿的连接' }, ...modelConnectionOptions(snapshot.connections.filter(c => c.defaultModel))]} /></Field>
    {!snapshot.connections.some(c => c.defaultModel) && <p className="field-hint">暂无可用模型连接，请先在设置中配置，或直接手动填写。</p>}
    <Field label="创建要求"><Textarea maxLength={10000} rows={3} value={instruction} onChange={e => { invalidate(); setInstruction(e.target.value) }} placeholder="让研究员在每个工作日早上九点整理项目进展，有结果提醒我。" /></Field>
    {message && <Banner kind="notice">{message}</Banner>}
    <Button variant="secondary" disabled={busy || !connectionId || !instruction.trim()} onClick={() => {
      const serial = ++generation.current, version = getVersion()
      setBusy(true); setMessage('')
      void api.request('generateAutomationDraft', { draftId, version, requestId: crypto.randomUUID(), connectionId, instruction, timezone }).then(result => {
        if (serial !== generation.current) return
        if (!onCandidate(result)) { setMessage('草稿已经修改，本次生成结果未覆盖你的内容。'); return }
        setMessage([...result.unsupported, ...result.questions, ...(!result.questions.length && !result.unsupported.length ? ['草稿已填入下方，请检查后点击创建。'] : []), result.usage?.totalTokens !== undefined ? `本次生成使用 ${result.usage.totalTokens} tokens。` : '本次生成用量已记录；未返回的用量保持未知。'].join('\n'))
      }).catch(error => { if (serial === generation.current) setMessage(`生成失败：${errorText(error)}。可以继续手动填写。`) }).finally(() => { if (serial === generation.current) setBusy(false) })
    }}>{busy ? '正在生成…' : '生成草稿'}</Button>
  </section>
}
