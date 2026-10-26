/*
 * [INPUT]: Cookie导入核心、受控Electron Cookie端口及临时文件。
 * [OUTPUT]: Netscape/JSON属性、CDP不透明分区跳过、无值预览、过期/撤销/重复消费、部分失败与读回不一致回归。
 * [POS]: Cookie文件导入机制验证；不替代真实Electron登录和站点验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Cookie, CookiesSetDetails } from 'electron'
import { CookieImports, COOKIE_IMPORT_MAX_BYTES, type CookieImportPort } from '../apps/electron/src/main/browser/cookie-import'

const binding = { instanceId: 'browser-1', partition: 'persist:application-fixture' }
const now = 1_800_000_000_000
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
function jar() {
  const items: Cookie[] = []
  const set = vi.fn(async (details: CookiesSetDetails) => {
    items.push({ name: details.name!, value: details.value!, domain: details.domain ?? new URL(details.url).hostname, hostOnly: !details.domain, path: details.path, httpOnly: details.httpOnly, secure: details.secure, sameSite: details.sameSite!, session: details.expirationDate === undefined, ...(details.expirationDate !== undefined ? { expirationDate: details.expirationDate } : {}) })
  })
  const get = vi.fn(async () => items), flushStore = vi.fn(async () => {})
  return { items, set, get, flushStore, port: { set, get, flushStore } as CookieImportPort }
}
const row = (extra: Record<string, unknown> = {}) => ({ name: 'session', value: 'secret-never-render', domain: 'example.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', ...extra })

describe('Cookie文件导入', () => {
  it('Netscape保留HttpOnly/domain/hostOnly/session和有期限Cookie，并仅预览站点计数', async () => {
    const imports = new CookieImports(() => now), port = jar()
    const preview = imports.prepare('# Netscape HTTP Cookie File\n#HttpOnly_.example.com\tTRUE\t/account\tTRUE\t1800000600\tsession\tsecret-never-render\nexample.net\tFALSE\t/\tFALSE\t0\tpref\tlight\n', 'cookies.txt', binding)
    expect(preview).toMatchObject({ total: 2, ready: 2, sites: ['example.com', 'example.net'], skipped: [] })
    expect(JSON.stringify(preview)).not.toContain('secret-never-render')
    const result = await imports.apply(preview.id, binding, port.port, () => {})
    expect(result).toMatchObject({ verified: 2, written: 2, failed: 0, flushed: true })
    expect(port.set.mock.calls[0]![0]).toMatchObject({ domain: '.example.com', path: '/account', httpOnly: true, secure: true, expirationDate: 1_800_000_600 })
    expect(port.set.mock.calls[1]![0]).not.toHaveProperty('domain')
    expect(port.set.mock.calls[1]![0]).not.toHaveProperty('expirationDate')
  })
  it('Netscape最后一条空值或尾随空格完整保留，确认期间过期项不会删除已有Cookie', async () => {
    let clock = now;const imports = new CookieImports(() => clock), port = jar()
    const preview = imports.prepare('example.com\tFALSE\t/\tTRUE\t0\tempty\t\nexample.com\tFALSE\t/\tTRUE\t0\tspace\tvalue ', 'cookies.txt', binding)
    expect(preview.ready).toBe(2)
    await imports.apply(preview.id, binding, port.port, () => {})
    expect(port.set.mock.calls.map(call => call[0].value)).toEqual(['', 'value '])
    const expires = imports.prepare(JSON.stringify([row({ expirationDate: now / 1000 + 30 })]), 'export.json', binding)
    clock += 60_000
    expect(await imports.apply(expires.id, binding, port.port, () => {})).toMatchObject({ written: 0, skipped: 1 })
    expect(port.set).toHaveBeenCalledTimes(2)
  })
  it('JSON规范化SameSite，过期/分区/无效项明确跳过，重复身份保留最后一条', async () => {
    const imports = new CookieImports(() => now), port = jar()
    const preview = imports.prepare(JSON.stringify({ cookies: [row(), row({ value: 'latest-value', sameSite: 'None' }), row({ name: 'expired', expirationDate: 10 }), row({ partitionKey: { topLevelSite: 'https://other.test' } }), row({ partitionKeyOpaque: true }), row({ name: 'unsafe', secure: false, sameSite: 'None' }), row({ name: 'container', firstPartyDomain: 'example.org' })] }), 'export.json', binding)
    expect(preview.ready).toBe(1); expect(preview.skipped.reduce((sum, item) => sum + item.count, 0)).toBe(6)
    const result = await imports.apply(preview.id, binding, port.port, () => {})
    expect(result.verified).toBe(1);expect(port.set.mock.calls[0]![0]).toMatchObject({ value: 'latest-value', sameSite: 'no_restriction' })
  })
  it('不会把明确hostOnly记录变成域Cookie，session=true不会被持久化', async () => {
    const imports = new CookieImports(() => now), port = jar()
    const preview = imports.prepare(JSON.stringify([row({ domain: '.example.com', hostOnly: true, session: true, expirationDate: now / 1000 + 500 })]), 'export.json', binding)
    await imports.apply(preview.id, binding, port.port, () => {})
    expect(port.set.mock.calls[0]![0]).not.toHaveProperty('domain');expect(port.set.mock.calls[0]![0]).not.toHaveProperty('expirationDate')
  })
  it('错误JSON不把输入片段泄漏到报错，数量/字节上限提前拒绝', () => {
    const imports = new CookieImports(() => now)
    expect(() => imports.prepare('{"secret-never-render":', 'x.json', binding)).toThrow('Cookie JSON 格式无效')
    expect(() => imports.prepare('x'.repeat(COOKIE_IMPORT_MAX_BYTES + 1), 'x.txt', binding)).toThrow('2 MiB')
    expect(() => imports.prepare(JSON.stringify(Array(5001).fill({})), 'x.json', binding)).toThrow('5000')
  })
  it('文件按打开句柄检查大小与实际读取上限，原件不修改', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boai-cookie-'));roots.push(root)
    const path = join(root, 'cookies.json'), imports = new CookieImports(() => now)
    await writeFile(path, JSON.stringify([row()]))
    expect((await imports.prepareFile(path, binding)).source).toBe('cookies.json')
    await writeFile(path, ' '.repeat(COOKIE_IMPORT_MAX_BYTES + 1))
    await expect(imports.prepareFile(path, binding)).rejects.toThrow('2 MiB')
  })
  it('候选绑定窗口和partition，撤销/超时/重复消费均不能再次写入', async () => {
    let clock = now; const imports = new CookieImports(() => clock), port = jar()
    let preview = imports.prepare(JSON.stringify([row()]), 'x.json', binding)
    await expect(imports.apply(preview.id, { ...binding, partition: 'wrong-partition' }, port.port, () => {})).rejects.toThrow('失效')
    preview = imports.prepare(JSON.stringify([row()]), 'x.json', binding);imports.cancel(binding.instanceId)
    await expect(imports.apply(preview.id, binding, port.port, () => {})).rejects.toThrow('失效')
    preview = imports.prepare(JSON.stringify([row()]), 'x.json', binding);clock += 5 * 60_000 + 1
    await expect(imports.apply(preview.id, binding, port.port, () => {})).rejects.toThrow('失效')
    preview = imports.prepare(JSON.stringify([row()]), 'x.json', binding)
    await imports.apply(preview.id, binding, port.port, () => {})
    await expect(imports.apply(preview.id, binding, port.port, () => {})).rejects.toThrow('失效')
    expect(port.set).toHaveBeenCalledTimes(1)
  })
  it('中途失效停止剩余写入，报告已完成部分并落盘，不重放输入', async () => {
    const imports = new CookieImports(() => now), port = jar();let current = true
    const original = port.set.getMockImplementation()!
    port.set.mockImplementation(async details => { await original(details);current = false })
    const preview = imports.prepare(JSON.stringify([row(), row({ name: 'next' })]), 'x.json', binding)
    const report = await imports.apply(preview.id, binding, port.port, () => { if (!current) throw new Error('closed') })
    expect(report).toMatchObject({ written: 1, verified: 1, notAttempted: 1, flushed: true })
    expect(port.set).toHaveBeenCalledTimes(1)
  })
  it('同名不同domain/path及值不匹配不能冒充读回成功，异常不暴露凭据', async () => {
    const imports = new CookieImports(() => now), port = jar()
    port.get.mockResolvedValue([{ ...row(), domain: 'other.test', path: '/', sameSite: 'lax', hostOnly: true, session: true } as Cookie])
    const preview = imports.prepare(JSON.stringify([row()]), 'x.json', binding)
    const report = await imports.apply(preview.id, binding, port.port, () => {})
    expect(report).toMatchObject({ written: 1, verified: 0, mismatched: 1 })
    expect(JSON.stringify(report)).not.toContain('secret-never-render')
    port.set.mockRejectedValue(new Error('secret-never-render'));port.flushStore.mockRejectedValue(new Error('secret-never-render'))
    const next = imports.prepare(JSON.stringify([row()]), 'x.json', binding)
    expect(await imports.apply(next.id, binding, port.port, () => {})).toMatchObject({ verified: 0, failed: 1, flushed: false })
  })
  it('只接受Chromium已知400天寿命裁剪并明确统计，不接受任意有效期变化', async () => {
    const imports = new CookieImports(() => now), port = jar(), original = port.set.getMockImplementation()!
    port.set.mockImplementation(async details => { await original(details);port.items.at(-1)!.expirationDate = now / 1000 + 400 * 86400 })
    const preview = imports.prepare(JSON.stringify([row({ expirationDate: now / 1000 + 1000 * 86400 })]), 'x.json', binding)
    expect(await imports.apply(preview.id, binding, port.port, () => {})).toMatchObject({ verified: 1, adjusted: 1 })
  })
})
