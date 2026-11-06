/*
 * [OUTPUT]: 2026-11-06覆盖浏览器模式优先级、保存兼容、会话保留或配置重启；本批实际结果归19组19第5节。
 * [INPUT]: Production browser adapter and controlled upstream browser/CLI failures.
 * [OUTPUT]: Failed shutdown remains retryable, concurrent closes coalesce and completed cleanup stages do not repeat.
 * [POS]: Browser plugin lifecycle regression; no real browser or external commands.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBrowserPluginSession, type BrowserPluginSession } from '../packages/browser-plugins/src/host'

const browser = vi.hoisted(() => ({ close: vi.fn(), launch: vi.fn(), execute: vi.fn(async () => ({ result: 'page retained' })), getTools: () => ({ browser_snapshot: { inputSchema: z.object({}), execute: browser.execute } }), setCurrentThread: vi.fn(), ensureReady: vi.fn(async () => {}), getCdpUrl: () => 'http://127.0.0.1:9222' }))
vi.mock('@mastra/agent-browser', () => ({ AgentBrowser: class { constructor(options: unknown) { browser.launch(options); return browser } } }))
vi.mock('@mastra/browser-viewer', () => ({ BrowserViewer: class { constructor(options: unknown) { browser.launch(options); return browser } } }))
const sessions: BrowserPluginSession[] = []
beforeEach(() => { browser.close.mockReset().mockResolvedValue(undefined) })
afterEach(async () => { for (const session of sessions.splice(0)) await session.close(); vi.clearAllMocks() })

it.each(['agent-browser', 'browser-viewer'] as const)('%s retries failed browser shutdown and rejects new calls', async provider => {
  const session = await createBrowserPluginSession(provider, { headless: true, executablePath: '' }, 'review-run', vi.fn()); sessions.push(session)
  browser.close.mockRejectedValueOnce(new Error('browser still alive'))
  const closing = session.close()
  expect(session.close()).toBe(closing)
  await expect(closing).rejects.toThrow('browser still alive')
  await expect(session.call('anything', {}, 'call')).rejects.toThrow('关闭')
  await session.close()
  expect(browser.close).toHaveBeenCalledTimes(2)
  await session.close()
  expect(browser.close).toHaveBeenCalledTimes(2)
})

it('retries the failed CLI cleanup without closing the successful browser twice', async () => {
  let attempts = 0
  const execute = vi.fn(async (_command: string, cleanup?: boolean) => ({ exitCode: cleanup && ++attempts === 1 ? 1 : 0 }))
  const session = await createBrowserPluginSession('browser-viewer', { headless: true, executablePath: '' }, 'cli-run', execute); sessions.push(session)
  await session.call('execute', { args: ['snapshot'] }, 'call')
  await expect(session.close()).rejects.toThrow('CLI 清理失败')
  await session.close()
  expect(browser.close).toHaveBeenCalledTimes(1)
  expect(attempts).toBe(2)
  await session.close()
  expect(attempts).toBe(2)
})


it.each(['agent-browser', 'browser-viewer'] as const)('%s resolves explicit mode before launch, retains it and preserves live page state', async provider => {
  for (const configuredHeadless of [true, false]) {
    const session = await createBrowserPluginSession(provider, { headless: configuredHeadless, executablePath: '' }, `mode-${provider}-${configuredHeadless}`, vi.fn(async () => ({ exitCode: 0 })))
    sessions.push(session)
    session.inspect()
    const tool = provider === 'agent-browser' ? 'browser_snapshot' : 'execute'
    const args = provider === 'agent-browser' ? {} : { args: ['snapshot'] }
    await session.call(tool, args, 'first', configuredHeadless)
    expect(browser.launch).toHaveBeenLastCalledWith(expect.objectContaining({ headless: !configuredHeadless }))
    const constructors = browser.launch.mock.calls.length, closes = browser.close.mock.calls.length
    await session.call(tool, args, 'next')
    await expect(session.call(tool, args, 'wrong-mode', !configuredHeadless)).rejects.toThrow('当前页面已保留')
    expect(browser.launch).toHaveBeenCalledTimes(constructors)
    expect(browser.close).toHaveBeenCalledTimes(closes)
    await session.close()
  }
})

it.each([true, false])('keeps saved headless=%s when the run does not specify a mode', async headless => {
  const session = await createBrowserPluginSession('agent-browser', { headless, executablePath: '' }, `saved-${headless}`, vi.fn()); sessions.push(session)
  await session.call('browser_snapshot', {}, 'first')
  expect(browser.launch).toHaveBeenLastCalledWith(expect.objectContaining({ headless }))
})
