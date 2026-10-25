/*
 * [INPUT]: Explicit daily data path and selected API connection; original employee/profile/source records.
 * [OUTPUT]: Read-only Bobo configuration snapshot, rejecting incomplete sources and concurrent changes before model calls.
 * [POS]: Original personality evaluation preparation; never initializes or migrates the daily profile.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DigitalAgent } from '../../packages/shared/src/domain'
import { defaultAgentProfile, normalizeAgentProfile, promptSourceNames, type AgentProfile } from '../../packages/shared/src/domain/agent-profile'
import { isCoreAgent } from '../../packages/shared/src/domain/core-agent'
import { WorkspaceService } from '../../packages/runtime/src/modules/workspaces/workspace-service'

export async function snapshotStoredProfile(dataPath: string, connectionId: string) {
  const records = () => {
    const database = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true })
    try {
      return database.prepare("SELECT collection,value FROM records WHERE id='bobo' AND collection IN ('agents','agentProfiles') ORDER BY collection").all()
        .map(row => ({ collection: String(row.collection), value: String(row.value) }))
    } finally { database.close() }
  }
  const before = records(), rawAgent = before.find(row => row.collection === 'agents')
  if (!rawAgent) throw new Error('Stored Bobo configuration is missing; no model call made')
  const agent = JSON.parse(rawAgent.value) as DigitalAgent
  if (!isCoreAgent(agent) || agent.connectionId !== connectionId || agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') throw new Error('The selected connection is not the stored API Bobo connection')
  const rawProfile = before.find(row => row.collection === 'agentProfiles')
  const profile = normalizeAgentProfile(rawProfile ? JSON.parse(rawProfile.value) as AgentProfile : defaultAgentProfile(agent.id, true))
  const workspace = new WorkspaceService(dataPath)
  const sources = await Promise.all(promptSourceNames.map(name => workspace.read(agent, name)))
  if (sources.some(file => !['current', 'modified'].includes(file.status) || createHash('sha256').update(file.content).digest('hex') !== file.hash)) throw new Error('Stored Bobo source cannot be frozen; no model call made')
  const after = await Promise.all(promptSourceNames.map(name => workspace.read(agent, name)))
  if (JSON.stringify(records()) !== JSON.stringify(before) || after.some((file, index) => !['current', 'modified'].includes(file.status) || file.hash !== sources[index].hash)) throw new Error('Stored Bobo configuration changed while snapshotting; no model call made')
  return { capturedAt: new Date().toISOString(), source: 'stored-read-only' as const, agent: { configVersion: agent.configVersion, connectionId, modelId: agent.modelId }, profile, files: sources.map(({ name, hash, content }) => ({ name, hash, content })) }
}
