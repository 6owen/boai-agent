#!/usr/bin/env python3
# [INPUT]: Fixed local Qwen3-TTS model, explicit text/output and optional voice/style/speed.
# [OUTPUT]: Verified WAV and JSON receipt; no download, playback, upload or overwrite.
# [POS]: BOAI optional voice capability; MLX is loaded only by generate.
# [PROTOCOL]: Update Header and .folder.md when changing this file.
import argparse
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

RUNTIME_VERSION = "qwen3-v1"
VOICES = ("serena", "vivian", "ono_anna", "sohee", "uncle_fu", "ryan", "aiden", "eric", "dylan")
DEFAULT_ROOT = Path.home() / "Library/Application Support/BoAI Agent/tools/voice" / RUNTIME_VERSION


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_model(root, full=True):
    manifest = json.loads((root / "model-manifest.json").read_text())
    for item in manifest["files"]:
        file = root / "model" / item["path"]
        if not file.is_file() or file.is_symlink() or file.stat().st_size != item["bytes"]:
            raise ValueError("Local model file missing or incomplete: " + item["path"])
        if full and digest(file) != item["sha256"]:
            raise ValueError("Local model hash mismatch: " + item["path"])
    return manifest


def status(root, full=False):
    try:
        receipt = json.loads((root / "installed.json").read_text())
        if receipt["version"] != RUNTIME_VERSION or not (root / "venv/bin/python").is_file():
            raise ValueError("Runtime installation incomplete")
        for name, expected in receipt["sources"].items():
            if digest(root / name) != expected:
                raise ValueError("Runtime source changed: " + name)
        manifest = verify_model(root, full)
        return {"ready": True, "provider": "local-qwen3", "root": str(root), "voices": VOICES,
                "modelRevision": manifest["revision"], "validation": "sha256" if full else "sizes",
                "ffmpeg": shutil.which("ffmpeg"), "autoVoice": "unsupported"}
    except (OSError, ValueError, KeyError) as error:
        return {"ready": False, "root": str(root), "reason": str(error), "autoVoice": "unsupported"}


def chunks(text):
    # Keep every input character except surrounding whitespace; never discard later sentences.
    pieces = re.split(r"(?<=[。！？.!?\n])", text.strip())
    return [part[offset:offset + 200] for part in pieces if part.strip()
            for offset in range(0, len(part), 200)]


def validate_request(text, voice, speed, output):
    if not text.strip() or len(text) > 2000:
        raise ValueError("Text must contain 1–2000 characters; split longer deliverables explicitly")
    if voice not in VOICES:
        raise ValueError("Unknown voice; supported: " + ", ".join(VOICES))
    if not math.isfinite(speed) or not 0.5 <= speed <= 2:
        raise ValueError("Speed must be between 0.5 and 2.0")
    if output.suffix.lower() != ".wav":
        raise ValueError("Output must be a WAV path")
    if output.exists() or output.is_symlink():
        raise FileExistsError("Output already exists; choose a new path")
    if not output.parent.is_dir():
        raise ValueError("Output parent directory does not exist")
    if speed != 1 and not shutil.which("ffmpeg"):
        raise ValueError("Non-default speed requires ffmpeg; nothing generated")


@contextlib.contextmanager
def exclusive(root):
    import fcntl
    with (root / ".runtime.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Voice runtime is busy; inspect the existing operation") from None
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def generate(root, text, output, voice, emotion, speed, language):
    validate_request(text, voice, speed, output)
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise ValueError("Local Qwen3 requires Apple Silicon macOS")
    ready = status(root, full=True)
    if not ready["ready"]:
        raise ValueError(ready["reason"])
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_IMPLICIT_TOKEN="1", TOKENIZERS_PARALLELISM="false")
    with exclusive(root), tempfile.TemporaryDirectory(prefix=".boai-voice-", dir=output.parent) as scratch:
        # Import/model diagnostics stay off the machine-readable receipt stream.
        with contextlib.redirect_stdout(sys.stderr):
            import numpy as np
            import soundfile as sf
            from mlx_audio.tts.utils import load_model
            model = load_model(str(root / "model"))
            segments = chunks(text)
            audio, rate = [], None
            for segment in segments:
                produced = False
                for result in model.generate(text=segment, voice=voice, instruct=emotion or "Speak naturally",
                                             lang_code=language, max_tokens=4096, verbose=False, stream=False):
                    samples = np.asarray(result.audio, dtype=np.float32).reshape(-1)
                    if not samples.size or not np.isfinite(samples).all() or (rate and rate != result.sample_rate):
                        raise ValueError("Invalid audio returned by local model")
                    rate = result.sample_rate
                    audio.append(samples)
                    produced = True
                if not produced:
                    raise ValueError("Local model returned no audio for a segment")
            raw = Path(scratch) / "natural.wav"
            combined = np.concatenate(audio)
            if float(np.max(np.abs(combined))) == 0:
                raise ValueError("Local model returned silent audio")
            sf.write(str(raw), combined, rate, subtype="PCM_16")
            result_path = raw
            # The pinned Qwen model ignores its speed argument; apply real pitch-preserving tempo.
            if speed != 1:
                result_path = Path(scratch) / "paced.wav"
                subprocess.run([shutil.which("ffmpeg"), "-nostdin", "-v", "error", "-n", "-i", str(raw),
                                "-af", f"atempo={speed}", "-c:a", "pcm_s16le", str(result_path)], check=True, timeout=120)
            info = sf.info(str(result_path))
            if info.frames <= 0 or info.samplerate != rate:
                raise ValueError("Generated WAV validation failed")
            # Same-directory hard link commits atomically and refuses an intervening destination.
            os.link(result_path, output)
    return {"path": str(output), "provider": "local-qwen3", "voice": voice, "emotion": emotion,
            "speed": speed, "segments": len(segments), "sampleRate": info.samplerate,
            "frames": info.frames, "durationSeconds": info.duration, "bytes": output.stat().st_size,
            "sha256": digest(output), "modelRevision": ready["modelRevision"]}


def main():
    parser = argparse.ArgumentParser(description="BOAI offline Qwen3 voice")
    parser.add_argument("command", choices=["status", "validate", "generate"])
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--text")
    parser.add_argument("--text-file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--voice", default="serena", choices=VOICES)
    parser.add_argument("--emotion", default="")
    parser.add_argument("--speed", type=float, default=1)
    parser.add_argument("--language", default="auto", choices=["auto", "chinese", "english", "japanese", "korean", "french", "german", "russian", "portuguese", "spanish", "italian"])
    args = parser.parse_args()
    try:
        if args.command != "generate":
            result = status(args.root, full=args.command == "validate")
        else:
            if (args.text is None) == (args.text_file is None) or not args.output:
                parser.error("generate requires exactly one of --text/--text-file and --output")
            text = args.text if args.text is not None else args.text_file.read_text(encoding="utf-8")
            result = generate(args.root, text, args.output.absolute(), args.voice, args.emotion, args.speed, args.language)
        print(json.dumps(result, ensure_ascii=False))
        return 1 if result.get("ready") is False else 0
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
