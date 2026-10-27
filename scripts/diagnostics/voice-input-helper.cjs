/*
 * [OUTPUT]: 2026-10-27 语音包分发、工作区依赖或静音诊断候选；不代表产品验收。
 * [INPUT]: Explicit VI0 fixture directory containing one pinned local engine/model and synthetic WAV.
 * [OUTPUT]: Single utility-process recognition measurement followed by real process exit.
 * [POS]: Manual voice-input feasibility probe; never imported by the BOAI application.
 * [PROTOCOL]: Update scripts/diagnostics/.folder.md and the voice implementation record on changes.
 */
const { join } = require('node:path')
const { readFileSync } = require('node:fs')
const [root, wav] = process.argv.slice(2)
const started = performance.now()
try {
  const sherpa = require(join(root, 'node_modules/sherpa-onnx-node'))
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { senseVoice: { model: join(root, 'models/model.int8.onnx'), language: 'auto', useInverseTextNormalization: 1 }, tokens: join(root, 'models/tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0 },
  })
  const loadedMs = performance.now() - started
  // Electron rejects native externally-backed ArrayBuffers from sherpa.readWave().
  // Production capture also supplies JS-owned PCM; decode the bounded fixture the same way.
  const bytes = readFileSync(wav)
  if (bytes.length > 120 * 32000 + 4096 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid fixture audio')
  let offset = 12, pcm, format
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4)
    if (offset + 8 + length > bytes.length) throw new Error('Truncated WAV fixture')
    if (kind === 'fmt ') format = { encoding: bytes.readUInt16LE(offset + 8), channels: bytes.readUInt16LE(offset + 10), rate: bytes.readUInt32LE(offset + 12), bits: bytes.readUInt16LE(offset + 22) }
    if (kind === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + length)
    offset += 8 + length + length % 2
  }
  if (!pcm || pcm.length % 2 || pcm.length > 120 * 32000 || format?.encoding !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16) throw new Error('Invalid PCM16 fixture')
  const samples = new Float32Array(pcm.length / 2), stream = recognizer.createStream()
  for (let index = 0; index < samples.length; index++) samples[index] = pcm.readInt16LE(index * 2) / 32768
  let result = { text: '' }
  if (samples.some(sample => sample !== 0 && Number.isFinite(sample))) {
    stream.acceptWaveform({ sampleRate: 16000, samples })
    recognizer.decode(stream)
    result = recognizer.getResult(stream)
  }
  process.parentPort.postMessage({ ok: true, text: result.text, seconds: samples.length / 16000, loadedMs, totalMs: performance.now() - started, maxRssBytes: process.resourceUsage().maxRSS * 1024, electron: process.versions.electron, node: process.versions.node, pid: process.pid })
  process.exit(0)
} catch (error) {
  process.parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
}
