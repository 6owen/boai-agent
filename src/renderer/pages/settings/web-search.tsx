/*
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [INPUT]: Independent retrieval settings, current provider presets and versioned desktop API.
 * [OUTPUT]: Compact default retrieval selector with persisted browser fallback for unavailable services, wider single-line browser open menu and service enable switch; shared model-connection key input and save-only dialog footer.
 * [POS]: Settings / configuration / web retrieval; no business data-source forms or bindings.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { SettingsLayout, SettingsSection } from './settings-layout'
import { useContext, useEffect, useId, useRef, useState } from 'react'
import deepseekIcon from '@lobehub/icons-static-svg/icons/deepseek.svg'
import type { DesktopApi } from '@shared/ipc'
import { searchProviderPresets, type SearchProviderId, type WebSearchServiceConfig } from '@shared/domain/web-search'
import { useWebSearchSettings } from '@/hooks/use-web-search'
import { ErrorToast, GuardContext, showErrorToast, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SelectField } from '@/components/ui/select-field'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTitle, PopoverDescription } from '@/components/ui/popover'
import { Check, Eye, EyeOff, Search, Pencil, Key, LoaderCircle, MoreHorizontal, ShieldCheck, Trash2 } from '@/components/icons'
import { ConnectionDialogLayout, ConnectionForm, ConnectionSettingRow } from './connection-layout'
import { ConnectionIllustration } from './connection-illustration'

type EditTarget = { provider: SearchProviderId; service?: WebSearchServiceConfig; credential: string }
type SearchPreset = typeof searchProviderPresets[number]

export function WebSearchSettingsPage({ api, active }: { api: DesktopApi; active: boolean }) {
  const { settings, failed, refresh } = useWebSearchSettings(api, active)
  const mutation = useMutation(), [editing, setEditing] = useState<EditTarget>()
  const fallbackRevision = useRef<number | undefined>(undefined)
  const services = settings?.services.filter(service => service.enabled && service.pluginEnabled && searchProviderPresets.some(provider => provider.id === service.provider && (!provider.requiresKey || service.hasCredential))) ?? []
  const preferredServiceId = settings?.default.mode === 'service' ? settings.default.serviceId : undefined
  const unavailableDefault = !!preferredServiceId && !services.some(service => service.id === preferredServiceId)
  const defaultValue = preferredServiceId && !unavailableDefault ? preferredServiceId : 'browser'
  const options = [{ value: 'browser', label: 'BOAI 浏览器' }, ...services.map(service => ({ value: service.id, label: service.name }))]
  useEffect(() => {
    if (!unavailableDefault) { fallbackRevision.current = undefined; return }
    if (!active || !settings || mutation.busy || fallbackRevision.current === settings.revision) return
    fallbackRevision.current = settings.revision
    void mutation.run(async () => {
      await api.request('saveWebSearchDefault', { expectedRevision: settings.revision, default: { mode: 'browser' } })
      await refresh()
    })
  }, [active, api, settings, unavailableDefault, mutation.busy, mutation.run, refresh])
  const configure = (provider: SearchProviderId, service?: WebSearchServiceConfig) => void mutation.run(async () => {
    const credential = service ? await api.request('getWebSearchCredential', { id: service.id, expectedRevision: service.revision }) : ''
    setEditing({ provider, service, credential })
  })
  return <SettingsLayout title="网页检索" aria-label="网页检索设置" className="connection-settings">
    <ErrorToast>{mutation.error}</ErrorToast>
    <SettingsSection first title="默认检索">
    <Card className="gap-0 px-5 py-0"><div className="connection-fields">
      <ConnectionSettingRow label="默认检索方式" icon={<Search />}><SelectField className="w-56 max-w-full justify-self-end" aria-label="默认检索方式" value={defaultValue} disabled={!settings || mutation.busy || !active} options={options} onValueChange={value => { void mutation.run(async () => { await api.request('saveWebSearchDefault', { expectedRevision: settings!.revision, default: value === 'browser' ? { mode: 'browser' } : { mode: 'service', serviceId: value } }); await refresh() }) }} /></ConnectionSettingRow>
    </div></Card>
    </SettingsSection>
    <SettingsSection title="检索服务">
      <Card className="connection-rows soft-divide-y gap-0 p-0">
        <div className="connection-row" data-search-provider="browser">
          <span className="connection-provider-icon" aria-hidden="true"><i className="app-icon i-carbon-earth size-6" /></span>
          <div className="connection-row-body">
            <div className="connection-row-title"><strong>BOAI 浏览器</strong><span className="connection-state" data-ready="true">内置可用</span></div>
            <p className="connection-row-description">使用应用浏览器检索、访问网页，沿用已有登录状态。</p>
          </div>
          <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={mutation.busy || !active} aria-label="管理 BOAI 浏览器" />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56"><DropdownMenuItem className="whitespace-nowrap" onClick={() => { void mutation.run(async () => { await api.request('openBrowser', {}) }) }}><i aria-hidden="true" className="app-icon i-carbon-earth" />打开 BOAI 浏览器</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
        {searchProviderPresets.flatMap(provider => {
          const services = settings?.services.filter(service => service.provider === provider.id) ?? []
          const rows: (WebSearchServiceConfig | undefined)[] = services.length ? services : [undefined]
          return rows.map(service => <SearchServiceRow key={service?.id ?? provider.id} provider={provider} service={service} api={api} disabled={mutation.busy || !settings || !active} onConfigure={() => configure(provider.id, service)} onChanged={refresh} />)
        })}
      </Card>
      <p className="connection-footnote"><ShieldCheck size={14} />密钥保存在本机，不会显示在聊天消息中。</p>
    </SettingsSection>
    {failed && <Button variant="ghost" size="sm" onClick={() => void refresh()}>重新读取</Button>}
    {editing && active && <SearchServiceEditor key={editing.service?.id ?? editing.provider} api={api} target={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
  </SettingsLayout>
}

function SearchServiceRow({ provider, service, api, disabled, onConfigure, onChanged }: { provider: SearchPreset; service?: WebSearchServiceConfig; api: DesktopApi; disabled: boolean; onConfigure(): void; onChanged(): Promise<void> }) {
  const mutation = useMutation(), menuAnchor = useRef<HTMLButtonElement>(null)
  const [removing, setRemoving] = useState(false), [testing, setTesting] = useState(false)
  const working = disabled || mutation.busy, name = service?.name ?? provider.name
  const ready = !!service && service.enabled && service.pluginEnabled && (!provider.requiresKey || service.hasCredential)
  const status = !service ? '未配置' : !service.pluginEnabled ? '插件已停用' : !service.enabled ? '已停用' : !ready ? '待配置密钥' : '已配置'
  const testService = () => void mutation.run(async () => {
    if (!service) return
    setTesting(true)
    try {
      const result = await api.request('testWebSearchService', { id: service.id, expectedRevision: service.revision })
      await onChanged()
      if (result.test?.status === 'failed') throw new Error(result.test.message)
    } finally { setTesting(false) }
  })
  return <div className="connection-row" data-search-provider={provider.id}>
    <ErrorToast>{mutation.error}</ErrorToast>
    <span className="connection-provider-icon" aria-hidden="true"><span className="connection-brand-icon" style={{ maskImage: `url("${deepseekIcon}")` }} /></span>
    <div className="connection-row-body">
      <div className="connection-row-title">
        <strong title={name}>{name}</strong><span className="connection-state" data-ready={ready}>{status}</span>
        {(testing || service?.test) && <p className="connection-feedback connection-inline-feedback" data-status={testing ? 'testing' : service?.test?.status === 'success' ? 'success' : undefined} role="status" title={testing ? undefined : service?.test?.message}>
          {testing ? <LoaderCircle className="spinner" size={13} /> : service?.test?.status === 'success' ? <Check size={13} /> : null}<span>{testing ? '正在测试连接…' : service?.test?.status === 'success' ? service.test.message : '测试未通过'}</span>
        </p>}
      </div>
      <p className="connection-row-description">{provider.description}</p>
    </div>
    {service ? <>
      <Switch aria-label={`启用 ${name} 服务`} checked={service.enabled} disabled={working} onCheckedChange={enabled => { void mutation.run(async () => { await api.request('saveWebSearchService', { id: service.id, expectedRevision: service.revision, provider: service.provider, name: service.name, enabled }); await onChanged() }) }} />
      <DropdownMenu><DropdownMenuTrigger render={<Button ref={menuAnchor} variant="ghost" size="icon" disabled={working} aria-label={`管理 ${name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" finalFocus={removing ? false : undefined}>
          <DropdownMenuItem onClick={() => requestAnimationFrame(onConfigure)}><Pencil />编辑配置</DropdownMenuItem>
          <DropdownMenuItem disabled={!ready} onClick={testService}><Check />测试连接</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}><Trash2 />移除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={removing} onOpenChange={open => { if (!working) setRemoving(open) }}><PopoverContent anchor={menuAnchor} align="end" finalFocus={menuAnchor}>
        <PopoverTitle>移除“{name}”？</PopoverTitle><PopoverDescription>使用此服务的员工将显示服务不可用。</PopoverDescription>
        <div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={working} onClick={() => setRemoving(false)}>取消</Button><Button variant="destructive" size="sm" disabled={working} onClick={() => { void mutation.run(async () => { await api.request('removeWebSearchService', { id: service.id, expectedRevision: service.revision }); setRemoving(false); await onChanged() }) }}>确认移除</Button></div>
      </PopoverContent></Popover>
    </> : <Button variant="secondary" disabled={working} onClick={onConfigure}>配置</Button>}
  </div>
}

function SearchServiceEditor({ api, target, onClose, onSaved }: { api: DesktopApi; target: EditTarget; onClose(): void; onSaved(): Promise<void> }) {
  const provider = searchProviderPresets.find(item => item.id === target.provider)!, mutation = useMutation(), guard = useContext(GuardContext), fieldId = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const [id] = useState(() => target.service?.id ?? crypto.randomUUID())
  const [name, setName] = useState(target.service?.name ?? provider.name), [enabled, setEnabled] = useState(target.service?.enabled ?? true), [credential, setCredential] = useState(target.credential), [visible, setVisible] = useState(false)
  const resetDirty = useDirty({ name, enabled, credential })
  const close = () => { if (!mutation.busy) guard.navigate(onClose, { resetOnDiscard: false }) }
  return <Dialog open onOpenChange={open => { if (!open) close() }}><ConnectionDialogLayout choosing={false} label="配置网页检索" title={`连接 ${provider.name}`} illustration={<ConnectionIllustration configuring />} closeLabel="关闭网页检索配置" working={mutation.busy} onClose={close} finalFocus={undefined} initialFocus={nameInput}>
    <ErrorToast>{mutation.error}</ErrorToast>
    <ConnectionForm noValidate disabled={mutation.busy} onSubmit={event => {
      event.preventDefault()
      if (mutation.busy) return
      if (!name.trim()) { showErrorToast('请填写连接名称'); return }
      void mutation.run(async () => {
        await api.request('saveWebSearchService', { id, expectedRevision: target.service?.revision ?? 0, provider: provider.id, name: name.trim(), enabled, credential: credential.trim() })
        resetDirty(); await onSaved(); guard.saved(onClose)
      })
    }} footer={<div className="connection-editor-actions"><Button type="submit" disabled={mutation.busy}>{mutation.busy && <LoaderCircle size={14} className="spinner" />}{mutation.busy ? '正在保存…' : '保存连接'}</Button></div>}>
      <ConnectionSettingRow label="连接名称" htmlFor={`${fieldId}-name`} icon={<Pencil />}><Input id={`${fieldId}-name`} ref={nameInput} required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="为这个连接起个名字" /></ConnectionSettingRow>
      <ConnectionSettingRow label="API Key" icon={<Key />} htmlFor={`${fieldId}-key`} hint="由网页检索服务独立保存。"><div className="connection-setting-control"><InputGroup><InputGroupInput id={`${fieldId}-key`} aria-label={`${provider.name} API Key`} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={credential} onChange={event => setCredential(event.target.value)} placeholder="输入 API Key" /><InputGroupAddon align="inline-end" className="pr-2.5 has-[>button]:mr-0"><InputGroupButton size="icon-xs" className="connection-key-visibility" aria-label={visible ? '隐藏 API Key' : '显示 API Key'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup></div></ConnectionSettingRow>
      <ConnectionSettingRow label="启用服务" icon={<Search />}><Switch checked={enabled} onCheckedChange={setEnabled} /></ConnectionSettingRow>
    </ConnectionForm>
  </ConnectionDialogLayout></Dialog>
}
