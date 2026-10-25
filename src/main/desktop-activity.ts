/*
 * [INPUT]: Explicit recorder commands and independent input-monitor opt-in from the runtime.
 * [OUTPUT]: Actual platform capabilities, foreground OCR/optional JPEG, permission controls and lease-bound aggregate input events; unsupported adapters stay explicit.
 * [POS]: Native desktop host; settings, persistence and quota belong to the runtime.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { z } from 'zod'
import type { ActivityCaptureResult } from '../shared/domain/desktop-activity'
const inputSchema = z.object({
  action: z.enum(['status', 'request', 'request-input', 'open-screen-settings', 'open-input-settings', 'probe', 'sample', 'stop']),
  excludedApps: z.array(z.string().max(200)).max(100).optional(),
  options: z.object({ enableInputMonitor: z.boolean(), enableOcr: z.boolean(), ocrLanguages: z.array(z.string().max(32)).max(16), saveScreenshots: z.boolean(), jpegQuality: z.number().int().min(10).max(100), idleThresholdMs: z.number().int().min(10000).max(3600000) }).strict().optional(),
}).strict()
const inputEvent = z.object({ app: z.string().max(1000), bundleId: z.string().max(200), capturedAt: z.iso.datetime(), keypresses: z.number().int().nonnegative(), clicks: z.number().int().nonnegative() }).strict()
const resultSchema = z.object({ supported: z.boolean().optional(), permission: z.boolean().optional(), accessibilityPermission: z.boolean().optional(), skipped: z.string().max(100).optional(), error: z.string().max(1000).optional(), ocr: z.boolean().optional(), ocrError: z.string().max(1000).optional(), app: z.string().max(1000).optional(), bundleId: z.string().max(200).optional(), title: z.string().max(1000).optional(), text: z.string().max(18000).optional(), capturedAt: z.iso.datetime().optional(), idleMs: z.number().nonnegative().optional(), typingIdleMs: z.number().nonnegative().optional(), image: z.string().max(8_000_000).optional(), fingerprint: z.string().max(2048).optional() }).strict()
let monitor: ChildProcess | undefined, monitorKey = '', buffer = '', lease = 0
let events: NonNullable<ActivityCaptureResult['events']> = []
let monitorError: string | undefined
const executable = () => join(__dirname, '../native/boai-desktop-activity').replace('app.asar/', 'app.asar.unpacked/')
function stopMonitor() { const child = monitor; monitor = undefined; monitorKey = ''; buffer = ''; events = []; child?.kill() }
process.once('exit', stopMonitor)
const watchdog = setInterval(() => { if (monitor && Date.now() - lease > 30000) stopMonitor() }, 5000)
watchdog.unref()
function ensureMonitor(excludedApps: string[]) {
  lease = Date.now()
  const key = JSON.stringify(excludedApps)
  if (monitor && monitorKey === key) return
  stopMonitor(); monitorKey = key; monitorError = undefined
  const child = spawn(executable(), ['monitor', JSON.stringify({ excludedApps })], { stdio: ['ignore', 'pipe', 'ignore'] })
  monitor = child
  child.stdout!.on('data', chunk => {
    if (monitor !== child) return
    buffer += String(chunk)
    if (buffer.length > 128000) { stopMonitor(); monitorError = '键鼠监听输出异常'; return }
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
      try { const event = inputEvent.parse(JSON.parse(line)); if (events.length < 1000) events.push(event) } catch { monitorError = '键鼠事件读取失败' }
    }
  })
  child.on('error', () => { if (monitor === child) { stopMonitor(); monitorError = '无法启动键鼠监听' } })
  child.on('exit', code => { if (monitor === child) { stopMonitor(); monitorError = code ? '键鼠监听已停止，请检查辅助功能权限' : undefined } })
}
export async function desktopActivityCapture(input: unknown): Promise<ActivityCaptureResult> {
  const value = inputSchema.parse(input)
  if (value.action === 'stop') { stopMonitor(); monitorError = undefined; return {} }
  if (process.platform !== 'darwin') return { supported: false, permission: false, accessibilityPermission: false, capabilities: { platform: process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : 'other', screenshots: false, inputMonitor: false, ocr: false } }
  const result = await promisify(execFile)(executable(), [value.action, JSON.stringify({ ...value.options, excludedApps: value.excludedApps ?? [] })], { timeout: 20000, maxBuffer: 9_000_000 })
  const parsed = resultSchema.parse(JSON.parse(result.stdout))
  if (value.action === 'probe') {
    if (value.options?.enableInputMonitor && parsed.permission && parsed.accessibilityPermission) ensureMonitor(value.excludedApps ?? [])
    else stopMonitor()
  }
  const drained = value.action === 'probe' ? events.splice(0) : undefined
  return { ...parsed, capabilities: { platform: 'macos', screenshots: parsed.supported ?? true, inputMonitor: true, ocr: parsed.supported ?? true }, monitoring: !!monitor, ...(drained ? { events: drained } : {}), ...(monitorError && !parsed.error ? { error: monitorError } : {}) }
}
