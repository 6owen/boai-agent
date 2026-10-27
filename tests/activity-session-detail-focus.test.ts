// @vitest-environment jsdom
/*
 * [INPUT]: Real activity detail, Dialog/Resizable/ScrollArea primitives and a delayed read-only reply.
 * [OUTPUT]: Opening/reopening focuses the title during loading and keeps it after records arrive; no Electron/E2E.
 * [POS]: Dialog autofocus regression; no CSS geometry or screenshot acceptance.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { ActivitySession, ActivitySessionPage } from '../packages/shared/src/domain/desktop-activity'
import { RecentActivityRow } from '../apps/electron/src/renderer/pages/settings/activity-session-detail'

let host: HTMLDivElement, root: Root
const animationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals()
  if (animationsDescriptor) Object.defineProperty(Element.prototype, 'getAnimations', animationsDescriptor)
  else Reflect.deleteProperty(Element.prototype, 'getAnimations')
})
async function nextFrame() { await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))) }

it('focuses the title on every opening, before and after the observation list loads', async () => {
  const session: ActivitySession = { id: 'session', from: '2026-10-26T08:00:00Z', to: '2026-10-26T08:10:00Z', apps: ['Editor'], sampleCount: 1, screenshotCount: 0, keypresses: 0, clicks: 0, active: false }
  const page: ActivitySessionPage = { session, revision: 'v1', samples: [{ id: 'sample', title: '窗口', app: 'Editor', bundleId: 'example.editor', capturedAt: session.from, text: '原文', hash: 'sample' }], total: 1, nextOffset: null, analyses: [], analysisTotal: 0, nextAnalysisOffset: null }
  let resolve!: (value: unknown) => void
  const request = vi.fn(() => new Promise(done => { resolve = done }))
  const api = { request } as unknown as DesktopApi
  await act(async () => root.render(createElement(RecentActivityRow, { api, active: true, session })))
  const trigger = host.querySelector<HTMLButtonElement>('button')!
  for (let opening = 0; opening < 2; opening++) {
    await act(async () => trigger.click())
    await nextFrame()
    const dialog = document.querySelector('[role="dialog"]')!
    const title = dialog.querySelector('[data-slot="dialog-title"]')!
    expect(document.activeElement).toBe(title)
    expect(dialog.querySelector('[data-slot="resizable-handle"]')?.getAttribute('data-separator')).not.toBe('focus')
    await act(async () => resolve({ status: 'succeeded', data: page }))
    expect(document.activeElement).toBe(title)
    expect(dialog.textContent).toContain('原文')
    const detail = dialog.querySelector('[aria-label="活动详情"]')!
    const viewport = detail.querySelector('[data-slot="scroll-area-viewport"]')!
    expect(viewport.classList.contains('scroll-fade-t')).toBe(true)
    await act(async () => dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click())
    await nextFrame()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  }
  expect(request).toHaveBeenCalledTimes(2)
})
