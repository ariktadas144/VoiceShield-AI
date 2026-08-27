"""Select the reference/conditioning clips both generators will be given.

DESIGN: THE SAME REFERENCES GO TO BOTH GENERATORS.

Phase 12 asks that speaker identity must not predict generator identity. The strongest
way to guarantee that is not to balance speakers across generators but to use the
*identical* reference set for both: every (speaker, transcript, prompt clip) triple is
synthesised once by SPRING_F5 and once by Indic-Mio. Any acoustic difference that later
shows up between the two generators is then attributable to the generator alone, because
nothing else differs.

It also means the same OpenSLR speakers appear as bonafide (Real_B in v1) and as the
voices being cloned in the spoof half, which makes speaker identity useless as a cue for
the detector too.

SOURCES

    Tamil / Telugu / Malayalam : OpenSLR SLR65 / SLR66 / SLR63 (CC BY-SA 4.0),
                                 transcripts from the shipped line_index tsv
    Hindi                      : SherryT997 bonafide, TRAIN SPLIT ONLY

OpenSLR has no Hindi config, hence the second source. Hindi references are restricted to
the train split so that no internal-test audio is used to manufacture training spoofs.

FLEURS and IndicSynth are excluded entirely -- both are external test material.
"""

from __future__ import annotations

import argparse
import csv
import glob
import hashlib
import json
import os
import random
import sys
from pathlib import Path

import soundfile as sf

OPENSLR = {"Tamil": "ta_in", "Telugu": "te_in", "Malayalam": "ml_in"}
LANGUAGES = ["Hindi", "Tamil", "Telugu", "Malayalam"]


def clean_text(t: str) -> str:
    """Strip escape sequences the source corpora carry as literal characters.

    18 of the Telugu rows in the OpenSLR line_index files end with the two characters
    backslash and n, not a newline. Handed to a TTS that is text, and the model will try
    to pronounce it; it also inflates the CER of those clips in the quality audit for a
    reason that has nothing to do with the generator. Real control characters are folded
    to spaces for the same reason.
    """
    t = (t or "").replace("\\n", " ").replace("\\t", " ").replace("\\r", " ")
    t = t.replace("\n", " ").replace("\t", " ").replace("\r", " ")
    return " ".join(t.split()).strip()


def speaker_of(name: str) -> str:
    parts = Path(name).stem.split("_")
    return "_".join(parts[:2]) if len(parts) >= 2 else parts[0]


def openslr_pool(root: Path, prefix: str):
    """(wav, transcript, speaker, gender) for one language."""
    out = []
    for gender in ("female", "male"):
        d = root / f"{prefix}_{gender}"
        tsv = root / f"line_index_{prefix}_{gender}.tsv"
        if not d.exists() or not tsv.exists():
            continue
        text = {}
        with open(tsv, encoding="utf-8") as fh:
            for row in csv.reader(fh, delimiter="\t"):
                if len(row) >= 2:
                    text[row[0].strip()] = clean_text(row[1])
        for wav in sorted(d.glob("*.wav")):
            t = text.get(wav.stem)
            if t:
                out.append((wav, t, speaker_of(wav.name), gender.capitalize()))
    return out


def sherry_hindi_pool(manifest_dir: Path):
    rows = [json.loads(l) for l in open(manifest_dir / "manifest.jsonl")]
    out = []
    for r in rows:
        # train split only: never manufacture training spoofs from test audio
        if r["language"] != "Hindi" or r["label"] != 0 or r["split"] != "train":
            continue
        t = clean_text(r.get("text_key"))
        if t:
            out.append((manifest_dir / r["path"], t, r["id"], "unknown"))
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--openslr", default="data/openslr_raw")
    p.add_argument("--indic", default="data/indic")
    p.add_argument("--out", default="data/pilot_refs")
    p.add_argument("--per-language", type=int, default=100)
    p.add_argument("--min-dur", type=float, default=2.0)
    p.add_argument("--max-dur", type=float, default=12.0)
    p.add_argument("--min-chars", type=int, default=20)
    p.add_argument("--seed", type=int, default=1234)
    p.add_argument("--exclude", default="",
                   help="references.jsonl whose origin clips must NOT be reused")
    args = p.parse_args()

    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    rows = []

    # The pilot's 400 references are frozen audit material and their clips are already
    # generated. Excluding them here keeps the training reference set disjoint, so the
    # pilot audio can be folded into training as-is without any chance that a reference
    # ends up paired with two different target texts.
    used = set()
    if args.exclude and Path(args.exclude).exists():
        used = {r["origin_path"] for r in map(json.loads, open(args.exclude))}
        print(f"excluding {len(used)} references already used by the pilot")

    for language in LANGUAGES:
        if language == "Hindi":
            pool = sherry_hindi_pool(Path(args.indic))
            source, licence = "SherryT997", "CC-BY-4.0"
        else:
            pool = openslr_pool(Path(args.openslr), OPENSLR[language])
            source, licence = "OpenSLR", "CC-BY-SA-4.0"

        # group by speaker so the selection spreads across voices instead of
        # over-sampling whoever happens to have the most clips
        by_spk = {}
        for item in pool:
            by_spk.setdefault(item[2], []).append(item)
        speakers = sorted(by_spk)
        rng.shuffle(speakers)

        picked, i = [], 0
        while len(picked) < args.per_language and speakers:
            spk = speakers[i % len(speakers)]
            i += 1
            if i > len(speakers) * 60:
                break
            cand = by_spk[spk]
            if not cand:
                continue
            wav, text, s, gender = cand.pop(rng.randrange(len(cand)))
            if str(wav) in used:
                continue
            try:
                info = sf.info(wav)
            except Exception:
                continue
            if not (args.min_dur <= info.duration <= args.max_dur):
                continue
            if len(text) < args.min_chars:
                continue
            picked.append((wav, text, s, gender))

        for n, (wav, text, spk, gender) in enumerate(picked):
            dst = out / "audio" / f"ref_{language[:3].lower()}_{n:04d}.wav"
            y, sr = sf.read(wav, dtype="float32")
            if y.ndim > 1:
                y = y.mean(axis=1)
            sf.write(dst, y, sr, subtype="PCM_16")
            rows.append({
                "ref_id": dst.stem, "ref_path": f"audio/{dst.name}",
                "ref_sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
                "language": language, "speaker_id": spk, "gender": gender,
                "transcript": text, "duration_s": round(len(y) / sr, 3),
                "sample_rate": sr, "source_dataset": source, "source_license": licence,
                "origin_path": str(wav),
            })
        print(f"{language:11s} {len(picked):4d} refs from {len({r[2] for r in picked})} speakers "
              f"({source})")

    with open(out / "references.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\n{'language':11s} {'refs':>5s} {'speakers':>9s} {'median dur':>11s}  gender")
    import collections, statistics
    for language in LANGUAGES:
        rs = [r for r in rows if r["language"] == language]
        if not rs:
            continue
        g = collections.Counter(r["gender"] for r in rs)
        print(f"{language:11s} {len(rs):5d} {len({r['speaker_id'] for r in rs}):9d} "
              f"{statistics.median(r['duration_s'] for r in rs):10.2f}s  {dict(g)}")
    print(f"\nwrote {out}/references.jsonl  ({len(rows)} references)")
    print("Reference set built.")
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
