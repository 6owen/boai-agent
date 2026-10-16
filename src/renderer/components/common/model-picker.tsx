/*
 * [OUTPUT]: 错误反馈统一Sonner，不渲染内联报错；现有动作和来源校验保持。
 * [OUTPUT]: 2026-10-10 共用API与已验证本机目录加载入口，来源/revision隔离；Codex默认模型选项及手动输入不自动改配置。
 * [INPUT]: DesktopApi、连接来源与受控模型值、列表能力及字段布局。
 * [OUTPUT]: 设置与员工配置共用模型目录获取/手动编辑；请求按连接来源隔离，选中模型不随目录自动改写，提示仅同行或占位显示。
 * [POS]: common 的模型选择控件，目录仅保存在当前编辑会话。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Cpu, List, Pencil, RefreshCw } from '@/components/icons'
import { ErrorToast } from './error-feedback'
import { errorText } from './index'
import type { ConnectionInput } from '@shared/domain'
import { unsupportedRequestMessage, type DesktopApi } from '@shared/ipc'

type Catalog = { source: string; status: 'loading' | 'success' | 'error'; models: string[]; error?: string }
type ModelDraft = Pick<ConnectionInput, 'id' | 'baseUrl' | 'apiKey' | 'defaultModel'>

export function ModelPicker({ api, draft, onChange, disabled = false, catalogAvailable = true, layout = 'field', placeholder = '输入模型 ID', fallbackModel = '', full = false, catalogSource, fetchModels, defaultOption }: {
  api: DesktopApi; draft: ModelDraft; onChange(model: string): void; disabled?: boolean; catalogAvailable?: boolean
  layout?: 'field' | 'connection'; placeholder?: string; fallbackModel?: string; full?: boolean
  catalogSource?: string; fetchModels?(): Promise<string[]>
  defaultOption?: string
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [manual, setManual] = useState(false)
  const requestId = useRef(0)
  const id = useId()
  const source = catalogSource ?? JSON.stringify([draft.id, draft.baseUrl.trim(), draft.apiKey?.trim() || ''])
  const canLoad = catalogAvailable && (!!fetchModels || !!draft.baseUrl.trim())
  const current = catalog?.source === source ? catalog : null
  const loading = current?.status === 'loading'
  const models = current?.models ?? []
  const feedback = current?.status === 'error' ? current.error : current?.status === 'success' ? (models.length ? `已获取 ${models.length} 个模型` : '该服务未返回可用模型，可点击铅笔手动填写模型 ID。') : undefined
  const options = [...new Set([...models, draft.defaultModel, fallbackModel].filter(Boolean))]
  useEffect(() => () => { requestId.current++ }, [source])

  const loadModels = async () => {
    if (disabled || loading || !canLoad) return
    const request = ++requestId.current
    setCatalog({ source, status: 'loading', models })
    try {
      const result = fetchModels ? await fetchModels() : await api.request('listConnectionModels', { id: draft.id, baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey?.trim() })
      if (request !== requestId.current) return
      setCatalog({ source, status: 'success', models: result })
      if (result.length) setManual(false)
    } catch (cause) {
      const message = errorText(cause)
      if (request === requestId.current) setCatalog({ source, status: 'error', models, error: message === '无效请求。' ? unsupportedRequestMessage : message })
    }
  }
  const actions = <div className="connection-model-actions">
    {current?.status === 'error' ? <ErrorToast>{feedback}</ErrorToast> : feedback && <p className="connection-model-message connection-inline-feedback" title={feedback} role="status"><span>{feedback}</span></p>}
    <ButtonGroup aria-label="模型列表操作">
      <Button type="button" variant="outline" size="sm" aria-busy={loading} disabled={disabled || loading || !canLoad} onClick={() => { void loadModels() }}><RefreshCw className={loading ? 'spinner' : undefined} />获取模型列表</Button>
      <ButtonGroupSeparator />
      <Button type="button" variant="outline" size="icon-sm" aria-label={manual ? '从列表选择' : '手动编辑模型'} title={manual ? '从列表选择' : '手动编辑模型'} aria-pressed={manual} disabled={disabled || loading} onClick={() => setManual(current => !current)}>{manual ? <List /> : <Pencil />}</Button>
    </ButtonGroup>
  </div>
  const control = manual
    ? <Input id={id} aria-label={layout === 'connection' ? '默认模型 ID' : '模型 ID'} aria-describedby={layout === 'connection' ? `${id}-hint` : undefined} autoFocus={manual} required={layout === 'connection'} disabled={disabled || loading} value={draft.defaultModel} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    : <SelectField id={id} aria-label={layout === 'connection' ? '默认模型' : '模型 ID'} aria-describedby={layout === 'connection' ? `${id}-hint` : undefined} required={layout === 'connection'} disabled={disabled || loading} value={draft.defaultModel || fallbackModel} onValueChange={onChange} placeholder={defaultOption || (options.length ? (layout === 'connection' ? '请选择默认模型' : '请选择模型') : '获取列表后选择，或手动填写')} options={[...(defaultOption ? [{ value: '', label: defaultOption }] : []), ...options.map(model => ({ value: model, label: model }))]} />
  if (layout === 'connection') return <div className="connection-model-picker">
    <div className="connection-group-heading"><FieldTitle><Cpu />默认模型</FieldTitle>{actions}</div>
    <Field orientation="horizontal" className="connection-setting-row connection-model-row grid">
      <FieldLabel htmlFor={id}><span className="connection-nested-line" aria-hidden="true" />模型 ID</FieldLabel>
      <div className="connection-setting-control">{control}<FieldDescription id={`${id}-hint`} className="sr-only">使用当前接口地址和密钥获取模型；点击铅笔可手动编辑模型 ID。</FieldDescription></div>
    </Field>
  </div>
  return <Field className={`connection-model-picker${full ? ' full' : ''}`}>
    <div className="model-picker-heading"><FieldLabel htmlFor={id}>模型 ID</FieldLabel>{actions}</div>
    {control}
  </Field>
}
