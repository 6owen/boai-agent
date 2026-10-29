/*
 * [INPUT]: Packaged desktop updater state and explicit user actions.
 * [OUTPUT]: Main-window-only update API; no employee or runtime RPC access.
 * [POS]: Desktop update contract.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
export interface AppUpdateState {
  revision: number
  currentVersion: string
  phase: 'disabled' | 'idle' | 'checking' | 'downloading' | 'preparing' | 'ready' | 'installing' | 'error'
  availableVersion?: string
  progress?: number
  fallback?: boolean
  releaseNotes?: string
  error?: string
  disabledReason?: string
}
export interface AppUpdatesApi {
  snapshot(): Promise<AppUpdateState>
  check(): Promise<AppUpdateState>
  install(version: string): Promise<void>
}
