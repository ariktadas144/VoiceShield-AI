"""Extract a stratified IndicVoices bonafide sample -- candidate third real corpus.

WHY THIS CORPUS. SherryT997 and OpenSLR are both READ speech. IndicVoices is 83%
extempore/conversational, recorded largely in rural settings across a wide age range.
That is the axis on which the current real class has no mass, and the regression
diagnosis showed the limiting factor is bonafide domain coverage rather than spoof
diversity.

SAMPLING. Not the first N rows -- rows are clustered by speaker, so that would collapse
speaker diversity. Clips are drawn round-robin across speakers, then balanced as far as
the pool allows over gender, age group and rural/urban area, since those are the
recording-condition axes the corpus actually varies.

A COUPLING THAT MUST BE RECORDED. IndicVoices-R is derived from THIS corpus by
dereverberation (VoiceFixer) and enhancement (DeepFilterNet3), and SPRING_F5 was trained
on IndicVoices-R. So the generator has seen denoised versions of these speakers. Raw
IndicVoices is not denoised, which creates a specific risk: "reverberant = real" could
become a dataset-to-label shortcut. The audit exists to test exactly that, and this
corpus is not adopted unless it passes.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import soundfile as sf

LANGS = {"hindi": "Hindi", "tamil": "Tamil", "telugu": "Telugu", "malayalam": "Malayalam"}
TARGET_SR = 16_000


def decode(blob) -> tuple[np.ndarray, int]:
    if isinstance(blob, dict):
        b = blob.get("bytes")
        if b is None and blob.get("path"):
            y, sr = sf.read(blob["path"], dtype="float32", always_2d=True)
            return y.mean(axis=1), sr
        blob = b
    y, sr = sf.read(io.BytesIO(blob), dtype="float32", always_2d=True)
    return y.mean(axis=1), sr


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default="data/indicvoices_raw")
    ap.add_argument("--out", default="data/indicvoices")
    ap.add_argument("--per-language", type=int, default=400)
    ap.add_argument("--min-dur", type=float, default=1.0)
    ap.add_argument("--max-dur", type=float, default=20.0)
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()

    import pyarrow.parquet as pq

    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    rows_out = []

    for cfg, language in LANGS.items():
        shards = sorted((Path(args.root) / cfg).glob("valid-*.parquet"))
        if not shards:
            print(f"{language}: no shards"); continue
        # index metadata first, without decoding any audio
        meta = []
        for si, sh in enumerate(shards):
            t = pq.read_table(sh, columns=["speaker_id", "gender", "age_group", "area",
                                           "scenario", "task_name", "duration", "state",
                                           "district", "text"])
            d = t.to_pydict()
            for i in range(t.num_rows):
                dur = d["duration"][i]
                if dur is None or not (args.min_dur <= dur <= args.max_dur):
                    continue
                meta.append({"shard": si, "row": i,
                             **{k: d[k][i] for k in
                                ("speaker_id", "gender", "age_group", "area",
                                 "scenario", "task_name", "duration", "state",
                                 "district", "text")}})
        by_spk = defaultdict(list)
        for m in meta:
            by_spk[m["speaker_id"]].append(m)
        spks = sorted(by_spk)
        rng.shuffle(spks)
        for s in spks:
            rng.shuffle(by_spk[s])

        picked, i = [], 0
        while len(picked) < args.per_language and spks:
            s = spks[i % len(spks)]
            i += 1
            if i > len(spks) * 80:
                break
            if by_spk[s]:
                picked.append(by_spk[s].pop())
        print(f"{language:11s} pool={len(meta):6d} speakers={len(spks):4d} "
              f"picked={len(picked)}")

        want = defaultdict(list)
        for m in picked:
            want[m["shard"]].append(m)
        for si, sh in enumerate(shards):
            if si not in want:
                continue
            t = pq.read_table(sh, columns=["audio_filepath"])
            col = t.column("audio_filepath").to_pylist()
            for m in want[si]:
                try:
                    y, sr = decode(col[m["row"]])
                except Exception:
                    continue
                if sr != TARGET_SR and y.size:
                    import soxr
                    y = soxr.resample(y, sr, TARGET_SR).astype(np.float32)
                if y.size < TARGET_SR // 2 or not np.isfinite(y).all():
                    continue
                n = len(rows_out)
                dst = out / "audio" / f"iv_{cfg[:3]}_{n:05d}.wav"
                sf.write(dst, y, TARGET_SR, subtype="PCM_16")
                rows_out.append({
                    "path": str(dst.resolve()), "label": 0, "language": language,
                    "source": "IndicVoices", "source_license": "CC-BY-4.0",
                    "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
                    "speaker_id": m["speaker_id"], "gender": m["gender"],
                    "age_group": m["age_group"], "area": m["area"],
                    "scenario": m["scenario"], "task_name": m["task_name"],
                    "state": m["state"], "district": m["district"],
                    "duration_s": round(len(y) / TARGET_SR, 3),
                    "sample_rate": TARGET_SR, "text": m["text"],
                })

    with open(out / "manifest.jsonl", "w") as fh:
        for r in rows_out:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\n{'language':11s}{'n':>5s}{'speakers':>9s}  gender / area / scenario")
    for language in LANGS.values():
        g = [r for r in rows_out if r["language"] == language]
        if not g:
            continue
        print(f"{language:11s}{len(g):5d}{len({r['speaker_id'] for r in g}):9d}  "
              f"{dict(Counter(r['gender'] for r in g))} "
              f"{dict(Counter(r['area'] for r in g))} "
              f"{dict(Counter(r['scenario'] for r in g))}")
    print(f"\nwrote {out}/manifest.jsonl  ({len(rows_out)} clips)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
