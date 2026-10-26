/*
 * [INPUT]: Runtime construction dependencies and lifecycle.
 * [OUTPUT]: Public runtime bootstrap; business modules remain internal.
 * [POS]: @boai/runtime public entry.
 * [PROTOCOL]: Update package exports and .folder.md when changed.
 */
export { startOwnedRuntime } from './bootstrap'
export type { AgentEngine, SecretStore } from './contracts'
