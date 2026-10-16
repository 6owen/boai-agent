/*
 * [OUTPUT]: 主题选项仅列可用插件配色，停用回退值与保留的原选择分开显示。
 * [OUTPUT]: 图片下方内嵌卡片展示玻璃/遮罩百分比与0–32px模糊三行Slider，独立预览/保存；重置浮层仅标题与确认/取消。
 * [INPUT]: 共享外观偏好、真实界面缩略图及受控桌面操作、统一 UI 基础组件。
 * [OUTPUT]: 图片换肤直接启用Craft Scenic，说明收进标题右侧图标Tooltip，预览无分割线；标题右侧重置经Popover确认后执行，取消不修改，保留只读和保存期间禁用，无底部说明/操作区。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；外观按实际内容宽度换行，图片动作在窄栏仍可达；共用设置文档布局、无保存状态提示的外观页面；Card 分组的视觉/背景图片设置，保留即时预览、保存与错误重试。
 * [POS]: 设置页外观分区；使用统一预览和持久化流程。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Slider } from '@/components/ui/slider'
import { Field, FieldContent, FieldGroup, FieldTitle } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { InfoIcon, RefreshCw } from '@/components/icons'
import { appearanceDefaults, availableThemes, defaultGlassOpacity, maxBackgroundBlur, resolveTheme, resolveAppearanceTheme, zoomFactors, type InterfaceFont, type ThemeOverrides } from '@shared/appearance'
import { usePlugins } from '@/stores/plugins'
import { useAppearance, previewAppearance, flushAppearance, appearanceAction } from '@/stores/appearance'
import { Banner } from '@/components/common'
import lightPreview from '@/assets/mode-light.webp'
import darkPreview from '@/assets/mode-dark.webp'
import systemPreview from '@/assets/mode-system.webp'

const modes = [
  { value: 'system', label: '跟随系统', image: systemPreview },
  { value: 'light', label: '浅色', image: lightPreview },
  { value: 'dark', label: '深色', image: darkPreview },
] as const

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="appearance-color" title={`选择${label}`}>
    <span className="color-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
    <span>{value.toUpperCase()}</span>
    <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} />
  </label>
}

export function AppearanceSettings() {
  const [resetOpen, setResetOpen] = useState(false)
  const { preview, status, error } = useAppearance()
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
    {(error || preview.diagnostic) && <Banner>{error || preview.diagnostic}{error && status === 'error' && <Button variant="secondary" size="sm" onClick={() => void flushAppearance()}>重试保存</Button>}</Banner>}
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
        <div className="appearance-row"><label htmlFor="appearance-font">字体</label>
          <SelectField id="appearance-font" value={p.fontFamily} onValueChange={selectedValue => previewAppearance({ fontFamily: selectedValue as InterfaceFont })} options={[{ value: 'geist', label: 'Geist' }, { value: 'system', label: '系统默认' }]} />
        </div>
        <div className="appearance-row"><label htmlFor="appearance-zoom" title="同步调整文字、图标与布局大小">界面缩放</label>
          <SelectField id="appearance-zoom" value={p.zoomFactor} onValueChange={selectedValue => previewAppearance({ zoomFactor: Number(selectedValue) })} options={zoomFactors.map(value => ({ value: value, label: `${Math.round(value * 100)}%${value === 1 ? '（默认）' : ''}` }))} />
        </div>
      </CardContent></Card>
      {preview.resolvedThemeId !== p.themeIds[mode] && <p className="field-hint mt-2">原主题插件已停用，暂用 BoAI 配色。重新启用插件后恢复原选择。</p>}
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
