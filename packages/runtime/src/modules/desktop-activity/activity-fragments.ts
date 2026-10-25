/*
 * [INPUT]: R-A2 Alma mergePendingAdjacent at archived main.txt 66122–66135 and BOAI ordered OCR samples.
 * [OUTPUT]: Source-bound observed fragments; adjacent rows merge only within a bounded gap and shared app.
 * [POS]: Pure desktop activity projection; no task completion or unobserved duration inference.
 * [PROTOCOL]: Update this Header, owning .folder.md and Memory spec 15 when changed.
 */
import type { ActivityFragment, ActivitySample } from '@boai/shared/domain/desktop-activity'

/** Alma's gap/app-overlap rule, adapted from mutable store sessions to immutable observed samples. */
export function observedFragments(samples: ActivitySample[], mergeGapMs: number): ActivityFragment[] {
  const ordered = [...samples].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))
  const result: ActivityFragment[] = []
  for (const sample of ordered) {
    const previous = result.at(-1)
    const gap = previous ? Date.parse(sample.capturedAt) - Date.parse(previous.lastObservedAt) : Infinity
    if (previous && gap >= 0 && gap <= mergeGapMs && previous.bundleId === sample.bundleId) {
      previous.lastObservedAt = sample.capturedAt
      previous.sampleIds.push(sample.id)
      if (!previous.titles.includes(sample.title) && sample.title) previous.titles.push(sample.title)
      continue
    }
    result.push({ id: sample.id, app: sample.app, bundleId: sample.bundleId, firstObservedAt: sample.capturedAt,
      lastObservedAt: sample.capturedAt, sampleIds: [sample.id], titles: sample.title ? [sample.title] : [] })
  }
  return result
}
