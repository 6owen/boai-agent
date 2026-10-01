/*
 * [INPUT]: 原浏览器平台边角与当前语义颜色。
 * [OUTPUT]: 保留旧圆角/边缘反馈，使用现有 accent 和静态 shadow。
 * [POS]: src/shared/ipc/browser-live-fx.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export type BrowserLiveFxPlatform = 'darwin' | 'win32' | 'linux' | 'other'

export interface BrowserLiveFxCornerRadii {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

export const BROWSER_LIVE_FX_BORDER = {
  width: '1.5px',
  style: 'solid',
  color: 'var(--accent)',
  boxShadow:
    'inset 0 0 0 1px var(--accent), inset 0 0 20px rgba(59, 130, 246, 0.28)',
} as const

/**
 * Return border color + boxShadow with a concrete accent color value.
 * Use this when injecting styles into a foreign DOM (e.g. CDP overlay)
 * where `var(--accent)` would resolve against the website's stylesheet.
 */
export function resolveBrowserLiveFxBorder(accentColor: string): { color: string; boxShadow: string } {
  return {
    color: accentColor,
    boxShadow: `inset 0 0 0 1px ${accentColor}, inset 0 0 20px rgba(59, 130, 246, 0.28)`,
  }
}

export function getBrowserLiveFxCornerRadii(platform: BrowserLiveFxPlatform): BrowserLiveFxCornerRadii {
  const bottomRadius = platform === 'darwin' ? 16 : platform === 'win32' ? 8 : 6

  return {
    topLeft: '0px',
    topRight: '0px',
    bottomLeft: `${bottomRadius}px`,
    bottomRight: `${bottomRadius}px`,
  }
}
