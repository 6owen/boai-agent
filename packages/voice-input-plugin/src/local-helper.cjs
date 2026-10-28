/*
 * [OUTPUT]: 2026-10-28 按目录引擎适配识别，Whisper补回200ms非重复段首上下文；保持Silero VAD与真实退出。
 * [INPUT]: Host-owned PCM16 mono 16 kHz file, verified model directory and trusted catalog engine.
 * [OUTPUT]: VAD-delimited transcription with explicit language in an isolated utility process, then actual exit.
 * [POS]: Optional native ASR helper; never imported into main or renderer.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
const { join } = require('node:path')
const { openSync, readSync, closeSync } = require('node:fs')
const { localRecognizerConfig } = require('./local-recognizers.cjs')
const { withSegmentContext } = require('./local-audio.cjs')

const [models, path, language = 'auto', engine = 'sensevoice'] = process.argv.slice(2)
try {
  const { config, contextSamples } = localRecognizerConfig(models, engine, language)
  const sherpa = require('sherpa-onnx-node')
  const vad = new sherpa.Vad({ sileroVad: { model: join(models, 'silero-vad.onnx'), threshold: 0.5, minSilenceDuration: 0.5, minSpeechDuration: 0.15, windowSize: 512, maxSpeechDuration: 20 }, sampleRate: 16000, numThreads: 1, provider: 'cpu', debug: 0 }, 30)
  let recognizer, sequence = 0, previousEnd = 0
  const drain = () => {
    while (!vad.isEmpty()) {
      // Electron disallows native externally backed ArrayBuffers; explicitly request a copy.
      const segment = vad.front(false); vad.pop()
      if (!segment.samples.length || !segment.samples.some(value => value !== 0 && Number.isFinite(value))) continue
      const contextual = withSegmentContext(file, segment, contextSamples, previousEnd)
      previousEnd = segment.start + segment.samples.length
      recognizer ??= new sherpa.OfflineRecognizer(config)
      const stream = recognizer.createStream()
      stream.acceptWaveform({ sampleRate: 16000, samples: contextual.samples }); recognizer.decode(stream)
      const text = recognizer.getResult(stream).text
      process.parentPort.postMessage({ type: 'segment', sequence: sequence++, text, startSample: contextual.start })
    }
  }
  const file = openSync(path, 'r'), buffer = Buffer.alloc(1024)
  let nonzero = false
  try {
    for (;;) {
      const length = readSync(file, buffer, 0, buffer.length, null)
      if (!length) break
      if (length % 2) throw new Error('Invalid PCM16 byte count')
      const samples = new Float32Array(512)
      for (let index = 0; index < length / 2; index++) { samples[index] = buffer.readInt16LE(index * 2) / 32768; if (samples[index] !== 0) nonzero = true }
      vad.acceptWaveform(samples); drain()
    }
    if (nonzero) { vad.flush(); drain() }
  } finally { closeSync(file) }
  // Wait for the host to receive all preceding segments before exiting.
  // This timeout bounds the IPC acknowledgement, not the recording or ASR work.
  const acknowledgement = setTimeout(() => process.exit(1), 5000)
  process.parentPort.on('message', event => {
    if (event.data?.type !== 'received') return
    clearTimeout(acknowledgement); process.exit(0)
  })
  process.parentPort.postMessage({ type: 'done' })
} catch {
  process.parentPort.postMessage({ type: 'error', error: '本地语音识别失败；未确认的音频不会重放或上传' })
  process.exit(1)
}
