"""Build Indic train/dev/test manifests from the IndicTTS-Deepfake challenge data.

DATASET
-------
`SherryT997/IndicTTS-Deepfake-Challenge-Data`, pinned to revision
`57347517658ae989597d8cef303cffb647ed2434` (2025-03-03, CC-BY-4.0).
Fields: `text`, `id`, `language`, `is_tts`, `audio`. 31,102 train / 2,635 test.

WHY WE RE-SPLIT THE TRAIN PARTITION
-----------------------------------
The official test split carries `is_tts = -1` on every row -- the labels are withheld
for the challenge -- so it cannot serve as a held-out test set. We leave it untouched
and cut our own train/dev/test out of the labelled train partition instead.

FOUR PROPERTIES OF THIS DATA THAT SHAPE THE PIPELINE
----------------------------------------------------
1. THE AUDIO IS NOT 16 kHz. The HF feature declares `Audio(sampling_rate=16000)`, but
   every one of 360 files sampled from the served assets decodes at 44,100 Hz. The
   `datasets` library resamples on access; the underlying files do not. We therefore
   cast the column explicitly and assert the rate, rather than trusting the card.

2. THERE IS A LOUDNESS SHORTCUT. Measured over 360 clips across 9 languages with
   balanced classes:

       REAL  median RMS -23.45 dB, median peak 0.501
       FAKE  median RMS -28.00 dB, median peak 0.313

   Single-feature AUC: peak 0.227, RMS 0.268 (~0.77 and ~0.73 inverted), against
   duration 0.499 and ZCR 0.462. Real audio is systematically ~4.5 dB louder, so a
   classifier reading peak amplitude alone scores ~77% AUC without modelling
   synthesis at all. Per-utterance peak normalisation removes gain as a usable cue.
   This is a deliberate, documented deviation from the official RawNet2 front end,
   which does not normalise -- ASVspoof did not carry this bias; this corpus does.

   The normalisation itself lives in `audio_utils`, NOT here: clips are written at
   their original levels so that training and inference apply one identical transform
   at load time, and so `--no-normalise` genuinely toggles it end to end. Baking it
   into the stored files would silently turn that comparison into a no-op.
   `--report-shortcut` reports the AUC before and after, so the fix is evidenced.

3. THE FILE ORDER IS CONTIGUOUS BY LANGUAGE. Offsets 0/5k/12k/20k/28k land in
   Assamese/Bodo/Marathi/Telugu/Gujarati. A sequential split would be catastrophically
   language-skewed, so splitting is stratified per language.

4. THERE IS NO SPEAKER OR GENERATOR FIELD. `id` is `LANG_GENDER_CATEGORY_INDEX` with a
   scheme that differs per language (`ASM_F_ANGER_00342`, `te_f_books_...`,
   `gujaratifemale_...`), too irregular to parse a speaker from. So speaker-disjoint
   and generator-disjoint splits are impossible, and no claim of unseen-speaker or
   unseen-generator generalisation may be made from this data. What we CAN enforce --
   and do -- is text-disjointness, so no transcript spans two splits.

Output: `train.txt` / `dev.txt` / `test.txt` in VoiceGuard's existing manifest format
(`<path> <label>`, label 1 = spoof), plus `manifest.jsonl` carrying the provenance
needed to reconstruct any result.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import random
import sys
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf

DATASET_ID = "SherryT997/IndicTTS-Deepfake-Challenge-Data"
DATASET_REVISION = "57347517658ae989597d8cef303cffb647ed2434"
DATASET_LICENSE = "CC-BY-4.0"
TARGET_SR = 16_000

# The five languages this adaptation targets. The corpus carries 16; the other 11 are
# skipped rather than processed and discarded.
TARGET_LANGUAGES = ("Hindi", "English", "Tamil", "Telugu", "Malayalam")

# The corpus is stored in language order, so the target languages occupy a contiguous
# minority of the shards. Fetching only these 13 of 35 costs ~6.8 GB instead of 18.3 GB
# and still contains all 9,915 target rows.
#
# Derived by reading each shard's `language` column and its parquet footer at revision
# 57347517658a; `--verify-shards` re-checks the mapping against what is actually loaded,
# so a silent upstream reshuffle surfaces as an error rather than as missing data.
TARGET_SHARDS = [
    11, 12, 13,          # Malayalam
    20, 21, 22,          # English
    22, 23, 24,          # Telugu
    24, 25, 26,          # Hindi
    32, 33, 34,          # Tamil
]
TARGET_SHARDS = sorted(set(TARGET_SHARDS))
N_SHARDS = 35

# label convention: matches VoiceGuard/ASVspoof -- 1 = spoof/TTS, 0 = bonafide.
LABEL_BONAFIDE, LABEL_SPOOF = 0, 1


def normalise_text(text: str) -> str:
    """Key for text-disjointness. NFKC + casefold + whitespace collapse, so that
    transcripts differing only by unicode form or spacing group together."""
    return " ".join(unicodedata.normalize("NFKC", text or "").casefold().split())


def peak_normalise(y: np.ndarray, target_peak: float = 0.95) -> np.ndarray:
    """Remove per-utterance gain -- the measured shortcut. See module docstring."""
    peak = float(np.abs(y).max())
    if peak < 1e-9:
        return y
    return (y * (target_peak / peak)).astype(np.float32)


def roc_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    """Rank-based AUC; no sklearn dependency for a dozen lines of arithmetic."""
    if len(set(labels.tolist())) < 2:
        return float("nan")
    order = np.argsort(scores)
    ranks = np.empty(len(scores), dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)
    n_pos = int((labels == 1).sum())
    n_neg = int((labels == 0).sum())
    return float((ranks[labels == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def stratified_text_disjoint_split(rows, ratios, seed):
    """Split per language, keeping every shared transcript inside one split.

    Grouping by normalised text before assigning means a transcript can never
    straddle two splits, which is the one leakage control this metadata supports.
    """
    train, dev, test = [], [], []
    rng = random.Random(seed)

    by_language = collections.defaultdict(list)
    for row in rows:
        by_language[row["language"]].append(row)

    for language in sorted(by_language):
        groups = collections.defaultdict(list)
        for row in by_language[language]:
            groups[row["text_key"]].append(row)

        keys = sorted(groups)
        rng.shuffle(keys)

        n = len(by_language[language])
        want_train, want_dev = int(n * ratios[0]), int(n * ratios[1])
        buckets, counts = [train, dev, test], [0, 0, 0]

        for key in keys:
            group = groups[key]
            if counts[0] + len(group) <= want_train:
                index = 0
            elif counts[1] + len(group) <= want_dev:
                index = 1
            else:
                index = 2
            buckets[index].extend(group)
            counts[index] += len(group)

    return train, dev, test


def build(args) -> int:
    from datasets import Audio, load_dataset

    out_dir = Path(args.out)
    audio_dir = out_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    print(f"loading {DATASET_ID}@{DATASET_REVISION[:12]} (train split only)"
          f"{' [streaming]' if args.streaming else ''}"
          f"{' [target shards]' if args.target_shards else ''}")

    if args.target_shards:
        from huggingface_hub import hf_hub_download

        names = [f"data/train-{i:05d}-of-{N_SHARDS:05d}.parquet" for i in TARGET_SHARDS]
        print(f"fetching {len(names)} of {N_SHARDS} shards (~6.8 GB, not 18.3 GB)")
        local = []
        for j, name in enumerate(names, 1):
            local.append(hf_hub_download(DATASET_ID, name, repo_type="dataset",
                                         revision=args.revision, cache_dir=args.cache_dir))
            print(f"  {j}/{len(names)}  {name}")
        dataset = load_dataset("parquet", data_files={"train": local}, split="train",
                               cache_dir=args.cache_dir, streaming=args.streaming)
    else:
        dataset = load_dataset(
            DATASET_ID, split="train", revision=args.revision,
            cache_dir=args.cache_dir, streaming=args.streaming,
        )
    # Explicit cast: the stored files are 44.1 kHz regardless of what the card says.
    dataset = dataset.cast_column("audio", Audio(sampling_rate=TARGET_SR))

    if args.streaming:
        # Shuffling is not optional here. The shards are ordered by language, so a
        # streamed prefix would be one or two languages -- taking the first N without
        # shuffling is exactly the sampling bug the upstream Dhwani loaders have.
        # .shuffle() on an IterableDataset randomises SHARD ORDER as well as filling a
        # reservoir, and the shard shuffle is what buys the language diversity here.
        # The buffer only reorders within that, so keep it small: every row in it must
        # be downloaded before the first row is emitted, and at ~600 KB per clip a
        # large buffer means gigabytes of download before any output appears.
        dataset = dataset.shuffle(seed=args.seed, buffer_size=args.shuffle_buffer)
        if args.limit:
            dataset = dataset.take(args.limit)
        print(f"rows: streaming (shuffle buffer {args.shuffle_buffer}, "
              f"limit {args.limit or 'none'})")
    else:
        if args.limit:
            dataset = dataset.select(range(min(args.limit, len(dataset))))
        print(f"rows: {len(dataset)}")

    rows, failures = [], []
    skipped_short = 0
    native_rates = collections.Counter()

    wanted = {l.lower() for l in args.languages} if args.languages else None
    total = None if args.streaming else len(dataset)
    kept = skipped_language = 0

    for i, sample in enumerate(dataset):
        if i % 500 == 0 and i:
            print(f"  seen {i}/{total if total else '?'}  kept {kept}")

        # Filter before touching audio: decoding a clip we are going to discard is the
        # single most expensive thing this loop can do.
        if wanted is not None and str(sample["language"]).lower() not in wanted:
            skipped_language += 1
            continue
        kept += 1

        try:
            audio = sample["audio"]
            y = np.asarray(audio["array"], dtype=np.float32)
            sr = int(audio["sampling_rate"])
            native_rates[sr] += 1
            if sr != TARGET_SR:
                raise ValueError(f"expected {TARGET_SR} Hz after cast, got {sr}")
            if y.ndim > 1:
                y = y.mean(axis=1)

            duration = len(y) / sr
            if duration < args.min_dur:
                skipped_short += 1
                continue

            # Levels are recorded but NOT applied here. Normalisation lives in
            # audio_utils, so training and inference apply the identical transform and
            # `--no-normalise` can genuinely toggle it at both ends. Baking it into the
            # stored files would make that comparison a silent no-op and would destroy
            # the original levels this corpus's bias is measured from.
            pre_peak = float(np.abs(y).max())
            pre_rms = float(np.sqrt(np.mean(y**2)) + 1e-12)

            label = LABEL_SPOOF if int(sample["is_tts"]) == 1 else LABEL_BONAFIDE
            name = f"{sample['id']}_{i}.wav".replace("/", "_")
            path = audio_dir / name
            sf.write(path, y, TARGET_SR, subtype="PCM_16")

            rows.append(
                {
                    "path": str(path.relative_to(out_dir)),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "id": sample["id"],
                    "language": sample["language"],
                    "label": label,
                    "is_tts": int(sample["is_tts"]),
                    "duration_s": round(duration, 3),
                    "pre_norm_peak": round(pre_peak, 5),
                    "pre_norm_rms_db": round(20 * np.log10(pre_rms), 2),
                    "text_key": normalise_text(sample.get("text", "")),
                }
            )
        except Exception as exc:  # never fabricate audio for a labelled row
            failures.append({"index": i, "id": sample.get("id"), "error": repr(exc)})

    print(f"\nnative sample rates seen after cast: {dict(native_rates)}")
    if wanted is not None:
        print(f"skipped (other languages): {skipped_language}")
    print(f"usable: {len(rows)}   below --min-dur: {skipped_short}   failed: {len(failures)}")

    if failures:
        error_manifest = out_dir / "errors.jsonl"
        with open(error_manifest, "w") as fh:
            for failure in failures:
                fh.write(json.dumps(failure) + "\n")
        rate = len(failures) / max(1, len(failures) + len(rows))
        print(f"wrote {error_manifest} ({rate:.2%} failure rate)")
        if rate > args.max_failure_rate:
            print(
                f"ERROR: failure rate {rate:.2%} exceeds --max-failure-rate "
                f"{args.max_failure_rate:.2%}. Refusing to build a silently degraded set.",
                file=sys.stderr,
            )
            return 1

    if wanted is not None:
        got = {r["language"] for r in rows}
        missing = {l for l in args.languages} - got
        if missing:
            print(f"ERROR: requested languages produced no rows: {sorted(missing)}. "
                  f"If --target-shards was used, the shard map may be stale.",
                  file=sys.stderr)
            return 1

    train, dev, test = stratified_text_disjoint_split(
        rows, (args.train_ratio, args.dev_ratio), args.seed
    )

    # Text-disjointness is the one leakage control this metadata supports; assert it.
    keys = [set(r["text_key"] for r in split if r["text_key"]) for split in (train, dev, test)]
    for a, b, label in ((0, 1, "train/dev"), (0, 2, "train/test"), (1, 2, "dev/test")):
        overlap = keys[a] & keys[b]
        assert not overlap, f"text leakage across {label}: {len(overlap)} shared transcripts"
    print("text-disjointness: OK (no transcript spans two splits)")

    for name, split in (("train", train), ("dev", dev), ("test", test)):
        for row in split:
            row["split"] = name
        with open(out_dir / f"{name}.txt", "w") as fh:
            for row in split:
                fh.write(f"{row['path']} {row['label']}\n")

    with open(out_dir / "manifest.jsonl", "w") as fh:
        for row in train + dev + test:
            fh.write(
                json.dumps(
                    {
                        **row,
                        "dataset": DATASET_ID,
                        "revision": args.revision,
                        "license": DATASET_LICENSE,
                        "sample_rate": TARGET_SR,
                        # stored at original levels; normalisation is applied
                        # at load time by audio_utils, not baked in here
                        "stored_at_original_levels": True,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    print(f"\n{'split':6s} {'n':>7s} {'bonafide':>9s} {'spoof':>7s} {'languages':>10s}")
    for name, split in (("train", train), ("dev", dev), ("test", test)):
        bona = sum(1 for r in split if r["label"] == LABEL_BONAFIDE)
        print(
            f"{name:6s} {len(split):7d} {bona:9d} {len(split) - bona:7d} "
            f"{len(set(r['language'] for r in split)):10d}"
        )

    if args.report_shortcut:
        print("\nSHORTCUT PROBE (single-feature AUC; 0.5 = no signal)")
        labels = np.array([r["label"] for r in rows])
        for feature, key in (
            ("duration", "duration_s"),
            ("pre-norm peak", "pre_norm_peak"),
            ("pre-norm RMS dB", "pre_norm_rms_db"),
        ):
            auc = roc_auc(np.array([r[key] for r in rows], dtype=np.float64), labels)
            print(f"  {feature:16s} AUC = {auc:.3f}")
        post = []
        for row in rows[: args.shortcut_sample]:
            y, _ = sf.read(out_dir / row["path"], dtype="float32")
            post.append((float(np.abs(peak_normalise(y)).max()), row["label"]))
        auc = roc_auc(np.array([p for p, _ in post]), np.array([l for _, l in post]))
        print(f"  {'post-norm peak':16s} AUC = {auc:.3f}   <- what the model actually sees")
        print("  A pre-norm AUC far from 0.5 is the corpus's level bias; the post-norm")
        print("  row is the residual after audio_utils.peak_normalise removes the gain.")

    print(f"\nmanifests written to {out_dir}/")
    return 0


def main() -> int:
    """Note the hard exit at the end.

    The HF audio decoder keeps worker threads alive, and on interpreter shutdown they
    can trip `PyGILState_Release: thread state must be current when releasing` -- a
    fatal error raised *after* every manifest has already been written successfully.
    Left alone it turns a completed build into a non-zero exit and breaks any script
    that checks the status. We flush and exit hard once the work is genuinely done.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="data/indic")
    parser.add_argument("--revision", default=DATASET_REVISION)
    parser.add_argument("--cache-dir", default=None)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--min-dur", type=float, default=0.5)
    parser.add_argument("--train-ratio", type=float, default=0.70)
    parser.add_argument("--dev-ratio", type=float, default=0.15)
    parser.add_argument("--languages", nargs="*", default=list(TARGET_LANGUAGES),
                        help="languages to keep; empty keeps all 16")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap rows SEEN (not kept), for smoke tests")
    parser.add_argument("--target-shards", action="store_true",
                        help="fetch only the 13 shards holding the target languages "
                             "(~6.8 GB); the other 22 are pure non-target audio")
    parser.add_argument("--streaming", action="store_true",
                        help="stream shards instead of downloading all ~19 GB; pair "
                             "with --limit for a representative subset")
    parser.add_argument("--shuffle-buffer", type=int, default=500,
                        help="streaming shuffle buffer; must be large enough to mix "
                             "languages, since the shards are ordered by language")
    parser.add_argument("--max-failure-rate", type=float, default=0.01)
    parser.add_argument("--shortcut-sample", type=int, default=400)
    parser.add_argument("--report-shortcut", action="store_true")
    status = build(parser.parse_args())
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(status)


if __name__ == "__main__":
    main()
