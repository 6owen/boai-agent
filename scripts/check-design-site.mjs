/*
 * [OUTPUT]: 保留原路径/搜索/草稿/外部消费断言，补全量预览、浮层隔离、Composer、Token和默认圆角检查；云端执行。
 * [INPUT]: Fumadocs静态设计站、独立tarball消费者和CI Chromium。
 * [OUTPUT]: Fumadocs语义标题/原组件浏览器验收、独立消费、稳定截图与即时运行异常原件。
 * [POS]: Web设计站专项验证，不替代原Electron BDD或UI基准。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createServer } from 'node:http'
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { readDesignContent } from './design-content.mjs'

const output = resolve('.local/design-site')
await mkdir(output, { recursive: true })
const report = { status: 'running', checks: [], errors: [], browserErrors: [] }
const servers = []
let browser, page
async function serve(directory) {
  const server = createServer(async (request, response) => {
    try {
      let file = resolve(directory, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
      if (file !== directory && !file.startsWith(directory + sep)) { response.writeHead(403); response.end(); return }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.txt': 'text/plain' }[extname(file)] ?? 'application/octet-stream'
      response.setHeader('Content-Type', `${type}; charset=utf-8`)
      response.end(await readFile(file))
    } catch { response.writeHead(404); response.end('Not found') }
  })
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}
async function check(name, action) { await action(); report.checks.push(name); process.stdout.write(`PASS ${name}\n`) }

try {
  const url = await serve(resolve('apps/design-docs/dist'))
  const content = await readDesignContent()
  await check('Every registered document has direct static HTML and Markdown', async () => {
    for (const item of content.pages) {
      expect((await fetch(url + item.path)).status, item.path).toBe(200)
      const response = await fetch(`${url}/${item.slug}.md`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(item.body)
    }
    expect((await fetch(`${url}/ai-docs/spec/README.md`)).status).toBe(404)
  })
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
  const runtimeErrors = report.browserErrors
  page.on('pageerror', error => {
    runtimeErrors.push(error.stack ?? error.message)
    process.stderr.write(`Browser runtime error: ${error.stack ?? error.message}\n`)
  })
  await check('Homepage mounts without desktop host and shared styles are present', async () => {
    await page.goto(url)
    await expect(page.locator('#nd-docs-layout')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('为专注而设计')
    await expect(page.locator('body')).not.toContainText('[PROTOCOL]')
    expect(await page.evaluate(() => 'boai' in window)).toBe(false)
    expect(await page.frameLocator('.preview-frame iframe').getByRole('button', { name: '保存更改', exact: true }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('16px')
    await page.screenshot({ path: resolve(output, 'overview-light.png'), fullPage: true, animations: 'disabled' })
  })
  await check('Search prioritizes component title and supports Enter navigation', async () => {
    await page.locator('[data-search-full]').click()
    await page.getByRole('combobox', { name: '搜索文档' }).fill('Button')
    await page.getByRole('combobox', { name: '搜索文档' }).press('Enter')
    await expect(page).toHaveURL(`${url}/components/button`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button')
    await expect(page.getByRole('combobox', { name: '搜索文档' })).toBeHidden()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('combobox', { name: '搜索文档' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-search-full]')).toBeFocused()
  })
  await check('Fumadocs renders heading anchors, TOC and highlighted Markdown with browser history', async () => {
    const heading = page.locator('.docs-prose').getByRole('heading', { level: 2 }).filter({ has: page.getByRole('link', { name: '何时使用', exact: true }) })
    await expect(heading).toHaveAttribute('id', /.+/)
    await page.locator('#nd-toc').getByRole('link', { name: '何时使用', exact: true }).click()
    expect(new URL(page.url()).hash).not.toBe('')
    await page.goto(`${url}/getting-started`)
    await expect(page.locator('figure.shiki pre').first()).toBeVisible()
    await page.locator('#nd-sidebar').getByRole('link', { name: 'Input', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Input')
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('开始使用')
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Input')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Input')
    await page.goto(`${url}/components/button`)
  })
  await check('Paired themes isolate state and typography changes resize shared controls', async () => {
    await page.getByRole('button', { name: '明暗对照', exact: true }).click()
    const light = page.frameLocator('.preview-frame.light iframe'), dark = page.frameLocator('.preview-frame.dark iframe')
    await light.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect(light.getByText('已点击保存 1 次')).toBeVisible()
    await expect(dark.getByText('试试主操作', { exact: false })).toBeVisible()
    expect(await light.locator('.preview-document').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await dark.locator('.preview-document').evaluate(element => getComputedStyle(element).backgroundColor))
    await expect(light.getByRole('button', { name: '不可用' })).toBeDisabled()
    await page.getByRole('slider', { name: '预览UI字号' }).press('End')
    await expect(light.getByRole('button', { name: '保存更改', exact: true })).toHaveCSS('font-size', '22px')
    await page.screenshot({ path: resolve(output, 'button-states.png'), fullPage: true, animations: 'disabled' })
  })
  await check('Settings preserve a draft, cancel discard and reflect explicit save/reset', async () => {
    await page.goto(`${url}/patterns/settings`)
    const preview = page.frameLocator('.preview-frame iframe')
    const name = preview.getByRole('textbox', { name: '名称', exact: true })
    await name.fill('设计系统')
    await expect(preview.getByRole('button', { name: '保存更改', exact: true })).toBeEnabled()
    await preview.getByRole('button', { name: '还原', exact: true }).click()
    await preview.getByRole('button', { name: '取消', exact: true }).click()
    await expect(name).toHaveValue('设计系统')
    await preview.getByRole('button', { name: '还原', exact: true }).click()
    await preview.getByRole('button', { name: '退出', exact: true }).click()
    await expect(name).toHaveValue('我的工作空间')
    await name.fill('设计系统')
    await preview.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect(preview.getByRole('button', { name: '保存更改', exact: true })).toBeDisabled()
    await expect(name).toHaveValue('设计系统')
  })
  await check('Theme switch and narrow-screen navigation render without page overflow', async () => {
    await page.goto(url)
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.locator('html')).toHaveClass('dark')
    await expect(page.frameLocator('.preview-frame iframe').getByRole('textbox', { name: '名称', exact: true })).toHaveCSS('background-color', 'rgb(33, 33, 33)')
    await expect(page.locator('.page-actions .soft-button-secondary')).toHaveCSS('color', 'rgb(255, 255, 255)')
    await page.screenshot({ path: resolve(output, 'overview-dark.png'), fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开导航', exact: true }).click()
    await page.locator('#nd-sidebar-mobile').getByRole('link', { name: 'Input', exact: true }).click()
    await expect(page.locator('#nd-sidebar-mobile')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Input')
    await page.frameLocator('.preview-frame iframe').getByRole('textbox', { name: '项目名称', exact: true }).fill('我的项目')
    await expect(page.frameLocator('.preview-frame iframe').getByText('当前输入：我的项目')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: resolve(output, 'mobile-input.png'), fullPage: true, animations: 'disabled' })
  })
  await check('Every registered example mounts independently in both themes without desktop globals', async () => {
    await page.setViewportSize({ width: 1100, height: 900 })
    const examples = [...new Set(content.pages.map(item => item.example))].filter(name => !['overview','installation','colors','surfaces','tokens','none','catalog'].includes(name))
    for (const name of examples) for (const mode of ['light','dark']) {
      await page.goto(`${url}/preview?example=${name}&mode=${mode}`)
      await expect(page.locator('.preview-document')).toHaveAttribute('data-example', name)
      await expect(page.getByText('加载示例…')).toHaveCount(0)
      await expect(page.getByText('示例不存在')).toHaveCount(0)
      expect(await page.locator('.preview-document').evaluate(element => element.childElementCount)).toBeGreaterThan(0)
      expect(await page.evaluate(() => 'boai' in window)).toBe(false)
    }
  })
  await check('Dialogs and confirmation portals remain inside their own themed preview', async () => {
    await page.goto(`${url}/components/containers`)
    await page.getByRole('button', { name: '明暗对照', exact: true }).click()
    const light = page.frameLocator('.preview-frame.light iframe'), dark = page.frameLocator('.preview-frame.dark iframe')
    await dark.getByRole('button', { name: '打开 Dialog', exact: true }).click()
    await expect(dark.getByRole('dialog')).toBeVisible()
    await expect(light.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(dark.locator('[data-slot=dialog-content]')).toHaveCSS('border-radius', '20px')
    await dark.getByRole('textbox', { name: '项目名称', exact: true }).press('Escape')
    await expect(dark.getByRole('button', { name: '打开 Dialog', exact: true })).toBeFocused()
    await page.goto(`${url}/components/overlays`)
    const preview = page.frameLocator('.preview-frame iframe')
    await preview.getByRole('button', { name: '移除标签', exact: true }).click()
    await preview.getByRole('button', { name: '取消', exact: true }).click()
    await expect(preview.getByText('标签仍在')).toBeVisible()
    await preview.getByRole('button', { name: '移除标签', exact: true }).click()
    await preview.getByRole('button', { name: '确认', exact: true }).click()
    await expect(preview.getByText('标签已移除')).toBeVisible()
  })
  await check('Composer sends local text, disables input during execution and allows stopping', async () => {
    await page.goto(`${url}/patterns/composer`)
    const preview = page.frameLocator('.preview-frame iframe'), input = preview.getByRole('textbox', { name: '消息内容' })
    await expect(preview.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
    await input.fill('示例消息'); await input.press('Enter')
    await expect(input).toBeDisabled()
    await preview.getByRole('button', { name: '停止演示', exact: true }).click()
    await expect(input).toBeEnabled()
    await expect(preview.getByText('上次发送：示例消息')).toBeVisible()
  })
  await check('Token search and downloads match the public defaults; Card keeps BOAI geometry', async () => {
    await page.goto(`${url}/foundations/tokens`)
    await page.getByRole('textbox', { name: '搜索 Token' }).fill('--radius-card')
    await expect(page.locator('#token-radius-card')).toBeVisible()
    await expect(page.locator('#token-radius-card')).toContainText('20px')
    const tokens = await (await fetch(`${url}/tokens.json`)).json()
    expect(tokens.light['--radius-card']).toBe('20px')
    expect(tokens.tokens.some(row => row.name === '--radius-card')).toBe(true)
    expect(await (await fetch(`${url}/foundation.css`)).text()).toContain('--radius-card: 20px')
    expect(await (await fetch(`${url}/DESIGN.md`)).text()).toContain('# BOAI Design')
    await page.goto(`${url}/components/card`)
    await expect(page.frameLocator('.preview-frame iframe').locator('[data-slot=card]').first()).toHaveCSS('border-radius', '20px')
    expect(await page.locator('[data-search-full]').evaluate(element => parseFloat(getComputedStyle(element).borderRadius))).toBeLessThan(16)
  })
  await check('Tarball consumer renders complete default styles, generated utilities and keyboard focus', async () => {
    const consumer = await serve(resolve('.local/design-consumer'))
    await page.setViewportSize({ width: 1000, height: 700 })
    await page.goto(consumer)
    await expect(page.getByText('External consumer')).toBeVisible()
    const save = page.getByRole('button', { name: 'Save', exact: true })
    expect(await save.evaluate(element => getComputedStyle(element).height)).toBe('32px')
    expect(await save.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(37, 99, 235)')
    await expect(page.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled()
    await page.getByLabel('Project', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(save).toBeFocused()
    expect(await save.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
    await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('[data-slot=dialog-content]')).toHaveCSS('border-radius', '20px')
    await page.getByRole('textbox', { name: 'Dialog draft' }).press('Escape')
    await expect(page.getByRole('button', { name: 'Open dialog', exact: true })).toBeFocused()
    await page.getByRole('textbox', { name: 'Compose' }).fill('Independent draft')
    await expect(page.getByRole('textbox', { name: 'Compose' })).toHaveValue('Independent draft')
    expect(await page.locator('.app-icon').last().evaluate(element => getComputedStyle(element).maskImage)).not.toBe('none')
    await page.screenshot({ path: resolve(output, 'external-consumer.png'), fullPage: true, animations: 'disabled' })
  })
  expect(runtimeErrors).toEqual([])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.errors.push(error.stack ?? String(error)); process.exitCode = 1
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  if (browser) await browser.close()
  await Promise.all(servers.map(server => new Promise(accept => server.close(accept))))
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
