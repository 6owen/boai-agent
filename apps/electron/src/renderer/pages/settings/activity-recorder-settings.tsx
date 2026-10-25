/*
 * [INPUT]: Confirmed recorder status and versioned settings mutations.
 * [OUTPUT]: Independent capture opt-ins, actual permissions, OCR/sampling/storage controls and excluded apps.
 * [POS]: Desktop activity settings sections using existing settings rows and shared components.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { ActivitySettings, ActivityStatus } from '@boai/shared/domain/desktop-activity'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
export function ActivitySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h3 className="font-medium">{title}</h3><Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">{children}</CardContent></Card></section>
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="appearance-row gap-4"><div className="min-w-0"><p>{label}</p>{hint && <p className="field-hint">{hint}</p>}</div>{children}</div>
}
function NumberSetting({ label, value, min, max, step = 1, disabled, onSave, hint }: { label: string; value: number; min: number; max: number; step?: number; disabled: boolean; onSave(value: number): void; hint?: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const save = () => {
    const number = Number(draft)
    if (!draft.trim() || !Number.isInteger(number) || number < min || number > max || number % step !== 0) { setDraft(String(value)); toast.error(`${label}需要为 ${min} 至 ${max}${step > 1 ? `，步长 ${step}` : ''}的整数`); return }
    if (number !== value) onSave(number)
  }
  return <Row label={label} hint={hint}><Input className="w-32 shrink-0" type="number" aria-label={label} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></Row>
}
const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`
export function ActivityRecorderSettings({ status, busy, update, permission, openDirectory }: {
  status?: ActivityStatus; busy: boolean; update(patch: Partial<ActivitySettings>): void
  permission(kind: 'screen' | 'input', openSettings?: boolean): void; openDirectory(): void
}) {
  const settings = status?.settings, disabled = !settings || busy
  const [languages, setLanguages] = useState(''), [excluded, setExcluded] = useState('')
  useEffect(() => { if (settings) { setLanguages((settings.ocrLanguages ?? ['zh-Hans', 'en-US']).join(', ')); setExcluded(settings.excludedApps.join('\n')) } }, [settings?.revision]) // Confirmed revisions only; status polling preserves drafts.
  const state = { disabled: '已关闭', permission: '等待屏幕录制权限', idle: '暂未采集', recording: '记录中', unavailable: '当前系统不可用', error: '采集异常' }
  const switchRow = (key: 'saveScreenshots' | 'enableInputMonitor' | 'enableOcr', label: string, hint: string) => <Row label={label} hint={hint}><Switch aria-label={label} checked={settings?.[key] ?? false} disabled={disabled} onCheckedChange={value => update({ [key]: value })} /></Row>
  const numberRow = (key: 'snapshotDebounceMs' | 'idleThresholdMs' | 'typingPauseMs' | 'visualCheckIntervalMs' | 'jpegQuality' | 'ocrEveryN' | 'maxStorageMB' | 'retentionDays', label: string, min: number, max: number, hint?: string) => <NumberSetting label={label} value={settings?.[key] ?? 0} min={min} max={max} disabled={disabled} hint={hint} onSave={value => update({ [key]: value })} />
  return <div className="space-y-6">
    <ActivitySection title="活动记录器">
      <Row label="记录桌面活动" hint={status ? state[status.state] ?? (settings?.enabled ? '记录中' : '已关闭') : '正在读取记录状态…'}><Switch aria-label="记录桌面活动" checked={settings?.enabled ?? false} disabled={disabled || !status?.supported} onCheckedChange={enabled => update({ enabled })} /></Row>
      <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">{[['活动片段', status?.sessionCount], ['观察记录', status?.count], ['保存截图', status?.screenshotCount], ['前台应用', status?.foregroundApp ?? '—']].map(([label, value]) => <div key={label}><p className="field-hint">{label}</p><p className="mt-1 font-medium">{value ?? '—'}</p></div>)}</div>
      {status?.lastCapturedAt && <p className="field-hint py-3">最近采集：{new Date(status.lastCapturedAt).toLocaleString()}</p>}
      {status?.lastError && <p className="py-3 text-sm">{status.lastError}</p>}
    </ActivitySection>
    <ActivitySection title="macOS 权限">
      {(['screen', 'input'] as const).map(kind => { const allowed = kind === 'screen' ? status?.permission : status?.accessibilityPermission; return <Row key={kind} label={kind === 'screen' ? '屏幕录制' : '辅助功能'} hint={allowed ? '已授权' : '未授权'}><div className="flex shrink-0 gap-2">{!allowed && <Button variant="outline" size="sm" disabled={disabled || !status?.supported} onClick={() => permission(kind)}>申请权限</Button>}<Button variant="ghost" size="sm" disabled={disabled || !status?.supported} onClick={() => permission(kind, true)}>打开系统设置</Button></div></Row> })}
    </ActivitySection>
    <ActivitySection title="采集">
      {switchRow('saveScreenshots', '保存桌面截图', '将前台窗口的截图保存在本机；关闭后继续保留已有截图。')}
      {numberRow('snapshotDebounceMs', '采集最小间隔（毫秒）', 1000, 60000, '避免连续点击或输入触发过密采集。')}
      <NumberSetting label="心跳间隔（毫秒）" value={(settings?.intervalSeconds ?? 60) * 1000} min={10000} max={3600000} step={1000} disabled={disabled} hint="活动期间，即使画面没有变化也定期保留观察。" onSave={value => update({ intervalSeconds: value / 1000 })} />
      {numberRow('idleThresholdMs', '空闲阈值（毫秒）', 10000, 3600000, '超过此时长没有输入时，暂停屏幕采集。')}
      {numberRow('typingPauseMs', '输入停顿（毫秒）', 200, 10000, '启用键鼠监听后，输入停顿再采集；心跳采集仍按时执行。')}
      {numberRow('visualCheckIntervalMs', '画面变化轮询（毫秒）', 0, 300000, '0 为关闭；开启时至少 5000 毫秒。画面未变化则不重复保存。')}
      {numberRow('jpegQuality', 'JPEG 质量', 10, 100, '数值越小，保存的截图文件越小。')}
    </ActivitySection>
    <ActivitySection title="OCR 与输入">
      {switchRow('enableOcr', '本机 OCR 文字识别', '使用 macOS Vision，从前台窗口提取文字。')}
      {switchRow('enableInputMonitor', '全局键鼠事件监听', status?.monitoring ? '监听中。只记录按键与点击次数，不记录输入内容。' : '只记录按键与点击次数，不记录输入内容；需要辅助功能权限。')}
      <Row label="OCR 语言" hint="Vision 语言代码，用逗号分隔，例如 zh-Hans, en-US。"><Input aria-label="OCR 语言" className="w-64" value={languages} disabled={disabled || !settings?.enableOcr} onChange={e => setLanguages(e.target.value)} onBlur={() => { const next = [...new Set(languages.split(',').map(x => x.trim()).filter(Boolean))]; if (JSON.stringify(next) !== JSON.stringify(settings?.ocrLanguages)) update({ ocrLanguages: next }) }} /></Row>
      {numberRow('ocrEveryN', '每 N 次采集识别一次文字', 1, 100, '1 为每次识别。跳过识别的记录不会复用之前窗口的文字。')}
    </ActivitySection>
    <ActivitySection title="不记录的应用">
      <div className="space-y-3 py-4"><p className="field-hint">每行一个应用标识。排除应用不会保存窗口截图、OCR 或键鼠事件。</p><Textarea aria-label="不记录的应用" className="min-h-40 font-mono" value={excluded} disabled={disabled} onChange={e => setExcluded(e.target.value)} onBlur={() => { const next = [...new Set(excluded.split('\n').map(x => x.trim()).filter(Boolean))]; if (JSON.stringify(next) !== JSON.stringify(settings?.excludedApps)) update({ excludedApps: next }) }} /></div>
    </ActivitySection>
    <ActivitySection title="存储">
      <div className="space-y-2 py-4"><p>已用存储：{formatBytes(status?.storageBytes ?? 0)} / {formatBytes((settings?.maxStorageMB ?? 10240) * 1024 ** 2)}</p><progress className="h-2 w-full accent-primary" aria-label="活动存储用量" value={status?.storageBytes ?? 0} max={(settings?.maxStorageMB ?? 10240) * 1024 ** 2} /><p className="field-hint">统计活动文字、键鼠事件和截图文件；超过配额时删除最早记录及关联分析、日报。</p></div>
      {numberRow('maxStorageMB', '最大存储（MB）', 10, 102400)}
      {numberRow('retentionDays', '保留天数', 1, 365, '到期后删除原记录、截图和依赖这些记录的分析、日报。')}
      <Row label="截图目录" hint={status?.outputDirectory ?? '当前运行环境没有截图目录'}><Button variant="outline" size="sm" disabled={disabled || !status?.outputDirectory} onClick={openDirectory}>打开目录</Button></Row>
    </ActivitySection>
  </div>
}
