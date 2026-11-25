/*
 * [INPUT]: Saved Agent profiles, public npm registry metadata and user-selected version.
 * [OUTPUT]: Stable version comparisons and isolated official packages staged for a protocol probe.
 * [POS]: Runtime-side third-party Agent updater; the launch-profile store owns activation.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { LaunchProfile } from '@boai/shared/domain/backends'
import { CLAUDE_PROGRAM_LIMIT } from '../../adapters/claude/policy'
import { inspectProgram, programSearchPaths, resolveProgram } from './program'

const packages = {
  codex: { name: '@openai/codex', bin: 'codex' },
  claude: { name: '@anthropic-ai/claude-code', bin: 'claude' },
  pi: { name: '@earendil-works/pi-coding-agent', bin: 'pi' },
  opencode: { name: 'opencode-ai', bin: 'opencode' },
}

export const stableAgentVersion = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/

export function isNewerAgentVersion(target: string, current: string) {
  if (!stableAgentVersion.test(target) || !stableAgentVersion.test(current)) return false
  const installed = current.split('.').map(Number)
  const difference = target.split('.').map((part, index) => Number(part) - installed[index]).find(value => value !== 0)
  return (difference ?? 0) > 0
}

export type AgentUpdateProvider = keyof typeof packages

export function agentUpdateProvider(profile: LaunchProfile): AgentUpdateProvider | undefined {
  if (profile.protocol === 'codex-app-server') return 'codex'
  if (profile.protocol === 'claude-cli') return 'claude'
  if (profile.protocol !== 'runtime-plugin') return undefined
  if (profile.runtimePlugin?.pluginId === 'boai.runtime.pi' && profile.runtimePlugin.providerId === 'pi') return 'pi'
  if (profile.runtimePlugin?.pluginId === 'boai.runtime.opencode' && profile.runtimePlugin.providerId === 'opencode') return 'opencode'
}

export function installedAgentVersion(profile: LaunchProfile) {
  // Only use verification for the exact file saved in this profile.
  const verified = profile.verified
  if (!verified) return
  try {
    const file = inspectProgram(profile.executable, profile.protocol === 'claude-cli' ? CLAUDE_PROGRAM_LIMIT : undefined)
    if (file.path !== profile.executable || file.hash !== profile.executableHash) return
    const observed = profile.observedProgram
    const version = (observed && observed.checkedAt >= verified.checkedAt ? observed.version : verified.version).replace(/^v/, '')
    if (stableAgentVersion.test(version)) return version
  } catch { /* Unavailable programs cannot be compared. */ }
}

const registry = 'https://registry.npmjs.org'

export async function latestAgentVersion(provider: AgentUpdateProvider) {
  const name = packages[provider].name
  const response = await fetch(`${registry}/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
  if (!response.ok) throw new Error('未能读取 Agent 版本目录')
  const result: { name?: string; version?: string } = await response.json()
  if (result.name !== name || !stableAgentVersion.test(result.version ?? '')) throw new Error('Agent 版本目录未返回稳定版本')
  return result.version!
}

export function supportsAgentInstallation() { return process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch) }

const execute = promisify(execFile)
export async function stageAgentUpdate(root: string, provider: AgentUpdateProvider, version: string, signal: AbortSignal) {
  if (!supportsAgentInstallation()) throw new Error('当前平台请通过原安装渠道更新 Agent')
  if (!stableAgentVersion.test(version)) throw new Error('无效的 Agent 目标版本')
  const searchPaths = programSearchPaths()
  let npm: ReturnType<typeof resolveProgram>
  try { npm = resolveProgram('npm', searchPaths) } catch { throw new Error('更新需要本机 npm，请安装 Node.js 后重试') }
  const spec = packages[provider]
  // Claude and OpenCode publish their actual executables separately from the npm wrapper.
  const suffix = `darwin-${process.arch}`
  const name = provider === 'claude' ? `${spec.name}-${suffix}` : provider === 'opencode' ? `opencode-${suffix}` : spec.name
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(root, `${provider}-${version}-`))
  try {
    try {
      await execute(npm.runtime === 'node' ? process.execPath : npm.path, [
        ...(npm.runtime === 'node' ? [npm.path] : []), 'install', '--global=false', '--prefix', directory,
        '--ignore-scripts', '--save-exact', `--cache=${join(root, 'npm-cache')}`, '--no-audit', '--no-fund', '--no-update-notifier',
        '--userconfig=/dev/null', `--globalconfig=${join(directory, 'global.npmrc')}`, `--registry=${registry}`, `${name}@${version}`,
      ], {
        cwd: directory, signal, timeout: 300_000, maxBuffer: 512 * 1024, killSignal: 'SIGKILL',
        env: { PATH: searchPaths.join(delimiter), HOME: homedir(), ELECTRON_RUN_AS_NODE: '1', GIT_TERMINAL_PROMPT: '0' },
      })
    } catch { throw new Error('下载 Agent 失败，请检查网络和 npm 后重试') }
    const packageRoot = await realpath(join(directory, 'node_modules', name))
    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (pkg.name !== name || pkg.version !== version) throw new Error('下载的 Agent 包身份或版本与目标不一致')
    const executable = provider === 'claude' ? 'claude' : provider === 'opencode' ? 'bin/opencode' : pkg.bin?.[spec.bin]
    if (typeof executable !== 'string' || isAbsolute(executable)) throw new Error('Agent 包未声明有效的启动程序')
    const file = inspectProgram(join(packageRoot, executable), provider === 'claude' ? CLAUDE_PROGRAM_LIMIT : undefined)
    const rel = relative(packageRoot, file.path)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Agent 启动程序不在已核验的软件包中')
    return { file, directory }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
