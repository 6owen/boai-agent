/*
 * [INPUT]: One Main-owned hidden canvas execution window.
 * [OUTPUT]: A single bounded task/result bridge with no filesystem or generic application API.
 * [POS]: Dedicated sandboxed canvas renderer preload.
 * [PROTOCOL]: Update Header and preload/.folder.md when this file changes.
 */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('canvasExecution', {
  ready: () => ipcRenderer.invoke('boai:canvas-renderer-ready'),
  finish: (value: unknown) => ipcRenderer.send('boai:canvas-renderer-result', value),
})
