"""Per-language evaluation of the Indic-adapted VoiceShield detector.

WHAT THIS REPORTS, AND WHY
--------------------------
EER (threshold-free) plus the operating-point rates that actually describe the
product: FPR is a genuine speaker flagged as synthetic -- the false accusation -- and
FNR is a deepfake passed as genuine. Both are broken out per language, because the
16 languages come from heterogeneous source corpora and a single pooled number would
hide a language that does not work at all.

Every EER carries a bootstrap 95% CI. Per-language slices run to a few hundred clips,
where a point estimate alone is easy to over-read.

THE THRESHOLD COMES FROM DEV, NEVER TEST
----------------------------------------
Picking the threshold on the split you then report is how a system looks better than
it is. The threshold is fitted on dev and applied unchanged to test.

A single universal threshold is the default. Per-language thresholds are reported for
comparison but should only be adopted if the dev optima genuinely differ by more than
their confidence intervals -- otherwise it is fitting noise, sixteen times over.

THE LOUDNESS COMPARISON
-----------------------
`--compare-unnormalized` scores the same checkpoint with peak normalisation disabled.
The corpus has a measured ~4.5 dB level gap between real and TTS, so the un-normalised
number is inflated by a cue that has nothing to do with synthesis. Reporting the pair
makes the size of that effect visible instead of letting it sit inside a headline EER.
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

from main import Dataset_Indic, score_split  # noqa: E402
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold  # noqa: E402
from model import RawNet  # noqa: E402


def load_languages(manifest_dir: Path) -> dict:
    """path -> language, from the JSONL sidecar written by data/build_indic.py."""
    sidecar = manifest_dir / "manifest.jsonl"
    if not sidecar.exists():
        return {}
    languages = {}
    with open(sidecar) as fh:
        for line in fh:
            row = json.loads(line)
            languages[row["path"]] = row["language"]
    return languages


def load_model(ckpt_path: Path, device: str):
    import copy
    blob = torch.load(ckpt_path, map_location=device, weights_only=True)
    cfg = blob["config"]
    model = RawNet(copy.deepcopy(cfg), device).to(device)
    model.load_state_dict(blob["state_dict"])
    model.eval()
    return model, blob


def evaluate(args) -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    manifest_dir = Path(args.manifests)
    model, blob = load_model(Path(args.ckpt), device)
    cfg = blob["config"]

    print(f"checkpoint : {args.ckpt}")
    print(f"  epoch {blob.get('epoch')}  seed {blob.get('seed')}  init {blob.get('init')}")
    print(f"  dev EER at selection: {100 * blob.get('dev_eer', float('nan')):.2f}%")
    print(f"  sample_rate {cfg.get('sample_rate')}  nb_samp {cfg['nb_samp']}")

    common = dict(nb_samp=cfg["nb_samp"], sample_rate=cfg.get("sample_rate", 16_000),
                  normalise=args.normalise)

    def scores_for(split):
        dataset = Dataset_Indic(manifest_dir / f"{split}.txt", **common)
        loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False,
                            num_workers=args.num_workers, pin_memory=True)
        scores, labels = score_split(loader, model, device)
        return dataset, scores, labels

    # Threshold from dev, applied unchanged to test.
    _dev_set, dev_scores, dev_labels = scores_for("dev")
    dev_eer, threshold = compute_eer(dev_scores, dev_labels)
    print(f"\ndev EER {100 * dev_eer:.2f}%  ->  threshold {threshold:.6f} (applied to test)")

    test_set, test_scores, test_labels = scores_for(args.split)
    languages = load_languages(manifest_dir)
    langs = [languages.get(path, "unknown") for path, _ in test_set.items]

    overall_eer, _ = compute_eer(test_scores, test_labels)
    low, high = bootstrap_eer_ci(test_scores, test_labels, args.bootstrap, seed=args.seed)
    rates = rates_at_threshold(test_scores, test_labels, threshold)

    print(f"\n=== {args.split.upper()} (normalise={args.normalise}) ===")
    print(f"n={len(test_labels)}  bonafide={int((test_labels == 0).sum())}  "
          f"spoof={int((test_labels == 1).sum())}")
    print(f"EER      {100 * overall_eer:6.2f}%  95% CI [{100 * low:.2f}, {100 * high:.2f}]")
    print(f"accuracy {100 * rates['accuracy']:6.2f}%   precision {100 * rates['precision']:6.2f}%"
          f"   recall {100 * rates['recall']:6.2f}%   F1 {100 * rates['f1']:6.2f}%")
    print(f"FPR      {100 * rates['fpr']:6.2f}%  (genuine flagged as synthetic)")
    print(f"FNR      {100 * rates['fnr']:6.2f}%  (deepfake passed as genuine)")

    by_language = collections.defaultdict(lambda: ([], []))
    for score, label, lang in zip(test_scores, test_labels, langs):
        by_language[lang][0].append(score)
        by_language[lang][1].append(label)

    print(f"\n{'language':14s} {'n':>5s} {'EER%':>7s} {'95% CI':>16s} {'FPR%':>7s} {'FNR%':>7s}")
    per_language = {}
    for lang in sorted(by_language):
        scores = np.array(by_language[lang][0])
        labels = np.array(by_language[lang][1])
        if len(set(labels.tolist())) < 2:
            print(f"{lang:14s} {len(labels):5d} {'-':>7s} {'(one class only)':>16s}")
            continue
        eer, _ = compute_eer(scores, labels)
        lo, hi = bootstrap_eer_ci(scores, labels, args.bootstrap, seed=args.seed)
        rate = rates_at_threshold(scores, labels, threshold)
        print(f"{lang:14s} {len(labels):5d} {100 * eer:7.2f} "
              f"{f'[{100 * lo:.1f}, {100 * hi:.1f}]':>16s} "
              f"{100 * rate['fpr']:7.2f} {100 * rate['fnr']:7.2f}")
        per_language[lang] = {"n": len(labels), "eer": eer, "eer_ci": [lo, hi], **rate}

    results = {
        "checkpoint": str(args.ckpt), "split": args.split, "normalise": args.normalise,
        "threshold_from_dev": threshold, "dev_eer": dev_eer,
        "overall": {"n": len(test_labels), "eer": overall_eer, "eer_ci": [low, high], **rates},
        "per_language": per_language,
    }

    if args.compare_unnormalized and args.normalise:
        print("\n--- same checkpoint, peak normalisation OFF ---")
        common["normalise"] = False
        raw_set = Dataset_Indic(manifest_dir / f"{args.split}.txt", **common)
        raw_loader = DataLoader(raw_set, batch_size=args.batch_size, shuffle=False,
                                num_workers=args.num_workers)
        raw_scores, raw_labels = score_split(raw_loader, model, device)
        raw_eer, _ = compute_eer(raw_scores, raw_labels)
        print(f"EER normalised   {100 * overall_eer:6.2f}%")
        print(f"EER un-normalised{100 * raw_eer:6.2f}%")
        print("A large gap means the un-normalised score is leaning on the corpus's\n"
              "~4.5 dB level difference rather than on synthesis artefacts.")
        results["unnormalised_eer"] = raw_eer

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w") as fh:
            json.dump(results, fh, indent=2)
        print(f"\nwrote {args.out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ckpt", default="checkpoints_indic/best_model.pth")
    parser.add_argument("--manifests", default="data/indic")
    parser.add_argument("--split", default="test", choices=["dev", "test"])
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--bootstrap", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", default=None, help="write results JSON here")
    parser.add_argument("--no-normalise", dest="normalise", action="store_false", default=True)
    parser.add_argument("--compare-unnormalized", action="store_true")
    return evaluate(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
