/*
 * [OUTPUT]: 2026-10-27 独立utility process中的Silero VAD与SenseVoiceSmall解码，完成后真实退出。
 * [INPUT]: Host-owned PCM16 mono 16 kHz file and verified model directory.
 * [OUTPUT]: VAD-delimited SenseVoice segments in an isolated utility process, then actual exit.
 * [POS]: Optional native ASR helper; never imported into main or renderer.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
const { join } = require('node:path')
const { openSync, readSync, closeSync } = require('node:fs')
const [models, path] = process.argv.slice(2)
try {
  const sherpa = require('sherpa-onnx-node')
  const vad = new sherpa.Vad({ sileroVad: { model: join(models, 'silero-vad.onnx'), threshold: 0.5, minSilenceDuration: 0.5, minSpeechDuration: 0.15, windowSize: 512, maxSpeechDuration: 20 }, sampleRate: 16000, numThreads: 1, provider: 'cpu', debug: 0 }, 30)
  let recognizer, sequence = 0
  const drain = () => {
    while (!vad.isEmpty()) {
      // Electron disallows native externally backed ArrayBuffers; explicitly request a copy.
      const segment = vad.front(false); vad.pop()
      if (!segment.samples.length || !segment.samples.some(value => value !== 0 && Number.isFinite(value))) continue
      recognizer ??= new sherpa.OfflineRecognizer({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: { senseVoice: { model: join(models, 'model.int8.onnx'), language: 'auto', useInverseTextNormalization: 1 }, tokens: join(models, 'tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0 } })
      const stream = recognizer.createStream()
      stream.acceptWaveform({ sampleRate: 16000, samples: segment.samples }); recognizer.decode(stream)
      const text = recognizer.getResult(stream).text
      process.parentPort.postMessage({ type: 'segment', sequence: sequence++, text, startSample: segment.start })
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
  } finally { closeSync(file) }
  if (nonzero) { vad.flush(); drain() }
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
