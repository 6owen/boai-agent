/*
 * [INPUT]: Independent search settings and versioned employee preference draft.
 * [OUTPUT]: Employee retrieval method display/editing only; title tooltip directs service configuration to global settings, with no employee allow-list or configuration button.
 * [POS]: Employee capability UI; does not alter business data-source bindings.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import type { DesktopApi } from '@shared/ipc'
import type { DigitalAgent } from '@shared/domain'
import { isSearchProviderPreset, webSearchLabel, type WebSearchPreference } from '@shared/domain/web-search'
import { useWebSearchSettings } from '@/hooks/use-web-search'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Search } from '@/components/icons'
import { ConnectionSettingRow } from '@/pages/settings/connection-layout'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection, EmployeeSectionEdit, type EmployeeSectionEditing } from './profile-card'

export const employeeWebSearchHint = '此处仅选择这位员工的检索方式。检索服务、密钥及全局默认方式请前往“设置 → 配置 → 网页检索”管理。'
export function EmployeeWebSearchCard({ api, agent, active, editing }: { api: DesktopApi; agent: DigitalAgent; active: boolean; editing: EmployeeSectionEditing }) {
  const { settings, failed, refresh } = useWebSearchSettings(api, active)
  if (editing.section === 'web-search') return editing.render('web-search')
  return <ContactProfileSection title="网页检索" hint={employeeWebSearchHint} actions={<EmployeeSectionEdit editing={editing} section="web-search" label="网页检索" />}>
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
    <ConnectionSettingRow label="检索方式" icon={<Search />}><SelectField className="w-56 max-w-full justify-self-end" aria-label="员工网页检索方式" value={selected} disabled={disabled || !active || !settings} options={options} onValueChange={next => onChange(next === 'auto' || next === 'browser' || next === 'disabled' ? { mode: next, ...limits } : { mode: 'service', serviceId: next, ...limits })} /></ConnectionSettingRow>
    {failed && <div className="flex justify-end py-2"><Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>重新读取</Button></div>}
  </>
}
