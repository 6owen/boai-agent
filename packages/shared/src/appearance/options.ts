/*
 * [INPUT]: Existing appearance defaults, typography/icon catalogs and current host/plugin availability.
 * [OUTPUT]: Bounded machine-readable field choices and active/compatibility semantics without palettes or image bytes.
 * [POS]: Read-only appearance configuration discovery; no second writable preferences store.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { appearanceDefaults, appIconPresets, availableThemes, maxBackgroundBlur, typographyControls, typographyFamilies, zoomFactors } from './index'

export function appearanceOptions(input: { disabledPluginIds?: readonly string[]; platform: string; hasBackground: boolean }) {
  const defaults = structuredClone(appearanceDefaults)
  return {
    contractVersion: 2,
    themes: availableThemes(input.disabledPluginIds).map(({ id, name, mode }) => ({ id, name, mode })),
    fields: [
      { path: 'mode', label: '明暗模式', default: defaults.mode, options: ['system', 'light', 'dark'] },
      ...(['light', 'dark'] as const).flatMap(mode => [
        { path: `themeIds.${mode}`, label: mode === 'light' ? '浅色主题' : '深色主题', default: defaults.themeIds[mode], optionsSource: 'themes', mode, effect: '清除本模式自定义颜色；同次明确提供的新颜色优先' },
        ...(['accent', 'background', 'foreground'] as const).map(color => ({ path: `customColors.${mode}.${color}`, label: `${mode === 'light' ? '浅色' : '深色'}${{ accent: '强调色', background: '背景色', foreground: '前景色' }[color]}`, default: defaults.customColors[mode][color], format: '#RRGGBB', nullable: true, active: color === 'accent' || !input.hasBackground, condition: color === 'accent' ? '始终生效' : '无背景图片时生效' })),
      ]),
      ...(['ui', 'content', 'code'] as const).flatMap(group => [
        { path: `typography.${group}.family`, label: `${{ ui: '界面', content: '内容', code: '代码' }[group]}字体`, default: defaults.typography[group].family, options: Object.keys(typographyFamilies[group]) },
        { path: `typography.${group}.sizePx`, label: `${{ ui: '界面', content: '内容', code: '代码' }[group]}字号`, default: defaults.typography[group].sizePx, unit: 'px', min: typographyControls[group].min, max: typographyControls[group].max, step: typographyControls[group].step, advanced: group === 'content', effect: group === 'ui' ? '未显式指定内容字号时同步内容字号' : undefined },
      ]),
      { path: 'zoomFactor', label: '界面缩放', default: defaults.zoomFactor, options: [...zoomFactors], min: 0.75, max: 1.5, compatibility: '范围内旧值仍可读取和设置，普通操作使用 options' },
      { path: 'appIconId', label: '应用图标', default: defaults.appIconId, options: appIconPresets, supported: input.platform === 'darwin', effect: '保存选择与系统目标结果分开，以 appearance.iconStatus 核对' },
      { path: 'background.assetId', label: '背景图片', default: null, readOnly: true, actions: ['appearance.removeBackground'], importAvailable: false },
      ...(['glassOpacity', 'overlayOpacity', 'blurRadius'] as const).map(key => ({ path: `background.${key}`, label: { glassOpacity: '玻璃不透明度', overlayOpacity: '遮罩不透明度', blurRadius: '背景模糊' }[key], default: defaults.background[key], min: 0, max: key === 'blurRadius' ? maxBackgroundBlur : 1, unit: key === 'blurRadius' ? 'px' : 'ratio', integer: key === 'blurRadius', nullable: key === 'glassOpacity', active: input.hasBackground, condition: '有背景图片时生效' })),
      { path: 'fontFamily', label: '旧界面字体别名', compatibility: true, aliasFor: 'typography.ui.family' },
      { path: 'background.imageOpacity', label: '旧图片透明度', default: defaults.background.imageOpacity, compatibility: true, active: false, min: 0, max: 1 },
    ],
  }
}
