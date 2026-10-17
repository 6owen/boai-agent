/*
 * [INPUT]: Explicit real-test runtime, isolated configuration directory, local endpoint and catalog entry.
 * [OUTPUT]: Fresh native-owned provider files without prewritten Codex trust; pure writer also serves explicit-directory tests.
 * [POS]: G2a real-file acceptance preparation, separate from production source resolution.
 * [PROTOCOL]: Update fixtures/.folder.md and retain any changed batch configuration evidence.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { vi } from 'vitest'
type NativeModel = { id: string; context_window?: number; max_output_tokens?: number; reasoning?: boolean }
export async function nativeMagpieProfile(runtime: string, home: string, endpoint: string, model: NativeModel) {
  const config = join(home, 'native-config'); await mkdir(config, { recursive: true })
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('BOAI_NATIVE_MAGPIE_KEY', 'magpie-boai')
  for (const key of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_DIR', 'OPENAI_BASE_URL', 'OPENAI_API_KEY']) vi.stubEnv(key, undefined)
  vi.stubEnv('CODEX_HOME', config); vi.stubEnv('CLAUDE_CONFIG_DIR', config); vi.stubEnv('PI_CODING_AGENT_DIR', config); vi.stubEnv('OPENCODE_CONFIG', join(config, 'opencode.json'))
  for (const [key, path] of Object.entries({ XDG_CONFIG_HOME: '.config', XDG_DATA_HOME: '.local/share', XDG_CACHE_HOME: '.cache', XDG_STATE_HOME: '.local/state' })) vi.stubEnv(key, join(home, path))
  vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1'); vi.stubEnv('DISABLE_AUTOUPDATER', '1'); vi.stubEnv('DISABLE_TELEMETRY', '1')
  if (runtime === 'claude') await writeFile(join(home, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: ['magpie-boai'], rejected: [] } }))
  return writeNativeMagpieProfile(runtime, config, endpoint, model)
}
/** Writes only the caller's explicit directory; does not change process environment or user home. */
export async function writeNativeMagpieProfile(runtime: string, config: string, endpoint: string, model: NativeModel) {
  await mkdir(config, { recursive: true })
  const files: Record<string, string> = {}
  if (runtime === 'codex') files[join(config, 'config.toml')] = `model = "${model.id}"\nmodel_provider = "native_magpie"\n[model_providers.native_magpie]\nname = "Native Magpie"\nbase_url = "${endpoint}/v1"\nwire_api = "responses"\nenv_key = "BOAI_NATIVE_MAGPIE_KEY"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`
  else if (runtime === 'claude') {
    files[join(config, 'settings.json')] = JSON.stringify({ model: model.id, env: { ANTHROPIC_BASE_URL: endpoint, ANTHROPIC_API_KEY: 'magpie-boai', ANTHROPIC_AUTH_TOKEN: 'magpie-boai', ANTHROPIC_MODEL: model.id, ANTHROPIC_DEFAULT_SONNET_MODEL: model.id, ANTHROPIC_DEFAULT_HAIKU_MODEL: model.id, ANTHROPIC_DEFAULT_OPUS_MODEL: model.id } })
  } else if (runtime === 'pi') {
    files[join(config, 'settings.json')] = JSON.stringify({ defaultProvider: 'native_magpie', defaultModel: model.id })
    files[join(config, 'models.json')] = JSON.stringify({ providers: { native_magpie: { api: 'openai-completions', baseUrl: `${endpoint}/v1`, apiKey: '$BOAI_NATIVE_MAGPIE_KEY', models: [{ id: model.id, name: model.id, reasoning: model.reasoning, ...(model.context_window ? { contextWindow: model.context_window } : {}), ...(model.max_output_tokens ? { maxTokens: model.max_output_tokens } : {}) }] } } })
  } else if (runtime === 'opencode') files[join(config, 'opencode.json')] = JSON.stringify({ $schema: 'https://opencode.ai/config.json', model: `native_magpie/${model.id}`, small_model: `native_magpie/${model.id}`, provider: { native_magpie: { npm: '@ai-sdk/openai-compatible', options: { baseURL: `${endpoint}/v1`, apiKey: '{env:BOAI_NATIVE_MAGPIE_KEY}' }, models: { [model.id]: { name: model.id, ...(model.context_window && model.max_output_tokens ? { limit: { context: model.context_window, output: model.max_output_tokens } } : {}) } } } } })
  else throw new Error('Unknown native test runtime')
  for (const [path, content] of Object.entries(files)) await writeFile(path, content)
  return files
}
