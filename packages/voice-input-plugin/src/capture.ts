/*
 * [OUTPUT]: 2026-10-27 AudioWorklet采集、真实设备关闭、尾段确认和有界回压。
 * [INPUT]: Explicit capture request, AbortSignal and acknowledged PCM consumer.
 * [OUTPUT]: Mono AudioWorklet capture with late-permission cleanup and bounded backpressure.
 * [POS]: Renderer plugin capture; no key, model or draft ownership.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import workletUrl from './capture-worklet.js?url'
export interface VoiceCapture { stop(): Promise<void>; cancel(): void }
export async function captureVoice(signal: AbortSignal, append: (pcm: Uint8Array) => Promise<void>, failed: (error: Error) => void): Promise<VoiceCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
  if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); throw new Error('录音已取消') }
  const context = new AudioContext({ sampleRate: 16000 }), source = context.createMediaStreamSource(stream)
  let node: AudioWorkletNode | undefined, queue = Promise.resolve(), pending = 0, closed = false, failedOnce = false, flushed: (() => void) | undefined
  const close = () => { if (closed) return; closed = true; stream.getTracks().forEach(track => track.stop()); source.disconnect(); node?.disconnect(); node?.port.close(); void context.close().catch(() => {}); signal.removeEventListener('abort', close) }
  signal.addEventListener('abort', close, { once: true })
  try {
    if (context.sampleRate < 16000) throw new Error('音频设备采样率不支持当前识别格式')
    await context.audioWorklet.addModule(workletUrl); signal.throwIfAborted()
    node = new AudioWorkletNode(context, 'boai-voice-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    const fail = (error: unknown) => { if (!failedOnce && !signal.aborted) { failedOnce = true; close(); failed(error instanceof Error ? error : new Error('音频采集失败')) } }
    node.onprocessorerror = () => fail(new Error('音频处理进程已中断'))
    node.port.onmessage = event => {
      if (signal.aborted || failedOnce) return
      if (event.data?.type === 'flushed') { flushed?.(); return }
      if (event.data?.type !== 'pcm' || !(event.data.bytes instanceof Uint8Array)) return
      if (++pending > 8) { fail(new Error('音频处理队列已满，录音已停止')); return }
      queue = queue.then(() => { signal.throwIfAborted(); return append(event.data.bytes) }).finally(() => { pending-- })
      void queue.catch(fail)
    }
    for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (!signal.aborted) fail(new Error('麦克风已断开')) }, { once: true })
    source.connect(node); node.connect(context.destination); await context.resume()
    return { cancel: close, stop: async () => {
      // Close the physical microphone immediately; drain only the worklet's already captured tail.
      stream.getTracks().forEach(track => track.stop())
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await new Promise<void>((resolve, reject) => { flushed = resolve; timer = setTimeout(() => reject(new Error('录音尾段未确认')), 1000); node!.port.postMessage({ type: 'flush' }) })
        await queue; signal.throwIfAborted()
      } finally { clearTimeout(timer); close() }
    } }
  } catch (error) { close(); throw error }
}
