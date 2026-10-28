/*
 * [INPUT]: Host-owned PCM16 descriptor, VAD segment and engine-declared context sample count.
 * [OUTPUT]: Bounded segment prefix without changing the scan position or repeating a previous segment.
 * [POS]: Shared local audio preparation; model-specific context requirements belong to the adapters.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
const { readSync } = require('node:fs')
function withSegmentContext(file, segment, contextSamples, previousEnd = 0) {
  if (!Number.isSafeInteger(contextSamples) || contextSamples < 0 || contextSamples > 16000 ||
      !Number.isSafeInteger(segment.start) || segment.start < 0 || segment.start > Number.MAX_SAFE_INTEGER / 2 ||
      !Number.isSafeInteger(previousEnd) || previousEnd < 0) throw new Error('Invalid PCM context bounds')
  const prefix = Math.max(0, Math.min(contextSamples, segment.start - previousEnd))
  if (!prefix) return segment
  const start = segment.start - prefix, bytes = Buffer.alloc(prefix * 2)
  let received = 0
  while (received < bytes.length) {
    // Explicit positions leave the sequential reader's offset unchanged.
    const count = readSync(file, bytes, received, bytes.length - received, start * 2 + received)
    if (!count) throw new Error('Incomplete PCM context')
    received += count
  }
  const samples = new Float32Array(prefix + segment.samples.length)
  for (let index = 0; index < prefix; index++) samples[index] = bytes.readInt16LE(index * 2) / 32768
  samples.set(segment.samples, prefix)
  return { start, samples }
}
module.exports = { withSegmentContext }
