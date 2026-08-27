"""Diagnose the external-bonafide regression: why do the F5 models false-accuse FLEURS?

Both F5 models pushed genuine FLEURS speech toward "spoof" (26.2% -> 43.5% / 40.0%
flagged) while leaving internal genuine speech untouched (3.2% -> 3.0% / 2.5%). The
working hypothesis -- that SPRING_F5 taught the model "clean read speech is synthetic" --
is a guess, and this script exists to test it rather than believe it.

Five populations, one 16 kHz front end:

    v1_bona_sherry   SherryT997 genuine, the bulk of the training real side
    v1_bona_openslr  OpenSLR genuine, added in v1 to fix bonafide-domain shift
    v1_spoof         SherryT997 spoof, the fake class v1 was trained against
    f5_spoof         SPRING_F5, the newly added fake
    fleurs_bona      FLEURS genuine, the corpus the regression appears on

Twelve features, including four beyond the usual set specifically because the hypothesis
is about recording conditions rather than loudness: spectral rolloff, dynamic range,
spectral flatness (tonal vs noise-like), and low-frequency share (room rumble, handling
noise, HVAC -- things a synthesiser does not produce and a microphone in a room does).

The decisive question is not "are FLEURS and SPRING_F5 different" -- of course they are,
one is human and one is synthetic. It is whether they are separable by RECORDING
statistics in the same way, and along the same axes, that v1's own bonafide and spoof
were. If FLEURS sits on the spoof side of an axis that v1's training data made
discriminative, the model is not confused: it is correctly applying a rule it was taught.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pilot_audit import auc, trivial_classifier, describe  # noqa: E402

SR = 16_000
FEATURES = ["rms_db", "peak", "crest_db", "dyn_range_db", "noise_floor_db",
            "silence_frac", "hf_share", "lf_share", "centroid_hz", "rolloff95_hz",
            "flatness", "zcr", "duration_s"]


def load16k(path: Path) -> np.ndarray:
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    y = y.mean(axis=1)
    if sr != SR and y.size:
        import soxr
        y = soxr.resample(y, sr, SR).astype(np.float32)
    return y


def features(y: np.ndarray) -> dict:
    eps = 1e-12
    n = len(y)
    rms = float(np.sqrt(np.mean(y ** 2) + eps))
    peak = float(np.max(np.abs(y))) if n else 0.0
    frame, hop = 512, 256
    if n >= frame:
        idx = np.arange(0, n - frame + 1, hop)
        fr = np.stack([y[i:i + frame] for i in idx])
    else:
        fr = y[None, :]
    fr_db = 20 * np.log10(np.sqrt(np.mean(fr ** 2, axis=1) + eps) + eps)
    win = np.hanning(fr.shape[1])
    spec = np.abs(np.fft.rfft(fr * win, axis=1)) ** 2
    freqs = np.fft.rfftfreq(fr.shape[1], 1 / SR)
    psum = spec.sum(axis=0) + eps
    tot = psum.sum()
    cum = np.cumsum(psum) / tot
    rolloff = float(freqs[np.searchsorted(cum, 0.95)])
    # geometric/arithmetic mean of the spectrum: 1.0 = white noise, ~0 = pure tone.
    # A real room floor is noise-like; a vocoder's floor is not.
    gm = float(np.exp(np.mean(np.log(psum + eps))))
    flatness = gm / float(np.mean(psum) + eps)
    return {
        "rms_db": 20 * np.log10(rms + eps),
        "peak": peak,
        "crest_db": 20 * np.log10((peak + eps) / (rms + eps)),
        "dyn_range_db": float(np.percentile(fr_db, 95) - np.percentile(fr_db, 5)),
        "noise_floor_db": float(np.percentile(fr_db, 10)),
        "silence_frac": float(np.mean(fr_db < (fr_db.max() - 40))),
        "hf_share": float(spec[:, freqs > 4000].sum() / (spec.sum() + eps)),
        "lf_share": float(spec[:, freqs < 300].sum() / (spec.sum() + eps)),
        "centroid_hz": float((psum * freqs).sum() / tot),
        "rolloff95_hz": rolloff,
        "flatness": flatness,
        "zcr": float(np.mean(np.abs(np.diff(np.sign(y))) > 0)) if n > 1 else 0.0,
        "duration_s": n / SR,
    }


def collect(paths, name, cap, seed):
    rng = random.Random(seed)
    paths = [p for p in paths if Path(p).exists()]
    if cap and len(paths) > cap:
        paths = rng.sample(paths, cap)
    out = []
    for p in paths:
        try:
            y = load16k(Path(p))
        except Exception:
            continue
        if y.size:
            out.append({"group": name, **features(y)})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cap", type=int, default=400)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="results/regression_diagnosis.json")
    args = ap.parse_args()

    mixed = [json.loads(l) for l in open("data/mixed_f5/manifest.jsonl") if l.strip()]
    tr = [r for r in mixed if r["split"] == "train"]
    ext = Path("data/external2")
    er = [json.loads(l) for l in open(ext / "manifest.jsonl")]

    pops = {
        "v1_bona_sherry": [r["path"] for r in tr
                           if r["label"] == 0 and r["source"] == "SherryT997"],
        "v1_bona_openslr": [r["path"] for r in tr
                            if r["label"] == 0 and r["source"] == "OpenSLR"],
        "v1_spoof": [r["path"] for r in tr if r.get("generator") == "sherry_spoof"],
        "f5_spoof": [r["path"] for r in tr if r.get("generator") == "spring_f5"],
        "fleurs_bona": [str(ext / r["path"]) for r in er if r["label"] == 0],
        "ext_spoof_xtts": [str(ext / r["path"]) for r in er
                           if r["label"] == 1 and r.get("generator") == "xtts_v2"],
        "ext_spoof_freevc": [str(ext / r["path"]) for r in er
                             if r["label"] == 1 and r.get("generator") == "freevc24"],
    }
    data = {k: collect(v, k, args.cap, args.seed) for k, v in pops.items()}
    print("populations: " + ", ".join(f"{k}={len(v)}" for k, v in data.items()))

    print("\n" + "=" * 100)
    print("DISTRIBUTIONS   (min  p10  p25  median  p75  p90  max)")
    print("=" * 100)
    for f in FEATURES:
        print(f"\n{f}")
        for k, v in data.items():
            arr = np.array([r[f] for r in v if f in r])
            if arr.size:
                print(f"  {k:18s} {describe(arr)}")

    print("\n" + "=" * 100)
    print("THE HYPOTHESIS TEST")
    print("  Does the axis separating FLEURS from SPRING_F5 also separate v1's own")
    print("  bonafide from v1's own spoof? If it does, the model learned a rule from")
    print("  training that happens to put FLEURS on the spoof side.")
    print("=" * 100)
    pairs = [
        ("FLEURS vs SPRING_F5", "f5_spoof", "fleurs_bona"),
        ("v1 bona vs v1 spoof (what v1 learned)", "v1_spoof", "v1_bona_sherry"),
        ("FLEURS vs v1 bonafide (corpus shift alone)", "fleurs_bona", "v1_bona_sherry"),
        ("SPRING_F5 vs v1 spoof (new fake vs old fake)", "f5_spoof", "v1_spoof"),
        ("FLEURS vs OpenSLR bonafide", "fleurs_bona", "v1_bona_openslr"),
        ("ext spoof (xtts) vs FLEURS", "ext_spoof_xtts", "fleurs_bona"),
    ]
    res = {}
    print(f"\n{'feature':16s}" + "".join(f"{n.split(' vs ')[0][:9]:>11s}" for n, _, _ in pairs))
    rows = {}
    for f in FEATURES:
        cells = []
        for name, a, b in pairs:
            va = np.array([r[f] for r in data[a]])
            vb = np.array([r[f] for r in data[b]])
            x = auc(va, vb) if va.size and vb.size else float("nan")
            cells.append(x)
            rows.setdefault(name, {})[f] = x
        print(f"{f:16s}" + "".join(f"{c:11.3f}" for c in cells))
    print("\n  (AUC of first group vs second; 0.5 = the feature cannot tell them apart)")

    print("\n" + "=" * 100)
    print("TRIVIAL CLASSIFIERS  (5-fold CV, recording statistics only, no synthesis info)")
    print("=" * 100)
    for name, a, b in pairs:
        A, B = data[a], data[b]
        if len(A) < 20 or len(B) < 20:
            continue
        X = np.array([[r[f] for f in FEATURES] for r in A + B])
        y = np.array([1] * len(A) + [0] * len(B))
        c = trivial_classifier(X, y, args.seed)
        worst = max(FEATURES, key=lambda f: abs(rows[name][f] - 0.5))
        print(f"  {name:44s} AUC={c['auc']:.3f}  worst feature: {worst} "
              f"({rows[name][worst]:.3f})")
        res[name] = {"classifier": c, "auc_by_feature": rows[name], "worst": worst}

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump({"contrasts": res,
               "n": {k: len(v) for k, v in data.items()},
               "medians": {k: {f: float(np.median([r[f] for r in v])) for f in FEATURES}
                           for k, v in data.items() if v}},
              open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
