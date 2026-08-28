"""Size the SPRING_F5 training mixture before generating a single clip.

BALANCE POLICY. ASVspoof 2019 LA balances its spoof half exactly by attack -- 22,800
spoofed utterances over six algorithms, 3,800 each. That is the established protocol and
the simplest one that fits here, so the fake half of each language is split evenly
between the two generators: half SherryT997 spoof, half SPRING_F5. Nothing is
concatenated and nothing is allowed to dominate.

WHAT IS HELD FIXED. v1's bonafide composition is proven and is not touched: SherryT997
everywhere, plus OpenSLR in Tamil, Telugu and Malayalam. The real/fake ratio per language
stays at v1's ~1:1. The only substantive change is that half the fake side becomes an
independent generator.

ENGLISH. SPRING_F5 supports English, but the approved language list is Hindi, Tamil,
Telugu and Malayalam, and English is v1's control language. It is left exactly as v1 had
it, which means English fake stays single-generator. Recorded as a known asymmetry.

SPLITS. F5 clips are split 70/15/15 to match the existing mixture, speaker-disjoint:
a reference speaker contributes to exactly one split, so a voice heard in training is
never scored in dev or test.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

LANGS = ["Hindi", "Tamil", "Telugu", "Malayalam"]
SEC_PER_CLIP = 18.6      # measured over the 400-clip pilot
MB_PER_CLIP = 78 / 400   # measured


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mixed", default="data/mixed/manifest.jsonl")
    ap.add_argument("--pilot", default="data/pilot_spoof/spring_f5/manifest.jsonl")
    ap.add_argument("--out", default="data/f5_mix_plan.json")
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.mixed) if l.strip()]
    have_pilot = Counter()
    if Path(args.pilot).exists():
        for r in map(json.loads, open(args.pilot)):
            have_pilot[r["language"]] += 1

    plan, totals = {}, defaultdict(int)
    print("=" * 78)
    print("CURRENT v1 MIXTURE  (all splits)")
    print("=" * 78)
    print(f"{'language':11s} {'real':>6s} {'fake':>6s}   real by source        fake by source")
    for lang in LANGS + ["English"]:
        g = [r for r in rows if r.get("language") == lang]
        real = [r for r in g if r["label"] == 0]
        fake = [r for r in g if r["label"] == 1]
        rs = dict(Counter(r["source"] for r in real))
        fs = dict(Counter(r["source"] for r in fake))
        print(f"{lang:11s} {len(real):6d} {len(fake):6d}   {str(rs):22s}{fs}")

    print("\n" + "=" * 78)
    print("TARGET: fake half split evenly between SherryT997 and SPRING_F5")
    print("=" * 78)
    print(f"{'language':11s} {'real':>6s} {'fake':>6s} {'->Sherry':>9s} {'->F5':>7s} "
          f"{'have':>6s} {'to gen':>7s}")
    for lang in LANGS:
        g = [r for r in rows if r.get("language") == lang]
        n_real = sum(1 for r in g if r["label"] == 0)
        n_fake = sum(1 for r in g if r["label"] == 1)
        f5 = n_fake // 2                 # half the existing fake budget
        sherry = n_fake - f5
        need = max(0, f5 - have_pilot.get(lang, 0))
        plan[lang] = {"real": n_real, "fake_total": n_fake, "fake_sherry": sherry,
                      "fake_f5": f5, "have": have_pilot.get(lang, 0), "to_generate": need}
        totals["f5"] += f5
        totals["need"] += need
        print(f"{lang:11s} {n_real:6d} {n_fake:6d} {sherry:9d} {f5:7d} "
              f"{have_pilot.get(lang,0):6d} {need:7d}")
    eng = [r for r in rows if r.get("language") == "English"]
    print(f"{'English':11s} {sum(1 for r in eng if r['label']==0):6d} "
          f"{sum(1 for r in eng if r['label']==1):6d} "
          f"{sum(1 for r in eng if r['label']==1):9d} {0:7d} {0:6d} {0:7d}   (control, unchanged)")

    print("\n" + "=" * 78)
    print("SPLIT ALLOCATION for the F5 clips (70/15/15, speaker-disjoint)")
    print("=" * 78)
    print(f"{'language':11s} {'train':>7s} {'dev':>6s} {'test':>6s} {'total':>7s}")
    for lang in LANGS:
        n = plan[lang]["fake_f5"]
        tr = round(n * 0.70); dv = round(n * 0.15); te = n - tr - dv
        plan[lang].update(train=tr, dev=dv, test=te)
        print(f"{lang:11s} {tr:7d} {dv:6d} {te:6d} {n:7d}")

    need = totals["need"]
    print("\n" + "=" * 78)
    print("GENERATION BUDGET")
    print("=" * 78)
    print(f"  target F5 clips        : {totals['f5']}")
    print(f"  already generated      : {sum(have_pilot.values())} (pilot, reusable)")
    print(f"  clips to generate      : {need}")
    per_lang = ", ".join(f"{l}={plan[l]['fake_f5']}" for l in LANGS)
    print(f"  clips/language         : {per_lang}")
    print(f"  estimated time         : {need*SEC_PER_CLIP/3600:.1f} h at {SEC_PER_CLIP}s/clip")
    print(f"  estimated new storage  : {need*MB_PER_CLIP:.0f} MB")
    print(f"  total F5 storage       : {totals['f5']*MB_PER_CLIP:.0f} MB")
    json.dump({"plan": plan, "totals": dict(totals)}, open(args.out, "w"), indent=2)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
