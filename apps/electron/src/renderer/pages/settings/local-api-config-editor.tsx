/*
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [INPUT]: 扫描所得无密钥 API 元数据、已有导入状态、共用兼容接口表单布局与 DesktopApi。
 * [OUTPUT]: Codex/Claude 扫描 API 配置使用统一横向字段/服务分组/卡片操作栏；缺失模型补填、宿主读取凭据的未保存测试和显式导入；已导入项仍可查看/测试，不重复创建连接。
 * [POS]: 添加模型连接第二步内嵌的 API 详情，共用父级 Dialog；返回到同一步的扫描列表。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { MODEL_ID_MAX_LENGTH } from '@boai/shared/domain/model-id'
import { useContext, useEffect, useId, useRef, useState } from 'react'
import type { DetectedApiKeyConfig, LocalConfigIssue } from '@boai/shared/domain/local-configs'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, GuardContext, useDirty, useMutation } from '@/components/common'
import { ArrowLeft, Check, Cpu, FolderOpen, Key, LoaderCircle, Sparkles, Terminal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldTitle } from '@/components/ui/field'
import { ConnectionForm, ConnectionSettingRow } from './connection-layout'

const issues: Record<LocalConfigIssue, string> = {
  'missing-api-key': '未找到 API Key，请先完善源配置。',
  'missing-model': '请补填默认模型 ID。',
  'invalid-base-url': '接口地址无效，请先修正源配置。',
  'unsupported-config': '包含暂不支持的协议或认证配置，请在模型连接中手动添加。',
  'invalid-config': '无法解析配置文件，请先修正源配置。',
}

export function LocalApiConfigEditor({ api, config, imported, onBack, onSaved, onWorking }: {
  api: DesktopApi; config: DetectedApiKeyConfig; imported: boolean; onBack(): void; onSaved(): Promise<void>; onWorking(busy: boolean): void
}) {
  const [model, setModel] = useState(config.model ?? '')
  const [feedback, setFeedback] = useState('')
  const [operation, setOperation] = useState<'test' | 'save' | null>(null)
  const { busy, error, run, setError } = useMutation(), guard = useContext(GuardContext)
  const editor = useRef<HTMLFormElement>(null), fieldId = useId()
  const usable = (config.usable || config.issue === 'missing-model') && !!model.trim()
  useDirty(model)
  useEffect(() => { onWorking(busy); return () => onWorking(false) }, [busy, onWorking])
  const submit = (operation: 'test' | 'save') => {
    if (busy || !usable || (operation === 'save' && imported) || !editor.current?.reportValidity()) return
    void run(async () => {
      setOperation(operation); setFeedback('')
      try {
        const input = { configId: config.configId, ...(!config.model ? { model: model.trim() } : {}) }
        if (operation === 'test') { await api.request('testLocalConnection', input); setFeedback('连接测试成功') }
        else { await api.request('importLocalConnection', input); await onSaved() }
      } finally { setOperation(null) }
    })
  }
  return <ConnectionForm ref={editor} disabled={busy} onSubmit={event => { event.preventDefault(); submit('save') }} footer={<>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => guard.navigate(onBack, { resetOnDiscard: false })}><ArrowLeft />返回</Button>
      <div className="connection-editor-actions">
        {feedback && <p className="connection-feedback connection-inline-feedback" data-status="success" role="status"><Check /><span>{feedback}</span></p>}
        <Button type="button" variant="outline" className="relative" disabled={busy || !usable} aria-label="测试" aria-busy={operation === 'test'} onClick={() => submit('test')}><span className={operation === 'test' ? 'invisible' : undefined}>测试</span>{operation === 'test' && <span className="absolute inset-0 flex items-center justify-center"><LoaderCircle className="spinner" /></span>}</Button>
        <Button type="submit" disabled={busy || !usable || imported}>{operation === 'save' && <LoaderCircle className="spinner" />}{imported ? '已导入' : '保存连接'}</Button>
      </div>
    </>}>
    {error && <Banner>{error}</Banner>}
    {config.issue && <Banner kind="notice">{issues[config.issue]}</Banner>}
    <ConnectionSettingRow label="配置类型" htmlFor={`${fieldId}-kind`} icon={<Terminal />}><Input id={`${fieldId}-kind`} readOnly value={`模型 API 连接${imported ? ' · 已导入' : ''}`} /></ConnectionSettingRow>
    <div className="connection-provider-group">
      <div className="connection-group-heading"><FieldTitle><Sparkles />服务商</FieldTitle></div>
      <Field orientation="horizontal" className="connection-setting-row connection-url-row grid"><FieldLabel htmlFor={`${fieldId}-provider`}><span className="connection-nested-line" aria-hidden="true" />名称</FieldLabel><Input id={`${fieldId}-provider`} readOnly value={config.providerName} /></Field>
      <Field orientation="horizontal" className="connection-setting-row connection-url-row grid"><FieldLabel htmlFor={`${fieldId}-url`}><span className="connection-nested-line" aria-hidden="true" />Base URL</FieldLabel><Input id={`${fieldId}-url`} aria-label="接口地址 Base URL" readOnly value={config.baseUrl ?? ''} placeholder="尚未配置" /></Field>
    </div>
    <ConnectionSettingRow label="API Key" htmlFor={`${fieldId}-key`} icon={<Key />}><Input id={`${fieldId}-key`} readOnly value={config.hasApiKey ? '已在本机配置中找到' : '未找到'} /></ConnectionSettingRow>
    <ConnectionSettingRow label="默认模型 ID" htmlFor={`${fieldId}-model`} icon={<Cpu />}><Input id={`${fieldId}-model`} autoFocus={!config.model} required maxLength={MODEL_ID_MAX_LENGTH} readOnly={!!config.model} value={model} placeholder="填写服务支持的模型 ID" onChange={event => { setFeedback(''); setError(''); setModel(event.target.value) }} /></ConnectionSettingRow>
    <ConnectionSettingRow label="接口协议" htmlFor={`${fieldId}-protocol`}><Input id={`${fieldId}-protocol`} readOnly value={config.api === 'anthropic-messages' ? 'Anthropic Messages' : config.api === 'openai-responses' ? 'Responses' : 'Chat Completions'} /></ConnectionSettingRow>
    <ConnectionSettingRow label="配置文件" htmlFor={`${fieldId}-source`} icon={<FolderOpen />}><Input id={`${fieldId}-source`} readOnly value={config.sourcePath ?? '本机配置'} title={config.sourcePath} /></ConnectionSettingRow>
    {imported && <p className="connection-model-message py-3">已导入的连接可在「我的连接」中编辑。</p>}
  </ConnectionForm>
}
