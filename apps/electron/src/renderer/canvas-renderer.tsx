/*
 * [INPUT]: One validated fixed canvas task from the private preload.
 * [OUTPUT]: SDK document changes or real rendered image/file bytes, then Main destroys the window.
 * [POS]: Hidden renderer execution; no model loop or arbitrary script evaluation.
 * [PROTOCOL]: Update Header and renderer/.folder.md when this file changes.
 */
import { createRoot } from 'react-dom/client'
import { CanvasExecutorView, configureCanvasEditor } from '@boai/canvas-plugin/editor'
import { executeCanvas } from '@boai/canvas-plugin/executor'
import type { CanvasExecution } from '@boai/canvas-plugin/protocol'

declare global { interface Window { canvasExecution: { ready(): Promise<CanvasExecution>; finish(value: unknown): void } } }
let started = false
async function onMount(editor: Parameters<typeof configureCanvasEditor>[0]) {
  if (started) return
  started = true
  configureCanvasEditor(editor)
  try { const command = await window.canvasExecution.ready(); window.canvasExecution.finish({ result: await executeCanvas(editor, command) }) }
  catch (error) { window.canvasExecution.finish({ error: error instanceof Error ? error.message : String(error) }) }
}
createRoot(document.getElementById('root')!).render(<CanvasExecutorView onMount={editor => { void onMount(editor) }} />)
