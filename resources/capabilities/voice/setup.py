#!/usr/bin/env python3
# [INPUT]: Explicit install intent, fixed dependencies and model manifest.
# [OUTPUT]: Versioned user-local venv/model with verified files and completion receipt.
# [POS]: Optional capability installer, never called on app startup or generation.
# [PROTOCOL]: Update Header and .folder.md on change.
import argparse
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from voice import DEFAULT_ROOT, RUNTIME_VERSION, digest, exclusive, verify_model

def main():
    parser = argparse.ArgumentParser(description="Install BOAI local Qwen3 voice (about 3.1 GB model plus dependencies)")
    parser.add_argument("--download", action="store_true", required=True)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64" or sys.version_info[:2] != (3, 11):
        raise ValueError("Install with Apple Silicon Python 3.11")
    source, root = Path(__file__).resolve().parent, args.root.absolute()
    root.mkdir(parents=True, exist_ok=True)
    with exclusive(root):
        names = ["voice.py", "setup.py", "requirements.txt", "model-manifest.json", "mlx-audio-LICENSE.txt"]
        expected = {name: digest(source / name) for name in names}
        for name in names:
            target = root / name
            if target.exists() and digest(target) != expected[name]:
                raise ValueError("Existing runtime differs; preserve it and select a new --root: " + name)
        if (root / "installed.json").exists():
            receipt = json.loads((root / "installed.json").read_text())
            if receipt.get("sources") != expected:
                raise ValueError("Existing installation differs; inspect original receipt")
            verify_model(root)
            print(json.dumps({"installed": True, "existing": True, "root": str(root)})); return
        if shutil.disk_usage(root).free < 6 * 1024 ** 3:
            raise ValueError("At least 6 GiB free space is required for installation")
        for name in names:
            if not (root / name).exists():
                shutil.copyfile(source / name, root / name)
        python = root / "venv/bin/python"
        if not python.exists():
            subprocess.run([sys.executable, "-m", "venv", str(root / "venv")], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "-r", str(root / "requirements.txt")], check=True)
        manifest = json.loads((root / "model-manifest.json").read_text())
        # No token lookup, moving branch or implicit replacement of another local model.
        program = "from huggingface_hub import snapshot_download; import json,sys; m=json.load(open(sys.argv[1])); snapshot_download(repo_id=m['repository'],revision=m['revision'],local_dir=sys.argv[2],allow_patterns=[f['path'] for f in m['files']],token=False,max_workers=2)"
        subprocess.run([str(python), "-c", program, str(root / "model-manifest.json"), str(root / "model")], check=True)
        verify_model(root)
        subprocess.run([str(python), "-c", "import mlx.core,mlx_audio.tts.utils,soundfile"], check=True)
        (root / "installed.json").write_text(json.dumps({"version": RUNTIME_VERSION, "sources": expected, "modelRevision": manifest["revision"]}, indent=2) + "\n")
        print(json.dumps({"installed": True, "root": str(root), "modelRevision": manifest["revision"]}))

if __name__ == "__main__":
    main()
