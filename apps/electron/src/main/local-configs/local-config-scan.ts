/*
 * [INPUT]: Codex/Claude 配置目录、用户选择的目录、环境引用与受限文件读取。
 * [OUTPUT]: 包含 Codex 专用文件在内的有界读取、无密钥 API/账号来源扫描结果及导入时重新读取的准确配置；默认只读已知目录，主动选择目录才递归。
 * [POS]: main/local-configs；从 boai-app 扫描实现适配，保留 Apache-2.0 许可。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { lstatSync, readdirSync, realpathSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { readCodexApiKeyConfig } from './codex-api-key-detection'
import { detectCodexLogin } from './codex-login'
import { readConfigFile } from './read-config-file'
import type { LocalConfigScanResult, LocalApiKeyConfig, LocalConfigScanOptions, LocalApiKeyImportOptions } from '@boai/shared/domain/local-configs'
import { parseConfigEnv, parseLocalApiConfigs } from './local-api-config-parser'
interface ScanOptions extends LocalConfigScanOptions { env?: NodeJS.ProcessEnv; userHome?: string }
const MAX_FILES = 200
const MAX_ENTRIES = 2000
const MAX_DEPTH = 3
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '.next', '.venv', 'venv', 'vendor', 'sessions', 'history', 'logs'])
const configFile = (name: string) => name.startsWith('.env') || ['.env', '.json', '.toml', '.yaml', '.yml'].includes(extname(name).toLowerCase())

function scan(options: ScanOptions) {
  const env = options.env ?? process.env
  const logins: LocalConfigScanResult['logins'] = []
  const apiConfigs: LocalApiKeyConfig[] = []
  const seenRoots = new Set<string>()
  let files = 0, entries = 0, truncated = false, skippedFiles = 0
  function read(path: string): string | undefined {
    if (files >= MAX_FILES) { truncated = true; skippedFiles++; return undefined; }
    files++
    try {
      return readConfigFile(path)
    } catch { truncated = true; skippedFiles++; return undefined; }
  }
  function add(config: LocalApiKeyConfig | null) {
    if (config && !apiConfigs.some(item => item.detected.configId === config.detected.configId)) {
      apiConfigs.push(config); logins.push(config.detected)
    }
  }
  function scanDirectory(directory: string, depth: number, knownCodex = false, recurse = true) {
    if (seenRoots.has(directory)) return
    seenRoots.add(directory)
    let items
    try { items = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { skippedFiles++; return; }
    const names = new Set(items.filter(item => item.isFile()).map(item => item.name))
    const dotEnv = names.has('.env') ? read(join(directory, '.env')) : undefined
    const scopeEnv = { ...parseConfigEnv(dotEnv ?? ''), ...env }
    const toml = names.has('config.toml') ? read(join(directory, 'config.toml')) : undefined
    const auth = names.has('auth.json') ? read(join(directory, 'auth.json')) : undefined
    const codex = knownCodex || !!toml?.match(/(?:model_provider|model_providers|openai_base_url|wire_api)\s*(?:=|\])/)
      || !!auth?.match(/"(?:auth_mode|OPENAI_API_KEY|tokens)"\s*:/)
    // Do not let the Codex reader follow files that this bounded scan refused.
    const safeCodex = (!existsSync(join(directory, 'config.toml')) || toml !== undefined)
      && (!existsSync(join(directory, 'auth.json')) || auth !== undefined)
    if (codex && safeCodex) {
      add(readCodexApiKeyConfig({ codexHome: directory, env: scopeEnv }))
      const login = detectCodexLogin(directory, auth)
      if (login) logins.push(login)
    }
    for (const item of items) {
      if (++entries > MAX_ENTRIES || files >= MAX_FILES) { truncated = true; return; }
      const path = join(directory, item.name)
      if (item.isDirectory() && recurse && !SKIP_DIRS.has(item.name)) {
        if (depth < MAX_DEPTH) scanDirectory(path, depth + 1, item.name === '.codex')
        else truncated = true
      } else if (item.isFile() && configFile(item.name)) {
        if (codex && ['auth.json', 'config.toml'].includes(item.name)) continue
        const content = item.name === '.env' ? dotEnv : read(path)
        if (content !== undefined) parseLocalApiConfigs(content, path, scopeEnv).forEach(add)
      }
    }
  }
  if (options.directory) {
    let directory: string
    try {
      directory = realpathSync(resolve(options.directory))
      if (!lstatSync(directory).isDirectory()) throw new Error()
    } catch { throw new Error('无法读取所选配置目录，请重新选择'); }
    scanDirectory(directory, 0, basename(directory) === '.codex')
  } else {
    // Default discovery is deliberately confined to tool config directories.
    const codex = resolve(env.CODEX_HOME?.trim() || join(options.userHome ?? homedir(), '.codex'))
    const claude = resolve(env.CLAUDE_CONFIG_DIR?.trim() || join(options.userHome ?? homedir(), '.claude'))
    if (existsSync(codex)) scanDirectory(realpathSync(codex), 0, true, false)
    if (existsSync(claude)) scanDirectory(realpathSync(claude), 0, false, false)
  }
  return { logins, apiConfigs, truncated, skippedFiles }
}

/** Only this secret-free projection may cross the RPC boundary. */
export function scanLocalConfigs(options: ScanOptions = {}): LocalConfigScanResult {
  const { logins, truncated, skippedFiles } = scan(options)
  return { logins, truncated, skippedFiles, directory: options.directory }
}

/** Re-read the selected scope and match file, object, endpoint and model at import time. */
export function readScannedApiKeyConfig(configId: string, options: ScanOptions & LocalApiKeyImportOptions = {}): LocalApiKeyConfig | null {
  const config = scan(options).apiConfigs.find(config => config.detected.configId === configId) ?? null
  const model = options.model?.trim()
  if (config && (!config.detected.issue || config.detected.issue === 'missing-model') && !config.detected.model && model && model.length <= 400) {
    return { ...config, detected: { ...config.detected, model, usable: true, issue: undefined } }
  }
  return config
}
