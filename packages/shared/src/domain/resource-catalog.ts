/*
 * [INPUT]: Maintained public service documentation and the existing shared employee presets.
 * [OUTPUT]: Stable application/assistant catalog and explicit dependency resolution; no credentials or account IDs.
 * [POS]: Shared resource-library facts, independent from saved Source and employee instances.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { EMPLOYEE_PRESETS } from './agent-presets'
import type { DataSource, DataSourceConfig } from './sources'

export type ApplicationOrigin = { applicationId: string; version: string }
export type ApplicationPreset = {
  id: string; version: string; name: string; category: 'development'; description: string
  documentationUrl: string; credentialUrl: string; access: string; config: DataSourceConfig
  oauth?: { url: string; documentationUrl: string }
}
/** Original BOAI metadata; no Openbot code, prompts, icons or assets are copied. */
export const APPLICATION_PRESETS: readonly ApplicationPreset[] = [
  { id: 'github', version: '1', name: 'GitHub', category: 'development', description: '仓库、议题与拉取请求',
    documentationUrl: 'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',
    credentialUrl: 'https://github.com/settings/personal-access-tokens',
    access: '使用你提供的个人访问令牌。仅授予需要的仓库和权限；组织策略仍然生效。启用后 bobo 可使用，普通员工需要显式绑定。',
    config: { type: 'mcp', name: 'GitHub', description: 'GitHub 仓库、议题与拉取请求', guide: '先查看实际工具目录和当前令牌可访问范围，再按用户授权执行。', enabled: false,
      mcp: { transport: 'http', url: 'https://api.githubcopilot.com/mcp/', authType: 'bearer' } } },
  { id: 'vercel', version: '1', name: 'Vercel', category: 'development', description: '项目、部署与团队',
    documentationUrl: 'https://vercel.com/docs/rest-api', credentialUrl: 'https://vercel.com/account/settings/tokens',
    access: 'API 连接使用你提供的 Vercel token，访问受 token 范围限制。启用后 bobo 可使用，普通员工需要显式绑定。MCP 使用独立 OAuth 授权。',
    config: { type: 'api', name: 'Vercel', description: 'Vercel 项目与部署 API', guide: '参考官方 REST API 文档。先读取项目或部署，再按用户明确授权执行变更；团队操作明确指定 teamId。', enabled: false,
      api: { baseUrl: 'https://api.vercel.com', authType: 'bearer', testPath: '/v2/user' } },
    oauth: { url: 'https://mcp.vercel.com', documentationUrl: 'https://vercel.com/docs/agent-resources/vercel-mcp' } },
]
export function applicationPreset(id: string, version?: string) {
  return APPLICATION_PRESETS.find(item => item.id === id && (version === undefined || version === item.version))
}
/** Explicit provenance only: a matching URL or name never claims an existing account. */
export function applicationConnections(applicationId: string, sources: readonly DataSource[]) {
  return sources.filter(source => source.applicationOrigin?.applicationId === applicationId)
}
export function applicationSourceDefaults(id: string): DataSourceConfig {
  const preset = applicationPreset(id)
  if (!preset) throw new Error('应用预设不存在。')
  return structuredClone(preset.config)
}
export function customSourceDefaults(type: DataSourceConfig['type']): DataSourceConfig {
  const base = { name: '', description: '', guide: '', enabled: false }
  return type === 'api' ? { ...base, type, api: { baseUrl: '', authType: 'none', testPath: '/' } }
    : type === 'mcp' ? { ...base, type, mcp: { transport: 'http', url: '', authType: 'none' } }
      : { ...base, type, local: { path: '' } }
}
export type AssistantRequirement = { kind: 'application' | 'skill'; id: string; label: string; required: boolean }
export type AssistantTemplate = typeof EMPLOYEE_PRESETS[number] & { requirements: readonly AssistantRequirement[]; source: 'boai' }
export const ASSISTANT_TEMPLATES: readonly AssistantTemplate[] = EMPLOYEE_PRESETS.map(preset => ({ ...preset, source: 'boai', requirements: [] }))
export function assistantTemplate(id: string) { return ASSISTANT_TEMPLATES.find(item => item.id === id) }
/** Only caller-selected, ready resources satisfy a dependency; no automatic private binding. */
export function resolveAssistantRequirements(requirements: readonly AssistantRequirement[], selected: { applicationIds: readonly string[]; skillIds: readonly string[] }) {
  return requirements.map(requirement => ({ ...requirement, satisfied: (requirement.kind === 'application' ? selected.applicationIds : selected.skillIds).includes(requirement.id) }))
}
