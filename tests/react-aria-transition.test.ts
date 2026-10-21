// @vitest-environment jsdom
/*
 * [INPUT]: Installed React Aria ESM/CommonJS transition utility, bundled unchanged into isolated jsdom windows.
 * [OUTPUT]: Multiple cancelled properties and detached/bubbling targets must finish queued work and release direct listeners; normal completion/cancellation stays intact.
 * [POS]: Regression for the actual global transition map retaining unloaded settings DOM; Electron resource thresholds remain separately authoritative.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type TransitionUtility = { runAfterTransition(callback: (transitioned: boolean) => void): () => void }
const require = createRequire(import.meta.url)
const bundles = new Map<string, string>()
const windows: HTMLIFrameElement[] = []
beforeAll(async () => {
  for (const format of ['esm', 'cjs']) {
    const result = await build({
      stdin: {
        contents: format === 'esm'
          ? "export { runAfterTransition } from 'react-aria/private/utils/runAfterTransition'"
          : "exports.runAfterTransition = require('react-aria/private/utils/runAfterTransition').runAfterTransition",
        resolveDir: dirname(require.resolve('react-aria-components')),
      },
      bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'TransitionUtility',
    })
    bundles.set(format, result.outputFiles[0].text)
  }
})
afterEach(() => { for (const frame of windows.splice(0)) { frame.contentWindow?.close(); frame.remove() }; vi.restoreAllMocks() })

function setup(format: string) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe); windows.push(iframe)
  const window = iframe.contentWindow! as Window & typeof globalThis
  let nextFrame = 0
  const frames = new Map<number, FrameRequestCallback>()
  window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame }
  window.cancelAnimationFrame = id => { frames.delete(id) }
  window.eval(bundles.get(format)!)
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
  const utility = Reflect.get(window, 'TransitionUtility') as TransitionUtility
  const target = window.document.createElement('div')
  window.document.body.append(target)
  const event = (node: Element, type: string, property: string) => {
    const value = new window.Event(type, { bubbles: true })
    Object.defineProperty(value, 'propertyName', { value: property })
    node.dispatchEvent(value)
  }
  const frame = () => { const queued = [...frames]; frames.clear(); for (const [, callback] of queued) callback(0) }
  return { ...utility, target, window, event, frame }
}

describe.each(['esm', 'cjs'])('actual React Aria %s transition lifecycle', format => {
  it.each([false, true])('handles every cancelled property when detached=%s', detached => {
    const { target, event, frame, runAfterTransition } = setup(format)
    const remove = vi.spyOn(target, 'removeEventListener'), callback = vi.fn()
    event(target, 'transitionrun', 'background-color')
    event(target, 'transitionrun', 'box-shadow')
    runAfterTransition(callback); frame()
    expect(callback).not.toHaveBeenCalled()
    if (detached) target.remove()
    event(target, 'transitioncancel', 'background-color')
    expect(callback).not.toHaveBeenCalled()
    event(target, 'transitioncancel', 'box-shadow')
    expect(callback).toHaveBeenCalledExactlyOnceWith(true)
    expect(remove).toHaveBeenCalledWith('transitioncancel', expect.any(Function))
    event(target, 'transitioncancel', 'box-shadow')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not consume the parent listener when a child cancellation bubbles', () => {
    const { target, window, event, frame, runAfterTransition } = setup(format)
    const child = window.document.createElement('span'); target.append(child)
    const callback = vi.fn()
    event(target, 'transitionrun', 'opacity')
    event(child, 'transitionrun', 'transform')
    runAfterTransition(callback); frame()
    event(child, 'transitioncancel', 'transform')
    expect(callback).not.toHaveBeenCalled()
    target.remove()
    event(target, 'transitioncancel', 'opacity')
    expect(callback).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('keeps normal completion and explicit callback cancellation', () => {
    const { target, event, frame, runAfterTransition } = setup(format)
    const remove = vi.spyOn(target, 'removeEventListener'), cancelled = vi.fn(), completed = vi.fn()
    event(target, 'transitionrun', 'opacity')
    const cancel = runAfterTransition(cancelled)
    runAfterTransition(completed); frame(); cancel()
    event(target, 'transitionend', 'opacity')
    expect(completed).toHaveBeenCalledExactlyOnceWith(true)
    expect(cancelled).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('transitioncancel', expect.any(Function))
    const idle = vi.fn(); runAfterTransition(idle); frame()
    expect(idle).toHaveBeenCalledExactlyOnceWith(false)
  })
})
