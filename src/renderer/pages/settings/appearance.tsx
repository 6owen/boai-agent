/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 主题选项仅列可用插件配色，停用回退值与保留的原选择分开显示。
 * [OUTPUT]: 图片下方内嵌卡片展示玻璃/遮罩百分比与0–32px模糊三行Slider，独立预览/保存；重置浮层仅标题与确认/取消。
 * [INPUT]: 共享外观偏好、真实界面缩略图及受控桌面操作、统一 UI 基础组件。
 * [OUTPUT]: 图片换肤直接启用Craft Scenic，说明收进标题右侧图标Tooltip，预览无分割线；标题右侧重置经Popover确认后执行，取消不修改，保留只读和保存期间禁用，无底部说明/操作区。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；外观按实际内容宽度换行，图片动作在窄栏仍可达；共用设置文档布局、无保存状态提示的外观页面；Card 分组的视觉/背景图片设置，保留即时预览、保存与错误重试。
 * [POS]: 设置页外观分区；使用统一预览和持久化流程。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { Slider } from '@/components/ui/slider'
import { Field, FieldContent, FieldGroup, FieldTitle } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { InfoIcon, RefreshCw } from '@/components/icons'
import { appearanceDefaults, appIconPresets, availableThemes, defaultAppIconId, defaultGlassOpacity, maxBackgroundBlur, resolveTheme, resolveAppearanceTheme, typographyControls, typographyDefaults, zoomFactors, type AppIconStatus, type TypographyGroup, type ThemeOverrides } from '@shared/appearance'
import { usePlugins } from '@/stores/plugins'
import { useAppearance, previewAppearance, flushAppearance, appearanceAction } from '@/stores/appearance'
import lightPreview from '@/assets/mode-light.webp'
import darkPreview from '@/assets/mode-dark.webp'
import systemPreview from '@/assets/mode-system.webp'
import { getDesktopClient } from '@/services/request/desktop-client'
import { toast } from 'sonner'

const appIconImages = import.meta.glob('../../../../resources/app-icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const modes = [
  { value: 'system', label: '跟随系统', image: systemPreview },
  { value: 'light', label: '浅色', image: lightPreview },
  { value: 'dark', label: '深色', image: darkPreview },
] as const
const typographyGroups = [
  { id: 'ui', title: '界面', options: [{ value: 'geist', label: 'Geist' }, { value: 'system', label: '系统默认' }], sample: '会话名称 · 按钮 · 辅助文字' },
  { id: 'content', title: '内容', options: [{ value: 'ui', label: '跟随界面字体' }, { value: 'geist', label: 'Geist' }, { value: 'system', label: '系统默认' }, { value: 'serif', label: '系统衬线' }], sample: '今天也来写点什么，看看标题与正文。' },
  { id: 'code', title: '代码', options: [{ value: 'system', label: '系统等宽' }, { value: 'menlo', label: 'Menlo' }], sample: 'const bobo = "你好"' },
] as const

function FontSizeInput({ group, value }: { group: TypographyGroup; value: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const control = typographyControls[group]
  const change = (next: number) => {
    if (!Number.isInteger(next) || next < control.min || next > control.max) return
    setDraft(null)
    previewAppearance({ typography: { [group]: { sizePx: next } } })
  }
  return <div className="flex items-center gap-1">
    <Button type="button" size="icon-xs" variant="secondary" aria-label={`减小${group === 'ui' ? '界面' : group === 'content' ? '内容' : '代码'}字号`} onClick={() => change(value - control.step)} disabled={value <= control.min}>−</Button>
    <Input className="w-16 text-center tabular-nums" type="number" inputMode="numeric" min={control.min} max={control.max} step={control.step} aria-label={`${group === 'ui' ? '界面' : group === 'content' ? '内容' : '代码'}字号（像素）`}
      value={draft ?? value} onChange={event => { setDraft(event.target.value); if (event.target.value) change(Number(event.target.value)) }}
      onBlur={() => setDraft(null)} />
    <Button type="button" size="icon-xs" variant="secondary" aria-label={`增大${group === 'ui' ? '界面' : group === 'content' ? '内容' : '代码'}字号`} onClick={() => change(value + control.step)} disabled={value >= control.max}>+</Button>
  </div>
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="appearance-color" title={`选择${label}`}>
    <span className="color-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
    <span>{value.toUpperCase()}</span>
    <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} />
  </label>
}

export function AppearanceSettings() {
  const [resetOpen, setResetOpen] = useState(false)
  const [iconStatus, setIconStatus] = useState<AppIconStatus | null>(null)
  useEffect(() => {
    const api = getDesktopClient()
    if (!api) return
    let live = true
    void api.request('getAppIconStatus', undefined).then(value => { if (live) setIconStatus(value) }).catch(error => toast.error(String(error)))
    const dispose = api.subscribe(event => { if (event.type === 'app-icon:changed' && live) setIconStatus(event.status) })
    return () => { live = false; dispose() }
  }, [])
  const { preview, status, error } = useAppearance()
  useEffect(() => { if (error) toast.error(error) }, [error])
  useEffect(() => { if (preview.diagnostic) toast.warning(preview.diagnostic) }, [preview.diagnostic])
  const disabledIds = usePlugins(state => state.settings.disabledIds)
  const themes = availableThemes(disabledIds)
  const p = preview.preferences, mode = preview.resolvedMode
  const scenic = Boolean(p.background.assetId)
  const glassOpacity = Math.round((p.background.glassOpacity ?? defaultGlassOpacity[mode]) * 100)
  const overlayOpacity = Math.round((p.background.overlayOpacity ?? appearanceDefaults.background.overlayOpacity) * 100)
  const blurRadius = p.background.blurRadius ?? appearanceDefaults.background.blurRadius
  const theme = resolveAppearanceTheme(p, mode, disabledIds)
  const setColor = (key: keyof ThemeOverrides, value: string | null) => previewAppearance({ customColors: { [mode]: { [key]: value } } })
  return <section className="appearance-settings settings-document">
    <header className="settings-document-heading">
      <h2>外观</h2>
      <Popover open={resetOpen} onOpenChange={setResetOpen}>
        <PopoverTrigger render={<Button variant="secondary" size="sm" aria-label="恢复默认外观" disabled={preview.readOnly || status === 'saving'} />}><RefreshCw />重置</PopoverTrigger>
        <PopoverContent align="end">
          <PopoverHeader><PopoverTitle>恢复默认外观？</PopoverTitle></PopoverHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setResetOpen(false)}>取消</Button>
            <Button size="sm" disabled={preview.readOnly || status === 'saving'} onClick={() => { setResetOpen(false); void appearanceAction('resetAppearance') }}>确认重置</Button>
          </div>
        </PopoverContent>
      </Popover>
    </header>
    {error && status === 'error' && <Button variant="secondary" size="sm" onClick={() => void flushAppearance()}>重试保存</Button>}
    <fieldset disabled={preview.readOnly}>
      <legend className="settings-section-title">视觉风格</legend>
      <Card className="mb-4 gap-0 p-0"><CardContent className="appearance-mode-row mb-0">
        <span>模式</span>
        <div className="appearance-modes">
          {modes.map(item => <Button variant="ghost" size="content" key={item.value} type="button" aria-label={item.label} title={item.label} aria-pressed={p.mode === item.value} className="theme-card" onClick={() => previewAppearance({ mode: item.value })}>
            <img src={item.image} alt="" />
            <span className="sr-only">{item.label}</span>
          </Button>)}
        </div>
      </CardContent></Card>
      <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
        {(['light', 'dark'] as const).filter(value => p.mode === 'system' || p.mode === value).map(value => <div className="appearance-row" key={value}>
          <label htmlFor={`theme-${value}`}>{p.mode === 'system' ? value === 'light' ? '浅色主题' : '深色主题' : '主题'}</label>
          <SelectField id={`theme-${value}`} aria-label={value === 'light' ? '浅色配色' : '深色配色'} value={resolveTheme(value, p.themeIds[value], disabledIds).id} onValueChange={selectedValue => previewAppearance({ themeIds: { [value]: selectedValue }, customColors: { [value]: { accent: null, background: null, foreground: null } } })} options={themes.filter(t => t.mode === value).map(t => ({ value: t.id, label: t.name }))} />
        </div>)}
        <div className="appearance-row">
          <span>强调色</span>
          <div className="appearance-row-controls">
            <SelectField aria-label="强调色来源" value={p.customColors[mode].accent ? 'custom' : 'theme'} onValueChange={selectedValue => setColor('accent', selectedValue === 'theme' ? null : theme.accent)} options={[{ value: 'theme', label: '主题' }, { value: 'custom', label: '自定义' }]} />
            <ColorControl label="强调色" value={theme.accent} onChange={value => setColor('accent', value)} />
          </div>
        </div>
        {!scenic && <><div className="appearance-row"><span>背景</span><ColorControl label="背景色" value={theme.surface} onChange={value => setColor('background', value)} /></div>
        <div className="appearance-row"><span>前景</span><ColorControl label="前景色" value={theme.foreground} onChange={value => setColor('foreground', value)} /></div></>}
        <div className="appearance-row"><label htmlFor="appearance-zoom" title="同步调整文字、图标与布局大小">界面缩放</label>
          <SelectField id="appearance-zoom" value={p.zoomFactor} onValueChange={selectedValue => previewAppearance({ zoomFactor: Number(selectedValue) })} options={zoomFactors.map(value => ({ value: value, label: `${Math.round(value * 100)}%${value === 1 ? '（默认）' : ''}` }))} />
        </div>
      </CardContent></Card>
      {preview.resolvedThemeId !== p.themeIds[mode] && <p className="field-hint mt-2">原主题插件已停用，暂用 BoAI 配色。重新启用插件后恢复原选择。</p>}
      <section className="appearance-advanced" aria-labelledby="appearance-typography-heading">
        <div className="flex items-center justify-between gap-2"><h3 id="appearance-typography-heading" className="settings-section-title">字体</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => previewAppearance({ typography: typographyDefaults })}>重置字体</Button></div>
        <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
          {typographyGroups.map(group => <div className="py-3" key={group.id}>
            <div className="appearance-row"><label htmlFor={`appearance-${group.id}-family`}>{group.title}字体</label>
              <SelectField id={`appearance-${group.id}-family`} value={p.typography[group.id].family} options={[...group.options]} onValueChange={family => previewAppearance({ typography: { [group.id]: { family } } })} />
            </div>
            <div className="appearance-row"><span>{group.title}字号</span><FontSizeInput group={group.id} value={p.typography[group.id].sizePx} /></div>
            <p className="m-0 text-muted-foreground" style={{ fontFamily: `var(--font-${group.id}-family)`, fontSize: `var(--text-${group.id}-body)` }}>{group.sample}</p>
          </div>)}
        </CardContent></Card>
      </section>
      {iconStatus?.platform === 'macos' && <section className="appearance-advanced" aria-labelledby="appearance-icon-heading">
        <div className="flex items-center justify-between gap-2"><h3 id="appearance-icon-heading" className="settings-section-title">应用图标</h3>
          <Button type="button" variant="ghost" size="sm" disabled={p.appIconId === defaultAppIconId} onClick={() => previewAppearance({ appIconId: defaultAppIconId })}>恢复默认图标</Button></div>
        <Card className="gap-0 p-0"><CardContent className="py-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2" role="group" aria-label="选择应用图标">
            {appIconPresets.map(icon => <Button type="button" key={icon.id} variant="ghost" size="content" aria-label={icon.name} aria-pressed={p.appIconId === icon.id}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-2 aria-pressed:bg-accent aria-pressed:shadow-sm" onClick={() => previewAppearance({ appIconId: icon.id })}>
              <img src={appIconImages[`../../../../resources/app-icons/${icon.id}.png`]} width="44" height="44" alt="" />
              <span className="w-full truncate text-center text-xs">{icon.name}</span>
            </Button>)}
          </div>
          {iconStatus.environment === 'development' ? <p className="field-hint mt-3">开发模式：仅更改当前进程的 Dock 图标。</p> :
            <p className="field-hint mt-3">{iconStatus.pending ? '正在应用图标…' : iconStatus.dock.error || iconStatus.installed.error
              ? `Dock：${iconStatus.dock.error ? '未更新' : '已更新'}；安装图标：${iconStatus.installed.error ? '未更新' : '已更新'}`
              : 'Dock 与当前安装应用图标已更新。'}</p>}
          {!iconStatus.pending && (iconStatus.dock.error || iconStatus.installed.error) && <Button type="button" variant="secondary" size="sm" onClick={() => void getDesktopClient()?.request('retryAppIcon', undefined).then(setIconStatus).catch(error => toast.error(String(error)))}>重试应用</Button>}
        </CardContent></Card>
      </section>}
      <section className="appearance-advanced" aria-labelledby="appearance-advanced-heading">
        <h3 id="appearance-advanced-heading" className="settings-section-title">背景图片</h3>
        <Card className="gap-0 p-0"><CardContent><FieldGroup className="gap-0">
          <Field orientation="responsive" className="py-4">
            <FieldContent><FieldTitle>图片换肤<Tooltip>
              <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="图片换肤说明" />}><InfoIcon /></TooltipTrigger>
              <TooltipContent align="start"><span>{scenic ? '已启用玻璃效果，跟随当前明暗模式。移除图片后恢复纯色背景。' : '选择图片，使用全窗背景和玻璃面板，支持浅色、深色和跟随系统。'}<br />PNG、JPEG、WebP，最大 10 MiB。</span></TooltipContent>
            </Tooltip></FieldTitle></FieldContent>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('importAppearanceBackground')}>{p.background.assetId ? '更换图片' : '选择图片'}</Button>
              {p.background.assetId && <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('removeAppearanceBackground')}>移除图片</Button>}
            </div>
          </Field>
          {p.background.assetId && <>
            <div className="pb-4"><img className="appearance-background-preview" src={`boai-asset://appearance/${p.background.assetId}`} alt="当前背景图片" /></div>
            <Card size="sm" className="mb-4 gap-0 p-0"><CardContent className="soft-divide-y">
              {([
                { key: 'glassOpacity', label: '毛玻璃不透明度', value: glassOpacity, max: 100, unit: '%', scale: 100 },
                { key: 'overlayOpacity', label: '遮罩浓度', value: overlayOpacity, max: 100, unit: '%', scale: 100 },
                { key: 'blurRadius', label: '模糊度', value: blurRadius, max: maxBackgroundBlur, unit: 'px', scale: 1 },
              ] as const).map(control => <div key={control.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 py-3 @md/field-group:grid-cols-[7rem_minmax(0,1fr)_3rem]">
                <FieldTitle id={`appearance-${control.key}-label`}>{control.label}</FieldTitle>
                <Slider className="col-span-2 row-start-2 @md/field-group:col-span-1 @md/field-group:col-start-2 @md/field-group:row-start-1"
                  aria-labelledby={`appearance-${control.key}-label`} value={[control.value]} min={0} max={control.max} step={1} disabled={preview.readOnly}
                  onValueChange={value => previewAppearance({ background: { [control.key]: (typeof value === 'number' ? value : value[0]) / control.scale } })} />
                <span className="col-start-2 row-start-1 text-right text-sm tabular-nums text-muted-foreground @md/field-group:col-start-3">{control.value}{control.unit}</span>
              </div>)}
            </CardContent></Card>
          </>}
        </FieldGroup></CardContent></Card>
      </section>
    </fieldset>
  </section>
}
