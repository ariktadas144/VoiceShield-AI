"""Fine-tune VoiceGuard's RawNet on Indic speech.

WHAT WAS WRONG WITH THE ORIGINAL, AND WHY NONE OF IT COULD HAVE TRAINED
-----------------------------------------------------------------------
Three independent defects, each fatal on its own:

1. `Dataset_LibriSeVoc.load_data()` took a `split` argument and ignored it, globbing
   the whole dataset directory every time. train, dev and test were the SAME list,
   so dev accuracy was measured on training data -- a number that could only ever
   look good.

2. It fed RawNet ~108-dim hand-crafted features while `eval.py` fed raw waveforms.
   RawNet is a raw-waveform model. Whatever `main.py` trained, `eval.py` could not
   have scored. Both now import `audio_utils`, so the two paths share one front end.

3. `criterion(outputs, batch_labels)` was called on the `(binary, multi)` tuple that
   `RawNet.forward` returns, which raises before the first backward pass.

The split files `train.txt` / `dev.txt` / `test.txt` shipped with correct disjoint
LibriSeVoc splits that no code ever read. This script reads manifests in that same
format -- `<path> <label>` -- so the convention finally has a reader.

TWO CHOICES WORTH THE INK
-------------------------
INITIALISATION. `--init pretrained` (the default) starts from the official ASVspoof
2021 RawNet2 checkpoint, which transfers 94.3% of parameters and is proven
numerically identical to the official model in `tests/test_equivalence.py`. Training
this architecture from scratch on ~31k clips would be strictly worse, and there is no
reason to when real anti-spoofing weights exist.

CHECKPOINT SELECTION BY DEV EER, NOT ACCURACY. The upstream Dhwani pipeline selects
on validation accuracy; accuracy at a fixed 0.5 threshold is close to meaningless for
a detector whose useful operating point sits far from 0.5. EER is threshold-free and
is what the anti-spoofing literature reports.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import random
import sys
from pathlib import Path

import numpy as np
import torch
import yaml
from torch import nn
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

# tqdm writes to stderr; when output is piped its redraws become thousands of lines of
# noise in a log. Show bars interactively, stay quiet otherwise.
_TTY = sys.stderr.isatty()

from audio_utils import prepare
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold
from model import RawNet

SPOOF_INDEX = 1  # logit column for "spoof"; matches label 1 = spoof


class Dataset_Indic(Dataset):
    """Reads a VoiceGuard-format manifest: one `<path> <label>` per line."""

    def __init__(self, manifest, root=None, nb_samp=64_600, sample_rate=16_000,
                 normalise=True, rawboost=0, trim=False):
        self.manifest = Path(manifest)
        self.root = Path(root) if root else self.manifest.parent
        self.nb_samp = nb_samp
        self.sample_rate = sample_rate
        self.normalise = normalise
        self.trim = trim
        # RawBoost is TRAINING-ONLY. Dev and test construct with rawboost=0, so the
        # numbers they produce describe the model, not the augmentation.
        self.rawboost = rawboost

        self.items = []
        with open(self.manifest) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                path, label = line.rsplit(" ", 1)
                self.items.append((path, int(label)))

        if not self.items:
            raise ValueError(f"{self.manifest} is empty")

    def __len__(self):
        return len(self.items)

    def __getitem__(self, index):
        path, label = self.items[index]
        full = self.root / path

        if not self.rawboost:
            # Raw waveform, the same call inference makes. Not hand-crafted features.
            x = prepare(full, self.nb_samp, self.sample_rate, self.normalise,
                        trim=self.trim)
            return torch.from_numpy(np.ascontiguousarray(x)).float(), label

        # Augmented path. Order matters and mirrors physical reality: a channel acts on
        # the signal, and only then does the receiver normalise gain. Normalising first
        # would let RawBoost's additive noise ride on top of an already-fixed level and
        # change the effective SNR it was parameterised for.
        import rawboost
        from audio_utils import load_audio, pad, peak_normalise

        y = load_audio(full, self.sample_rate, normalise=False)
        if self.trim:
            from audio_utils import trim_silence
            y = trim_silence(y, self.sample_rate)
        y = np.asarray(rawboost.process(y.astype(np.float64), self.sample_rate,
                                        self.rawboost), dtype=np.float32)
        if not np.isfinite(y).all():
            # A degenerate filter draw can produce non-finite output; fall back to the
            # clean clip rather than feeding NaNs into the optimiser.
            y = load_audio(full, self.sample_rate, normalise=False)
        if self.normalise:
            y = peak_normalise(y)
        x = pad(y, self.nb_samp)
        return torch.from_numpy(np.ascontiguousarray(x)).float(), label


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def score_split(loader, model, device):
    """Returns (scores, labels) where score = P(spoof)."""
    model.eval()
    scores, labels = [], []
    with torch.no_grad():
        for batch_x, batch_y in tqdm(loader, desc="scoring", leave=False, disable=not _TTY):
            batch_x = batch_x.to(device)
            binary, _multi = model(batch_x)          # unpack: forward returns a tuple
            probs = binary.exp()                     # forward applies log_softmax
            scores.extend(probs[:, SPOOF_INDEX].cpu().numpy().tolist())
            labels.extend(batch_y.numpy().tolist())
    return np.array(scores), np.array(labels)


def train_epoch(loader, model, optimizer, device, criterion):
    model.train()
    running_loss, num_correct, num_total = 0.0, 0, 0

    for batch_x, batch_y in tqdm(loader, total=len(loader), desc="train",
                                 leave=False, disable=not _TTY):
        batch_x, batch_y = batch_x.to(device), batch_y.to(device)

        optimizer.zero_grad()
        binary, _multi = model(batch_x)              # binary head only
        loss = criterion(binary, batch_y)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * batch_x.size(0)
        num_correct += (binary.argmax(1) == batch_y).sum().item()
        num_total += batch_y.size(0)

    return running_loss / num_total, 100.0 * num_correct / num_total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifests", default="data/indic",
                        help="directory holding train.txt / dev.txt / test.txt")
    parser.add_argument("--data_path", default=None, help="alias for --manifests")
    parser.add_argument("--model_save_path", default="./checkpoints_indic")
    parser.add_argument("--config", default="model_config_RawNet.yaml")
    parser.add_argument("--init", choices=["pretrained", "random", "checkpoint"],
                        default="pretrained")
    parser.add_argument("--init-ckpt", default=None,
                        help="with --init checkpoint: continue from a previous run's "
                             "best_model.pth instead of the official ASVspoof weights")
    parser.add_argument("--ckpt", default="weights/pre_trained_DF_RawNet2.pth")
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--num_epochs", type=int, default=10)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight_decay", type=float, default=1e-4)
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--sample_rate", type=int, default=None,
                        help="overrides the config; must be 16000 for pretrained init")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--rawboost", type=int, default=0,
                        help="RawBoost augmentation algorithm, training only. "
                             "0=off, 1=convolutive, 2=impulsive, 3=coloured additive, "
                             "4=1+2+3, 5=1+2, 6=1+3, 7=2+3, 8=1||2")
    parser.add_argument("--lr_patience", type=int, default=3,
                        help="epochs without dev-EER improvement before halving the LR")
    parser.add_argument("--early_stop_patience", type=int, default=10,
                        help="epochs without dev-EER improvement before stopping")
    parser.add_argument("--no-align-head", dest="align_head", action="store_false",
                        default=True, help="keep the pretrained head's inverted class "
                                           "order instead of swapping it to ours")
    parser.add_argument("--no-normalise", dest="normalise", action="store_false",
                        default=True, help="skip peak normalisation (reproduces the "
                                           "inflated loudness-shortcut baseline)")
    parser.add_argument("--trim", action="store_true",
                        help="symmetric leading/trailing silence trimming, applied to "
                             "BOTH classes in the shared front end")
    args = parser.parse_args()

    manifests = Path(args.data_path or args.manifests)
    set_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Deep copy: RawNet.__init__ rewrites d_args['filts'] in place, so a second
    # construction from the same dict builds block2 with the wrong channel count.
    with open(args.config) as fh:
        cfg = copy.deepcopy(yaml.safe_load(fh)["model"])
    if args.sample_rate:
        cfg["sample_rate"] = args.sample_rate
    sample_rate = cfg.get("sample_rate", 24_000)
    nb_samp = cfg["nb_samp"]

    print(f"device={device}  sample_rate={sample_rate}  nb_samp={nb_samp} "
          f"({nb_samp / sample_rate:.2f}s)  seed={args.seed}  normalise={args.normalise}")

    model = RawNet(copy.deepcopy(cfg), device).to(device)
    if args.init == "pretrained":
        from weights.load_pretrained import load_pretrained, swap_binary_head
        _, report = load_pretrained(model, ckpt_path=args.ckpt, device=device)
        print(f"init: official ASVspoof RawNet2 -- {report['matched_tensors']}"
              f"/{report['total_tensors']} tensors, {report['coverage_pct']:.1f}% of params")
        if args.align_head:
            # The official checkpoint's head is trained with index 1 == bonafide
            # (data_utils.py: `1 if label == 'bonafide' else 0`), the opposite of our
            # manifests. Swapping the two output rows once re-points a decision boundary
            # the head already has, instead of spending early epochs inverting it.
            swap_binary_head(model)
            print("init: binary head swapped to our convention (index 1 = spoof)")
    elif args.init == "checkpoint":
        # Continue from an earlier VoiceGuard-Indic model rather than the official
        # ASVspoof weights, so whatever that model already learned is retained instead
        # of being re-derived. The head is already in our convention, so no swap.
        blob = torch.load(args.init_ckpt, map_location=device, weights_only=True)
        model.load_state_dict(blob["state_dict"])
        print(f"init: continuing from {args.init_ckpt} "
              f"(epoch {blob.get('epoch')}, dev EER {100*blob.get('dev_eer', float('nan')):.2f}%)")
    else:
        print("init: random (baseline for the pretrained comparison)")

    common = dict(nb_samp=nb_samp, sample_rate=sample_rate, normalise=args.normalise,
                  trim=args.trim)
    train_set = Dataset_Indic(manifests / "train.txt", rawboost=args.rawboost, **common)
    dev_set = Dataset_Indic(manifests / "dev.txt", **common)   # never augmented
    print(f"train={len(train_set)}  dev={len(dev_set)}"
          f"  rawboost={args.rawboost or 'off'} (training only)")

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True,
                              num_workers=args.num_workers, pin_memory=True, drop_last=True)
    dev_loader = DataLoader(dev_set, batch_size=args.batch_size, shuffle=False,
                            num_workers=args.num_workers, pin_memory=True)

    # Only the binary head trains; the LibriSeVoc multi-class head is unused here and
    # its parameters are left out of the optimiser rather than drifting on no signal.
    trainable = [p for n, p in model.named_parameters() if "multi_gru" not in n]
    for name, param in model.named_parameters():
        if "multi_gru" in name:
            param.requires_grad = False

    # Adam + weight_decay, matching the official ASVspoof RawNet2 recipe (Adam, lr 1e-4,
    # wd 1e-4, batch 32). Staying on the recipe the checkpoint was trained under is the
    # conservative choice when fine-tuning it.
    optimizer = torch.optim.Adam(trainable, lr=args.lr, weight_decay=args.weight_decay)

    # Two deliberate departures from that recipe, both because our data differs:
    #
    # NO CLASS WEIGHTS. The official uses CrossEntropyLoss(weight=[0.1, 0.9]) because
    # ASVspoof 2019 LA train is ~10% bonafide / 90% spoof. This corpus is roughly
    # balanced, so those weights would simply bias the model toward calling everything
    # spoof -- inflating exactly the error we care most about, a genuine speaker
    # flagged as synthetic.
    #
    # NLLLoss, NOT CrossEntropyLoss. RawNet.forward already ends in log_softmax, so the
    # official pairing applies log_softmax twice. NLLLoss on log-probabilities is the
    # objective that pairing was meant to express.
    criterion = nn.NLLLoss()

    # Established fine-tuning schedule for this task: halve the LR after 3 epochs with
    # no dev-EER improvement, floor at 1e-7, stop after 10 without improvement. Max
    # epochs is a ceiling, not a target -- the official 100 is for training from
    # scratch on 25k clips, and we start from converged weights on 6.9k.
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=args.lr_patience, min_lr=1e-7)

    os.makedirs(args.model_save_path, exist_ok=True)
    best_eer, best_epoch, history = float("inf"), 0, []

    for epoch in range(args.num_epochs):
        loss, acc = train_epoch(train_loader, model, optimizer, device, criterion)
        scores, labels = score_split(dev_loader, model, device)

        # Integrity checks: a run that has collapsed or gone non-finite should stop
        # immediately rather than quietly producing a plausible-looking curve.
        if not np.isfinite(scores).all():
            print("ERROR: non-finite dev scores -- aborting", file=sys.stderr)
            return 1
        if not np.isfinite(loss):
            print("ERROR: non-finite training loss -- aborting", file=sys.stderr)
            return 1

        eer, threshold = compute_eer(scores, labels)
        low, high = bootstrap_eer_ci(scores, labels, n_boot=500, seed=args.seed)
        rates = rates_at_threshold(scores, labels, threshold)
        predicted_spoof = float((scores >= threshold).mean())
        lr_now = optimizer.param_groups[0]["lr"]

        print(f"epoch {epoch + 1}/{args.num_epochs}  lr={lr_now:.2e}  loss={loss:.4f}  "
              f"train_acc={acc:.2f}%  dev_EER={100 * eer:.2f}% "
              f"[{100 * low:.2f}, {100 * high:.2f}]  "
              f"FPR={100 * rates['fpr']:.1f}% FNR={100 * rates['fnr']:.1f}%  "
              f"pred_spoof={100 * predicted_spoof:.1f}%")

        if predicted_spoof < 0.02 or predicted_spoof > 0.98:
            print("  WARNING: predictions have collapsed to a single class")

        history.append({"epoch": epoch + 1, "lr": lr_now, "loss": loss, "train_acc": acc,
                        "dev_eer": eer, "dev_eer_ci": [low, high], "threshold": threshold,
                        "dev_fpr": rates["fpr"], "dev_fnr": rates["fnr"],
                        "pred_spoof_rate": predicted_spoof})

        # Selection on dev EER, never accuracy, and never on the test split.
        if eer < best_eer:
            best_eer, best_epoch = eer, epoch + 1
            torch.save(
                {"state_dict": model.state_dict(), "config": cfg, "dev_eer": eer,
                 "threshold": threshold, "epoch": epoch + 1, "seed": args.seed,
                 "normalise": args.normalise, "trim": args.trim, "init": args.init,
                 "align_head": args.align_head, "spoof_index": SPOOF_INDEX,
                 "rawboost": args.rawboost, "init_ckpt": args.init_ckpt},
                Path(args.model_save_path) / "best_model.pth",
            )
            print(f"  saved: dev EER {100 * best_eer:.2f}%, threshold {threshold:.4f}")

        scheduler.step(eer)
        if epoch + 1 - best_epoch >= args.early_stop_patience:
            print(f"early stop: {args.early_stop_patience} epochs without dev-EER "
                  f"improvement (best was epoch {best_epoch})")
            break

    with open(Path(args.model_save_path) / "history.json", "w") as fh:
        json.dump({"args": vars(args), "history": history, "best_dev_eer": best_eer}, fh, indent=2)

    print(f"\nbest dev EER: {100 * best_eer:.2f}% at epoch {best_epoch}"
          f"  -> {args.model_save_path}/best_model.pth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
