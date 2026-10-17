/*
 * [INPUT]: Claude native config directory, project settings and inherited environment.
 * [OUTPUT]: Read-only source identity without credentials/keychain or mutable session-state reads.
 * [POS]: Claude native-source session compatibility; explicit BOAI gateways use their own revision.
 * [PROTOCOL]: Update Header and claude/.folder.md when native configuration sources change.
 */
import { join, resolve } from 'node:path'
import type { EngineContext } from '../../contracts'
import { configurationAncestors, nativeConfigurationIdentity } from '../native-source'
export function claudeNativeSourceIdentity(context: EngineContext) {
  const cwd = context.runtimeDirectory!.cwd, home = process.env.HOME
  if (!home) throw new Error('Claude缺少明确的本机配置目录')
  const config = resolve(cwd, process.env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'))
  const managed = process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode/managed-settings.json' : process.platform === 'win32' ? join(process.env.ProgramData ?? 'C:\\ProgramData', 'ClaudeCode', 'managed-settings.json') : '/etc/claude-code/managed-settings.json'
  return nativeConfigurationIdentity([join(config, 'settings.json'), managed, ...configurationAncestors(cwd).flatMap(path => [join(path, '.claude', 'settings.json'), join(path, '.claude', 'settings.local.json')])], process.env)
}
export async function assertClaudeNativeSource(context: EngineContext) {
  if (context.nativeSourceFingerprint && context.nativeSourceFingerprint !== await claudeNativeSourceIdentity(context)) throw new Error('Claude原生配置在受理前发生变化，未提交消息；请重新核对')
}
