/*
 * [INPUT]: DesktopApi、当前连接草稿、默认模型与变更回调。
 * [OUTPUT]: 默认模型分组，等宽图标加载的目录按钮与左侧同行反馈、铅笔/列表图标切换编辑与旧宿主重启提示；使用当前密钥含显式空值，按地址/凭据隔离并丢弃过期请求。
 * [POS]: 模型连接弹窗的私有模型选择控件；模型列表仅保存在当前编辑会话。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Cpu, List, Pencil, RefreshCw } from '@/components/icons'
import { errorText } from '@/components/common'
import type { ConnectionInput } from '@shared/domain'
import { unsupportedRequestMessage, type DesktopApi } from '@shared/ipc'

type Catalog = { source: string; status: 'loading' | 'success' | 'error'; models: string[]; error?: string }

export function ConnectionModelPicker({ api, draft, onChange }: { api: DesktopApi; draft: ConnectionInput; onChange: (model: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [manual, setManual] = useState(false)
  const requestId = useRef(0)
  const id = useId()
  const source = JSON.stringify([draft.id, draft.baseUrl.trim(), draft.apiKey?.trim() || ''])
  const current = catalog?.source === source ? catalog : null
  const loading = current?.status === 'loading'
  const models = current?.models ?? []
  const feedback = current?.status === 'error' ? current.error : current?.status === 'success' ? (models.length ? `已获取 ${models.length} 个模型` : '该服务未返回可用模型，可点击铅笔手动填写模型 ID。') : undefined
  const options = [...new Set([...models, ...(draft.defaultModel ? [draft.defaultModel] : [])])]
  useEffect(() => () => { requestId.current++ }, [source])

  const loadModels = async () => {
    const request = ++requestId.current
    setCatalog({ source, status: 'loading', models })
    try {
      const result = await api.request('listConnectionModels', { id: draft.id, baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey?.trim() })
      if (request !== requestId.current) return
      setCatalog({ source, status: 'success', models: result })
      if (result.length) setManual(false)
    } catch (cause) {
      const message = errorText(cause)
      if (request === requestId.current) setCatalog({ source, status: 'error', models, error: message === '无效请求。' ? unsupportedRequestMessage : message })
    }
  }

  return <div className="connection-model-picker">
    <div className="connection-group-heading">
      <FieldTitle><Cpu />默认模型</FieldTitle>
      <div className="connection-model-actions">
        {feedback && <p className="connection-model-message connection-inline-feedback" title={feedback} data-error={current?.status === 'error' || undefined} role={current?.status === 'error' ? 'alert' : 'status'}><span>{feedback}</span></p>}
        <ButtonGroup aria-label="模型列表操作">
          <Button type="button" variant="outline" size="sm" aria-busy={loading} disabled={loading || !draft.baseUrl.trim()} onClick={() => { void loadModels() }}><RefreshCw className={loading ? 'spinner' : undefined} />获取模型列表</Button>
          <ButtonGroupSeparator />
          <Button type="button" variant="outline" size="icon-sm" aria-label={manual ? '从列表选择' : '手动编辑模型'} title={manual ? '从列表选择' : '手动编辑模型'} aria-pressed={manual} disabled={loading} onClick={() => setManual(current => !current)}>{manual ? <List /> : <Pencil />}</Button>
        </ButtonGroup>
      </div>
    </div>
    <Field orientation="horizontal" className="connection-setting-row connection-model-row grid">
      <FieldLabel htmlFor={id}><span className="connection-nested-line" aria-hidden="true" />模型 ID</FieldLabel>
      <div className="connection-setting-control">
        {manual ? <Input id={id} aria-label="默认模型 ID" aria-describedby={`${id}-hint`} autoFocus required value={draft.defaultModel} onChange={event => onChange(event.target.value)} placeholder="输入模型 ID" /> : <NativeSelect className="w-full" id={id} aria-label="默认模型" aria-describedby={`${id}-hint`} required value={draft.defaultModel} onChange={event => onChange(event.target.value)}>
          <NativeSelectOption value="" disabled>{options.length ? '请选择默认模型' : '获取列表后选择，或手动填写'}</NativeSelectOption>
          {options.map(model => <NativeSelectOption key={model} value={model}>{model}</NativeSelectOption>)}
        </NativeSelect>}
        <FieldDescription id={`${id}-hint`} className="sr-only">使用当前接口地址和密钥获取模型；点击铅笔可手动编辑模型 ID。</FieldDescription>
      </div>
    </Field>
  </div>
}
