/*
 * [INPUT]: Fresh real Electron sessions, public contact/schedule/team dialogs.
 * [OUTPUT]: Counterbalanced cold, repeated and cross-page opening measurements.
 * [POS]: Opt-in first-open diagnosis; no model calls or visual baseline writes.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md和17组04实际进度。
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Desktop } from '../e2e/support/desktop'
import { prepareGroupChat } from '../e2e/support/group-chat'
// @ts-expect-error Shared plain Node identity helper has no declaration file.
import { buildInputHash } from '../../scripts/build-identity.mjs'

type Kind = 'contacts' | 'schedules' | 'team'
const labels = { contacts: '通讯录管理', schedules: '定时任务管理', team: '创建团队' }
const output = resolve(process.env.BOAI_PERF_OUTPUT ?? '.local/frontend-performance/dialog')
const orders: Kind[][] = [['contacts', 'contacts', 'schedules', 'schedules'], ['schedules', 'schedules', 'contacts', 'contacts'], ['team', 'contacts', 'schedules', 'contacts']]
const selected = process.env.BOAI_DIALOG_ORDER === undefined ? orders : [orders[Number(process.env.BOAI_DIALOG_ORDER)]]
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})))
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
  })
}
for (let batch = 0; batch < Number(process.env.BOAI_PERF_BATCHES ?? 3); batch++) for (const order of selected) test(`${order[0]} first batch ${batch + 1}`, async ({}, info) => {
  const built = process.env.BOAI_TEST_DEV_SERVER === '1' ? null : JSON.parse(await readFile('dist/build-identity.json', 'utf8'))
  if (built) expect(built.inputHash).toBe(await buildInputHash(process.cwd()))
  const desktop = await Desktop.create(info)
  let stopped = false
  try {
    const fixture = await prepareGroupChat(desktop, { seedBeforeLaunch: true, selectConversation: false })
    const page = desktop.page
    if (process.env.BOAI_TEST_DEV_SERVER === '1') await page.reload({ waitUntil: 'domcontentloaded' })
    const styleOverride = process.env.BOAI_DIALOG_STYLE
    if (styleOverride === 'no-blur') await page.addStyleTag({ content: '[data-slot=dialog-overlay] { backdrop-filter:none !important }' })
    if (styleOverride === 'round') await page.addStyleTag({ content: '[data-slot=dialog-content] { corner-shape:round !important }' })
    await desktop.app.context().tracing.stop(); stopped = true
    const cdp = await desktop.app.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const native = await desktop.app.evaluate(({ BrowserWindow, app }) => ({ windows: BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), minimized: window.isMinimized() })), gpu: app.getGPUFeatureStatus() }))
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
    await page.evaluate(() => {
      const state: any = { armed: false, active: false }
      Object.assign(window, { __dialogPerf: state })
      document.addEventListener('transitionrun', event => {
        if (state.active && (event.target as Element).matches('[data-slot=dialog-content],[data-slot=dialog-overlay]')) state.transitions.push({ at: performance.now() - state.start, slot: (event.target as HTMLElement).dataset.slot, property: (event as TransitionEvent).propertyName })
      }, true)
      document.addEventListener('click', () => {
        if (!state.armed) return
        state.armed = false; state.active = true; state.start = performance.now(); state.last = state.start
        const tick = () => {
          if (!state.active) return
          const now = performance.now(); state.frames.push(now - state.last); state.last = now
          const popup = document.querySelector('[data-slot=dialog-content]')
          if (popup && state.firstPaint === null) {
            const style = getComputedStyle(popup)
            state.firstPaint = { at: now - state.start, opacity: style.opacity, transform: style.transform }
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, true)
    })
    const rows = []
    for (const [index, kind] of order.entries()) {
      await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: kind === 'schedules' ? '定时任务' : '通讯录', exact: true }).click()
      await settle(page)
      if (kind === 'schedules') await page.getByRole('button', { name: '定时任务选项', exact: true }).click()
      else await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: labels[kind], exact: true })).toBeVisible()
      const profile = process.env.BOAI_DIALOG_PROFILE === '1'
      if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
      if (profile && index === 0) await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,viz,gpu,skia,disabled-by-default-gpu.service,disabled-by-default-skia.gpu', transferMode: 'ReturnAsStream' })
      const before = await metrics()
      await page.evaluate(() => { performance.clearResourceTimings(); Object.assign((window as any).__dialogPerf, { armed: true, active: false, frames: [], firstPaint: null, transitions: [] }) })
      await page.getByRole('menuitem', { name: labels[kind], exact: true }).click()
      const dialog = page.getByRole('dialog', { name: labels[kind], exact: true })
      await expect(dialog).toBeVisible()
      await settle(page)
      const timing = await page.evaluate(() => {
        const s = (window as any).__dialogPerf; s.active = false
        const popup = document.querySelector<HTMLElement>('[data-slot=dialog-content]')!
        const overlay = document.querySelector<HTMLElement>('[data-slot=dialog-overlay]')!
        return { elapsed: performance.now() - s.start, frames: s.frames, firstPaint: s.firstPaint, transitions: s.transitions, visibility: document.visibilityState, nodes: document.querySelectorAll('*').length, dialogNodes: popup.querySelectorAll('*').length, backdropFilter: getComputedStyle(overlay).backdropFilter, resources: performance.getEntriesByType('resource').map(e => ({ path: new URL(e.name).pathname, duration: e.duration })), focused: popup.contains(document.activeElement), open: popup.classList.contains('is-open') }
      })
      const after = await metrics()
      rows.push({ index, kind, cold: index === 0, ...timing, metrics: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(key => [key, (after[key] - before[key]) * (key.endsWith('Count') ? 1 : 1000)])) })
      if (profile) { const { profile: cpu } = await cdp.send('Profiler.stop'); await mkdir(output, { recursive: true }); await writeFile(join(output, `cpu-${order[0]}-${batch}-${index}.cpuprofile`), JSON.stringify(cpu)) }
      if (profile && index === 0) {
        const complete = new Promise<any>(done => cdp.once('Tracing.tracingComplete', done)); await cdp.send('Tracing.end')
        const { stream } = await complete; let trace = ''
        while (true) { const part = await cdp.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break }
        await cdp.send('IO.close', { handle: stream }); await writeFile(join(output, `trace-${order[0]}-${batch}.json`), trace)
      }
      expect(timing.open).toBe(true)
      expect(timing.focused).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden(); await settle(page)
      await expect(page.locator('[data-slot=dialog-overlay]')).toHaveCount(0)
    }
    expect(fixture.state.calls).toBe(0)
    expect(desktop.errors).toEqual([])
    await mkdir(output, { recursive: true })
    await writeFile(join(output, `${order[0]}-${batch}.json`), JSON.stringify({ order, batch, rows, native, styleOverride, modelCalls: fixture.state.calls, mode: process.env.BOAI_TEST_DEV_SERVER === '1' ? 'development' : 'production', built, environment: await desktop.app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform, arch: process.arch })) }, null, 2))
    console.log(JSON.stringify({ first: order[0], rows: rows.map(row => ({ kind: row.kind, maxFrame: Math.round(Math.max(...row.frames)), paint: Math.round(row.firstPaint?.at ?? 0), script: Math.round(row.metrics.ScriptDuration), layout: Math.round(row.metrics.LayoutDuration), elapsed: Math.round(row.elapsed), resources: row.resources.map(value => value.path.split('/').at(-1)) })) }))
    await cdp.detach()
  } finally {
    if (stopped) await desktop.app.context().tracing.start({ screenshots: false, snapshots: false })
    await desktop.dispose()
  }
})
