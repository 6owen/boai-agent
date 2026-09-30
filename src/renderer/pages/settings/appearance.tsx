/*
 * [INPUT]: 共享外观偏好、真实界面缩略图及受控桌面操作、统一 UI 基础组件。
 * [OUTPUT]: 下拉字段统一使用 shadcn Select；外观按实际内容宽度换行，图片动作在窄栏仍可达；共用设置文档布局、无保存状态提示的外观页面；Card 分组的视觉/高级设置和 Slider 背景透明度，保留即时预览、保存与错误重试。
 * [POS]: 设置页外观分区；使用统一预览和持久化流程。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { themes, resolveTheme, customizeTheme, zoomFactors, type InterfaceFont, type ThemeOverrides } from '@shared/appearance'
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
  const { preview, status, error } = useAppearance()
  const p = preview.preferences, mode = preview.resolvedMode
  const theme = customizeTheme(resolveTheme(mode, p.themeIds[mode]), p.customColors[mode])
  const setColor = (key: keyof ThemeOverrides, value: string | null) => previewAppearance({ customColors: { [mode]: { [key]: value } } })
  return <section className="appearance-settings settings-document">
    <header className="settings-document-heading">
      <h2>外观</h2>
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
          <SelectField id={`theme-${value}`} aria-label={value === 'light' ? '浅色配色' : '深色配色'} value={p.themeIds[value]} onValueChange={selectedValue => previewAppearance({ themeIds: { [value]: selectedValue }, customColors: { [value]: { accent: null, background: null, foreground: null } } })} options={themes.filter(t => t.mode === value).map(t => ({ value: t.id, label: t.name }))} />
        </div>)}
        <div className="appearance-row">
          <span>强调色</span>
          <div className="appearance-row-controls">
            <SelectField aria-label="强调色来源" value={p.customColors[mode].accent ? 'custom' : 'theme'} onValueChange={selectedValue => setColor('accent', selectedValue === 'theme' ? null : theme.accent)} options={[{ value: 'theme', label: '主题' }, { value: 'custom', label: '自定义' }]} />
            <ColorControl label="强调色" value={theme.accent} onChange={value => setColor('accent', value)} />
          </div>
        </div>
        <div className="appearance-row"><span>背景</span><ColorControl label="背景色" value={theme.surface} onChange={value => setColor('background', value)} /></div>
        <div className="appearance-row"><span>前景</span><ColorControl label="前景色" value={theme.foreground} onChange={value => setColor('foreground', value)} /></div>
        <div className="appearance-row"><label htmlFor="appearance-font">字体</label>
          <SelectField id="appearance-font" value={p.fontFamily} onValueChange={selectedValue => previewAppearance({ fontFamily: selectedValue as InterfaceFont })} options={[{ value: 'geist', label: 'Geist' }, { value: 'system', label: '系统默认' }]} />
        </div>
        <div className="appearance-row"><label htmlFor="appearance-zoom" title="同步调整文字、图标与布局大小">界面缩放</label>
          <SelectField id="appearance-zoom" value={p.zoomFactor} onValueChange={selectedValue => previewAppearance({ zoomFactor: Number(selectedValue) })} options={zoomFactors.map(value => ({ value: value, label: `${Math.round(value * 100)}%${value === 1 ? '（默认）' : ''}` }))} />
        </div>
      </CardContent></Card>
      <section className="appearance-advanced" aria-labelledby="appearance-advanced-heading">
        <h3 id="appearance-advanced-heading" className="settings-section-title">高级设置</h3>
        <Card className="gap-0 p-0"><CardContent><FieldGroup className="soft-divide-y gap-0">
          <Field orientation="responsive" className="py-4">
            <FieldContent><FieldTitle>背景图片</FieldTitle><FieldDescription>PNG、JPEG、WebP，最大 10 MiB。</FieldDescription></FieldContent>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('importAppearanceBackground')}>{p.background.assetId ? '更换图片' : '选择图片'}</Button>
              {p.background.assetId && <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('removeAppearanceBackground')}>移除图片</Button>}
            </div>
          </Field>
          <Field className="py-4" data-disabled={preview.readOnly || undefined}>
            <div className="flex items-center justify-between gap-4"><FieldLabel id="appearance-opacity-label">图片不透明度</FieldLabel><span className="text-sm text-muted-foreground">{Math.round(p.background.imageOpacity * 100)}%</span></div>
            <Slider aria-labelledby="appearance-opacity-label" min={0} max={100} step={1} value={[Math.round(p.background.imageOpacity * 100)]} disabled={preview.readOnly} onValueChange={value => previewAppearance({ background: { imageOpacity: (Array.isArray(value) ? value[0] : value) / 100 } })} onValueCommitted={() => void flushAppearance()} />
          </Field>
        </FieldGroup></CardContent></Card>
        <p className="field-hint mt-3">当前编辑{mode === 'light' ? '浅色' : '深色'}颜色；明暗模式分别保存。Nord 与 Catppuccin 配色来自 Base46（MIT），Geist 字体采用 OFL 许可。</p>
      </section>
      <div className="appearance-footer">
        <Button variant="ghost" size="sm" aria-label="恢复默认外观" disabled={status === 'saving'} onClick={() => void appearanceAction('resetAppearance')}>重置为默认设置</Button>
      </div>
    </fieldset>
  </section>
}
