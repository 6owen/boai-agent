// Compatibility facade during B1–B3 / F1. New code should use domain, ipc or runtime contracts.
export * from './domain'
export * from './ipc'
// Type-only legacy export; remove after external adapters migrate in E1. Never send these over IPC.
export type { AgentEngine, EngineContext, SecretStore } from '../runtime/contracts'
