/*
 * [INPUT]: Pi/OpenCode native directories, environment and their known configuration filenames.
 * [OUTPUT]: Private source identity without reading auth stores or executing config commands.
 * [POS]: Concrete providers' read-only source inspection, exposed only by negotiated Runtime API v2.
 * [PROTOCOL]: Update Header and plugins/.folder.md when supported config sources change.
 */
import { join, resolve } from 'node:path'
import { configurationAncestors, nativeConfigurationIdentity } from '@boai/shared/node/native-source'
import type { RuntimeLaunch } from '@boai/runtime-plugin-sdk'
export function piNativeSourceIdentity(launch: RuntimeLaunch, env: NodeJS.ProcessEnv = process.env) {
  const home = env.HOME ?? launch.privateHome, agent = env.PI_CODING_AGENT_DIR ? resolve(launch.cwd, env.PI_CODING_AGENT_DIR) : join(home, '.pi', 'agent')
  return nativeConfigurationIdentity([join(agent, 'settings.json'), join(agent, 'models.json'), ...configurationAncestors(launch.cwd).flatMap(path => [join(path, '.pi', 'settings.json'), join(path, '.pi', 'models.json')])], env)
}
export function opencodeNativeSourceIdentity(launch: RuntimeLaunch, env: NodeJS.ProcessEnv = process.env) {
  const config = env.XDG_CONFIG_HOME ?? join(env.HOME ?? launch.privateHome, '.config')
  const roots = [join(config, 'opencode'), ...configurationAncestors(launch.cwd).flatMap(path => [path, join(path, '.opencode')]), ...(env.OPENCODE_CONFIG_DIR ? [resolve(launch.cwd, env.OPENCODE_CONFIG_DIR)] : [])]
  return nativeConfigurationIdentity([...roots.flatMap(path => [join(path, 'opencode.json'), join(path, 'opencode.jsonc')]), ...(env.OPENCODE_CONFIG ? [resolve(launch.cwd, env.OPENCODE_CONFIG)] : [])], env)
}
