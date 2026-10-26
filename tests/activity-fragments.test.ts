/*
 * [INPUT]: Archived Alma R-A2 adjacent-session merge rule and actual timestamped BOAI samples.
 * [OUTPUT]: Bounded same-app grouping with exact sample provenance and no inferred duration.
 * [POS]: Pure activity projection regression, separate from OCR capture and model analysis.
 * [PROTOCOL]: Update this Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { observedFragments } from '../packages/runtime/src/modules/desktop-activity/activity-fragments'
import type { ActivitySample } from '../packages/shared/src/domain/desktop-activity'

const sample = (id: string, seconds: number, bundleId: string, title: string): ActivitySample => ({
  id, app: bundleId, bundleId, title, text: '', capturedAt: new Date(Date.UTC(2026, 9, 20, 10, 0, seconds)).toISOString(), hash: id,
})

it('merges only adjacent observations from the same app within the allowed gap', () => {
  const fragments = observedFragments([
    sample('a2', 40, 'editor', 'code.ts'), sample('b1', 50, 'browser', 'Docs'), sample('a1', 0, 'editor', 'code.ts'),
    sample('b2', 100, 'browser', 'Search'), sample('b3', 300, 'browser', 'Later'),
  ], 120_000)
  expect(fragments.map(item => item.sampleIds)).toEqual([['a1', 'a2'], ['b1', 'b2'], ['b3']])
  expect(fragments[0]).toMatchObject({ firstObservedAt: '2026-10-20T10:00:00.000Z', lastObservedAt: '2026-10-20T10:00:40.000Z', titles: ['code.ts'] })
  expect(fragments[1]?.titles).toEqual(['Docs', 'Search'])
  expect(fragments.every(item => !('durationMs' in item) && !('completed' in item))).toBe(true)
})
