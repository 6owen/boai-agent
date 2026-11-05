/*
 * [INPUT]: Production browser adapter and controlled upstream browser/CLI failures.
 * [OUTPUT]: Failed shutdown remains retryable, concurrent closes coalesce and completed cleanup stages do not repeat.
 * [POS]: Browser plugin lifecycle regression; no real browser or external commands.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBrowserPluginSession, type BrowserPluginSession } from '../packages/browser-plugins/src/host'

const browser = vi.hoisted(() => ({ close: vi.fn(), getTools: () => ({}), setCurrentThread: vi.fn(), ensureReady: vi.fn(async () => {}), getCdpUrl: () => 'http://127.0.0.1:9222' }))
vi.mock('@mastra/agent-browser', () => ({ AgentBrowser: class { constructor() { return browser } } }))
vi.mock('@mastra/browser-viewer', () => ({ BrowserViewer: class { constructor() { return browser } } }))
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
