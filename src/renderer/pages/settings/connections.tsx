/*
 * [INPUT]: 模型连接领域类型、DesktopApi、模型目录选择控件、步骤 SVG 插画、Lobe Icons 本地品牌 SVG、未保存守卫、统一 UI/离线图标及 soft-card/共享分割线皮肤。
 * [OUTPUT]: 本地 Agent 扫描导入/管理及会话测试入口与保留 OpenAI 接口协议的编辑、与外观共用文档布局、无页面副标题/数量提示、测试状态紧跟标题同行显示的连接列表；带服务品牌标志的无副标题两步配置弹窗、步骤箭头及等宽纯图标测试加载；编辑时回填真实密钥并支持显隐与清空、兼容接口固定服务分组、模型选择/手动编辑、测试左侧同行反馈与旧宿主重启提示，保存位于最右侧；放弃草稿仅关闭弹窗并保留当前设置页。
 * [POS]: src/renderer/pages/settings/connections.tsx；模型连接设置的界面与交互。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useId, useRef, useState, type RefObject } from 'react'
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg'
import anthropicIcon from '@lobehub/icons-static-svg/icons/anthropic.svg'
import { LocalConnections } from './local-connections'
import { ExternalSettings } from './external'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field as UiField, FieldLabel, FieldTitle } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Eye, EyeOff, InfoIcon, Key, LoaderCircle, MoreHorizontal, Pencil, Plus, ShieldCheck, Sparkles, Trash2, X } from '@/components/icons/index'
import type { Connection, ConnectionInput, Provider } from '@shared/domain'
import { unsupportedRequestMessage, type DesktopApi } from '@shared/ipc'
import { Banner, connectionReady, errorText, Field, GuardContext, useDirty, useMutation } from '@/components/common/index'
import { ConnectionModelPicker } from './connection-model-picker'
import { ConnectionIllustration } from './connection-illustration'

const providers = {
  openai: { label: 'OpenAI', description: '使用 OpenAI API Key 连接官方模型。', icon: openaiIcon },
  anthropic: { label: 'Anthropic', description: '使用 Anthropic API Key 连接 Claude。', icon: anthropicIcon },
  'openai-compatible': { label: 'OpenAI 兼容接口', description: '连接第三方模型服务或本地部署的模型。', icon: openaiIcon },
} satisfies Record<Provider, { label: string; description: string; icon: string }>

function ProviderIcon({ provider }: { provider: Provider }) {
  return <span className="connection-provider-icon" aria-hidden="true"><span className="connection-brand-icon" style={{ maskImage: `url("${providers[provider].icon}")` }} /></span>
}

type ConnectionFeedback = { status: 'testing' | 'success' | 'error'; message: string }

export function ConnectionSettings({ connections, api, refresh }: { connections: Connection[]; api: DesktopApi; refresh: () => Promise<void> }) {
  const [externalRevision, setExternalRevision] = useState(0)
  const [editing, setEditing] = useState<{ connection: Connection; apiKey: string } | 'new' | null>(null)
  const [feedback, setFeedback] = useState<Record<string, ConnectionFeedback | undefined>>({})
  const { busy, error, run } = useMutation()
  const addButton = useRef<HTMLButtonElement>(null)

  const editConnection = (connection: Connection) => void run(async () => {
    const apiKey = await api.request('getConnectionApiKey', { id: connection.id })
    setEditing({ connection, apiKey })
  })

  const testConnection = (connection: Connection) => void run(async () => {
    setFeedback(current => ({ ...current, [connection.id]: { status: 'testing', message: '正在测试连接…' } }))
    try {
      await api.request('testConnection', { id: connection.id })
      setFeedback(current => ({ ...current, [connection.id]: { status: 'success', message: '连接测试成功' } }))
    } catch (cause) {
      setFeedback(current => ({ ...current, [connection.id]: { status: 'error', message: errorText(cause) } }))
    }
  })

  return <section className="connection-settings settings-document" aria-labelledby="connections-heading">
    <header className="settings-document-heading"><h2 id="connections-heading">模型连接</h2></header>
    {error && <Banner>{error}</Banner>}
    <h3 className="settings-section-title">我的连接</h3>
    <Card className="connection-rows soft-divide-y gap-0 p-0">
      {connections.length ? connections.map(connection => {
        const result = feedback[connection.id]
        return <div className="connection-row" key={connection.id}>
          <ProviderIcon provider={connection.provider} />
          <div className="connection-row-body">
            <div className="connection-row-title">
              <strong title={connection.name}>{connection.name}</strong><span className="connection-state" data-ready={connectionReady(connection)}>{connectionReady(connection) ? '已配置' : '待完善'}</span>
              {result && <p className="connection-feedback connection-inline-feedback" title={result.message} data-status={result.status} role={result.status === 'error' ? 'alert' : 'status'}>{result.status === 'testing' ? <LoaderCircle className="spinner" size={13} /> : result.status === 'success' ? <Check size={13} /> : null}<span>{result.message}</span></p>}
            </div>
            <p className="connection-row-description">{providers[connection.provider].label}<span aria-hidden="true"> · </span>{connection.defaultModel}</p>
            {connection.baseUrl && <p className="connection-endpoint" title={connection.baseUrl}>{connection.baseUrl}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy} aria-label={`管理 ${connection.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => requestAnimationFrame(() => editConnection(connection))}><Pencil />编辑连接</DropdownMenuItem>
              <DropdownMenuItem onClick={() => testConnection(connection)}><Check />测试连接</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => { void run(async () => { await api.request('deleteConnection', { id: connection.id }); await refresh() }) }}><Trash2 />删除连接</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }) : <div className="connections-empty"><span className="connection-empty-icon"><Sparkles size={26} /></span><h3>连接你的第一个模型</h3><p>选择模型服务，填写连接信息，即可开始与员工协作。</p></div>}
    </Card>
    <div className="connection-add flex flex-wrap gap-2"><Button ref={addButton} variant="secondary" disabled={busy} onClick={() => setEditing('new')}><Plus />添加连接</Button><LocalConnections connections={connections} api={api} refresh={refresh} onAgentImported={() => setExternalRevision(value => value + 1)} /></div>
    <p className="connection-footnote"><ShieldCheck size={14} />密钥保存在本机，不会显示在聊天消息中。</p>
    <p className="connection-test-hint">可在连接菜单中测试可用性，测试会发送一条简短模型请求。</p>
    <ExternalSettings api={api} embedded refreshVersion={externalRevision} />
    {editing && <ConnectionEditor key={editing === 'new' ? 'new' : editing.connection.id} connection={editing === 'new' ? undefined : editing.connection} initialApiKey={editing === 'new' ? '' : editing.apiKey} api={api} onSaved={async () => {
      if (editing !== 'new') setFeedback(current => ({ ...current, [editing.connection.id]: undefined }))
      await refresh()
    }} onCancel={() => setEditing(null)} finalFocus={addButton} />}
  </section>
}

function ConnectionEditor({ connection, initialApiKey, api, onSaved, onCancel, finalFocus }: { connection?: Connection; initialApiKey: string; api: DesktopApi; onSaved: () => Promise<void>; onCancel: () => void; finalFocus: RefObject<HTMLButtonElement | null> }) {
  const [form, setForm] = useState<ConnectionInput>({ id: connection?.id, name: connection?.name ?? '', provider: connection?.provider ?? 'openai', baseUrl: connection?.baseUrl ?? '', defaultModel: connection?.defaultModel ?? '', apiKey: initialApiKey, api: connection?.api })
  const [choosing, setChoosing] = useState(!connection)
  const [showKey, setShowKey] = useState(false)
  const [customEndpointOpen, setCustomEndpointOpen] = useState(Boolean(connection?.baseUrl))
  const [testFeedback, setTestFeedback] = useState<ConnectionFeedback | null>(null)
  const { busy, error, run, setError } = useMutation()
  const guard = useContext(GuardContext)
  const editor = useRef<HTMLFormElement>(null), testInFlight = useRef(false)
  const fieldId = useId(), keyId = `${fieldId}-key`, nameInput = useRef<HTMLInputElement>(null)
  const compatible = form.provider === 'openai-compatible'
  const testing = testFeedback?.status === 'testing', working = busy || testing
  useDirty(form)
  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => { setTestFeedback(null); setForm(current => ({ ...current, [key]: value })) }
  const testDraft = async () => {
    if (busy || testInFlight.current || !editor.current?.reportValidity()) return
    testInFlight.current = true
    setError('')
    setTestFeedback({ status: 'testing', message: '正在测试连接…' })
    try {
      await api.request('testConnectionDraft', { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), defaultModel: form.defaultModel.trim(), apiKey: form.apiKey?.trim() })
      setTestFeedback({ status: 'success', message: '连接测试成功' })
    } catch (cause) {
      const message = errorText(cause)
      setTestFeedback({ status: 'error', message: message === '无效请求。' ? unsupportedRequestMessage : message })
    } finally { testInFlight.current = false }
  }
  const close = () => {
    if (working) return
    // Return to the form so “save and leave” can validate and focus its fields.
    if (guard.dirty) setChoosing(false)
    guard.navigate(onCancel, { resetOnDiscard: false })
  }
  const selectProvider = (provider: Provider) => {
    setForm(current => ({ ...current, provider, name: !current.name || current.name === providers[current.provider].label ? providers[provider].label : current.name }))
    setError('')
    setTestFeedback(null)
    setCustomEndpointOpen(Boolean(form.baseUrl))
    setChoosing(false)
  }
  const baseUrlField = <Field label="接口地址 Base URL" hint={form.provider === 'openai-compatible' ? '填写服务提供的完整 API 根地址。' : '使用官方服务时留空；也可填写自定义 API 根地址。'}><Input type="url" required={form.provider === 'openai-compatible'} value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)} placeholder={form.provider === 'openai-compatible' ? 'https://your-provider.example/v1' : '使用官方默认地址'} /></Field>

  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="connection-dialog" style={{ display: 'block', width: compatible && !choosing ? 620 : 520, maxWidth: 'calc(100vw - 32px)', padding: 'var(--connection-dialog-padding)' }} showCloseButton={false} finalFocus={finalFocus} initialFocus={connection ? nameInput : undefined}>
      <div className="connection-dialog-top"><span>{connection ? '编辑连接' : '添加模型连接'}</span><Button variant="ghost" size="icon-sm" aria-label="关闭模型连接配置" disabled={working} onClick={close}><X /></Button></div>
      <div className="connection-dialog-intro">
        <ConnectionIllustration configuring={!choosing} />
        <DialogTitle>{choosing ? '选择模型服务' : `连接 ${providers[form.provider].label}`}</DialogTitle>
      </div>
      {!connection && <ol className="connection-steps" aria-label="添加连接进度"><li aria-current={choosing ? 'step' : undefined}><span>{choosing ? '1' : <Check size={12} />}</span>选择服务<ArrowRight className="connection-step-arrow" size={14} /></li><li aria-current={!choosing ? 'step' : undefined}><span>2</span>配置连接</li></ol>}
      {choosing ? <div className="connection-provider-options">
        {(Object.entries(providers) as [Provider, typeof providers[Provider]][]).map(([provider, details]) => <Button key={provider} variant="surface" size="content" className="connection-provider-option" onClick={() => selectProvider(provider)}><ProviderIcon provider={provider} /><span><strong>{details.label}</strong><small>{details.description}</small></span><ChevronRight size={16} /></Button>)}
      </div> : <form ref={editor} data-edit-form className={`connection-editor${compatible ? ' soft-card bg-muted' : ''}`} data-compact={compatible} onSubmit={event => {
        event.preventDefault()
        if (testInFlight.current) return
        void run(async () => {
          await api.request('saveConnection', { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), defaultModel: form.defaultModel.trim(), apiKey: form.apiKey?.trim() })
          await onSaved()
          guard.saved(onCancel)
        })
      }}>
        <fieldset disabled={working} className={`connection-fields${compatible ? ' soft-divide-y' : ''}`}>
          {error && <Banner>{error}</Banner>}
          <UiField orientation={compatible ? 'horizontal' : 'vertical'} className={compatible ? 'connection-setting-row grid' : undefined}>
            <FieldLabel htmlFor={`${fieldId}-name`}>{compatible && <Pencil />}连接名称</FieldLabel>
            <Input id={`${fieldId}-name`} ref={nameInput} autoFocus required value={form.name} onChange={event => set('name', event.target.value)} placeholder="为这个连接起个名字" />
          </UiField>
          {compatible && <div className="connection-provider-group">
            <div className="connection-group-heading"><FieldTitle><Sparkles />服务商</FieldTitle></div>
            <UiField orientation="horizontal" className="connection-setting-row connection-url-row grid">
              <div className="connection-setting-label">
                <FieldLabel htmlFor={`${fieldId}-url`}><span className="connection-nested-line" aria-hidden="true" />Base URL</FieldLabel>
                <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="接口地址说明" />}><InfoIcon /></TooltipTrigger><TooltipContent>填写服务提供的完整 API 根地址，例如 https://api.openai.com/v1。</TooltipContent></Tooltip>
              </div>
              <Input id={`${fieldId}-url`} aria-label="接口地址 Base URL" type="url" required value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)} placeholder="https://api.openai.com/v1" />
            </UiField>
          </div>}
          <UiField orientation={compatible ? 'horizontal' : 'vertical'} className={compatible ? 'connection-setting-row grid' : undefined}>
            <FieldLabel htmlFor={keyId}>{compatible && <Key />}API Key</FieldLabel>
            <div className="connection-setting-control">
              <InputGroup><InputGroupInput id={keyId} type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={form.apiKey} onChange={event => set('apiKey', event.target.value)} placeholder="输入 API Key" /><InputGroupAddon align="inline-end" className="pr-2.5 has-[>button]:mr-0"><InputGroupButton size="icon-xs" className="connection-key-visibility" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} aria-pressed={showKey} onClick={() => setShowKey(current => !current)}>{showKey ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup>
            </div>
          </UiField>
          {compatible ? <ConnectionModelPicker api={api} draft={form} onChange={value => set('defaultModel', value)} /> : <Field label="默认模型 ID" hint="填写服务提供商支持的模型 ID。"><Input required value={form.defaultModel} onChange={event => set('defaultModel', event.target.value)} placeholder="输入模型 ID" /></Field>}
          {form.provider !== 'anthropic' && <UiField orientation={compatible ? 'horizontal' : 'vertical'} className={compatible ? 'connection-setting-row grid' : undefined}>
            <FieldLabel htmlFor={`${fieldId}-api`}>接口协议</FieldLabel>
            <NativeSelect id={`${fieldId}-api`} value={form.api ?? 'chat'} onChange={event => set('api', event.target.value as 'chat' | 'responses')}><NativeSelectOption value="chat">Chat Completions</NativeSelectOption><NativeSelectOption value="responses">Responses</NativeSelectOption></NativeSelect>
          </UiField>}
          {!compatible && <details className="connection-advanced" open={customEndpointOpen} onToggle={event => setCustomEndpointOpen(event.currentTarget.open)}><summary><ChevronRight size={14} />自定义接口地址<span>可选</span></summary>{baseUrlField}</details>}
        </fieldset>
        <footer className="connection-editor-footer soft-divider-top">
          <Button type="button" variant="ghost" disabled={working} onClick={() => { setShowKey(false); setTestFeedback(null); setChoosing(true) }}><ArrowLeft />更换服务</Button>
          <div className="connection-editor-actions">
            {testFeedback && <p className="connection-feedback connection-draft-feedback connection-inline-feedback" title={testFeedback.message} data-status={testFeedback.status} role={testFeedback.status === 'error' ? 'alert' : 'status'}>{testing ? <LoaderCircle className="spinner" size={13} /> : testFeedback.status === 'success' ? <Check size={13} /> : null}<span>{testFeedback.message}</span></p>}
            <Button type="button" variant="outline" className="relative" aria-label="测试" aria-busy={testing} disabled={working} onClick={() => { void testDraft() }}><span className={testing ? 'invisible' : undefined}>测试</span>{testing && <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><LoaderCircle className="spinner" /></span>}</Button>
            <Button type="submit" disabled={working}>{busy && <LoaderCircle size={14} className="spinner" />}{busy ? '正在保存…' : '保存连接'}</Button>
          </div>
        </footer>
      </form>}
      {choosing && <p className="connection-wizard-note"><ShieldCheck size={14} />使用你自己的账号与密钥，连接信息仅保存在本机。</p>}
    </DialogContent>
  </Dialog>
}
