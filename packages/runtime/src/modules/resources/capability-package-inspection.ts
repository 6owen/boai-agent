/*
 * [INPUT]: Explicit local directory and Agent Plugins 1.0.0 or Codex compatibility manifests.
 * [OUTPUT]: Bounded, inert inspection with canonical file hashes, separate legacy normalization and unsupported-component reports.
 * [POS]: Capability package import boundary; never executes, fetches, installs dependencies or reads host credentials.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, posix } from 'node:path'
import { z } from 'zod'
import { CAPABILITY_PACKAGE_LIMITS, CAPABILITY_PACKAGE_SPEC, type CapabilityDefinition, type CapabilityInspection, type CapabilityIssue } from '@boai/shared/domain/capability-packages'
import { dataSourceConfigSchema } from '@boai/shared/domain/sources'
import { inspectResourceTree, parseSkillDocument } from './local-resources'
import { boundedRead, restrictedPath } from '../workspaces/file-access'

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const dictionary = z.record(z.string(), z.unknown())
const pluginSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const mcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
const key = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
function object(value: unknown, label: string): Record<string, unknown> {
  const parsed = dictionary.safeParse(value)
  if (!parsed.success) throw new Error(`${label} 必须是对象`)
  return parsed.data
}
function optionalObject(value: unknown, label: string) { return value === undefined ? {} : object(value, label) }
/** Package paths are portable POSIX paths; never normalize an escape into a valid target. */
export function capabilityRelativePath(value: string) {
  if (!value || value.includes('\\') || value.includes('\0') || isAbsolute(value) || /^[A-Za-z]:/.test(value)) throw new Error('能力包路径必须是包内相对路径')
  const path = value.startsWith('./') ? value.slice(2) : value
  const parts = path.replace(/\/$/, '').split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('能力包路径不能包含空段或目录逃逸')
  return parts.join('/')
}
export function assertCanonicalCapabilityPaths(paths: string[]) {
  const canonical = new Map<string, string>()
  for (const file of paths) {
    const segments = capabilityRelativePath(file).split('/')
    for (let index = 1; index <= segments.length; index++) {
      const path = segments.slice(0, index).join('/'), normalized = path.normalize('NFC').toLowerCase()
      const existing = canonical.get(normalized)
      if (existing !== undefined && existing !== path) throw new Error('能力包包含重复规范路径')
      canonical.set(normalized, path)
    }
  }
}
export async function inspectCapabilityPackage(path: string): Promise<CapabilityInspection> {
  if (!isAbsolute(path)) throw new Error('请选择能力包的绝对目录路径')
  const tree = await inspectResourceTree(path)
  const sourcePath = await realpath(path), fileMap = new Map(tree.files.map(file => [file.path, file]))
  assertCanonicalCapabilityPaths(tree.files.map(file => file.path))
  const read = async (name: string) => {
    name = capabilityRelativePath(name)
    const file = fileMap.get(name)
    if (!file || file.size > CAPABILITY_PACKAGE_LIMITS.manifestBytes) throw new Error('能力包清单缺失或超过 1 MB')
    const text = await boundedRead(await restrictedPath([sourcePath], join(sourcePath, name)), { strictUtf8: true })
    if (Buffer.byteLength(text) !== file.size || digest(text) !== file.hash) throw new Error('能力包内容已变化，请重新预检')
    return text
  }
  const json = async (name: string) => { try { return object(JSON.parse(await read(name)), name) } catch (error) { if (error instanceof SyntaxError) throw new Error('能力包 JSON 格式无效'); throw error } }
  const portable = fileMap.has('plugin.json')
  const manifest = await json(portable ? 'plugin.json' : '.codex-plugin/plugin.json')
  if (portable && manifest.$schema !== pluginSchema) throw new Error('仅支持 Agent Plugins 1.0.0 清单')
  const name = z.string().regex(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/).max(64).parse(manifest.name)
  const version = z.string().min(1).max(100).parse(manifest.version ?? 'unversioned')
  const description = z.string().max(10000).parse(manifest.description ?? '')
  const unsupported: CapabilityIssue[] = [], warnings: CapabilityIssue[] = []
  const issue = (component: string, code: string, message: string) => unsupported.push({ component, code, message })
  const extensions = optionalObject(manifest.extensions, 'extensions')
  const inline = extensions['com.openai']
  const overlay = portable ? inline !== undefined ? object(inline, 'com.openai') : fileMap.has('.codex-plugin/plugin.json') ? await json('.codex-plugin/plugin.json') : {} : manifest
  for (const namespace of Object.keys(extensions)) if (namespace !== 'com.openai') issue(`extension:${namespace}`, 'unsupported-extension', '此客户端扩展尚未实现')
  for (const field of ['hooks', 'apps', 'ui', 'install', 'scripts', 'dependencies']) if (overlay[field] !== undefined || manifest[field] !== undefined) issue(field, 'unsupported-component', '此组件不执行，依赖它的能力不能激活')
  const manifestFields = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions', ...(portable ? [] : ['skills', 'mcpServers', 'hooks', 'apps', 'interface', 'onboardingSkill'])])
  for (const field of Object.keys(manifest)) if (!manifestFields.has(field) && !unsupported.some(value => value.component === field)) issue(field, 'unsupported-field', '此清单字段尚未实现')
  // Paths in the selected overlay are checked even when their component is unsupported.
  for (const field of ['hooks', 'apps', 'onboardingSkill', ...(!portable ? ['skills', 'mcpServers'] : [])]) {
    const value = overlay[field]
    if (typeof value === 'string') capabilityRelativePath(value)
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') capabilityRelativePath(item)
  }
  const presentation = optionalObject(overlay.interface, 'interface')
  for (const field of ['composerIcon', 'logo']) if (typeof presentation[field] === 'string') capabilityRelativePath(presentation[field])
  const definitions: CapabilityDefinition[] = []
  let skillsRoot = 'skills'
  if (!portable && manifest.skills !== undefined) {
    if (typeof manifest.skills === 'string') skillsRoot = capabilityRelativePath(manifest.skills)
    else issue('skills', 'unsupported-skill-roots', '首版仅支持单一技能目录')
  }
  const skillEntries = tree.files.filter(file => file.path.startsWith(`${skillsRoot}/`) && posix.basename(file.path) === 'SKILL.md')
  const skillNames = new Set<string>()
  if (!(unsupported.some(value => value.component === 'skills'))) for (const file of skillEntries) {
    const directory = posix.dirname(file.path)
    if (directory.split('/').length !== skillsRoot.split('/').length + 1) { issue(file.path, 'nested-skill', '技能必须位于技能根目录的直属子目录'); continue }
    const metadata = parseSkillDocument(await read(file.path))
    if (skillNames.has(metadata.name)) throw new Error('能力包包含重复技能名称')
    skillNames.add(metadata.name)
    const files = tree.files.filter(value => value.path.startsWith(`${directory}/`)).map(value => ({ ...value, path: value.path.slice(directory.length + 1) }))
    definitions.push({ key: `skill:${metadata.name}`, kind: 'skill', path: directory, name: metadata.name, description: metadata.description, contentHash: digest(JSON.stringify(files)) })
    for (const message of metadata.warnings) warnings.push({ component: file.path, code: 'skill-metadata', message })
  }
  let mcpFile = portable ? 'mcp.json' : '.mcp.json'
  if (!portable && typeof manifest.mcpServers === 'string') mcpFile = capabilityRelativePath(manifest.mcpServers)
  const mcp = fileMap.has(mcpFile) ? await json(mcpFile) : !portable && manifest.mcpServers !== undefined && typeof manifest.mcpServers !== 'string' ? { mcpServers: object(manifest.mcpServers, 'mcpServers') } : undefined
  if (mcp) {
    if (portable && mcp.$schema !== mcpSchema) throw new Error('仅支持 Agent Plugins 1.0.0 MCP 清单')
    for (const field of Object.keys(mcp)) if (!['$schema', 'mcpServers'].includes(field)) issue(`mcp:${field}`, 'unsupported-field', '此 MCP 根字段尚未实现')
    const servers = object(mcp.mcpServers, 'mcpServers')
    for (const [serverKey, raw] of Object.entries(servers)) {
      if (!key.test(serverKey)) throw new Error('MCP 名称无效')
      const component = `source:${serverKey}`, before = unsupported.length, server = object(raw, 'MCP server')
      const embeddedCredential = (value: unknown): boolean => value !== null && typeof value === 'object' && Object.entries(value).some(([name, child]) => /^(?:client[_-]?secret|access[_-]?token|api[_-]?key|password|private[_-]?key)$/i.test(name) && typeof child === 'string' && !!child && !/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(child) || embeddedCredential(child))
      if (embeddedCredential(server)) issue(component, 'embedded-credential', '包内凭据不自动迁入，请使用原安全配置入口')
      if (typeof server.cwd === 'string') capabilityRelativePath(server.cwd)
      const type = portable ? server.type : server.type ?? (server.command ? 'stdio' : server.url ? 'http' : undefined)
      const allowed = new Set(['type', 'command', 'args', 'env', 'url', 'headers', 'extensions'])
      for (const field of Object.keys(server)) if (!allowed.has(field)) issue(component, 'unsupported-server-field', `MCP 字段 ${field} 尚未实现`)
      const serverExt = optionalObject(server.extensions, 'MCP extensions'), openai = optionalObject(serverExt['com.openai'], 'MCP com.openai')
      for (const field of Object.keys(serverExt)) if (field !== 'com.openai') issue(component, 'unsupported-extension', '此 MCP 扩展尚未实现')
      for (const field of Object.keys(openai)) if (field !== 'auth') issue(component, 'unsupported-extension', '此 MCP 扩展字段尚未实现')
      const auth = optionalObject(openai.auth, 'MCP auth')
      const requiredSecrets: string[] = []
      let authType: 'none' | 'bearer' = 'none'
      if (auth.type !== undefined && auth.type !== 'none') {
        if (auth.type === 'api_key' && auth.headerScheme === 'bearer' && Object.keys(auth).every(field => ['type', 'headerScheme'].includes(field))) { authType = 'bearer'; requiredSecrets.push('bearer') }
        else issue(component, 'unsupported-authentication', '仅支持无认证或单一 bearer 凭据；此认证流程尚未接入')
      }
      const headers = optionalObject(server.headers, 'MCP headers')
      for (const [header, value] of Object.entries(headers)) {
        if (header.toLowerCase() === 'authorization' && typeof value === 'string' && /^Bearer \$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value)) { authType = 'bearer'; if (!requiredSecrets.includes('bearer')) requiredSecrets.push('bearer') }
        else issue(component, 'unsupported-or-embedded-header', '包内固定请求头或秘密值不导入；请使用原安全配置入口')
      }
      const base = { name: `${name} · ${serverKey}`.slice(0, 100), description: '', guide: '', enabled: true }
      let config: unknown
      if (type === 'stdio') {
        const env = optionalObject(server.env, 'MCP env')
        for (const [envKey, value] of Object.entries(env)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey) || ['PLUGIN_ROOT', 'PLUGIN_DATA'].includes(envKey) || typeof value !== 'string' || value !== '${' + envKey + '}') issue(component, 'unsupported-or-embedded-env', '环境变量仅接受同名秘密占位符，固定值不自动导入')
          else requiredSecrets.push(envKey)
        }
        if (Object.keys(headers).length || authType !== 'none') issue(component, 'unsupported-stdio-auth', 'stdio 认证只能通过受控秘密环境变量配置')
        const command = z.string().min(1).max(2000).parse(server.command)
        const args = z.array(z.string().max(4000)).max(100).parse(server.args ?? [])
        if (args.some(value => /^--?(?:api[-_]?key|access[-_]?token|token|password|secret|authorization)(?:=|$)/i.test(value))) issue(component, 'embedded-command-credential', '命令凭据参数不自动导入，请使用秘密环境变量')
        if ([command, ...args].some(value => value.includes('${') || value.includes('$(') || value.includes('`'))) issue(component, 'unsupported-variable', '命令变量展开和包根占位符尚未实现')
        config = { ...base, type: 'mcp', mcp: { transport: 'stdio', command, args } }
      } else if (['streamable-http', 'http', 'sse'].includes(String(type)) && (!portable || type !== 'http')) {
        const url = z.string().min(1).max(4000).parse(server.url)
        try { const value = new URL(url); if (value.search || value.username || value.password || value.hash) issue(component, 'embedded-url-configuration', '带查询或身份信息的 URL 不导入；请使用原安全配置入口') } catch { throw new Error('MCP URL 无效') }
        config = { ...base, type: 'mcp', mcp: { transport: type === 'sse' ? 'sse' : 'http', url, authType } }
        if (server.env !== undefined || server.command !== undefined || server.args !== undefined) issue(component, 'mixed-transport', '远程 MCP 不能包含本地命令字段')
      } else issue(component, 'unsupported-transport', '此 MCP transport 尚未支持')
      if (config && before === unsupported.length) definitions.push({ key: component, kind: 'source', config: dataSourceConfigSchema.parse(config), requiredSecrets })
    }
  }
  if (definitions.length > CAPABILITY_PACKAGE_LIMITS.contributions) throw new Error('能力包最多包含 200 项贡献')
  // Skills may depend on omitted tools/hooks. Without a machine-verifiable dependency contract, refuse partial skill activation.
  const partialAllowed = definitions.length > 0 && !definitions.some(value => value.kind === 'skill') && unsupported.every(value => value.component.startsWith('source:'))
  const origin = typeof manifest.repository === 'string' ? manifest.repository.trim() : sourcePath
  if (origin.length > 4000 || /[\r\n]/.test(origin)) throw new Error('能力包来源无效')
  if (/^https?:/.test(origin)) { const url = new URL(origin); if (url.username || url.password || url.search || url.hash) throw new Error('能力包来源不能包含凭据或查询参数') }
  if ((await inspectResourceTree(sourcePath)).hash !== tree.hash) throw new Error('能力包内容已变化，请重新预检')
  return { format: portable ? 'portable' : 'codex-legacy', specVersion: portable ? CAPABILITY_PACKAGE_SPEC : 'codex-compat/2026-11-07', packageId: digest(JSON.stringify({ origin, name })), name, version, description, source: { kind: 'local', path: sourcePath, origin }, contentHash: tree.hash, files: tree.files, bytes: tree.bytes, definitions, unsupported, warnings, partialAllowed }
}
