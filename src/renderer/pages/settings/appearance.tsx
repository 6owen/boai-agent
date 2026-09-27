/*
 * [INPUT]: 共享外观偏好、真实界面缩略图及受控桌面操作、统一 UI 基础组件。
 * [OUTPUT]: 紧凑分组的模式、主题、颜色、字体、缩放和背景图片设置。
 * [POS]: 设置页外观分区；使用统一预览和持久化流程。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { themes, resolveTheme, customizeTheme, zoomFactors, type InterfaceFont, type ThemeOverrides } from '@shared/appearance'
import { useAppearance, previewAppearance, flushAppearance, appearanceAction } from '@/stores/appearance'
import { Banner, Field } from '@/components/common'
import { Check, ChevronRight } from '@/components/icons'
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
  return <section className="appearance-settings">
    <div className="appearance-heading">
      <h2>外观</h2>
      <span className="save-status" data-state={status} role="status">
        {status === 'saved' && <Check size={12} />}
        {status === 'saving' ? '保存中…' : status === 'error' ? '未保存' : '已保存'}
      </span>
    </div>
    {(error || preview.diagnostic) && <Banner>{error || preview.diagnostic}{error && status === 'error' && <Button variant="secondary" size="sm" onClick={() => void flushAppearance()}>重试保存</Button>}</Banner>}
    <fieldset disabled={preview.readOnly}>
      <legend className="appearance-section-title">视觉风格</legend>
      <Card className="mb-4 gap-0 p-0"><CardContent className="appearance-mode-row mb-0">
        <span>模式</span>
        <div className="appearance-modes">
          {modes.map(item => <Button variant="ghost" size="content" key={item.value} type="button" aria-label={item.label} title={item.label} aria-pressed={p.mode === item.value} className="theme-card" onClick={() => previewAppearance({ mode: item.value })}>
            <img src={item.image} alt="" />
            <span className="sr-only">{item.label}</span>
          </Button>)}
        </div>
      </CardContent></Card>
      <Card className="gap-0 p-0"><CardContent className="appearance-options">
        {(['light', 'dark'] as const).filter(value => p.mode === 'system' || p.mode === value).map(value => <div className="appearance-row" key={value}>
          <label htmlFor={`theme-${value}`}>{p.mode === 'system' ? value === 'light' ? '浅色主题' : '深色主题' : '主题'}</label>
          <NativeSelect id={`theme-${value}`} aria-label={value === 'light' ? '浅色配色' : '深色配色'} value={p.themeIds[value]} onChange={event => previewAppearance({ themeIds: { [value]: event.target.value }, customColors: { [value]: { accent: null, background: null, foreground: null } } })}>
            {themes.filter(t => t.mode === value).map(t => <NativeSelectOption key={t.id} value={t.id}>{t.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>)}
        <div className="appearance-row">
          <span>强调色</span>
          <div className="appearance-row-controls">
            <NativeSelect aria-label="强调色来源" value={p.customColors[mode].accent ? 'custom' : 'theme'} onChange={event => setColor('accent', event.target.value === 'theme' ? null : theme.accent)}>
              <NativeSelectOption value="theme">主题</NativeSelectOption><NativeSelectOption value="custom">自定义</NativeSelectOption>
            </NativeSelect>
            <ColorControl label="强调色" value={theme.accent} onChange={value => setColor('accent', value)} />
          </div>
        </div>
        <div className="appearance-row"><span>背景</span><ColorControl label="背景色" value={theme.surface} onChange={value => setColor('background', value)} /></div>
        <div className="appearance-row"><span>前景</span><ColorControl label="前景色" value={theme.foreground} onChange={value => setColor('foreground', value)} /></div>
        <div className="appearance-row"><label htmlFor="appearance-font">字体</label>
          <NativeSelect id="appearance-font" value={p.fontFamily} onChange={event => previewAppearance({ fontFamily: event.target.value as InterfaceFont })}><NativeSelectOption value="geist">Geist</NativeSelectOption><NativeSelectOption value="system">系统默认</NativeSelectOption></NativeSelect>
        </div>
        <div className="appearance-row"><label htmlFor="appearance-zoom" title="同步调整文字、图标与布局大小">界面缩放</label>
          <NativeSelect id="appearance-zoom" value={p.zoomFactor} onChange={event => previewAppearance({ zoomFactor: Number(event.target.value) })}>{zoomFactors.map(value => <NativeSelectOption key={value} value={value}>{Math.round(value * 100)}%{value === 1 ? '（默认）' : ''}</NativeSelectOption>)}</NativeSelect>
        </div>
      </CardContent></Card>
      <div className="appearance-footer">
        <details className="appearance-advanced">
          <summary>高级<ChevronRight size={13} /></summary>
          <div className="appearance-section">
            <div className="appearance-section-heading"><div><h3>背景图片</h3><p className="field-hint">PNG、JPEG、WebP，最大 10 MiB。</p></div>
              <div className="button-row">
                <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('importAppearanceBackground')}>{p.background.assetId ? '更换图片' : '选择图片'}</Button>
                {p.background.assetId && <Button variant="secondary" size="sm" disabled={status === 'saving'} onClick={() => void appearanceAction('removeAppearanceBackground')}>移除图片</Button>}
              </div>
            </div>
            <Field label={`图片不透明度 · ${Math.round(p.background.imageOpacity * 100)}%`}>
              <input aria-label="图片不透明度" type="range" min="0" max="100" value={Math.round(p.background.imageOpacity * 100)} onChange={event => previewAppearance({ background: { imageOpacity: Number(event.target.value) / 100 } })} onPointerUp={() => void flushAppearance()} onKeyUp={() => void flushAppearance()} />
            </Field>
            <p className="field-hint">当前编辑{mode === 'light' ? '浅色' : '深色'}颜色；明暗模式分别保存。Nord 与 Catppuccin 配色来自 Base46（MIT），Geist 字体采用 OFL 许可。</p>
          </div>
        </details>
        <Button variant="ghost" size="content" className="appearance-reset" aria-label="恢复默认外观" disabled={status === 'saving'} onClick={() => void appearanceAction('resetAppearance')}>重置为默认设置</Button>
      </div>
    </fieldset>
  </section>
}
