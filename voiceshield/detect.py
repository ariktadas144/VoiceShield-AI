"""Score one audio file with a selectable detector backend.

    python detect.py --backend voiceshield --audio sample.wav
    python detect.py --backend dhwani     --audio sample.wav

Selection happens here, at runtime. Neither backend knows the other exists.

`eval.py` remains the VoiceShield-specific tool with its original CLI intact; this is the
backend-agnostic entry point, kept separate so the existing experiments are undisturbed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from detectors import BACKENDS, DEFAULT_BACKEND, SAMPLE_RATE, build_detector

MAX_FILE_BYTES = 200 * 1024 * 1024
MAX_DURATION_S = 600.0


def load_audio(path: Path) -> np.ndarray:
    """The shared input contract: 16 kHz mono float32.

    Everything model-specific happens inside the adapters, so the two backends can hold
    genuinely different input requirements without either one leaking into this layer.
    """
    import librosa

    y, sr = librosa.load(str(path), sr=None, mono=True)
    if sr != SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)
    return np.asarray(y, dtype=np.float32)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--audio", required=True)
    p.add_argument("--backend", choices=list(BACKENDS), default=DEFAULT_BACKEND)
    p.add_argument("--checkpoint", default=None, help="voiceshield: checkpoint path")
    p.add_argument("--model-path", default=None, help="dhwani: ONNX path")
    p.add_argument("--dhwani-preprocessing", choices=["card", "train", "serve"],
                   default="card",
                   help="which of the three conflicting upstream descriptions to follow")
    p.add_argument("--threshold", type=float, default=None,
                   help="override the backend's own operating point")
    p.add_argument("--lang", default=None, help="recorded in the output, never inferred")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"error: {audio_path} not found", file=sys.stderr)
        return 1
    if audio_path.stat().st_size > MAX_FILE_BYTES:
        print(f"error: file exceeds {MAX_FILE_BYTES} byte cap", file=sys.stderr)
        return 1

    kwargs = {}
    if args.backend == "voiceshield" and args.checkpoint:
        kwargs["checkpoint"] = args.checkpoint
    if args.backend == "dhwani":
        if args.model_path:
            kwargs["model_path"] = args.model_path
        kwargs["preprocessing"] = args.dhwani_preprocessing
    if args.threshold is not None:
        kwargs["threshold"] = args.threshold

    detector = build_detector(args.backend, **kwargs)
    audio = load_audio(audio_path)
    if len(audio) / SAMPLE_RATE > MAX_DURATION_S:
        print(f"error: audio exceeds {MAX_DURATION_S}s cap", file=sys.stderr)
        return 1

    result = detector.predict(audio)
    payload = {"file": str(audio_path), "language": args.lang, **result.to_dict()}

    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    print(f"file            : {audio_path.name}")
    print(f"backend         : {result.model}")
    print(f"model version   : {result.model_version}")
    print(f"language        : {args.lang or 'not supplied'}")
    print(f"windows scored  : {result.windows_scored}  ({result.audio_seconds}s)")
    print(f"P(fake)         : {result.fake_probability:.6f}")
    print(f"P(real)         : {result.real_probability:.6f}")
    if result.threshold is None:
        print("threshold       : none — score reported without a verdict")
    else:
        print(f"threshold       : {result.threshold:.6f}")
        print(f"verdict         : {result.verdict}")
    print(f"latency         : {result.latency_ms:.1f} ms")
    if result.notes:
        print(f"notes           : {result.notes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
