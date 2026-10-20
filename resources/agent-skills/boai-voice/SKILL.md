---
name: boai-voice
description: "Generate a spoken reply or WAV audio locally with Qwen3-TTS on Apple Silicon. Supports nine preset voices, emotion and real speed control. Use when the user asks for voice, speech or TTS."
---
<!--
[INPUT]: Alma voice/SKILL.md and its pinned local Qwen3-TTS provider.
[OUTPUT]: Actual offline speech and published WAV; no invented playback, cloud fallback or channel voice receipt.
[POS]: Product skill; optional runtime installed separately under BOAI's user-local tools directory.
[PROTOCOL]: Update Header, .folder.md and migration ledger when changed.
-->

# Voice — local Qwen3-TTS

Use the actual API `execute_command` or native command tool under the current employee's permissions. Readiness must be checked before claiming voice is unavailable. This does not require an API key and does not use the chat model for speech synthesis.

## Check the installed capability

The versioned runtime lives at:

```sh
voice_root="$HOME/Library/Application Support/BoAI Agent/tools/voice/qwen3-v1"
"$voice_root/venv/bin/python" "$voice_root/voice.py" status
```

`ready: true` means the installation receipt and model file sizes match. `validate` additionally hashes every model file; generation always validates hashes. If the runtime is missing or not ready, report the specific missing installation. Do not use Alma's private CLI, silently install packages/download weights, or switch to a cloud provider. BOAI's explicit optional installer is `python3.11 resources/capabilities/voice/setup.py --download` in a source checkout, or the distributed `capabilities/voice/setup.py`; it requires macOS arm64 and roughly 3.1 GB model storage plus dependencies. An installation request authorizes that setup, a request to speak alone does not.

## Generate

Use a new WAV path in the authorized current workspace. For API employees, the command's actual working directory maps to the runtime's supplied `self:/runs/<actual-run-id>/` prefix; use the actual mapping for later publication, never guess a run ID. Do not overwrite the user's file.

```sh
voice_root="$HOME/Library/Application Support/BoAI Agent/tools/voice/qwen3-v1"
"$voice_root/venv/bin/python" "$voice_root/voice.py" generate \
  --text 'The actual words the user requested.' \
  --voice serena --emotion 'warm and cheerful' --speed 1.0 \
  --output './reply.wav'
```

For arbitrary text, first write a UTF-8 text file with the actual file tool and use `--text-file './speech.txt'`; never interpolate untrusted text into shell code. `--text` and `--text-file` are mutually exclusive. Omit emotion when no special style is wanted. `--language` defaults to `auto` and supports `chinese`, `english`, `japanese`, `korean`, `french`, `german`, `russian`, `portuguese`, `spanish`, `italian`.

The only voice names are:

| Voice | Character/language from Alma's preset guide |
| --- | --- |
| serena | Female, lively English/Chinese; default |
| vivian | Female, warm Chinese |
| ono_anna | Female, Japanese |
| sohee | Female, Korean |
| uncle_fu | Male, mature Chinese |
| ryan | Male, deep English |
| aiden | Male, young English |
| eric | Male, professional English |
| dylan | Male, casual English |

Use these actual identifiers, not OpenAI voice names. Emotion is a natural-language style instruction, e.g. `cheerful`, `sad`, `whispering`, `narrator`. Its audible effect is model-dependent; don't promise it was heard or precisely reproduced without listening. Speed defaults to 1.0, typically 0.8–1.3; supported range 0.5–2.0. Non-default speed uses installed ffmpeg's pitch-preserving atempo because this fixed Qwen implementation ignores its native speed parameter.

Keep spoken replies brief when the user has not supplied a script. Preserve exact requested wording. The wrapper accepts up to 2,000 characters, splits into chunks of at most 200 and joins every generated segment in order. For longer scripts, agree on/explain the split and produce separate files; do not silently drop the ending. Only one generation runs at a time to avoid duplicate model memory use. Inspect the existing operation when busy; no blind repeated attempts. A cancelled or failed command is not an audio delivery.

## Deliver the real result

Successful JSON includes the actual path, duration, sample rate, hash, voice, speed and segment count. Verify that receipt, then use `publish_artifact` (or the supplied native publication tool) on the real WAV. Wait for the original publication receipt. Tell the user briefly that the audio is ready; do not dump receipt fields or read the entire spoken script back unless requested. Preserve the file after publication.

This integration is **on-demand WAV generation**. BOAI does not yet implement Alma's `tts auto off/inbound/always`, persistent provider/voice preferences, OpenAI TTS fallback or automatic Telegram voice-message conversion. Don't claim an automatic voice mode was enabled or that an audio file card is a Telegram voice message. Use a real available channel tool only for an explicitly authorized send and check its schema/receipt. Avoid generating duplicate manual audio for a system that already delivered an automatic voice reply.
