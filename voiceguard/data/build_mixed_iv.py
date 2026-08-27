"""Add IndicVoices as a third bonafide source, changing nothing else.

STRATEGY, chosen after research rather than by assumption.

Multi-corpus training does not reliably help: combining ASVspoof 5 with ASVspoof 2019
improved pooled EER 7.41% -> 6.11% while degrading ASVspoof 5 itself 4.64% -> 8.72%, and
the diagnosed cause was "distinct clustering patterns aligned with dataset IDs"
(arXiv:2603.18657). That is the failure mode already present in our data -- OpenSLR is
separable from the fake class at AUC 0.965 on silence fraction alone. So more corpora is
not automatically better, and the addition is kept deliberately small.

Where the literature is positive it is ADDITIVE while holding bonafide:spoof near 50/50
(arXiv:2508.20983). We cannot be purely additive here because the spoof side is frozen by
design, so pure addition would drift real:fake from 1.02:1 to 1.27-1.69:1 and bias the
model toward predicting "real" -- which would flatter the false-accusation metric we are
trying to fix while quietly costing spoof recall. Instead each language's real BUDGET is
held fixed and its composition changed. Total dataset size, class balance and the entire
spoof side are identical to the F5 experiment; bonafide composition is the only variable.

THE SHARE IS 30%, and that number is not arbitrary. OpenSLR sits at exactly 30.0% of the
current real side, and 30% is the only dose in this project with demonstrated effect: it
is what v1 added to fix bonafide-domain shift, moving cell C from AUC 0.890 to 0.956.
Matching it gives IndicVoices parity with the corpus whose shortcut it has to counteract.

The 30% is taken PROPORTIONALLY from both existing sources, not from SherryT997 alone.
Protecting OpenSLR while cutting Sherry by 60% would preserve the source carrying the
silence shortcut and shrink the one that does not -- backwards. Proportional reduction
lowers OpenSLR's weight from 50% to 35% of Tamil/Telugu/Malayalam real.

English is untouched. IndicVoices covers 22 Indian languages and has no English, and
English is the control language.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

INDIC = ["Hindi", "Tamil", "Telugu", "Malayalam"]


def load(p):
    return [json.loads(l) for l in open(p) if l.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="data/mixed_f5/manifest.jsonl")
    ap.add_argument("--iv", default="data/indicvoices/manifest.jsonl")
    ap.add_argument("--out", default="data/mixed_f5_iv")
    ap.add_argument("--share", type=float, default=0.30)
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    base = load(args.base)
    iv = load(args.iv)

    # ---- speaker-disjoint split of IndicVoices. speaker_id is a REAL field here, so
    # this is genuine speaker disjointness, not the clip-disjointness we had to settle
    # for with SherryT997.
    iv_split = {}
    for lang in INDIC:
        g = [r for r in iv if r["language"] == lang]
        by = defaultdict(list)
        for r in g:
            by[r["speaker_id"]].append(r)
        spk = sorted(by); rng.shuffle(spk)
        n = len(g); want_tr, want_dv = round(n * .70), round(n * .15)
        cur = 0
        for s in spk:
            sp = "train" if cur < want_tr else ("dev" if cur < want_tr + want_dv else "test_iv")
            for r in by[s]:
                iv_split[id(r)] = sp
            cur += len(by[s])
        c = Counter(iv_split[id(r)] for r in g)
        print(f"  {lang:11s} {n:4d} clips, {len(spk):4d} speakers -> {dict(c)}  speaker-disjoint")

    pool = defaultdict(list)
    for r in iv:
        pool[(r["language"], iv_split[id(r)])].append(r)
    for v in pool.values():
        rng.shuffle(v)

    rows, report = [], []
    # spoof side and the test split pass through completely unchanged
    for r in base:
        if r["label"] == 1 or r["split"] in ("test", "test_f5"):
            rows.append(r)

    for split in ("train", "dev"):
        for lang in sorted({r["language"] for r in base if r["split"] == split}):
            g = [r for r in base if r["split"] == split and r["label"] == 0
                 and r["language"] == lang]
            if not g:
                continue
            budget = len(g)
            avail = pool.get((lang, split), [])
            n_iv = min(round(budget * args.share), len(avail)) if lang in INDIC else 0
            rest = budget - n_iv
            sh = [r for r in g if r["source"] == "SherryT997"]
            os_ = [r for r in g if r["source"] == "OpenSLR"]
            rng.shuffle(sh); rng.shuffle(os_)
            # proportional reduction, so OpenSLR's weight drops too
            tot = len(sh) + len(os_)
            n_sh = round(rest * len(sh) / tot) if tot else 0
            n_os = rest - n_sh
            n_sh, n_os = min(n_sh, len(sh)), min(n_os, len(os_))
            take = sh[:n_sh] + os_[:n_os] + avail[:n_iv]
            rows += take
            report.append((lang, split, budget, n_sh, n_os, n_iv, len(take)))
    # held-out IndicVoices speakers, reported separately like test_f5
    rows += [r for r in iv if iv_split[id(r)] == "test_iv"]

    for r in rows:
        r.setdefault("generator", None)
        if r.get("source") == "IndicVoices":
            r["split"] = iv_split.get(id(r), r.get("split", "train"))

    with open(out / "manifest.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    for split in ("train", "dev", "test", "test_f5", "test_iv"):
        g = [r for r in rows if r["split"] == split]
        if g:
            with open(out / f"{split}.txt", "w") as fh:
                for r in g:
                    fh.write(f"{r['path']} {r['label']}\n")

    print(f"\n{'lang':11s}{'split':6s}{'budget':>7s}{'Sherry':>8s}{'OpenSLR':>9s}"
          f"{'IndicV':>8s}{'total':>7s}")
    for t in report:
        print(f"{t[0]:11s}{t[1]:6s}{t[2]:7d}{t[3]:8d}{t[4]:9d}{t[5]:8d}{t[6]:7d}")

    print("\n" + "=" * 66)
    print("FINAL MIXTURE")
    print("=" * 66)
    print(f"{'split':9s}{'real':>6s}{'fake':>6s}{'ratio':>8s}   real by source")
    for split in ("train", "dev", "test", "test_f5", "test_iv"):
        g = [r for r in rows if r["split"] == split]
        if not g:
            continue
        nr = sum(1 for r in g if r["label"] == 0); nf = len(g) - nr
        src = dict(Counter(r["source"] for r in g if r["label"] == 0))
        print(f"{split:9s}{nr:6d}{nf:6d}{(nr/nf if nf else 0):7.2f}:1   {src}")
    print(f"\nwrote {out}/manifest.jsonl  ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
