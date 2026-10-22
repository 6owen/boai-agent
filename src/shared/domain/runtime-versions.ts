/*
 * [INPUT]: Compiled application input identity, installed runtime packages and original launch-profile verification.
 * [OUTPUT]: Compiled application input provenance and runtime versions with explicit unknown states; no launch paths, arguments or credentials.
 * [POS]: Shared read-only desktop/CLI runtime inventory.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
export interface RuntimeVersions {
  application: { version: string | null; inputHash: string | null; source: 'compiled-inputs' | 'unknown' }
  node: string
  mastra: { package: '@mastra/core'; version: string; source: 'installed-package' }
  programs: {
    profileId: string
    revision: number
    protocol: 'acp' | 'codex-app-server' | 'claude-cli' | 'runtime-plugin'
    employeeIds: string[]
    availability: 'available' | 'changed' | 'unavailable'
    checkedAt: string
    version: string | null
    source: 'verified-program' | 'unknown'
    lastVerification?: { version: string; protocolVersion: number; checkedAt: string }
  }[]
  plugins: {
    id: string
    providerId: string
    version: string | null
    registeredVersion: string
    packageHash: string
    runtimeApiVersion: number
    enabled: boolean
    inUse: number
    source: 'verified-package' | 'unknown'
  }[]
}
