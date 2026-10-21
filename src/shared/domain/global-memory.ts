/*
 * [INPUT]: Owner-selected user-memory provider and fixed local Memmy endpoint.
 * [OUTPUT]: Versioned provider selection and observable readiness without credential disclosure.
 * [POS]: Shared configuration contract; actual history and source authority stay in the runtime.
 * [PROTOCOL]: Update Header and shared/domain/.folder.md when changed.
 */
export type UserMemoryProviderId = 'local' | 'memmy'
export interface UserMemorySettings {
  revision: number
  provider: UserMemoryProviderId
  endpoint: string
  hasToken: boolean
}
export interface UserMemoryStatus {
  settings: UserMemorySettings
  reachable: boolean
  serviceVersion?: string
  storageReady?: boolean
  modelsReady?: boolean
  error?: string
  sync?: { pending: number; unknown: number }
}
