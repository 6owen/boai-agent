/*
 * [INPUT]: Trusted catalog engine, verified resource directory and explicit recognition language.
 * [OUTPUT]: Engine-specific sherpa-onnx configuration and bounded segment context through small adapters.
 * [POS]: Local ASR adapter registry; model sizes and resource versions belong to model-manifest.ts.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
const { join } = require('node:path')
const adapters = {
  sensevoice: {
    contextSamples: 0,
    languages: ['auto', 'zh', 'yue', 'en', 'ja', 'ko'],
    configure: (directory, language) => ({ senseVoice: { model: join(directory, 'model.int8.onnx'), language, useInverseTextNormalization: 1 } }),
  },
  whisper: {
    contextSamples: 3200,
    languages: ['auto', 'zh', 'en', 'ja', 'ko', 'de', 'ru', 'fr', 'pt', 'ar', 'it', 'es', 'hi', 'id', 'th', 'tr', 'uk', 'vi', 'cs', 'da', 'fil', 'fi', 'is', 'ms', 'no', 'pl', 'sv'],
    configure: (directory, language) => ({ whisper: {
      encoder: join(directory, 'encoder.int8.onnx'), decoder: join(directory, 'decoder.int8.onnx'),
      language: language === 'auto' ? '' : language === 'fil' ? 'tl' : language,
      task: 'transcribe', tailPaddings: 300,
    } }),
  },
}
function localRecognizerConfig(directory, engine, language) {
  if (!Object.hasOwn(adapters, engine)) throw new Error('Unsupported engine')
  const adapter = adapters[engine]
  if (!adapter.languages.includes(language)) throw new Error('Unsupported language')
  return { contextSamples: adapter.contextSamples, config: { featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: {
    ...adapter.configure(directory, language), tokens: join(directory, 'tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0,
  } } }
}
module.exports = { localRecognizerConfig }
