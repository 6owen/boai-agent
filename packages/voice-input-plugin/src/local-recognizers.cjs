/*
 * [INPUT]: Trusted catalog engine, verified resource directory and explicit recognition language.
 * [OUTPUT]: SenseVoice/Whisper/Qwen3 sherpa-onnx configurations, per-stream language options and bounded segment context.
 * [POS]: Local ASR adapter registry; model sizes and resource versions belong to model-manifest.ts.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
const { join } = require('node:path')
const qwen3Languages = {
  zh: 'Chinese', yue: 'Cantonese', en: 'English', ja: 'Japanese', ko: 'Korean',
  de: 'German', ru: 'Russian', fr: 'French', pt: 'Portuguese', ar: 'Arabic', it: 'Italian',
  es: 'Spanish', hi: 'Hindi', id: 'Indonesian', th: 'Thai', tr: 'Turkish', vi: 'Vietnamese',
  cs: 'Czech', da: 'Danish', fil: 'Filipino', fi: 'Finnish', ms: 'Malay', pl: 'Polish', sv: 'Swedish',
  nl: 'Dutch', fa: 'Persian', el: 'Greek', hu: 'Hungarian', mk: 'Macedonian', ro: 'Romanian',
}
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
  qwen3: {
    contextSamples: 3200,
    languages: ['auto', ...Object.keys(qwen3Languages)],
    configure: directory => ({ tokens: '', qwen3Asr: {
      convFrontend: join(directory, 'conv_frontend.onnx'),
      encoder: join(directory, 'encoder.int8.onnx'), decoder: join(directory, 'decoder.int8.onnx'),
      tokenizer: directory,
    } }),
    streamOptions: language => language === 'auto' ? {} : { language: qwen3Languages[language] },
  },
}
function localRecognizerConfig(directory, engine, language) {
  if (!Object.hasOwn(adapters, engine)) throw new Error('Unsupported engine')
  const adapter = adapters[engine]
  if (!adapter.languages.includes(language)) throw new Error('Unsupported language')
  return { contextSamples: adapter.contextSamples, streamOptions: adapter.streamOptions?.(language) ?? {}, config: { featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: {
    tokens: join(directory, 'tokens.txt'), ...adapter.configure(directory, language), numThreads: 2, provider: 'cpu', debug: 0,
  } } }
}
module.exports = { localRecognizerConfig }
