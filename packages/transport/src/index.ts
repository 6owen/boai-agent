/*
 * [INPUT]: Shared RPC request contracts.
 * [OUTPUT]: Type-only default entry; Node transports require explicit subpaths.
 * [POS]: @boai/transport public entry.
 * [PROTOCOL]: Update package exports and .folder.md when changed.
 */
export type { CliServicePort, CliServiceIdentity } from './channels'
export type { CliClientOptions } from './client'
