/*
 * [INPUT]: CLI terminal sinks, lifecycle diagnostics and controlled timer ticks.
 * [OUTPUT]: Machine output remains clean; interactive animation stops before business output and diagnostics omit payloads.
 * [POS]: CLI presentation contract without a service or model.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { CliPresentation } from '../src/cli/presentation'

afterEach(() => vi.useRealTimers())
function terminal(options: Partial<ConstructorParameters<typeof CliPresentation>[0]> = {}) {
  const stdout = { isTTY: true, write: vi.fn() }, stderr = { isTTY: true, write: vi.fn() }
  return { stdout, stderr, ui: new CliPresentation({ stdout, stderr, json: false, ...options }) }
}
it('keeps animation on stderr and stops its timer before writing a partial business answer', () => {
  vi.useFakeTimers()
  const { ui, stdout, stderr } = terminal()
  ui.wait('连接'); vi.advanceTimersByTime(160)
  expect(stdout.write).not.toHaveBeenCalled(); expect(stderr.write).toHaveBeenCalledWith('连接 ⠹')
  ui.stdout('回答🙂'); expect(stdout.write).toHaveBeenCalledExactlyOnceWith('回答🙂')
  expect(stderr.write).toHaveBeenLastCalledWith('\r\x1b[2K')
  const count = stderr.write.mock.calls.length
  vi.advanceTimersByTime(1000); expect(stderr.write).toHaveBeenCalledTimes(count)
  expect(vi.getTimerCount()).toBe(0)
})
it.each([{ json: true }, { noSpinner: true }, { noColor: true }, { term: 'dumb' }, { stdout: { isTTY: false, write: vi.fn() } }, { stderr: { isTTY: false, write: vi.fn() } }])('suppresses terminal control for %o', options => {
  vi.useFakeTimers()
  const { ui, stderr } = terminal(options)
  ui.wait('连接'); vi.advanceTimersByTime(1000); ui.stop()
  expect(stderr.write).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
})
it('emits only declared diagnostic fields to stderr when verbose is explicit', () => {
  const { ui, stdout, stderr } = terminal({ json: true, verbose: true })
  const event = { event: 'service_ready' as const, pid: 10, serverId: 'server', payload: 'PRIVATE_BODY', token: 'PRIVATE_TOKEN' }
  ui.diagnostic(event)
  expect(stdout.write).not.toHaveBeenCalled()
  expect(JSON.parse(stderr.write.mock.calls[0][0])).toEqual({ type: 'diagnostic', event: 'service_ready', pid: 10, serverId: 'server' })
  const quiet = terminal(); quiet.ui.diagnostic(event); expect(quiet.stderr.write).not.toHaveBeenCalled()
})
