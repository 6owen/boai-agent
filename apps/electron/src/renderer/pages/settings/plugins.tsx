/*
 * [OUTPUT]: 运行时目录共用读取缓存，仅当前可见分类轮询；语音入口与原插件真源保持。
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [OUTPUT]: 2026-10-19 原插件目录增加网页检索分类；启停仍由原宿主配置负责。
 * [OUTPUT]: 插件分类触发器与搜索输入统一使用全局控件高度并垂直对齐。
 * [OUTPUT]: 运行时插件安装/更新/启停/卸载与当前租约状态；本机扫描及动态配置/测试/保存接入。
 * [INPUT]: 内置清单、主进程配置和当前renderer实际插件使用状态。
 * [OUTPUT]: 同行搜索/分类与持久启停，区分可用/使用中/等待关闭和故障；共用BOAI控件。
 * [POS]: 设置中的内置插件管理，不伪装成安装器或第三方市场。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { Settings } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { SettingsLayout, SettingsCard } from './settings-layout'
import { RuntimePluginManager } from './runtime-plugins'
import { useState, useSyncExternalStore } from 'react'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { pluginAvailability } from '@boai/shared/plugins/types'
import { pluginUsage, setPluginEnabled, usePlugins } from '@/stores/plugins'
import { Banner } from '@/components/common'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Switch } from '@/components/ui/switch'

export function PluginSettingsPage({ onOpenVoice, active = true }: { onOpenVoice(): void; active?: boolean }) {
  const { settings, ready, busy, error } = usePlugins()
  const usage = useSyncExternalStore(pluginUsage.subscribe, pluginUsage.snapshot, pluginUsage.snapshot)
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all')
  const plugins = applicationPlugins.filter(plugin => (kind === 'all' || plugin.contributions.some(item => item.type === kind)) && `${plugin.name} ${plugin.description} ${plugin.id}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <SettingsLayout title="插件" aria-label="内置插件">
    <p className="field-hint mb-4">管理网页检索、文件预览、主题与本机 Agent 运行时。停用后对应能力将不可用，已有预览在关闭后生效。</p>
    {(error || settings.diagnostic) && <Banner>{error || settings.diagnostic}</Banner>}
    <div className="mb-4 flex items-center gap-2" data-plugin-filters>
      <Input className="min-w-0 flex-1" aria-label="搜索插件" placeholder="搜索插件" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="w-32 shrink-0"><SelectField className="h-(--control-height)" aria-label="插件类型" value={kind} onValueChange={setKind} options={[{ value: 'all', label: '全部类型' }, { value: 'voice-input', label: '语音输入' }, { value: 'preview', label: '文件预览' }, { value: 'theme', label: '主题' }, { value: 'web-search', label: '网页检索' }, { value: 'agent-runtime', label: 'Agent 运行时' }]} /></div>
    </div>
    <SettingsCard contentClassName="soft-divide-y px-4 py-0">
      {plugins.map(plugin => {
        const availability = pluginAvailability(plugin, settings), activity = usage[plugin.id], inUse = (activity?.views ?? 0) > 0
        const status = availability === 'incompatible' ? '与当前版本不兼容' : availability === 'disabled' ? inUse ? '已停用，当前预览关闭后生效' : '已停用' : inUse ? `正在使用 · ${activity!.views} 个视图` : '已启用，按需使用'
        return <div key={plugin.id} data-application-plugin={plugin.id} className="flex items-center gap-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><label className="font-medium" htmlFor={`plugin-${plugin.id}`}>{plugin.name}</label><span className="text-xs text-muted-foreground">{plugin.version} · 内置</span></div>
            <p className="field-hint mt-1">{plugin.description}</p>
            {plugin.id !== 'boai.voice-input' && <p role="status" className="field-hint mt-1">{status}{busy === plugin.id ? ' · 正在保存…' : ''}</p>}
            {activity?.failure && <p className="field-hint text-destructive">最近一次预览加载失败。其他插件仍可使用。</p>}
          </div>
          {plugin.id === 'boai.voice-input' && <Button variant="ghost" size="icon-sm" aria-label="配置语音输入" onClick={onOpenVoice}><Settings /></Button>}
          <Switch id={`plugin-${plugin.id}`} aria-label={plugin.name} checked={availability === 'enabled'} disabled={!ready || Boolean(busy) || settings.readOnly || availability === 'incompatible'} onCheckedChange={enabled => { void setPluginEnabled(plugin.id, enabled) }} />
        </div>
      })}
      {!plugins.length && <p className="field-hint py-4">没有匹配的插件。</p>}
    </SettingsCard>
    <RuntimePluginManager query={query} kind={kind} active={active} />
  </SettingsLayout>
}
