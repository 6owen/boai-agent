/*
 * [INPUT]: 共用连接弹窗/横向表单布局、无独立弹窗的本机模型 API 导入内容、模型连接领域类型、DesktopApi、模型目录选择控件、步骤 SVG 插画、Lobe Icons 本地品牌 SVG、未保存守卫、统一 UI/离线图标及 soft-card/共享分割线皮肤。
 * [OUTPUT]: 选择服务的默认值作为草稿基准，真实修改在返回/关闭时确认，放弃后清除，保存后更新基准；本机 API 导入与兼容接口在同一 Dialog 内切换第二步，共用 620px 尺寸、标题/步骤和横向卡片布局；不卸载弹窗重开，扫描/详情的返回居左；与 ACP 扫描分开；OpenAI、Anthropic 和兼容接口统一使用兼容接口的二级布局，官方自定义地址改为同组横向行；本机 Agent 统一通过扫描/配置两步向导管理，无额外添加按钮或独立页面；移除连接测试说明文案；我的连接标题右侧添加入口、本机 Agent 标题右侧扫描入口与一致的列表布局；下拉字段统一使用 shadcn Select；本地 Agent 扫描导入/管理及会话测试入口与保留 OpenAI 接口协议的编辑、与外观共用文档布局、无页面副标题/数量提示、测试状态紧跟标题同行显示的连接列表；带服务品牌标志的无副标题两步配置弹窗、步骤箭头及等宽纯图标测试加载；编辑时回填真实密钥并支持显隐与清空、兼容接口固定服务分组、模型选择/手动编辑、测试左侧同行反馈与旧宿主重启提示，保存位于最右侧；放弃草稿仅关闭弹窗并保留当前设置页。
 * [POS]: src/renderer/pages/settings/connections.tsx；模型连接设置的界面与交互，按当前服务初始化草稿基准，返回/关闭前保护真实修改，放弃后清理草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useId, useRef, useState, type RefObject } from 'react'
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg'
import anthropicIcon from '@lobehub/icons-static-svg/icons/anthropic.svg'
import { LocalAgents } from './local-agents'
import { LocalModelImport } from './local-model-import'
import { SelectField } from '@/components/ui/select-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field as UiField, FieldLabel, FieldTitle } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowLeft, Check, ChevronRight, Cpu, Eye, EyeOff, FolderOpen, InfoIcon, Key, LoaderCircle, MoreHorizontal, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from '@/components/icons/index'
import type { Connection, ConnectionInput, Provider } from '@shared/domain'
import { unsupportedRequestMessage, type DesktopApi } from '@shared/ipc'
import { Banner, connectionReady, errorText, GuardContext, useDirty, useMutation } from '@/components/common/index'
import { ConnectionModelPicker } from './connection-model-picker'
import { ConnectionIllustration } from './connection-illustration'
import { ConnectionDialogLayout, ConnectionForm, ConnectionSettingRow } from './connection-layout'

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
    <div className="connection-section-heading"><h3 className="settings-section-title">我的连接</h3><Button ref={addButton} variant="secondary" disabled={busy} onClick={() => setEditing('new')}><Plus />添加连接</Button></div>
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
    <p className="connection-footnote"><ShieldCheck size={14} />密钥保存在本机，不会显示在聊天消息中。</p>
    <LocalAgents api={api} refresh={refresh} />
    {editing && <ConnectionEditor key={editing === 'new' ? 'new' : editing.connection.id} connections={connections} connection={editing === 'new' ? undefined : editing.connection} initialApiKey={editing === 'new' ? '' : editing.apiKey} api={api} onSaved={async () => {
      if (editing !== 'new') setFeedback(current => ({ ...current, [editing.connection.id]: undefined }))
      await refresh()
    }} onCancel={() => setEditing(null)} finalFocus={addButton} />}
  </section>
}

function ConnectionEditor({ connections, connection, initialApiKey, api, onSaved, onCancel, finalFocus }: { connections: Connection[]; connection?: Connection; initialApiKey: string; api: DesktopApi; onSaved: () => Promise<void>; onCancel: () => void; finalFocus: RefObject<HTMLButtonElement | null> }) {
  const [draft, setDraft] = useState(() => {
    const initial: ConnectionInput = { id: connection?.id, name: connection?.name ?? '', provider: connection?.provider ?? 'openai', baseUrl: connection?.baseUrl ?? '', defaultModel: connection?.defaultModel ?? '', apiKey: initialApiKey, api: connection?.api ?? 'chat' }
    return { form: initial, baseline: initial }
  })
  const { form, baseline } = draft
  const [choosing, setChoosing] = useState(!connection)
  const [importing, setImporting] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [testFeedback, setTestFeedback] = useState<ConnectionFeedback | null>(null)
  const { busy, error, run, setError } = useMutation()
  const guard = useContext(GuardContext)
  const editor = useRef<HTMLFormElement>(null), testInFlight = useRef(false)
  const fieldId = useId(), keyId = `${fieldId}-key`, nameInput = useRef<HTMLInputElement>(null)
  const compatible = form.provider === 'openai-compatible'
  const testing = testFeedback?.status === 'testing', working = busy || testing || importBusy
  // Service defaults are the starting point; only differences from that draft are edits.
  useDirty(JSON.stringify(form) !== JSON.stringify(baseline))
  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => { setTestFeedback(null); setDraft(current => ({ ...current, form: { ...current.form, [key]: value } })) }
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
    guard.navigate(onCancel, { resetOnDiscard: false })
  }
  const back = () => guard.navigate(() => {
    setDraft(current => ({ ...current, form: current.baseline }))
    setShowKey(false)
    setError('')
    setTestFeedback(null)
    setChoosing(true)
  }, { resetOnDiscard: false })
  const selectProvider = (provider: Provider) => {
    setImporting(false)
    setDraft(current => {
      if (!connection) {
        const initial: ConnectionInput = { name: providers[provider].label, provider, baseUrl: '', defaultModel: '', apiKey: '', api: 'chat' }
        return { form: initial, baseline: initial }
      }
      const saved = current.baseline
      return { ...current, form: { ...saved, provider, name: !saved.name || saved.name === providers[saved.provider].label ? providers[provider].label : saved.name } }
    })
    setError('')
    setTestFeedback(null)
    setChoosing(false)
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <ConnectionDialogLayout choosing={choosing} label={connection ? '编辑连接' : '添加模型连接'} title={choosing ? '选择模型服务' : importing ? '导入本机模型配置' : `连接 ${providers[form.provider].label}`}
      illustration={<ConnectionIllustration configuring={!choosing} />} working={working} onClose={close} closeLabel="关闭模型连接配置" finalFocus={finalFocus} initialFocus={connection ? nameInput : undefined}
      steps={!connection ? { label: '添加连接进度', first: '选择服务', second: '配置连接' } : undefined}>
      {choosing ? <div className="connection-provider-options">
        {(Object.entries(providers) as [Provider, typeof providers[Provider]][]).map(([provider, details]) => <Button key={provider} variant="surface" size="content" className="connection-provider-option" onClick={() => selectProvider(provider)}><ProviderIcon provider={provider} /><span><strong>{details.label}</strong><small>{details.description}</small></span><ChevronRight size={16} /></Button>)}
        {!connection && <Button variant="surface" size="content" className="connection-provider-option" onClick={() => { setError(''); setTestFeedback(null); setImporting(true); setChoosing(false) }}><span className="connection-provider-icon"><FolderOpen /></span><span><strong>导入本机配置</strong><small>读取 Codex、Claude Code 中的模型 API 配置</small></span><ChevronRight /></Button>}
      </div> : importing ? <LocalModelImport api={api} connections={connections} onBack={() => { setImporting(false); setChoosing(true) }} onWorking={setImportBusy} onSaved={async () => { await onSaved(); guard.saved(onCancel) }} /> : <ConnectionForm ref={editor} disabled={working} onSubmit={event => {
        event.preventDefault()
        if (testInFlight.current) return
        void run(async () => {
          const input = { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), defaultModel: form.defaultModel.trim(), apiKey: form.apiKey?.trim() }
          const saved = await api.request('saveConnection', input)
          await onSaved()
          const baseline = { ...input, id: saved.id }
          setDraft({ form: baseline, baseline })
          guard.saved(onCancel)
        })
      }} footer={<>
        <Button type="button" variant="ghost" disabled={working} onClick={back}><ArrowLeft />更换服务</Button>
        <div className="connection-editor-actions">
          {testFeedback && <p className="connection-feedback connection-draft-feedback connection-inline-feedback" title={testFeedback.message} data-status={testFeedback.status} role={testFeedback.status === 'error' ? 'alert' : 'status'}>{testing ? <LoaderCircle className="spinner" size={13} /> : testFeedback.status === 'success' ? <Check size={13} /> : null}<span>{testFeedback.message}</span></p>}
          <Button type="button" variant="outline" className="relative" aria-label="测试" aria-busy={testing} disabled={working} onClick={() => { void testDraft() }}><span className={testing ? 'invisible' : undefined}>测试</span>{testing && <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><LoaderCircle className="spinner" /></span>}</Button>
          <Button type="submit" disabled={working}>{busy && <LoaderCircle size={14} className="spinner" />}{busy ? '正在保存…' : '保存连接'}</Button>
        </div>
      </>}>
        {error && <Banner>{error}</Banner>}
        <ConnectionSettingRow label="连接名称" htmlFor={`${fieldId}-name`} icon={<Pencil />}>
          <Input id={`${fieldId}-name`} ref={nameInput} autoFocus required value={form.name} onChange={event => set('name', event.target.value)} placeholder="为这个连接起个名字" />
        </ConnectionSettingRow>
        <div className="connection-provider-group">
          <div className="connection-group-heading"><FieldTitle><Sparkles />服务商</FieldTitle></div>
          <UiField orientation="horizontal" className="connection-setting-row connection-url-row grid">
            <div className="connection-setting-label">
              <FieldLabel htmlFor={`${fieldId}-url`}><span className="connection-nested-line" aria-hidden="true" />Base URL</FieldLabel>
              <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="接口地址说明" />}><InfoIcon /></TooltipTrigger><TooltipContent>{compatible ? '填写服务提供的完整 API 根地址，例如 https://api.openai.com/v1。' : '使用官方服务时留空；也可填写自定义 API 根地址。'}</TooltipContent></Tooltip>
            </div>
            <Input id={`${fieldId}-url`} aria-label="接口地址 Base URL" type="url" required={compatible} value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)} placeholder={compatible ? 'https://api.openai.com/v1' : '使用官方默认地址'} />
          </UiField>
        </div>
        <ConnectionSettingRow label="API Key" htmlFor={keyId} icon={<Key />}>
          <div className="connection-setting-control">
            <InputGroup><InputGroupInput id={keyId} type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={form.apiKey} onChange={event => set('apiKey', event.target.value)} placeholder="输入 API Key" /><InputGroupAddon align="inline-end" className="pr-2.5 has-[>button]:mr-0"><InputGroupButton size="icon-xs" className="connection-key-visibility" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} aria-pressed={showKey} onClick={() => setShowKey(current => !current)}>{showKey ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup>
          </div>
        </ConnectionSettingRow>
        {compatible ? <ConnectionModelPicker api={api} draft={form} onChange={value => set('defaultModel', value)} /> : <ConnectionSettingRow label="默认模型 ID" htmlFor={`${fieldId}-model`} icon={<Cpu />} hint="填写服务提供商支持的模型 ID。"><Input id={`${fieldId}-model`} required value={form.defaultModel} onChange={event => set('defaultModel', event.target.value)} placeholder="输入模型 ID" /></ConnectionSettingRow>}
        {form.provider !== 'anthropic' && <ConnectionSettingRow label="接口协议" htmlFor={`${fieldId}-api`}>
          <SelectField id={`${fieldId}-api`} value={form.api ?? 'chat'} onValueChange={selectedValue => set('api', selectedValue as 'chat' | 'responses')} options={[{ value: 'chat', label: 'Chat Completions' }, { value: 'responses', label: 'Responses' }]} />
        </ConnectionSettingRow>}
      </ConnectionForm>}
      {choosing && <p className="connection-wizard-note"><ShieldCheck size={14} />使用你自己的账号与密钥，连接信息仅保存在本机。</p>}
    </ConnectionDialogLayout>
  </Dialog>
}
