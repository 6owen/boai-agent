/*
 * [INPUT]: Desktop-owned launcher identity and authenticated local service availability.
 * [OUTPUT]: Installation status and compare-before-change revision; no credentials or renderer-selected executable.
 * [POS]: Local desktop CLI installation contract, excluded from public WS channels.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
export type CliInstallation = {
  revision: string
  supported: boolean
  state: 'not-installed' | 'installed' | 'update-available' | 'conflict'
  version: string
  installedVersion?: string
  commandPath?: string
  canUninstall: boolean
  connection: { state: 'connected' | 'unavailable'; version?: string }
}
