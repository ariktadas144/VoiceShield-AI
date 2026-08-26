"""Build the Real_A + Real_B bonafide mix for the domain-diversity experiment.

THE EXPERIMENT
--------------
    baseline (v0)   Real_A + Fake_A
    experiment (v1) Real_A/2 + Real_B/2 + Fake_A

Real_A is SherryT997 bonafide, Real_B is OpenSLR (Google crowdsourced Indic, CC BY-SA
4.0), Fake_A is the unchanged SherryT997 spoof side.

WHY REPLACEMENT RATHER THAN ADDITION. Appending Real_B would leave ~7,000 bonafide
against 3,440 spoof, and fixing that needs class weights or resampling -- a second
change, which would make any result uninterpretable. Replacing half of Real_A keeps the
total count and the class balance exactly as v0 had them, so the *only* thing that
differs between the two runs is which recording domains the bonafide half is drawn from.

SPEAKER-DISJOINT SPLITS. OpenSLR filenames carry speaker IDs (`taf_00008_...`), so
train and dev never share a speaker -- something the FLEURS metadata could not support.

WHAT STAYS UNTOUCHED. The spoof side, the architecture, the optimizer, the loss, the
sample rate, the schedule, and the FLEURS x IndicSynth external test set, which is never
trained on and remains the honest held-out domain.

COVERAGE, AND A BUILT-IN CONTROL. OpenSLR SLR63/65/66 cover Malayalam, Tamil and Telugu
only. Hindi and English therefore receive no second bonafide domain and act as the
control group: if the treated languages improve externally and the controls do not, the
second domain caused it.

It also supplies male Tamil and male Malayalam, which the training corpus lacks
entirely (Tamil is 100 % female, Malayalam 93 % female).
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import random
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

TARGET_SR = 16_000
LABEL_BONAFIDE, LABEL_SPOOF = 0, 1
OPENSLR = {"ta": ("Tamil", "SLR65"), "te": ("Telugu", "SLR66"), "ml": ("Malayalam", "SLR63")}
OPENSLR_LICENSE = "CC-BY-SA-4.0"
OPENSLR_SOURCE = "openslr.org (Google crowdsourced Indic corpora)"

# Second SPOOF generator family. Only the mms_tts slice of
# satwc-reddy/indian-language-deepfake-speech is used (CC-BY-4.0, Meta MMS neural
# TTS, native 16 kHz). Its sibling "sigvc" slice is rejected: the filenames
# (`..._ps+4`, `..._ts0.85`) show it is pitch- and time-shifted REAL OpenSLR speech
# labelled as fake, and OpenSLR is our bonafide Real_B -- including it would place
# identical speakers under both labels. The "rvc" slice its README advertises does
# not exist on the Hub (0 files against 701 metadata rows).
MMS_LANGS = {"tamil": "Tamil", "telugu": "Telugu", "malayalam": "Malayalam"}
MMS_LICENSE = "CC-BY-4.0"



def speaker_of(name: str) -> str:
    """`taf_00008_00072928033.wav` -> `taf_00008`. Prefix varies by language/gender."""
    parts = Path(name).stem.split("_")
    return "_".join(parts[:2]) if len(parts) >= 2 else parts[0]


def build(args) -> int:
    import librosa

    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    src = [json.loads(l) for l in open(Path(args.internal) / "manifest.jsonl")]
    by_split = collections.defaultdict(list)
    for r in src:
        by_split[r["split"]].append(r)

    # --- Real_B: OpenSLR, speaker-disjoint between train and dev ---------
    raw = Path(args.openslr)
    pool = collections.defaultdict(list)          # (lang, split) -> files
    speaker_report = {}
    for code, (lang, slr) in OPENSLR.items():
        files = sorted(f for g in ("female", "male")
                       for f in (raw / f"{code}_in_{g}").glob("*.wav"))
        speakers = sorted({speaker_of(f.name) for f in files})
        rng.shuffle(speakers)
        n_dev = max(1, int(len(speakers) * args.dev_speaker_frac))
        dev_spk, train_spk = set(speakers[:n_dev]), set(speakers[n_dev:])
        for f in files:
            s = speaker_of(f.name)
            pool[(lang, "dev" if s in dev_spk else "train")].append(f)
        speaker_report[lang] = {"total": len(speakers), "train": len(train_spk),
                                "dev": len(dev_spk), "clips": len(files), "slr": slr}
        assert not (dev_spk & train_spk)

    print("OpenSLR speaker-disjoint split:")
    for lang, s in speaker_report.items():
        print(f"  {lang:10s} {s['slr']}  {s['clips']:5d} clips, {s['total']:3d} speakers "
              f"-> {s['train']} train / {s['dev']} dev")

    # MMS-TTS pool. There are no speaker IDs, so the train/dev boundary is drawn on a
    # deterministic hash of the filename -- clip-disjoint, which is the strongest
    # guarantee this metadata supports. No MMS clip enters the test split.
    mms_pool = collections.defaultdict(list)
    mms_root = Path(args.mms)
    if args.mms_frac and mms_root.exists():
        for code, language in MMS_LANGS.items():
            files = sorted((mms_root / "data" / "mms_tts" / code).glob("*.wav"))
            for f in files:
                h = int(hashlib.sha256(f.name.encode()).hexdigest()[:8], 16)
                mms_pool[(language, "dev" if h % 10 < 2 else "train")].append(f)
        print("MMS-TTS pool (clip-disjoint train/dev):")
        for language in sorted(MMS_LANGS.values()):
            tr = len(mms_pool[(language, "train")]); dv = len(mms_pool[(language, "dev")])
            print(f"  {language:11s} {tr + dv:5d} clips -> {tr} train / {dv} dev")

    rows, failures = [], []

    def emit(path, label, split, language, source, licence, speaker, gender):
        try:
            y, sr = librosa.load(str(path), sr=None, mono=True)
            if sr != TARGET_SR:
                y = librosa.resample(y, orig_sr=sr, target_sr=TARGET_SR)
            y = np.asarray(y, dtype=np.float32)
            if len(y) / TARGET_SR < args.min_dur:
                return False
            name = f"{source[:4]}_{language[:3]}_{Path(path).stem}.wav".replace("/", "_")
            dst = out / "audio" / name
            sf.write(dst, y, TARGET_SR, subtype="PCM_16")
            rows.append({"path": f"audio/{name}", "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
                         "label": label, "split": split, "language": language,
                         "source": source, "source_license": licence,
                         "speaker_id": speaker, "gender": gender,
                         "duration_s": round(len(y) / TARGET_SR, 3),
                         "sample_rate": TARGET_SR})
            return True
        except Exception as exc:
            failures.append({"path": str(path), "error": repr(exc)})
            return False

    # --- assemble each split ---------------------------------------------
    # Replacement is done PER LANGUAGE, and only for languages that actually have an
    # OpenSLR counterpart. A global replacement would strip bonafide from Hindi and
    # English without giving them anything back, and then a regression in the controls
    # could not be distinguished from simply having less data. Every language keeps the
    # bonafide count v0 trained on; only the composition changes for the treated three.
    treated = {lang for _c, (lang, _s) in OPENSLR.items()}
    lang_of_code = {lang: code for code, (lang, _s) in OPENSLR.items()}

    for split in ("train", "dev", "test"):
        internal = by_split[split]
        by_lang_spoof = collections.defaultdict(list)
        for r in internal:
            if r["label"] == LABEL_SPOOF:
                by_lang_spoof[r["language"]].append(r)

        for language, spoofs in by_lang_spoof.items():
            rng.shuffle(spoofs)
            total_s = len(spoofs)
            # Same replacement discipline as the bonafide side: swap a fraction rather
            # than append, so total count and class balance stay identical to v0/v1 and
            # the ONLY difference is which generators produced the spoof half. Test is
            # left pure so it stays comparable across v0/v1/v2.
            # mms_pool is keyed by (language, split), so membership must be tested on
            # the language set -- testing `language not in mms_pool` silently never
            # matches and disables the replacement entirely.
            has_mms = language in set(MMS_LANGS.values())
            frac_s = (0.0 if (split == "test" or not has_mms or not args.mms_frac)
                      else args.mms_frac)
            keep_s = total_s - int(total_s * frac_s)
            for r in spoofs[:keep_s]:
                emit(Path(args.internal) / r["path"], LABEL_SPOOF, split, language,
                     "SherryT997", "CC-BY-4.0", "unknown", "unknown")
            want_s = total_s - keep_s
            if not want_s:
                continue
            cand = list(mms_pool.get((language, split), []))
            rng.shuffle(cand)
            taken = 0
            for f in cand:
                if taken >= want_s:
                    break
                if emit(f, LABEL_SPOOF, split, language, "MMS-TTS",
                        MMS_LICENSE, "unknown", "unknown"):
                    taken += 1
            if taken < want_s:
                print(f"  warning: {language}/{split} wanted {want_s} MMS clips, got {taken}")

        by_lang = collections.defaultdict(list)
        for r in internal:
            if r["label"] == LABEL_BONAFIDE:
                by_lang[r["language"]].append(r)

        for language, bona in by_lang.items():
            rng.shuffle(bona)
            total = len(bona)
            # test stays pure Real_A so it remains directly comparable with v0's
            frac = 0.0 if (split == "test" or language not in treated) else args.replace_frac
            keep_a = total - int(total * frac)

            for r in bona[:keep_a]:
                emit(Path(args.internal) / r["path"], LABEL_BONAFIDE, split, language,
                     "SherryT997", "CC-BY-4.0", "unknown", "unknown")

            want_b = total - keep_a
            if not want_b:
                continue
            cand = list(pool[(language, split)])
            rng.shuffle(cand)
            taken = 0
            for f in cand:
                if taken >= want_b:
                    break
                g = "Female" if "_female" in str(f.parent) else "Male"
                if emit(f, LABEL_BONAFIDE, split, language, "OpenSLR",
                        OPENSLR_LICENSE, speaker_of(f.name), g):
                    taken += 1
            if taken < want_b:
                print(f"  warning: {language}/{split} wanted {want_b} OpenSLR clips, "
                      f"got {taken}")

    if failures:
        with open(out / "errors.jsonl", "w") as fh:
            for f in failures:
                fh.write(json.dumps(f) + "\n")
        print(f"\n{len(failures)} clips failed -> {out}/errors.jsonl")

    for split in ("train", "dev", "test"):
        with open(out / f"{split}.txt", "w") as fh:
            for r in rows:
                if r["split"] == split:
                    fh.write(f"{r['path']} {r['label']}\n")
    with open(out / "manifest.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    # speaker-disjointness assertion across the new corpus
    spk = collections.defaultdict(set)
    for r in rows:
        if r["source"] == "OpenSLR":
            spk[r["speaker_id"]].add(r["split"])
    bad = {k: v for k, v in spk.items() if len(v) > 1}
    assert not bad, f"OpenSLR speaker spans splits: {list(bad)[:3]}"
    print("\nspeaker-disjointness (OpenSLR): OK")

    print(f"\n{'split':6s} {'total':>6s} {'bona':>6s} {'spoof':>6s} {'SherryBona':>11s} {'OpenSLR':>8s}")
    for split in ("train", "dev", "test"):
        rs = [r for r in rows if r["split"] == split]
        b = [r for r in rs if r["label"] == LABEL_BONAFIDE]
        print(f"{split:6s} {len(rs):6d} {len(b):6d} {len(rs)-len(b):6d} "
              f"{sum(1 for r in b if r['source']=='SherryT997'):11d} "
              f"{sum(1 for r in b if r['source']=='OpenSLR'):8d}")

    baseline = collections.Counter(
        r["language"] for r in src if r["label"] == LABEL_BONAFIDE)
    print(f"\n{'language':11s} {'bona':>6s} {'v0 bona':>8s} {'spoof':>6s}  bonafide sources")
    for lang in sorted({r["language"] for r in rows}):
        rs = [r for r in rows if r["language"] == lang]
        b = [r for r in rs if r["label"] == LABEL_BONAFIDE]
        srcs = collections.Counter(r["source"] for r in b)
        tag = "  <-- CONTROL (no Real_B)" if "OpenSLR" not in srcs else ""
        same = "" if len(b) == baseline[lang] else "  <-- DRIFT vs v0"
        print(f"{lang:11s} {len(b):6d} {baseline[lang]:8d} {len(rs)-len(b):6d}  "
              f"{dict(srcs)}{tag}{same}")

    print(f"\n{'language':11s} spoof generators")
    for lang in sorted({r["language"] for r in rows}):
        g = collections.Counter(r["source"] for r in rows
                                if r["language"] == lang and r["label"] == LABEL_SPOOF)
        tag = "  <-- CONTROL (single generator family)" if "MMS-TTS" not in g else ""
        print(f"{lang:11s} {dict(g)}{tag}")

    print(f"\ngender coverage of the NEW bonafide (the Tamil/Malayalam gap):")
    for lang in sorted(OPENSLR[c][0] for c in OPENSLR):
        g = collections.Counter(r["gender"] for r in rows
                                if r["source"] == "OpenSLR" and r["language"] == lang)
        print(f"  {lang:11s} {dict(g)}")

    print(f"\nwrote {out}/  ({len(rows)} clips)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--internal", default="data/indic")
    p.add_argument("--openslr", default="data/openslr_raw")
    p.add_argument("--out", default="data/mixed")
    p.add_argument("--replace-frac", type=float, default=0.5,
                   help="fraction of train/dev bonafide replaced by OpenSLR")
    p.add_argument("--dev-speaker-frac", type=float, default=0.2)
    p.add_argument("--min-dur", type=float, default=0.5)
    p.add_argument("--mms", default="data/mms_raw")
    p.add_argument("--mms-frac", type=float, default=0.0,
                   help="fraction of train/dev SPOOF replaced by MMS-TTS (0 = v1)")
    p.add_argument("--seed", type=int, default=0)
    status = build(p.parse_args())
    sys.stdout.flush(); sys.stderr.flush()
    os._exit(status)


if __name__ == "__main__":
    main()
