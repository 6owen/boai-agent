/*
 * [OUTPUT]: Qwen3-ASR-0.6B INT8固定ModelScope提交/上游SHA256与Apache许可，显式下载后才可选。
 * [OUTPUT]: 2026-10-28 SenseVoiceSmall、Whisper Tiny/Base多语言INT8目录及独立资源/许可固定校验。
 * [INPUT]: Pinned SenseVoice/Whisper/Qwen3 INT8, Silero VAD and complete upstream license artifacts.
 * [OUTPUT]: Explicit on-demand download sizes and SHA-256; no model bytes in the application bundle.
 * [POS]: Reviewed plugin asset manifest; changing assets requires a new revision.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { voiceModelLanguages, type VoiceModelId, type VoiceLanguage } from '@boai/shared/plugins/voice-input'

export const voiceModelRevision = 'sensevoice-20240717-silero-066409f3-v1'
export const voiceModelAssets = [
  {"name": "FUNASR-MODEL-LICENSE.txt", "url": "https://raw.githubusercontent.com/modelscope/FunASR/58830eca4012644aac0c3218c3ccc7d98f003fda/MODEL_LICENSE", "bytes": 5306, "sha256": "7dba975a2069691db4992b0592d70828b330d2f8a30a71450f4e152a554e84f8"},
  {
    "name": "model.int8.onnx",
    "url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/model.int8.onnx",
    "bytes": 239233841,
    "sha256": "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51"
  },
  {
    "name": "tokens.txt",
    "url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/tokens.txt",
    "bytes": 315894,
    "sha256": "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc"
  },
  {
    "name": "MODEL-NOTICE.txt",
    "url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/LICENSE",
    "bytes": 71,
    "sha256": "221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17"
  },
  {
    "name": "silero-vad.onnx",
    "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/src/silero_vad/data/silero_vad.onnx",
    "bytes": 2327524,
    "sha256": "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
  },
  {
    "name": "SILERO-LICENSE.txt",
    "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/LICENSE",
    "bytes": 1075,
    "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b"
  },
  {
    "name": "SENSEVOICE-LICENSE.txt",
    "url": "https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/586bbdb2b052f4fe19322581825228b6810a9fb3/LICENSE",
    "bytes": 1062,
    "sha256": "4bc3bffe14ebe38cc67309991e04f92866835eac1c5e2e1abd37163f67c6de5f"
  }
] as const
export const voiceModelBytes = voiceModelAssets.reduce((total, item) => total + item.bytes, 0)

export interface VoiceModelAsset { name: string; url: string; bytes: number; sha256: string }
export interface VoiceModelDefinition {
  id: VoiceModelId
  name: string
  languages: readonly VoiceLanguage[]
  licenseUrl: string
  revision: string
  assets: readonly VoiceModelAsset[]
  engine: 'sensevoice' | 'whisper' | 'qwen3'
}
const whisperAssets = {
  tiny: [
    {
      "name": "decoder.int8.onnx",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/65176e2deb88badc814a94058666cadccc29b61c/tiny-decoder.int8.onnx",
      "bytes": 89855401,
      "sha256": "d2fece8dd42771f1df975c6c0445770d0c292bf7547c2cae04a6c0cc57540925"
    },
    {
      "name": "encoder.int8.onnx",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/65176e2deb88badc814a94058666cadccc29b61c/tiny-encoder.int8.onnx",
      "bytes": 12937772,
      "sha256": "d24fb083ae3b1041fc24e97971d60e280c9342201fbb67b0ab428a8b4a51a434"
    },
    {
      "name": "tokens.txt",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/65176e2deb88badc814a94058666cadccc29b61c/tiny-tokens.txt",
      "bytes": 816730,
      "sha256": "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"
    },
    {
      "name": "silero-vad.onnx",
      "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/src/silero_vad/data/silero_vad.onnx",
      "bytes": 2327524,
      "sha256": "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
    },
    {
      "name": "SILERO-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/LICENSE",
      "bytes": 1075,
      "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b"
    },
    {
      "name": "WHISPER-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/openai/whisper/86098128c0b4f24f0e2aa2994de830614b474227/LICENSE",
      "bytes": 1063,
      "sha256": "b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"
    },
    {
      "name": "SHERPA-ONNX-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/2505cca5d7d5806bf3bdbd1db717100123fac005/LICENSE",
      "bytes": 11358,
      "sha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
    }
  ],
  base: [
    {
      "name": "decoder.int8.onnx",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/bb53ee204431c90d314c1cc08d28d23e5b7927cc/base-decoder.int8.onnx",
      "bytes": 130672026,
      "sha256": "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d"
    },
    {
      "name": "encoder.int8.onnx",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/bb53ee204431c90d314c1cc08d28d23e5b7927cc/base-encoder.int8.onnx",
      "bytes": 29120534,
      "sha256": "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11"
    },
    {
      "name": "tokens.txt",
      "url": "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/bb53ee204431c90d314c1cc08d28d23e5b7927cc/base-tokens.txt",
      "bytes": 816730,
      "sha256": "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"
    },
    {
      "name": "silero-vad.onnx",
      "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/src/silero_vad/data/silero_vad.onnx",
      "bytes": 2327524,
      "sha256": "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
    },
    {
      "name": "SILERO-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/LICENSE",
      "bytes": 1075,
      "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b"
    },
    {
      "name": "WHISPER-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/openai/whisper/86098128c0b4f24f0e2aa2994de830614b474227/LICENSE",
      "bytes": 1063,
      "sha256": "b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"
    },
    {
      "name": "SHERPA-ONNX-LICENSE.txt",
      "url": "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/2505cca5d7d5806bf3bdbd1db717100123fac005/LICENSE",
      "bytes": 11358,
      "sha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
    }
  ],
} as const

// The converter linked by sherpa-onnx publishes hashes and sizes in ModelScope's file metadata.
// Tokenizer files live at the installation root, which is passed as the tokenizer directory.
const qwen3ModelSource = 'https://modelscope.cn/models/zengshuishui/Qwen3-ASR-onnx/resolve/de9e449eb376dcb472c1ce8141fbae8d524fabbd'
const qwen3LicenseUrl = 'https://raw.githubusercontent.com/QwenLM/Qwen3-ASR/7c6daf77a2421100f5fb066495372c00129d39ff/LICENSE'
const qwen3Assets: readonly VoiceModelAsset[] = [
  { name: 'conv_frontend.onnx', url: `${qwen3ModelSource}/model_0.6B/conv_frontend.onnx`, bytes: 44148281, sha256: 'd22dc4423e0940e49884e903d2ea2f7e5567c14fc1aed97e4e26d6b8f208ef9e' },
  { name: 'encoder.int8.onnx', url: `${qwen3ModelSource}/model_0.6B/encoder.int8.onnx`, bytes: 182491662, sha256: '60748d3e6744a57c9c91e1b17424a6c2990567e8adceb0783940c03ed98fa9d9' },
  { name: 'decoder.int8.onnx', url: `${qwen3ModelSource}/model_0.6B/decoder.int8.onnx`, bytes: 755914231, sha256: '4f6885be5959ae26af3089d38ee7972c5fafbeeb1cf8d5e76eab6d8b61ca5771' },
  { name: 'merges.txt', url: `${qwen3ModelSource}/tokenizer/merges.txt`, bytes: 1671853, sha256: '8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5' },
  { name: 'vocab.json', url: `${qwen3ModelSource}/tokenizer/vocab.json`, bytes: 2776833, sha256: 'ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910' },
  { name: 'tokenizer_config.json', url: `${qwen3ModelSource}/tokenizer/tokenizer_config.json`, bytes: 12487, sha256: '4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c' },
  { name: 'QWEN3-ASR-LICENSE.txt', url: qwen3LicenseUrl, bytes: 11343, sha256: 'a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655' },
  ...whisperAssets.tiny.filter(asset => ['silero-vad.onnx', 'SILERO-LICENSE.txt', 'SHERPA-ONNX-LICENSE.txt'].includes(asset.name)),
]

export const voiceModelCatalog: readonly VoiceModelDefinition[] = [
  { id: 'sensevoice-small', name: 'SenseVoiceSmall', languages: voiceModelLanguages('sensevoice-small'), engine: 'sensevoice', revision: voiceModelRevision, assets: voiceModelAssets, licenseUrl: 'https://github.com/modelscope/FunASR/blob/58830eca4012644aac0c3218c3ccc7d98f003fda/MODEL_LICENSE' },
  { id: 'whisper-tiny', name: 'Whisper Tiny', languages: voiceModelLanguages('whisper-tiny'), engine: 'whisper', revision: 'whisper-tiny-65176e2-silero-066409f3-v1', assets: whisperAssets.tiny, licenseUrl: 'https://github.com/openai/whisper/blob/86098128c0b4f24f0e2aa2994de830614b474227/LICENSE' },
  { id: 'whisper-base', name: 'Whisper Base', languages: voiceModelLanguages('whisper-base'), engine: 'whisper', revision: 'whisper-base-bb53ee2-silero-066409f3-v1', assets: whisperAssets.base, licenseUrl: 'https://github.com/openai/whisper/blob/86098128c0b4f24f0e2aa2994de830614b474227/LICENSE' },
  { id: 'qwen3-asr-0.6b', name: 'Qwen3-ASR-0.6B', languages: voiceModelLanguages('qwen3-asr-0.6b'), engine: 'qwen3', revision: 'qwen3-asr-0.6b-de9e449-silero-066409f3-v1', assets: qwen3Assets, licenseUrl: qwen3LicenseUrl },
]
export function getVoiceModel(id: VoiceModelId): VoiceModelDefinition {
  const model = voiceModelCatalog.find(model => model.id === id)
  if (!model) throw new Error('不支持的本地语音模型')
  return model
}
