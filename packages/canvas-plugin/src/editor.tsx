/*
 * [INPUT]: A shared canvas controller and a container-specific view identity.
 * [OUTPUT]: The same tldraw editor in any host, with local assets and pointer-owned keyboard focus.
 * [POS]: Reusable React editor; imports no application navigation or employee page.
 * [PROTOCOL]: Update Header and src/.folder.md when this file changes.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { Tldraw, type Editor, type TLAssetStore, type TLUiOverrides } from 'tldraw'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import 'tldraw/tldraw.css'
import { CANVAS_LIMITS, CanvasError, validateCanvasAssetSource } from './protocol'
import { blobDataUrl, imageDimensions } from './executor'
import { CanvasController, type CanvasSelectionReference } from './controller'
export { CanvasController, createCanvasController, type CanvasControllerState, type CanvasSelectionReference } from './controller'

// Vite already resolves each imported URL for dev and packaged file:// pages.
// The SDK's default formatter prepends '/', corrupting file:// URLs on desktop.
export const canvasAssetUrls = getAssetUrlsByImport(url => url)
export const canvasAssets: TLAssetStore = {
  async upload(_asset, file) {
    if (file.size > CANVAS_LIMITS.assetBytes) throw new CanvasError('LIMIT_EXCEEDED', '单张画板图片不能超过 8 MiB')
    const src = await blobDataUrl(file)
    validateCanvasAssetSource(src)
    await imageDimensions(src)
    return { src }
  },
  resolve(asset) { validateCanvasAssetSource(asset.props.src); return asset.props.src! },
}
export function configureCanvasEditor(editor: Editor) {
  // URLs in drawings are material only. No remote embeds, bookmark fetches or navigation.
  editor.registerExternalContentHandler('url', async () => {})
  editor.registerExternalAssetHandler('url', async () => { throw new CanvasError('FORBIDDEN', '画板不下载远程资源') })
}
export interface CanvasViewProps {
  controller: CanvasController
  viewId: string
  onSelection?: (reference: CanvasSelectionReference) => void
  onError?: (error: unknown) => void
  className?: string
  colorScheme?: 'light' | 'dark' | 'system'
  licenseKey?: string
}
export function CanvasView({ controller, viewId, onSelection, onError, className, colorScheme = 'system', licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY }: CanvasViewProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  const callbacks = useRef({ onSelection, onError })
  callbacks.current = { onSelection, onError }
  useEffect(() => { if (state.error) callbacks.current.onError?.(state.error) }, [state.error])
  const mount = useCallback((editor: Editor) => {
    configureCanvasEditor(editor)
    const detach = controller.attach(editor, viewId)
    // autoFocus=false deliberately leaves focus ownership to the embedding host.
    // Capture pointer events so keyboard shortcuts follow the last clicked surface,
    // including when the editor lives inside a Dialog that stops bubbling events.
    const container = editor.getContainer()
    const body = container.ownerDocument.body
    const focus = () => editor.focus()
    const blurOutside = (event: PointerEvent) => { if (!event.composedPath().includes(container)) editor.blur() }
    container.addEventListener('pointerdown', focus, true)
    body.addEventListener('pointerdown', blurOutside, true)
    const notifySelection = () => callbacks.current.onSelection?.({ boardId: controller.options.boardId, viewId, pageId: editor.getCurrentPageId(), shapeIds: [...editor.getSelectedShapeIds()], revision: controller.getState().board!.revision })
    const stop = editor.store.listen(notifySelection, { scope: 'session' })
    notifySelection()
    return () => {
      container.removeEventListener('pointerdown', focus, true)
      body.removeEventListener('pointerdown', blurOutside, true)
      stop(); detach()
    }
  }, [controller, viewId])
  const overrides: TLUiOverrides = {
    actions(_editor, actions) {
      for (const id of ['undo', 'redo'] as const) if (actions[id]) actions[id] = { ...actions[id]!, isEnabled: () => true, onSelect: async () => { try { await controller[id]() } catch (error) { callbacks.current.onError?.(error) } } }
      // Host export is revision-bound and receives a durable receipt.
      for (const id of Object.keys(actions)) if (/^(?:export-|print|open-file|save-file|insert-embed|insert-video)/.test(id)) delete actions[id]
      return actions
    },
  }
  if (!state.board) return null
  return <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240 }} data-canvas-board={state.board.boardId} data-canvas-view={viewId}>
    <Tldraw autoFocus={false} onMount={mount} assets={canvasAssets} assetUrls={canvasAssetUrls} colorScheme={colorScheme} licenseKey={licenseKey} overrides={overrides} options={{ maxShapesPerPage: CANVAS_LIMITS.records }} />
  </div>
}

/** Fixed private renderer surface; the host owns the command and completion lifetime. */
export function CanvasExecutorView({ onMount }: { onMount(editor: Editor): void }) {
  return <Tldraw autoFocus={false} hideUi assets={canvasAssets} assetUrls={canvasAssetUrls} onMount={onMount} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} />
}
