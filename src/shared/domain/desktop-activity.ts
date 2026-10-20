/*
 * [INPUT]: Opt-in local foreground-window OCR and source-checked report snapshots.
 * [OUTPUT]: Recorder settings, samples, permission state and daily/multiday report contracts.
 * [POS]: Shared application and desktop activity UI types.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export interface ActivitySettings { revision: number; enabled: boolean; intervalSeconds: number; retentionDays: number; excludedApps: string[] }
export interface ActivitySample { id: string; capturedAt: string; app: string; bundleId: string; title: string; text: string; hash: string }
export interface ActivityReport { id: string; from: string; to: string; generatedAt: string; sourceHash: string; sampleIds: string[]; content: string }
export interface ActivityCaptureResult { supported?: boolean; permission?: boolean; skipped?: string; error?: string; app?: string; bundleId?: string; title?: string; text?: string; capturedAt?: string }
export interface ActivityStatus { settings: ActivitySettings; supported: boolean; permission: boolean; count: number; lastCapturedAt?: string; lastError?: string }
export interface ActivityEvidence { from: string; to: string; sourceHash: string; total: number; samples: ActivitySample[]; truncated: boolean; report: ActivityReport | null }
