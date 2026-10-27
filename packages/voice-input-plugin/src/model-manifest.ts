/*
 * [OUTPUT]: 2026-10-27 SenseVoiceSmall/Silero模型及完整许可的固定来源、字节和SHA256。
 * [INPUT]: Pinned SenseVoice INT8, Silero VAD and upstream license artifacts.
 * [OUTPUT]: Explicit on-demand download sizes and SHA-256; no model bytes in the application bundle.
 * [POS]: Reviewed plugin asset manifest; changing assets requires a new revision.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
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
