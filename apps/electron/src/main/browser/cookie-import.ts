/*
 * [INPUT]: 本人选择的文件或本机profile副本Cookie、固定窗口/partition身份、Electron Cookie端口。
 * [OUTPUT]: 有界解析、无值预览、一次性过期候选与逐项写入/读回/落盘结果；不暴露凭据或原始错误。
 * [POS]: 独立浏览器Cookie解析/写回核心；本机资料读取隔离于cookie-sources，不提供员工工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import type { Cookie, Cookies, CookiesSetDetails } from 'electron'
import type { BrowserCookieImportPreview, BrowserCookieImportResult } from '@boai/shared/ipc/browser'

export const COOKIE_IMPORT_MAX_BYTES = 2 * 1024 * 1024
const MAX_COOKIES = 5000, PENDING_TTL = 5 * 60_000
const REASONS = { invalid: '格式或属性无效', expired: '已过期', partitioned: '分区 Cookie 暂不支持', duplicate: '重复记录（保留最后一条）' } as const
interface PreparedCookie { host: string; hostOnly: boolean; details: CookiesSetDetails }
interface Parsed { cookies: PreparedCookie[]; total: number; skipped: BrowserCookieImportPreview['skipped'] }
export interface CookieImportBinding { instanceId: string; partition: string }
interface Pending { binding: CookieImportBinding; expiresAt: number; parsed: Parsed; timer: ReturnType<typeof setTimeout> }
export type CookieImportPort = Pick<Cookies, 'set' | 'get' | 'flushStore'>
class InvalidCookie extends Error { constructor(readonly reason: keyof typeof REASONS = 'invalid') { super(reason) } }
const invalid = (): never => { throw new InvalidCookie() }
function boolean(value: unknown, fallback: boolean): boolean { return value === undefined ? fallback : typeof value === 'boolean' ? value : invalid() }
function normalize(value: unknown, now: number): PreparedCookie {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const row = value as Record<string, unknown>
  if (row.partitionKey != null || row.partitionKeyOpaque === true || row.partitioned === true || typeof row.firstPartyDomain === 'string' && row.firstPartyDomain) throw new InvalidCookie('partitioned')
  const name = row.name, cookieValue = row.value
  if (typeof name !== 'string' || /[\x00-\x20\x7f()<>@,;:\\"/\[\]?={}]/.test(name) || typeof cookieValue !== 'string' || /[\x00-\x1f\x7f;]/.test(cookieValue) || Buffer.byteLength(name + cookieValue) > 4096) return invalid()
  let url: URL | undefined
  if (row.url !== undefined) { try { url = new URL(String(row.url)) } catch { return invalid() }; if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return invalid() }
  const domain = row.domain ?? url?.hostname
  if (typeof domain !== 'string' || domain.length > 253 || /[\s/\\:@?#\x00-\x1f\x7f]/.test(domain)) return invalid()
  const rawHost = domain.replace(/^\./, '')
  let host: string
  try { host = new URL(`https://${rawHost}/`).hostname } catch { return invalid() }
  if (!host || host.endsWith('.') || host.startsWith('.') || host.includes('..') || url && url.hostname !== host) return invalid()
  const hostOnly = boolean(row.hostOnly, !domain.startsWith('.'))
  const secure = boolean(row.secure, url?.protocol === 'https:'), httpOnly = boolean(row.httpOnly, false)
  const path = row.path ?? '/'
  if (typeof path !== 'string' || !path.startsWith('/') || /[\x00-\x20\x7f;?#]/.test(path) || path.length > 2048) return invalid()
  const sameSiteValue = row.sameSite === undefined ? 'unspecified' : typeof row.sameSite === 'string' ? row.sameSite.toLowerCase() : invalid()
  const sameSites: Record<string, Cookie['sameSite']> = { unspecified: 'unspecified', none: 'no_restriction', no_restriction: 'no_restriction', lax: 'lax', strict: 'strict' }
  const sameSite = sameSites[sameSiteValue]
  if (!Object.hasOwn(sameSites, sameSiteValue) || !sameSite || sameSite === 'no_restriction' && !secure) return invalid()
  const expiry = row.expirationDate ?? row.expires ?? row.expiry
  if (expiry !== undefined && (typeof expiry !== 'number' || !Number.isFinite(expiry))) return invalid()
  const isSession = boolean(row.session, expiry === undefined || expiry === 0 || expiry === -1)
  if (!isSession && (typeof expiry !== 'number' || expiry <= now / 1000)) throw new InvalidCookie('expired')
  if (name.startsWith('__Secure-') && !secure || name.startsWith('__Host-') && (!secure || !hostOnly || path !== '/')) return invalid()
  const details: CookiesSetDetails = { url: `${secure ? 'https' : 'http'}://${host}${path}`, name, value: cookieValue, path, secure, httpOnly, sameSite, ...(!hostOnly ? { domain: `.${host}` } : {}), ...(!isSession ? { expirationDate: expiry as number } : {}) }
  return { host, hostOnly, details }
}
function parse(text: string, now: number): Parsed {
  if (Buffer.byteLength(text) > COOKIE_IMPORT_MAX_BYTES) throw new Error('Cookie 文件不能超过 2 MiB')
  const content = text.replace(/^\uFEFF/, '')
  let rows: unknown[]
  if (content.trimStart().startsWith('[') || content.trimStart().startsWith('{')) {
    let json: unknown
    try { json = JSON.parse(content) } catch { throw new Error('Cookie JSON 格式无效') }
    rows = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray((json as { cookies?: unknown }).cookies) ? (json as { cookies: unknown[] }).cookies : []
    if (!Array.isArray(json) && !(json && typeof json === 'object' && Array.isArray((json as { cookies?: unknown }).cookies))) throw new Error('JSON 须为 Cookie 数组或包含 cookies 数组')
  } else {
    rows = content.split(/\r?\n/).filter(line => line.trim() && (!line.startsWith('#') || line.startsWith('#HttpOnly_'))).map(line => {
      const httpOnly = line.startsWith('#HttpOnly_'), columns = (httpOnly ? line.slice(10) : line).split('\t')
      if (columns.length !== 7 || !['TRUE', 'FALSE'].includes(columns[1]!) || !['TRUE', 'FALSE'].includes(columns[3]!) || !/^\d+$/.test(columns[4]!)) return null
      return { domain: columns[0], hostOnly: columns[1] === 'FALSE', path: columns[2], secure: columns[3] === 'TRUE', expirationDate: Number(columns[4]), name: columns[5], value: columns[6], httpOnly }
    })
  }
  if (rows.length > MAX_COOKIES) throw new Error('单次最多导入 5000 条 Cookie')
  const counts = new Map<keyof typeof REASONS, number>(), cookies = new Map<string, PreparedCookie>()
  const skip = (reason: keyof typeof REASONS) => counts.set(reason, (counts.get(reason) ?? 0) + 1)
  for (const row of rows) {
    try {
      const entry = normalize(row, now), key = JSON.stringify([entry.hostOnly ? entry.host : `.${entry.host}`, entry.details.path, entry.details.name])
      if (cookies.has(key)) skip('duplicate')
      cookies.set(key, entry)
    } catch (error) { skip(error instanceof InvalidCookie ? error.reason : 'invalid') }
  }
  return { cookies: [...cookies.values()], total: rows.length, skipped: [...counts].map(([reason, count]) => ({ reason: REASONS[reason], count })) }
}
async function readBounded(path: string): Promise<string> {
  const file = await open(path, 'r').catch(() => { throw new Error('Cookie 文件无法读取') })
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > COOKIE_IMPORT_MAX_BYTES) throw new Error('请选择不超过 2 MiB 的普通 Cookie 文件')
    const buffer = Buffer.alloc(COOKIE_IMPORT_MAX_BYTES + 1)
    let offset = 0
    while (offset < buffer.length) { const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null); if (!bytesRead) break; offset += bytesRead }
    if (offset > COOKIE_IMPORT_MAX_BYTES) throw new Error('Cookie 文件不能超过 2 MiB')
    return buffer.subarray(0, offset).toString('utf8')
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Cookie') || error.message.startsWith('请选择'))) throw error
    throw new Error('Cookie 文件无法读取')
  } finally { await file.close().catch(() => {}) }
}
function verify(actual: Cookie | undefined, expected: PreparedCookie, now: number): 'exact' | 'adjusted' | 'mismatch' {
  const d = expected.details
  if (!actual || actual.value !== d.value || actual.hostOnly !== expected.hostOnly || actual.secure !== d.secure || actual.httpOnly !== d.httpOnly || actual.sameSite !== d.sameSite || actual.session !== (d.expirationDate === undefined)) return 'mismatch'
  if (d.expirationDate === undefined) return actual.expirationDate === undefined ? 'exact' : 'mismatch'
  if (typeof actual.expirationDate !== 'number') return 'mismatch'
  if (Math.abs(actual.expirationDate - d.expirationDate) <= 2) return 'exact'
  const maxExpiry = now / 1000 + 400 * 24 * 60 * 60
  return d.expirationDate > maxExpiry && Math.abs(actual.expirationDate - maxExpiry) <= 60 ? 'adjusted' : 'mismatch'
}
/** Pending values never leave Main, are bounded, expire and are consumed before the first mutation. */
export class CookieImports {
  private pending = new Map<string, Pending>()
  constructor(private readonly now: () => number = Date.now) {}
  private remove(id: string): Pending | undefined {
    const value = this.pending.get(id)
    if (value) clearTimeout(value.timer)
    this.pending.delete(id)
    return value
  }
  async prepareFile(path: string, binding: CookieImportBinding): Promise<BrowserCookieImportPreview> {
    const text = await readBounded(path)
    return this.prepare(text, basename(path).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160), binding)
  }
  prepare(text: string, source: string, binding: CookieImportBinding): BrowserCookieImportPreview {
    for (const [id, pending] of this.pending) if (pending.expiresAt <= this.now() || pending.binding.instanceId === binding.instanceId) this.remove(id)
    if (this.pending.size >= 4) throw new Error('请先结束已有的 Cookie 导入')
    const parsed = parse(text, this.now()), id = randomUUID(), expiresAt = this.now() + PENDING_TTL
    const sites = [...new Set(parsed.cookies.map(cookie => cookie.host))].sort()
    const timer = setTimeout(() => { this.remove(id) }, PENDING_TTL)
    timer.unref()
    this.pending.set(id, { binding: { ...binding }, expiresAt, parsed, timer })
    return { id, source, total: parsed.total, ready: parsed.cookies.length, sites: sites.slice(0, 30), siteCount: sites.length, skipped: parsed.skipped, expiresAt }
  }
  cancel(instanceId: string): void { for (const [id, pending] of this.pending) if (pending.binding.instanceId === instanceId) this.remove(id) }
  async apply(id: string, binding: CookieImportBinding, port: CookieImportPort, assertCurrent: () => void): Promise<BrowserCookieImportResult> {
    const pending = this.remove(id)
    if (!pending || pending.expiresAt <= this.now() || pending.binding.instanceId !== binding.instanceId || pending.binding.partition !== binding.partition) throw new Error('Cookie 导入预览已失效，请重新选择来源')
    assertCurrent()
    const result: BrowserCookieImportResult = { status: 'completed', verified: 0, written: 0, adjusted: 0, failed: 0, mismatched: 0, notAttempted: 0, skipped: pending.parsed.total - pending.parsed.cookies.length, flushed: false }
    try {
      for (let index = 0; index < pending.parsed.cookies.length; index++) {
        try { assertCurrent() } catch { result.notAttempted = pending.parsed.cookies.length - index; break }
        const cookie = pending.parsed.cookies[index]!
        if (cookie.details.expirationDate !== undefined && cookie.details.expirationDate <= this.now() / 1000) { result.skipped += 1; continue }
        try {
          await port.set(cookie.details); result.written += 1
          const matches = await port.get({ name: cookie.details.name, domain: cookie.host, path: cookie.details.path })
          const expectedDomain = cookie.hostOnly ? cookie.host : `.${cookie.host}`
          const actual = matches.find(item => item.name === cookie.details.name && item.domain === expectedDomain && item.path === cookie.details.path && item.hostOnly === cookie.hostOnly)
          const comparison = verify(actual, cookie, this.now())
          if (comparison === 'mismatch') result.mismatched += 1
          else { result.verified += 1; if (comparison === 'adjusted') result.adjusted += 1 }
        } catch { result.failed += 1 }
      }
    } finally {
      try { await port.flushStore(); result.flushed = true } catch { /* Explicit result; never leak provider errors containing values. */ }
      pending.parsed.cookies.length = 0
    }
    return result
  }
}
