/*
 * [INPUT]: Frozen Mock inputs/prompts, read-only stored Bobo profile and original credential host.
 * [OUTPUT]: Actual AppService material intake, replies, published bytes, explicit revision and restart evidence; shared bounded calls.
 * [POS]: Daily-work-v1 manual business protocol, reusing Mastra/Application APIs; no synthetic model replies or human quality labels.
 * [PROTOCOL]: Update Header and evaluation/.folder.md on change.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppService } from '../../packages/runtime/src/service'
import { MastraEngine } from '../../packages/runtime/src/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../packages/runtime/src/contracts'
import type { AgentProfile, AgentSourceName } from '../../packages/shared/src/domain/agent-profile'
import type { ApplicationResult } from '../../packages/shared/src/domain/application-protocol'
import type { AgentHome, Connection, Conversation, ConversationDetail, Message, ModelUsage } from '../../packages/shared/src/domain'
import { MATERIAL_CHUNK_BYTES, type MaterialUploadReceipt, type SubmittedMaterial } from '../../packages/shared/src/domain/material-upload'
import type { ArtifactPreview } from '../../packages/shared/src/domain/artifacts'
import { EvaluationBudget } from './budget'
import { dailyWorkPreservesUnchangedText } from './daily-work-checks'

export const dailyWorkHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
interface Settings {
  resume?: { resultFile: string; dataPath: string }
  output: string; deadlineAt: number; budgetFile: string; maxRequests: number; attemptRequests: number
  expectedConnection: { id: string; provider: string; baseUrl: string; defaultModel: string; api?: string }
  materials: { name: string; content: string; sha256: string }[]; prompts: string[]
  currentConfiguration: { agent: { modelId: string }; profile: AgentProfile; files: { name: string; hash: string; content: string }[] }
}
export async function runDailyWorkEvaluation({ settings, connection, apiKey }: { settings: Settings; connection: Connection; apiKey: string }) {
  if (JSON.stringify(settings.expectedConnection) !== JSON.stringify({ id: connection.id, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, ...(connection.api ? { api: connection.api } : {}) })) throw Error('Selected connection changed after preparation; no request sent')
  if (settings.materials.length !== 3 || settings.prompts.length !== 4 || settings.materials.some(f => dailyWorkHash(f.content) !== f.sha256)) throw Error('Frozen daily-work contract differs')
  const prior = settings.resume ? JSON.parse(await readFile(settings.resume.resultFile, 'utf8')) : undefined
  const started = Date.now(), dataPath = settings.resume?.dataPath ?? join(settings.output, 'data'), budget = new EvaluationBudget(settings.budgetFile, settings.maxRequests)
  const requests: any[] = [...prior?.requests ?? []], calls: { id: string; runId: string; phase: string; turn: number; usage?: ModelUsage }[] = [...prior?.calls ?? []], stages: any[] = [...prior?.stages ?? []], checks: { name: string; passed: boolean; reason?: string }[] = [...prior?.checks ?? []]
  const evidence: any = { protocol: 'daily-work-v1', quality: 'needs_review', stages, checks, requests, calls, startedAt: new Date().toISOString(), gui: false, originalPersonalDataReadOnly: true }
  const redact = (value: string) => apiKey ? value.replaceAll(apiKey, '[REDACTED]') : value
  const save = () => writeFile(join(settings.output, 'result.json'), redact(JSON.stringify(evidence, null, 2)), { mode: 0o600 })
  const check = (name: string, passed: boolean, reason?: string) => checks.push({ name, passed, ...(reason ? { reason } : {}) })
  let turn = 0, service: AppService | undefined, conversation: Conversation | undefined
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (Date.now() >= settings.deadlineAt || requests.length >= settings.attemptRequests) throw Error('Daily-work bounded experiment ceiling reached')
    const address = new URL(url instanceof Request ? url.url : String(url))
    if (address.origin !== new URL(connection.baseUrl).origin) throw Error('Daily-work does not authorize external retrieval or publication')
    await budget.reserve('daily-work')
    const row: any = { turn, at: new Date().toISOString(), url: address.origin + address.pathname, ...(typeof options?.body === 'string' ? { input: JSON.parse(options.body) } : {}) }
    requests.push(row); await save()
    try { const response = await originalFetch(url, options); row.status = response.status; return response }
    catch (error) { row.error = redact(String(error)); throw error }
    finally { await save() }
  }
  const adapter = new MastraEngine({ runTimeoutMs: 90_000 })
  const wrap = (context: EngineContext): EngineContext => ({ ...context,
    onModelCallStarted: async (id, phase, thinking) => { calls.push({ id, phase, runId: context.runId, turn }); await context.onModelCallStarted?.(id, phase, thinking) },
    onModelCallUsage: async (id, usage) => { const call = calls.find(c => c.id === id && c.runId === context.runId); if (call) call.usage = usage; await context.onModelCallUsage?.(id, usage) },
  })
  const engine: AgentEngine = { test: (value, key) => adapter.test(value, key), decide: c => adapter.decide(wrap(c)), run: c => adapter.run(wrap(c)), extractMemory: c => adapter.extractMemory(wrap(c)), runBehavior: (c, input) => adapter.runBehavior(wrap(c), input) }
  const secrets = new Map<string, string>()
  const open = async () => {
    service = new AppService({ dataPath, engine, emit: () => {}, skillDiscovery: { homeDir: join(settings.output, 'empty-skill-home') }, secrets: { get: async id => secrets.get(id) ?? '', set: async (id, value) => { secrets.set(id, value) }, delete: async id => { secrets.delete(id) } } })
    await service.init(); return service
  }
  const close = async () => { if (service) { const prior = service; service = undefined; await prior.close() } }
  const app = async (operation: string, input: any, requestId?: string) => {
    const value = await service!.handle('executeApplicationOperation', { operation, input, requestId }) as ApplicationResult
    if (value.status !== 'succeeded') throw Error('Application preparation rejected: ' + operation + ' ' + value.error?.code)
    return value.data as any
  }
  const settle = async () => {
    const deadline = Math.min(settings.deadlineAt, Date.now() + 120_000)
    for (;;) {
      const detail = await service!.handle('getConversation', { id: conversation!.id }) as ConversationDetail
      if (detail.turns?.length && detail.turns.every(t => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'].includes(t.status)) && detail.runs.every(r => ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status))) return detail
      if (Date.now() > deadline) { await service!.handle('cancelRun', { conversationId: conversation!.id }); throw Error('Daily-work turn deadline reached') }
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  const previews = async (detail: ConversationDetail) => Promise.all(detail.artifacts.map(a => service!.handle('getArtifactPreview', { id: a.id, expectedHash: a.contentHash }) as Promise<ArtifactPreview>))
  try {
    await open()
    const uploads: SubmittedMaterial[] = []
    if (prior) {
      const snapshot = await service!.handle('snapshot', undefined) as import('../../packages/shared/src/domain').Snapshot
      const saved = snapshot.connections.find(c => c.baseUrl === connection.baseUrl && c.defaultModel === (settings.currentConfiguration.agent.modelId || connection.defaultModel))
      if (!saved || prior.stages.length !== 1 || prior.stages[0].detail.turns.at(-1).status !== 'failed' || prior.requests.some((r: any) => r.status !== 200)) throw Error('Continuation must preserve a known failed first reply, never retry an unknown request')
      secrets.set(saved.id, apiKey); conversation = prior.stages[0].detail.conversation
      evidence.continuedFrom = settings.resume
    } else {
    const saved = await service!.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: settings.currentConfiguration.agent.modelId || connection.defaultModel, api: connection.api }) as Connection
    secrets.set(saved.id, apiKey)
    const profile = await app('employees.profile', { agentId: 'bobo' }) as AgentProfile
    const { agentId: _agent, revision: _revision, updatedAt: _updated, ...config } = settings.currentConfiguration.profile
    await app('employees.configure', { agentId: 'bobo', expectedRevision: profile.revision, config: { ...config, features: { ...config.features, emotions: false, growth: false, travel: false }, proactive: { ...config.proactive, enabled: false }, behaviors: config.behaviors.map(b => ({ ...b, enabled: false })) } }, 'daily-profile')
    for (const file of settings.currentConfiguration.files) {
      const home = await service!.handle('getAgentHome', { agentId: 'bobo' }) as AgentHome, prior = home.files.find(f => f.name === file.name)
      if (!prior || dailyWorkHash(file.content) !== file.hash) throw Error('Frozen profile source differs')
      if (prior.hash !== file.hash) await service!.handle('saveAgentFile', { agentId: 'bobo', name: file.name as AgentSourceName, content: file.content, expectedHash: prior.hash, expectedConfigVersion: home.configVersion })
    }
    const sources = join(settings.output, 'inputs'); await mkdir(sources)
    for (const file of settings.materials) {
      const path = join(sources, file.name); await writeFile(path, file.content)
      const bytes = Buffer.from(file.content), uploadId = randomUUID()
      await service!.handle('transferMaterial', { action: 'begin', uploadId, name: file.name, size: bytes.length, contentHash: file.sha256 })
      for (let offset = 0; offset < bytes.length; offset += MATERIAL_CHUNK_BYTES) await service!.handle('transferMaterial', { action: 'chunk', uploadId, offset, base64: bytes.subarray(offset, offset + MATERIAL_CHUNK_BYTES).toString('base64') })
      const receipt = await service!.handle('transferMaterial', { action: 'finish', uploadId }) as MaterialUploadReceipt
      if (!receipt.selectionId) throw Error('Actual material upload has no selection')
      uploads.push({ selectionId: receipt.selectionId, name: file.name, size: bytes.length, contentHash: file.sha256 })
    }
    evidence.uploads = uploads; await save()
    }
    let original: ArtifactPreview | undefined, revised: ArtifactPreview | undefined
    for (const [index, prompt] of settings.prompts.entries()) {
      if (index < (prior?.stages.length ?? 0)) continue
      turn = index + 1
      const before = conversation ? await service!.handle('getConversation', { id: conversation.id }) as ConversationDetail : undefined
      const requestId = 'daily-turn-' + turn
      let message: Message
      if (turn === 1) {
        conversation = await service!.handle('startCoreConversation', { content: prompt, requestId, materialUploads: uploads }) as Conversation
        message = await service!.handle('getMessageReceipt', { requestId }) as Message
      } else if (turn === 3) message = await service!.handle('reviseArtifact', { conversationId: conversation!.id, artifactId: original!.artifact.id, contentHash: original!.artifact.contentHash, targetAgentId: 'bobo', content: prompt, requestId }) as Message
      else message = await service!.handle('sendMessage', { conversationId: conversation!.id, content: prompt, mentionIds: [], requestId }) as Message
      const detail = await settle(), artifacts = await previews(detail), reply = detail.messages.filter(m => !before?.messages.some(b => b.id === m.id) && m.senderType === 'agent').map(m => m.content).join('\n')
      const newRuns = detail.runs.filter(r => !before?.runs.some(b => b.id === r.id))
      const completed = newRuns.every(r => r.status === 'completed') && detail.turns?.at(-1)?.status === 'completed'
      const row: any = { turn, prompt, message, detail, reply, artifacts, completed, requests: requests.filter(r => r.turn === turn).length }; stages.push(row)
      await save(); process.stdout.write(JSON.stringify({ turn, requests: row.requests, runs: detail.runs.length, artifacts: artifacts.length }) + '\n')
      if (!completed) throw Error('Daily-work has a non-completed actual run or turn')
      if (turn === 1) {
        const materials = detail.materials ?? []; evidence.materials = materials
        check('materials:actual-attached-originals', materials.length === 3 && message.materialIds?.length === 3)
        for (const material of materials) {
          const file = settings.materials.find(f => f.name === material.name), bytes = await readFile(join(dataPath, 'materials', conversation!.id, material.id, 'original'))
          check('material:original:' + material.id, !!file && material.status === 'ready' && dailyWorkHash(bytes) === file.sha256)
        }
        check('question:no-file', artifacts.length === 0)
        check('question:known-numbers-observed', /88[.．]33\s*%/.test(reply) && /53/.test(reply) && /60/.test(reply) && /7/.test(reply), 'Presence check only; independent fact/quality review remains pending')
      }
      if (turn === 2) {
        check('delivery:one-actual-file', artifacts.length === 1)
        if (artifacts.length !== 1) throw Error('Expected one actual report, not a claimed filename')
        original = artifacts[0]
        check('delivery:registered-bytes', original.artifact.name === '青禾周报-2026-10-22.md' && dailyWorkHash(original.text) === original.artifact.contentHash)
        await writeFile(join(settings.output, 'original-report.md'), original.text)
      }
      if (turn === 3) {
        revised = artifacts.find(a => a.artifact.previousArtifactId === original!.artifact.id)
        check('revision:explicit-original-lineage', !!revised && revised.artifact.logicalArtifactId === original!.artifact.logicalArtifactId && !!revised.artifact.revisionRequestId)
        if (!revised) throw Error('Explicit revision did not produce the requested original lineage')
        check('revision:preserved-other-body', dailyWorkPreservesUnchangedText(original!.text, revised.text))
        check('revision:title-and-pending', /^# 青禾周报助手：上线前检查\s*$/m.test(revised.text) && (revised.text.match(/^#{2,6}\s+(?:[一二三四五六七八九十百0-9]+[.、．]\s*)?待确认事项\s*$/gm)?.length ?? 0) === 1 && /预算/.test(revised.text) && /邀请人数/.test(revised.text) && /根因/.test(revised.text))
        check('revision:original-preserved', artifacts.find(a => a.artifact.id === original!.artifact.id)?.text === original!.text)
        await writeFile(join(settings.output, 'revised-report.md'), revised.text)
        const beforeRequests = requests.length
        await close(); await open()
        const reopened = await service!.handle('getConversation', { id: conversation!.id }) as ConversationDetail, reopenedPreviews = await previews(reopened)
        evidence.restart = { beforeRequests, afterRequests: requests.length, before: detail, after: reopened, artifacts: reopenedPreviews }
        check('restart:no-replay-and-preserved', requests.length === beforeRequests && JSON.stringify(reopened.messages) === JSON.stringify(detail.messages) && JSON.stringify(reopened.runs) === JSON.stringify(detail.runs) && JSON.stringify(reopenedPreviews) === JSON.stringify(artifacts))
      }
      if (turn === 4) {
        check('notice:one-paragraph', !!reply.trim() && !/\n\s*\n/.test(reply.trim()))
        check('notice:provided-change-observed', /周四/.test(reply) && /周五/.test(reply))
        check('notice:no-known-unsupported-facts', !/同一时间|同一地点|议程不变|议程保持|其余.{0,8}不变|其他.{0,8}(?:不变|照旧)|因故|上午|下午|会议室/.test(reply), 'Limited deterministic negative check, not full semantic certification')
        check('notice:no-new-file', artifacts.length === before!.artifacts.length)
      }
      await save()
    }
    for (const operation of ['tasks.list', 'plans.list']) {
      const items = await app(operation, { agentId: 'bobo', ...(operation === 'plans.list' ? { conversationId: conversation!.id, includeArchived: true } : { includeDone: true }) })
      check(operation + ':no-implicit-records', Array.isArray(items) && items.length === 0)
    }
    check('all-turns:completed', stages.length === 4 && stages.every(s => s.completed ?? s.detail.turns?.at(-1)?.status === 'completed'))
    evidence.status = checks.every(c => c.passed) ? 'technical-checks-passed' : 'checks-failed'
    if (evidence.status === 'checks-failed') process.exitCode = 1
  } catch (error) { evidence.status = 'execution-failed'; evidence.error = redact(String(error)); process.exitCode = 1 }
  finally { try { await close() } catch (error) { evidence.cleanupError = redact(String(error)); process.exitCode = 1 } finally { globalThis.fetch = originalFetch; evidence.elapsedMs = Date.now() - started; evidence.finishedAt = new Date().toISOString(); await save() } }
}
