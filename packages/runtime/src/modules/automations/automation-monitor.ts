/*
 * [OUTPUT]: JSON文件名使用跨供应商JSON Schema可解析的Unicode NUL表达式，大小写扩展名与运行时拒绝规则一致。
 * [INPUT]: 宿主冻结的来源/比较规则、结构化观测、上次成功检查点与明确检查时间。
 * [OUTPUT]: 数据完整性/新鲜度、确定性比较、重要性与冷却决定；只有成功观测返回新检查点。
 * [POS]: 自动化监控的纯规则；不读取网络、不调用模型、不提交通知或写数据库。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AutomationMonitorCheckpoint, AutomationMonitorPolicy, AutomationMonitorResult, MonitorValue } from '@boai/shared/domain/automations'

const MAX_DEPTH = 32, MAX_NODES = 10000, MAX_VALUE_BYTES = 64 * 1024
const pointer = z.string().max(1000).refine(value => value === '' || value.startsWith('/') && !/~(?![01])/.test(value), '字段路径必须是 JSON Pointer')
export const monitorPolicySchema = z.object({
  comparator: z.literal('json-fields-v1'),
  source: z.object({ kind: z.literal('conversation-artifact'), conversationId: z.string().min(1).max(200), name: z.string().trim().min(1).max(200).regex(/^[^\\/:\u0000]+\.[jJ][sS][oO][nN]$/, '请选择已发布的 JSON 文件名') }).strict(),
  maxAgeSeconds: z.number().int().min(1).max(7 * 86400), cooldownSeconds: z.number().int().min(0).max(7 * 86400),
  rules: z.array(z.discriminatedUnion('mode', [z.object({ pointer, mode: z.literal('changed') }).strict(), z.object({ pointer, mode: z.literal('numeric_delta'), threshold: z.number().positive().finite() }).strict()])).min(1).max(32),
}).strict().refine(value => new Set(value.rules.map(rule => rule.pointer)).size === value.rules.length, '同一字段不能重复定义比较规则')

/** Sorted object keys, preserved array order; reject values JSON cannot reliably represent. */
function canonical(value: unknown) {
  let nodes = 0
  const visit = (value: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('监控数据超出结构限制')
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
    if (Array.isArray(value)) return `[${Array.from(value, item => visit(item, depth + 1)).join(',')}]`
    if (typeof value === 'object' && value && [Object.prototype, null].includes(Object.getPrototypeOf(value))) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${visit((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`
    throw new Error('监控数据包含不支持的值')
  }
  const text = visit(value, 0)
  if (Buffer.byteLength(text) > MAX_VALUE_BYTES) throw new Error('监控数据不能超过 64 KiB')
  return text
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
export function monitorPolicyFingerprint(policy: AutomationMonitorPolicy) { return digest(canonical(monitorPolicySchema.parse(policy))) }
function atPointer(data: MonitorValue, pointer: string): MonitorValue {
  let value = data
  for (const encoded of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!value || typeof value !== 'object' || Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key) || !Object.hasOwn(value, key)) throw new Error(`缺少监控字段：${pointer || '/'}`)
    value = (value as Record<string, MonitorValue>)[key]
  }
  return value
}

export function compareMonitorObservation(policy: AutomationMonitorPolicy, input: unknown, prior: AutomationMonitorCheckpoint | undefined, identity: { automationId: string; occurrenceId: string; checkedAt: string }): { result: AutomationMonitorResult; checkpoint?: AutomationMonitorCheckpoint } {
  const validated = monitorPolicySchema.parse(policy), policyFingerprint = monitorPolicyFingerprint(validated)
  if (!z.iso.datetime().safeParse(identity.checkedAt).success) throw new Error('检查时间无效')
  const checkedMs = Date.parse(identity.checkedAt)
  const result: AutomationMonitorResult = { policy: structuredClone(validated), policyFingerprint, checkedAt: identity.checkedAt, outcome: 'data_error', important: false, notification: 'quiet', reason: '', comparisons: [] }
  try {
    const observation = z.object({ schemaVersion: z.literal(1), observedAt: z.iso.datetime(), complete: z.literal(true), data: z.unknown() }).strict().parse(input)
    result.observedAt = observation.observedAt
    const observedMs = Date.parse(observation.observedAt)
    if (observedMs > checkedMs) throw new Error('数据观测时间在未来，无法验证新鲜度')
    if (checkedMs - observedMs > validated.maxAgeSeconds * 1000) throw new Error('数据已过期，不能记为无变化')
    const sourceHash = digest(canonical(observation.data)); result.sourceHash = sourceHash
    const values = validated.rules.map(rule => atPointer(observation.data as MonitorValue, rule.pointer))
    canonical(values)
    for (const [index, rule] of validated.rules.entries()) if (rule.mode === 'numeric_delta' && typeof values[index] !== 'number') throw new Error(`监控字段必须是有限数值：${rule.pointer}`)
    const previous = prior?.policyFingerprint === policyFingerprint ? prior : undefined
    if (previous) {
      const stored = z.object({ schemaVersion: z.literal(1), id: z.literal(identity.automationId), occurrenceId: z.string().min(1), conversationId: z.literal(validated.source.conversationId), policyFingerprint: z.literal(policyFingerprint), checkedAt: z.iso.datetime(), observedAt: z.iso.datetime(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), values: z.array(z.unknown()).length(values.length), referenceValues: z.array(z.unknown()).length(values.length), lastImportantAt: z.iso.datetime().optional() }).strict().safeParse(previous)
      if (!stored.success) throw new Error('检查点不完整，需要核对')
      canonical(previous.values); canonical(previous.referenceValues)
      if (Date.parse(previous.observedAt) > Date.parse(previous.checkedAt) || previous.lastImportantAt && Date.parse(previous.lastImportantAt) > Date.parse(previous.checkedAt)) throw new Error('检查点时间不一致，需要核对')
      for (const [index, rule] of validated.rules.entries()) if (rule.mode === 'numeric_delta' && (typeof previous.values[index] !== 'number' || typeof previous.referenceValues[index] !== 'number')) throw new Error('检查点字段类型不一致，需要核对')
      if (checkedMs < Date.parse(previous.checkedAt)) throw new Error('检查时钟发生回拨，暂不推进检查点')
      if (observedMs < Date.parse(previous.observedAt)) throw new Error('数据观测时间倒退，暂不推进检查点')
      if (observedMs === Date.parse(previous.observedAt) && sourceHash !== previous.sourceHash) throw new Error('同一观测时间出现不同数据，需要核对来源')
    }
    result.comparisons = validated.rules.map((rule, index) => {
      const current = values[index], old = previous?.values[index], reference = previous?.referenceValues[index]
      const changed = !!previous && canonical(current) !== canonical(old)
      const delta = previous && rule.mode === 'numeric_delta' ? (current as number) - (reference as number) : undefined
      if (delta !== undefined && !Number.isFinite(delta)) throw new Error(`监控字段差值超出数值范围：${rule.pointer}`)
      const significant = !!previous && (rule.mode === 'changed' ? canonical(current) !== canonical(reference) : Math.abs(delta!) >= rule.threshold)
      return { pointer: rule.pointer, ...(previous ? { previous: old, reference } : {}), current, changed, significant, ...(delta !== undefined ? { delta } : {}) }
    })
    const important = result.comparisons.some(value => value.significant)
    const changed = result.comparisons.some(value => value.changed)
    const cooling = important && !!previous?.lastImportantAt && checkedMs - Date.parse(previous.lastImportantAt) < validated.cooldownSeconds * 1000
    result.outcome = !previous ? 'baseline' : changed || important ? 'change' : 'no_change'
    result.important = important
    result.notification = important ? cooling ? 'cooldown' : 'eligible' : 'quiet'
    result.reason = !previous ? '数据完整，已建立比较基线' : cooling ? '发现重要变化，冷却期间保留；后续仍有变化时再提醒' : important ? '达到已保存的变化规则' : changed ? '检查完成，变化尚未达到重要阈值' : '检查完成，所选字段没有变化'
    const checkpoint: AutomationMonitorCheckpoint = { schemaVersion: 1, id: identity.automationId, occurrenceId: identity.occurrenceId, conversationId: validated.source.conversationId, policyFingerprint, checkedAt: identity.checkedAt, observedAt: observation.observedAt, sourceHash, values, referenceValues: !previous || important && !cooling ? values : previous.referenceValues, ...(previous?.lastImportantAt ? { lastImportantAt: previous.lastImportantAt } : {}), ...(important && !cooling ? { lastImportantAt: identity.checkedAt } : {}) }
    return structuredClone({ result, checkpoint })
  } catch (error) {
    result.reason = error instanceof z.ZodError ? '监控数据缺失、不完整或格式无效' : error instanceof Error ? error.message : '监控数据不可用'
    result.comparisons = []
    return { result }
  }
}
