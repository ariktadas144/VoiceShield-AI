"""Do the two detectors encode the same things? Linear probes on frozen embeddings.

Phase 11 of the provenance audit. Spectra's external robustness could come from a
genuinely stronger speech representation, or from a decision boundary that happens to
sit better. Probing the penultimate embedding separates those: we ask how linearly
decodable real/spoof, generator, language and recording corpus each are from the
representation the model actually hands to its classifier.

  Spectra   penultimate = input to aasist.out_layer  (5 * gat_dims wide)
  RawNet2   penultimate = input to fc1_binary_gru    (gru_node wide)

Each model is embedded under ITS OWN audio contract, exactly as it is scored:
Spectra gets preemphasis + 64,600; RawNet2 gets our peak normalisation, trim and
nb_samp from its checkpoint. A high real/spoof score is good. A high corpus or language
score means the representation carries domain identity, which is what makes a detector
transfer badly -- the failure mode this project has been chasing since v1.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

PKG = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG))


def probe(X, y, name, seed=0):
    """5-fold CV linear probe. Returns accuracy and the majority-class baseline."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    keep = Counter(y)
    m = np.array([keep[v] >= 10 for v in y])
    X, y = X[m], np.asarray(y)[m]
    if len(set(y)) < 2:
        return float("nan"), float("nan"), 0
    base = max(Counter(y).values()) / len(y)
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    acc = cross_val_score(clf, X, y, cv=cv, n_jobs=1).mean()
    return 100 * acc, 100 * base, len(y)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--n", type=int, default=2400, help="clips to embed per model")
    ap.add_argument("--out", default="results/representation_probe.json")
    args = ap.parse_args()

    import torch
    cache = PKG / "results/representation_embeddings.npz"
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    rows = [json.loads(l) for l in open(PKG / "results/spectra_scores_preemph.jsonl")]
    rng = np.random.default_rng(0)
    idx = rng.permutation(len(rows))[:args.n]
    items = [rows[i] for i in sorted(idx)]
    print(f"probing {len(items)} clips on {dev}", flush=True)

    if cache.exists():
        z = np.load(cache, allow_pickle=True)
        emb = {"Spectra-AASIST": z["spectra"], "iv15": z["iv15"]}
        order = [items[i] for i in z["order"]]
        print("  reusing cached embeddings", flush=True)
        return report(items, order, emb, PKG / args.out)

    # Import the RawNet2 side FIRST: models/spectra_aasist/model.py shadows the
    # package's own model.py once it goes on sys.path, and `main` imports RawNet from
    # there. Bind both names before the shadow exists.
    from benchmark.matrix2x2 import load, score_paths  # noqa: E402

    emb = {}

    # ---- Spectra -------------------------------------------------------------
    # Both files are called model.py. Importing either by name shadows the other, so
    # Spectra's is loaded by path under a private module name and never enters the
    # normal import graph.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "_spectra_model", PKG / "models/spectra_aasist/model.py")
    sm = importlib.util.module_from_spec(spec)
    sys.modules["_spectra_model"] = sm
    spec.loader.exec_module(sm)
    from benchmark.score_spectra import load_clip  # noqa: E402
    m = sm.SpectraAASIST.from_pretrained(str(PKG / "models/spectra_aasist")).to(dev).eval()
    buf = []
    m.aasist.out_layer.register_forward_pre_hook(
        lambda mod, inp: buf.append(inp[0].detach().cpu().numpy()))
    ext = PKG / "data/external2"
    def resolve(r):
        p = Path(r["path"])
        return p if p.is_absolute() else ((ext / p) if r["set"] == "external" else PKG / p)
    with torch.no_grad():
        for i in range(0, len(items), 8):
            X = np.stack([load_clip(resolve(r), 64_600, 0.97) for r in items[i:i + 8]])
            m(torch.from_numpy(X).float().to(dev))
    emb["Spectra-AASIST"] = np.concatenate(buf)
    del m, buf
    torch.cuda.empty_cache() if dev == "cuda" else None
    print(f"  Spectra embeddings {emb['Spectra-AASIST'].shape}", flush=True)

    # ---- iv15 ----------------------------------------------------------------
    model, blob = load(PKG / "checkpoints_f5_iv15/best_model.pth", dev)
    buf = []
    model.fc1_binary_gru.register_forward_pre_hook(
        lambda mod, inp: buf.append(inp[0].detach().cpu().numpy()))
    for setname, root in (("internal", PKG), ("external", ext)):
        sub = [r for r in items if r["set"] == setname]
        if sub:
            score_paths(model, root, [(r["path"], r["label"]) for r in sub],
                        blob["config"], dev, workers=0, trim=bool(blob.get("trim")))
    pos = {id(r): i for i, r in enumerate(items)}
    order = [r for r in items if r["set"] == "internal"] + \
            [r for r in items if r["set"] == "external"]
    emb["iv15"] = np.concatenate(buf)
    print(f"  iv15 embeddings {emb['iv15'].shape}", flush=True)
    np.savez(cache, spectra=emb["Spectra-AASIST"], iv15=emb["iv15"],
             order=np.array([pos[id(r)] for r in order]))

    return report(items, order, emb, PKG / args.out)


def report(items, order, emb, outpath):

    tasks = ["real vs spoof", "generator (spoof only)", "language", "recording corpus"]
    out = {}
    print(f"\n{'probe':<26}{'Spectra':>18}{'iv15':>18}   (majority baseline)")
    for tname in tasks:
        line = {}
        for mname, X in emb.items():
            lab = order if mname == "iv15" else items
            if tname == "generator (spoof only)":
                k = [i for i, r in enumerate(lab) if r["label"] == 1]
                Xs, ys = X[k], [lab[i]["generator"] for i in k]
            elif tname == "real vs spoof":
                Xs, ys = X, [r["label"] for r in lab]
            else:
                key = "language" if tname == "language" else None
                Xs = X
                ys = [r["language"] for r in lab] if key else \
                     [r["source"] or r["generator"] for r in lab]
            acc, base, n = probe(Xs, ys, tname)
            line[mname] = {"acc": acc, "baseline": base, "n": n}
        out[tname] = line
        s, v = line["Spectra-AASIST"], line["iv15"]
        print(f"{tname:<26}{s['acc']:>10.1f}%{'':>7}{v['acc']:>10.1f}%"
              f"      ({s['baseline']:.1f}% / {v['baseline']:.1f}%, n={s['n']})")
    json.dump({"n_clips": len(items), "dims": {k: int(v.shape[1]) for k, v in emb.items()},
               "probes": out}, open(outpath, "w"), indent=1)
    print(f"\nwrote {outpath}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
