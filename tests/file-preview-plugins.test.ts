// @vitest-environment jsdom
/*
 * [INPUT]: 生产FilePreview/插件宿主与注册表，受控只读测试provider及真实React生命周期。
 * [OUTPUT]: 注册扩展、可信格式/兼容/禁用、稳定阅读、多视图、失败与迟到加载隔离回归。
 * [OUTPUT]: 统一插件配置不替换当前provider，真实视图租约随隐藏释放且错误可观测。
 * [POS]: 内置预览插件合同验证；原文件业务链路沿Electron BDD。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { act, createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FilePreview } from '../src/renderer/components/common/file-preview'
import { createPreviewRegistry } from '../src/renderer/components/common/file-preview/plugins/registry'
import type { PreviewPlugin, PreviewRendererProps } from '../src/renderer/components/common/file-preview/plugins/types'
import { pluginUsage, usePlugins } from '../src/renderer/stores/plugins'

const manifest = (id: string) => ({ id, version: '1.0.0', apiVersion: 1, kinds: ['text'] as const })
const plain: PreviewPlugin = { manifest: manifest('general'), component: ({ content }) => createElement('p', null, 'text' in content ? content.text : '') }
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); usePlugins.setState({ settings: { revision: 0, disabledIds: [] } }); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = async (props: Parameters<typeof FilePreview>[0]) => { await act(async () => root.render(createElement(FilePreview, props))) }

test('an added suffix provider reaches the shared preview without changing either business tab', async () => {
  const custom: PreviewPlugin = { manifest: { ...manifest('custom'), extensions: ['note'] }, component: ({ content, header }) => createElement('section', null, header(), createElement('article', null, 'text' in content ? `Note: ${content.text}` : '')) }
  await render({ name: 'new.NOTE', file: { kind: 'text', text: 'verified original' }, registry: createPreviewRegistry([plain, custom]) })
  expect(host.querySelector('article')?.textContent).toBe('Note: verified original')
  expect(host.textContent).toContain('new.NOTE')
  expect(host.querySelector('[data-preview-plugin]')?.getAttribute('data-preview-plugin')).toBe('custom')
})

test('exact suffix wins and tied providers resolve independently of registration order', () => {
  const a: PreviewPlugin = { ...plain, manifest: { ...manifest('a'), extensions: ['NOTE'] } }
  const z: PreviewPlugin = { ...plain, manifest: { ...manifest('z'), extensions: ['note'] } }
  for (const plugins of [[plain, z, a], [a, plain, z]]) {
    const registry = createPreviewRegistry(plugins)
    expect(registry.select('new.note', 'text')?.manifest.id).toBe('a')
    expect(registry.select('no-extension', 'text')?.manifest.id).toBe('general')
    expect(registry.select('new.note', 'pdf')).toBeUndefined()
    expect(registry.select('new.note', 'unsupported')).toBeUndefined()
  }
})

test('registry rejects ambiguous identity and snapshots mutable declarations and disable lists', () => {
  expect(() => createPreviewRegistry([plain, plain])).toThrow('duplicate')
  const extensions = ['note'], disabled = new Set<string>()
  const source: PreviewPlugin = { ...plain, manifest: { ...manifest('snapshot'), extensions } }
  const registry = createPreviewRegistry([source], disabled)
  extensions[0] = 'other'; disabled.add('snapshot')
  expect(registry.select('new.note', 'text')?.manifest.id).toBe('snapshot')
  expect(registry.select('new.other', 'text')).toBeUndefined()
})

test('incompatible and disabled providers never activate and retain distinct diagnostics', async () => {
  const load = vi.fn(async () => ({ default: plain.component! }))
  const registry = createPreviewRegistry([
    { manifest: { ...manifest('future'), apiVersion: 2 }, load },
    { manifest: manifest('disabled'), load },
  ], new Set(['disabled']))
  expect(registry.diagnostics).toEqual([{ id: 'future', reason: 'incompatible' }, { id: 'disabled', reason: 'disabled' }])
  await render({ name: 'file.txt', file: { kind: 'text', text: 'private' }, registry })
  expect(load).not.toHaveBeenCalled()
  expect(host.textContent).toContain('此格式的预览暂不可用')
  expect(host.textContent).not.toContain('private')
})

test('unsupported host content cannot be reinterpreted by a filename match', async () => {
  const component = vi.fn(plain.component!)
  await render({ name: 'file.note', file: { kind: 'unsupported', text: '', reason: '文件超出预览限制' }, registry: createPreviewRegistry([{ manifest: { ...manifest('custom'), extensions: ['note'] }, component }]) })
  expect(component).not.toHaveBeenCalled()
  expect(host.textContent).toContain('文件超出预览限制')
})

test('lazy code activates only for a visible matching document', async () => {
  const load = vi.fn(async () => ({ default: plain.component! }))
  const registry = createPreviewRegistry([{ manifest: manifest('lazy'), load }])
  await render({ name: 'hidden.txt', active: false, file: { kind: 'text', text: 'hidden' }, registry })
  await render({ name: 'image.png', image: {}, registry })
  expect(load).not.toHaveBeenCalled()
  await render({ name: 'file.txt', file: { kind: 'text', text: 'visible' }, registry })
  expect(load).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('visible')
})

test('progress rerenders keep the same viewer, bytes and local reading state; hiding disposes it', async () => {
  const mounted = vi.fn(), disposed = vi.fn(), seen: unknown[] = []
  const component = ({ content }: PreviewRendererProps) => {
    seen.push('bytes' in content ? content.bytes : null)
    const [page, setPage] = useState(1)
    useEffect(() => { mounted(); return () => { disposed() } }, [])
    return createElement('button', { onClick: () => setPage(page + 1) }, `Page ${page}`)
  }
  const registry = createPreviewRegistry([{ manifest: { ...manifest('pdf'), kinds: ['pdf'] }, component }])
  const binary = { kind: 'pdf' as const, bytes: new Uint8Array([1, 2, 3]) }
  const props = { name: 'report.pdf', binary, registry }
  await render(props)
  const button = host.querySelector('button')!
  await act(async () => button.click())
  await render({ ...props })
  expect(host.querySelector('button')).toBe(button)
  expect(button.textContent).toBe('Page 2')
  expect(mounted).toHaveBeenCalledTimes(1)
  expect(seen.every(bytes => bytes === binary.bytes)).toBe(true)
  await render({ ...props, active: false })
  expect(disposed).toHaveBeenCalledTimes(1)
  expect(host.textContent).toBe('')
})

test('provider replacement or disabling applies on reopen, never during current reading', async () => {
  const enabled = createPreviewRegistry([plain]), disabled = createPreviewRegistry([plain], new Set(['general']))
  const props = { name: 'report.txt', file: { kind: 'text' as const, text: 'original' } }
  await render({ ...props, registry: enabled })
  const body = host.querySelector('p')
  await render({ ...props, registry: disabled })
  expect(host.querySelector('p')).toBe(body)
  expect(host.textContent).toContain('original')
  await render({ ...props, registry: disabled, active: false })
  await render({ ...props, registry: disabled })
  expect(host.textContent).not.toContain('original')
  expect(host.textContent).toContain('此格式的预览暂不可用')
})

test('same-name views keep independent state and source replacement gets a fresh view', async () => {
  const component = ({ content }: PreviewRendererProps) => {
    const [page, setPage] = useState(1)
    return createElement('button', { onClick: () => setPage(page + 1) }, `${'text' in content ? content.text : ''}:${page}`)
  }
  const registry = createPreviewRegistry([{ manifest: manifest('reader'), component }])
  const view = (id: string, text: string) => createElement(FilePreview, { key: id, name: 'same.txt', file: { kind: 'text', text }, registry })
  await act(async () => root.render(createElement('div', null, view('source-a:v1:hash', 'A'), view('source-b:v1:hash', 'B'))))
  await act(async () => host.querySelector('button')!.click())
  expect([...host.querySelectorAll('button')].map(value => value.textContent)).toEqual(['A:2', 'B:1'])
  await act(async () => root.render(createElement('div', null, view('source-a:v2:new-hash', 'A2'), view('source-b:v1:hash', 'B'))))
  expect([...host.querySelectorAll('button')].map(value => value.textContent)).toEqual(['A2:1', 'B:1'])
})

test.each(['load', 'render'])('a %s failure keeps host actions and leaves another preview usable', async phase => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const crash = () => { throw new Error('private internal failure') }
  const bad: PreviewPlugin = phase === 'load' ? { manifest: manifest('bad'), load: async () => { throw new Error('load failed') } } : { manifest: manifest('bad'), component: crash }
  const good = createElement(FilePreview, { name: 'good.txt', file: { kind: 'text', text: 'healthy' }, registry: createPreviewRegistry([plain]) })
  await act(async () => root.render(createElement('div', null,
    createElement(FilePreview, { name: 'bad.txt', file: { kind: 'text', text: 'private' }, registry: createPreviewRegistry([bad]), header: () => createElement('button', null, '宿主文件操作') }), good)))
  expect(host.querySelector('[data-preview-plugin-error]')?.textContent).toContain('文件预览暂不可用')
  expect(host.querySelector('button')?.textContent).toBe('宿主文件操作')
  expect(host.textContent).toContain('healthy')
  expect(host.textContent).not.toContain('private')
})

test('a late module load cannot restore hidden content; reopening uses only current content', async () => {
  let resolve!: (value: { default: NonNullable<typeof plain.component> }) => void
  const pending = new Promise<{ default: NonNullable<typeof plain.component> }>(done => { resolve = done })
  const mounted = vi.fn()
  const component = ({ content }: PreviewRendererProps) => { mounted(); return createElement('p', null, 'text' in content ? content.text : '') }
  const registry = createPreviewRegistry([{ manifest: manifest('lazy'), load: () => pending }])
  await render({ name: 'same.txt', file: { kind: 'text', text: 'old secret' }, registry })
  await render({ name: 'same.txt', active: false, registry })
  await act(async () => resolve({ default: component }))
  expect(mounted).not.toHaveBeenCalled()
  expect(host.textContent).toBe('')
  await render({ name: 'same.txt', file: { kind: 'text', text: 'new source' }, registry })
  expect(host.querySelector('p')?.textContent).toBe('new source')
})

test('lazy completion preserves the host header node and its open interaction state', async () => {
  let resolve!: (value: { default: NonNullable<typeof plain.component> }) => void
  const pending = new Promise<{ default: NonNullable<typeof plain.component> }>(done => { resolve = done })
  const registry = createPreviewRegistry([{ manifest: manifest('lazy'), load: () => pending }])
  const Header = () => { const [open, setOpen] = useState(false); return createElement('button', { onClick: () => setOpen(!open) }, open ? '文件记录已打开' : '文件记录') }
  await render({ name: 'file.txt', file: { kind: 'text', text: 'loaded' }, registry, header: () => createElement(Header) })
  const header = host.querySelector('button')!
  await act(async () => header.click())
  await act(async () => resolve({ default: plain.component! }))
  expect(host.querySelector('button')).toBe(header)
  expect(header.textContent).toBe('文件记录已打开')
  expect(host.querySelector('p')?.textContent).toBe('loaded')
  expect(() => createPreviewRegistry([{ manifest: manifest('invalid'), ownsHeader: true, load: async () => ({ default: plain.component! }) }])).toThrow('host header')
})

test('application settings pin a live built-in view and release its actual lease on hiding', async () => {
  const props = { name: 'report.txt', file: { kind: 'text' as const, text: 'fixed source' } }
  await render(props)
  const body = host.querySelector('[data-preview-plugin="boai.preview.text"]')
  expect(body).not.toBeNull()
  expect(pluginUsage.snapshot()['boai.preview.text'].views).toBe(1)
  await act(async () => usePlugins.setState({ settings: { revision: 1, disabledIds: ['boai.preview.text'] } }))
  expect(host.querySelector('[data-preview-plugin="boai.preview.text"]')).toBe(body)
  expect(pluginUsage.snapshot()['boai.preview.text'].views).toBe(1)
  await render({ ...props, active: false })
  expect(pluginUsage.snapshot()['boai.preview.text']).toBeUndefined()
  await render(props)
  expect(host.textContent).toContain('此格式的预览暂不可用')
  expect(host.textContent).not.toContain('fixed source')
  await act(async () => usePlugins.setState({ settings: { revision: 2, disabledIds: [] } }))
  await render({ ...props, active: false }); await render(props)
  expect(host.textContent).toContain('fixed source')
  expect(pluginUsage.snapshot()['boai.preview.text'].views).toBe(1)
})

test('render failure records only its plugin id and releases the view once on close', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const dispose = vi.fn(), open = vi.fn(() => dispose), error = vi.fn()
  const registry = createPreviewRegistry([{ manifest: manifest('bad'), component: () => { throw new Error('secret') } }], new Set(), { open, error })
  await render({ name: 'private.txt', file: { kind: 'text', text: 'private' }, registry })
  expect(open).toHaveBeenCalledExactlyOnceWith('bad')
  expect(error).toHaveBeenCalledExactlyOnceWith('bad')
  await render({ name: 'private.txt', active: false, registry })
  expect(dispose).toHaveBeenCalledTimes(1)
})
