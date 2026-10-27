/*
 * [OUTPUT]: 2026-10-27 精确麦克风设备与迟到授权关闭；AudioWorklet采集、断开失败及有界回压。
 * [INPUT]: Explicit capture request, AbortSignal and acknowledged PCM consumer.
 * [OUTPUT]: Mono AudioWorklet capture with late-permission cleanup and bounded backpressure.
 * [POS]: Renderer plugin capture; no key, model or draft ownership.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import workletUrl from './capture-worklet.js?url'
export interface VoiceCapture { stop(): Promise<void>; cancel(): void }
/** Used only after an explicit user action; never falls back from a selected device. */
export async function openVoiceMicrophone(signal: AbortSignal, deviceId = '') {
  signal.throwIfAborted()
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前环境无法访问麦克风')
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }) }
  catch (error) {
    signal.throwIfAborted()
    if (error instanceof DOMException && ['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw new Error('所选麦克风不可用，请在语音输入设置中重新选择')
    if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) throw new Error('麦克风权限未授予，请在系统隐私设置中允许 BOAI 使用麦克风后重试')
    throw error
  }
  const close = () => { stream.getTracks().forEach(track => track.stop()); signal.removeEventListener('abort', close) }
  if (signal.aborted) { close(); signal.throwIfAborted() }
  if (deviceId && stream.getAudioTracks().some(track => track.getSettings().deviceId !== deviceId)) { close(); throw new Error('麦克风设备已变化，请重新选择后录音') }
  signal.addEventListener('abort', close, { once: true })
  return { stream, close }
}
export async function captureVoice(signal: AbortSignal, append: (pcm: Uint8Array) => Promise<void>, failed: (error: Error) => void, deviceId = ''): Promise<VoiceCapture> {
  const microphone = await openVoiceMicrophone(signal, deviceId), stream = microphone.stream
  let context: AudioContext | undefined, source: MediaStreamAudioSourceNode | undefined
  let node: AudioWorkletNode | undefined, queue = Promise.resolve(), pending = 0, closed = false, failedOnce = false, flushed: (() => void) | undefined
  const close = () => { if (closed) return; closed = true; microphone.close(); source?.disconnect(); node?.disconnect(); node?.port.close(); void context?.close().catch(() => {}); signal.removeEventListener('abort', close) }
  signal.addEventListener('abort', close, { once: true })
  try {
    context = new AudioContext({ sampleRate: 16000 }); source = context.createMediaStreamSource(stream)
    if (stream.getAudioTracks().some(track => track.readyState === 'ended')) throw new Error('麦克风已断开')
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
