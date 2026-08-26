"""Run both backends over the same audio through the same interface.

Two modes:

  --smoke     a handful of clips, printed side by side. An integration/regression check,
              NOT a benchmark -- it is far too small to support any claim.
  --evaluate  the real evaluation set, producing EER / AUC / FPR / FNR / precision /
              recall per language plus latency.

Nothing is retrained. Each backend is asked for a probability through the shared
`Detector.predict` and is otherwise left alone.
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import time
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from detectors import SAMPLE_RATE, build_detector  # noqa: E402
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold, roc_auc  # noqa: E402


def load_audio(path):
    import librosa
    y, sr = librosa.load(str(path), sr=None, mono=True)
    if sr != SAMPLE_RATE:
        y = librosa.resample(y, orig_sr=sr, target_sr=SAMPLE_RATE)
    return np.asarray(y, dtype=np.float32)


def build(name, args):
    kw = {}
    if name == "voiceguard" and args.checkpoint:
        kw["checkpoint"] = args.checkpoint
    if name == "dhwani":
        kw["preprocessing"] = args.dhwani_preprocessing
        if args.dhwani_threads:
            kw["threads"] = args.dhwani_threads
    return build_detector(name, **kw)


def smoke(args) -> int:
    rows = [json.loads(l) for l in open(Path(args.manifests) / "manifest.jsonl")]
    rows = [r for r in rows if r.get("split") == "test"]
    import random
    rnd = random.Random(args.seed)
    sel = (rnd.sample([r for r in rows if r["label"] == 0], args.n // 2) +
           rnd.sample([r for r in rows if r["label"] == 1], args.n // 2))

    dets = {b: build(b, args) for b in args.backends}
    print("INTEGRATION CHECK -- identical audio through both backends")
    print("Too small to be a benchmark; it verifies the interface, not the models.\n")
    print(f"{'clip':30s} {'truth':9s}" + "".join(f"{b:>26s}" for b in args.backends))
    print(f"{'':30s} {'':9s}" + "".join(f"{'P(fake)   verdict   ms':>26s}" for _ in args.backends))
    print("-" * (39 + 26 * len(args.backends)))
    for r in sel:
        y = load_audio(Path(args.manifests) / r["path"])
        cells = []
        for b in args.backends:
            res = dets[b].predict(y)
            cells.append(f"{res.fake_probability:8.4f} {str(res.verdict or '-'):>9s} "
                         f"{res.latency_ms:6.0f}")
        truth = "bonafide" if r["label"] == 0 else "spoof"
        print(f"{Path(r['path']).name[:29]:30s} {truth:9s}" + "".join(f"{c:>26s}" for c in cells))
    for b, d in dets.items():
        print(f"\n{b:12s} version {d.version}")
    return 0


def evaluate(args) -> int:
    rows = [json.loads(l) for l in open(Path(args.manifests) / "manifest.jsonl")]
    rows = [r for r in rows if r.get("split", "test") == args.split]
    if args.limit:
        import random
        rnd = random.Random(args.seed)
        by = collections.defaultdict(list)
        for r in rows:
            by[(r["language"], r["label"])].append(r)
        per = max(1, args.limit // max(1, len(by)))
        rows = [x for v in by.values() for x in rnd.sample(v, min(per, len(v)))]

    results = {}
    for b in args.backends:
        det = build(b, args)
        scores, labels, langs, lat = [], [], [], []
        started = time.perf_counter()
        for i, r in enumerate(rows):
            if i and i % 200 == 0:
                print(f"  {b}: {i}/{len(rows)}", flush=True)
            res = det.predict(load_audio(Path(args.manifests) / r["path"]))
            scores.append(res.fake_probability)
            labels.append(r["label"])
            langs.append(r["language"])
            lat.append(res.latency_ms)
        scores, labels = np.array(scores), np.array(labels)
        wall = time.perf_counter() - started

        # Each backend is scored at its OWN EER threshold on this data. Dhwani ships no
        # calibrated operating point, so imposing VoiceGuard's would be meaningless.
        eer, thr = compute_eer(scores, labels)
        lo, hi = bootstrap_eer_ci(scores, labels, args.bootstrap, seed=args.seed)
        overall = {"n": len(labels), "eer": eer, "eer_ci": [lo, hi],
                   "auc": roc_auc(scores, labels), **rates_at_threshold(scores, labels, thr),
                   "median_latency_ms": float(np.median(lat)),
                   "wall_seconds": round(wall, 1), "version": det.version}
        per_lang = {}
        for lang in sorted(set(langs)):
            m = np.array([x == lang for x in langs])
            if len(set(labels[m].tolist())) < 2:
                continue
            e, _ = compute_eer(scores[m], labels[m])
            per_lang[lang] = {"n": int(m.sum()), "eer": e, "auc": roc_auc(scores[m], labels[m]),
                              **rates_at_threshold(scores[m], labels[m], thr)}
        results[b] = {"overall": overall, "per_language": per_lang}

    print(f"\n{'='*92}\nBACKEND COMPARISON -- {len(rows)} clips, split '{args.split}'\n{'='*92}")
    for b, r in results.items():
        o = r["overall"]
        print(f"\n{b}  ({o['version']})")
        print(f"  EER {100*o['eer']:.2f} % [{100*o['eer_ci'][0]:.1f}, {100*o['eer_ci'][1]:.1f}]"
              f"   AUC {o['auc']:.3f}   FPR {100*o['fpr']:.2f} %   FNR {100*o['fnr']:.2f} %")
        print(f"  precision {100*o['precision']:.2f} %   recall {100*o['recall']:.2f} %"
              f"   accuracy {100*o['accuracy']:.2f} %   median latency {o['median_latency_ms']:.0f} ms")
        print(f"  {'language':12s} {'n':>5s} {'EER%':>7s} {'AUC':>7s} {'FPR%':>7s} {'FNR%':>7s}")
        for lang, v in r["per_language"].items():
            print(f"  {lang:12s} {v['n']:5d} {100*v['eer']:7.2f} {v['auc']:7.3f} "
                  f"{100*v['fpr']:7.2f} {100*v['fnr']:7.2f}")
        if r["per_language"]:
            print(f"  {'MACRO':12s} {'':5s} "
                  f"{100*np.mean([v['eer'] for v in r['per_language'].values()]):7.2f} "
                  f"{np.mean([v['auc'] for v in r['per_language'].values()]):7.3f}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        json.dump(results, open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--backends", nargs="+", default=["voiceguard", "dhwani"])
    p.add_argument("--manifests", default="data/indic")
    p.add_argument("--split", default="test")
    p.add_argument("--checkpoint", default=None)
    p.add_argument("--dhwani-preprocessing", default="card",
                   choices=["card", "train", "serve"])
    p.add_argument("--dhwani-threads", type=int, default=6)
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--n", type=int, default=8)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--bootstrap", type=int, default=500)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", default=None)
    args = p.parse_args()
    return smoke(args) if args.smoke else evaluate(args)


if __name__ == "__main__":
    raise SystemExit(main())
