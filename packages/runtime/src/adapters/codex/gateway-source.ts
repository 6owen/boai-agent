/*
 * [INPUT]: Saved gateway source, selected model, private credential and inherited process environment.
 * [OUTPUT]: Unique per-process Responses provider; credential only enters the child environment, never argv/config files.
 * [POS]: Codex explicit model source without rewriting personal native settings or capabilities.
 * [PROTOCOL]: Update Header and directory .folder.md when changing this adapter.
 */
import { randomUUID } from 'node:crypto'
import type { Connection } from '@boai/shared/domain'
import { codexGatewayProvider } from '@boai/shared/domain/codex-provider'
import { gatewayApiKey } from '@boai/shared/domain/model-gateway'

export function codexGatewaySource(connection: Connection, selected: string, key: string, inherited: NodeJS.ProcessEnv) {
  const provider = codexGatewayProvider(connection, selected)
  // A fresh name cannot merge with an inherited provider's headers/auth command.
  const providerId = `boai_gateway_${randomUUID().replaceAll('-', '')}`
  const envKey = 'BOAI_CODEX_GATEWAY_API_KEY'
  const config = { name: 'BOAI model gateway', base_url: provider.baseUrl, wire_api: 'responses', env_key: envKey, requires_openai_auth: false, supports_websockets: false }
  const table = Object.entries(config).map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(', ')
  const env: NodeJS.ProcessEnv = { ...inherited, [envKey]: gatewayApiKey(connection, key) }
  for (const name of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_MODEL_PROVIDER']) delete env[name]
  return { providerId, model: provider.model, env,
    args: ['-c', `model_providers.${providerId}={ ${table} }`, '-c', `model_provider=${JSON.stringify(providerId)}`, '-c', `model=${JSON.stringify(provider.model)}`] }
}
