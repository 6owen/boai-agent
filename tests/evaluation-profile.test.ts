/*
 * [INPUT]: Real isolated SQLite/employee source files and original personality evaluation entry points.
 * [OUTPUT]: Read-only stored configuration, concurrent/invalid snapshot rejection and zero-call sample preparation checks.
 * [POS]: Daily stability evaluation preparation; fixture profiles and task inputs are explicit test data.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DigitalAgent } from '../src/shared/domain'
import { defaultAgentProfile, promptSourceNames } from '../src/shared/domain/agent-profile'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { snapshotStoredProfile } from './evaluation/stored-profile'
import { preparePersonalityEvaluation, runPersonalityEvaluation } from './evaluation/personality'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const action of cleanup.splice(0).reverse()) await action() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-evaluation-profile-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const database = new DatabaseSync(join(root, 'boai.sqlite'))
  cleanup.push(() => database.close())
  database.exec('CREATE TABLE records (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection,id))')
  const agent: DigitalAgent = { id: 'bobo', systemRole: 'core', name: 'fixture', role: 'fixture', instructions: '原保存的规则。', color: 'blue', connectionId: 'fixture-api', modelId: 'fixture-model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 7 }
  const profile = { ...defaultAgentProfile(agent.id, true), revision: 3, updatedAt: '2026-10-22T00:00:00Z' }
  const put = (collection: string, value: unknown) => database.prepare('INSERT OR REPLACE INTO records VALUES (?, ?, ?)').run(collection, 'bobo', JSON.stringify(value))
  put('agents', agent); put('agentProfiles', profile)
  const workspace = new WorkspaceService(root); await workspace.initialize(agent)
  return { root, database, agent, profile, workspace, put }
}

it('freezes the stored model, profile and modified source without initializing or writing the daily data', async () => {
  const f = await fixture(), source = join(f.workspace.root('bobo'), 'SOUL.md')
  await writeFile(source, '实际修改过的人格正文。')
  const before = await readFile(join(f.root, 'boai.sqlite'))
  const initialize = vi.spyOn(WorkspaceService.prototype, 'initialize')
  const snapshot = await snapshotStoredProfile(f.root, 'fixture-api')
  expect(snapshot.agent).toEqual({ connectionId: 'fixture-api', modelId: 'fixture-model', configVersion: 7 })
  expect(snapshot.profile).toEqual(f.profile)
  expect(snapshot.files.map(file => file.name)).toEqual(promptSourceNames)
  expect(snapshot.files.find(file => file.name === 'SOUL.md')?.content).toBe('实际修改过的人格正文。')
  expect(await readFile(join(f.root, 'boai.sqlite'))).toEqual(before)
  expect(initialize).not.toHaveBeenCalled()
})

it.each(['wrong-connection', 'native-backend', 'missing-source', 'linked-source'] as const)('rejects %s rather than silently replacing the current configuration', async kind => {
  const f = await fixture()
  if (kind === 'native-backend') f.put('agents', { ...f.agent, executionBackend: { kind: 'native-agent', launchProfileId: 'fixture' } })
  const source = join(f.workspace.root('bobo'), 'SOUL.md')
  if (kind === 'missing-source' || kind === 'linked-source') await rm(source)
  if (kind === 'linked-source') await symlink(join(f.workspace.root('bobo'), 'AGENTS.md'), source)
  await expect(snapshotStoredProfile(f.root, kind === 'wrong-connection' ? 'other-api' : 'fixture-api')).rejects.toThrow(/connection|source cannot be frozen/)
})

it.each(['configuration', 'source'] as const)('rejects concurrent %s changes across the real file read', async kind => {
  const f = await fixture(), read = WorkspaceService.prototype.read
  let changed = false
  vi.spyOn(WorkspaceService.prototype, 'read').mockImplementation(async function (this: WorkspaceService, ...args) {
    const result = await read.apply(this, args)
    if (!changed && args[1] === 'SOUL.md') {
      changed = true
      if (kind === 'configuration') f.put('agents', { ...f.agent, configVersion: 8, modelId: 'changed-model' })
      else await writeFile(join(f.workspace.root('bobo'), 'SOUL.md'), '读入期间被修改。')
    }
    return result
  })
  await expect(snapshotStoredProfile(f.root, 'fixture-api')).rejects.toThrow('changed while snapshotting')
})

it('prepares the original multi-chat memory sample and criteria with zero provider requests or daily mutations', async () => {
  const f = await fixture(), fetch = vi.spyOn(globalThis, 'fetch')
  const output = join(f.root, 'review'), configuration = await snapshotStoredProfile(f.root, 'fixture-api')
  const before = await readFile(join(f.root, 'boai.sqlite'))
  await preparePersonalityEvaluation({ output, label: 'daily-memory', maxRequests: 20, deadlineMs: 720000, currentConfiguration: configuration, caseIds: ['memory-preference-correction', 'memory-output-only'] })
  const design = JSON.parse(await readFile(join(output, 'design.json'), 'utf8'))
  expect(design).toMatchObject({ status: 'needs_review', providerRequests: 0, maxRequests: 20, configuration: { profileRevision: 3 } })
  expect(design.cases).toHaveLength(2)
  expect(design.cases[0]).toMatchObject({ id: 'memory-preference-correction', newChatEachTurn: true })
  expect(design.cases[0].turns).toHaveLength(3)
  expect(await readFile(join(output, 'design-review.md'), 'utf8')).toContain('本次输出格式不保存成长期文风或规则')
  expect(fetch).not.toHaveBeenCalled()
  expect(await readFile(join(f.root, 'boai.sqlite'))).toEqual(before)
})

it('rejects unknown or duplicate cases before execution, credentials or request reservation', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  for (const caseIds of [['missing-case'], ['memory-output-only', 'memory-output-only']]) {
    await expect(runPersonalityEvaluation({ settings: { output: '/must-not-be-written', label: 'invalid', maxRequests: 20, deadlineMs: 720000, caseIds }, connection: {} as never, apiKey: '' })).rejects.toThrow('Unknown or duplicate personality case')
  }
  expect(fetch).not.toHaveBeenCalled()
})
