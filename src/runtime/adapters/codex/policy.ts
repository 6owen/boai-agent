/*
 * [OUTPUT]: 策略v6在启动与线程同时显式启用系统代理策略；保留私有/公开证据分离及原生审批拒绝/read-only/空环境/禁用工具与宿主审批边界，旧聊天下一次明确交流重建原生映射。
 * [INPUT]: Codex实际配置中仅非秘密的MCP名称和模型提供方名。
 * [OUTPUT]: 禁止原生命令/子代理/插件/hooks/宿主技能继承，配合受控模型目录覆盖模型工具模式；空环境与宿主动态工具分开。
 * [POS]: 原生Codex阶段策略；与真实CLI无工具请求探测一起维护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */

// Apply these before initialize: inherited startup hooks/plugins must never run during a probe.
export const CODEX_VERIFIED_VERSION = '0.159.3'
export const CODEX_EMPLOYEE_POLICY_VERSION = 6
export const codexDisabledFeatures = [
  'shell_tool', 'unified_exec', 'view_image', 'image_generation', 'multi_agent', 'multi_agent_v2', 'apps', 'plugins', 'hooks',
  'memories', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest',
  'browser_use', 'computer_use', 'code_mode', 'code_mode_host', 'code_mode_only', 'code_mode_only_strict_3p_tools', 'goals', 'sleep_tool',
  'workspace_dependencies', 'unbounded_connection_retries',
] as const

export const codexStartupArgs = [
  'app-server', '--listen', 'stdio://',
  ...codexDisabledFeatures.flatMap(name => ['-c', `features.${name}=false`]),
  '-c', 'features.respect_system_proxy=true',
  '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0',
  '-c', 'mcp_servers={}', '-c', 'analytics.enabled=false',
  '-c', 'features.skip_host_skill_discovery=true', '-c', 'tools.update_plan.enabled=false', '-c', 'tools.experimental_request_user_input.enabled=false',
]

export function noToolsConfig(config: Record<string, unknown> = {}): Record<string, unknown> {
  const servers = typeof config.mcp_servers === 'object' && config.mcp_servers ? Object.keys(config.mcp_servers) : []
  const policy: Record<string, unknown> = {
    web_search: 'disabled', project_doc_max_bytes: 0, mcp_servers: {},
    features: { ...Object.fromEntries(codexDisabledFeatures.map(name => [name, false])), respect_system_proxy: true, skip_host_skill_discovery: true },
    'tools.view_image': false,
    'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false,
  }
  // Explicit per-server overrides also cover releases that merge rather than replace tables.
  for (const server of servers) policy[`mcp_servers.${server}.enabled`] = false
  const provider = typeof config.model_provider === 'string' ? config.model_provider : 'openai'
  // Built-in providers are reserved in Codex; only a real custom provider can override retries.
  const providers = config.model_providers as Record<string, unknown> | undefined
  if (providers && Object.hasOwn(providers, provider)) {
    policy[`model_providers.${provider}.request_max_retries`] = 0
    policy[`model_providers.${provider}.stream_max_retries`] = 0
  }
  return policy
}

export function noToolsThread(cwd: string, config: Record<string, unknown> = {}) {
  // Keep every native approval category denied. Naming those categories avoids
  // describing the separate client-owned BoAI approval flow as unavailable.
  const approvalPolicy = { granular: { sandbox_approval: false, rules: false, mcp_elicitations: false, request_permissions: false, skill_approval: false } }
  return { cwd, approvalPolicy, sandbox: 'read-only', environments: [], config: noToolsConfig(config) }
}
