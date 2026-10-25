/*
 * [INPUT]: Host-owned paths and validated presentation data; no model-selected worker or executable.
 * [OUTPUT]: Bounded compiler/renderer/extractor worker calls with actual disposal, including workers that already exited.
 * [POS]: Internal presentation kernel bridge; employee authorization belongs to its future caller.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'

type Kind = 'compiler' | 'renderer' | 'material'
interface Reply { id?: string; type?: string; ok?: boolean; error?: string; images?: string[]; result?: unknown }
export async function presentationWorker(kind: Kind, payload: Record<string, unknown>, signal?: AbortSignal, timeoutMs = 120_000): Promise<Reply> {
  signal?.throwIfAborted()
  const worker = new Worker(new URL(`./alma/${kind}.worker.mjs`, import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 512, stackSizeMb: 8 } })
  const id = randomUUID()
  let exited = false
  worker.once('exit', () => { exited = true })
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
  try {
    return await new Promise<Reply>((resolve, reject) => {
      abort = () => { worker.postMessage({ type: 'cancel', id }); reject(signal?.reason ?? new Error('Presentation call cancelled')) }
      timer = setTimeout(() => { worker.postMessage({ type: 'cancel', id }); reject(new Error('Presentation worker deadline exceeded')) }, timeoutMs)
      signal?.addEventListener('abort', abort, { once: true })
      worker.once('error', reject)
      worker.once('exit', code => reject(new Error(`Presentation worker exited before reply (${code})`)))
      worker.on('message', (reply: Reply) => {
        if (reply.id !== id) return
        if (reply.ok) resolve(reply)
        else reject(new Error(reply.error || 'Presentation operation failed'))
      })
      worker.postMessage({ ...payload, id })
      if (signal?.aborted) abort()
    })
  } finally {
    clearTimeout(timer)
    if (abort) signal?.removeEventListener('abort', abort)
    try { if (kind === 'renderer' && !exited) {
      // Renderer owns a LibreOffice child. Its acknowledgement follows child exit.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Presentation renderer cleanup was not confirmed')), 5000)
        const done = () => { clearTimeout(timer); resolve() }
        worker.once('exit', done)
        worker.on('message', (reply: Reply) => { if (reply.type === 'shutdown-complete') done() })
        worker.postMessage({ type: 'cancel', id }); worker.postMessage({ type: 'shutdown' })
      })
    } } finally { await worker.terminate() }
  }
}
