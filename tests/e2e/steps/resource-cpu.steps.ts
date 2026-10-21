/*
 * [INPUT]: Real isolated Electron, bounded 70/200ms busy intervals and the unchanged resource thresholds/GC count.
 * [OUTPUT]: Native cumulative counters and complete windows, original verifier's actual CPU rejection, then quiet acceptance.
 * [POS]: Measurement negative controls; no models, synthetic CPU percentages or product service replacement.
 * [PROTOCOL]: Update Header and steps/.folder.md when changed.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { resourceSample, verifyResources, type ResourceSample } from '../support/background-resources'

type BusyTimer = typeof globalThis & { __boaiCpuCalibration?: ReturnType<typeof setInterval> }
type State = { busy: { target: string; samples: ResourceSample[] }[]; quiet?: ResourceSample[] }
export const test = base.extend<{ cpuCalibration: State }>({ cpuCalibration: async ({}, use) => use({ busy: [] }) })
const { Given, When, Then } = createBdd(test)
const medianCpu = (samples: ResourceSample[]) => samples.slice(-5).map(sample => sample.cpuWindow.processes.reduce((sum, process) => sum + process.cpuPercent, 0)).sort((a, b) => a - b)[2]

Given('CPU校准使用隔离的实际桌面', async ({ runtime }) => {
  // New calibration includes two real negative-control phases and a quiet phase.
  test.setTimeout(180_000)
  await runtime.start()
})
When('我分别制造真实Renderer和Main持续活动并采样', async ({ runtime, cpuCalibration: state }) => {
  const cdp = await runtime.app.context().newCDPSession(runtime.page)
  const sample = async () => {
    const samples = [await resourceSample(runtime, cdp)]
    for (let index = 0; index < 5; index++) { await runtime.page.waitForTimeout(1000); samples.push(await resourceSample(runtime, cdp)) }
    return samples
  }
  try {
    await runtime.page.evaluate(() => {
      const timer = setInterval(() => { const end = performance.now() + 70; while (performance.now() < end) { /* actual bounded work */ } }, 200)
      Object.assign(globalThis, { __boaiCpuCalibration: timer })
    })
    try { state.busy.push({ target: 'Renderer', samples: await sample() }) }
    finally { await runtime.page.evaluate(() => { clearInterval((globalThis as BusyTimer).__boaiCpuCalibration); delete (globalThis as BusyTimer).__boaiCpuCalibration }) }
    await runtime.app.evaluate(() => {
      const timer = setInterval(() => { const end = performance.now() + 70; while (performance.now() < end) { /* actual bounded work */ } }, 200)
      Object.assign(globalThis, { __boaiCpuCalibration: timer })
    })
    try { state.busy.push({ target: 'Main', samples: await sample() }) }
    finally { await runtime.app.evaluate(() => { clearInterval((globalThis as BusyTimer).__boaiCpuCalibration); delete (globalThis as BusyTimer).__boaiCpuCalibration }) }
    state.quiet = await sample()
    await runtime.reviewData('原资源CPU门槛的实际忙碌和空闲对照', { busy: state.busy.map(value => ({ ...value, medianCpuPercent: medianCpu(value.samples) })), quiet: state.quiet, quietMedianCpuPercent: medianCpu(state.quiet), realProviderCalls: 0, thresholdsUnchanged: true })
  } finally { await cdp.detach() }
})
Then('原5%门槛拒绝两类高CPU并且真实空闲通过', async ({ runtime, cpuCalibration: state }) => {
  for (const phase of state.busy) {
    for (const sample of phase.samples.slice(-5)) expect(sample.cpuWindow.complete, sample.cpuWindow.errors.join('; ')).toBe(true)
    expect(medianCpu(phase.samples), phase.target).toBeGreaterThan(5)
    let failure = ''
    try { verifyResources(phase.samples) } catch (error) { failure = String(error).replace(/\u001b\[[0-9;]*m/g, '') }
    // Reject specifically at the original CPU bound; an unrelated earlier error is not a negative-control pass.
    expect(failure, phase.target).toContain('Expected: < 5')
  }
  verifyResources(state.quiet!)
  expect(runtime.errors).toEqual([])
})
