"""Audit a candidate third bonafide corpus BEFORE it is allowed near training.

Four questions, in order of what would kill the candidate fastest:

  1. Does it actually add a new recording domain, or is it a third flavour of what we
     already have? (If it sits on top of Sherry or OpenSLR it buys nothing.)
  2. Does it widen the real class toward the region FLEURS occupies? This is measured,
     never optimised for -- selecting on closeness to the evaluation set would be
     fitting the test.
  3. Is it trivially separable from the FAKE class? If "IndicVoices = real" is readable
     from recording statistics, we have swapped one dataset-to-label shortcut for
     another and the candidate fails.
  4. Specifically: is "reverberant/noisy = real" separable? IndicVoices-R is this corpus
     dereverberated and denoised, and SPRING_F5 trained on IndicVoices-R. Raw IndicVoices
     is not denoised. That asymmetry is the concrete shortcut risk this corpus carries.

A four-way domain-identification test reports the confusion matrix, because the useful
question is not "are these corpora different" -- they are -- but which pairs a model can
tell apart and along what axis.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression_diagnosis import load16k, features, FEATURES  # noqa: E402
from pilot_audit import auc, trivial_classifier, describe  # noqa: E402


def collect(paths, cap, seed):
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
            out.append(features(y))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cap", type=int, default=400)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="results/bonafide_candidate_audit.json")
    args = ap.parse_args()

    mixed = [json.loads(l) for l in open("data/mixed_f5/manifest.jsonl") if l.strip()]
    tr = [r for r in mixed if r["split"] == "train"]
    E = Path("data/external2")
    er = [json.loads(l) for l in open(E / "manifest.jsonl")]
    iv = [json.loads(l) for l in open("data/indicvoices/manifest.jsonl")]

    pops = {
        "sherry_bona": [r["path"] for r in tr if r["label"] == 0 and r["source"] == "SherryT997"],
        "openslr_bona": [r["path"] for r in tr if r["label"] == 0 and r["source"] == "OpenSLR"],
        "indicvoices": [r["path"] for r in iv],
        "fleurs_bona": [str(E / r["path"]) for r in er if r["label"] == 0],
        "sherry_spoof": [r["path"] for r in tr if r.get("generator") == "sherry_spoof"],
        "spring_f5": [r["path"] for r in tr if r.get("generator") == "spring_f5"],
    }
    data = {k: collect(v, args.cap, args.seed) for k, v in pops.items()}
    print("populations: " + ", ".join(f"{k}={len(v)}" for k, v in data.items()))

    print("\n" + "=" * 104)
    print("DISTRIBUTIONS   (min  p10  p25  median  p75  p90  max)")
    print("=" * 104)
    for f in FEATURES:
        print(f"\n{f}")
        for k, v in data.items():
            a = np.array([r[f] for r in v])
            if a.size:
                print(f"  {k:14s} {describe(a)}")

    real = ["sherry_bona", "openslr_bona", "indicvoices", "fleurs_bona"]
    print("\n" + "=" * 104)
    print("Q1/Q2  PAIRWISE SEPARABILITY BETWEEN REAL CORPORA (trivial classifier)")
    print("=" * 104)
    print(f"{'':14s}" + "".join(f"{k[:12]:>14s}" for k in real))
    sep = {}
    for a in real:
        row = []
        for b in real:
            if a == b:
                row.append(float("nan")); continue
            X = np.array([[r[f] for f in FEATURES] for r in data[a] + data[b]])
            y = np.array([1] * len(data[a]) + [0] * len(data[b]))
            v = trivial_classifier(X, y, args.seed)["auc"]
            row.append(v); sep[f"{a}|{b}"] = v
        print(f"{a:14s}" + "".join(f"{c:14.3f}" for c in row))

    print("\n  centroid distances in standardised feature space:")
    allv = np.array([[r[f] for f in FEATURES] for v in data.values() for r in v])
    mu, sd = allv.mean(0), allv.std(0) + 1e-9
    Z = {k: (np.array([[r[f] for f in FEATURES] for r in v]) - mu) / sd for k, v in data.items()}
    cent = {k: v.mean(0) for k, v in Z.items()}
    keys = real
    print(f"{'':14s}" + "".join(f"{k[:12]:>14s}" for k in keys))
    for a in keys:
        print(f"{a:14s}" + "".join(
            f"{np.linalg.norm(cent[a]-cent[b]):14.2f}" for b in keys))

    print("\n  >>> does adding IndicVoices move the REAL centroid toward FLEURS?")
    old = np.vstack([Z["sherry_bona"], Z["openslr_bona"]]).mean(0)
    new = np.vstack([Z["sherry_bona"], Z["openslr_bona"], Z["indicvoices"]]).mean(0)
    dof, dnf = np.linalg.norm(old - cent["fleurs_bona"]), np.linalg.norm(new - cent["fleurs_bona"])
    print(f"      real centroid -> FLEURS   before {dof:.3f}   after {dnf:.3f}   "
          f"({'closer' if dnf < dof else 'further'} by {abs(dof-dnf):.3f})")
    # coverage: share of FLEURS clips whose nearest real corpus becomes IndicVoices
    near = [min(real, key=lambda k: np.linalg.norm(z - cent[k])) for z in Z["fleurs_bona"]]
    print("      nearest real corpus for FLEURS clips: "
          + str({k: round(100 * near.count(k) / len(near), 1) for k in real}))

    print("\n" + "=" * 104)
    print("Q3  SHORTCUT RISK: is the candidate trivially separable from the FAKE class?")
    print("=" * 104)
    fake = data["sherry_spoof"] + data["spring_f5"]
    checks = [("IndicVoices vs ALL FAKE", data["indicvoices"], fake),
              ("Sherry bona  vs ALL FAKE", data["sherry_bona"], fake),
              ("OpenSLR bona vs ALL FAKE", data["openslr_bona"], fake),
              ("IndicVoices vs SPRING_F5", data["indicvoices"], data["spring_f5"])]
    # Evaluate every check first, THEN compare. The earlier version flagged the
    # candidate against a dict that was still being filled, so IndicVoices was compared
    # against nothing and always looked worse.
    risk = {}
    for name, A, B in checks:
        X = np.array([[r[f] for f in FEATURES] for r in A + B])
        y = np.array([1] * len(A) + [0] * len(B))
        c = trivial_classifier(X, y, args.seed)["auc"]
        worst = max(FEATURES, key=lambda f: abs(
            auc(np.array([r[f] for r in A]), np.array([r[f] for r in B])) - 0.5))
        wv = auc(np.array([r[worst] for r in A]), np.array([r[worst] for r in B]))
        risk[name] = {"auc": c, "worst": worst, "worst_auc": wv}
    base = max(risk["Sherry bona  vs ALL FAKE"]["auc"],
               risk["OpenSLR bona vs ALL FAKE"]["auc"])
    for name, v in risk.items():
        flag = ""
        if name.startswith("IndicVoices vs ALL"):
            flag = ("  <-- WORSE than the corpora already in training"
                    if v["auc"] > base else
                    f"  <-- SAFER than OpenSLR, already in training ({base:.3f})")
        print(f"  {name:28s} AUC={v['auc']:.3f}   worst: {v['worst']} "
              f"({v['worst_auc']:.3f}){flag}")

    print("\n" + "=" * 104)
    print("Q4  THE DENOISING ASYMMETRY  (is 'reverberant/noisy = real' readable?)")
    print("=" * 104)
    for f in ["noise_floor_db", "flatness", "dyn_range_db", "lf_share", "hf_share"]:
        a = np.array([r[f] for r in data["indicvoices"]])
        b = np.array([r[f] for r in data["spring_f5"]])
        print(f"  {f:16s} IndicVoices median {np.median(a):9.3f}   "
              f"SPRING_F5 {np.median(b):9.3f}   AUC {auc(a,b):.3f}")

    json.dump({"separability": sep, "shortcut_risk": risk,
               "n": {k: len(v) for k, v in data.items()},
               "medians": {k: {f: float(np.median([r[f] for r in v])) for f in FEATURES}
                           for k, v in data.items() if v}},
              open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
