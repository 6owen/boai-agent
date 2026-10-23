// @vitest-environment jsdom
/*
 * [INPUT]: 生产PDF预览、真实pdfjs查看器和有效PDF样本；观察DOM监听器及原生observer生命周期。
 * [OUTPUT]: 正常阅读/换源/失败关闭释放真实监听器/observer；无效PDF沿Sonner报告且不生成内联错误。
 * [POS]: PDF查看器资源回归；jsdom不测实际画布或长期RSS。
 * [PROTOCOL]: 变化同步Header及tests/lody/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { createSamplePdf } from './office-viewer-files'

type Observed = { targets: Set<Node>; disconnect(): void }
let host: HTMLDivElement, root: Root
let Preview: typeof import('../../src/renderer/components/common/lody/session-file-pdf-preview')['SessionFilePdfPreview']
let observers: Observed[], listeners: { type: string; listener: EventListenerOrEventListenerObject; signal?: AbortSignal }[]
const activeObservers = () => observers.filter(value => value.targets.size).length
const liveDocumentListeners = () => listeners.filter(value => !value.signal?.aborted)

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  toast.dismiss()
  vi.stubGlobal('DOMMatrix', class {})
  // Run pdfjs's real worker parser in its supported in-process test fallback.
  // jsdom cannot load Vite's emitted worker URL as a browser worker.
  const workerModule = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  vi.stubGlobal('pdfjsWorker', await import(workerModule))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  observers = []; listeners = []
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Node>()
    constructor() { observers.push(this) }
    observe(target: Element) { this.targets.add(target) }
    unobserve(target: Element) { this.targets.delete(target) }
    disconnect() { this.targets.clear() }
  })
  const NativeMutationObserver = MutationObserver
  vi.stubGlobal('MutationObserver', class extends NativeMutationObserver {
    targets = new Set<Node>()
    constructor(callback: MutationCallback) { super(callback); observers.push(this) }
    override observe(target: Node, options?: MutationObserverInit) { super.observe(target, options); this.targets.add(target) }
    override disconnect() { super.disconnect(); this.targets.clear() }
  })
  const add = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'copy' || type === 'visibilitychange') listeners.push({ type, listener, signal: typeof options === 'object' ? options.signal : undefined })
    add(type, listener, options)
  })
  Preview = (await import('../../src/renderer/components/common/lody/session-file-pdf-preview')).SessionFilePdfPreview
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  // Isolate a failing regression too: the assertions above must pass before this test-only sweep.
  for (const observer of observers) observer.disconnect()
  for (const { type, listener } of listeners) document.removeEventListener(type, listener)
  toast.dismiss(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
const render = async (bytes?: Uint8Array) => {
  await act(async () => root.render(bytes ? createElement(Preview, { bytes }) : null))
}
const waitForLoaded = async () => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (host.querySelectorAll('.pdfViewer .page').length === 4 && liveDocumentListeners().some(value => value.type === 'copy')) break
    await tick()
  }
  expect(host.querySelectorAll('.pdfViewer .page')).toHaveLength(4)
  expect(liveDocumentListeners().filter(value => value.type === 'copy')).toHaveLength(1)
}

test('real PDF reading and source replacement release document listeners and observers on every close', async () => {
  for (let run = 0; run < 3; run++) {
    await render(createSamplePdf())
    await waitForLoaded()
    expect(activeObservers()).toBeGreaterThan(0)
    // Change bytes without unmounting the React view, then close the current source.
    await render(createSamplePdf())
    await waitForLoaded()
    await render()
    await tick()
    expect(liveDocumentListeners()).toHaveLength(0)
    expect(activeObservers()).toBe(0)
  }
})

test('a rejected PDF and a view closed during loading do not leave observers attached', async () => {
  await render(new TextEncoder().encode('invalid PDF'))
  const failed = () => toast.getToasts().some(item => 'title' in item && String(item.title).includes('PDF 预览不可用'))
  for (let attempt = 0; attempt < 150 && !failed(); attempt++) await tick()
  expect(failed()).toBe(true); expect(host.textContent).not.toContain('PDF 预览不可用')
  await render(); await tick()
  expect(activeObservers()).toBe(0)
  await render(createSamplePdf())
  await render(); await tick()
  expect(liveDocumentListeners()).toHaveLength(0)
  expect(activeObservers()).toBe(0)
})
