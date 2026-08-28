"""Build SPRING_F5 target texts long enough to fill RawNet2's 4.04 s window.

THE DEFECT THIS FIXES. Each pilot/train item paired a reference with ONE donor
transcript. OpenSLR utterances are short -- Telugu's median transcript is 36 characters --
so 54.9% of the resulting clips came out under the 4.04 s window, against 17.2% of real
speech. audio_utils.pad() tiles anything shorter than the window into a periodic repeat,
so "was this clip tiled" became a cue worth AUC 0.705 on the model's actual input, and
REAL vs SPRING_F5 reached 0.860 on recording statistics alone.

THE FIX. Concatenate donor transcripts from different speakers until the predicted
duration clears a target, using a per-language characters-per-second rate fitted on the
2,000 clips already generated:

    Hindi 17.5, Tamil 21.3, Telugu 19.4, Malayalam 18.8 chars/sec

Aiming at a fixed target would be wrong in the other direction. Real speech is not all
above the window -- 17.2% of it is under 4.04 s and gets tiled too. Forcing every F5 clip
comfortably over the line would leave real speech the ONLY tiled class and simply invert
the cue. So each item's target duration is drawn from the empirical duration distribution
of the real training clips, which makes the two distributions match rather than merely
separating them differently.

Donors are drawn from other speakers, never the reference's own transcript, and each
concatenated text keeps its parts in a fixed order recorded in the manifest.
"""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path

from indic_numtowords import num2words

LANG_ID = {"Hindi": "hi", "Tamil": "ta", "Telugu": "te", "Malayalam": "ml"}
# duration_s ~= INTERCEPT + chars / CPS, fitted PER LANGUAGE.
#
# The first version of this table carried a single global intercept of +1.6 s. That is
# wrong: the measured intercept is near zero in every language. For long texts the error
# is harmless -- Hindi came out at ratio 1.03 -- but for short ones it dominates, and
# Tamil landed 61.8% under the window against a 47.8% intent. Anything that has to hit a
# 3-second target needs the intercept right.
#
# Hindi and Tamil are measured directly on concatenated multi-sentence text, which is
# what this script produces. Telugu and Malayalam have only been generated from single
# sentences so far; their pooled fits are scaled by the concatenated/pooled ratio, which
# came out at 0.906 (Hindi) and 0.901 (Tamil) -- consistent enough across two independent
# languages to extrapolate from, and re-checked against measured output after the run.
CPS = {
    "Hindi":     (11.9, -0.67),   # measured, concatenated text, n=27
    "Tamil":     (15.2, -0.30),   # measured, concatenated text, n=247
    "Telugu":    (13.0, -0.40),   # 14.42 pooled x 0.90
    "Malayalam": (13.9, -0.40),   # 15.44 pooled x 0.90
}


def spell_numbers(text: str, lang: str) -> str:
    def repl(m):
        try:
            return num2words(int(m.group()), lang=lang)
        except Exception:
            return m.group()
    return re.sub(r"\d+", repl, text)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refs", nargs="+",
                    default=["data/train_refs/references.jsonl",
                             "data/pilot_refs/references.jsonl"])
    ap.add_argument("--out", default="data/f5_long/items.jsonl")
    ap.add_argument("--count", type=int, default=0, help="unused; see --per-language-total")
    ap.add_argument("--real-manifest", default="data/mixed_f5/manifest.jsonl",
                    help="durations are sampled from the REAL clips in here")
    ap.add_argument("--existing", nargs="+",
                    default=["data/f5_train", "data/pilot_spoof/spring_f5", "data/f5_long"],
                    help="F5 manifests whose over-window clips will be kept")
    ap.add_argument("--per-language-total", type=int, default=500)
    ap.add_argument("--seed", type=int, default=99)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    refs = []
    for f in args.refs:
        root = Path(f).parent
        for r in map(json.loads, open(f)):
            r["_root"] = str(root)
            refs.append(r)

    by_lang: dict[str, list] = {}
    for r in refs:
        by_lang.setdefault(r["language"], []).append(r)

    # Empirical real-duration pool, per language, from the training split.
    W = 64600 / 16000
    real_dur: dict[str, list[float]] = {}
    for r in map(json.loads, open(args.real_manifest)):
        if r.get("split") == "train" and r.get("label") == 0 and r.get("duration_s"):
            real_dur.setdefault(r["language"], []).append(float(r["duration_s"]))
    for lang, d in sorted(real_dur.items()):
        if lang in LANG_ID:
            short = sum(1 for x in d if x < W) / len(d)
            print(f"  real {lang:11s} n={len(d):5d} median={sorted(d)[len(d)//2]:.2f}s "
                  f"under-window={100*short:.1f}%")

    # How many existing clips clear the window, PER LANGUAGE. These counts are wildly
    # uneven -- Hindi 473, Telugu 45 -- because target-text length varied by language,
    # so a single global figure would leave Telugu far short and Hindi far over.
    keep_n: dict[str, int] = {}
    for d in args.existing:
        m = Path(d) / "manifest.jsonl"
        if not m.exists():
            continue
        # f5_long clips are duration-targeted by construction, so they all count;
        # from the earlier runs only the ones that clear the window are kept.
        all_count = "f5_long" in str(d)
        for r in map(json.loads, open(m)):
            if all_count or r["duration_s"] >= W:
                keep_n[r["language"]] = keep_n.get(r["language"], 0) + 1
    items = []
    for lang, langid in LANG_ID.items():
        pool = by_lang.get(lang, [])
        if not pool:
            continue
        pool_d = real_dur.get(lang) or [6.0]
        kept = keep_n.get(lang, 0)
        per_lang = max(0, args.per_language_total - kept)
        if per_lang == 0:
            print(f"  {lang:11s} kept={kept} -> nothing to generate")
            continue
        # Every kept clip is over the window, so the new clips must carry the entire
        # under-window share needed for (kept + new) to match real speech.
        target_short = sum(1 for x in pool_d if x < W) / len(pool_d)
        need_short = target_short * (kept + per_lang)
        new_short_frac = min(0.95, max(0.0, need_short / per_lang))
        print(f"  {lang:11s} kept={kept:4d} generate={per_lang:4d}  "
              f"real under-window={100*target_short:.1f}% -> "
              f"{100*new_short_frac:.1f}% of new clips must be short")
        transcripts = [(r["ref_id"], r["transcript"]) for r in pool]
        chosen = [pool[i % len(pool)] for i in range(per_lang)]
        rng.shuffle(chosen)
        for n, ref in enumerate(chosen):
            want = rng.choice(pool_d)
            if rng.random() >= new_short_frac:
                while want < W:                 # resample until over the window
                    want = rng.choice(pool_d)
            else:
                while want >= W:                # resample until under it
                    want = rng.choice(pool_d)
            cps, icept = CPS[lang]
            need_chars = max(10.0, (want - icept) * cps)
            # Donors are chosen by LENGTH, not at random. Appending whole sentences
            # blindly cannot hit a short target -- a single Tamil transcript already
            # overshoots 3 s -- which is why the first attempt left Tamil and Malayalam
            # with far fewer under-window clips than real speech has. At each step the
            # donor closest to the remaining budget is taken (from a small random shortlist,
            # so the texts stay varied rather than deterministic).
            parts, ids, used = [], [], {ref["ref_id"]}
            while True:
                have = sum(len(p) + 1 for p in parts)
                remaining = need_chars - have
                if remaining <= 0 or len(parts) >= 6:
                    break
                cands = [c for c in rng.sample(transcripts, min(40, len(transcripts)))
                         if c[0] not in used]
                if not cands:
                    break
                cand = min(cands, key=lambda c: abs(len(c[1]) - remaining))
                # stop rather than overshoot badly on the very first sentence
                if parts and len(cand[1]) > remaining * 2.0:
                    break
                used.add(cand[0])
                parts.append(cand[1].rstrip(" ।."))
                ids.append(cand[0])
            text = spell_numbers(" ".join(parts), langid)
            items.append({
                "item_id": f"long_{langid}_{n:04d}",
                "language": lang, "lang_id": langid,
                "ref_id": ref["ref_id"],
                "ref_path": str(Path(ref["_root"]) / ref["ref_path"]),
                "ref_text": ref["transcript"],
                "ref_speaker": ref["speaker_id"], "ref_gender": ref["gender"],
                "ref_duration_s": ref["duration_s"], "ref_source": ref["source_dataset"],
                "target_text": text, "target_text_from": ids,
                "n_donor_sentences": len(parts),
                "predicted_seconds": round(CPS[lang][1] + len(text) / CPS[lang][0], 2),
                "sampled_target_seconds": round(want, 2),
            })

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as fh:
        for it in items:
            fh.write(json.dumps(it, ensure_ascii=False) + "\n")

    import statistics
    print(f"{'language':11s} {'items':>6s} {'chars':>7s} {'sentences':>10s} {'pred sec':>9s}")
    for lang in LANG_ID:
        g = [i for i in items if i["language"] == lang]
        if not g:
            continue
        print(f"{lang:11s} {len(g):6d} "
              f"{statistics.median(len(i['target_text']) for i in g):7.0f} "
              f"{statistics.median(i['n_donor_sentences'] for i in g):10.1f} "
              f"{statistics.median(i['predicted_seconds'] for i in g):9.2f}")
    print(f"\nwrote {args.out}  ({len(items)} items)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
