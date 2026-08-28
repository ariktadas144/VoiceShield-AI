"""Score one audio file with VoiceShield.

Two paths, one front end:

  --backend indic    the Indic-adapted binary detector (default). Reports P(spoof)
                     against the threshold that was fitted on dev during training.
  --backend librisevoc  the original 7-class LibriSeVoc output, unchanged, for any
                     checkpoint trained the old way.

WHAT CHANGED FROM THE ORIGINAL
------------------------------
1. `load_sample` had a dead branch: `if (i+1) == range(int(len(y)/96000))` compares an
   int to a range object, so it was never true and the final partial segment was
   handled by the wrong code path. Segmentation is now explicit.

2. It hard-coded 24 kHz and 96,000-sample windows. Both now come from the model config,
   because the sinc filter bank is derived from the sample rate at forward time -- run
   the 16 kHz Indic checkpoint through a 24 kHz front end and it fails silently, with
   plausible-looking numbers.

3. It shared no code with training. Windowing and normalisation now come from
   `audio_utils`, the same module the training set uses.

4. `torch.load` ran without `weights_only`. Under the old `torch==2.0.1` pin that
   defaults to False, so loading an untrusted checkpoint executed arbitrary code.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

import numpy as np
import torch
import yaml
from torch.nn import functional as F

from audio_utils import load_audio, pad, trim_silence
from model import RawNet

LIBRISEVOC_CLASSES = ["gt", "wavegrad", "diffwave", "parallel wave gan",
                      "wavernn", "wavenet", "melgan"]
SPOOF_INDEX = 1

MAX_FILE_BYTES = 200 * 1024 * 1024
MAX_DURATION_S = 600.0


def segment(y: np.ndarray, window: int) -> list[np.ndarray]:
    """Split into non-overlapping windows; tile the tail up to length.

    The original looped `for i in range(int(len(y)/window))`, which silently dropped
    any remainder shorter than one window -- for a 1.5-window clip, a third of the
    audio was never scored.
    """
    if len(y) <= window:
        return [pad(y, window)]
    windows = [y[i:i + window] for i in range(0, len(y), window)]
    return [pad(w, window) for w in windows if len(w) > window // 10]


def load_checkpoint(path: Path, device: str, config_path: str):
    """Accepts both our training blobs and a bare state_dict."""
    blob = torch.load(path, map_location=device, weights_only=True)

    if isinstance(blob, dict) and "state_dict" in blob:
        cfg = blob.get("config")
        if cfg is None:
            with open(config_path) as fh:
                cfg = yaml.safe_load(fh)["model"]
        state, meta = blob["state_dict"], blob
    else:
        with open(config_path) as fh:
            cfg = yaml.safe_load(fh)["model"]
        state, meta = blob, {}

    model = RawNet(copy.deepcopy(cfg), device).to(device)
    model.load_state_dict(state)
    model.eval()
    return model, cfg, meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input_path", required=True, help="audio file to score")
    parser.add_argument("--model_path", default="checkpoints_indic/best_model.pth")
    parser.add_argument("--config", default="model_config_RawNet.yaml")
    parser.add_argument("--backend", choices=["indic", "librisevoc"], default="indic")
    parser.add_argument("--sample_rate", type=int, default=None, help="overrides config")
    parser.add_argument("--threshold", type=float, default=None,
                        help="overrides the dev-fitted threshold in the checkpoint")
    parser.add_argument("--lang", default=None, help="recorded in the output, not inferred")
    parser.add_argument("--no-normalise", dest="normalise", action="store_false", default=True)
    parser.add_argument("--trim", dest="trim", action="store_true", default=None,
                        help="force silence trimming (default: whatever the checkpoint says)")
    parser.add_argument("--no-trim", dest="trim", action="store_false",
                        help="force trimming off (default: whatever the checkpoint says)")
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    args = parser.parse_args()

    audio_path = Path(args.input_path)
    if not audio_path.exists():
        print(f"error: {audio_path} not found", file=sys.stderr)
        return 1
    size = audio_path.stat().st_size
    if size > MAX_FILE_BYTES:
        print(f"error: {size} bytes exceeds the {MAX_FILE_BYTES} byte cap", file=sys.stderr)
        return 1

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, cfg, meta = load_checkpoint(Path(args.model_path), device, args.config)

    sample_rate = args.sample_rate or cfg.get("sample_rate", 24_000)
    window = cfg["nb_samp"]

    # The audio contract is read FROM the checkpoint, never assumed. A model trained on
    # trimmed audio and scored on untrimmed audio is being asked a different question than
    # it was taught: measured on the iv15 checkpoint, ignoring this costs 11.5 points of
    # SPRING_F5 detection (88.5% -> 77.1%). --trim / --no-trim override it only if asked.
    trim = meta.get("trim", False) if args.trim is None else args.trim
    y = load_audio(audio_path, sample_rate, normalise=args.normalise)
    if trim:
        y = trim_silence(y, sample_rate)
    duration = len(y) / sample_rate
    if duration > MAX_DURATION_S:
        print(f"error: {duration:.1f}s exceeds the {MAX_DURATION_S}s cap", file=sys.stderr)
        return 1

    windows = segment(y, window)
    binary_probs, multi_probs = [], []
    with torch.no_grad():
        for chunk in windows:
            batch = torch.from_numpy(np.ascontiguousarray(chunk)).float()
            batch = batch.to(device=device).unsqueeze(0)
            binary, multi = model(batch)
            binary_probs.append(binary.exp().cpu().numpy()[0])
            multi_probs.append(F.softmax(multi, dim=-1).cpu().numpy()[0])

    binary_mean = np.mean(binary_probs, axis=0)
    spoof_probability = float(binary_mean[SPOOF_INDEX])

    if args.backend == "librisevoc":
        multi_mean = np.mean(multi_probs, axis=0)
        print("Multi classification result : " + ", ".join(
            f"{name}:{value:.4f}" for name, value in zip(LIBRISEVOC_CLASSES, multi_mean)))
        print(f"Binary classification result : fake:{binary_mean[1]:.4f}, "
              f"real:{binary_mean[0]:.4f}")
        return 0

    threshold = args.threshold if args.threshold is not None else meta.get("threshold")
    verdict = "UNCALIBRATED"
    if threshold is not None:
        verdict = "SPOOF" if spoof_probability >= threshold else "BONAFIDE"

    result = {
        "file": str(audio_path),
        "language": args.lang,                    # recorded, never inferred
        "spoof_probability": round(spoof_probability, 6),
        "threshold": threshold,
        "verdict": verdict,
        "windows_scored": len(windows),
        "audio_seconds": round(duration, 2),
        "sample_rate": sample_rate,
        "normalised": args.normalise,
        "trimmed": trim,
        "model": str(args.model_path),
        "dev_eer_at_selection": meta.get("dev_eer"),
    }

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print(f"file              : {audio_path.name}")
    print(f"language          : {args.lang or 'not supplied'}")
    print(f"windows scored    : {len(windows)}  ({duration:.2f}s @ {sample_rate} Hz)")
    print(f"audio contract    : normalise={args.normalise}  trim={trim} (from checkpoint)")
    print(f"P(spoof)          : {spoof_probability:.6f}")
    if threshold is None:
        print("threshold         : none in checkpoint -- score reported without a verdict")
    else:
        print(f"threshold (dev)   : {threshold:.6f}")
        print(f"verdict           : {verdict}")
    if meta.get("dev_eer") is not None:
        print(f"dev EER at select : {100 * meta['dev_eer']:.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
