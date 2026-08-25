"""Build an INDEPENDENT external validation set for the frozen VoiceGuard-Indic model.

WHY A CROSS-CORPUS SET, AND THE CONFOUND IT CARRIES
---------------------------------------------------
The training corpus (SherryT997) exposes neither speaker nor generator metadata, so it
cannot answer whether the model generalises past its own rendering pipeline. This set is
assembled from two sources that are independent of it and of each other:

    bonafide : google/fleurs        CC-BY-4.0   read speech, native speakers
    spoof    : vdivyasharma/IndicSynth  CC-BY-NC-4.0  xtts_v2 / vits / freevc24,
                                                     with generator, speaker and gender

IndicSynth's own bonafide references point at IndicSUPERB, which is gated, so the real
and synthetic halves necessarily come from different corpora.

**That is a real confound and it is not hidden here.** When the two classes come from
different recordings, a detector can separate them on channel, codec or loudness rather
than on synthesis. `--report-shortcut` measures exactly that on this set: if trivial
features already separate the classes, the headline number is an upper bound and must be
read as one. This is a *zero-shot* check on a frozen model, not a benchmark result.

LICENCE POSITION
----------------
IndicSynth is CC BY-NC 4.0 -- non-commercial academic research only. It is used here for
**evaluation only**. Nothing is trained on it, and no threshold or calibration constant is
fitted from it, so no NC-derived quantity enters the deployable path.

EFFICIENT SUBSETS
-----------------
IndicSynth is 24-148 GB per language, but its shards are ~500 MB and it is laid out in
generator-contiguous blocks: in Malayalam, freevc24 occupies roughly the first half and
xtts_v2 the second. Taking one shard from each region gives both generators for ~1 GB per
language instead of tens of GB. Whatever generators actually land are counted and
reported -- the block boundaries are not assumed to be stable.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import sys
import unicodedata
from pathlib import Path

import io

import numpy as np
import soundfile as sf

TARGET_SR = 16_000
LABEL_BONAFIDE, LABEL_SPOOF = 0, 1

FLEURS_ID = "google/fleurs"
FLEURS_LICENSE = "CC-BY-4.0"
FLEURS_CONFIGS = {"Hindi": "hi_in", "Tamil": "ta_in", "Telugu": "te_in",
                  "Malayalam": "ml_in", "English": "en_us"}

INDICSYNTH_ID = "vdivyasharma/IndicSynth"
INDICSYNTH_LICENSE = "CC-BY-NC-4.0 (evaluation only)"
# shard counts per language config, from the HF parquet listing
# approximate row counts per language config, used to place sampling offsets
INDICSYNTH_ROWS = {"Hindi": 206_000, "Tamil": 282_000, "Telugu": 170_000,
                   "Malayalam": 34_100}
# IndicSynth has no English config; the external set is therefore spoof-less for English.
INDICSYNTH_LANGUAGES = list(INDICSYNTH_ROWS)



def with_retry(fn, what, attempts=5, base_delay=4.0):
    """Retry a network call with exponential backoff.

    This link intermittently returns `SSL: CERTIFICATE_VERIFY_FAILED (self-signed
    certificate in certificate chain)` and CDN reconstruction errors -- symptoms of TLS
    interception somewhere on the path, not of anything wrong with the request. A first
    attempt failing says nothing, so a single failure must not be allowed to silently
    drop an entire language from the evaluation set.
    """
    import time
    last = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last = exc
            if attempt == attempts:
                break
            delay = base_delay * (2 ** (attempt - 1))
            print(f"           {what}: {type(exc).__name__} "
                  f"(attempt {attempt}/{attempts}), retrying in {delay:.0f}s", flush=True)
            time.sleep(delay)
    raise last


def normalise_text(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text or "").casefold().split())


def roc_auc(scores, labels) -> float:
    scores = np.asarray(scores, float); labels = np.asarray(labels, int)
    if len(set(labels.tolist())) < 2:
        return float("nan")
    order = np.argsort(scores); ranks = np.empty(len(scores)); ranks[order] = np.arange(1, len(scores) + 1)
    n1 = int((labels == 1).sum()); n0 = int((labels == 0).sum())
    return float((ranks[labels == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def write_clip(y, sr, out_dir, name, meta, rows, min_dur):
    if sr != TARGET_SR:
        raise ValueError(f"expected {TARGET_SR} Hz after cast, got {sr}")
    if y.ndim > 1:
        y = y.mean(axis=1)
    duration = len(y) / sr
    if duration < min_dur:
        return False
    path = out_dir / "audio" / name
    sf.write(path, y.astype(np.float32), TARGET_SR, subtype="PCM_16")
    rows.append({
        "path": f"audio/{name}",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "duration_s": round(duration, 3),
        "pre_norm_peak": round(float(np.abs(y).max()), 5),
        "pre_norm_rms_db": round(float(20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12)), 2),
        **meta,
    })
    return True


def build(args) -> int:
    from datasets import Audio, load_dataset
    from huggingface_hub import hf_hub_download

    out_dir = Path(args.out)
    (out_dir / "audio").mkdir(parents=True, exist_ok=True)
    rows, failures = [], []
    # Resume support: a partial run leaves usable audio behind, and refetching it on
    # this link is expensive.
    existing = {p.name for p in (out_dir / 'audio').glob('*.wav')}
    if existing:
        print(f'resuming: {len(existing)} clips already on disk', flush=True)

    # ---- bonafide: FLEURS validation split --------------------------------
    # Three routes were measured on this link. Streaming hangs (FLEURS parquet
    # row-groups are ~490 MB, so "the first row" is most of the file), and the
    # datasets-server row API returns HTTP 500 on FLEURS for the same reason -- it
    # exceeds the server's 300 MB scan limit. A plain split download is what works.
    # The validation split is used rather than test purely because it is smaller
    # (162-387 MB vs 489 MB) and still holds 239-418 clips, more than we sample.
    for language, config in FLEURS_CONFIGS.items():
        if args.languages and language not in args.languages:
            continue
        print(f"[bonafide] FLEURS {config} ({language}) -- downloading split", flush=True)
        try:
            ds = with_retry(
                lambda: load_dataset(FLEURS_ID, config, split=args.fleurs_split,
                                     cache_dir=args.cache_dir),
                f"FLEURS {config}")
            ds = ds.cast_column("audio", Audio(sampling_rate=TARGET_SR))
            kept = 0
            for i, row in enumerate(ds):
                if kept >= args.per_class:
                    break
                try:
                    meta = {"language": language, "label": LABEL_BONAFIDE,
                            "source": FLEURS_ID, "source_license": FLEURS_LICENSE,
                            "generator": "bonafide",
                            "speaker_id": str(row.get("speaker_id", "unknown")),
                            "gender": {0: "Male", 1: "Female"}.get(row.get("gender"), "unknown"),
                            "text_key": normalise_text(row.get("transcription", ""))}
                    if write_clip(np.asarray(row["audio"]["array"], np.float32),
                                  int(row["audio"]["sampling_rate"]), out_dir,
                                  f"fleurs_{config}_{i}.wav", meta, rows, args.min_dur):
                        kept += 1
                except Exception as exc:
                    failures.append({"source": "fleurs", "language": language,
                                     "i": i, "error": repr(exc)})
            print(f"           kept {kept}", flush=True)
        except Exception as exc:
            print(f"           unavailable: {type(exc).__name__}: {str(exc)[:140]}", flush=True)

    # ---- spoof: IndicSynth via the datasets-server row API -----------------
    # IndicSynth is 24-148 GB per language, but its row API serves individual clips
    # (~570 KB each) with the full metadata attached, so we pay only for the clips we
    # keep -- ~114 MB per language instead of tens of GB.
    #
    # The corpus is laid out in generator-contiguous blocks, so we sample at two
    # fractional positions to reach both. Whatever generators actually arrive are
    # counted and reported; the block boundaries are not assumed to hold.
    import urllib.request

    for language in INDICSYNTH_LANGUAGES:
        if args.languages and language not in args.languages:
            continue
        total = INDICSYNTH_ROWS[language]
        half = max(1, args.per_class // 2)
        for region, frac in (("head", 0.10), ("tail", 0.80)):
            base_offset = int(total * frac)
            print(f"[spoof] IndicSynth {language} ({region} @ row {base_offset})", flush=True)
            kept, offset = 0, base_offset
            while kept < half and offset < total:
                page = min(100, half - kept)
                url = (f"https://datasets-server.huggingface.co/rows"
                       f"?dataset=vdivyasharma%2FIndicSynth&config={language}"
                       f"&split=train&offset={offset}&length={page}")
                def fetch_page():
                    with urllib.request.urlopen(url, timeout=120) as fh:
                        return json.load(fh)
                try:
                    payload = with_retry(fetch_page, f"page {offset}")
                    fetched = payload.get("rows", [])
                except Exception as exc:
                    print(f"           page at {offset} gave up: {type(exc).__name__}", flush=True)
                    break
                if not fetched:
                    break
                for item in fetched:
                    row = item["row"]
                    try:
                        audio_url = row["audio"][0]["src"]

                        def fetch_clip():
                            with urllib.request.urlopen(audio_url, timeout=120) as fh:
                                return fh.read()
                        raw = with_retry(fetch_clip, "clip", attempts=3, base_delay=2.0)
                        y, sr = sf.read(io.BytesIO(raw), dtype="float32")
                        if sr != TARGET_SR:
                            import librosa
                            y = librosa.resample(y if y.ndim == 1 else y.mean(axis=1),
                                                 orig_sr=sr, target_sr=TARGET_SR)
                            sr = TARGET_SR
                        meta = {"language": language, "label": LABEL_SPOOF,
                                "source": INDICSYNTH_ID,
                                "source_license": INDICSYNTH_LICENSE,
                                "generator": str(row.get("Generative Model", "unknown")),
                                "speaker_id": str(row.get("Target Speaker ID", "unknown")),
                                "gender": str(row.get("Gender", "unknown")),
                                "text_key": normalise_text(str(row.get("TTS Transcript", "")))}
                        if write_clip(y, sr, out_dir,
                                      f"indicsynth_{language}_{region}_{offset}_{kept}.wav",
                                      meta, rows, args.min_dur):
                            kept += 1
                    except Exception as exc:
                        failures.append({"source": "indicsynth", "language": language,
                                         "region": region, "error": repr(exc)})
                offset += len(fetched)
            print(f"           kept {kept}", flush=True)
        got = collections.Counter(r["generator"] for r in rows
                                  if r["language"] == language and r["label"] == LABEL_SPOOF)
        print(f"        {language} generators: {dict(got)}", flush=True)

    if failures:
        with open(out_dir / "errors.jsonl", "w") as fh:
            for f in failures:
                fh.write(json.dumps(f) + "\n")
        print(f"\n{len(failures)} clips failed -> {out_dir}/errors.jsonl")

    # single evaluation split -- nothing is trained or tuned on this set
    with open(out_dir / "test.txt", "w") as fh:
        for r in rows:
            r["split"] = "test"
            fh.write(f"{r['path']} {r['label']}\n")
    with open(out_dir / "manifest.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps({**r, "sample_rate": TARGET_SR,
                                 "stored_at_original_levels": True}, ensure_ascii=False) + "\n")

    print(f"\n{'LANGUAGE':11s} {'total':>6s} {'bonafide':>9s} {'spoof':>6s}  generators")
    by = collections.defaultdict(list)
    for r in rows:
        by[r["language"]].append(r)
    for language in sorted(by):
        rs = by[language]
        bona = sum(1 for r in rs if r["label"] == LABEL_BONAFIDE)
        gens = collections.Counter(r["generator"] for r in rs if r["label"] == LABEL_SPOOF)
        print(f"{language:11s} {len(rs):6d} {bona:9d} {len(rs)-bona:6d}  {dict(gens)}")

    if args.report_shortcut and rows:
        print("\nCROSS-CORPUS CONFOUND PROBE (single-feature AUC; 0.5 = no signal)")
        both = [r for r in rows if r["language"] in {l for l in by
                if any(x["label"] == 1 for x in by[l]) and any(x["label"] == 0 for x in by[l])}]
        y = [r["label"] for r in both]
        for feat, key in (("duration", "duration_s"), ("peak", "pre_norm_peak"),
                          ("RMS dB", "pre_norm_rms_db")):
            print(f"  {feat:10s} AUC = {roc_auc([r[key] for r in both], y):.3f}")
        print("  Values far from 0.5 mean the two corpora are separable without any")
        print("  synthesis modelling -- treat the headline EER as an upper bound.")

    print(f"\nwrote {out_dir}/  ({len(rows)} clips)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--out", default="data/external")
    p.add_argument("--languages", nargs="*", default=None)
    p.add_argument("--per-class", type=int, default=300, help="clips per class per language")
    p.add_argument("--fleurs-split", default="validation")
    p.add_argument("--min-dur", type=float, default=0.5)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--cache-dir", default=None)
    p.add_argument("--tail-skip", type=int, default=18_000,
                   help="rows to skip to reach IndicSynth's second "
                        "generator block")
    p.add_argument("--report-shortcut", action="store_true")
    args = p.parse_args()
    status = build(args)
    sys.stdout.flush(); sys.stderr.flush()
    os._exit(status)


if __name__ == "__main__":
    main()
