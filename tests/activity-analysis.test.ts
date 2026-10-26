/*
 * [INPUT]: Fixed R-A3 project/topic/entity feature cases adapted from Alma's archived grouping code.
 * [OUTPUT]: Stable cluster membership, Jaccard threshold and case-insensitive entity merge without invented duration.
 * [POS]: Pure desktop activity grouping behavior test.
 * [PROTOCOL]: Update this Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { clusterActivityAnalyses, emptyActivityEntities } from '../packages/runtime/src/modules/desktop-activity/activity-analysis'
import type { ActivityAnalysis } from '../packages/shared/src/domain/desktop-activity'

const item = (id: string, at: string, patch: Partial<ActivityAnalysis> = {}): ActivityAnalysis => ({
  id, from: '2026-10-20', to: '2026-10-20', observedAt: at, analyzedAt: at, sourceHash: id, sampleIds: [id],
  worth: true, title: id, description: id, project: null, topics: [], highlights: [], entities: emptyActivityEntities(), memoryCandidates: [], ...patch,
})

it('groups exact projects and overlapping Alma features while retaining original source IDs', () => {
  const alpha = item('a', '2026-10-20T09:00:00Z', { project: 'BOAI', topics: ['memory'], entities: { ...emptyActivityEntities(), repos: ['wenbo/boai'], prs: [{ label: 'PR #42', ref: '42', repo: 'wenbo/boai' }] } })
  const sameProject = item('b', '2026-10-20T10:00:00Z', { project: 'boai', topics: ['desktop'], entities: { ...emptyActivityEntities(), repos: ['Wenbo/BOAI'], prs: [{ label: 'PR 42', ref: '42', repo: 'Wenbo/BOAI' }] } })
  const related = item('c', '2026-10-20T11:00:00Z', { topics: ['memory'], entities: { ...emptyActivityEntities(), identifiers: ['MemoryRepository'] } })
  const unrelated = item('d', '2026-10-20T12:00:00Z', { topics: ['design'] })
  const ignored = item('e', '2026-10-20T13:00:00Z', { worth: false, project: 'BOAI' })
  const clusters = clusterActivityAnalyses([unrelated, sameProject, ignored, related, alpha])
  expect(clusters.map(cluster => cluster.analysisIds)).toEqual([['a', 'b', 'c'], ['d']])
  expect(clusters[0]).toMatchObject({ key: 'proj:boai', title: 'BOAI', sampleIds: ['a', 'b', 'c'], topics: ['memory', 'desktop'], entities: { repos: ['wenbo/boai'], prs: [{ label: 'PR #42' }], identifiers: ['MemoryRepository'] } })
  expect(clusters[0]!.entities).not.toBe(alpha.entities)
  expect(alpha.entities.repos).toEqual(['wenbo/boai'])
  expect(clusters[1]!.title).toBe('design')
  expect(JSON.stringify(clusters)).not.toContain('minutes')
})
