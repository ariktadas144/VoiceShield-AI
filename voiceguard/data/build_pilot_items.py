"""Pair each reference clip with the text it will be made to say.

Two rules:

1. A reference never synthesises its own transcript. If it did, the generator would be
   reconstructing an utterance it was handed, and the result would be closer to a
   resynthesis of the bonafide clip than to a novel forgery. Every reference is instead
   assigned some *other* speaker's transcript from the same language (a derangement, so
   no fixed points).

2. The pairing is identical for both generators. Reference, target text and item id are
   fixed here, once; SPRING_F5 and Indic-Mio each consume this same file. Anything that
   later separates the two generators therefore cannot be speaker, text or language --
   only the generator itself.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys

from indic_numtowords import num2words
from pathlib import Path

LANG_ID = {"Hindi": "hi", "Tamil": "ta", "Telugu": "te", "Malayalam": "ml"}


def spell_numbers(text: str, lang: str) -> str:
    """Write digits out as words before either generator sees them.

    SPRING_F5's infer_process calls num2vec(gen_text, lang=lang), but F5TTS.infer never
    passes lang, so lang is None and indic_numtowords raises "Language not supported" on
    any text containing a digit -- 2 of these 400 items. The wrapper that would have
    supplied lang lives in the repo's missing model.py.

    Doing the conversion here instead of patching one generator keeps the two sides
    identical: both receive the same fully spelled-out string, so this cannot become a
    difference between generators. Devanagari digits are handled too -- Python's \\d and
    int() both understand them.
    """
    def repl(m):
        try:
            return num2words(int(m.group()), lang=lang)
        except Exception:
            return m.group()
    return re.sub(r"\d+", repl, text)


def derange(n: int, rng: random.Random) -> list[int]:
    """A permutation with no fixed point, so nothing says its own transcript."""
    while True:
        p = list(range(n))
        rng.shuffle(p)
        if all(p[i] != i for i in range(n)):
            return p


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refs", default="data/pilot_refs/references.jsonl")
    ap.add_argument("--out", default="data/pilot_refs/pilot_items.jsonl")
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    refs = [json.loads(l) for l in open(args.refs)]
    items = []

    for language in ["Hindi", "Tamil", "Telugu", "Malayalam"]:
        group = [r for r in refs if r["language"] == language]
        perm = derange(len(group), rng)
        for i, r in enumerate(group):
            donor = group[perm[i]]
            assert donor["ref_id"] != r["ref_id"]
            items.append({
                "item_id": f"{LANG_ID[language]}_{i:04d}",
                "language": language,
                "lang_id": LANG_ID[language],
                # conditioning: whose voice
                "ref_id": r["ref_id"], "ref_path": r["ref_path"],
                "ref_text": r["transcript"], "ref_speaker": r["speaker_id"],
                "ref_gender": r["gender"], "ref_duration_s": r["duration_s"],
                "ref_source": r["source_dataset"],
                # content: what it says (borrowed from a different speaker)
                "target_text": spell_numbers(donor["transcript"], LANG_ID[language]), "target_text_from": donor["ref_id"],
            })

    with open(args.out, "w") as fh:
        for it in items:
            fh.write(json.dumps(it, ensure_ascii=False) + "\n")

    print(f"{'language':11s} {'items':>6s} {'self-pairs':>11s}  median target chars")
    import statistics
    for language in ["Hindi", "Tamil", "Telugu", "Malayalam"]:
        g = [i for i in items if i["language"] == language]
        self_pairs = sum(1 for i in g if i["ref_id"] == i["target_text_from"])
        print(f"{language:11s} {len(g):6d} {self_pairs:11d}  "
              f"{statistics.median(len(i['target_text']) for i in g):.0f}")
    print(f"\nwrote {args.out}  ({len(items)} items, consumed by BOTH generators)")
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
