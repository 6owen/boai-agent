/*
 * [INPUT]: Explicitly synthetic missing/corrupt/blocked supervision records.
 * [OUTPUT]: Scorer rejects orphan work hidden by a different valid delegation, fake completion and unexercised faults; not a real-model result.
 * [POS]: SG-v1 evaluation contract regression.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import type { EvaluationRecord } from './evaluation/schema'
import { checkGroupSupervision, groupSupervisionCases } from './evaluation/group-supervision'
import { sampleHash } from './evaluation/checks'

function fixture(): EvaluationRecord {
  const body = '5分钟选区域，15分钟清垃圾，25分钟归位，总共45分钟。' + '今天下班后先整理桌面，不买收纳用品，把留下的东西放回原处。'.repeat(12)
  const content = '# 下班后的小整理\n\n## 口播正文\n' + body
  return {
    caseId: 'synthetic-only', metadata: { members: Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: String(i), role: String(i) })) },
    detail: { runs: [], messages: [], workItems: [{ id: 'root', ownerAgentId: '0', status: 'blocked' }] },
    artifacts: [{ id: 'final', name: '口播稿.md', path: '/isolated/口播稿.md', publishedAt: new Date(3000).toISOString(), content, sha256: createHash('sha256').update(content).digest('hex'), complete: true }],
  } as unknown as EvaluationRecord
}
it('does not treat a valid file as completed group work', () => {
  const checks = checkGroupSupervision(fixture(), false)
  expect(checks.find(item => item.name === 'SG:script-contract')?.status).toBe('passed')
  for (const name of ['four-workers-executed', 'real-delegation', 'leader-continued', 'leader-read-final', 'leader-final-delivery']) expect(checks.find(item => item.name === `SG:${name}`)?.status).toBe('failed')
})
it.each(['orphan', 'different-leader-root'] as const)('does not let an earlier valid child hide later %s work by the same employee', variant => {
  const record = fixture(), root = record.detail!.workItems![0]
  record.detail!.workItems!.push(...['1', '2', '3', '4'].map(id => ({ ...root, id: `child-${id}`, ownerAgentId: id, parentWorkId: root.id, rootWorkId: root.id })))
  const status = () => checkGroupSupervision(record, false).find(item => item.name === 'SG:real-delegation')?.status
  expect(status()).toBe('passed')
  if (variant === 'different-leader-root') record.detail!.workItems!.push({ ...root, id: 'another-root', rootWorkId: 'another-root' })
  record.detail!.workItems!.push({ ...root, id: 'outline', ownerAgentId: '2', parentWorkId: variant === 'orphan' ? undefined : 'another-root', rootWorkId: variant === 'orphan' ? 'outline' : 'another-root' })
  expect(status()).toBe('failed')
})
it('rejects content/hash mismatch and never claims an untriggered fault was recovered', () => {
  const record = fixture(); record.artifacts[0].sha256 = 'wrong'
  const checks = checkGroupSupervision(record, true)
  expect(checks.find(item => item.name === 'SG:final-file')?.status).toBe('failed')
  expect(checks.find(item => item.name === 'SG:real-path-failure')?.status).toBe('incomplete')
  expect(checks.find(item => item.name === 'SG:leader-intervened-before-fallback')?.status).toBe('incomplete')
})
it('does not count reading different bytes as reading the published final', () => {
  const record = fixture()
  record.detail!.runs.push({ id: 'lead-read', agentId: '0', phase: 'execution', status: 'completed', toolEvents: [{ id: 'read', name: 'read_file', status: 'completed', createdAt: new Date(4000).toISOString(), detail: JSON.stringify({ content: 'another draft' }) }] } as NonNullable<EvaluationRecord['detail']>['runs'][number])
  expect(checkGroupSupervision(record, false).find(item => item.name === 'SG:leader-read-final')?.status).toBe('failed')
})
it('uses the same business brief and real filesystem collision across the diagnostic pair', () => {
  const [normal, conflict] = groupSupervisionCases
  expect(normal.prompt).toBe(conflict.prompt)
  expect(normal.memberInstructions).toEqual(conflict.memberInstructions)
  expect(conflict.files).toEqual([{ path: 'exports', content: expect.any(String) }])
  expect(normal.events).toBeUndefined(); expect(conflict.events).toBeUndefined()
  expect(normal.executionTimeoutMs).toBeNull()
})
it('requires the actual fallback publication receipt rather than a shared artifact path', () => {
  const record = fixture(), final = record.artifacts[0]
  final.path = '/shared/artifacts/final-口播稿.md'
  const status = () => checkGroupSupervision(record, true).find(item => item.name === 'SG:fallback-delivered')?.status
  expect(status()).toBe('failed')
  const tool = { id: 'publish', name: 'publish_artifact', status: 'completed', createdAt: final.publishedAt!, input: JSON.stringify({ path: 'self:/work/exports/口播稿.md' }), detail: JSON.stringify({ artifact: { id: final.id, contentHash: final.sha256 } }) }
  record.detail!.runs.push({ id: 'editor', agentId: '4', phase: 'execution', status: 'completed', toolEvents: [tool] } as NonNullable<EvaluationRecord['detail']>['runs'][number])
  expect(status()).toBe('failed')
  tool.input = JSON.stringify({ path: 'self:/work/口播稿.md' })
  expect(status()).toBe('passed')
  tool.detail = JSON.stringify({ artifact: { id: 'different-final', contentHash: final.sha256 } })
  expect(status()).toBe('failed')
})
it('accepts an exact earlier published copy but never a different or not-yet-published version', () => {
  const record = fixture(), first = record.artifacts[0]
  record.artifacts.push({ ...first, id: 'republished', publishedAt: new Date(5000).toISOString() })
  const tool = { id: 'read', name: 'read_file', status: 'completed', createdAt: new Date(4000).toISOString(), detail: JSON.stringify({ content: first.content }) }
  record.detail!.runs.push({ id: 'lead', agentId: '0', phase: 'execution', status: 'completed', toolEvents: [tool] } as NonNullable<EvaluationRecord['detail']>['runs'][number])
  const status = () => checkGroupSupervision(record, false).find(item => item.name === 'SG:leader-read-final')?.status
  expect(status()).toBe('passed')
  tool.createdAt = new Date(2000).toISOString()
  expect(status()).toBe('failed')
  tool.createdAt = new Date(4000).toISOString(); tool.detail = JSON.stringify({ content: 'changed version' })
  expect(status()).toBe('failed')
})
it('marks a truncated relevant read as missing evidence rather than claiming it never happened', () => {
  const record = fixture(), first = record.artifacts[0]
  record.detail!.runs.push({ id: 'lead', agentId: '0', phase: 'execution', status: 'completed', toolEvents: [{ id: 'read', name: 'read_file', status: 'completed', createdAt: new Date(4000).toISOString(), input: JSON.stringify({ path: `shared:/artifacts/${first.id}-${first.name}` }), detail: '{"content":"truncated' }] } as NonNullable<EvaluationRecord['detail']>['runs'][number])
  expect(checkGroupSupervision(record, false).find(item => item.name === 'SG:leader-read-final')?.status).toBe('incomplete')
})
it('binds supervision fixture and phase evidence to review identity without changing old sample hashes', () => {
  const record = fixture(), old = sampleHash(record)
  record.fixtureFiles = [{ agentId: '0', path: 'exports', expectedHash: 'before', actualHash: 'after' }]
  expect(sampleHash(record)).toBe(old)
  record.scenario = groupSupervisionCases[1]
  const before = sampleHash(record)
  record.fixtureFiles[0].actualHash = 'before'
  expect(sampleHash(record)).not.toBe(before)
  const next = sampleHash(record)
  record.phases = [{ phase: 'execution', runId: 'lead', agentId: '0', startAt: 4000 }]
  expect(sampleHash(record)).not.toBe(next)
})
