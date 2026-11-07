// @vitest-environment jsdom
/*
 * [INPUT]: Controlled SDK export results, required font faces and DOM SVG parsing.
 * [OUTPUT]: Export rejects swallowed font failures and implicit whole-board .tldr selection requests.
 * [POS]: Canvas font failure regression; real local font bytes are checked in hidden Electron acceptance.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { executeCanvas } from '../packages/canvas-plugin/src/executor'
import type { CanvasDocument } from '../packages/canvas-plugin/src/protocol'

const mocks = vi.hoisted(() => ({ rasterize: vi.fn() }))
vi.mock('../packages/canvas-plugin/node_modules/tldraw/dist-esm/index.mjs', () => ({
  getSnapshot: (store: unknown) => ({ document: store }),
  loadSnapshot: () => {},
  getSvgAsImage: mocks.rasterize,
}))
const document: CanvasDocument = { schema: {}, store: {} }
const face = { family: 'tldraw_draw', weight: 'normal', src: { url: 'tldraw_draw', format: 'woff2' } }
const css = '@font-face {font-family:"tldraw_draw";src:url("data:font/woff2;base64,d09GMg==");font-weight:normal;}'
const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>${css}</style></defs><text>Start</text></svg>`
const request = { action: 'export' as const, document, format: 'png' as const }
function setup(options: { status?: string; svg?: string; embeddingFails?: boolean } = {}) {
  const shape = { id: 'shape:group', type: 'group' }
  const editor = {
    store: document,
    getShape: () => shape,
    getCurrentPageShapeIds: () => new Set(['shape:group']),
    getShapeAndDescendantIds: () => new Set(['shape:group', 'shape:text']),
    getShapePageBounds: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    getContainer: () => ({ ownerDocument: { fonts: [{ ...face, style: 'normal', status: options.status ?? 'loaded' }] } }),
    fonts: {
      getShapeFontFaces: (id: string) => id === 'shape:text' ? [face] : [],
      ensureFontIsLoaded: vi.fn(async () => {}),
      toEmbeddedCssDeclaration: vi.fn(async () => { if (options.embeddingFails) throw new Error('unreadable local asset'); return css }),
    },
    toImage: vi.fn(async () => ({ blob: { text: async () => options.svg ?? svg }, width: 164, height: 164 })),
  }
  return { editor, execute: () => executeCanvas(editor as unknown as Parameters<typeof executeCanvas>[0], request) }
}
beforeEach(() => {
  mocks.rasterize.mockReset()
  mocks.rasterize.mockResolvedValue(new Blob(['PNG'], { type: 'image/png' }))
})
it('rejects an SDK-resolved font load whose actual FontFace is in the error state', async () => {
  const { execute, editor } = setup({ status: 'error' })
  await expect(execute()).rejects.toMatchObject({ code: 'RENDER_FAILED' })
  expect(editor.toImage).not.toHaveBeenCalled()
  expect(mocks.rasterize).not.toHaveBeenCalled()
})
it('rejects unreadable font bytes before exporting fallback text', async () => {
  const { execute, editor } = setup({ embeddingFails: true })
  await expect(execute()).rejects.toMatchObject({ code: 'RENDER_FAILED' })
  expect(editor.toImage).not.toHaveBeenCalled()
})
it('rejects an SDK SVG that omits the required embedded font, including a selected group child', async () => {
  const { execute } = setup({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><defs/><text>Start</text></svg>' })
  await expect(execute()).rejects.toMatchObject({ code: 'RENDER_FAILED' })
  expect(mocks.rasterize).not.toHaveBeenCalled()
})
it('rasterizes exactly the verified SVG and returns its image bytes', async () => {
  const { execute } = setup()
  expect(await execute()).toEqual({ format: 'png', base64: btoa('PNG') })
  expect(mocks.rasterize).toHaveBeenCalledWith(svg, { type: 'png', width: 164, height: 164, pixelRatio: 1 })
})

it('rejects direct renderer tldr requests with a page or selection instead of silently serializing the whole board', async () => {
  for (const selection of [{ pageId: 'page:page' }, { shapeIds: ['shape:selection'] }]) {
    await expect(executeCanvas({} as Parameters<typeof executeCanvas>[0], { action: 'export', document, format: 'tldr', ...selection })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT', message: expect.stringContaining('整份画板') })
  }
  expect(mocks.rasterize).not.toHaveBeenCalled()
})
