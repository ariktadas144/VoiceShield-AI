"""Step 10 -- does the frozen model treat silence as evidence of spoofing?

A detector that scores non-speech as confidently synthetic is a false-accusation
generator: ordinary conversational pauses, hold music gaps and dead air would all
trigger it. This measures that directly on the frozen checkpoint, using real Indic
speech from the evaluation set degraded in the ways a real call degrades it.

The bar is not "silence scores low". A confident verdict either way on non-speech is
wrong -- there is no evidence in silence. What we want is for the score to stay away
from the confident-spoof region, and for a speech gate to be able to suppress the rest.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import audio_utils  # noqa: E402
from weights.load_pretrained import build_model  # noqa: E402


def conditions(clip, sr, rng):
    """Realistic call degradations, plus pure non-speech controls."""
    n = len(clip)
    silence = np.zeros(n, dtype=np.float32)

    def lead(frac):
        k = int(n * frac)
        return np.concatenate([np.zeros(k, np.float32), clip[:n - k]])

    def trail(frac):
        k = int(n * frac)
        return np.concatenate([clip[:n - k], np.zeros(k, np.float32)])

    def internal(frac):
        k = int(n * frac)
        mid = n // 2
        return np.concatenate([clip[:mid], np.zeros(k, np.float32), clip[mid:n - k]])

    def turn_taking(gap=0.18):
        out = clip.copy()
        step = max(1, int(n / 6))
        for start in range(step, n - step, step * 2):
            out[start:start + int(step * gap)] = 0.0
        return out

    return {
        "clean speech": clip,
        "25% leading silence": lead(0.25),
        "50% leading silence": lead(0.50),
        "75% leading silence": lead(0.75),
        "50% trailing silence": trail(0.50),
        "internal pause 30%": internal(0.30),
        "turn-taking gaps": turn_taking(),
        "low-energy speech (-30 dB)": (clip * 0.03).astype(np.float32),
        "digital silence": silence,
        "white noise": rng.standard_normal(n).astype(np.float32) * 0.01,
        "50 Hz hum": (0.02 * np.sin(2 * np.pi * 50 * np.arange(n) / sr)).astype(np.float32),
    }


def speech_ratio(x, sr, frame_ms=30, rel_db=-35.0):
    """Fraction of frames above a level relative to the clip's own peak.

    Deliberately a plain energy gate, not a learned VAD: the question here is whether a
    cheap gate is sufficient. Bringing in a model would answer a different question.
    """
    frame = max(1, int(sr * frame_ms / 1000))
    frames = [x[i:i + frame] for i in range(0, max(1, len(x) - frame + 1), frame)]
    if not frames:
        return 0.0
    peak = float(np.abs(x).max())
    if peak < 1e-9:
        return 0.0
    floor = peak * (10 ** (rel_db / 20))
    return float(np.mean([np.abs(f).max() > floor for f in frames]))



def run_backend(args) -> int:
    """Safety suite for any backend exposed through the Detector interface.

    Same conditions, same clips, same speech-ratio gate as the VoiceShield path -- only
    the scorer differs, so the two are directly comparable.
    """
    import sys as _sys
    from pathlib import Path as _Path
    _sys.path.insert(0, str(_Path(__file__).resolve().parents[1]))
    from detectors import build_detector

    kw = {}
    if args.backend == "dhwani":
        kw["preprocessing"] = args.dhwani_preprocessing
        kw["threads"] = 6
    det = build_detector(args.backend, **kw)

    manifest = [json.loads(l) for l in open(_Path(args.manifests) / "manifest.jsonl")]
    bonafide = [r for r in manifest if r["label"] == 0]
    rng = np.random.default_rng(args.seed)
    picks = rng.choice(len(bonafide), min(args.n, len(bonafide)), replace=False)

    print("=" * 84)
    print(f"SILENCE / NON-SPEECH SAFETY -- backend '{args.backend}'")
    print("=" * 84)
    print(f"model      : {det.version}")
    print(f"threshold  : {det.threshold if det.threshold is not None else 'none (UNCALIBRATED)'}")
    print(f"probe      : {len(picks)} GENUINE clips, degraded\n")

    sr = 16_000
    results = {}
    for idx in picks:
        row = bonafide[int(idx)]
        y, _ = sf.read(_Path(args.manifests) / row["path"], dtype="float32")
        if y.ndim > 1:
            y = y.mean(axis=1)
        clip = audio_utils.pad(y, 64_600)
        for name, variant in conditions(clip, sr, rng).items():
            results.setdefault(name, {"scores": [], "ratios": []})
            results[name]["scores"].append(det.predict(variant).fake_probability)
            results[name]["ratios"].append(speech_ratio(variant, sr))

    # An uncalibrated backend has no operating point; use this data's own EER-style
    # midpoint only to make the columns comparable, and label it as such.
    thr = det.threshold if det.threshold is not None else 0.5
    label = "own threshold" if det.threshold is not None else "0.5 (UNCALIBRATED)"
    print(f"{'condition':28s} {'speech%':>8s} {'mean P(fake)':>13s} {'median':>8s} "
          f"{'flagged':>9s}  [{label}]")
    report = {}
    for name, data in results.items():
        s_ = np.array(data["scores"]); ratio = float(np.mean(data["ratios"]))
        flagged = float((s_ >= thr).mean())
        gate = "GATED" if ratio < args.min_speech else "PASS"
        mark = "  <-- FALSE ACCUSATIONS" if gate == "PASS" and flagged > 0.20 else ""
        print(f"{name:28s} {100*ratio:7.1f}% {s_.mean():13.4f} {np.median(s_):8.4f} "
              f"{100*flagged:8.1f}% {gate:>6s}{mark}")
        report[name] = {"speech_ratio": ratio, "mean_score": float(s_.mean()),
                        "median_score": float(np.median(s_)),
                        "flagged_spoof_rate": flagged, "gated": gate == "GATED"}
    if args.out:
        _Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        json.dump({"backend": args.backend, "version": det.version,
                   "threshold": det.threshold, "conditions": report},
                  open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


def run(args) -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if args.backend and args.backend != "voiceshield":
        return run_backend(args)          # non-torch backends go through the adapter
    if args.ckpt:
        path = args.ckpt
    else:
        path = json.load(open(args.frozen_manifest))["checkpoint"]["path"]
    blob = torch.load(path, map_location=device, weights_only=True)
    cfg = blob["config"]
    model = build_model(cfg, device=device).to(device)
    model.load_state_dict(blob["state_dict"])
    model.eval()
    # Each model is judged at its OWN dev-fitted threshold -- the operating point it
    # would ship with. A shared threshold would flatter whichever is calibrated nearer.
    spoof_index = blob.get("spoof_index", 1)
    threshold = blob["threshold"]
    sr = cfg.get("sample_rate", 16_000)

    manifest = [json.loads(l) for l in open(Path(args.manifests) / "manifest.jsonl")]
    bonafide = [r for r in manifest if r["label"] == 0]
    rng = np.random.default_rng(args.seed)
    picks = rng.choice(len(bonafide), min(args.n, len(bonafide)), replace=False)

    print("=" * 84)
    print("STEP 10 -- SILENCE / NON-SPEECH SAFETY (frozen model)")
    print("=" * 84)
    print(f"checkpoint : {path}")
    print(f"             epoch {blob.get('epoch')}, dev EER "
          f"{100*blob.get('dev_eer', float('nan')):.2f}%, "
          f"rawboost={blob.get('rawboost', 0) or 'off'}")
    print(f"threshold  : {threshold:.6f}   (>= this is called SPOOF)")
    print(f"probe      : {len(picks)} GENUINE clips from the eval set, degraded")
    print("             every clip below is real human speech -- a high score is a")
    print("             false accusation, not a detection\n")

    results = {}
    for name in conditions(np.zeros(cfg["nb_samp"], np.float32), sr, rng):
        results[name] = {"scores": [], "ratios": []}

    for idx in picks:
        row = bonafide[int(idx)]
        y, file_sr = sf.read(Path(args.manifests) / row["path"], dtype="float32")
        if y.ndim > 1:
            y = y.mean(axis=1)
        clip = audio_utils.pad(y, cfg["nb_samp"])
        for name, variant in conditions(clip, sr, rng).items():
            x = audio_utils.peak_normalise(variant) if args.normalise else variant
            with torch.no_grad():
                probs = model(torch.from_numpy(np.ascontiguousarray(x)).float()
                              .unsqueeze(0).to(device))[0].exp().cpu().numpy()[0]
            results[name]["scores"].append(float(probs[spoof_index]))
            results[name]["ratios"].append(speech_ratio(variant, sr))

    print(f"{'condition':28s} {'speech%':>8s} {'mean P(spoof)':>14s} {'median':>8s} "
          f"{'flagged spoof':>14s}  gate")
    gated = 0
    report = {}
    for name, data in results.items():
        s = np.array(data["scores"])
        ratio = float(np.mean(data["ratios"]))
        flagged = float((s >= threshold).mean())
        gate = "PASS" if ratio >= args.min_speech else "GATED"
        if gate == "GATED":
            gated += 1
        mark = ""
        if gate == "PASS" and flagged > 0.20:
            mark = "  <-- FALSE ACCUSATIONS"
        print(f"{name:28s} {100*ratio:7.1f}% {s.mean():14.4f} {np.median(s):8.4f} "
              f"{100*flagged:13.1f}% {gate:>6s}{mark}")
        report[name] = {"speech_ratio": ratio, "mean_score": float(s.mean()),
                        "median_score": float(np.median(s)),
                        "flagged_spoof_rate": flagged, "gated": gate == "GATED"}

    ungated = {k: v for k, v in report.items() if not v["gated"]}
    worst = max(ungated.items(), key=lambda kv: kv[1]["flagged_spoof_rate"], default=(None, None))

    print(f"\nspeech gate at {100*args.min_speech:.0f}% speech frames would suppress "
          f"{gated}/{len(report)} conditions")
    if worst[0]:
        print(f"worst ungated condition: {worst[0]} -- "
              f"{100*worst[1]['flagged_spoof_rate']:.1f}% flagged spoof")
    print("\nVerdict: a condition that passes the gate but flags a large share of GENUINE")
    print("speech as spoof is a false-accusation path and must be reported as one.")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        json.dump({"threshold": threshold, "min_speech": args.min_speech,
                   "conditions": report}, open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--manifests", default="data/indic")
    p.add_argument("--frozen-manifest", default="frozen/MANIFEST.json")
    p.add_argument("--ckpt", default=None, help="checkpoint to test instead of the frozen one")
    p.add_argument("--backend", default="voiceshield",
                   help="detector backend: voiceshield (default) or dhwani")
    p.add_argument("--dhwani-preprocessing", default="card",
                   choices=["card", "train", "serve"])
    p.add_argument("--n", type=int, default=60)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--min-speech", type=float, default=0.35,
                   help="speech-frame fraction below which a window is gated out")
    p.add_argument("--no-normalise", dest="normalise", action="store_false", default=True)
    p.add_argument("--out", default="results/silence_safety.json")
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
