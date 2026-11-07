/*
 * [INPUT]: Validated canvas commands and a private tldraw Editor using local static assets.
 * [OUTPUT]: Bounded edits, whole-board .tldr interchange and PNG/SVG with verified local font embedding.
 * [POS]: Browser-only SDK execution; never evaluates document text or caller JavaScript.
 * [PROTOCOL]: Update Header and src/.folder.md when this file changes.
 */
import { getSnapshot, getSvgAsImage, loadSnapshot, parseTldrawJsonFile, serializeTldrawJson, createBindingId, type Editor, type TLAssetId, type TLShapeId, type TLPageId, type TLShapePartial, type TLShape } from 'tldraw'
import { CANVAS_LIMITS, CanvasError, validateCanvasAssetSource, validateCanvasDocument, validateCanvasJson, type CanvasExecution, type CanvasExecutionResult, type CanvasOperation, type CanvasDocument } from './protocol'

export function snapshotDocument(editor: Editor): CanvasDocument {
  return validateCanvasDocument(getSnapshot(editor.store).document)
}

export async function imageDimensions(src: string) {
  validateCanvasAssetSource(src)
  const image = new Image()
  image.src = src
  await image.decode()
  const width = image.naturalWidth, height = image.naturalHeight
  if (!width || !height || width > CANVAS_LIMITS.imageDimension || height > CANVAS_LIMITS.imageDimension || width * height > CANVAS_LIMITS.imagePixels) throw new CanvasError('LIMIT_EXCEEDED', '图片解码尺寸超过画板限制')
  return { width, height }
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export async function validateImages(document: CanvasDocument) {
  for (const record of Object.values(document.store)) {
    if (record.typeName !== 'asset') continue
    const props = record.props as { src: string; w: number; h: number }
    const dimensions = await imageDimensions(props.src)
    if (dimensions.width !== props.w || dimensions.height !== props.h) throw new CanvasError('INVALID_DOCUMENT', '图片实际尺寸与画板资源声明不一致')
  }
}

function requireShapes(editor: Editor, ids: string[]) {
  for (const id of ids) if (!id.startsWith('shape:') || !editor.getShape(id as TLShapeId)) throw new CanvasError('INVALID_DOCUMENT', `图形不存在：${id}`)
}

function assertNewId(editor: Editor, id: string, prefix: string) {
  if (!id.startsWith(prefix) || editor.store.has(id as TLShapeId)) throw new CanvasError('INVALID_DOCUMENT', `图形身份无效或已存在：${id}`)
}

async function applyOperations(editor: Editor, operations: CanvasOperation[], signal?: AbortSignal) {
  // Decode media before entering the SDK transaction, so a failed image never leaves a partial batch.
  for (const operation of operations) if (operation.type === 'image') {
    const dimensions = await imageDimensions(operation.src)
    if (dimensions.width !== operation.width || dimensions.height !== operation.height) throw new CanvasError('INVALID_DOCUMENT', '图片宽高须与原图一致')
  }
  signal?.throwIfAborted()
  editor.run(() => {
    for (const operation of operations) {
      switch (operation.type) {
        case 'create':
          for (const shape of operation.shapes) {
            assertNewId(editor, shape.id, 'shape:')
            if (shape.parentId && !editor.store.has(shape.parentId as TLPageId)) throw new CanvasError('INVALID_DOCUMENT', '图形父记录不存在')
          }
          editor.createShapes(operation.shapes as TLShapePartial[])
          break
        case 'update':
          requireShapes(editor, operation.shapes.map(shape => shape.id))
          for (const shape of operation.shapes) {
            const existing = editor.getShape(shape.id as TLShapeId)!
            if (shape.type && shape.type !== existing.type) throw new CanvasError('INVALID_DOCUMENT', '不能通过局部更新改变图形类型')
            if (shape.parentId && !editor.store.has(shape.parentId as TLPageId)) throw new CanvasError('INVALID_DOCUMENT', '图形父记录不存在')
          }
          editor.updateShapes(operation.shapes.map(shape => ({ ...shape, type: editor.getShape(shape.id as TLShapeId)!.type })) as TLShapePartial[])
          break
        case 'delete':
          requireShapes(editor, operation.shapeIds)
          editor.deleteShapes(operation.shapeIds as TLShapeId[])
          break
        case 'group':
          requireShapes(editor, operation.shapeIds)
          assertNewId(editor, operation.groupId, 'shape:')
          editor.groupShapes(operation.shapeIds as TLShapeId[], { groupId: operation.groupId as TLShapeId, select: false })
          break
        case 'ungroup':
          requireShapes(editor, operation.shapeIds)
          if (operation.shapeIds.some(id => editor.getShape(id as TLShapeId)!.type !== 'group')) throw new CanvasError('INVALID_DOCUMENT', '只能解散分组图形')
          editor.ungroupShapes(operation.shapeIds as TLShapeId[], { select: false })
          break
        case 'connect': {
          requireShapes(editor, [operation.fromShapeId, operation.toShapeId])
          assertNewId(editor, operation.arrowId, 'shape:')
          const from = editor.getShapePageBounds(operation.fromShapeId as TLShapeId)!, to = editor.getShapePageBounds(operation.toShapeId as TLShapeId)!
          editor.createShape({ id: operation.arrowId as TLShapeId, type: 'arrow', x: from.center.x, y: from.center.y, props: { start: { x: 0, y: 0 }, end: { x: to.center.x - from.center.x, y: to.center.y - from.center.y } } })
          editor.createBindings((['start', 'end'] as const).map((terminal, index) => ({ id: createBindingId(), type: 'arrow', fromId: operation.arrowId as TLShapeId, toId: (index ? operation.toShapeId : operation.fromShapeId) as TLShapeId, props: { terminal, normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } })))
          break
        }
        case 'image': {
          assertNewId(editor, operation.id, 'shape:')
          assertNewId(editor, operation.assetId, 'asset:')
          const { mimeType } = validateCanvasAssetSource(operation.src)
          editor.createAssets([{ id: operation.assetId as TLAssetId, typeName: 'asset', type: 'image', props: { name: operation.assetId, src: operation.src, w: operation.width, h: operation.height, mimeType, isAnimated: mimeType === 'image/gif' }, meta: {} }])
          editor.createShape({ id: operation.id as TLShapeId, type: 'image', x: operation.x ?? 0, y: operation.y ?? 0, props: { assetId: operation.assetId as TLAssetId, w: operation.width, h: operation.height } })
          break
        }
      }
    }
  }, { history: 'ignore' })
}

export async function executeCanvas(editor: Editor, request: CanvasExecution, signal?: AbortSignal): Promise<CanvasExecutionResult> {
  validateCanvasJson(request, CANVAS_LIMITS.documentBytes + CANVAS_LIMITS.totalAssetBytes * 2)
  signal?.throwIfAborted()
  if (request.action === 'export' && request.format === 'tldr' && (request.pageId !== undefined || request.shapeIds !== undefined)) throw new CanvasError('INVALID_DOCUMENT', '.tldr 仅支持导出整份画板；页面或选区导出请使用 PNG/SVG')
  if ('document' in request) {
    const document = validateCanvasDocument(request.document)
    loadSnapshot(editor.store, { document } as unknown as Parameters<typeof loadSnapshot>[1])
  }
  if (request.action === 'import') {
    const file: unknown = JSON.parse(request.file)
    validateCanvasJson(file)
    const parsed = parseTldrawJsonFile({ json: request.file, schema: editor.store.schema })
    if (!parsed.ok) throw new CanvasError('INVALID_DOCUMENT', `不能打开此 .tldr 文件：${parsed.error.type}`)
    const document = validateCanvasDocument(parsed.value.getStoreSnapshot('document'))
    await validateImages(document)
    loadSnapshot(editor.store, { document } as unknown as Parameters<typeof loadSnapshot>[1])
  }
  if (request.action === 'edit') await applyOperations(editor, request.operations, signal)
  signal?.throwIfAborted()
  const document = snapshotDocument(editor)
  if (request.action === 'validate') await validateImages(document)
  if (request.action !== 'export') return { document }
  await validateImages(document)
  if (request.format === 'tldr') {
    const file = await serializeTldrawJson(editor)
    return { format: 'tldr', base64: (await blobDataUrl(new Blob([file], { type: 'application/vnd.tldraw+json' }))).split(',')[1]! }
  }
  if (request.pageId) {
    if (editor.store.get(request.pageId as TLPageId)?.typeName !== 'page') throw new CanvasError('NOT_FOUND', '画板页面不存在')
    editor.setCurrentPage(request.pageId as TLPageId)
  }
  const ids = request.shapeIds ?? [...editor.getCurrentPageShapeIds()]
  requireShapes(editor, ids)
  if (!ids.length) throw new CanvasError('INVALID_DOCUMENT', '当前页面没有可导出的图形')
  const pageIds = new Set(editor.getCurrentPageShapeIds())
  if (ids.some(id => !pageIds.has(id as TLShapeId))) throw new CanvasError('INVALID_DOCUMENT', '导出选区必须属于同一页面')
  const fontDeclarations = await prepareExportFonts(editor, ids as TLShapeId[])
  signal?.throwIfAborted()
  const shapes = ids.map(id => editor.getShape(id as TLShapeId)!) as TLShape[]
  const bounds = shapes.map(shape => editor.getShapePageBounds(shape)!)
  const width = Math.max(...bounds.map(b => b.maxX)) - Math.min(...bounds.map(b => b.minX)) + 64
  const height = Math.max(...bounds.map(b => b.maxY)) - Math.min(...bounds.map(b => b.minY)) + 64
  if (!Number.isFinite(width * height) || width > CANVAS_LIMITS.imageDimension || height > CANVAS_LIMITS.imageDimension || width * height > CANVAS_LIMITS.imagePixels) throw new CanvasError('LIMIT_EXCEEDED', '导出尺寸超过限制，请缩小选区')
  // The SDK logs font embedding failures and still resolves its SVG export. Check
  // the actual SVG before delivering it or rasterizing these same verified bytes.
  const exported = await editor.toImage(ids as TLShapeId[], { format: 'svg', scale: 1, pixelRatio: 1, background: true })
  const svg = await exported.blob.text()
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const styles = new Set([...parsed.querySelectorAll('defs style')].map(style => style.textContent))
  if (parsed.querySelector('parsererror') || fontDeclarations.some(css => !styles.has(css))) throw new CanvasError('RENDER_FAILED', '画板导出缺少嵌入字体，请重试')
  signal?.throwIfAborted()
  const blob = request.format === 'svg' ? exported.blob : await getSvgAsImage(svg, { type: 'png', width: exported.width, height: exported.height, pixelRatio: 1 })
  if (!blob) throw new CanvasError('RENDER_FAILED', '画板图片渲染失败')
  if (blob.size > CANVAS_LIMITS.exportBytes) throw new CanvasError('LIMIT_EXCEEDED', '导出文件超过大小限制')
  return { format: request.format, base64: (await blobDataUrl(blob)).split(',')[1]! }
}

async function prepareExportFonts(editor: Editor, ids: TLShapeId[]): Promise<string[]> {
  const fonts = new Set([...editor.getShapeAndDescendantIds(ids)].flatMap(id => editor.fonts.getShapeFontFaces(id)))
  try {
    await Promise.all([...fonts].map(font => editor.fonts.ensureFontIsLoaded(font)))
    const loaded = [...editor.getContainer().ownerDocument.fonts]
    for (const font of fonts) {
      // ensureFontIsLoaded deliberately catches failures inside the SDK. Verify
      // a real loaded face, since FontFaceSet.check alone also accepts fallback.
      if (!loaded.some(face => face.family === font.family && face.weight === (font.weight ?? 'normal') && face.style === (font.style ?? 'normal') && face.status === 'loaded')) throw new Error(`字体未加载：${font.family}`)
    }
    return await Promise.all([...fonts].map(font => editor.fonts.toEmbeddedCssDeclaration(font)))
  } catch {
    throw new CanvasError('RENDER_FAILED', '画板本地字体加载失败，未生成导出文件')
  }
}
