/*
 * [INPUT]: Selected Codex profile, actual HOME/CODEX_HOME and known global/project configuration files.
 * [OUTPUT]: Opaque source fence; first-thread native trust insertion is accepted only with unchanged remaining configuration and effective write permission.
 * [POS]: Codex native-source session compatibility, separate from BOAI's explicit gateway source.
 * [PROTOCOL]: Update Header and codex/.folder.md when native config precedence changes.
 */
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'smol-toml'
import type { EngineContext } from '../../contracts'
import { configurationAncestors, nativeConfigurationIdentity, nativeConfigurationIdentities } from '@boai/shared/node/native-source'
import { codexProjectTrustTarget } from './project-trust'
function source(context: EngineContext) {
  const profile = context.runtimeProfile!, directory = context.runtimeDirectory!
  const home = profile.useExistingLogin ? process.env.HOME : directory.privateHome
  if (!home) throw new Error('Codex缺少明确的本机配置目录')
  const config = profile.useExistingLogin ? profile.codexHome ?? process.env.CODEX_HOME ?? join(home, '.codex') : directory.privateHome
  const global = join(resolve(directory.cwd, config), 'config.toml')
  return { global, files: [global, join(resolve(directory.cwd, config), 'requirements.toml'), ...configurationAncestors(directory.cwd).map(path => join(path, '.codex', 'config.toml'))], environment: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: config } }
}
export function codexNativeSourceIdentity(context: EngineContext) {
  const selected = source(context)
  return nativeConfigurationIdentity(selected.files, selected.environment)
}
export async function assertCodexNativeSource(context: EngineContext) {
  if (context.nativeSourceFingerprint && context.nativeSourceFingerprint !== await codexNativeSourceIdentity(context)) throw new Error('Codex原生配置在受理前发生变化，未提交消息；请重新核对')
}

/** Only native startup's absent→trusted insertion may cross the original byte fence. */
export async function prepareCodexNativeSource(context: EngineContext) {
  if (!context.nativeSourceFingerprint) return undefined
  const selected = source(context), target = await codexProjectTrustTarget(context.runtimeDirectory!.cwd)
  let original: Buffer | undefined
  const dispose = () => { original?.fill(0); original = undefined }
  try {
    const [before] = await nativeConfigurationIdentities(selected.files, selected.environment, [(path, bytes) => {
      if (path === selected.global) original = Buffer.from(bytes)
      return bytes
    }])
    if (before !== context.nativeSourceFingerprint) throw Error('Codex原生配置在受理前发生变化，未提交消息；请重新核对')
    return { dispose, verify: async (allowTrust: boolean) => {
      const current = source(context)
      const [actual, projected] = await nativeConfigurationIdentities(current.files, current.environment, [(path, bytes) => {
        if (path !== selected.global || original && bytes.equals(original)) return bytes
        if (!allowTrust) throw Error('Unexpected native configuration change')
        const previous = parse(original?.toString('utf8') ?? ''), next = parse(bytes.toString('utf8'))
        const oldProjects = previous.projects as Record<string, Record<string, unknown>> | undefined
        const projects = next.projects as Record<string, Record<string, unknown>> | undefined
        if (oldProjects?.[target]?.trust_level !== undefined || projects?.[target]?.trust_level !== 'trusted') throw Error('Unexpected project trust change')
        delete projects[target].trust_level
        if (!oldProjects?.[target] && !Object.keys(projects[target]).length) delete projects[target]
        if (!oldProjects && !Object.keys(projects).length) delete next.projects
        if (!isDeepStrictEqual(previous, next)) throw Error('Unexpected native configuration change')
        return original
      }])
      if (projected !== context.nativeSourceFingerprint) throw Error('Codex原生配置在受理前发生变化，未提交消息；请重新核对')
      return actual
    } }
  } catch (error) { dispose(); throw error }
}
