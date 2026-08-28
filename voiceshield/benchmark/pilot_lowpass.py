"""Low-pass probe: is v1's reaction to the new spoofs about synthesis, or about bandwidth?

A detector that has learned a real synthesis artefact keeps working when you throw away
the top of the spectrum. A detector that has learned "spoofs are band-limited" collapses.
This probe is what exposed v2 -- at a 4 kHz cut its flagged rate fell to 17.5% while v1
held 3.8%, which is how the MMS-TTS bandwidth shortcut was caught.

Run here on generators v1 has never seen, it answers two separate questions:

  on spoof     does v1 flag these clips for a reason that survives losing 4 kHz of
               bandwidth? A rate that collapses means the only thing v1 can see is the
               band edge, and training on such clips would teach exactly that.

  on bonafide  does low-passing GENUINE speech push it over the threshold? Telephone
               audio is band-limited. If a 4 kHz cut turns real speakers into
               "spoof", that is a false-accusation risk and it is a hard constraint,
               not a metric to trade away.
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audio_utils import load_audio, pad          # noqa: E402
from model import RawNet                          # noqa: E402

SPOOF_INDEX = 1


def lowpass(y: np.ndarray, sr: int, cutoff: float | None) -> np.ndarray:
    """Zero-phase Butterworth, so the filter adds no group delay of its own."""
    if cutoff is None:
        return y
    from scipy.signal import butter, sosfiltfilt
    sos = butter(8, cutoff / (sr / 2), btype="low", output="sos")
    return np.ascontiguousarray(sosfiltfilt(sos, y).astype(np.float32))


def load_model(ckpt: Path, config: str, device: str):
    blob = torch.load(ckpt, map_location=device, weights_only=True)
    cfg = blob.get("config") if isinstance(blob, dict) else None
    if cfg is None:
        cfg = yaml.safe_load(open(config))["model"]
    state = blob["state_dict"] if isinstance(blob, dict) and "state_dict" in blob else blob
    m = RawNet(copy.deepcopy(cfg), device).to(device)
    m.load_state_dict(state)
    m.eval()
    thr = blob.get("threshold") if isinstance(blob, dict) else None
    return m, cfg, thr


def score(model, y: np.ndarray, window: int, device: str) -> float:
    """Mean P(spoof) over non-overlapping windows -- the same pooling eval.py uses."""
    if len(y) <= window:
        chunks = [pad(y, window)]
    else:
        chunks = [pad(y[i:i + window], window) for i in range(0, len(y), window)
                  if len(y[i:i + window]) > window // 10]
    out = []
    with torch.no_grad():
        for c in chunks:
            t = torch.from_numpy(np.ascontiguousarray(c)).float().to(device).unsqueeze(0)
            binary, _ = model(t)
            out.append(float(binary.exp().cpu().numpy()[0][SPOOF_INDEX]))
    return float(np.mean(out))


def gather(spec: str, group: str, limit: int) -> list[dict]:
    root = Path(spec)
    if (root / "references.jsonl").exists():
        rows = [json.loads(l) for l in open(root / "references.jsonl")]
        for r in rows:
            r["path"] = r["ref_path"]
        rows = [{"path": r["path"], "language": r["language"], "label": 0} for r in rows]
    else:
        rows = [json.loads(l) for l in open(root / "manifest.jsonl")]
    if limit:
        rows = rows[:limit]
    return [{"root": root, "group": group, **r} for r in rows]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="checkpoints_v1/best_model.pth")
    ap.add_argument("--config", default="model_config_RawNet.yaml")
    ap.add_argument("--spoof", nargs="+", default=["data/pilot_spoof/spring_f5",
                                                   "data/pilot_spoof/indic_mio"])
    ap.add_argument("--bonafide", default="data/pilot_refs")
    ap.add_argument("--cutoffs", default="none,4000,2000")
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="data/pilot_spoof/lowpass.json")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, cfg, ckpt_thr = load_model(Path(args.model), args.config, device)
    sr = int(cfg.get("sample_rate", 16_000))
    window = int(cfg["nb_samp"])
    thr = args.threshold if args.threshold is not None else ckpt_thr
    if thr is None:
        print("no threshold in checkpoint and none supplied", file=sys.stderr)
        return 1
    print(f"model {args.model}  sr={sr}  window={window}  threshold={thr:.6f}\n")

    cuts = [None if c.strip() == "none" else float(c) for c in args.cutoffs.split(",")]
    items = []
    for d in args.spoof:
        if (Path(d) / "manifest.jsonl").exists():
            items += gather(d, Path(d).name, args.limit)
    items += gather(args.bonafide, "bonafide", args.limit)

    results = {}
    for it in items:
        p = it["root"] / it["path"]
        if not p.exists():
            continue
        try:
            y = load_audio(p, sr, normalise=True)
        except Exception as exc:
            print(f"  skip {p.name}: {exc}", file=sys.stderr)
            continue
        for c in cuts:
            key = (it["group"], it.get("language"), "none" if c is None else int(c))
            results.setdefault(key, []).append(score(model, lowpass(y, sr, c), window, device))

    label = {"none": "unfiltered", 4000: "4 kHz", 2000: "2 kHz"}
    groups = sorted({k[0] for k in results})
    cutkeys = ["none" if c is None else int(c) for c in cuts]

    print("=" * 78)
    print("FLAGGED RATE  (share of clips scored >= threshold)")
    print("=" * 78)
    print(f"{'group':14s} {'n':>5s}  " + "  ".join(f"{label.get(c,c):>11s}" for c in cutkeys))
    summary = {}
    for g in groups:
        row, n = [], 0
        for c in cutkeys:
            vals = [v for k, vv in results.items() if k[0] == g and k[2] == c for v in vv]
            n = len(vals)
            row.append(float(np.mean([v >= thr for v in vals])) if vals else float("nan"))
        summary[g] = dict(zip([str(c) for c in cutkeys], row))
        note = ""
        if g != "bonafide" and not np.isnan(row[0]) and row[0] > 0:
            drop = row[0] - row[min(1, len(row) - 1)]
            if drop >= 0.30:
                note = "   <-- collapses under low-pass: BANDWIDTH-DRIVEN"
        if g == "bonafide" and max(row[1:] or [0]) >= 0.20:
            note = "   <-- low-pass causes FALSE ACCUSATIONS"
        print(f"{g:14s} {n:5d}  " + "  ".join(f"{100*v:10.1f}%" for v in row) + note)

    print("\n" + "=" * 78)
    print("MEAN P(spoof)")
    print("=" * 78)
    print(f"{'group':14s}  " + "  ".join(f"{label.get(c,c):>11s}" for c in cutkeys))
    for g in groups:
        row = []
        for c in cutkeys:
            vals = [v for k, vv in results.items() if k[0] == g and k[2] == c for v in vv]
            row.append(float(np.mean(vals)) if vals else float("nan"))
        print(f"{g:14s}  " + "  ".join(f"{v:11.4f}" for v in row))

    print("\n" + "=" * 78)
    print("PER LANGUAGE, unfiltered")
    print("=" * 78)
    langs = sorted({k[1] for k in results if k[1]})
    print(f"{'group':14s} " + "  ".join(f"{l:>11s}" for l in langs))
    for g in groups:
        row = []
        for l in langs:
            vals = [v for k, vv in results.items() if k[0] == g and k[1] == l and k[2] == cutkeys[0]
                    for v in vv]
            row.append(float(np.mean([v >= thr for v in vals])) if vals else float("nan"))
        print(f"{g:14s} " + "  ".join(f"{100*v:10.1f}%" for v in row))

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump({"model": args.model, "threshold": thr, "cutoffs": [str(c) for c in cutkeys],
               "flagged_rate": summary}, open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
