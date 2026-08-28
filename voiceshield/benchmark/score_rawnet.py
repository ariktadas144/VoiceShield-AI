"""Dump per-clip RawNet2 scores over the same manifests score_spectra.py reads.

The frozen SSL evaluation compared iv15 and Spectra at the cell level but never kept
iv15's per-clip scores, so the error-overlap analysis could not be re-opened. This
writes them, under the audio contract recorded in the checkpoint (trim included), so a
clip-by-clip comparison is reproducible instead of one-shot.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

PKG = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG))

from benchmark.matrix2x2 import load, score_paths  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ckpt", default="checkpoints_f5_iv15/best_model.pth")
    ap.add_argument("--internal", default="data/mixed_f5_iv15")
    ap.add_argument("--external", default="data/external2")
    ap.add_argument("--out", default="results/iv15_scores.jsonl")
    args = ap.parse_args()

    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, blob = load(PKG / args.ckpt, device)
    cfg, trim = blob["config"], bool(blob.get("trim", False))
    si = blob.get("spoof_index", 1)
    print(f"{args.ckpt}: threshold {blob['threshold']:.6f}, trim={trim}", flush=True)

    groups = [("internal", PKG, PKG / args.internal), ("external", PKG / args.external,
                                                       PKG / args.external)]
    with open(PKG / args.out, "w") as out:
        for name, root, mani in groups:
            rows = [json.loads(l) for l in open(mani / "manifest.jsonl") if l.strip()]
            rows = [r for r in rows if (Path(root) / r["path"]).exists()]
            s = score_paths(model, root, [(r["path"], r["label"]) for r in rows],
                            cfg, device, trim=trim)[:, si]
            print(f"  {name}: {len(rows)} clips", flush=True)
            for r, p in zip(rows, s):
                out.write(json.dumps({
                    "path": r["path"], "label": r["label"], "language": r.get("language"),
                    "source": r.get("source"), "generator": r.get("generator"),
                    "split": r.get("split"), "set": name, "p_spoof": float(p),
                }) + "\n")
    print(f"wrote {args.out}  (threshold {blob['threshold']:.6f})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
