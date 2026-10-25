/*
 * [INPUT]: 本机标准浏览器安装/profile元数据、本人选择的opaque来源与取消信号。
 * [OUTPUT]: 仅元数据列表；私有副本中读取所选profile，限时/限量/单并发，退出清理不关闭用户浏览器。
 * [POS]: Main-only Cookie来源。参考DeepSeek-Bot 1bebe826 browser-sources.mjs，Apache-2.0，见NOTICE.txt。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Readable, Writable } from 'node:stream'
import type { BrowserCookieSource, BrowserCookieSourceList } from '../../shared/ipc/browser'
import { COOKIE_IMPORT_MAX_BYTES } from './cookie-import'

type Kind = BrowserCookieSource['kind']
export interface CookieBrowserInstallation { kind: Kind; root: string; executable?: string }
interface Source extends BrowserCookieSource { root: string; profilePath: string; profileDirectory: string; database: string; executable?: string; identity: string }
export interface CookieSourcePayload { source: string; text: string }
export interface CookieSourceProvider { list(refresh?: boolean): Promise<BrowserCookieSourceList>; read(id: string, signal?: AbortSignal): Promise<CookieSourcePayload> }
interface Options { installations?: () => Promise<CookieBrowserInstallation[]>; temporaryDirectory?: string; timeoutMs?: number }
const names: Record<Kind, string> = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave', chromium: 'Chromium', firefox: 'Firefox' }
const MAX_DB_BYTES = 128 * 1024 * 1024, MAX_METADATA_BYTES = 8 * 1024 * 1024, MAX_SOURCES = 128
const safeLabel = (value: unknown, fallback: string) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 100) || fallback : fallback
const cancelled = () => new Error('Cookie 导入已取消')
function check(signal?: AbortSignal): void { if (signal?.aborted) throw cancelled() }
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException)?.code
function sourceError(error: unknown): Error {
  const code = errorCode(error)
  if (code === 'EBUSY' || code === 'EACCES' || code === 'EPERM') return new Error('无法读取浏览器资料：请检查系统权限，或关闭所选浏览器后重试；也可从文件导入')
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP') return new Error('浏览器来源已变化或不存在，请刷新来源列表')
  return error instanceof SafeSourceError ? error : new Error('无法读取所选浏览器 Cookie；请在源浏览器检查资料或改用文件导入')
}
class SafeSourceError extends Error {}
async function readSmall(path: string, maximum = MAX_METADATA_BYTES): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximum) throw new SafeSourceError('浏览器资料文件过大或无效')
    const bytes = Buffer.alloc(maximum + 1)
    let length = 0
    while (length < bytes.length) { const read = await handle.read(bytes, length, bytes.length - length, null); if (!read.bytesRead) break; length += read.bytesRead }
    if (length > maximum) throw new SafeSourceError('浏览器资料文件过大或无效')
    return bytes.subarray(0, length).toString('utf8')
  } finally { await handle.close() }
}
async function fileExists(path: string): Promise<boolean> { try { return (await lstat(path)).isFile() } catch (error) { if (errorCode(error) === 'ENOENT') return false; throw error } }
async function directoryIdentity(path: string): Promise<string> { const info = await stat(path); return `${info.dev}:${info.ino}` }
async function identity(source: Pick<Source, 'root' | 'profilePath' | 'database' | 'executable'>): Promise<string> {
  const paths = [source.root, source.profilePath, source.database, ...(source.executable ? [source.executable] : [])]
  const values = []
  for (const path of paths) { if (await realpath(path) !== path) throw new SafeSourceError('浏览器来源已变化，请刷新来源列表'); values.push(await directoryIdentity(path)) }
  return JSON.stringify(values)
}

/** No browser is started for discovery; only installed executable paths and profile names are read. */
export async function cookieBrowserInstallations(): Promise<CookieBrowserInstallation[]> {
  const home = homedir(), platform = process.platform, result: CookieBrowserInstallation[] = []
  const appSupport = join(home, 'Library', 'Application Support'), local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), config = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  const specs: Array<{ kind: Kind; mac: [string, string]; win: [string, string]; linux: [string[], string[]] }> = [
    { kind: 'chrome', mac: ['Google/Chrome', 'Google Chrome.app/Contents/MacOS/Google Chrome'], win: ['Google/Chrome/User Data', 'Google/Chrome/Application/chrome.exe'], linux: [['google-chrome'], ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome']] },
    { kind: 'edge', mac: ['Microsoft Edge', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], win: ['Microsoft/Edge/User Data', 'Microsoft/Edge/Application/msedge.exe'], linux: [['microsoft-edge'], ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge']] },
    { kind: 'brave', mac: ['BraveSoftware/Brave-Browser', 'Brave Browser.app/Contents/MacOS/Brave Browser'], win: ['BraveSoftware/Brave-Browser/User Data', 'BraveSoftware/Brave-Browser/Application/brave.exe'], linux: [['BraveSoftware/Brave-Browser'], ['/usr/bin/brave-browser', '/usr/bin/brave', '/opt/brave.com/brave/brave']] },
    { kind: 'chromium', mac: ['Chromium', 'Chromium.app/Contents/MacOS/Chromium'], win: ['Chromium/User Data', 'Chromium/Application/chrome.exe'], linux: [['chromium'], ['/usr/bin/chromium', '/usr/bin/chromium-browser']] },
    { kind: 'firefox', mac: ['Firefox', 'Firefox.app/Contents/MacOS/firefox'], win: ['Mozilla/Firefox', 'Mozilla Firefox/firefox.exe'], linux: [[], ['/usr/bin/firefox']] },
  ]
  for (const spec of specs) {
    const roots = platform === 'darwin' ? [join(appSupport, spec.mac[0])] : platform === 'win32' ? [join(spec.kind === 'firefox' ? roaming : local, spec.win[0])] : spec.kind === 'firefox' ? [join(home, '.mozilla', 'firefox'), join(home, 'snap/firefox/common/.mozilla/firefox')] : spec.linux[0].map(path => join(config, path))
    const binaries = platform === 'darwin' ? ['/Applications', join(home, 'Applications')].map(root => join(root, spec.mac[1])) : platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], local].filter((root): root is string => !!root).map(root => join(root, spec.win[1])) : spec.linux[1]
    let executable: string | undefined
    for (const binary of binaries) { try { const candidate = await realpath(binary); if (await fileExists(candidate)) { executable = candidate; break } } catch { /* Optional installation. */ } }
    if (executable || spec.kind === 'firefox') for (const root of roots) result.push({ kind: spec.kind, root, executable })
  }
  // Separate roots must use their own installed channel, never the stable binary by accident.
  if (platform === 'linux') for (const [kind, directory, binary] of [['chrome', 'google-chrome-beta', '/usr/bin/google-chrome-beta'], ['edge', 'microsoft-edge-beta', '/usr/bin/microsoft-edge-beta']] as const) {
    try { result.push({ kind, root: join(config, directory), executable: await realpath(binary) }) } catch { /* Optional channel. */ }
  }
  return result
}

async function scan(install: CookieBrowserInstallation): Promise<Omit<Source, 'id' | 'identity'>[]> {
  const root = await realpath(install.root), executable = install.executable ? await realpath(install.executable) : undefined
  if (install.kind !== 'firefox' && !executable) return []
  const profiles: Array<{ path: string; name: string }> = []
  if (install.kind === 'firefox') {
    const ini = await readSmall(join(root, 'profiles.ini'), 256 * 1024)
    let section: Record<string, string> | undefined
    const sections: Record<string, string>[] = []
    for (const line of ini.split(/\r?\n/)) {
      const match = line.trim().match(/^\[(.+)\]$/)
      if (match) { section = /^Profile\d+$/i.test(match[1]!) ? {} : undefined; if (section) sections.push(section); continue }
      const pair = line.match(/^([^=]+)=(.*)$/)
      if (section && pair) section[pair[1]!.trim()] = pair[2]!.trim()
    }
    for (const entry of sections.slice(0, MAX_SOURCES)) if (entry.Path) {
      const path = entry.IsRelative === '0' ? entry.Path : resolve(root, entry.Path)
      if (!isAbsolute(path) || entry.IsRelative !== '0' && (relative(root, path).startsWith('..') || isAbsolute(relative(root, path)))) continue
      profiles.push({ path, name: safeLabel(entry.Name, basename(path)) })
    }
  } else {
    let cache: Record<string, { name?: unknown; gaia_name?: unknown }> = {}
    try { cache = JSON.parse(await readSmall(join(root, 'Local State')))?.profile?.info_cache ?? {} } catch (error) { if (errorCode(error) !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
    const dirs = await readdir(root, { withFileTypes: true })
    for (const dir of dirs.filter(value => value.isDirectory() && !['System Profile', 'Guest Profile'].includes(value.name)).sort((a, b) => a.name === 'Default' ? -1 : b.name === 'Default' ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, MAX_SOURCES)) profiles.push({ path: join(root, dir.name), name: safeLabel(cache[dir.name]?.name ?? cache[dir.name]?.gaia_name, dir.name) })
  }
  const sources: Omit<Source, 'id' | 'identity'>[] = []
  for (const profile of profiles) {
    try {
      const profilePath = await realpath(profile.path)
      if (install.kind !== 'firefox' && dirname(profilePath) !== root) continue
      const databases = install.kind === 'firefox' ? [join(profilePath, 'cookies.sqlite')] : [join(profilePath, 'Network', 'Cookies'), join(profilePath, 'Cookies')]
      for (const database of databases) if (await fileExists(database)) {
        if (await realpath(database) !== database) continue
        sources.push({ kind: install.kind, label: `${names[install.kind]} — ${profile.name}`, profileName: profile.name, root, profilePath, profileDirectory: basename(profilePath), executable, database }); break
      }
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '')) throw error }
  }
  return sources
}

/** Snapshot DB and sidecars without ever opening the original for writes. Reject a moving snapshot. */
async function copySnapshot(source: Source, destination: string, signal: AbortSignal): Promise<void> {
  // macOS Chromium still commonly uses <profile>/Cookies. Keep the source layout;
  // moving that DB into Network/Cookies makes the native browser read an empty store.
  const destinationDb = source.kind === 'firefox' ? join(destination, 'cookies.sqlite') : join(destination, source.profileDirectory, relative(source.profilePath, source.database))
  const jobs = [
    ...['', '-wal', '-shm', '-journal'].map(suffix => ({ from: source.database + suffix, to: destinationDb + suffix, required: suffix === '', stable: suffix !== '-shm' })),
    ...(source.kind !== 'firefox' ? [{ from: join(source.root, 'Local State'), to: join(destination, 'Local State'), required: true, stable: true }] : []),
  ]
  for (let attempt = 0; attempt < 3; attempt++) {
    check(signal)
    const before = new Map<string, string>()
    for (const job of jobs) {
      check(signal)
      await mkdir(dirname(job.to), { recursive: true, mode: 0o700 })
      let input
      try { input = await open(job.from, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)) } catch (error) { if (!job.required && errorCode(error) === 'ENOENT') { await rm(job.to, { force: true }); before.set(job.from, 'absent'); continue } throw error }
      try {
        const info = await input.stat()
        if (!info.isFile() || info.size > MAX_DB_BYTES) throw new SafeSourceError('浏览器 Cookie 数据库超过 128 MiB 或无效，请使用文件导入')
        before.set(job.from, `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`)
        const output = await open(job.to, 'w', 0o600)
        try {
          const bytes = Buffer.alloc(256 * 1024); let total = 0
          for (;;) { check(signal); const { bytesRead } = await input.read(bytes, 0, bytes.length, null); if (!bytesRead) break; total += bytesRead; if (total > MAX_DB_BYTES) throw new SafeSourceError('浏览器 Cookie 数据库超过 128 MiB，请使用文件导入'); let written = 0; while (written < bytesRead) written += (await output.write(bytes, written, bytesRead - written, null)).bytesWritten }
        } finally { await output.close() }
      } finally { await input.close() }
    }
    let stable = true
    for (const job of jobs.filter(value => value.stable)) {
      let after = 'absent'
      try { const info = await lstat(job.from); after = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}` } catch (error) { if (errorCode(error) !== 'ENOENT') throw error }
      if (after !== before.get(job.from)) stable = false
    }
    if (stable) return
  }
  throw new SafeSourceError('源浏览器正在更新 Cookie，请稍后重试或关闭该浏览器后再导入')
}

function firefoxCookies(directory: string): unknown[] {
  const db = new DatabaseSync(join(directory, 'cookies.sqlite'), { readOnly: true })
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(moz_cookies)').all().map(row => row.name))
    const sameSite = columns.has('sameSite') ? 'sameSite' : columns.has('rawSameSite') ? 'rawSameSite' : '256'
    const rawSameSite = columns.has('rawSameSite') ? 'rawSameSite' : 'NULL'
    const partitioned = columns.has('isPartitionedAttributeSet') ? 'isPartitionedAttributeSet' : '0'
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
    const rows = db.prepare(`SELECT host, name, value, path, isHttpOnly, isSecure, expiry, ${sameSite} AS sameSite, ${rawSameSite} AS rawSameSite, ${partitioned} AS partitioned, originAttributes FROM moz_cookies LIMIT 5001`).all()
    return rows.map(row => ({ domain: row.host, name: row.name, value: row.value, path: row.path, secure: !!row.isSecure, httpOnly: !!row.isHttpOnly, expires: Number(row.expiry) / (version >= 16 ? 1000 : 1), sameSite: ({ 0: 'none', 1: 'lax', 2: 'strict', 256: 'unspecified' } as Record<number, string>)[row.sameSite === 1 && row.rawSameSite === 0 ? 256 : Number(row.sameSite)] ?? 'unspecified', ...(row.originAttributes || row.partitioned ? { partitioned: true } : {}) }))
  } finally { db.close() }
}

/** Pipe CDP is private to a disposable source-profile copy; no debug port, shell, URL or raw error escapes. */
export async function chromiumCookieSnapshot(executable: string, directory: string, profileDirectory: string, signal: AbortSignal): Promise<unknown[]> {
  check(signal)
  const child = spawn(executable, ['--headless', '--remote-debugging-pipe', `--user-data-dir=${directory}`, `--profile-directory=${profileDirectory}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-breakpad', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true })
  const writer = child.stdio[3] as Writable, reader = child.stdio[4] as Readable
  let settled = false, closed = false
  let accept!: (value: unknown[]) => void, reject!: (error: Error) => void
  const result = new Promise<unknown[]>((yes, no) => { accept = yes; reject = no })
  const fail = (error: Error) => { if (!settled) { settled = true; reject(error) } }
  const exited = new Promise<void>(yes => { child.once('close', () => { closed = true; yes() }) })
  const abort = () => { fail(new SafeSourceError(signal.reason === 'timeout' ? '读取浏览器 Cookie 超时，请关闭源浏览器后重试或使用文件导入' : 'Cookie 导入已取消')); child.kill('SIGTERM') }
  signal.addEventListener('abort', abort, { once: true })
  let chunks: Buffer[] = [], length = 0, total = 0
  reader.on('data', (buffer: Buffer) => {
    total += buffer.length
    if (total > COOKIE_IMPORT_MAX_BYTES * 4) { fail(new SafeSourceError('浏览器 Cookie 返回数据过大，请使用文件导入')); child.kill('SIGTERM'); return }
    let start = 0
    while (start < buffer.length) {
      const end = buffer.indexOf(0, start), part = buffer.subarray(start, end < 0 ? undefined : end)
      chunks.push(part); length += part.length
      if (length > COOKIE_IMPORT_MAX_BYTES * 4) { fail(new SafeSourceError('浏览器 Cookie 返回数据过大，请使用文件导入')); return }
      if (end < 0) break
      const text = Buffer.concat(chunks, length).toString('utf8'); chunks = []; length = 0; start = end + 1
      try {
        const message = JSON.parse(text)
        if (message.id !== 1 || settled) continue
        if (message.error || !Array.isArray(message.result?.cookies)) fail(new SafeSourceError('源浏览器无法解密或读取 Cookie，请检查系统钥匙串权限或改用文件导入'))
        else { settled = true; accept(message.result.cookies) }
      } catch { fail(new SafeSourceError('源浏览器返回了无效 Cookie 数据')) }
    }
  })
  reader.on('error', () => fail(new SafeSourceError('浏览器 Cookie 读取连接已关闭')))
  writer.on('error', () => fail(new SafeSourceError('浏览器 Cookie 读取连接已关闭')))
  child.once('error', () => fail(new SafeSourceError('源浏览器无法启动，请刷新来源列表或使用文件导入')))
  child.once('exit', () => fail(new SafeSourceError('源浏览器未返回 Cookie；请检查权限或使用文件导入')))
  child.once('spawn', () => { if (signal.aborted) abort(); else writer.write(JSON.stringify({ id: 1, method: 'Storage.getCookies' }) + '\0') })
  try { return await result } finally {
    signal.removeEventListener('abort', abort)
    if (!closed && !writer.destroyed) writer.write(JSON.stringify({ id: 2, method: 'Browser.close' }) + '\0')
    await stopChild(child, exited, () => closed)
    reader.removeAllListeners(); writer.removeAllListeners(); reader.on('error', () => {}); writer.on('error', () => {}); reader.destroy(); writer.destroy()
  }
}
async function stopChild(child: ChildProcess, exited: Promise<void>, closed: () => boolean): Promise<void> {
  const wait = async (ms: number) => { let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([exited, new Promise<void>(yes => { timer = setTimeout(yes, ms) })]) } finally { clearTimeout(timer) } }
  if (!closed()) await wait(1500)
  if (!closed()) { child.kill('SIGKILL'); await wait(3000) }
  if (!closed()) throw new SafeSourceError('临时浏览器尚未退出，Cookie 导入未完成')
}

export class BrowserCookieSources implements CookieSourceProvider {
  private sources = new Map<string, Source>()
  private listing?: Promise<BrowserCookieSourceList>
  private listedAt = 0
  private warning?: string
  private busy = false
  constructor(private readonly options: Options = {}) {}
  list(refresh = false): Promise<BrowserCookieSourceList> {
    if (this.listing) return this.listing
    const project = (): BrowserCookieSourceList => ({ sources: [...this.sources.values()].map(({ id, kind, label, profileName }) => ({ id, kind, label, profileName })), ...(this.warning ? { warning: this.warning } : {}) })
    if (!refresh && this.listedAt && Date.now() - this.listedAt < 30_000) return Promise.resolve(project())
    this.listing = (async () => {
      const next = new Map<string, Source>(), seenKeys = new Set<string>(), oldKeys = new Map([...this.sources.values()].map(source => [JSON.stringify([source.kind, source.root, source.profilePath, source.executable, source.identity]), source.id]))
      try {
        let unavailable = 0
        for (const install of await (this.options.installations ?? cookieBrowserInstallations)()) {
          let values
          try { values = await scan(install) } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '')) unavailable++; continue }
          for (const value of values) {
            let fingerprint: string
            try { fingerprint = await identity(value) } catch { unavailable++; continue }
            const key = JSON.stringify([value.kind, value.root, value.profilePath, value.executable, fingerprint])
            if (seenKeys.has(key)) continue
            seenKeys.add(key)
            const id = oldKeys.get(key) ?? randomUUID()
            next.set(id, { ...value, identity: fingerprint, id })
            if (next.size >= MAX_SOURCES) break
          }
          if (next.size >= MAX_SOURCES) break
        }
        this.sources = next; this.warning = unavailable ? `${unavailable} 个浏览器资料来源无法读取，请检查系统权限或资料状态后刷新` : undefined; this.listedAt = Date.now(); return project()
      } catch (error) { throw sourceError(error) }
    })().finally(() => { this.listing = undefined })
    return this.listing
  }
  async read(id: string, externalSignal?: AbortSignal): Promise<CookieSourcePayload> {
    if (this.busy) throw new Error('已有浏览器 Cookie 读取正在处理')
    const source = this.sources.get(id)
    if (!source) throw new Error('浏览器来源已失效，请刷新来源列表')
    this.busy = true
    const controller = new AbortController(), abort = () => controller.abort()
    externalSignal?.addEventListener('abort', abort, { once: true }); if (externalSignal?.aborted) abort()
    const timeout = setTimeout(() => controller.abort('timeout'), this.options.timeoutMs ?? 25_000)
    let work: string | undefined
    try {
      check(controller.signal)
      if (await identity(source) !== source.identity) throw new SafeSourceError('浏览器来源已变化，请刷新来源列表')
      work = await mkdtemp(join(this.options.temporaryDirectory ?? tmpdir(), 'boai-cookie-source-')); await chmod(work, 0o700)
      await copySnapshot(source, work, controller.signal)
      check(controller.signal)
      if (await identity(source) !== source.identity) throw new SafeSourceError('浏览器来源已变化，请刷新来源列表')
      const cookies = source.kind === 'firefox' ? firefoxCookies(work) : await chromiumCookieSnapshot(source.executable!, work, source.profileDirectory, controller.signal)
      check(controller.signal)
      if (!cookies.length) throw new SafeSourceError('所选资料未读到 Cookie；可能尚未登录、已过期或未授予解密权限，可改用文件导入')
      if (cookies.length > 5000) throw new SafeSourceError('单次最多导入 5000 条 Cookie，请使用文件导入缩小范围')
      const text = JSON.stringify(cookies)
      if (Buffer.byteLength(text) > COOKIE_IMPORT_MAX_BYTES) throw new SafeSourceError('Cookie 内容超过 2 MiB，请使用文件导入缩小范围')
      return { source: source.label, text }
    } catch (error) {
      if (controller.signal.aborted) throw new Error(controller.signal.reason === 'timeout' ? '读取浏览器 Cookie 超时，请稍后重试或使用文件导入' : 'Cookie 导入已取消')
      throw sourceError(error)
    } finally {
      clearTimeout(timeout); externalSignal?.removeEventListener('abort', abort)
      try { if (work) await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { throw new Error('临时 Cookie 资料清理失败，请重启 BOAI 后重试') } finally { this.busy = false }
    }
  }
}
