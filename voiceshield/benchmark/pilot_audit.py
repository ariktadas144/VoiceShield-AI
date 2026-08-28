"""Validate the pilot spoof clips and hunt for shortcuts before any of it reaches training.

The question this answers is not "is the audio good" but "can a detector separate these
clips from genuine speech WITHOUT modelling synthesis". Every previous generator added to
this project (MMS-TTS most memorably, separable by RMS alone at AUC 0.924) looked fine on
a listen and was trivially separable on a measurement. So the audit runs first and the
generators are judged on it.

WHAT IS MEASURED

  validation   NaN/inf, channel count, sample rate, duration, clipping, all-silent
  features     rms_db peak crest_db hf_share noise_floor_db silence_frac zcr centroid
  contrasts    A F5 vs Mio      -- can generator be read off the signal?
               B F5 vs bonafide -- is spoof-vs-real trivially separable?
               C Mio vs bonafide
               D all spoof vs bonafide
  per contrast single-feature AUC (each feature alone) and a cross-validated logistic
               regression on all features (the "trivial classifier")

Everything is resampled to 16 kHz first -- the detector's rate. Comparing an HF-energy
share between a 24 kHz file and a 44.1 kHz file measures the resampler, not the generator.

Distributions are printed, not just means. A shortcut can hide in a tail: two groups can
share a median and still be perfectly separable at p90.
"""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf

warnings.filterwarnings("ignore")

SR = 16_000
FEATURES = ["rms_db", "peak", "crest_db", "hf_share", "noise_floor_db",
            "silence_frac", "zcr", "centroid_hz", "duration_s"]


def load16k(path: Path, trim: bool = False) -> tuple[np.ndarray, dict]:
    """Return the waveform at 16 kHz plus what the file looked like before touching it.

    trim=True strips leading and trailing silence, applied identically to every clip
    whatever its group. That is the whole point: genuine recordings begin and end with
    room tone and a held microphone, TTS output starts on the first phoneme and stops on
    the last. Comparing them as delivered measures how the two were packaged, not how
    they were produced, and a detector handed that difference will learn it. Trimming
    both sides the same way removes the packaging and leaves the synthesis.
    """
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    raw = {"orig_sr": sr, "channels": y.shape[1], "n_samples": y.shape[0]}
    y = y.mean(axis=1)
    raw["finite"] = bool(np.isfinite(y).all())
    raw["duration_s"] = len(y) / sr if sr else 0.0
    raw["peak_raw"] = float(np.max(np.abs(y))) if y.size else 0.0
    if sr != SR and y.size:
        import soxr
        y = soxr.resample(y, sr, SR).astype(np.float32)
    if trim and y.size:
        import librosa
        yt, _ = librosa.effects.trim(y, top_db=40, frame_length=512, hop_length=128)
        raw["trimmed_away_s"] = (len(y) - len(yt)) / SR
        if yt.size > SR // 10:          # keep at least 100 ms
            y = np.ascontiguousarray(yt)
    return y, raw


def features(y: np.ndarray) -> dict:
    """Cheap, interpretable, and exactly the ones that caught the earlier shortcuts."""
    eps = 1e-12
    n = len(y)
    rms = float(np.sqrt(np.mean(y ** 2) + eps))
    peak = float(np.max(np.abs(y))) if n else 0.0

    frame, hop = 512, 256
    if n >= frame:
        idx = np.arange(0, n - frame + 1, hop)
        frames = np.stack([y[i:i + frame] for i in idx])
    else:
        frames = y[None, :]
    fr_rms = np.sqrt(np.mean(frames ** 2, axis=1) + eps)
    fr_db = 20 * np.log10(fr_rms + eps)

    # noise floor: the quiet tail of the frame-energy distribution, i.e. what the
    # recording/synthesis chain leaves behind between words
    noise_floor_db = float(np.percentile(fr_db, 10))
    silence_frac = float(np.mean(fr_db < (fr_db.max() - 40))) if n else 1.0

    win = np.hanning(frames.shape[1])
    spec = np.abs(np.fft.rfft(frames * win, axis=1)) ** 2
    freqs = np.fft.rfftfreq(frames.shape[1], 1 / SR)
    total = spec.sum() + eps
    hf_share = float(spec[:, freqs > 4000].sum() / total)
    centroid = float((spec.sum(axis=0) * freqs).sum() / (spec.sum() + eps))
    zcr = float(np.mean(np.abs(np.diff(np.sign(y))) > 0)) if n > 1 else 0.0

    return {
        "rms_db": 20 * np.log10(rms + eps),
        "peak": peak,
        "crest_db": 20 * np.log10((peak + eps) / (rms + eps)),
        "hf_share": hf_share,
        "noise_floor_db": noise_floor_db,
        "silence_frac": silence_frac,
        "zcr": zcr,
        "centroid_hz": centroid,
        "duration_s": n / SR,
    }


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    """Rank AUC, ties averaged. 0.5 = feature is useless, which is what we want."""
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    from scipy.stats import rankdata
    allv = np.concatenate([pos, neg])
    r = rankdata(allv)
    return float((r[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def describe(vals: np.ndarray) -> str:
    q = np.percentile(vals, [0, 10, 25, 50, 75, 90, 100])
    return "  ".join(f"{v:8.3f}" for v in q)


def trivial_classifier(X: np.ndarray, y: np.ndarray, seed: int = 0) -> dict:
    """Cross-validated logistic regression on the acoustic features alone.

    No waveform modelling, no spectrogram, no learning about synthesis -- just nine
    numbers per clip. If this scores well the split is decorative.
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.metrics import roc_auc_score, balanced_accuracy_score

    if len(np.unique(y)) < 2 or min(np.bincount(y)) < 5:
        return {"auc": float("nan"), "balanced_acc": float("nan")}
    pipe = make_pipeline(StandardScaler(),
                         LogisticRegression(max_iter=2000, class_weight="balanced"))
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    prob = cross_val_predict(pipe, X, y, cv=cv, method="predict_proba")[:, 1]
    return {"auc": float(roc_auc_score(y, prob)),
            "balanced_acc": float(balanced_accuracy_score(y, prob >= 0.5))}


def collect(rows: list[dict], root: Path, group: str, limit: int = 0,
            trim: bool = False) -> list[dict]:
    out = []
    if limit:
        rows = rows[:limit]
    for r in rows:
        p = root / r["path"] if not Path(r["path"]).is_absolute() else Path(r["path"])
        if not p.exists():
            continue
        try:
            y, raw = load16k(p, trim=trim)
        except Exception as exc:
            out.append({"group": group, "path": str(p), "error": f"{type(exc).__name__}: {exc}",
                        "language": r.get("language")})
            continue
        rec = {"group": group, "path": str(p), "language": r.get("language"),
               "speaker": r.get("ref_speaker") or r.get("id"),
               "item_id": r.get("item_id"), **raw}
        if y.size:
            rec.update(features(y))
        out.append(rec)
    return out


def load_bonafide(spec: str, limit: int = 0, trim: bool = False) -> list[dict]:
    """Genuine speech to contrast against.

    Default is the pilot reference set itself: same speakers, same languages, same
    recording chain as the clips that conditioned the generators. That is the strictest
    control available -- any separability found against it cannot be explained by speaker
    or corpus mismatch, only by the synthesis.
    """
    root = Path(spec)
    if (root / "references.jsonl").exists():
        rows = [json.loads(l) for l in open(root / "references.jsonl")]
        for r in rows:
            r["path"] = r["ref_path"]
            r["ref_speaker"] = r["speaker_id"]
        return collect(rows, root, "bonafide", limit, trim)
    rows = [json.loads(l) for l in open(root / "manifest.jsonl")]
    rows = [r for r in rows if r.get("label") == 0]
    return collect(rows, root, "bonafide", limit, trim)


def report_validation(recs: list[dict]) -> int:
    print("\n" + "=" * 78)
    print("VALIDATION")
    print("=" * 78)
    bad = 0
    for group in sorted({r["group"] for r in recs}):
        g = [r for r in recs if r["group"] == group]
        errs = [r for r in g if "error" in r]
        nonfinite = [r for r in g if not r.get("finite", True)]
        multich = [r for r in g if r.get("channels", 1) != 1]
        silent = [r for r in g if r.get("peak_raw", 1) < 1e-4]
        clipped = [r for r in g if r.get("peak_raw", 0) >= 0.999]
        tiny = [r for r in g if 0 < r.get("duration_s", 0) < 0.5]
        srs = sorted({r.get("orig_sr") for r in g if "orig_sr" in r})
        print(f"\n{group}: {len(g)} files, sample rates {srs}")
        for label, lst in [("unreadable", errs), ("non-finite", nonfinite),
                           ("multi-channel", multich), ("all-silent", silent),
                           ("clipped (peak>=0.999)", clipped), ("under 0.5 s", tiny)]:
            flag = "  <-- PROBLEM" if lst and label != "clipped (peak>=0.999)" else ""
            if lst and label == "clipped (peak>=0.999)":
                flag = "  <-- check"
            print(f"    {label:24s} {len(lst):4d}{flag}")
            if lst and label in ("unreadable", "non-finite", "all-silent"):
                bad += len(lst)
            for r in lst[:2]:
                if "error" in r:
                    print(f"        {Path(r['path']).name}: {r['error']}")
    return bad


def report_distributions(recs: list[dict]) -> None:
    print("\n" + "=" * 78)
    print("FEATURE DISTRIBUTIONS   (min  p10  p25  median  p75  p90  max)")
    print("=" * 78)
    groups = sorted({r["group"] for r in recs})
    for feat in FEATURES:
        print(f"\n{feat}")
        for group in groups:
            v = np.array([r[feat] for r in recs if r["group"] == group and feat in r])
            if v.size:
                print(f"  {group:12s} {describe(v)}")


def report_contrast(recs: list[dict], name: str, pos_groups: set, neg_groups: set,
                    seed: int) -> dict:
    pos = [r for r in recs if r["group"] in pos_groups and "rms_db" in r]
    neg = [r for r in recs if r["group"] in neg_groups and "rms_db" in r]
    print(f"\n--- {name}   ({len(pos)} vs {len(neg)}) ---")
    if not pos or not neg:
        print("    skipped: a side is empty")
        return {}
    print(f"    {'feature':16s} {'AUC':>7s}   {'|AUC-0.5|':>9s}")
    aucs = {}
    for feat in FEATURES:
        a = auc(np.array([r[feat] for r in pos]), np.array([r[feat] for r in neg]))
        aucs[feat] = a
        mark = ""
        if not np.isnan(a):
            d = abs(a - 0.5)
            mark = "  <-- SHORTCUT" if d >= 0.20 else ("  <-- watch" if d >= 0.10 else "")
        print(f"    {feat:16s} {a:7.3f}   {abs(a-0.5):9.3f}{mark}")

    X = np.array([[r[f] for f in FEATURES] for r in pos + neg])
    y = np.array([1] * len(pos) + [0] * len(neg))
    clf = trivial_classifier(X, y, seed)
    verdict = ("TRIVIALLY SEPARABLE" if clf["auc"] >= 0.90 else
               "partly separable" if clf["auc"] >= 0.75 else "not trivially separable")
    print(f"    trivial classifier (5-fold CV, {len(FEATURES)} features): "
          f"AUC={clf['auc']:.3f} balanced_acc={clf['balanced_acc']:.3f}  -> {verdict}")
    worst = max((f for f in FEATURES if not np.isnan(aucs[f])),
                key=lambda f: abs(aucs[f] - 0.5), default=None)
    return {"name": name, "n_pos": len(pos), "n_neg": len(neg),
            "single_feature_auc": aucs, "worst_feature": worst,
            "worst_auc": aucs.get(worst), "classifier": clf, "verdict": verdict}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--spoof", nargs="+", default=["data/pilot_spoof/spring_f5",
                                                   "data/pilot_spoof/indic_mio"])
    ap.add_argument("--bonafide", default="data/pilot_refs")
    ap.add_argument("--out", default="data/pilot_spoof/audit.json")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--per-language", action="store_true")
    ap.add_argument("--trim", action="store_true",
                    help="strip leading/trailing silence from every clip identically")
    args = ap.parse_args()

    recs = []
    for d in args.spoof:
        root = Path(d)
        man = root / "manifest.jsonl"
        if not man.exists():
            print(f"skip {d}: no manifest", file=sys.stderr)
            continue
        rows = [json.loads(l) for l in open(man)]
        recs += collect(rows, root, root.name, args.limit, args.trim)
    recs += load_bonafide(args.bonafide, args.limit, args.trim)

    if not recs:
        print("nothing to audit", file=sys.stderr)
        return 1

    bad = report_validation(recs)
    report_distributions(recs)

    print("\n" + "=" * 78)
    print("CONTRASTS   (AUC 0.5 = feature carries no information; 1.0 or 0.0 = perfect)")
    print("=" * 78)
    spoof_groups = {Path(d).name for d in args.spoof}
    results = []
    names = sorted(spoof_groups)
    if len(names) == 2:
        results.append(report_contrast(recs, f"A  {names[0]} vs {names[1]}",
                                       {names[0]}, {names[1]}, args.seed))
    for nm in names:
        letter = "B" if nm == names[0] else "C"
        results.append(report_contrast(recs, f"{letter}  {nm} vs bonafide",
                                       {nm}, {"bonafide"}, args.seed))
    results.append(report_contrast(recs, "D  all spoof vs bonafide",
                                   spoof_groups, {"bonafide"}, args.seed))

    if args.per_language:
        print("\n" + "=" * 78)
        print("PER-LANGUAGE:  all spoof vs bonafide")
        print("=" * 78)
        for lang in sorted({r.get("language") for r in recs if r.get("language")}):
            sub = [r for r in recs if r.get("language") == lang]
            report_contrast(sub, f"D[{lang}]", spoof_groups, {"bonafide"}, args.seed)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump({"contrasts": [r for r in results if r],
                   "n_records": len(recs), "validation_failures": bad,
                   "features": FEATURES, "resampled_to": SR, "trimmed": args.trim}, fh, indent=2)
    print(f"\nwrote {args.out}")
    if bad:
        print(f"WARNING: {bad} files failed validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
