/*
 * [INPUT]: Trusted same-profile host calls and fixed native local OCR helper.
 * [OUTPUT]: Bounded foreground samples/permission status; no image files or remote upload.
 * [POS]: Desktop host implementation; recording schedule and consent stay in runtime.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { z } from 'zod'
import type { ActivityCaptureResult } from '../shared/domain/desktop-activity'
const inputSchema = z.object({ action: z.enum(['status', 'request', 'sample']), excludedApps: z.array(z.string().max(200)).max(100).optional() }).strict()
export async function desktopActivityCapture(input: unknown): Promise<ActivityCaptureResult> {
  const value = inputSchema.parse(input)
  if (process.platform !== 'darwin') return { supported: false, permission: false }
  const executable = join(__dirname, '../native/boai-desktop-activity').replace('app.asar/', 'app.asar.unpacked/')
  const result = await promisify(execFile)(executable, [value.action, ...(value.excludedApps ?? [])], { timeout: 20000, maxBuffer: 128000 })
  return z.object({ supported: z.boolean().optional(), permission: z.boolean().optional(), skipped: z.string().max(100).optional(), error: z.string().max(1000).optional(), app: z.string().max(1000).optional(), bundleId: z.string().max(200).optional(), title: z.string().max(1000).optional(), text: z.string().max(18000).optional(), capturedAt: z.iso.datetime().optional() }).strict().parse(JSON.parse(result.stdout))
}
