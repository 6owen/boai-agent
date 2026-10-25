/*
 * [INPUT]: Opt-in local foreground-window OCR and source-checked report snapshots.
 * [OUTPUT]: Independent opt-in screenshots/input events, recorder settings, samples, permission state, source-bound structured analysis and daily/multiday report contracts.
 * [POS]: Shared application and desktop activity UI types.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export interface ActivitySettings {
  revision: number; enabled: boolean; intervalSeconds: number; retentionDays: number; excludedApps: string[]
  saveScreenshots: boolean; enableInputMonitor: boolean; enableOcr: boolean; ocrLanguages: string[]; ocrEveryN: number
  snapshotDebounceMs: number; idleThresholdMs: number; typingPauseMs: number; visualCheckIntervalMs: number
  jpegQuality: number; maxStorageMB: number
}
export type ActivityCaptureAction = 'status' | 'request' | 'request-input' | 'open-screen-settings' | 'open-input-settings' | 'probe' | 'sample' | 'stop'
export type ActivityCaptureOptions = Pick<ActivitySettings, 'enableInputMonitor' | 'enableOcr' | 'ocrLanguages' | 'saveScreenshots' | 'jpegQuality' | 'idleThresholdMs'>
export interface ActivityInputEvent { id: string; capturedAt: string; firstCapturedAt?: string; app: string; bundleId: string; keypresses: number; clicks: number }
export interface ActivitySession { id: string; from: string; to: string; apps: string[]; sampleCount: number; screenshotCount: number; keypresses: number; clicks: number; active: boolean }
export interface ActivitySample { id: string; capturedAt: string; app: string; bundleId: string; title: string; text: string; hash: string; screenshot?: { bytes: number }; ocr?: boolean }
export interface ActivityFragment { id: string; app: string; bundleId: string; firstObservedAt: string; lastObservedAt: string; sampleIds: string[]; titles: string[] }
export interface ActivityReport { id: string; from: string; to: string; generatedAt: string; sourceHash: string; sampleIds: string[]; content: string }
export interface ActivityEntityLink { label: string; ref?: string; repo?: string; url?: string }
export interface ActivityPerson { handle: string; name?: string }
export interface ActivityEntities {
  prs: ActivityEntityLink[]; issues: ActivityEntityLink[]; commits: ActivityEntityLink[]; people: ActivityPerson[]
  identifiers: string[]; repos: string[]; versions: string[]; events: string[]; decisions: string[]; urls: string[]
}
export interface ActivityMemoryCandidate { type: 'project' | 'feedback' | 'reference' | 'user'; content: string; why: string }
export interface ActivityAnalysis {
  id: string; from: string; to: string; observedAt: string; analyzedAt: string; sourceHash: string; sampleIds: string[]
  worth: boolean; title: string; description: string; project: string | null; topics: string[]; highlights: string[]
  entities: ActivityEntities; memoryCandidates: ActivityMemoryCandidate[]
}
export interface ActivityTopicCluster {
  key: string; title: string; project: string | null; analysisIds: string[]; sampleIds: string[]
  topics: string[]; highlights: string[]; entities: ActivityEntities
}
export interface ActivityCaptureResult {
  supported?: boolean; permission?: boolean; accessibilityPermission?: boolean; monitoring?: boolean; skipped?: string; error?: string
  app?: string; bundleId?: string; title?: string; text?: string; capturedAt?: string; idleMs?: number; typingIdleMs?: number
  image?: string; fingerprint?: string; events?: Omit<ActivityInputEvent, 'id'>[]
}
export interface ActivityStatus { settings: ActivitySettings; supported: boolean; permission: boolean; count: number; lastCapturedAt?: string; lastError?: string
  accessibilityPermission: boolean; monitoring: boolean; state: 'disabled' | 'permission' | 'idle' | 'recording' | 'unavailable' | 'error'
  screenshotCount: number; storageBytes: number; outputDirectory?: string; foregroundApp?: string; sessionCount: number; recentSessions: ActivitySession[]
}
export interface ActivityEvidence { from: string; to: string; sourceHash: string; total: number; samples: ActivitySample[]; fragments: ActivityFragment[]; analyses: ActivityAnalysis[]; analysisTotal: number; analysisTruncated: boolean; clusters: ActivityTopicCluster[]; truncated: boolean; report: ActivityReport | null }
export type ActivityMemoryHit =
  | { kind: 'observation'; id: string; observedAt: string; app: string; title: string; excerpt: string; sourceHash: string }
  | { kind: 'analysis'; id: string; from: string; to: string; observedAt: string; title: string; project: string | null; topics: string[]; excerpt: string; sourceHash: string; sampleIds: string[] }
  | { kind: 'report'; id: string; from: string; to: string; generatedAt: string; excerpt: string; sourceHash: string; sampleIds: string[] }
export interface ActivityMemoryPage { total: number; hits: ActivityMemoryHit[]; nextOffset: number | null; retentionDays: number }
