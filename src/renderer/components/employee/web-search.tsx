/*
 * [INPUT]: Independent search settings and versioned employee preference draft.
 * [OUTPUT]: Separate retrieval Card and current browser/DeepSeek choices, with allow-list and guarded global configuration link.
 * [POS]: Employee capability UI; does not alter business data-source bindings.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { useContext } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { DigitalAgent } from '@shared/domain'
import { isSearchProviderPreset, webSearchLabel, type WebSearchPreference } from '@shared/domain/web-search'
import { useWebSearchSettings } from '@/hooks/use-web-search'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, GuardContext } from '@/components/common'
import { Search } from '@/components/icons'
import { EmployeeResourceNavigation } from './resource-navigation'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection, EmployeeSectionEdit, type EmployeeSectionEditing } from './profile-card'

function ManageSearchButton({ disabled = false }: { disabled?: boolean }) {
  const navigate = useContext(EmployeeResourceNavigation), guard = useContext(GuardContext)
  return <Button type="button" variant="ghost" size="sm" disabled={disabled || !navigate} onClick={() => guard.navigate(() => navigate?.({ kind: 'web-search-settings', id: 'web-search', name: '网页检索' }))}>配置检索服务</Button>
}
export function EmployeeWebSearchCard({ api, agent, active, editing }: { api: DesktopApi; agent: DigitalAgent; active: boolean; editing: EmployeeSectionEditing }) {
  const { settings, failed, refresh } = useWebSearchSettings(api, active)
  if (editing.section === 'web-search') return editing.render('web-search')
  return <ContactProfileSection title="网页检索" actions={<div className="flex items-center gap-2"><ManageSearchButton disabled={!active || editing.locked} /><EmployeeSectionEdit editing={editing} section="web-search" label="网页检索" /></div>}>
    <ContactProfileCard label="网页检索配置"><ContactProfileRow icon={<Search />} title="检索方式">{webSearchLabel(agent.webSearch, settings)}</ContactProfileRow>
      {(!agent.webSearch || agent.webSearch.mode === 'auto') && <ContactProfileRow icon={<Search />} title="全局默认">{settings ? webSearchLabel(settings.default, settings) : '读取中…'}</ContactProfileRow>}
    </ContactProfileCard>
    {failed && <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>重新读取</Button>}
  </ContactProfileSection>
}
export function EmployeeWebSearchFields({ api, value, active, disabled, onChange }: { api: DesktopApi; value?: WebSearchPreference; active: boolean; disabled: boolean; onChange(value: WebSearchPreference): void }) {
  const { settings, failed, refresh } = useWebSearchSettings(api, active)
  const preference = value ?? { mode: 'auto' }, services = settings?.services.filter(service => isSearchProviderPreset(service.provider)) ?? []
  const ids = 'allowedServiceIds' in preference ? preference.allowedServiceIds : undefined
  const selected = preference.mode === 'service' ? preference.serviceId : preference.mode === 'source' ? preference.sourceId : preference.mode
  const available = services.filter(service => service.enabled && service.pluginEnabled && (!ids || ids.includes(service.id)))
  const options = [{ value: 'auto', label: '跟随全局默认' }, { value: 'browser', label: 'BOAI 浏览器' }, ...available.map(service => ({ value: service.id, label: service.name })), { value: 'disabled', label: '关闭网页检索' }]
  if (!options.some(option => option.value === selected)) options.push({ value: selected, label: webSearchLabel(preference, settings) })
  const limits = ids ? { allowedServiceIds: ids } : {}
  return <>
    <Field full label="检索方式"><SelectField aria-label="员工网页检索方式" value={selected} disabled={disabled || !active || !settings} options={options} onValueChange={next => onChange(next === 'auto' || next === 'browser' || next === 'disabled' ? { mode: next, ...limits } : { mode: 'service', serviceId: next, ...limits })} /></Field>
    {!!services.length && <Field full label="可用检索服务"><div className="resource-picker">{services.map(service => <label key={service.id} className="resource-option"><Checkbox aria-label={`允许使用 ${service.name}`} disabled={disabled || !active} checked={!ids || ids.includes(service.id)} onCheckedChange={checked => {
      const next = checked ? [...new Set([...(ids ?? services.map(item => item.id)), service.id])] : (ids ?? services.map(item => item.id)).filter(id => id !== service.id)
      onChange({ ...(preference.mode === 'source' || preference.mode === 'service' && !next.includes(preference.serviceId) ? { mode: 'auto' as const } : preference), allowedServiceIds: next })
    }} /><span>{service.name}{!service.enabled || !service.pluginEnabled ? '（已停用）' : ''}</span></label>)}</div></Field>}
    <div className="field full"><ManageSearchButton disabled={disabled || !active} />{failed && <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>重新读取</Button>}</div>
  </>
}
