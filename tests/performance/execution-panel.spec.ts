/*
 * [INPUT]: Real Electron UI with seeded long chat/execution text and no model calls.
 * [OUTPUT]: Cold/warm panel frame intervals, layout/script time and observed content widths.
 * [POS]: Opt-in panel diagnosis; trace recording is stopped during measurement.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md和17组04实际进度。
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Desktop } from '../e2e/support/desktop'
import { prepareGroupChat } from '../e2e/support/group-chat'
import { ExecutionRepository } from '../../packages/runtime/src/modules/conversations/execution'
import type { AgentRun, Message } from '../../packages/shared/src/domain'

const output = resolve(process.env.BOAI_PERF_OUTPUT ?? '.local/frontend-performance/execution-panel')
const batches = Number(process.env.BOAI_PERF_BATCHES ?? 3)
const samples = Number(process.env.BOAI_PERF_SAMPLES ?? 10)
async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})))
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  })
}
for (let batch = 0; batch < batches; batch++) test(`execution panel batch ${batch + 1}`, async ({}, info) => {
  const desktop = await Desktop.create(info)
  let stopped = false
  try {
    const fixture = await prepareGroupChat(desktop, { seedBeforeLaunch: true, selectConversation: false, seedAdditional: async (store, setup) => {
      const run: AgentRun = { id: 'panel-perf-run', conversationId: setup.group.id, agentId: 'researcher', agentName: '研究员', triggerMessageId: 'history-user', messageId: 'history-research', status: 'completed', phase: 'execution', toolEvents: [], createdAt: '2026-10-28T00:00:00.000Z', finishedAt: '2026-10-28T00:05:00.000Z' }
      const message = (await store.get<Message>('messages', 'history-research'))!
      const paragraph = '核对桌面活动与执行记录，保留真实来源和原始顺序。The execution history contains a long explanation with links and code, and should remain readable while the panel opens.'
      await store.write([{ collection: 'runs', id: run.id, value: run }, { collection: 'messages', id: message.id, value: { ...message, content: Array.from({ length: 36 }, (_, n) => `### 核对 ${n + 1}\n\n${paragraph.repeat(3)}`).join('\n\n') } }])
      const repository = new ExecutionRepository(store, () => {})
      for (let n = 0; n < 8; n++) await repository.append(run, { id: `panel-text-${n}`, eventType: 'agent.text.block', payload: { text: `记录段落 ${n + 1}\n\n${Array.from({ length: 22 }, () => paragraph.repeat(2)).join('\n\n')}` } })
    } })
    const page = desktop.page
    await page.evaluate(() => localStorage.setItem('boai.v2.detailWidth', '600'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /产品讨论组/ }).click()
    await desktop.app.context().tracing.stop(); stopped = true
    const cdp = await desktop.app.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
    await page.evaluate(() => {
      const state: any = { active: false, armed: false, frames: [], widths: [], tasks: [], transitions: [] }
      Object.assign(window, { __panelPerf: state })
      new PerformanceObserver(list => { if (state.active) state.tasks.push(...list.getEntries().filter(e => e.startTime >= state.start).map(e => ({ at: e.startTime - state.start, duration: e.duration }))) }).observe({ type: 'longtask' })
      const observer = new ResizeObserver(entries => {
        if (state.active) for (const entry of entries) state.widths.push({ target: entry.target.classList.contains('content-main') ? 'main' : 'detail', at: performance.now() - state.start, width: entry.contentRect.width })
      })
      for (const element of document.querySelectorAll('.content-main,.panel-resize[data-side=right]>.panel-resize-content>.detail-panel')) observer.observe(element)
      document.addEventListener('transitionrun', event => {
        if (state.active) state.transitions.push({ target: (event.target as Element).className, property: (event as TransitionEvent).propertyName, at: performance.now() - state.start })
      }, true)
      document.addEventListener('click', () => {
        if (!state.armed) return
        state.armed = false; state.active = true; state.start = performance.now(); state.last = state.start
        const tick = () => {
          if (!state.active) return
          const now = performance.now(); state.frames.push(now - state.last); state.last = now
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, true)
    })
    const rows: unknown[] = []
    const toggle = page.getByRole('button', { name: '显示或隐藏详情', exact: true })
    let opening: Locator
    for (let sample = 0; sample < samples; sample++) {
      if (sample === 0) {
        await page.getByRole('button', { name: '会话操作', exact: true }).click()
        opening = page.getByRole('menuitem', { name: '执行过程', exact: true })
      } else {
        await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'false'); await settle(page)
        opening = toggle
      }
      const before = await metrics()
      const profile = process.env.BOAI_PANEL_PROFILE === String(sample)
      if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
      await page.evaluate(() => Object.assign((window as any).__panelPerf, { armed: true, active: false, frames: [], widths: [], tasks: [], transitions: [], initialWidths: [...document.querySelectorAll('.content-main,.panel-resize[data-side=right] .detail-panel')].map(element => ({ target: element.className, width: element.getBoundingClientRect().width })) }))
      await opening.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('#agent-execution-drawer')).toBeVisible()
      await expect(page.locator('[data-execution-view=rendered]')).toContainText('记录段落')
      await settle(page)
      const timing = await page.evaluate(() => {
        const s = (window as any).__panelPerf; s.active = false
        return { elapsed: performance.now() - s.start, frames: s.frames, widths: s.widths, initialWidths: s.initialWidths, tasks: s.tasks, transitions: s.transitions, dom: document.querySelectorAll('*').length }
      })
      const after = await metrics()
      const delta = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(key => [key, (after[key] - before[key]) * (key.endsWith('Count') ? 1 : 1000)]))
      rows.push({ batch, sample, cold: sample === 0, ...timing, metrics: delta })
      if (profile) {
        const { profile: cpu } = await cdp.send('Profiler.stop')
        await mkdir(output, { recursive: true }); await writeFile(join(output, `cpu-${batch}-${sample}.cpuprofile`), JSON.stringify(cpu))
      }
    }
    // Outside timing: width changes, reduced motion, close isolation and reading remain functional.
    const separator = page.getByRole('separator', { name: '调整详情宽度', exact: true })
    const width = Number(await separator.getAttribute('aria-valuenow'))
    await separator.press('ArrowLeft')
    await expect(separator).toHaveAttribute('aria-valuenow', String(width + 10))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'false'); await settle(page)
    await expect(page.locator('.panel-resize[data-side=right]')).toHaveAttribute('inert', '')
    await toggle.click(); await expect(page.locator('[data-execution-view=rendered]')).toContainText('记录段落')
    await settle(page)
    const bounds = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('.content-frame')!
      const main = document.querySelector<HTMLElement>('.content-main')!
      const panel = document.querySelector<HTMLElement>('.panel-resize[data-side=right]')!
      return { width: frame.clientWidth, main: main.getBoundingClientRect().width, panel: panel.getBoundingClientRect().width }
    })
    expect(Math.abs(bounds.main + bounds.panel - bounds.width)).toBeLessThan(1)
    await toggle.click(); await settle(page)
    expect(await page.locator('.content-main').evaluate(element => Math.abs(element.getBoundingClientRect().width - element.parentElement!.clientWidth))).toBeLessThan(1)
    await toggle.click(); await settle(page)
    if (batch === 0) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, 'panel.png') }) }
    expect(fixture.state.calls).toBe(0)
    expect(desktop.errors).toEqual([])
    await mkdir(output, { recursive: true })
    await writeFile(join(output, `batch-${batch}.json`), JSON.stringify({ rows, mode: process.env.BOAI_TEST_DEV_SERVER === '1' ? 'development' : 'production', built: process.env.BOAI_TEST_DEV_SERVER === '1' ? null : JSON.parse(await readFile('dist/build-identity.json', 'utf8')), fixture: { narrationBlocks: 8, paragraphsPerBlock: 22, longChatParagraphs: 36, modelCalls: fixture.state.calls }, bounds, environment: await desktop.app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform, arch: process.arch })), renderer: page.url() }, null, 2))
    console.log(JSON.stringify(rows.map((r: any) => ({ sample: r.sample, elapsed: Math.round(r.elapsed), maxFrame: Math.round(Math.max(...r.frames)), slowFrames: r.frames.filter((n: number) => n > 25).length, layout: Math.round(r.metrics.LayoutDuration), script: Math.round(r.metrics.ScriptDuration), resizeEvents: r.widths.length }))))
    await cdp.detach()
  } finally {
    if (stopped) await desktop.app.context().tracing.start({ screenshots: false, snapshots: false })
    await desktop.dispose()
  }
})
