import type { DesktopApi } from '@boai/shared/ipc'

/** The only renderer module allowed to touch preload. No cache and no extra subscriptions. */
export function getDesktopClient(): DesktopApi | undefined { return window.boai }
