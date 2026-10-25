/*
 * [INPUT]: Compiled application identity, installed Mastra metadata, original launch profiles and runtime plugin owner.
 * [OUTPUT]: Immutable compiled application identity plus current-file-checked program/package versions; absent build identity remains unknown.
 * [POS]: Read-only runtime inventory; never spawns an executable or calls a model.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import mastraPackage from '@mastra/core/package.json' with { type: 'json' }
import type { DigitalAgent } from '@boai/shared/domain'
import type { RuntimeVersions } from '@boai/shared/domain/runtime-versions'
import type { LaunchProfiles } from './profiles'
import type { RuntimePlugins } from './runtime-plugins'

declare const __BOAI_APPLICATION_BUILD__: { version: string; inputHash: string }
const application = typeof __BOAI_APPLICATION_BUILD__ === 'undefined' ? null : __BOAI_APPLICATION_BUILD__

export async function runtimeVersions(profiles: LaunchProfiles, plugins: RuntimePlugins, agents: Pick<DigitalAgent, 'id' | 'executionBackend'>[]): Promise<RuntimeVersions> {
  const result: RuntimeVersions = { application: application ? { ...application, source: 'compiled-inputs' } : { version: null, inputHash: null, source: 'unknown' }, node: process.versions.node, mastra: { package: '@mastra/core', version: mastraPackage.version, source: 'installed-package' }, programs: [], plugins: [] }
  for (const profile of profiles.list().sort((a, b) => a.id.localeCompare(b.id))) {
    const status = await profiles.status(profile.id)
    const verified = status.profile.verified
    result.programs.push({ profileId: profile.id, revision: profile.revision, protocol: profile.protocol ?? 'acp', employeeIds: agents.filter(agent => agent.executionBackend && 'profileId' in agent.executionBackend && agent.executionBackend.profileId === profile.id).map(agent => agent.id).sort(),
      availability: status.status, checkedAt: status.checkedAt,
      version: status.status === 'available' && verified ? verified.version : null,
      source: status.status === 'available' && verified ? 'verified-program' : 'unknown',
      ...(verified ? { lastVerification: { version: verified.version, protocolVersion: verified.protocolVersion, checkedAt: verified.checkedAt } } : {}) })
  }
  for (const plugin of plugins.snapshot().plugins.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))) {
    const contribution = plugin.manifest.contributions[0]
    let verified = false
    try { await plugins.verifyPackage({ pluginId: plugin.manifest.id, providerId: contribution.providerId, packageHash: plugin.packageHash }, true); verified = true } catch { /* Registration alone cannot prove the current package bytes. */ }
    result.plugins.push({ id: plugin.manifest.id, providerId: contribution.providerId, version: verified ? plugin.manifest.version : null, registeredVersion: plugin.manifest.version, packageHash: plugin.packageHash, runtimeApiVersion: contribution.runtimeApiVersion, enabled: plugin.enabled, inUse: plugin.inUse, source: verified ? 'verified-package' : 'unknown' })
  }
  return result
}
