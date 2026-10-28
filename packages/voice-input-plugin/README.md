<!--
[OUTPUT]: 2026-10-28 v3多模型选择、独立资源生命周期及SenseVoice/Whisper引擎适配器；真实验证见第19组12第7节。
[OUTPUT]: 2026-10-27 v2配置、识别语言、指定麦克风、设备授权与高级整理规则接线。
[OUTPUT]: 2026-10-27 2026-10-27三目标源码候选：默认持续执行、重复轨迹复核/恢复现场与默认关闭语音插件；实际及未验范围归27组01第12节、19组12第7节。
[INPUT]: Desktop voice contract, pinned ASR assets and explicit opt-in settings.
[OUTPUT]: Package ownership, model attribution and validation boundaries.
[POS]: Optional voice application plugin package entry.
[PROTOCOL]: Update Header and .folder.md when changed.
-->
# Voice input

- Application plugin `boai.voice-input`, disabled by default. Capture and preview belong to the active Composer; message sending remains explicit.
- `@boai/shared/plugins/voice-input` owns the protocol. This package implements capture, settings, model installation, local helper and the single Qwen Realtime adapter. Electron owns microphone permission, credentials and utility processes.
- Local ASR uses SenseVoiceSmall by FunAudioLLM or multilingual Whisper Tiny/Base by OpenAI, with pinned sherpa-onnx INT8 conversions and Silero VAD. Models can coexist; the saved selection determines the recognizer. Local ASR and disabled refinement do not send audio or text to a cloud model. Models are downloaded only by an explicit user action, without changing the selection.
- Source, revision, bytes and SHA256 for every weight, token and license file are frozen in `src/model-manifest.ts`. For SenseVoice, the downloader installs full `MODEL_LICENSE`, code MIT license and Silero MIT license; the short upstream notice is retained separately. SenseVoice weights use the FunASR Model License v1.1, not the code's MIT license.
- The preceding FunASR license applies to SenseVoice. Whisper distributions carry their own upstream license. `local-recognizers.cjs` owns engine-specific loading and parameter conversion; the helper owns shared VAD, file reading and IPC completion. Tiny/Base share the Whisper adapter and differ through their model manifests.
- Qwen accepts 16 kHz mono PCM. Temporary previews never write the draft. Final segments are ordered by source item, and interrupted recordings only offer explicitly confirmed text for manual insertion. No automatic retry, reupload or provider fallback.
- Optional refinement uses a separately selected Chat Completions connection, only current dictation and explicit terminology. Raw text remains available immediately; later edits invalidate replacement. Each insertion/replacement has its own undo boundary.
- Audio is spooled to private temporary files, decoded in an isolated helper and removed after actual exit; startup discards abandoned recordings. Buffer limits and segment sizes bound memory, not total task or recording duration.
- Usage metadata uses the existing bounded desktop diagnostic journal; missing provider usage stays unknown. This is not a permanent billing ledger or an estimated invoice.
- Implementation progress and validation limitations are maintained in [voice acceptance](../../ai-docs/spec/19.应用插件架构/12-语音输入插件实施与验收.md#7-唯一实际进度). No test or live-provider certification follows from this README.

- Voice settings v3 projects v1/v2 without rewriting on read; explicit save persists the local model selection, language, microphone device and additional refinement preferences. Legacy selection and installation continue to use SenseVoiceSmall. Local/online language hints are checked against the selected engine and passed to their actual providers.
- Settings microphone authorization uses a temporary mutually exclusive lease and closes its probe stream; it does not invoke ASR. The application shortcut is owned by the shared shortcut preferences and defaults to disabled/unbound.
