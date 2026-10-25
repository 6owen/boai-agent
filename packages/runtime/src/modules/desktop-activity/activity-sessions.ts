/*
 * [INPUT]: Observed window samples and opt-in aggregate input events.
 * [OUTPUT]: Idle-gap sessions with actual counts; no inferred work or generated summary.
 * [POS]: Pure settings status projection.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { ActivityInputEvent, ActivitySample, ActivitySession } from '@boai/shared/domain/desktop-activity'
export function activitySessions(samples: ActivitySample[], events: ActivityInputEvent[], gapMs: number, recording: boolean, now = Date.now()): ActivitySession[] {
  const points = [
    ...samples.map(s => ({ id: s.id, at: s.capturedAt, from: s.capturedAt, app: s.app, samples: 1, screenshots: s.screenshot ? 1 : 0, keys: 0, clicks: 0 })),
    ...events.map(e => ({ id: e.id, at: e.capturedAt, from: e.firstCapturedAt ?? e.capturedAt, app: e.app, samples: 0, screenshots: 0, keys: e.keypresses, clicks: e.clicks })),
  ].sort((a, b) => a.from.localeCompare(b.from))
  const result: ActivitySession[] = []
  for (const point of points) {
    let session = result.at(-1)
    if (!session || +new Date(point.from) - +new Date(session.to) > gapMs) {
      session = { id: point.id, from: point.from, to: point.at, apps: [], sampleCount: 0, screenshotCount: 0, keypresses: 0, clicks: 0, active: false }
      result.push(session)
    }
    if (point.at > session.to) session.to = point.at
    if (!session.apps.includes(point.app)) session.apps.push(point.app)
    session.sampleCount += point.samples; session.screenshotCount += point.screenshots; session.keypresses += point.keys; session.clicks += point.clicks
  }
  const last = result.at(-1)
  if (last) last.active = recording && now - +new Date(last.to) < gapMs
  return result.reverse()
}
