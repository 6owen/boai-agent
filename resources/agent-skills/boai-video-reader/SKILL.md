---
name: boai-video-reader
description: "Inspect a video or audio file using an actual configured media provider, or sample video frames and read them as images when native video analysis is unavailable. Keep visual, motion and audio evidence distinct."
---
<!--
[OUTPUT]: 批量有序读图、原命令到逻辑路径映射与抽样结论边界；简短回答仍提交原真实工作回执。
[INPUT]: Alma video-reader/SKILL.md, actual BOAI media tools and installed ffprobe/ffmpeg.
[OUTPUT]: Native-provider discovery or bounded frame analysis through read_image, with truthful audio and sampling limits.
[POS]: Product skill; reuses original commands, file access and image input, not an Alma CLI emulator.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Video Reader

Read the user's requested file and answer the actual question. Do not automatically generate a transcript, thumbnail sheet or report for a simple question.

## Prefer native video when available

Alma's first choice is Gemini native video analysis. BOAI does not currently ship an equivalent `video.analyze` operation. Do not run `alma video analyze`, invent a BOAI command, treat `read_image` as a video tool, or claim a configured text model can hear/watch video.

If the current tool catalog includes an authorized native video provider, inspect its actual schema and use it for motion/audio questions. Respect the user's local-only or no-upload requirements. A connection named Gemini alone is not a video upload/analysis tool. If no native video tool is supplied, or that actual call fails, explain briefly that you are using sampled frames. Do not install providers, fetch credentials from private files, or upload to a new service to conceal missing capability.

## Inspect the source

Use the actual API `execute_command` or native command tool in the authorized workspace. Resolve the real path from the user's file/attachment; preserve it. Check installed tools and inspect metadata:

```sh
command -v ffprobe
command -v ffmpeg
ffprobe -v error -show_entries format=duration:stream=index,codec_type,codec_name,width,height,sample_rate,channels -of json "$video_path"
```

Metadata answers duration, dimensions and whether an audio stream exists. It does not show the scene or tell you what someone said. If tools are absent, report that observed limit; do not install packages unless requested. Stop after metadata when that is all the user asked for.

## Sample frames as a fallback

Use a new directory under the tool's current authorized workspace. Keep at most 12 frames, at most one per second, and at most 720 pixels wide. Compute the rate from the actual positive duration: `min(1, 12 / durationSeconds)`. Use adequate precision for long clips; do not truncate the duration or round the rate to zero. These are sampled moments, not continuous viewing.

```sh
frames_dir=$(mktemp -d './video-frames.XXXXXX') || exit 1
# frame_rate is computed from the inspected positive duration, not guessed.
ffmpeg -nostdin -hide_banner -loglevel error -n -i "$video_path" \
  -map 0:v:0 -an -vf "fps=$frame_rate,scale=w='min(720,iw)':h=-2" \
  -frames:v 12 "$frames_dir/frame_%02d.jpg"
```

For a sub-second clip or an empty sampling result, extract one actual frame instead; do not claim the file has no visual content just because the sampling interval missed it. Inspect the emitted file list before reading. On API employees, use **`read_image`** on the actual frame paths; it sends image bytes to the model. Native employees use their real image-reading tool. Do not use `read_file` for binary images or dump base64 to command output.

On API employees, pass the ordered frame paths as one `read_image` call: its `path` field accepts an array. Stay within that tool's total byte limit. The command's default workspace and API logical file paths are different representations of the same run directory: use the current `self:/runs/<actual-run-id>/...` prefix supplied by the tool/runtime, followed by the relative frame path. Do not pass an internal BOAI storage absolute path as an external business directory or guess a run ID. If a business cwd was explicitly selected, follow the tools' actual cwd rules.

Read enough sampled frames to answer, preserving their actual order. If the chosen model/provider rejects images, report that failure; paths, successful extraction and metadata do not establish sight. Describe what those sampled moments show. Identical sampled frames do not establish what happened between them: they cannot prove a hard cut, no fade, no brief object, or an exact transition time. For a general overview, keep that uncertainty rather than adding extra scene/pixel analysis. For an explicitly timing-sensitive question, use actual frame timestamps or inspect the requested interval; never present a sample index as an event time.

## Audio and speech

No audio stream means this file contains no encoded audio stream. It does not justify inventing speech or a soundtrack. An audio stream's presence is not proof of intelligible speech.

If speech is requested, use a real authorized transcription tool, or a currently installed Whisper CLI and its available model. Verify availability first; do not claim a transcript when the tool/model is missing. Keep extraction and transcription in the same unique workspace directory and use that exact path:

```sh
ffmpeg -nostdin -hide_banner -loglevel error -n -i "$video_path" \
  -map 0:a:0 -vn -acodec pcm_s16le -ar 16000 -ac 1 "$frames_dir/audio.wav"
# Only with an installed transcription CLI AND an available model:
whisper "$frames_dir/audio.wav" --model "$available_model" --output_format txt --output_dir "$frames_dir/transcript"
```

A transcript supports words, not unobserved gestures or background sounds. Without audio input/transcription, say only what was actually read. For audio properties or a spectrum, use `boai-music-listener`.

## Deliver and clean up

For a brief overview, answer in one or two natural sentences: the observed change, the audio finding if asked, and a short sampling qualifier. Do not narrate every command, skill lookup, frame dimension or cleanup step unless the user asks for the method. Keep the fuller evidence in the actual `report_work` call when that task tool is supplied; submit it before the final reply, using observed evidence. A short public answer does not replace the required work receipt.

Publish files only when requested, using `publish_artifact` and its real receipt. Never claim playback, listening, full-video understanding, original-file checksums or unchanged timestamps unless the actual operations establish those facts. Extracted frames are generated temporary files even if later deleted; do not say that no files were created.

Only remove temporary files created by this task after finishing their reads and any requested publication. Use exact recorded paths within the newly created directory; never delete the original or use broad `/tmp` globs. A failed run leaves its evidence available for diagnosis.
