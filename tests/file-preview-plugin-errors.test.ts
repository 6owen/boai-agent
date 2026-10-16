// @vitest-environment jsdom
/*
 * [OUTPUT]: 预览失败/超限统一Sonner且无错误正文；实际插件故障/来源失效核验保持。
 * [INPUT]: 实际图片/PDF/Office插件与异步加载器；无效文件、worker不可用及文件超限。
 * [OUTPUT]: 真实异步失败记录有界类别，局部提示保留；隐藏/过期/超限不制造插件故障。
 * [POS]: 预览插件异步故障接线回归；不调用外部服务。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { act, createElement } from 'react'
import { toast } from 'sonner'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FilePreview } from '../src/renderer/components/common/file-preview'
import { pluginUsage, usePlugins } from '../src/renderer/stores/plugins'
import { MAX_OFFICE_PREVIEW_BYTES } from '../src/renderer/components/common/lody/session-file-office-source'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  toast.dismiss()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Worker', undefined)
  usePlugins.setState({ settings: { revision: 0, disabledIds: [] }, ready: true })
  pluginUsage.clearFailure('boai.preview.office')
  pluginUsage.clearFailure('boai.preview.image')
  pluginUsage.clearFailure('boai.preview.pdf')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  toast.dismiss(); host.remove(); pluginUsage.clearFailure('boai.preview.office'); pluginUsage.clearFailure('boai.preview.image'); pluginUsage.clearFailure('boai.preview.pdf')
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})
const render = async (bytes: Uint8Array, active = true, key = 'file', kind: 'docx' | 'pptx' | 'xlsx' = 'docx') => {
  await act(async () => root.render(createElement(FilePreview, { key, name: `private.${kind}`, binary: { kind, bytes }, active })))
}
const waitForText = async (text: string) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    if (toast.getToasts().some(item => 'title' in item && String(item.title).includes(text))) { expect(host.textContent).not.toContain(text); return }
  }
  expect(toast.getToasts().some(item => 'title' in item && String(item.title).includes(text))).toBe(true)
}

test('the real DOCX asynchronous worker failure reaches plugin status without its error or file data', async () => {
  // The production parser requires a browser worker. Its own asynchronous rejection is
  // caught by the document renderer, so a React error boundary cannot observe it.
  await render(new TextEncoder().encode('private document contents'))
  await waitForText('文档预览不可用')
  expect(pluginUsage.snapshot()['boai.preview.office']).toEqual({ views: 1, failure: 'viewer-failed' })
  expect(JSON.stringify(pluginUsage.snapshot())).not.toMatch(/private|Worker|DOCX/)
  await render(new Uint8Array(), false)
  expect(pluginUsage.snapshot()['boai.preview.office']).toEqual({ views: 0, failure: 'viewer-failed' })
})

test('the Office size policy reports its explanation through Sonner without recording a plugin failure', async () => {
  await render(new Uint8Array(MAX_OFFICE_PREVIEW_BYTES + 1))
  await waitForText('25 MB')
  expect(pluginUsage.snapshot()['boai.preview.office']).toEqual({ views: 1 })
})

test('closing a pending Office view cancels activation without recording a failure', async () => {
  const bytes = new TextEncoder().encode('private pending document')
  await render(bytes)
  await render(bytes, false)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)) })
  expect(host.textContent).toBe('')
  expect(pluginUsage.snapshot()['boai.preview.office']).toBeUndefined()
})

test('a started DOCX worker is aborted on source replacement and its late failure stays discarded', async () => {
  const workers: DeferredWorker[] = []
  class DeferredWorker extends EventTarget {
    postMessage = vi.fn()
    terminate = vi.fn()
    constructor() { super(); workers.push(this) }
  }
  vi.stubGlobal('Worker', DeferredWorker)
  await render(new Uint8Array([1, 2, 3]))
  for (let attempt = 0; attempt < 150 && !workers.length; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  expect(workers).toHaveLength(1)
  expect(workers[0].postMessage).toHaveBeenCalledOnce()
  await act(async () => root.render(createElement(FilePreview, { key: 'other-source', name: 'other.txt', file: { kind: 'text', text: 'current source' } })))
  expect(workers[0].terminate).toHaveBeenCalledOnce()
  await act(async () => workers[0].dispatchEvent(new ErrorEvent('error', { message: 'late private error' })))
  expect(host.textContent).toContain('current source')
  expect(pluginUsage.snapshot()['boai.preview.office']).toBeUndefined()
})

test.each(['pptx', 'xlsx'] as const)('the real %s viewer reports asynchronous load failure through its own Sonner error feedback', async kind => {
  await render(new TextEncoder().encode('invalid Office file'), true, 'file', kind)
  await waitForText('文档预览不可用')
  expect(pluginUsage.snapshot()['boai.preview.office']).toEqual({ views: 1, failure: 'viewer-failed' })
})

test('the real PDF parser reports rejected bytes while reporting through Sonner', async () => {
  // jsdom supplies no geometry/canvas; a rejected document never reaches drawing.
  vi.stubGlobal('DOMMatrix', class {})
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  await act(async () => root.render(createElement(FilePreview, { name: 'private.pdf', binary: { kind: 'pdf', bytes: new TextEncoder().encode('invalid pdf') } })))
  await waitForText('PDF 预览不可用')
  expect(pluginUsage.snapshot()['boai.preview.pdf']).toEqual({ views: 1, failure: 'viewer-failed' })
})

test('an image load error is reported but missing, replaced and hidden images do not report', async () => {
  const renderImage = async (url?: string, active = true) => {
    await act(async () => root.render(createElement(FilePreview, { name: 'private.png', image: { url }, active })))
  }
  await renderImage()
  expect(pluginUsage.snapshot()['boai.preview.image']).toEqual({ views: 1 })
  await renderImage('data:image/png;base64,old')
  const oldImage = host.querySelector('img')!
  await renderImage('data:image/png;base64,new')
  await act(async () => oldImage.dispatchEvent(new Event('error')))
  expect(pluginUsage.snapshot()['boai.preview.image']).toEqual({ views: 1 })
  const currentImage = host.querySelector('img')!
  await act(async () => currentImage.dispatchEvent(new Event('error')))
  expect(toast.getToasts().some(item => 'title' in item && String(item.title).includes('图片预览暂不可用'))).toBe(true)
  expect(host.textContent).not.toContain('图片预览暂不可用')
  expect(pluginUsage.snapshot()['boai.preview.image']).toEqual({ views: 1, failure: 'viewer-failed' })
  pluginUsage.clearFailure('boai.preview.image')
  await renderImage('data:image/png;base64,pending')
  const pendingImage = host.querySelector('img')!
  await renderImage(undefined, false)
  await act(async () => pendingImage.dispatchEvent(new Event('error')))
  expect(pluginUsage.snapshot()['boai.preview.image']).toBeUndefined()
})
