/*
 * [INPUT]: Native update event sequences and host quit decisions.
 * [OUTPUT]: No early install, explicit version/restart, clean quit handoff and failed update isolation.
 * [POS]: Updater lifecycle regressions; actual Sparkle upgrade is verified separately.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it, vi } from 'vitest'
import type { SparkleBridgeEvent } from 'electron-sparkle-updater'
import { AppUpdates } from '../apps/electron/src/main/app-updates'
const config = { feedUrl: 'https://example.test/appcast.xml', publicKey: Buffer.alloc(32, 3).toString('base64') }
function fixture() {
  let emit = (_event: SparkleBridgeEvent) => {}
  const bridge = { init: vi.fn(() => true), setEventHandler: vi.fn(fn => { emit = fn }), checkForUpdates: vi.fn(), setAutomaticChecks: vi.fn(), installUpdateNow: vi.fn(), installUpdateOnQuit: vi.fn() }
  const changed = vi.fn(), log = vi.fn(), updates = new AppUpdates('0.2.4', changed, log)
  updates.start(bridge, config)
  return { bridge, updates, changed, log, emit: (event: SparkleBridgeEvent) => emit(event) }
}
it('coalesces checks and does not install at 100 percent download or during patch application', () => {
  const { bridge, updates, emit } = fixture()
  updates.check(); updates.check(); expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1)
  emit({ type: 'update-available', version: '0.2.5' })
  emit({ type: 'download-progress', percent: 100 })
  expect(updates.snapshot().phase).toBe('downloading')
  expect(() => updates.requestInstall('0.2.5', vi.fn())).toThrow('尚未准备')
  emit({ type: 'download-progress', phase: 'apply', percent: 50 })
  expect(updates.snapshot().phase).toBe('preparing')
  emit({ type: 'update-downloaded', version: '0.2.5' })
  expect(updates.snapshot().phase).toBe('ready')
  expect(bridge.installUpdateNow).not.toHaveBeenCalled()
  expect(bridge.installUpdateOnQuit).not.toHaveBeenCalled()
  expect(updates.finishQuit()).toBe(false)
  expect(bridge.installUpdateOnQuit).toHaveBeenCalledTimes(1)
})
it('only hands the requested downloaded version to the installer after host cleanup', () => {
  const { bridge, updates, emit } = fixture(), quit = vi.fn()
  emit({ type: 'update-downloaded', version: '0.2.5' })
  expect(() => updates.requestInstall('0.2.6', quit)).toThrow('尚未准备')
  updates.requestInstall('0.2.5', quit); updates.requestInstall('0.2.5', quit)
  expect(quit).toHaveBeenCalledTimes(1); expect(bridge.installUpdateNow).not.toHaveBeenCalled()
  expect(updates.finishQuit()).toBe(true); expect(bridge.installUpdateNow).toHaveBeenCalledTimes(1)
})
it('cancelled unsaved-changes quit does not force a restart on a later ordinary quit', () => {
  const { bridge, updates, emit } = fixture()
  emit({ type: 'update-downloaded', version: '0.2.5' })
  updates.requestInstall('0.2.5', vi.fn()); updates.cancelInstall()
  expect(updates.finishQuit()).toBe(false)
  expect(bridge.installUpdateNow).not.toHaveBeenCalled()
})
it('failed drain cannot install, and failed download can be checked again explicitly', () => {
  const { bridge, updates, emit } = fixture()
  emit({ type: 'update-downloaded', version: '0.2.5' })
  updates.requestInstall('0.2.5', vi.fn()); updates.quitFailed(new Error('worker still alive'))
  expect(bridge.installUpdateNow).not.toHaveBeenCalled(); expect(bridge.installUpdateOnQuit).not.toHaveBeenCalled()
  expect(updates.snapshot().phase).toBe('ready')
  expect(() => updates.requestInstall('0.2.5', vi.fn())).not.toThrow()
  emit({ type: 'error', message: 'bad signature' })
  expect(updates.snapshot()).toMatchObject({ phase: 'error', error: 'bad signature' })
  updates.check(); expect(bridge.checkForUpdates).toHaveBeenCalledTimes(2)
})
it('reports fallback without treating it as successful installation', () => {
  const { updates, emit } = fixture()
  emit({ type: 'download-progress', fallback: true, percent: 0 })
  expect(updates.snapshot()).toMatchObject({ fallback: true, phase: 'downloading', progress: 0 })
  emit({ type: 'download-progress', percent: 35 })
  expect(updates.snapshot().fallback).toBe(true)
})
it('ignores late events once quit has been handed off', () => {
  const { updates, emit } = fixture()
  updates.finishQuit(); const prior = updates.snapshot()
  emit({ type: 'update-downloaded', version: '0.2.5' })
  expect(updates.snapshot()).toEqual(prior)
})
it.each(['http://evil.test/feed', 'https://user:secret@example.test/feed'])('rejects unsafe packaged feeds before native initialization: %s', feedUrl => {
  const init = vi.fn()
  const bridge = { init, setEventHandler: vi.fn() } as never
  const updates = new AppUpdates('0.2.4', vi.fn(), vi.fn())
  updates.start(bridge, { ...config, feedUrl })
  expect(updates.snapshot().phase).toBe('error')
  expect(init).not.toHaveBeenCalled()
})
