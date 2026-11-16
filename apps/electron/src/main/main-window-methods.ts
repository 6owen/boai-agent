/*
 * [OUTPUT]: 技能安装终端仅可信主窗准入，公共CLI/Agent不能启动安装。
 * [INPUT]: Requests whose sender and main frame have already been verified by Main.
 * [OUTPUT]: Public methods plus the two UI-only canvas operations; runtime host calls remain private.
 * [POS]: Trusted main-window admission, separate from public CLI/transport admission.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import type { Method } from '@boai/shared/ipc'
import { isPublicMethod } from '@boai/shared/ipc/public-methods'

export function isMainWindowMethod(value: string): value is Method {
  return value === 'skillInstallationTerminal' || value === 'canvasCommand' || value === 'canvasFlushed' || isPublicMethod(value)
}
