/*
 * [OUTPUT]: 2026-10-27 单声道PCM16k重采样与明确尾段flush；不设录音总时长额度。
 * [INPUT]: User-initiated mono browser audio samples.
 * [OUTPUT]: Bounded 16 kHz PCM16 frames with explicit tail flush; no network or persistent storage.
 * [POS]: AudioWorklet asset loaded only during a voice capture.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Int16Array(3200)
    this.offset = 0
    this.weight = 0
    this.sum = 0
    this.stopped = false
    this.port.onmessage = event => {
      if (event.data?.type !== 'flush') return
      if (this.weight) this.push(this.sum / this.weight)
      this.flush()
      this.stopped = true
      this.port.postMessage({ type: 'flushed' })
    }
  }
  push(value) {
    this.samples[this.offset++] = Math.max(-32768, Math.min(32767, Math.round(value * 32768)))
    if (this.offset === this.samples.length) this.flush()
  }
  flush() {
    if (!this.offset) return
    const bytes = new Uint8Array(this.offset * 2), view = new DataView(bytes.buffer)
    for (let index = 0; index < this.offset; index++) view.setInt16(index * 2, this.samples[index], true)
    this.offset = 0
    this.port.postMessage({ type: 'pcm', bytes }, [bytes.buffer])
  }
  process(inputs) {
    if (this.stopped) return false
    const input = inputs[0]?.[0]
    if (!input) return true
    const ratio = sampleRate / 16000
    for (const sample of input) {
      let rest = 1
      while (rest > 1e-8) {
        const part = Math.min(rest, ratio - this.weight)
        this.sum += (Number.isFinite(sample) ? sample : 0) * part; this.weight += part; rest -= part
        if (this.weight >= ratio - 1e-8) { this.push(this.sum / this.weight); this.sum = 0; this.weight = 0 }
      }
    }
    return true
  }
}
registerProcessor('boai-voice-capture', VoiceCaptureProcessor)
