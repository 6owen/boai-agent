import { useContext, useState } from 'react'
import { LoaderCircle } from '@/components/icons/index'
import type { Connection, ConnectionInput, DesktopApi, Provider } from '@shared/contracts'
import { Banner, Field, GuardContext, useDirty, useMutation } from '@/components/common/index'
export function ConnectionEditor({ connection, api, onSaved, onCancel }: { connection?: Connection; api: DesktopApi; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<ConnectionInput>({ id: connection?.id, name: connection?.name ?? '', provider: connection?.provider ?? 'openai', baseUrl: connection?.baseUrl ?? '', defaultModel: connection?.defaultModel ?? '', apiKey: '' })
  const { busy, error, run } = useMutation()
  const guard = useContext(GuardContext)
  useDirty(form)
  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => setForm(current => ({ ...current, [key]: value }))
  return <form data-edit-form className="form-grid connection-editor" onSubmit={event => { event.preventDefault(); void run(async () => { await api.request('saveConnection', { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), defaultModel: form.defaultModel.trim(), apiKey: form.apiKey?.trim() || undefined }); await onSaved(); guard.saved(onCancel) }) }}>
    {error && <div className="full"><Banner>{error}</Banner></div>}
    <Field label="连接名称"><input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="我的模型连接" /></Field>
    <Field label="服务类型"><select value={form.provider} onChange={e => set('provider', e.target.value as Provider)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="openai-compatible">OpenAI 兼容接口</option></select></Field>
    <Field label="接口地址 Base URL" full hint="官方服务通常可留空；兼容服务填写完整 API 根地址。"><input type="url" required={form.provider === 'openai-compatible'} value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder={form.provider === 'openai-compatible' ? 'https://your-provider.example/v1' : '使用官方默认地址'} /></Field>
    <Field label="默认模型 ID" full hint="填写服务支持的模型 ID；模型列表由你的服务提供商决定。"><input required value={form.defaultModel} onChange={e => set('defaultModel', e.target.value)} placeholder="填写模型 ID" /></Field>
    <Field label="API Key" full hint={connection?.hasApiKey ? '已安全保存。留空保留现有密钥。' : form.provider === 'openai-compatible' ? '允许空密钥的本地或兼容服务可留空；其他服务填写所需密钥。' : '密钥由桌面应用保存，不会显示在聊天消息中。'}><input type="password" autoComplete="off" value={form.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder={connection?.hasApiKey ? '留空保留现有密钥' : '输入 API Key'} /></Field>
    <div className="form-actions full"><button className="button subtle" type="button" onClick={() => guard.navigate(onCancel)}>取消</button><button className="button primary" disabled={busy}>{busy && <LoaderCircle size={14} className="spinner" />}保存连接</button></div>
  </form>
}

