"""Phase A -- score the FROZEN official RawNet2 checkpoint on the Indic test set.

No weights are modified here. The question this answers is narrow and worth answering
before any training happens:

    how well does the existing pretrained VoiceShield/RawNet2 already work on Indic
    speech, and is whatever we see caused by language/domain mismatch or by
    preprocessing?

so that the fine-tuned model has an honest "before" to be compared against.

THE CLASS ORDER IS THE OPPOSITE OF OURS, AND THAT IS NOT A GUESS.
`asvspoof-challenge/2021` `LA/Baseline-RawNet2/data_utils.py` builds labels as
`d_meta[key] = 1 if label == 'bonafide' else 0`, so in the pretrained head index 0 is
SPOOF. Our manifests use 1 = spoof. This script reads P(spoof) from index 0 and, as a
check on that reading rather than a way of choosing it, also prints the mirrored
orientation -- ROC-AUC is directional, so an inverted convention shows up as AUC < 0.5.

Preprocessing is the same `audio_utils` path training will use, and both the normalised
and un-normalised variants are scored, because the audit found a strong raw-amplitude
shortcut in Tamil (peak AUC 0.059) that would otherwise be mistaken for detection.
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from main import Dataset_Indic  # noqa: E402
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold, roc_auc  # noqa: E402
from weights.load_pretrained import (  # noqa: E402
    PRETRAINED_SPOOF_INDEX, build_model, load_config, load_pretrained,
)

LANGUAGES = ["Hindi", "English", "Tamil", "Telugu", "Malayalam"]


def language_of(manifest_dir: Path) -> dict:
    mapping = {}
    with open(manifest_dir / "manifest.jsonl") as fh:
        for line in fh:
            row = json.loads(line)
            mapping[row["path"]] = row["language"]
    return mapping


def score(model, manifest_dir, split, cfg, normalise, batch_size, workers, device):
    dataset = Dataset_Indic(manifest_dir / f"{split}.txt", nb_samp=cfg["nb_samp"],
                            sample_rate=cfg.get("sample_rate", 16_000), normalise=normalise)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False,
                        num_workers=workers, pin_memory=True)
    model.eval()
    both, labels = [], []
    started = time.time()
    with torch.no_grad():
        for batch_x, batch_y in loader:
            probs = model(batch_x.to(device))[0].exp().cpu().numpy()
            both.append(probs)
            labels.extend(batch_y.numpy().tolist())
    elapsed = time.time() - started
    probs = np.concatenate(both, axis=0)
    return probs, np.array(labels), [dataset.items[i][0] for i in range(len(dataset))], elapsed


def block(name, scores, labels, threshold=None):
    eer, eer_threshold = compute_eer(scores, labels)
    low, high = bootstrap_eer_ci(scores, labels, 1000, seed=0)
    rates = rates_at_threshold(scores, labels, eer_threshold if threshold is None else threshold)
    return {
        "name": name, "n": int(len(labels)),
        "bonafide": int((labels == 0).sum()), "spoof": int((labels == 1).sum()),
        "eer": eer, "eer_ci": [low, high], "eer_threshold": eer_threshold,
        "roc_auc": roc_auc(scores, labels), **rates,
    }


def show(rows, title):
    print(f"\n{title}")
    print(f"{'':11s} {'n':>5s} {'EER%':>7s} {'95% CI':>15s} {'AUC':>6s} "
          f"{'FPR%':>6s} {'FNR%':>6s} {'P%':>6s} {'R%':>6s} {'Acc%':>6s}")
    for r in rows:
        lo, hi = r["eer_ci"]
        ci = "[%.1f, %.1f]" % (100 * lo, 100 * hi)
        print(f"{r['name']:11s} {r['n']:5d} {100*r['eer']:7.2f} {ci:>15s} "
              f"{r['roc_auc']:6.3f} {100*r['fpr']:6.2f} {100*r['fnr']:6.2f} "
              f"{100*r['precision']:6.2f} {100*r['recall']:6.2f} {100*r['accuracy']:6.2f}")


def run(args) -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    manifest_dir = Path(args.manifests)

    # Both models are scored by this same function on the same split, so the comparison
    # cannot be confounded by a difference in evaluation code.
    if args.ckpt:
        blob = torch.load(args.ckpt, map_location=device, weights_only=True)
        cfg = blob["config"]
        # build_model must be given the target device: SincConv captures `self.device`
        # at construction and moves its filter bank there inside forward().
        model = build_model(cfg, device=device).to(device)
        model.load_state_dict(blob["state_dict"])
        # A checkpoint fine-tuned under our manifests scores spoof at index 1; the
        # frozen official one at index 0. Read it from the checkpoint, never assume.
        spoof_index = blob.get("spoof_index", 1)
        header, source = "PHASE E -- INDIC FINE-TUNED RawNet2", str(args.ckpt)
        detail = (f"epoch {blob.get('epoch')}, seed {blob.get('seed')}, "
                  f"dev EER at selection {100*blob.get('dev_eer', float('nan')):.2f}%")
    else:
        cfg = load_config()
        model, report = load_pretrained(build_model(cfg, device=device), device=device)
        model.to(device)
        spoof_index = PRETRAINED_SPOOF_INDEX
        header, source = ("PHASE A -- FROZEN PRETRAINED RawNet2 (no fine-tuning)",
                          "weights/pre_trained_DF_RawNet2.pth")
        detail = (f"{report['matched_tensors']}/{report['total_tensors']} tensors, "
                  f"{report['coverage_pct']:.1f}% of params, sha256 {report['sha256'][:16]}...")

    print("=" * 78)
    print(header)
    print("=" * 78)
    print(f"checkpoint : {source}")
    print(f"             {detail}")
    print(f"config     : {cfg.get('sample_rate')} Hz, nb_samp {cfg['nb_samp']} "
          f"({cfg['nb_samp']/cfg.get('sample_rate',16000):.2f}s), device {device}")
    print(f"class order: reading P(spoof) from index {spoof_index}")

    languages = language_of(manifest_dir)
    results = {"source": source, "spoof_index": spoof_index, "variants": {}}

    variants = [args.normalise] + ([not args.normalise] if args.ablation else [])
    for normalise in variants:
        tag = "normalised" if normalise else "un-normalised"
        probs, labels, paths, elapsed = score(model, manifest_dir, args.split, cfg,
                                              normalise, args.batch_size, args.num_workers, device)
        spoof = probs[:, spoof_index]
        mirror = probs[:, 1 - spoof_index]

        print(f"\n{'='*78}\nVARIANT: {tag}   ({len(labels)} clips, "
              f"{1000*elapsed/len(labels):.1f} ms/clip on {device})\n{'='*78}")
        print(f"class-order check -- ROC-AUC index {spoof_index} (used): "
              f"{roc_auc(spoof, labels):.3f}   mirrored index: {roc_auc(mirror, labels):.3f}")

        pooled = block("POOLED", spoof, labels)
        per_language = []
        for lang in LANGUAGES:
            mask = np.array([languages.get(p) == lang for p in paths])
            if mask.sum() and len(set(labels[mask].tolist())) == 2:
                per_language.append(block(lang, spoof[mask], labels[mask],
                                          threshold=pooled["eer_threshold"]))
        show(per_language + [pooled], f"per-language and pooled ({tag})")

        macro = {k: float(np.mean([r[k] for r in per_language]))
                 for k in ("eer", "roc_auc", "fpr", "fnr", "precision", "recall", "accuracy")}
        print(f"{'MACRO':11s} {'':5s} {100*macro['eer']:7.2f} {'':>15s} {macro['roc_auc']:6.3f} "
              f"{100*macro['fpr']:6.2f} {100*macro['fnr']:6.2f} {100*macro['precision']:6.2f} "
              f"{100*macro['recall']:6.2f} {100*macro['accuracy']:6.2f}")

        print(f"\nconfusion matrix at the pooled EER threshold ({pooled['eer_threshold']:.6f}):")
        print(f"                 pred bonafide   pred spoof")
        print(f"  true bonafide  {pooled['tn']:13d} {pooled['fp']:12d}")
        print(f"  true spoof     {pooled['fn']:13d} {pooled['tp']:12d}")

        print("\nscore distribution -- P(spoof):")
        for cls, name in ((0, "bonafide"), (1, "spoof")):
            s = spoof[labels == cls]
            print(f"  {name:9s} n={len(s):5d}  mean {s.mean():.4f}  median {np.median(s):.4f}  "
                  f"p10 {np.percentile(s,10):.4f}  p90 {np.percentile(s,90):.4f}")
        overlap = abs(spoof[labels == 1].mean() - spoof[labels == 0].mean())
        print(f"  class-mean separation: {overlap:.4f}")

        results["variants"][tag] = {"pooled": pooled, "per_language": per_language,
                                    "macro": macro, "ms_per_clip": 1000*elapsed/len(labels)}

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        json.dump(results, open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifests", default="data/indic")
    parser.add_argument("--ckpt", default=None,
                        help="fine-tuned checkpoint; omit to score the frozen official one")
    parser.add_argument("--split", default="test", choices=["dev", "test"])
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--ablation", action="store_true",
                        help="also score without peak normalisation")
    parser.add_argument("--no-normalise", dest="normalise", action="store_false",
                        default=True,
                        help="score with peak normalisation OFF; use this to match a "
                             "model that was TRAINED without it, so the comparison is "
                             "like-for-like instead of a train/serve mismatch")
    parser.add_argument("--out", default="results/baseline.json")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
