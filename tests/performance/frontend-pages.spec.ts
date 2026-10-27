/*
 * [INPUT]: Real Electron, an isolated seeded profile, native clicks and CDP counters.
 * [OUTPUT]: Per-page click-to-frame/settled timing, long tasks, frames and real IPC duration.
 * [POS]: Opt-in diagnostics; timing batches exclude trace screenshots and use no remote models.
 * [PROTOCOL]: Update performance/.folder.md and spec17/04 when changed.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Desktop } from '../e2e/support/desktop'
import { prepareGroupChat } from '../e2e/support/group-chat'
// @ts-expect-error Shared plain Node build identity helper has no declaration file.
import { buildInputHash } from '../../scripts/build-identity.mjs'

type View = { id: string; label: string; route: string; tab?: string; category?: string; retainedProfile?: boolean }
type Row = { id: string; batch: number; sample: number; firstPaintMs: number; settledMs: number; maxFrameMs: number; longTasks: { duration: number }[]; animations: unknown[]; requests: { method: string; ms: number; failed: boolean }[]; metrics: Record<string, number> }
const settings = ['个人资料', '外观', '快捷键', '运行选项', '桌面活动与日报', '模型连接', '网页检索', '语音输入', '插件', '数据与备份']
const views: View[] = [
  ...[['conversations', '会话'], ['contacts', '通讯录'], ['schedules', '定时任务'], ['skills', '资源库']].map(([route, label]) => ({ id: route, label, route })),
  ...settings.map((label, i) => ({ id: `settings-${i}`, label, route: 'settings', tab: label })),
  ...['技能', '数据源', '提示词'].map((label, i) => ({ id: `resources-${i}`, label, route: 'skills', category: label })),
  ...[['conversations', '会话'], ['contacts', '通讯录'], ['schedules', '定时任务']].map(([route, label]) => ({ id: `${route}-after-profile`, label, route, retainedProfile: true })),
]
const samples = Number(process.env.BOAI_PERF_SAMPLES ?? 3)
const batches = Number(process.env.BOAI_PERF_BATCHES ?? 3)
const filter = process.env.BOAI_PERF_VIEWS?.split(',')
const output = resolve(process.env.BOAI_PERF_OUTPUT ?? '.local/frontend-performance/scan')
const selected = filter ? views.filter(view => filter.includes(view.id)) : views
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

async function animations(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})))
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  })
}
async function mainPage(page: Page, route: string, label: string) {
  if (await page.locator('.app-shell').getAttribute('data-page') !== route) {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-page', route)
    await animations(page)
  }
}
async function settingsPage(page: Page) {
  if (await page.locator('.app-shell').getAttribute('data-page') === 'settings') return
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-page', 'settings')
  await animations(page)
}
async function control(page: Page, view: View): Promise<Locator> {
  if (view.retainedProfile) {
    await settingsPage(page)
    await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '个人资料', exact: true }).click()
    await animations(page)
  }
  if (view.tab) {
    await settingsPage(page)
    const nav = page.getByRole('navigation', { name: '设置分类', exact: true })
    const anchor = view.tab === '模型连接' ? '个人资料' : '模型连接'
    await nav.getByRole('button', { name: anchor, exact: true }).click()
    await animations(page)
    return nav.getByRole('button', { name: view.tab, exact: true })
  }
  if (view.category) {
    await mainPage(page, 'skills', '资源库')
    const nav = page.getByRole('complementary', { name: '资源库导航', exact: true })
    await nav.getByRole('button', { name: view.category === '技能' ? '数据源' : '技能', exact: true }).click()
    await animations(page)
    return nav.getByRole('button', { name: view.category, exact: true })
  }
  await mainPage(page, view.route === 'conversations' ? 'contacts' : 'conversations', view.route === 'conversations' ? '通讯录' : '会话')
  return page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: view.label, exact: true })
}

for (let batch = 0; batch < batches; batch++) test(`page performance batch ${batch + 1}`, async ({}, info) => {
  const inputHash = await buildInputHash(process.cwd())
  const built = process.env.BOAI_TEST_DEV_SERVER === '1' ? null : JSON.parse(await readFile(resolve('dist/build-identity.json'), 'utf8'))
  if (built) expect(built.inputHash).toBe(inputHash)
  const runtime = await Desktop.create(info), rows: Row[] = []
  let tracingStopped = false
  try {
    const fixture = await prepareGroupChat(runtime, { seedBeforeLaunch: true })
    const page = runtime.page
    const fixtureShape = await page.evaluate(async ({ groupId, directId }) => {
      const [snapshot, group, direct] = await Promise.all([
        window.boai.request('snapshot', undefined),
        window.boai.request('getConversation', { id: groupId }),
        window.boai.request('getConversation', { id: directId }),
      ])
      return { agents: snapshot.agents.length, conversations: snapshot.conversations.length, groupMessages: group.messages.length, directMessages: direct.messages.length }
    }, { groupId: fixture.group.id, directId: fixture.direct.id })
    await runtime.app.context().tracing.stop()
    tracingStopped = true
    await runtime.app.evaluate(({ ipcMain }) => {
      const host = globalThis as any
      host.__boaiPerfIpc = { pending: 0, rows: [] }
      const original = (ipcMain as any)._invokeHandlers.get('boai:request')
      ipcMain.removeHandler('boai:request')
      ipcMain.handle('boai:request', async (event, payload) => {
        const state = host.__boaiPerfIpc, start = performance.now(); state.pending++
        let failed = false
        try { return await original(event, payload) }
        catch (e) { failed = true; throw e }
        finally { state.pending--; state.rows.push({ method: payload.method, ms: performance.now() - start, failed }) }
      })
    })
    await page.evaluate(() => {
      const state = { active: false, armed: false, start: 0, firstPaintMs: null as number | null, frames: [] as number[], tasks: [] as { duration: number }[], transitions: [] as unknown[], target: null as any, last: 0 }
      Object.assign(window, { __boaiPagePerf: state })
      new PerformanceObserver(list => { if (state.active) state.tasks.push(...list.getEntries().filter(e => e.startTime >= state.start).map(e => ({ duration: e.duration }))) }).observe({ type: 'longtask', buffered: false })
      for (const name of ['transitionrun', 'transitionend']) document.addEventListener(name, e => {
        const event = e as TransitionEvent
        if (state.active && (event.target as Element)?.classList?.contains('t-panel-slide')) state.transitions.push({ type: name, property: event.propertyName, at: performance.now() - state.start, elapsed: event.elapsedTime })
      }, true)
      document.addEventListener('click', () => {
        if (!state.armed) return
        state.armed = false; state.active = true; state.start = performance.now(); state.last = state.start
        const tick = () => {
          if (!state.active) return
          const now = performance.now(); state.frames.push(now - state.last); state.last = now
          const target = state.target
          const current = document.querySelector('.app-shell')?.getAttribute('data-page') === target.route
          const tab = !target.tab || document.querySelector('nav[aria-label="设置分类"] button[aria-current="page"]')?.textContent?.trim() === target.tab
          const category = !target.category || document.querySelector('.custom-categories button[aria-current="page"]')?.textContent?.trim() === target.category
          if (state.firstPaintMs === null && current && tab && category) requestAnimationFrame(() => { state.firstPaintMs ??= performance.now() - state.start })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, true)
    })
    const cdp = await runtime.app.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
    for (let sample = 0; sample < samples; sample++) for (const view of selected) {
      const button = await control(page, view)
      await runtime.app.evaluate(() => { (globalThis as any).__boaiPerfIpc.rows = [] })
      const before = await metrics()
      await page.evaluate(target => {
        const s = (window as any).__boaiPagePerf
        Object.assign(s, { armed: true, active: false, firstPaintMs: null, frames: [], tasks: [], transitions: [], target })
      }, view)
      await button.click()
      await page.waitForFunction(() => (window as any).__boaiPagePerf.firstPaintMs !== null)
      const runningAnimations = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => ({ target: (a.effect as KeyframeEffect)?.target?.getAttribute('class')?.slice(0, 120), duration: a.effect?.getTiming().duration, delay: a.effect?.getTiming().delay })))
      await animations(page)
      const requests = await runtime.app.evaluate(async () => {
        const state = (globalThis as any).__boaiPerfIpc, until = Date.now() + 5000
        while (state.pending && Date.now() < until) await new Promise(r => setTimeout(r, 10))
        if (state.pending) throw new Error('UI requests did not settle')
        return state.rows
      })
      await animations(page)
      const timing = await page.evaluate(() => {
        const s = (window as any).__boaiPagePerf; s.active = false
        return { firstPaintMs: s.firstPaintMs, settledMs: performance.now() - s.start, maxFrameMs: Math.max(...s.frames), longTasks: s.tasks, transitions: s.transitions }
      })
      const after = await metrics()
      const delta = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(key => [key, (after[key] - before[key]) * 1000]))
      rows.push({ id: view.id, batch, sample, ...timing, animations: runningAnimations, requests, metrics: { ...delta, Nodes: after.Nodes, JSHeapUsedSize: after.JSHeapUsedSize } })
      if (process.env.BOAI_PERF_CPU === view.id && sample === 0) {
        const repeat = await control(page, view)
        await cdp.send('Profiler.enable'); await cdp.send('Profiler.start')
        await repeat.click(); await animations(page)
        const { profile } = await cdp.send('Profiler.stop')
        await mkdir(output, { recursive: true }); await writeFile(join(output, `cpu-${view.id}-${batch}.cpuprofile`), JSON.stringify(profile))
      }
      if (process.env.BOAI_PERF_TRACE === view.id && sample === 0) {
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
        const repeat = await control(page, view); await repeat.click(); await animations(page)
        const complete = new Promise<any>(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end')
        const { stream } = await complete; let trace = ''
        while (true) { const part = await cdp.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break }
        await cdp.send('IO.close', { handle: stream }); await mkdir(output, { recursive: true }); await writeFile(join(output, `trace-${view.id}-${batch}.json`), trace)
      }
    }
    // Outside timed regions: keep chart state changes and keyboard navigation
    // covered when isolating it from unrelated parent updates.
    if (batch === 0) {
      await settingsPage(page)
      await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '个人资料', exact: true }).click()
      const chart = page.getByRole('region', { name: 'Token 活动', exact: true })
      await expect(chart).toHaveAttribute('aria-busy', 'false')
      for (const label of ['每周', '累计']) {
        await chart.getByRole('button', { name: label, exact: true }).click()
        await expect(chart.locator('.profile-chart')).toBeVisible()
        await expect(chart.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
      }
      await chart.getByRole('button', { name: '每日', exact: true }).click()
      const days = chart.locator('.profile-day[aria-label]')
      expect(await days.count()).toBeGreaterThan(300)
      await days.first().focus(); await days.first().press('ArrowRight')
      await expect(days.nth(7)).toBeFocused()
      await page.keyboard.press('Escape')
    }
    expect(fixture.state.calls).toBe(0)
    expect(runtime.errors).toEqual([])
    await mkdir(output, { recursive: true })
    await writeFile(join(output, `batch-${batch}.json`), JSON.stringify({ version: 1, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), inputHash, built, mode: process.env.BOAI_TEST_DEV_SERVER === '1' ? 'development' : 'production', rendererUrl: page.url(), fixture: { ...fixtureShape, modelCalls: fixture.state.calls }, environment: await runtime.app.evaluate(({ app, screen }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform, arch: process.arch, executable: process.execPath, userData: app.getPath('userData'), displays: screen.getAllDisplays().map(d => ({ size: d.size, scaleFactor: d.scaleFactor, frequency: d.displayFrequency })) })), views: selected, rows }, null, 2))
    console.log(JSON.stringify({ batch, samples: rows.length, pages: selected.map(v => ({ id: v.id, medianFirstPaintMs: median(rows.filter(r => r.id === v.id).map(r => r.firstPaintMs)), medianSettledMs: median(rows.filter(r => r.id === v.id).map(r => r.settledMs)), maxFrameMs: Math.max(...rows.filter(r => r.id === v.id).map(r => r.maxFrameMs)) })) }))
    await cdp.detach()
  } finally {
    if (tracingStopped) await runtime.app.context().tracing.start({ screenshots: false, snapshots: false })
    await runtime.dispose()
  }
})
