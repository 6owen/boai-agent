/*
 * [INPUT]: Registered local model identities and the production helper configuration factory.
 * [OUTPUT]: Per-engine configuration including Qwen3 tokenizer/language stream options, advertised languages and safe segment context.
 * [POS]: Local ASR adapter contract regression; real inference is validated separately with pinned public audio.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtempSync, openSync, closeSync, readSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { voiceModelIds, voiceModelLanguages } from '../packages/shared/src/plugins/voice-input'
import { getVoiceModel } from '../packages/voice-input-plugin/src/model-manifest'
const { localRecognizerConfig } = createRequire(import.meta.url)('../packages/voice-input-plugin/src/local-recognizers.cjs')

it('dispatches each registered model to its actual engine and accepts every advertised language', () => {
  for (const id of voiceModelIds) {
    for (const language of voiceModelLanguages(id)) {
      const { config: { modelConfig }, contextSamples, streamOptions } = localRecognizerConfig('/models', getVoiceModel(id).engine, language)
      expect(contextSamples).toBe(id === 'sensevoice-small' ? 0 : 3200)
      expect(modelConfig.tokens).toBe(id === 'qwen3-asr-0.6b' ? '' : join('/models', 'tokens.txt'))
      if (id === 'qwen3-asr-0.6b') {
        expect(modelConfig.qwen3Asr).toEqual({ convFrontend: join('/models', 'conv_frontend.onnx'), encoder: join('/models', 'encoder.int8.onnx'), decoder: join('/models', 'decoder.int8.onnx'), tokenizer: '/models' })
        expect(modelConfig.senseVoice).toBeUndefined()
        expect(modelConfig.whisper).toBeUndefined()
        expect(streamOptions).toEqual(language === 'auto' ? {} : { language: expect.any(String) })
      } else if (id === 'sensevoice-small') {
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
  expect(() => localRecognizerConfig('/models', 'qwen3', 'uk')).toThrow('Unsupported language')
})

it.each([['auto', undefined], ['zh', 'Chinese'], ['yue', 'Cantonese'], ['fil', 'Filipino']])('applies Qwen3 %s language before decoding each helper segment', (language, expected) => {
  const setOption = vi.fn(), decode = vi.fn(() => expect(setOption.mock.calls).toEqual(expected ? [['language', expected]] : []))
  const postMessage = vi.fn(), exit = vi.fn()
  let read = false, queued = false
  const fakeSherpa = {
    Vad: class {
      acceptWaveform() { queued = true }
      isEmpty() { return !queued }
      front() { return { start: 0, samples: Float32Array.of(0.5) } }
      pop() { queued = false }
      flush() {}
    },
    OfflineRecognizer: class {
      createStream() { return { setOption, acceptWaveform: vi.fn() } }
      decode = decode
      getResult() { return { text: 'fixture transcript' } }
    },
  }
  const require = createRequire(import.meta.url)
  runInNewContext(readFileSync(new URL('../packages/voice-input-plugin/src/local-helper.cjs', import.meta.url), 'utf8'), {
    Buffer, Float32Array, setTimeout: vi.fn(), clearTimeout: vi.fn(),
    process: { argv: ['node', 'helper', '/models', '/fixture.pcm', language, 'qwen3'], parentPort: { postMessage, on: vi.fn() }, exit },
    require: (name: string) => name === 'sherpa-onnx-node' ? fakeSherpa : name === './local-recognizers.cjs' ? { localRecognizerConfig }
      : name === './local-audio.cjs' ? require('../packages/voice-input-plugin/src/local-audio.cjs')
      : name === 'node:fs' ? { openSync: () => 1, closeSync: vi.fn(), readSync: (_file: number, bytes: Buffer) => { if (read) return 0; read = true; bytes.writeInt16LE(16384); return 2 } } : require(name),
  })
  expect(decode).toHaveBeenCalledOnce()
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'done' })
  expect(exit).not.toHaveBeenCalled()
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
