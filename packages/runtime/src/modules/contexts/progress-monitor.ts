/*
 * [OUTPUT]: 2026-10-27 完整配对的重复/轮转观察与调整机会；不按观察次数终止执行。
 * [INPUT]: Complete paired observations from one authorized run, never truncated UI tool events.
 * [OUTPUT]: Bounded repeat/rotation evidence and one feedback opportunity; counts alone never stop execution.
 * [POS]: Run-local progress observer shared by adapters; no persistence, budget or tool replay.
 * [PROTOCOL]: Update Header and contexts/.folder.md when changed.
 */
import { createHash } from 'node:crypto'

function canonical(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || value === null) return JSON.stringify(value)
    throw new Error('Incomplete observation')
  }
  if (seen.has(value) || Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) throw new Error('Unsupported observation')
  seen.add(value)
  const result = Array.isArray(value) ? '[' + value.map(item => canonical(item, seen)).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key], seen)).join(',') + '}'
  seen.delete(value)
  return result
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const sensitive = /authorization|api.?key|password|secret|token|cookie|credential|base64|dataurl/i
function safeSample(value: unknown, key = ''): unknown {
  if (sensitive.test(key)) return '[redacted]'
  if (typeof value === 'string') return value.replace(/\b(?:sk-|Bearer\s+)[\w.-]+/gi, '[redacted]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
  if (Array.isArray(value)) return value.map(item => safeSample(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, safeSample(item, name)]))
  return value
}
export interface ProgressObservation { id: string; name: string; fingerprint: string; sample?: unknown; waiting: boolean }
export interface RepeatCandidate { fingerprint: string; revision: number; observations: ProgressObservation[]; feedback: boolean }
/** This is an evidence window, not an execution quota. It is discarded with its run. */
export class ProgressMonitor {
  pauseRequested = false
  private pending = new Map<string, { name: string; args: unknown }>()
  private observations: ProgressObservation[] = []
  private revision = 0
  private feedbackPattern?: string
  private feedbackAt = 0
  private reviewed = new Set<string>()
  start(id: string, name: string, args: unknown) {
    if (this.pending.size >= 64) { this.pending.clear(); this.invalidate() }
    this.pending.set(id, { name, args })
  }
  finish(id: string, name: string, result: unknown, isError = false) {
    const call = this.pending.get(id); this.pending.delete(id)
    if (!call || call.name !== name) { this.invalidate(); return }
    this.observe(id, name, { input: call.args, result, isError })
  }
  endStep() {
    // A provider may omit a result. Forget that incomplete evidence instead of
    // leaving all subsequent observations permanently blocked by its call ID.
    if (this.pending.size) { this.pending.clear(); this.invalidate() }
  }
  invalidate() { this.observations = []; this.revision++; this.feedbackPattern = undefined; this.reviewed.clear() }
  observe(id: string, name: string, data: unknown) {
    try {
      const encoded = canonical(data)
      // Never classify an explicitly shortened/missing result as complete evidence.
      if (/"(?:truncated|omitted|incomplete)"\s*:\s*(?:true|"[^"\s])/i.test(encoded)) { this.invalidate(); return }
      const fingerprint = hash(name + ':' + encoded)
      const sample = encoded.length <= 4000 ? safeSample(data) : undefined
      const waiting = /^(?:wait|sleep|wait_agent|wait_for|poll|read_logs|watch)(?:_|$)/i.test(name)
      this.observations.push({ id, name, fingerprint, sample, waiting }); this.observations = this.observations.slice(-48); this.revision++
      if (!this.pending.size && !this.candidate()) { this.feedbackPattern = undefined; this.reviewed.clear() }
    } catch { this.invalidate() }
  }
  candidate(): RepeatCandidate | undefined {
    if (this.pending.size) return
    const rows = this.observations
    for (let width = 1; width <= 8 && width * 3 <= rows.length; width++) {
      const tail = rows.slice(-width * 3)
      if (tail.some((item, index) => item.fingerprint !== tail[index % width]!.fingerprint)) continue
      if (tail.every(item => item.waiting)) return
      const cycle = tail.slice(-width).map(item => item.fingerprint)
      const fingerprint = hash(cycle.map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)].join(':')).sort()[0]!)
      return { fingerprint, revision: this.revision, observations: tail, feedback: this.feedbackPattern === fingerprint }
    }
  }
  feedback(candidate: RepeatCandidate) {
    if (!this.valid(candidate)) return
    this.feedbackPattern = candidate.fingerprint; this.feedbackAt = this.revision
  }
  shouldReview(candidate: RepeatCandidate) {
    // Give the employee a whole repeated trajectory to change its approach first.
    return candidate.feedback && this.revision - this.feedbackAt >= candidate.observations.length / 3 && !this.reviewed.has(candidate.fingerprint) && candidate.observations.every(item => item.sample !== undefined)
  }
  reviewedCandidate(candidate: RepeatCandidate) { this.reviewed.add(candidate.fingerprint) }
  valid(candidate: RepeatCandidate) { const current = this.candidate(); return current?.fingerprint === candidate.fingerprint && current.revision === candidate.revision }
}
export class ProgressStalledError extends Error {
  constructor() { super('相同轨迹在调整提示后仍重复，复核未发现实际进展；已保留工作现场，可修改要求后继续。'); this.name = 'ProgressStalledError' }
}
