"""Assemble the SPRING_F5 training mixture from v1's data plus the new spoof half.

THE EXPERIMENT IS A REALLOCATION, NOT AN ADDITION.

The fake budget per language is held at exactly what v1 had, and half of it is handed
from SherryT997 spoof to SPRING_F5. Nothing is added and nothing is upsampled. This
matters: if F5 were simply appended, the fake side would double, real:fake would go to
1:2, and the model would drift toward predicting spoof -- more false accusations on
genuine speech, which is the one thing that is a hard constraint here. It would also
confound the result, because any change could be explained by having more spoof data
rather than more diverse spoof data. Holding the budget constant isolates diversity.

The bonafide side is untouched. v1's real composition -- SherryT997 everywhere, plus
OpenSLR in Tamil, Telugu and Malayalam -- is proven and is copied through unchanged, with
its existing split assignments.

TEST SPLIT. v1's internal test split is copied through completely unchanged, so cell A
stays a like-for-like comparison against v1. The F5 test clips are carried alongside it
with split "test_f5" and reported separately: they are a seen generator on unseen
speakers, which is a different question from cell A and should not be silently mixed into
it.

SPLITS FOR F5 are speaker-disjoint where speaker identity exists. OpenSLR-referenced
clips (Tamil, Telugu, Malayalam) are partitioned by reference speaker, so a voice used in
training is never scored in dev or test. Hindi references come from SherryT997, which
carries no speaker field, so Hindi F5 can only be clip-disjoint -- recorded, not hidden.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

LANGS = ["Hindi", "Tamil", "Telugu", "Malayalam"]


def load(p: Path) -> list[dict]:
    return [json.loads(l) for l in open(p) if l.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mixed", default="data/mixed")
    ap.add_argument("--f5", nargs="+",
                    default=["data/f5_long", "data/f5_train", "data/pilot_spoof/spring_f5"])
    ap.add_argument("--f5-refs", nargs="+",
                    default=["data/train_refs", "data/pilot_refs"])
    ap.add_argument("--per-language-total", type=int, default=500)
    ap.add_argument("--out", default="data/mixed_f5")
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    mroot = Path(args.mixed)
    base = load(mroot / "manifest.jsonl")

    # ---- gather every F5 clip, with the speaker of the reference it was cloned from
    #
    # Two vintages are combined. data/f5_long was generated with target durations drawn
    # from the real duration distribution, so all of it is used. The earlier runs paired
    # each reference with a single short transcript and put 54.9% of their clips under
    # RawNet2's 4.04 s window against 17.2% for real speech -- a tiling cue worth AUC
    # 0.705 on the model's own input -- so only the clips that clear the window are taken
    # from them. f5_long supplies the under-window share instead, in the proportion real
    # speech actually has.
    W = 64_600 / 16_000
    refs = {}
    for rd in args.f5_refs:
        refs.update({r["ref_id"]: r for r in load(Path(rd) / "references.jsonl")})

    f5: list[dict] = []
    for d in args.f5:
        droot = Path(d)
        if not (droot / "manifest.jsonl").exists():
            continue
        take_all = droot.name == "f5_long"
        for r in load(droot / "manifest.jsonl"):
            if not take_all and r["duration_s"] < W:
                continue
            ref = refs.get(r["ref_id"], {})
            f5.append({
                "path": str((droot / r["path"]).resolve()),
                "sha256": r["sha256"], "label": 1, "language": r["language"],
                "source": "SPRING_F5", "generator": "spring_f5",
                "source_license": "Apache-2.0",
                "speaker_id": ref.get("speaker_id", r.get("ref_speaker", "unknown")),
                "gender": r.get("ref_gender", "unknown"),
                "duration_s": r["duration_s"], "sample_rate": r["sample_rate"],
                "ref_id": r["ref_id"], "ref_source": ref.get("source_dataset", "unknown"),
                "item_id": r["item_id"],
            })
    rng.shuffle(f5)
    capped, seen = [], Counter()
    for r in f5:
        if seen[r["language"]] < args.per_language_total:
            capped.append(r); seen[r["language"]] += 1
    f5 = capped
    print(f"F5 clips available: {len(f5)}  {dict(Counter(r['language'] for r in f5))}")

    # ---- speaker-disjoint 70/15/15 per language
    assigned: list[dict] = []
    for lang in LANGS:
        g = [r for r in f5 if r["language"] == lang]
        by_spk = defaultdict(list)
        for r in g:
            by_spk[r["speaker_id"]].append(r)
        spks = sorted(by_spk)
        rng.shuffle(spks)
        # A speaker id that owns exactly one clip is not a speaker id -- SherryT997
        # gives every clip its own, so Hindi would otherwise be reported as
        # "speaker-disjoint" when it is only clip-disjoint. Require that ids really
        # group clips before claiming the stronger property.
        clips_per_spk = len(g) / max(1, len(spks))
        disjoint = clips_per_spk >= 2.0
        if disjoint:
            n = len(g); want_tr, want_dv = round(n * .70), round(n * .15)
            cur, split_of = 0, {}
            for s in spks:
                sp = "train" if cur < want_tr else ("dev" if cur < want_tr + want_dv else "test_f5")
                split_of[s] = sp
                cur += len(by_spk[s])
            for r in g:
                r["split"] = split_of[r["speaker_id"]]
        else:
            rng.shuffle(g)
            n = len(g); tr, dv = round(n * .70), round(n * .15)
            for i, r in enumerate(g):
                r["split"] = "train" if i < tr else ("dev" if i < tr + dv else "test_f5")
        assigned += g
        c = Counter(r["split"] for r in g)
        kind = (f"speaker-disjoint ({len(spks)} speakers, {clips_per_spk:.1f} clips each)"
                if disjoint else
                f"CLIP-disjoint only: {len(spks)} ids for {len(g)} clips, no speaker field")
        print(f"  {lang:11s} {len(g):4d} clips  {dict(c)}  {kind}")

    # ---- build the mixture
    # Absolute paths throughout. This manifest draws on four separate trees
    # (data/mixed, data/f5_train, data/f5_long, data/pilot_spoof), so a relative path is
    # only meaningful next to the tree it came from -- and every consumer that resolved
    # it against the wrong root would fail, or worse, silently read the wrong file.
    mroot_abs = mroot.resolve()
    rows: list[dict] = []
    for r in base:
        if r["label"] == 0 or r["split"] == "test":
            rr = {**r, "generator": ("sherry_spoof" if r["label"] else None)}
            if not Path(rr["path"]).is_absolute():
                rr["path"] = str(mroot_abs / rr["path"])
            rows.append(rr)

    print("\nfake side, per language and split: keep v1's budget, give half to F5")
    print(f"{'language':11s} {'split':6s} {'v1 fake':>8s} {'->sherry':>9s} {'->f5':>6s} {'f5 avail':>9s}")
    for lang in LANGS + ["English"]:
        for split in ("train", "dev"):
            v1 = [r for r in base if r.get("language") == lang
                  and r["label"] == 1 and r["split"] == split]
            if not v1:
                continue
            pool = [r for r in assigned if r["language"] == lang and r["split"] == split]
            if lang == "English" or not pool:          # control language: unchanged
                rows += [{**r, "generator": "sherry_spoof",
                      "path": str(mroot_abs / r["path"]) if not Path(r["path"]).is_absolute()
                      else r["path"]} for r in v1]
                print(f"{lang:11s} {split:6s} {len(v1):8d} {len(v1):9d} {0:6d} {0:9d}"
                      + ("   (control, unchanged)" if lang == "English" else ""))
                continue
            n_f5 = min(len(v1) // 2, len(pool))
            n_sh = len(v1) - n_f5
            rng.shuffle(v1)
            rows += [{**r, "generator": "sherry_spoof",
                      "path": str(mroot_abs / r["path"]) if not Path(r["path"]).is_absolute()
                      else r["path"]} for r in v1[:n_sh]]
            rng.shuffle(pool)
            rows += pool[:n_f5]
            print(f"{lang:11s} {split:6s} {len(v1):8d} {n_sh:9d} {n_f5:6d} {len(pool):9d}")
    rows += [r for r in assigned if r["split"] == "test_f5"]

    with open(out / "manifest.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    print("\n" + "=" * 72)
    print("FINAL MIXTURE")
    print("=" * 72)
    print(f"{'split':9s} {'real':>6s} {'fake':>6s}   fake by generator")
    for sp in ("train", "dev", "test", "test_f5"):
        g = [r for r in rows if r["split"] == sp]
        if not g:
            continue
        gen = dict(Counter(r.get("generator") for r in g if r["label"] == 1))
        print(f"{sp:9s} {sum(1 for r in g if r['label']==0):6d} "
              f"{sum(1 for r in g if r['label']==1):6d}   {gen}")
    print(f"\nwrote {out}/manifest.jsonl  ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
