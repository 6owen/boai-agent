/*
 * [INPUT]: Opt-in signed Sparkle fixtures and the existing BDD lifecycle.
 * [OUTPUT]: Real delta install, corrupt-delta full fallback/restart and corrupt-full rejection.
 * [POS]: Native update acceptance; no supplier calls or personal app mutation.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { probeNativeUpdate, type UpdateProbeMode } from '../support/app-updates'
const { Then } = createBdd(test)
Then('独立macOS应用完成{string}更新验收', async ({ runtime }, mode: string) => {
  test.skip(process.platform !== 'darwin' || process.env.BOAI_TEST_SPARKLE !== '1', '显式 BOAI_TEST_SPARKLE=1 才构建并升级独立应用副本')
  test.setTimeout(600_000)
  if (!['delta-quit', 'delta-fallback-restart', 'invalid-full'].includes(mode)) throw Error('未知更新场景')
  try {
    const evidence = await probeNativeUpdate(runtime.root, mode as UpdateProbeMode)
    await runtime.reviewData('Sparkle实际更新验收', evidence)
    const path = test.info().outputPath('sparkle-update.json')
    await writeFile(path, JSON.stringify(evidence, null, 2))
    await test.info().attach('sparkle-update', { path, contentType: 'application/json' })
  } finally {
    const evidence = await readFile(join(runtime.root, 'probe-evidence.json')).catch(() => null)
    if (evidence) {
      const path = test.info().outputPath('sparkle-events-including-failure.json')
      await writeFile(path, evidence)
      await test.info().attach('sparkle-events-including-failure', { path, contentType: 'application/json' })
    }
  }
})

Then('独立BOAI安装包完成更新检查与主窗入口验收', async ({ runtime }) => {
  test.skip(!process.env.BOAI_TEST_PACKAGED_PATH || !process.env.BOAI_TEST_SPARKLE_FEED, '需要明确隔离包及包内loopback更新源')
  const { createServer } = await import('node:http'), { expect } = await import('@playwright/test')
  const feed = new URL(process.env.BOAI_TEST_SPARKLE_FEED!)
  if (feed.hostname !== '127.0.0.1' || feed.protocol !== 'http:' || !feed.port) throw Error('只允许隔离loopback更新源')
  let requests = 0
  const server = createServer((_req, res) => { requests++; res.setHeader('Content-Type', 'application/xml'); res.end('<?xml version="1.0"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Isolated BOAI updates</title></channel></rss>') })
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(Number(feed.port), '127.0.0.1', accept) })
  runtime.defer(async () => { server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept())) })
  await runtime.start()
  await expect.poll(() => runtime.page.evaluate(async () => (await window.boai.updates!.snapshot()).phase), { timeout: 30_000 }).toBe('idle')
  expect(requests).toBeGreaterThan(0)
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '运行选项', exact: true }).click()
  const card = runtime.page.locator('[aria-label="应用更新"]')
  await expect(card.getByText('当前版本', { exact: true })).toBeVisible()
  const before = requests
  await card.getByRole('button', { name: '检查更新', exact: true }).click()
  await expect.poll(() => requests).toBeGreaterThan(before)
  await expect(card.getByRole('button', { name: '检查更新', exact: true })).toBeEnabled()
  expect(runtime.errors).toEqual([])
  await runtime.reviewNativeCheckpoint('实际BOAI应用更新设置')
  await test.info().attach('packaged-updater', { body: JSON.stringify({ requests, state: await runtime.page.evaluate(() => window.boai.updates!.snapshot()) }), contentType: 'application/json' })
})
