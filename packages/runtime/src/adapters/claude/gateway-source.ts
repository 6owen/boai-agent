/*
 * [INPUT]: A verified Magpie connection, selected model, credential and inherited process environment.
 * [OUTPUT]: Per-process Messages routing plus shared loopback proxy exclusions; native source and remote proxy settings stay intact.
 * [POS]: Claude explicit gateway source and native-process loopback transport; no global configuration writes.
 * [PROTOCOL]: Update Header and claude/.folder.md when changing this module.
 */
import type { Connection } from '@boai/shared/domain'
import { claudeProvider } from '@boai/shared/domain/claude-provider'
import { gatewayApiKey, isLoopbackGateway } from '@boai/shared/domain/model-gateway'

/** Keep local model/MCP requests owned by this CLI instead of an inherited proxy process. */
export function claudeLoopbackEnvironment(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const exclusions = [...new Set([...(inherited.NO_PROXY ?? '').split(','), ...(inherited.no_proxy ?? '').split(','), '127.0.0.1', 'localhost', '::1'].map(value => value.trim()).filter(Boolean))].join(',')
  return { ...inherited, NO_PROXY: exclusions, no_proxy: exclusions }
}

export function claudeGatewayEnvironment(connection: Connection, model: string, key: string, inherited: NodeJS.ProcessEnv, effort?: string): NodeJS.ProcessEnv {
  if (!connection.gateway) throw new Error('需要明确的Magpie连接')
  const provider = claudeProvider(connection, model), env = isLoopbackGateway(provider.baseUrl) ? claudeLoopbackEnvironment(inherited) : { ...inherited }
  for (const name of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_GATEWAY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CODE_EFFORT_LEVEL']) delete env[name]
  const apiKey = gatewayApiKey(connection, key)
  Object.assign(env, { CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ANTHROPIC_BASE_URL: provider.baseUrl,
    ANTHROPIC_API_KEY: apiKey, ANTHROPIC_AUTH_TOKEN: apiKey, ANTHROPIC_MODEL: provider.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.model, ANTHROPIC_DEFAULT_SONNET_MODEL: provider.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.model, CLAUDE_CODE_SUBAGENT_MODEL: provider.model,
    ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {}) })
  return env
}
