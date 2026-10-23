# [INPUT]: Local voice wrapper and temporary files; no model dependencies/network.
# [OUTPUT]: Missing/corrupt runtime, output preservation, complete segments, exclusive runs and real atempo checks.
# [POS]: Offline capability regression, not an audio quality evaluation.
# [PROTOCOL]: Update Header and tests/.folder.md on change.
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("boai_voice", Path(__file__).parents[1] / "resources/capabilities/voice/voice.py")
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


class VoiceBoundaries(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec("numpy") and importlib.util.find_spec("soundfile"), "Use installed voice venv for audio pipeline regression")
    def test_every_segment_is_written_and_speed_changes_actual_duration(self):
        import numpy as np
        import soundfile as sf
        import shutil
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg unavailable")
        spoken = []
        class Model:
            def generate(self, **args):
                spoken.append(args)
                # Deterministic provider fixture, not real speech or quality evidence.
                yield types.SimpleNamespace(audio=0.2 * np.sin(2 * np.pi * 440 * np.arange(24000) / 24000), sample_rate=24000)
        provider = types.ModuleType("mlx_audio.tts.utils")
        provider.load_model = lambda _: Model()
        with tempfile.TemporaryDirectory() as directory, patch.dict("sys.modules", {"mlx_audio.tts.utils": provider}), patch.object(voice, "status", return_value={"ready": True, "modelRevision": "controlled-fixture"}), patch.object(voice.platform, "system", return_value="Darwin"), patch.object(voice.platform, "machine", return_value="arm64"):
            root = Path(directory)
            natural = voice.generate(root, "First. Second.", root / "natural.wav", "serena", "calm", 1, "english")
            paced = voice.generate(root, "First. Second.", root / "paced.wav", "serena", "calm", 1.2, "english")
            self.assertEqual([call["text"] for call in spoken], ["First.", " Second."] * 2)
            self.assertEqual(natural["segments"], 2)
            self.assertAlmostEqual(natural["durationSeconds"], 2, delta=0.01)
            self.assertAlmostEqual(paced["durationSeconds"], 2 / 1.2, delta=0.05)
            self.assertEqual(sf.info(str(root / "paced.wav")).frames, paced["frames"])
            self.assertEqual(voice.digest(root / "paced.wav"), paced["sha256"])

    def test_missing_runtime_remains_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "missing"
            self.assertFalse(voice.status(root)["ready"])
            self.assertFalse(root.exists())

    def test_existing_output_is_not_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "keep.wav"
            output.write_bytes(b"original")
            with self.assertRaises(FileExistsError):
                voice.validate_request("hello", "serena", 1, output)
            self.assertEqual(output.read_bytes(), b"original")

    def test_dangling_link_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "keep.wav"
            output.symlink_to(Path(directory) / "absent")
            with self.assertRaises(FileExistsError):
                voice.validate_request("hello", "serena", 1, output)
            self.assertTrue(output.is_symlink())

    def test_bad_requests_fail_before_provider_import(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.wav"
            for text, preset, speed in [("", "serena", 1), ("x" * 2001, "serena", 1), ("hello", "alloy", 1), ("hello", "serena", float("nan")), ("hello", "serena", 0.1)]:
                with self.subTest(textLength=len(text), voice=preset, speed=speed), self.assertRaises(ValueError):
                    voice.validate_request(text, preset, speed, output)
            self.assertFalse(output.exists())

    def test_every_sentence_and_long_tail_is_kept(self):
        text = "第一句。第二句！\n" + "长" * 456 + "最后一句。"
        chunks = voice.chunks(text)
        # Blank lines are whitespace; every non-whitespace character remains in original order.
        self.assertEqual("".join(chunks).replace("\n", ""), text.replace("\n", ""))
        self.assertTrue(all(len(part) <= 200 for part in chunks))
        self.assertTrue(chunks[-1].endswith("最后一句。"))

    def test_same_size_corruption_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "model").mkdir()
            file = root / "model/weights"
            file.write_bytes(b"original")
            manifest = {"files": [{"path": "weights", "bytes": 8, "sha256": voice.digest(file)}]}
            (root / "model-manifest.json").write_text(json.dumps(manifest))
            voice.verify_model(root)
            file.write_bytes(b"modified")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                voice.verify_model(root)

    def test_concurrent_generation_does_not_start_second_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with voice.exclusive(root):
                with self.assertRaisesRegex(RuntimeError, "busy"):
                    with voice.exclusive(root):
                        self.fail("second operation acquired the runtime")
            with voice.exclusive(root):
                pass


if __name__ == "__main__":
    unittest.main()
