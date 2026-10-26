/*
 * [INPUT]: Simulated power/lock events, a late snapshot read and repeated monitor installation.
 * [OUTPUT]: Current versioned state with no duplicate listeners or post-disposal events.
 * [POS]: System lifecycle contract; real macOS sleep and microphone release require desktop acceptance.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { EventEmitter } from 'node:events'
import { expect, test, vi } from 'vitest'
import { DesktopLifecycleMonitor } from '../apps/electron/src/main/desktop-lifecycle'

class Power extends EventEmitter { getSystemIdleState() { return 'locked' } }
test('initial locked state and late reads preserve the current power generation', () => {
  const source = new Power(), changed = vi.fn(), monitor = new DesktopLifecycleMonitor(changed)
  monitor.start(source)
  expect(monitor.snapshot()).toMatchObject({ power: 'awake', locked: true, revision: 0 })
  source.emit('suspend'); source.emit('unlock-screen'); source.emit('resume')
  expect(monitor.snapshot()).toMatchObject({ power: 'awake', locked: false, revision: 3 })
  expect(changed.mock.calls.map(call => call[1])).toEqual(['suspend', 'unlock-screen', 'resume'])
  expect(changed.mock.calls[0][0]).toMatchObject({ power: 'suspended', locked: true, revision: 1 })
  const snapshot = monitor.snapshot(); snapshot.locked = true
  expect(monitor.snapshot().locked).toBe(false)
})
test('repeated starts do not multiply listeners, and stop removes only owned listeners', () => {
  const source = new Power(), changed = vi.fn(), other = vi.fn(); source.on('resume', other)
  const monitor = new DesktopLifecycleMonitor(changed); monitor.start(source); monitor.start(source)
  expect(source.listenerCount('resume')).toBe(2)
  monitor.stop(); monitor.stop(); source.emit('resume')
  expect(changed).not.toHaveBeenCalled(); expect(other).toHaveBeenCalledOnce()
  expect(source.listenerCount('suspend')).toBe(0)
  monitor.start(source); source.emit('lock-screen')
  expect(changed).toHaveBeenCalledOnce()
  monitor.stop()
})
