/*
 * [INPUT]: Registered local model identities and the production helper configuration factory.
 * [OUTPUT]: Per-engine configuration, advertised language coverage, rejection of unsupported input and safe segment context reads.
 * [POS]: Local ASR adapter contract regression; real inference is validated separately with pinned public audio.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtempSync, openSync, closeSync, readSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { voiceModelIds, voiceModelLanguages } from '../packages/shared/src/plugins/voice-input'
import { getVoiceModel } from '../packages/voice-input-plugin/src/model-manifest'
const { localRecognizerConfig } = createRequire(import.meta.url)('../packages/voice-input-plugin/src/local-recognizers.cjs')

it('dispatches each registered model to its actual engine and accepts every advertised language', () => {
  for (const id of voiceModelIds) {
    for (const language of voiceModelLanguages(id)) {
      const { config: { modelConfig }, contextSamples } = localRecognizerConfig('/models', getVoiceModel(id).engine, language)
      expect(contextSamples).toBe(id === 'sensevoice-small' ? 0 : 3200)
      expect(modelConfig.tokens).toBe(join('/models', 'tokens.txt'))
      if (id === 'sensevoice-small') {
        expect(modelConfig.senseVoice).toEqual({ model: join('/models', 'model.int8.onnx'), language, useInverseTextNormalization: 1 })
        expect(modelConfig.whisper).toBeUndefined()
      } else {
        expect(modelConfig.whisper).toEqual({ encoder: join('/models', 'encoder.int8.onnx'), decoder: join('/models', 'decoder.int8.onnx'), language: language === 'auto' ? '' : language === 'fil' ? 'tl' : language, task: 'transcribe', tailPaddings: 300 })
        expect(modelConfig.senseVoice).toBeUndefined()
      }
    }
  }
})
it('rejects unregistered engines and unsupported languages before loading the native engine', () => {
  expect(() => localRecognizerConfig('/models', '../../foreign', 'auto')).toThrow('Unsupported engine')
  expect(() => localRecognizerConfig('/models', 'whisper', 'yue')).toThrow('Unsupported language')
  expect(() => localRecognizerConfig('/models', 'sensevoice', 'de')).toThrow('Unsupported language')
})

const { withSegmentContext } = createRequire(import.meta.url)('../packages/voice-input-plugin/src/local-audio.cjs')
function audioFixture(test: (file: number) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'voice-context-'))
  const path = join(directory, 'samples.pcm'), bytes = Buffer.alloc(12)
  for (let index = 0; index < 6; index++) bytes.writeInt16LE((index + 1) * 1000, index * 2)
  writeFileSync(path, bytes)
  const file = openSync(path, 'r')
  try { test(file) } finally { closeSync(file); rmSync(directory, { recursive: true }) }
}
it('reads a segment prefix by absolute position without advancing the PCM scan offset', () => audioFixture(file => {
  const buffer = Buffer.alloc(4)
  readSync(file, buffer, 0, 4, null)
  const segment = { start: 4, samples: Float32Array.of(5000 / 32768) }
  const result = withSegmentContext(file, segment, 2)
  expect(result.start).toBe(2)
  expect([...result.samples]).toEqual([3000 / 32768, 4000 / 32768, 5000 / 32768])
  readSync(file, buffer, 0, 2, null)
  expect(buffer.readInt16LE()).toBe(3000)
}))
it('clamps context to the recording start and previous segment end, and preserves zero-context audio', () => audioFixture(file => {
  const segment = { start: 2, samples: Float32Array.of(3000 / 32768) }
  expect([...withSegmentContext(file, segment, 3200).samples]).toEqual([1000 / 32768, 2000 / 32768, 3000 / 32768])
  expect([...withSegmentContext(file, segment, 3200, 1).samples]).toEqual([2000 / 32768, 3000 / 32768])
  expect(withSegmentContext(file, segment, 3200, 2)).toBe(segment)
  expect(withSegmentContext(file, segment, 0)).toBe(segment)
  expect(() => withSegmentContext(file, { start: -1, samples: segment.samples }, 3200)).toThrow('Invalid PCM context bounds')
  expect(() => withSegmentContext(file, { start: 10, samples: segment.samples }, 2)).toThrow('Incomplete PCM context')
}))
