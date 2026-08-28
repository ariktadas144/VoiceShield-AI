"""Where do the candidate generators sit relative to the data VoiceShield already uses?

The A/B/C/D contrasts compare the candidates against the pilot's own reference clips.
That is the tightest speaker control available, but the reference corpus is not the
bonafide VoiceShield actually trains on, and it turns out to differ from it. So the
question those contrasts answer is partly "how does OpenSLR differ from SherryT997".

This asks the question that decides the pilot instead. Five populations, one front end:

  bonafide_train   genuine speech from the existing training mixture
  bonafide_ref     the pilot's reference clips
  spoof_existing   xtts_v2 / freevc24 -- the spoofs VoiceShield already trains against
  spring_f5        candidate A
  indic_mio        candidate B

Everything is scored against bonafide_train. spoof_existing is the calibration: it is
already in use, so whatever AUC it shows against bonafide_train is the level of acoustic
separability this project has already accepted. A candidate near that level adds no new
shortcut. A candidate far above it does, and the size of the gap is the finding.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pilot_audit import collect, auc, trivial_classifier, FEATURES  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mixed", default="data/mixed")
    ap.add_argument("--refs", default="data/pilot_refs")
    ap.add_argument("--spoof", nargs="+", default=["data/pilot_spoof/spring_f5",
                                                   "data/pilot_spoof/indic_mio"])
    ap.add_argument("--n-existing", type=int, default=400)
    ap.add_argument("--trim", action="store_true")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="data/pilot_spoof/populations.json")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    pops: dict[str, list] = {}

    mroot = Path(args.mixed)
    rows = [json.loads(l) for l in open(mroot / "manifest.jsonl") if l.strip()]
    tr = [r for r in rows if r.get("split") == "train"]
    for nm, lab in [("bonafide_train", 0), ("spoof_existing", 1)]:
        g = [r for r in tr if r["label"] == lab]
        rng.shuffle(g)
        pops[nm] = collect(g[: args.n_existing], mroot, nm, 0, args.trim)

    rroot = Path(args.refs)
    brows = [{"path": r["ref_path"], "language": r["language"],
              "ref_speaker": r["speaker_id"]}
             for r in map(json.loads, open(rroot / "references.jsonl"))]
    pops["bonafide_ref"] = collect(brows, rroot, "bonafide_ref", 0, args.trim)

    for d in args.spoof:
        root = Path(d)
        man = root / "manifest.jsonl"
        if man.exists():
            pops[root.name] = collect([json.loads(l) for l in open(man)],
                                      root, root.name, 0, args.trim)

    order = [k for k in ["bonafide_train", "bonafide_ref", "spoof_existing"] if k in pops]
    cands = [Path(d).name for d in args.spoof if Path(d).name in pops]
    order += cands

    print("=" * 78)
    print(f"POPULATION MEDIANS   [p25 - p75]" + ("   (silence-trimmed)" if args.trim else ""))
    print("=" * 78)
    for feat in FEATURES:
        print(f"\n{feat}")
        for nm in order:
            v = np.array([r[feat] for r in pops[nm] if feat in r])
            if v.size:
                q = np.percentile(v, [25, 50, 75])
                print(f"  {nm:16s} {q[1]:10.3f}  [{q[0]:9.3f} - {q[2]:9.3f}]  n={v.size}")

    print("\n" + "=" * 78)
    print("SINGLE-FEATURE AUC vs bonafide_train")
    print("  spoof_existing is the accepted baseline: match it and nothing new is added")
    print("=" * 78)
    base = pops["bonafide_train"]
    result: dict = {"vs_bonafide_train": {}}
    header = [nm for nm in order if nm != "bonafide_train"]
    print(f"\n{'feature':16s} " + "  ".join(f"{n:>15s}" for n in header))
    for feat in FEATURES:
        b = np.array([r[feat] for r in base if feat in r])
        cells = []
        for nm in header:
            v = np.array([r[feat] for r in pops[nm] if feat in r])
            a = auc(v, b) if v.size else float("nan")
            result["vs_bonafide_train"].setdefault(nm, {})[feat] = a
            mark = "*" if abs(a - 0.5) >= 0.25 else " "
            cells.append(f"{a:14.3f}{mark}")
        print(f"{feat:16s} " + "  ".join(cells))
    print("\n  * = |AUC-0.5| >= 0.25, separable on this feature alone")

    print("\n" + "=" * 78)
    print("TRIVIAL CLASSIFIER vs bonafide_train  (5-fold CV, all features)")
    print("=" * 78)
    B = np.array([[r[f] for f in FEATURES] for r in base if "rms_db" in r])
    result["classifier_vs_bonafide_train"] = {}
    for nm in header:
        V = np.array([[r[f] for f in FEATURES] for r in pops[nm] if "rms_db" in r])
        if not V.size:
            continue
        X = np.vstack([V, B])
        y = np.array([1] * len(V) + [0] * len(B))
        clf = trivial_classifier(X, y, args.seed)
        result["classifier_vs_bonafide_train"][nm] = clf
        verdict = ("TRIVIALLY SEPARABLE" if clf["auc"] >= 0.90 else
                   "partly separable" if clf["auc"] >= 0.75 else "not trivially separable")
        print(f"  {nm:16s} AUC={clf['auc']:.3f}  balanced_acc={clf['balanced_acc']:.3f}"
              f"   {verdict}")

    ex = result["classifier_vs_bonafide_train"].get("spoof_existing", {}).get("auc")
    if ex is not None:
        print(f"\n  accepted baseline (spoof_existing) = {ex:.3f}")
        for nm in cands:
            c = result["classifier_vs_bonafide_train"].get(nm, {}).get("auc")
            if c is not None:
                print(f"  {nm:16s} {c:.3f}   excess over accepted baseline: {c-ex:+.3f}")

    result["n"] = {k: len(v) for k, v in pops.items()}
    result["trimmed"] = args.trim
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(result, open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
