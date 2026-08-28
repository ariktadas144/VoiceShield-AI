"""Zero-shot evaluation of frozen VoiceShield-Indic on an independent corpus.

Nothing here trains, tunes or re-thresholds. The checkpoint and its dev-fitted
threshold are used exactly as frozen, which is what makes this a generalisation test
rather than another split of the same data.

THE CROSS-CORPUS CONFOUND, STATED UP FRONT
------------------------------------------
The external set draws bonafide from FLEURS and spoof from IndicSynth, because
IndicSynth ships synthetic audio only and its bonafide references point at IndicSUPERB,
which is gated. Two different corpora therefore supply the two classes, and a detector
can separate corpora on channel, codec or level without modelling synthesis at all.

`--shortcut-probe` measures exactly that on the same clips the model sees. If trivial
features already separate the classes, the headline EER is an upper bound and is
reported as one. This is the single most important number on the page, and it is
printed before the results rather than after.

BREAKDOWNS
----------
IndicSynth carries generator, speaker and gender metadata, so results are reported per
generator (xtts_v2 / vits / freevc24) and per gender as well as per language -- the
training corpus exposes none of that, which is why this evaluation exists.
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from main import Dataset_Indic  # noqa: E402
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold, roc_auc  # noqa: E402
from weights.load_pretrained import build_model  # noqa: E402


def load_meta(manifest_dir: Path) -> dict:
    meta = {}
    with open(manifest_dir / "manifest.jsonl") as fh:
        for line in fh:
            row = json.loads(line)
            meta[row["path"]] = row
    return meta


def slice_report(name, scores, labels, threshold, boot, seed):
    if len(set(labels.tolist())) < 2:
        return None
    eer, _ = compute_eer(scores, labels)
    low, high = bootstrap_eer_ci(scores, labels, boot, seed=seed)
    rates = rates_at_threshold(scores, labels, threshold)
    return {"name": name, "n": int(len(labels)),
            "bonafide": int((labels == 0).sum()), "spoof": int((labels == 1).sum()),
            "eer": eer, "eer_ci": [low, high], "roc_auc": roc_auc(scores, labels), **rates}


def show(rows, title):
    print(f"\n{title}")
    print(f"{'':22s} {'n':>5s} {'bona':>5s} {'spf':>5s} {'EER%':>7s} {'95% CI':>15s} "
          f"{'AUC':>6s} {'FPR%':>6s} {'FNR%':>6s}")
    for r in rows:
        if r is None:
            continue
        lo, hi = r["eer_ci"]
        ci = "[%.1f, %.1f]" % (100 * lo, 100 * hi)
        print(f"{r['name']:22s} {r['n']:5d} {r['bonafide']:5d} {r['spoof']:5d} "
              f"{100*r['eer']:7.2f} {ci:>15s} {r['roc_auc']:6.3f} "
              f"{100*r['fpr']:6.2f} {100*r['fnr']:6.2f}")


def run(args) -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    manifest_dir = Path(args.manifests)
    frozen = json.load(open(args.frozen_manifest))

    blob = torch.load(frozen["checkpoint"]["path"], map_location=device, weights_only=True)
    cfg = blob["config"]
    model = build_model(cfg, device=device).to(device)
    model.load_state_dict(blob["state_dict"])
    model.eval()
    spoof_index = frozen["checkpoint"]["spoof_index"]
    threshold = frozen["checkpoint"]["threshold"]      # dev-fitted, frozen

    print("=" * 86)
    print(f"ZERO-SHOT EXTERNAL VALIDATION -- {frozen['name']} v{frozen['version']}")
    print("=" * 86)
    print(f"checkpoint  : {frozen['checkpoint']['path']}")
    print(f"              sha256 {frozen['checkpoint']['sha256'][:32]}...")
    print(f"              epoch {blob['epoch']}, seed {blob['seed']}, "
          f"dev EER {100*blob['dev_eer']:.2f}%")
    print(f"threshold   : {threshold:.6f}  (fitted on the TRAINING corpus dev split, frozen)")
    print(f"preprocessing: {cfg.get('sample_rate')} Hz, nb_samp {cfg['nb_samp']}, "
          f"normalise={args.normalise}")

    meta = load_meta(manifest_dir)
    dataset = Dataset_Indic(manifest_dir / "test.txt", nb_samp=cfg["nb_samp"],
                            sample_rate=cfg.get("sample_rate", 16_000),
                            normalise=args.normalise)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False,
                        num_workers=args.num_workers, pin_memory=True)
    chunks, labels = [], []
    with torch.no_grad():
        for batch_x, batch_y in loader:
            chunks.append(model(batch_x.to(device))[0].exp().cpu().numpy())
            labels.extend(batch_y.numpy().tolist())
    scores = np.concatenate(chunks)[:, spoof_index]
    labels = np.array(labels)
    paths = [dataset.items[i][0] for i in range(len(dataset))]
    rows = [meta[p] for p in paths]

    # --- the confound, before any result ---------------------------------
    if args.shortcut_probe:
        print(f"\n{'='*86}\nCROSS-CORPUS CONFOUND PROBE -- read this before the results"
              f"\n{'='*86}")
        print("Bonafide comes from FLEURS, spoof from IndicSynth. If trivial acoustic")
        print("features already separate them, the model need not detect synthesis at all.")
        for feat, key in (("duration", "duration_s"), ("peak", "pre_norm_peak"),
                          ("RMS dB", "pre_norm_rms_db")):
            vals = np.array([r[key] for r in rows], dtype=float)
            auc = roc_auc(vals, labels)
            verdict = ("SEVERE" if abs(auc - .5) > .35 else
                       "moderate" if abs(auc - .5) > .15 else "weak")
            print(f"  {feat:10s} AUC = {auc:.3f}   |off chance| {abs(auc-.5):.3f}   {verdict}")

    overall = slice_report("OVERALL", scores, labels, threshold, args.bootstrap, args.seed)
    results = {"frozen": frozen["checkpoint"]["sha256"], "normalise": args.normalise,
               "threshold": threshold, "overall": overall}

    print(f"\n{'='*86}\nRESULTS (zero-shot, frozen threshold)\n{'='*86}")
    show([overall], "overall")
    print(f"  precision {100*overall['precision']:.2f}%   recall {100*overall['recall']:.2f}%"
          f"   accuracy {100*overall['accuracy']:.2f}%")

    def group(key, title, getter=None):
        getter = getter or (lambda r: r.get(key, "unknown"))
        buckets = collections.defaultdict(lambda: ([], []))
        for s, l, r in zip(scores, labels, rows):
            buckets[getter(r)][0].append(s)
            buckets[getter(r)][1].append(l)
        out = [slice_report(str(k), np.array(v[0]), np.array(v[1]), threshold,
                            args.bootstrap, args.seed) for k, v in sorted(buckets.items())]
        out = [o for o in out if o]
        show(out, title)
        return out

    per_lang = group("language", "per language")
    if per_lang:
        macro = {k: float(np.mean([r[k] for r in per_lang]))
                 for k in ("eer", "roc_auc", "fpr", "fnr")}
        print(f"{'MACRO':22s} {'':17s} {100*macro['eer']:7.2f} {'':>15s} "
              f"{macro['roc_auc']:6.3f} {100*macro['fpr']:6.2f} {100*macro['fnr']:6.2f}")
        results["per_language"], results["macro"] = per_lang, macro

    # generator and speaker slices need bonafide alongside each spoof group, so each
    # generator bucket is scored against the pooled bonafide of the same languages.
    gens = sorted({r["generator"] for r in rows if r["label"] == 1})
    if gens:
        print(f"\nper generator (each scored against all bonafide)")
        print(f"{'':22s} {'spoof n':>8s} {'FNR%':>7s} {'mean P(spoof)':>14s}  note")
        gen_rows = []
        for g in gens:
            mask = np.array([r["generator"] == g and r["label"] == 1 for r in rows])
            if not mask.sum():
                continue
            sc = scores[mask]
            fnr = float((sc < threshold).mean())
            gen_rows.append({"generator": g, "n": int(mask.sum()), "fnr": fnr,
                             "mean_score": float(sc.mean())})
            print(f"{g:22s} {int(mask.sum()):8d} {100*fnr:7.2f} {sc.mean():14.4f}")
        results["per_generator"] = gen_rows
        print("  Disjointness from the training corpus is NOT established -- the training")
        print("  corpus does not document its generators, so 'unseen generator' is not claimed.")

    gender_rows = group("gender", "per gender")
    if gender_rows:
        results["per_gender"] = gender_rows

    spk = {r["speaker_id"] for r in rows if r["label"] == 1}
    print(f"\nspeakers: {len(spk)} distinct synthetic target speakers in the external set.")
    print("  The training corpus exposes no speaker IDs, so overlap cannot be checked and")
    print("  no unseen-speaker claim is made.")

    print("\nscore distribution -- P(spoof):")
    for cls, name in ((0, "bonafide"), (1, "spoof")):
        s = scores[labels == cls]
        if len(s):
            print(f"  {name:9s} n={len(s):5d}  mean {s.mean():.4f}  median {np.median(s):.4f}"
                  f"  p10 {np.percentile(s,10):.4f}  p90 {np.percentile(s,90):.4f}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        json.dump(results, open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--manifests", default="data/external")
    p.add_argument("--frozen-manifest", default="frozen/MANIFEST.json")
    p.add_argument("--batch_size", type=int, default=32)
    p.add_argument("--num_workers", type=int, default=4)
    p.add_argument("--bootstrap", type=int, default=1000)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--no-normalise", dest="normalise", action="store_false", default=True)
    p.add_argument("--shortcut-probe", action="store_true", default=True)
    p.add_argument("--out", default="results/external.json")
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
