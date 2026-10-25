/*
 * [INPUT]: Codex已解析模型名及本机公开模型目录缓存（不读取登录凭据）。
 * [OUTPUT]: 每阶段私有模型元信息；保留供应商传输和上下文能力，明确覆盖模型强制启用的工具/子代理模式。
 * [POS]: Codex 0.159.3能力门禁；缺少已知模型元信息时拒绝执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchProfile } from '@boai/shared/domain/backends'

export async function prepareCodexCatalog(profile: LaunchProfile, cwd: string, privateHome: string | undefined, model: string) {
  const home = profile.useExistingLogin ? profile.codexHome ?? (process.env.HOME && join(process.env.HOME, '.codex')) : privateHome
  if (!home) throw new Error('缺少Codex模型目录位置')
  const path = join(home, 'models_cache.json')
  let record: Record<string, unknown> | undefined
  try {
    if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error('模型目录过大')
    const data = JSON.parse(await readFile(path, 'utf8')) as { models?: Record<string, unknown>[] }
    record = data.models?.find(item => item.slug === model)
  } catch { throw new Error('无法核对Codex模型能力，请先在本机Codex刷新模型列表并重测连接') }
  if (!record) throw new Error('当前Codex模型没有可核对的能力记录，请刷新本机模型列表')
  // Model metadata can override feature flags. Own the complete execution surface,
  // while preserving the provider's transport, context and reasoning metadata.
  const restricted = { ...record, base_instructions: '', model_messages: null,
    shell_type: 'disabled', apply_patch_tool_type: null, experimental_supported_tools: [],
    tool_mode: 'direct', multi_agent_version: null, multi_agent_reasoning_effort: null, node_repl_disabled: true,
    supports_search_tool: false, supports_experimental_context: false,
    include_skills_usage_instructions: false, include_plugin_usage_instructions: false, include_apps_usage_instructions: false }
  const directory = await mkdtemp(join(cwd, '.boai-codex-policy-'))
  try {
    const catalogPath = join(directory, 'models.json')
    await writeFile(catalogPath, JSON.stringify({ models: [restricted] }), { mode: 0o600 })
    return { path: catalogPath, dispose: () => rm(directory, { recursive: true, force: true }) }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
}
