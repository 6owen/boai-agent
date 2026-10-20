---
name: boai-music-listener
description: "Inspect a shared audio/music file with ffprobe, create a spectrogram with ffmpeg, and transcribe using an installed speech provider. Discuss only what the actual metadata, audio or transcript supports."
---
<!--
[INPUT]: Alma music-listener/SKILL.md and BOAI authorized command/file/publication tools.
[OUTPUT]: Real audio metadata, optional spectrum/transcription and evidence-grounded commentary.
[POS]: Bound product media workflow; installed CLI or actual audio model supplies the capability.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Music Listener

Use when the user shares an audio/music file or asks about a song. Work on the actual authorized file. For API employees use `execute_command`; native employees use their command tool. Discover installed `ffprobe`, `ffmpeg` and, when transcription is requested, `whisper` or an actual configured speech provider. Follow the original permission flow. Never silently install software/download model weights or upload local audio to an unrelated service.

## 1. Inspect the audio

Run against the real file, safely quoted (resolve leading-dash filenames to absolute paths):

```sh
ffprobe -v error -print_format json -show_format -show_streams "$input"
```

Read actual duration, codec, channels, sample rate and tags. Title/artist/album tags are supplied metadata, not verified identity. Missing tags remain unknown. A failed probe is not proof of a corrupt file; preserve the actual diagnostic. Do not read binary audio with the UTF-8 `read_file` tool or print base64.

## 2. Generate a spectrogram when useful

Create a unique output directory in the current authorized workspace (`mktemp -d './music.XXXXXX'`), or use the user's explicit output path. Keep the original audio unchanged and refuse to overwrite an existing destination.

```sh
ffmpeg -nostdin -v error -n -i "$input" \
  -lavfi 'showspectrumpic=s=800x200:mode=combined:color=intensity' \
  -frames:v 1 "$spectrum"
```

For long audio (>10 minutes), inspect its duration first and choose a representative bounded segment, naming the sampled interval. Do not claim the rest was analyzed. For example, where that interval actually exists:

```sh
ffmpeg -nostdin -v error -n -ss 60 -t 120 -i "$input" \
  -acodec pcm_s16le -ar 16000 -ac 1 "$segment"
```

Verify the generated image with installed media tools and publish it if requested. Use a real available vision input to inspect it; a text-only model must not claim to have viewed the image. A spectrogram shows frequency/energy structure. It does not by itself establish melody, instrumentation, lyrics, genre, mood or song identity. Do not turn a frequency plot into an invented listening experience.

## 3. Transcribe only with an available provider

For installed Whisper, first create a mono 16 kHz WAV in the unique output directory, then run the actual available CLI:

```sh
ffmpeg -nostdin -v error -n -i "$input" -acodec pcm_s16le -ar 16000 -ac 1 "$wav"
# Only after verifying the CLI and local model are available:
whisper "$wav" --model turbo --output_format txt --output_dir "$transcript_dir"
```

Use exact files returned by the run rather than combining every old transcript in a shared directory. Model downloads require the user's installation intent; a missing local model must not trigger an implicit download. Singing and background music can yield wrong or invented transcript words. Mark uncertainty, compare with actual audio when supported, and do not invent missing lyrics. If Whisper/audio input is unavailable, report the specific unperformed step. Metadata analysis and spectrum generation remain useful on their own.

## 4. Respond naturally from the evidence

Keep a short clip's response brief. For a full song, discuss the features actually heard with an audio-capable provider, or identify which observations came from metadata/transcription. Label uncertain interpretations. Never claim you listened just because ffprobe succeeded. Do not infer an artist or genre from an uninformative filename.

If real audio input supports an opinion, share it naturally without forced enthusiasm. If only file properties are available, give those facts plainly rather than pretending to hear instruments. For the user's own music, be specific and respectful. Preserve requested scope: do not generate a spectrum, transcribe, extract a clip or publish extra files when the user only asked for duration.

Deliver requested files through `publish_artifact` and verify the receipt. Do not delete the user's source. Remove only known scratch files created by this task when no longer needed; no broad recursive cleanup of shared temporary directories.
