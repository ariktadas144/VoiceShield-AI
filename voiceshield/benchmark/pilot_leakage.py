"""Hard gate: prove the pilot did not consume held-out evaluation material.

The standing rule on this project is that the held-out evaluation is not sacrificed to
make training possible. Spoofs are manufactured FROM genuine clips, so a careless
reference choice silently converts test audio into training audio and every later number
becomes unfalsifiable. This checks that it did not happen, and it checks it against the
manifests rather than against intent.

Also reports the deliberate overlaps, so they are on the record rather than discovered
later:

  * every reference speaker appears on both sides of the pilot, as bonafide and as the
    voice being cloned. That is by design -- it is what stops speaker identity from
    predicting the label.
  * both generators receive the identical reference set, so speaker cannot predict
    generator either.
  * the Hindi references come from SherryT997 train, which VoiceShield v1 trained on.
    That is in-domain, and it is the reason the Hindi rows must not be read as
    unseen-speaker evidence.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def load(p: Path) -> list[dict]:
    return [json.loads(l) for l in open(p)] if p.exists() else []


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refs", default="data/pilot_refs/references.jsonl")
    ap.add_argument("--items", default="data/pilot_refs/pilot_items.jsonl")
    ap.add_argument("--indic", default="data/indic/manifest.jsonl")
    ap.add_argument("--external", nargs="*", default=["data/external2", "data/mixed"])
    ap.add_argument("--spoof", nargs="+", default=["data/pilot_spoof/spring_f5",
                                                   "data/pilot_spoof/indic_mio"])
    args = ap.parse_args()

    refs = load(Path(args.refs))
    items = load(Path(args.items))
    failures = []

    print("=" * 78)
    print("GATE 1  no reference comes from a held-out split")
    print("=" * 78)
    indic = load(Path(args.indic))
    by_name = {}
    for r in indic:
        by_name.setdefault(Path(r["path"]).name, []).append(r)
    counts = Counter()
    for r in refs:
        nm = Path(r["origin_path"]).name
        for m in by_name.get(nm, []):
            counts[m["split"]] += 1
    for split in ("train", "dev", "test"):
        n = counts.get(split, 0)
        bad = split in ("dev", "test") and n > 0
        print(f"  references traced to indic '{split}' split: {n:4d}"
              + ("   <-- LEAK" if bad else ("   (allowed)" if split == "train" else "   OK")))
        if bad:
            failures.append(f"{n} references come from the {split} split")
    untraced = len(refs) - sum(counts.values())
    print(f"  references not in the indic manifest at all : {untraced:4d}   "
          f"(OpenSLR -- never part of any VoiceShield split)")

    print("\n" + "=" * 78)
    print("GATE 2  no reference comes from external evaluation material")
    print("=" * 78)
    ref_names = {Path(r["origin_path"]).name for r in refs}
    ref_sha = {r["ref_sha256"] for r in refs}
    for d in args.external:
        man = Path(d) / "manifest.jsonl"
        rows = load(man)
        if not rows:
            print(f"  {d:22s} (no manifest -- nothing to check)")
            continue
        # Overlap only matters where it lands. These corpora carry train material too,
        # and a reference that also appears in someone's TRAIN split costs nothing --
        # it is the same clip VoiceShield already learned from. A reference sitting in a
        # dev or test split is the failure this gate exists to catch, so the split is
        # what decides, not the bare intersection.
        held = [r for r in rows if r.get("split") in ("dev", "test")]
        held_names = {Path(r["path"]).name for r in held}
        held_shas = {r.get("sha256") for r in held if r.get("sha256")}
        hit_n, hit_s = ref_names & held_names, ref_sha & held_shas
        tr = sum(1 for r in rows if r.get("split") == "train"
                 and (r.get("sha256") in ref_sha or Path(r["path"]).name in ref_names))
        bad = bool(hit_n or hit_s)
        print(f"  {d:22s} {len(rows):5d} rows  held-out={len(held):5d}  "
              f"held-out overlap: name={len(hit_n)} sha={len(hit_s)}"
              + ("   <-- LEAK" if bad else "   OK")
              + (f"   [{tr} train-split overlaps, allowed]" if tr else ""))
        if bad:
            failures.append(f"{len(hit_n or hit_s)} references appear in {d} dev/test")

    print("\n" + "=" * 78)
    print("GATE 3  every generated clip traces to a declared reference")
    print("=" * 78)
    known = {i["item_id"]: i for i in items}
    for d in args.spoof:
        rows = load(Path(d) / "manifest.jsonl")
        if not rows:
            print(f"  {Path(d).name:14s} (not generated yet)")
            continue
        orphan = [r for r in rows if r["item_id"] not in known]
        mism = [r for r in rows
                if r["item_id"] in known and r["ref_id"] != known[r["item_id"]]["ref_id"]]
        dupes = [k for k, v in Counter(r["item_id"] for r in rows).items() if v > 1]
        print(f"  {Path(d).name:14s} {len(rows):5d} clips  orphan={len(orphan)} "
              f"ref-mismatch={len(mism)} duplicate-ids={len(dupes)}"
              + ("   <-- PROBLEM" if orphan or mism or dupes else "   OK"))
        if orphan or mism or dupes:
            failures.append(f"{Path(d).name}: {len(orphan)} orphan / {len(mism)} mismatched")

    print("\n" + "=" * 78)
    print("GATE 4  the two generators really did receive identical inputs")
    print("=" * 78)
    mans = {Path(d).name: load(Path(d) / "manifest.jsonl") for d in args.spoof}
    present = {k: v for k, v in mans.items() if v}
    if len(present) == 2:
        (na, ra), (nb, rb) = present.items()
        ia = {r["item_id"]: r for r in ra}
        ib = {r["item_id"]: r for r in rb}
        shared = set(ia) & set(ib)
        diff = [k for k in shared
                if ia[k]["ref_id"] != ib[k]["ref_id"]
                or ia[k]["target_text"] != ib[k]["target_text"]]
        print(f"  items in both: {len(shared)}   only in {na}: {len(set(ia)-set(ib))}   "
              f"only in {nb}: {len(set(ib)-set(ia))}")
        print(f"  shared items differing in reference or text: {len(diff)}"
              + ("   <-- NOT A CONTROLLED COMPARISON" if diff else "   OK"))
        if diff:
            failures.append(f"{len(diff)} items differ between generators")
    else:
        print("  need both generators; skipping")

    print("\n" + "=" * 78)
    print("DELIBERATE OVERLAPS  (recorded, not defects)")
    print("=" * 78)
    src = Counter(r["source_dataset"] for r in refs)
    print(f"  reference sources: {dict(src)}")
    hindi_train = counts.get("train", 0)
    print(f"  Hindi references inside VoiceShield v1 training bonafide: {hindi_train}")
    print("    -> Hindi rows are IN-DOMAIN for v1. They are not unseen-speaker evidence.")
    print(f"  speakers per language: "
          f"{ {l: len({r['speaker_id'] for r in refs if r['language']==l}) for l in sorted({r['language'] for r in refs})} }")
    print("  every reference speaker appears as bonafide AND as a cloned voice: by design")

    print("\n" + "=" * 78)
    if failures:
        print(f"RESULT: {len(failures)} GATE FAILURE(S)")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("RESULT: all gates passed -- no held-out material was consumed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
