/*
 * [INPUT]: Explicit fresh bounded batch, installed Magpie and production AppService/team planner.
 * [OUTPUT]: Three-protocol real team drafts, per-attempt routes and persistence with restart zero replay; no employee creation.
 * [POS]: Real structured-planning acceptance after stream completion checks, separate from ordinary employee tasks.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger for every actual batch.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { probeMagpie } from '../packages/runtime/src/adapters/mastra/model-catalog'
import type { Connection, Snapshot } from '../packages/shared/src/domain'
import type { TeamDraft, TeamDraftView } from '../packages/shared/src/domain/team-creation'

const enabled = process.env.BOAI_MAGPIE_PLANNER_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const root = 'http://127.0.0.1:3425', model = 'group/auto-gpt-6-luna', evidence = resolve('.local/magpie-20261017', `planner-${batch}`), originalFetch = globalThis.fetch
const prompt = '设计两人资料整理团队：一人整理用户提供的材料，一人核对材料中的事实。仅使用用户提供的材料，不要求联网。只生成待确认方案，不创建员工或开始工作。'
let current = '', version = '', sourceBefore: Record<string, string>
const requests: { protocol: string; path: string; model: string; tools: number; status?: number; actualModel?: string | null; actualProvider?: string | null }[] = []
async function sources() {
  const files = (await workspaceInputFiles()).filter(file => /\.(ts|tsx|json)$/.test(file))
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-planner-live.test.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A fresh batch is required')
  await mkdir(evidence); version = (await probeMagpie(root)).version; sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, version, model, prompt, sourceBefore, maxInferenceRequests: 6, maxPerProtocol: 2, observationMsPerProtocol: 120000, scope: 'production AppService team-draft generation and persistence; no confirmation, employee creation or desktop claim' }, null, 2))
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== root || !url.pathname.startsWith('/v1/') || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'POST') return originalFetch(input, init)
    if (!current || requests.length >= 6 || requests.filter(row => row.protocol === current).length >= 2) throw Error('Predeclared planner request cap reached')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    const row: typeof requests[number] = { protocol: current, path: url.pathname, model: body.model, tools: body.tools?.length ?? 0 }; requests.push(row)
    if (row.tools || row.model !== model) throw Error('Unexpected planning tools or model')
    const response = await originalFetch(input, init)
    row.status = response.status; row.actualModel = response.headers.get('x-magpie-model'); row.actualProvider = response.headers.get('x-magpie-provider')
    return response
  }
})
afterAll(async () => {
  globalThis.fetch = originalFetch
  if (enabled && version) await writeFile(join(evidence, 'requests.json'), JSON.stringify({ requests, sourceBefore, sourceAfter: await sources() }, null, 2))
})
test.skipIf(!enabled).each(['chat', 'responses', 'messages'] as const)('Magpie %s generates a persisted team draft without replay on restart', async protocol => {
  current = protocol
  const directory = join(evidence, protocol); await mkdir(directory)
  const create = () => new AppService({ dataPath: join(directory, 'data'), engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No secret expected') }, delete: async () => {} }, emit: () => {} })
  let service = create(), view: TeamDraftView | undefined, reopened: TeamDraftView | undefined, failure: string | undefined
  try {
    await service.init()
    const before = await service.handle('snapshot', undefined) as Snapshot
    const connection = await service.handle('saveConnection', { name: 'Magpie planner', provider: 'openai-compatible', baseUrl: root, defaultModel: model, gateway: { kind: 'magpie', protocol, auth: 'local' } }) as Connection
    const draft = await service.handle('openTeamDraft', undefined) as TeamDraft
    const saved = await service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt, selectedConnectionId: connection.id, selectedModelId: '', createGroup: true, groupTitle: '' } }) as TeamDraft
    await service.handle('generateTeamPlan', { draftId: draft.id, expectedVersion: saved.version, requestId: `${batch}-${protocol}` })
    await expect.poll(async () => { view = await service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView; return view.generation?.status !== 'running' }, { timeout: 120000, interval: 100 }).toBe(true)
    expect(view?.generation?.status).toBe('succeeded'); expect(view?.draft.plan?.members).toHaveLength(2)
    const attempts = view!.generation!.attempts, received = requests.filter(row => row.protocol === protocol)
    expect(attempts.length).toBe(received.length); expect(attempts.length).toBeGreaterThan(0); expect(attempts.length).toBeLessThanOrEqual(2)
    for (const [index, attempt] of attempts.entries()) {
      expect(attempt.modelCall).toMatchObject({ callId: attempt.callId, phase: 'team-plan', protocol, selectedModelId: model, route: { actualModelId: received[index].actualModel, actualProvider: received[index].actualProvider, routeSource: 'response-headers' } })
      expect(received[index].status).toBe(200); expect(received[index].actualModel).toBeTruthy()
    }
    const after = await service.handle('snapshot', undefined) as Snapshot
    expect(after.agents).toEqual(before.agents); expect(after.conversations).toEqual(before.conversations)
    const count = requests.length; await service.close(); service = create(); await service.init()
    reopened = await service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView
    expect(reopened).toEqual(view); expect(requests.length).toBe(count); expect(await sources()).toEqual(sourceBefore)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally { await service.close(); await writeFile(join(directory, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, protocol, version, view, reopened, requests: requests.filter(row => row.protocol === protocol) }, null, 2)) }
}, 130000)
