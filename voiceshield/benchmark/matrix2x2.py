"""The 2x2 isolation matrix, for any two checkpoints, on identical data.

                        Spoof
                    Internal   External
    Real Internal      A          B
    Real External      C          D

A is in-domain performance. B tests unseen generators. C and D test unseen bonafide --
the failure v0 exhibits and the reason this experiment exists.

Each model is scored at ITS OWN dev-fitted threshold, because that is the operating
point it would actually ship with. Comparing two models at one shared threshold would
flatter whichever one happened to be calibrated closer to it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from main import Dataset_Indic  # noqa: E402
from metrics import compute_eer, rates_at_threshold, roc_auc  # noqa: E402
from weights.load_pretrained import build_model  # noqa: E402


def load(path, device):
    blob = torch.load(path, map_location=device, weights_only=True)
    model = build_model(blob["config"], device=device).to(device)
    model.load_state_dict(blob["state_dict"])
    model.eval()
    return model, blob


def score_paths(model, root, items, cfg, device, bs=32, workers=4, trim=False):
    tmp = Path(root) / "_tmp_matrix.txt"
    tmp.write_text("".join(f"{p} {l}\n" for p, l in items))
    # root must be passed explicitly: Dataset_Indic now defaults to the package root,
    # and each set's paths are written relative to a different base.
    ds = Dataset_Indic(tmp, root=root, nb_samp=cfg["nb_samp"],
                       sample_rate=cfg.get("sample_rate", 16_000), normalise=True,
                       trim=trim)
    out = []
    with torch.no_grad():
        for x, _ in DataLoader(ds, batch_size=bs, num_workers=workers, pin_memory=True):
            out.append(model(x.to(device))[0].exp().cpu().numpy())
    tmp.unlink()
    return np.concatenate(out)


def boot_ci(fn, scores, labels, n=1000, seed=0):
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(scores), len(scores))
        if len(set(labels[i].tolist())) < 2:
            continue
        vals.append(fn(scores[i], labels[i]))
    if not vals:
        return float("nan"), float("nan")
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def cell(sb, ss, threshold, boot, seed):
    s = np.concatenate([sb, ss])
    y = np.concatenate([np.zeros(len(sb)), np.ones(len(ss))])
    eer, _ = compute_eer(s, y)
    auc = roc_auc(s, y)
    elo, ehi = boot_ci(lambda a, b: compute_eer(a, b)[0], s, y, boot, seed)
    alo, ahi = boot_ci(roc_auc, s, y, boot, seed)
    r = rates_at_threshold(s, y, threshold)
    return {"n": len(y), "eer": eer, "eer_ci": [elo, ehi],
            "auc": auc, "auc_ci": [alo, ahi], **r}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--models", nargs="+", required=True,
                   help="NAME=path/to/checkpoint.pth, repeatable")
    p.add_argument("--internal", default="data/indic")
    p.add_argument("--external", default="data/external2")
    p.add_argument("--bootstrap", type=int, default=1000)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", default="results/matrix2x2.json")
    args = p.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    LANGS = {"Hindi", "Tamil", "Telugu", "Malayalam"}   # external has no English spoof

    ir = [json.loads(l) for l in open(Path(args.internal) / "manifest.jsonl")]
    ir = [r for r in ir if r["split"] == "test" and r["language"] in LANGS]
    er = [json.loads(l) for l in open(Path(args.external) / "manifest.jsonl")]
    er = [r for r in er if r["language"] in LANGS]

    # Manifest paths are package-relative; external2 keeps its own directory-relative
    # form, so each set carries the root its paths were written against.
    PKG = Path(__file__).resolve().parents[1]
    sets = {
        ("internal", "bona"): (PKG, [(r["path"], 0) for r in ir if r["label"] == 0]),
        ("internal", "spoof"): (PKG, [(r["path"], 1) for r in ir if r["label"] == 1]),
        ("external", "bona"): (args.external, [(r["path"], 0) for r in er if r["label"] == 0]),
        ("external", "spoof"): (args.external, [(r["path"], 1) for r in er if r["label"] == 1]),
    }
    print("data:", {f"{a} {b}": len(v[1]) for (a, b), v in sets.items()})

    results = {}
    for spec in args.models:
        name, path = spec.split("=", 1)
        model, blob = load(path, device)
        cfg, thr, si = blob["config"], blob["threshold"], blob.get("spoof_index", 1)
        # Each model is scored under the audio contract it was TRAINED under. A model
        # trained on trimmed audio and evaluated on untrimmed audio (or the reverse) is
        # being asked a different question than it was taught, and the resulting numbers
        # would say more about the mismatch than about the model.
        trim = bool(blob.get("trim", False))
        print(f"\n{'='*94}")
        print(f"{name}  --  epoch {blob.get('epoch')}, dev EER {100*blob.get('dev_eer',float('nan')):.2f}%, "
              f"rawboost={blob.get('rawboost', 0) or 'off'}, trim={trim}, own threshold {thr:.6f}")
        print("=" * 94)

        sc = {k: score_paths(model, root, items, cfg, device, trim=trim)[:, si]
              for k, (root, items) in sets.items()}

        grid = {
            "A internal bona x internal spoof": (("internal", "bona"), ("internal", "spoof")),
            "B internal bona x EXTERNAL spoof": (("internal", "bona"), ("external", "spoof")),
            "C EXTERNAL bona x internal spoof": (("external", "bona"), ("internal", "spoof")),
            "D EXTERNAL bona x EXTERNAL spoof": (("external", "bona"), ("external", "spoof")),
        }
        print(f"{'cell':36s} {'n':>5s} {'EER%':>7s} {'95% CI':>14s} {'AUC':>6s} {'95% CI':>14s} "
              f"{'FPR%':>6s} {'FNR%':>6s} {'P%':>6s} {'R%':>6s} {'Acc%':>6s}")
        results[name] = {"epoch": blob.get("epoch"), "dev_eer": blob.get("dev_eer"),
                         "threshold": thr, "rawboost": blob.get("rawboost", 0),
                         "trim": trim, "cells": {}}
        for label, (bk, sk) in grid.items():
            c = cell(sc[bk], sc[sk], thr, args.bootstrap, args.seed)
            results[name]["cells"][label[0]] = c
            eci = "[%.1f, %.1f]" % (100 * c["eer_ci"][0], 100 * c["eer_ci"][1])
            aci = "[%.3f, %.3f]" % (c["auc_ci"][0], c["auc_ci"][1])
            print(f"{label:36s} {c['n']:5d} {100*c['eer']:7.2f} {eci:>14s} {c['auc']:6.3f} "
                  f"{aci:>14s} {100*c['fpr']:6.2f} {100*c['fnr']:6.2f} "
                  f"{100*c['precision']:6.2f} {100*c['recall']:6.2f} {100*c['accuracy']:6.2f}")
        print("\n  mean P(spoof): "
              + "  ".join(f"{a}/{b} {sc[(a,b)].mean():.4f}" for (a, b) in sets))

    if len(results) == 2:
        (n0, r0), (n1, r1) = results.items()
        print(f"\n{'='*94}\nDELTA  ({n1} minus {n0})   negative EER = better, positive AUC = better\n{'='*94}")
        print(f"{'cell':36s} {'dEER pp':>9s} {'dAUC':>8s} {'dFPR pp':>9s} {'dFNR pp':>9s}")
        for k in "ABCD":
            a, b = r0["cells"][k], r1["cells"][k]
            print(f"{k:36s} {100*(b['eer']-a['eer']):+9.2f} {b['auc']-a['auc']:+8.3f} "
                  f"{100*(b['fpr']-a['fpr']):+9.2f} {100*(b['fnr']-a['fnr']):+9.2f}")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(results, open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
