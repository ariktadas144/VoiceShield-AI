"""Score every evaluation clip with Spectra-AASIST under ITS OWN inference contract.

The contract was read from the model's source, not its card:

    sample rate    16 kHz
    channels       mono
    normalisation  NONE  -- Wav2Vec2Encoder is constructed with normalize_waveform=False,
                            unlike our RawNet2 path which peak-normalises to 0.95
    window         64,400 samples (the model's own AASIST nb_samp), first window,
                   tiled if the clip is shorter -- the same rule matrix2x2 applies to
                   iv15, so the two models see the same amount of each clip
    class order    index 0 = spoof, index 1 = bonafide  (verified on 80 known-label
                   clips: logits[:,0] gives AUC 0.973, logits[:,1] gives 0.028)
    score          P(spoof) = softmax(logits)[:, 0], so it is directly comparable with
                   VoiceGuard's P(spoof) without any sign flip at comparison time

Each model is given the preprocessing it was trained under. Forcing our normalisation
onto Spectra would measure a preprocessing mismatch and call it architecture.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

PKG = Path(__file__).resolve().parents[1]
NB_SAMP, SR = 64_400, 16_000
PREEMPH = 0.97


def load_clip(p: Path, nb_samp: int = NB_SAMP, preemph: float | None = None) -> np.ndarray:
    y, sr = sf.read(p, dtype="float32", always_2d=True)
    y = y.mean(axis=1)
    if sr != SR and y.size:
        import soxr
        y = soxr.resample(y, sr, SR).astype(np.float32)
    if y.size == 0:
        return np.zeros(nb_samp, dtype=np.float32)
    # The card's own example applies torchaudio preemphasis BEFORE windowing, and the
    # Arena scored it that way too ("FP32, preemphasis (0.97), deterministic first
    # window"). Our first pass omitted it; --preemph reproduces the published contract.
    if preemph:
        y = np.concatenate([y[:1], y[1:] - preemph * y[:-1]]).astype(np.float32)
    if len(y) >= nb_samp:
        return np.ascontiguousarray(y[:nb_samp])
    return np.ascontiguousarray(np.tile(y, int(nb_samp / len(y)) + 1)[:nb_samp])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="models/spectra_aasist")
    ap.add_argument("--internal", default="data/mixed_f5_iv15")
    ap.add_argument("--external", default="data/external2")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--out", default="results/spectra_scores.jsonl")
    ap.add_argument("--nb-samp", type=int, default=NB_SAMP,
                    help="64400 = the model's own d_args; 64600 = the card example and Arena")
    ap.add_argument("--preemph", type=float, default=0.0,
                    help="0.97 reproduces the card/Arena contract; 0 disables")
    args = ap.parse_args()

    sys.path.insert(0, str(PKG / args.model))
    from model import SpectraAASIST

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    m = SpectraAASIST.from_pretrained(args.model).to(dev).eval()
    print(f"loaded {args.model} on {dev}", flush=True)

    items = []
    for r in (json.loads(l) for l in open(PKG / args.internal / "manifest.jsonl") if l.strip()):
        items.append({**r, "_root": "pkg", "_set": "internal"})
    for r in (json.loads(l) for l in open(PKG / args.external / "manifest.jsonl") if l.strip()):
        items.append({**r, "_root": "ext", "_set": "external"})
    ext_root = PKG / args.external
    print(f"clips to score: {len(items)}", flush=True)

    out = open(PKG / args.out, "w")
    torch.cuda.reset_peak_memory_stats() if dev == "cuda" else None
    lat, n = [], 0
    for i in range(0, len(items), args.batch):
        chunk = items[i:i + args.batch]
        paths, keep = [], []
        for r in chunk:
            p = Path(r["path"])
            p = (PKG / p) if r["_root"] == "pkg" and not p.is_absolute() else \
                ((ext_root / p) if r["_root"] == "ext" and not p.is_absolute() else p)
            if p.exists():
                paths.append(p); keep.append(r)
        if not paths:
            continue
        X = np.stack([load_clip(p, args.nb_samp, args.preemph or None) for p in paths])
        t0 = time.perf_counter()
        with torch.no_grad():
            lg = m(torch.from_numpy(X).float().to(dev))
            prob = torch.softmax(lg, dim=1).cpu().numpy()
        dt = (time.perf_counter() - t0) / len(paths)
        lat.append(dt)
        for r, pr, l in zip(keep, prob, lg.cpu().numpy()):
            out.write(json.dumps({
                "path": r["path"], "label": r["label"], "language": r.get("language"),
                "source": r.get("source"), "generator": r.get("generator"),
                "split": r.get("split"), "set": r["_set"],
                "p_spoof": float(pr[0]), "logit_spoof": float(l[0]),
                "logit_bonafide": float(l[1]),
            }) + "\n")
        n += len(paths)
        if i % (args.batch * 50) == 0:
            print(f"  {n}/{len(items)}", flush=True)
    out.close()
    print(f"\nscored {n} clips -> {args.out}", flush=True)
    print(f"median per-clip latency: {1000*np.median(lat):.1f} ms (batch {args.batch}, {dev})",
          flush=True)
    if dev == "cuda":
        print(f"peak VRAM: {torch.cuda.max_memory_allocated()/2**20:.0f} MiB", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
