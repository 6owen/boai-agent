// @vitest-environment jsdom
/*
 * [INPUT]: Real recent-activity component, controlled read-only replies and lightweight UI primitive adapters.
 * [OUTPUT]: On-demand selection/paging, actual OCR card collapse/reopen and late-result isolation through default close; resizable primitives are adapted, no Electron/E2E.
 * [POS]: Activity detail interaction regression, not visual acceptance.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { ActivitySample, ActivitySession, ActivitySessionPage } from '../packages/shared/src/domain/desktop-activity'
import { RecentActivityRow } from '../apps/electron/src/renderer/pages/settings/activity-session-detail'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))
vi.mock('@/components/ui/dialog', async () => {
  const R = await import('react')
  const context = R.createContext({ open: false, onOpenChange: (_open: boolean) => {} })
  const Box = ({ children }: { children?: ReactNode }) => R.createElement('div', null, children)
  return {
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange(open: boolean): void; children?: ReactNode }) => R.createElement(context.Provider, { value: { open, onOpenChange } }, children),
    DialogTrigger: ({ render }: { render: React.ReactElement<{ onClick?(): void }> }) => { const state = R.useContext(context); return R.cloneElement(render, { onClick: () => state.onOpenChange(true) }) },
    DialogContent: ({ children, showCloseButton = true }: { children?: ReactNode; showCloseButton?: boolean }) => {
      const state = R.useContext(context)
      return state.open ? R.createElement('div', { role: 'dialog' }, children, showCloseButton && R.createElement('button', { onClick: () => state.onOpenChange(false) }, 'Close')) : null
    },
    DialogHeader: Box, DialogTitle: Box, DialogDescription: Box,
  }
})
vi.mock('@/components/ui/button', () => ({ Button: ({ children, onClick, disabled }: { children?: ReactNode; onClick?(): void; disabled?: boolean }) => createElement('button', { onClick, disabled }, children) }))
vi.mock('@/components/ui/item', () => ({ ListRow: ({ label, selected, onClick }: { label: string; selected?: boolean; onClick?(): void }) => createElement('button', { onClick, 'aria-pressed': selected }, label) }))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children?: ReactNode }) => createElement('div', null, children) }))
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ResizablePanel: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ResizableHandle: () => createElement('div', { role: 'separator' }),
}))

const session: ActivitySession = { id: 'session', from: '2026-10-26T08:00:00Z', to: '2026-10-26T08:10:00Z', apps: ['Editor'], sampleCount: 3, screenshotCount: 1, keypresses: 12, clicks: 4, active: false }
const sample = (id: string): ActivitySample => ({ id, title: `窗口 ${id}`, app: 'Editor', bundleId: 'example.editor', capturedAt: session.from, text: `原文 ${id}`, hash: id, screenshot: { bytes: 10 } })
const page = (ids = ['a', 'b'], revision = 'v1', nextOffset: number | null = 20): ActivitySessionPage => ({ session, revision, samples: ids.map(sample), total: 3, nextOffset, analyses: [], analysisTotal: 0, nextAnalysisOffset: null })
function apiFor(read: (operation: string, input: Record<string, unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (_method: string, { operation, input }: { operation: string; input: Record<string, unknown> }) => ({ status: 'succeeded', data: await read(operation, input) }))
  return { request, api: { request } as unknown as DesktopApi }
}
let host: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function render(api: DesktopApi, active = true) { await act(async () => root.render(createElement(RecentActivityRow, { api, active, session }))) }
async function click(label: string) { const button = [...host.querySelectorAll('button')].find(item => item.textContent === label); expect(button, label).toBeTruthy(); await act(async () => button!.click()) }
const detail = () => host.querySelector('[aria-label="所选观察详情"]')

it('reads only on opening, selects details locally and retains selection when loading another page', async () => {
  const h = apiFor((_operation, input) => input.offset ? page(['c'], 'v1', null) : page())
  await render(h.api); expect(h.request).not.toHaveBeenCalled()
  await click('Editor'); expect(detail()?.textContent).toContain('原文 a')
  await click('识别文字'); expect(detail()?.textContent).not.toContain('原文 a')
  await click('识别文字'); expect(detail()?.textContent).toContain('原文 a')
  expect(h.request).toHaveBeenCalledTimes(1)
  await click('窗口 b'); expect(detail()?.textContent).toContain('原文 b'); expect(detail()?.textContent).not.toContain('原文 a')
  expect(h.request).toHaveBeenCalledTimes(1)
  await click('加载更多观察'); expect(detail()?.textContent).toContain('原文 b')
  await click('窗口 c'); expect(detail()?.textContent).toContain('原文 c')
  expect(h.request.mock.calls.every(([, input]) => input.operation === 'activity.session.sources')).toBe(true)
})

it('discards the previous screenshot after selecting a different observation', async () => {
  let resolve!: (value: unknown) => void
  const h = apiFor(operation => operation === 'activity.screenshot' ? new Promise(done => { resolve = done }) : page())
  await render(h.api); await click('Editor'); await click('查看截图'); await click('窗口 b')
  await act(async () => resolve({ url: 'data:image/png;base64,old' }))
  expect(detail()?.textContent).toContain('原文 b'); expect(detail()?.querySelector('img')).toBeNull()
  expect(toast.error).not.toHaveBeenCalled()
})

it('drops pending detail and screenshot results after closing or hiding the settings page', async () => {
  let resolve!: (value: unknown) => void
  const h = apiFor(() => new Promise(done => { resolve = done }))
  await render(h.api); await click('Editor'); await click('Close')
  await act(async () => resolve(page()))
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  h.request.mockImplementation(async (_method, input) => ({ status: 'succeeded', data: input.operation === 'activity.screenshot' ? await new Promise((_done, reject) => { resolve = () => reject(new Error('late screenshot failure')) }) : page() }))
  await click('Editor'); await click('查看截图'); await render(h.api, false)
  await act(async () => resolve(undefined))
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(toast.error).not.toHaveBeenCalled()
})

it('replaces old records when a page reports a different source revision', async () => {
  let reads = 0
  const h = apiFor(() => ++reads === 1 ? page() : page(['d'], 'v2', null))
  await render(h.api); await click('Editor'); await click('窗口 b'); await click('加载更多观察')
  expect(h.request).toHaveBeenCalledTimes(3)
  expect(detail()?.textContent).toContain('原文 d'); expect(host.textContent).not.toContain('窗口 b')
  expect(toast.info).toHaveBeenCalledOnce()
})
