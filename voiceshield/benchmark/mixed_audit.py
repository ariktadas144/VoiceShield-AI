"""Step 8: audit the ACTUAL training distribution, not the generators in isolation.

The pilot audited SPRING_F5 against its own reference clips. That answered "is this
generator's output anomalous", and it answered it misleadingly at first, because the
reference corpus was not the bonafide VoiceShield trains on. The question that decides
whether training may start is narrower and blunter:

    can the complete training set tell REAL from FAKE using nothing but nine recording
    statistics?

and its sharper form:

    can it tell REAL from SPRING_F5 specifically?

If either is yes, the mixture is broken and no amount of architecture will fix it -- the
model will take the free route. Run before every training run, with and without the
symmetric silence policy, so the effect of that policy on the real data is visible rather
than assumed.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pilot_audit import features, auc, load16k, trivial_classifier, FEATURES  # noqa: E402


def gather(rows: list[dict], root: Path, trim: bool, cap: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    if cap and len(rows) > cap:
        rows = rng.sample(rows, cap)
    out = []
    for r in rows:
        p = Path(r["path"])
        if not p.is_absolute():
            p = root / p
        if not p.exists():
            continue
        try:
            y, raw = load16k(p, trim=trim)
        except Exception:
            continue
        if y.size:
            out.append({**{k: r.get(k) for k in
                           ("label", "language", "generator", "source", "split", "speaker_id")},
                        **features(y)})
    return out


def contrast(name: str, pos: list[dict], neg: list[dict], seed: int) -> dict:
    print(f"\n--- {name}   ({len(pos)} vs {len(neg)}) ---")
    if len(pos) < 20 or len(neg) < 20:
        print("    too few clips, skipped")
        return {}
    worst = (None, 0.5)
    aucs = {}
    for f in FEATURES:
        a = auc(np.array([r[f] for r in pos]), np.array([r[f] for r in neg]))
        aucs[f] = a
        if abs(a - 0.5) > abs(worst[1] - 0.5):
            worst = (f, a)
        mark = "  <-- SHORTCUT" if abs(a - 0.5) >= 0.25 else ("  <-- watch" if abs(a - 0.5) >= 0.10 else "")
        print(f"    {f:16s} {a:6.3f}{mark}")
    X = np.array([[r[f] for f in FEATURES] for r in pos + neg])
    y = np.array([1] * len(pos) + [0] * len(neg))
    clf = trivial_classifier(X, y, seed)
    v = ("TRIVIALLY SEPARABLE" if clf["auc"] >= 0.90 else
         "partly separable" if clf["auc"] >= 0.75 else "not trivially separable")
    print(f"    trivial classifier: AUC={clf['auc']:.3f} balanced_acc={clf['balanced_acc']:.3f}"
          f"  -> {v}")
    return {"name": name, "n_pos": len(pos), "n_neg": len(neg), "auc": aucs,
            "worst_feature": worst[0], "worst_auc": worst[1],
            "classifier": clf, "verdict": v}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--manifest", default="data/mixed_f5/manifest.jsonl")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[1]),
                    help="manifest paths are relative to the package root")
    ap.add_argument("--split", default="train")
    ap.add_argument("--trim", action="store_true")
    ap.add_argument("--cap", type=int, default=700, help="clips sampled per group")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--per-language", action="store_true")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.manifest) if l.strip()]
    rows = [r for r in rows if r["split"] == args.split]
    root = Path(args.root)
    print(f"{args.split}: {len(rows)} rows   " +
          f"real={sum(1 for r in rows if r['label']==0)} "
          f"fake={sum(1 for r in rows if r['label']==1)}   "
          f"{dict(Counter(r.get('generator') for r in rows if r['label']==1))}")
    print(f"silence policy: {'SYMMETRIC TRIMMING (both classes)' if args.trim else 'none (as stored)'}")

    real = gather([r for r in rows if r["label"] == 0], root, args.trim, args.cap, args.seed)
    f5 = gather([r for r in rows if r.get("generator") == "spring_f5"],
                root, args.trim, args.cap, args.seed)
    sh = gather([r for r in rows if r.get("generator") == "sherry_spoof"],
                root, args.trim, args.cap, args.seed)

    print("\n" + "=" * 72)
    print("THE QUESTION THAT GATES TRAINING")
    print("=" * 72)
    res = [contrast("REAL vs ALL FAKE", f5 + sh, real, args.seed),
           contrast("REAL vs SPRING_F5 only", f5, real, args.seed),
           contrast("REAL vs Sherry spoof only", sh, real, args.seed),
           contrast("SPRING_F5 vs Sherry spoof", f5, sh, args.seed)]

    if args.per_language:
        print("\n" + "=" * 72)
        print("PER LANGUAGE: REAL vs ALL FAKE")
        print("=" * 72)
        for lang in sorted({r["language"] for r in real if r.get("language")}):
            res.append(contrast(f"[{lang}] REAL vs ALL FAKE",
                                [r for r in f5 + sh if r.get("language") == lang],
                                [r for r in real if r.get("language") == lang], args.seed))

    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)
    gate = True
    for r in res:
        if not r:
            continue
        bad = r["classifier"]["auc"] >= 0.90 or abs(r["worst_auc"] - 0.5) >= 0.25
        gate &= not bad
        print(f"  {r['name']:32s} clf={r['classifier']['auc']:.3f}  "
              f"worst={r['worst_feature']} {r['worst_auc']:.3f}  "
              f"{'FAIL' if bad else 'pass'}")
    print(f"\n  GATE: {'PASS -- no trivial shortcut, training may proceed' if gate else 'FAIL -- fix the mixture before training'}")

    if args.out:
        json.dump({"split": args.split, "trimmed": args.trim,
                   "contrasts": [r for r in res if r], "gate_pass": bool(gate)},
                  open(args.out, "w"), indent=2)
        print(f"  wrote {args.out}")
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
