/*
 * [INPUT]: Confirmed recorder status and versioned settings mutations.
 * [OUTPUT]: Shared settings layout, Badge permission states and platform-neutral OCR controls with capability-aware fallback.
 * [POS]: Desktop activity settings sections using shared settings layout and components.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { ActivitySettings, ActivityStatus } from '@boai/shared/domain/desktop-activity'
import { SettingsSection, SettingsCard, SettingsRow } from './settings-layout'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon } from '@/components/icons'
import { toast } from 'sonner'
function ActivityHelp({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent align="start" className="max-w-80 break-words">{children}</TooltipContent></Tooltip>
}
export function ActivitySection({ title, hint, first, children }: { title: string; hint?: string; first?: boolean; children: ReactNode }) {
  return <SettingsSection first={first} title={<>{title}{hint && <ActivityHelp label={title}>{hint}</ActivityHelp>}</>}><SettingsCard>{children}</SettingsCard></SettingsSection>
}
export function ActivitySettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <SettingsRow><div className="flex min-w-0 items-center gap-1 font-medium"><span>{label}</span>{hint && <ActivityHelp label={label}>{hint}</ActivityHelp>}</div><div className="appearance-row-controls">{children}</div></SettingsRow>
}
function NumberSetting({ label, value, min, max, step = 1, disabled, onSave, hint }: { label: string; value: number; min: number; max: number; step?: number; disabled: boolean; onSave(value: number): void; hint?: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const save = () => {
    const number = Number(draft)
    if (!draft.trim() || !Number.isInteger(number) || number < min || number > max || number % step !== 0) { setDraft(String(value)); toast.error(`${label}需要为 ${min} 至 ${max}${step > 1 ? `，步长 ${step}` : ''}的整数`); return }
    if (number !== value) onSave(number)
  }
  return <ActivitySettingRow label={label} hint={hint}><Input className="w-32 shrink-0" type="number" aria-label={label} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></ActivitySettingRow>
}
const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`
export function ActivityRecorderSettings({ status, busy, update, permission, openDirectory }: {
  status?: ActivityStatus; busy: boolean; update(patch: Partial<ActivitySettings>): void
  permission(kind: 'screen' | 'input', openSettings?: boolean): void; openDirectory(): void
}) {
  const settings = status?.settings, disabled = !settings || busy
  const capabilities = status?.capabilities
  const screenshotAvailable = capabilities?.screenshots ?? !!status?.supported
  const inputAvailable = capabilities?.inputMonitor ?? !!status?.supported
  const ocrAvailable = capabilities?.ocr ?? !!status?.supported
  const [languages, setLanguages] = useState(''), [excluded, setExcluded] = useState('')
  useEffect(() => { if (settings) { setLanguages((settings.ocrLanguages ?? ['zh-Hans', 'en-US']).join(', ')); setExcluded(settings.excludedApps.join('\n')) } }, [settings?.revision]) // Confirmed revisions only; status polling preserves drafts.
  const switchRow = (key: 'saveScreenshots' | 'enableInputMonitor' | 'enableOcr', label: string, hint: string, available = true) => <ActivitySettingRow label={label} hint={hint}><Switch aria-label={label} checked={settings?.[key] ?? false} disabled={disabled || !available} onCheckedChange={value => update({ [key]: value })} /></ActivitySettingRow>
  const numberRow = (key: 'snapshotDebounceMs' | 'idleThresholdMs' | 'typingPauseMs' | 'visualCheckIntervalMs' | 'jpegQuality' | 'ocrEveryN' | 'maxStorageMB' | 'retentionDays', label: string, min: number, max: number, hint?: string) => <NumberSetting label={label} value={settings?.[key] ?? 0} min={min} max={max} disabled={disabled || key === 'ocrEveryN' && (!ocrAvailable || !settings?.enableOcr)} hint={hint} onSave={value => update({ [key]: value })} />
  return <div>
    <ActivitySection title="活动记录器" first>
      <ActivitySettingRow label="记录桌面活动"><Switch aria-label="记录桌面活动" checked={settings?.enabled ?? false} disabled={disabled || !status?.supported} onCheckedChange={enabled => update({ enabled })} /></ActivitySettingRow>
    </ActivitySection>
    <ActivitySection title="系统权限">
      {status && !status.supported ? <ActivitySettingRow label="桌面采集"><Badge variant="outline">当前环境暂不支持</Badge></ActivitySettingRow> : (['screen', 'input'] as const).filter(kind => kind === 'screen' || inputAvailable).map(kind => { const allowed = kind === 'screen' ? status?.permission : status?.accessibilityPermission; const macPermissions = !capabilities || capabilities.platform === 'macos'; return <ActivitySettingRow key={kind} label={kind === 'screen' ? macPermissions ? '屏幕录制' : '屏幕采集' : macPermissions ? '辅助功能' : '键鼠监听'}><Badge variant={allowed ? 'secondary' : 'outline'}>{allowed === undefined ? '读取中' : allowed ? '已授权' : '未授权'}</Badge>{!allowed && <Button variant="secondary" size="sm" disabled={disabled || !status?.supported} onClick={() => permission(kind)}>申请权限</Button>}<Button variant="ghost" size="sm" disabled={disabled || !status?.supported} onClick={() => permission(kind, true)}>打开系统设置</Button></ActivitySettingRow> })}
    </ActivitySection>
    <ActivitySection title="采集">
      {switchRow('saveScreenshots', '保存桌面截图', '将前台窗口的截图保存在本机；关闭后继续保留已有截图。', screenshotAvailable)}
      {numberRow('snapshotDebounceMs', '采集最小间隔（毫秒）', 1000, 60000, '避免连续点击或输入触发过密采集。')}
      <NumberSetting label="心跳间隔（毫秒）" value={(settings?.intervalSeconds ?? 60) * 1000} min={10000} max={3600000} step={1000} disabled={disabled} hint="活动期间，即使画面没有变化也定期保留观察。" onSave={value => update({ intervalSeconds: value / 1000 })} />
      {numberRow('idleThresholdMs', '空闲阈值（毫秒）', 10000, 3600000, '超过此时长没有输入时，暂停屏幕采集。')}
      {numberRow('typingPauseMs', '输入停顿（毫秒）', 200, 10000, '启用键鼠监听后，输入停顿再采集；心跳采集仍按时执行。')}
      {numberRow('visualCheckIntervalMs', '画面变化轮询（毫秒）', 0, 300000, '0 为关闭；开启时至少 5000 毫秒。画面未变化则不重复保存。')}
      {numberRow('jpegQuality', 'JPEG 质量', 10, 100, '数值越小，保存的截图文件越小。')}
    </ActivitySection>
    <ActivitySection title="OCR 与输入">
      {switchRow('enableOcr', 'OCR 文字识别', ocrAvailable ? '提取当前窗口中的文字。识别失败时保留应用、窗口和已启用的截图记录。' : '当前环境暂未提供文字识别，可继续查看已有记录。', ocrAvailable)}
      {switchRow('enableInputMonitor', '全局键鼠事件监听', '只记录按键与点击次数，不记录输入内容；所需权限由当前系统决定。', inputAvailable)}
      <ActivitySettingRow label="OCR 语言" hint="识别语言代码，用逗号分隔，例如 zh-Hans, en-US；实际支持范围由识别服务决定。"><Input aria-label="OCR 语言" className="w-64" value={languages} disabled={disabled || !ocrAvailable || !settings?.enableOcr} onChange={e => setLanguages(e.target.value)} onBlur={() => { const next = [...new Set(languages.split(',').map(x => x.trim()).filter(Boolean))]; if (JSON.stringify(next) !== JSON.stringify(settings?.ocrLanguages)) update({ ocrLanguages: next }) }} /></ActivitySettingRow>
      {numberRow('ocrEveryN', '每 N 次采集识别一次文字', 1, 100, '1 为每次识别。跳过识别的记录不会复用之前窗口的文字。')}
    </ActivitySection>
    <ActivitySection title="不记录的应用" hint="每行一个应用标识。排除应用不会保存窗口截图、OCR 或键鼠事件。">
      <div className="py-4"><Textarea aria-label="不记录的应用" className="min-h-28 font-mono" value={excluded} disabled={disabled} onChange={e => setExcluded(e.target.value)} onBlur={() => { const next = [...new Set(excluded.split('\n').map(x => x.trim()).filter(Boolean))]; if (JSON.stringify(next) !== JSON.stringify(settings?.excludedApps)) update({ excludedApps: next }) }} /></div>
    </ActivitySection>
    <ActivitySection title="存储">
      <div className="pb-3"><ActivitySettingRow label="已用存储" hint="统计活动文字、键鼠事件和截图文件；超过配额时删除最早记录及关联分析、日报。"><span className="text-muted-foreground tabular-nums">{formatBytes(status?.storageBytes ?? 0)} / {formatBytes((settings?.maxStorageMB ?? 10240) * 1024 ** 2)}</span></ActivitySettingRow><progress className="h-1 w-full accent-primary" aria-label="活动存储用量" value={status?.storageBytes ?? 0} max={(settings?.maxStorageMB ?? 10240) * 1024 ** 2} /></div>
      {numberRow('maxStorageMB', '最大存储（MB）', 10, 102400)}
      {numberRow('retentionDays', '保留天数', 1, 365, '到期后删除原记录、截图和依赖这些记录的分析、日报。')}
      <ActivitySettingRow label="截图目录" hint={status?.outputDirectory ?? '当前运行环境没有截图目录'}><Button variant="secondary" size="sm" disabled={disabled || !status?.outputDirectory} onClick={openDirectory}>打开目录</Button></ActivitySettingRow>
    </ActivitySection>
  </div>
}
