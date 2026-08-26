"""Does the generated speech actually say the right words in the right language?

This cannot be answered by listening here, and it must be answered: a generator that
emits fluent-sounding nonsense for, say, Malayalam would teach the detector that
"Malayalam-sounding gibberish = spoof". That is a worse shortcut than a loudness bias,
because it is invisible to the acoustic audit -- the statistics look fine and the
semantics are broken.

So each clip is transcribed and scored against the text it was told to say.

ASR CHOICE. ai4bharat/indic-conformer-600m-multilingual was the first pick -- MIT, purpose
built for Indic, with per-language CTC heads for exactly hi/ta/te/ml. It is a GATED repo
and this account is not on the authorised list (403 on every asset), so it is unavailable
without a human access request. openai/whisper-large-v3-turbo is used instead: MIT,
ungated, and it covers all four languages. It is weaker than IndicConformer on
low-resource Indic speech, which is precisely why the bonafide control below is not
optional. If access is granted later, rerun with --asr-backend indic-conformer; the
comparison is designed to survive the swap because only the spoof-minus-bonafide gap is
read, never the raw CER.

THE CONTROL MATTERS MORE THAN THE ABSOLUTE NUMBER. The same ASR also transcribes the
genuine reference clips against their own transcripts. IndicConformer is not equally good
at all four languages, and neither is any other system; comparing spoof CER to bonafide
CER *measured by the same model on the same language* cancels that out. A spoof CER of
30% means nothing on its own. A spoof CER of 30% where bonafide scores 28% means the
generator is fine, and one where bonafide scores 8% means it is not.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import unicodedata
from pathlib import Path

import numpy as np

LANG_ID = {"Hindi": "hi", "Tamil": "ta", "Telugu": "te", "Malayalam": "ml"}



def normalise(s: str) -> str:
    """Compare content, not typography: NFC, drop punctuation, collapse whitespace.

    Punctuation is removed by Unicode category, NOT by the regex [^\\w\\s]. In Python
    \\w does not match combining marks (category Mn), so that pattern deletes every
    Devanagari matra and virama -- नमस्ते becomes "नमस त". Indic scripts are abugidas and
    the matras carry the vowels, so stripping them would destroy most of the phonetic
    content and make every CER in this report meaningless. Letters (L*), marks (M*) and
    digits (N*) are all kept; only P* and S* become spaces.
    """
    s = unicodedata.normalize("NFC", s or "")
    s = "".join(" " if unicodedata.category(ch)[0] in "PS" else ch for ch in s)
    return " ".join(s.split()).strip()


def cer(ref: str, hyp: str) -> float:
    """Levenshtein distance over characters, divided by reference length."""
    r, h = normalise(ref), normalise(hyp)
    if not r:
        return float("nan")
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(r)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--spoof", nargs="+", default=["data/pilot_spoof/spring_f5",
                                                   "data/pilot_spoof/indic_mio"])
    ap.add_argument("--bonafide", default="data/pilot_refs")
    ap.add_argument("--asr", default="openai/whisper-large-v3-turbo")
    ap.add_argument("--asr-backend", default="whisper",
                    choices=["whisper", "indic-conformer"])
    ap.add_argument("--decoding", default="ctc", choices=["ctc", "rnnt"])
    ap.add_argument("--out", default="data/pilot_spoof/quality.json")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--per-cell", type=int, default=0,
                    help="stratified sample of N clips per (group, language)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import torch, torchaudio
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"loading ASR {args.asr} ({args.asr_backend}) ...", flush=True)

    if args.asr_backend == "indic-conformer":
        from transformers import AutoModel
        asr = AutoModel.from_pretrained(args.asr, trust_remote_code=True).to(device)

        def transcribe(wav, lang):
            with torch.no_grad():
                out = asr(wav.to(device), lang, args.decoding)
            return out[0] if isinstance(out, (list, tuple)) else out
    else:
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        proc = WhisperProcessor.from_pretrained(args.asr)
        # fp32, deliberately. In fp16 on this GPU whisper-large-v3-turbo decodes every
        # clip -- genuine speech included -- as a run of "!" characters, the familiar
        # overflow failure, which drives CER to 100% everywhere and produces a table of
        # meaningless "GOOD" verdicts. fp32 transcribes genuine Hindi at CER 0.06-0.08.
        # There is nothing to lose: this card is Turing and has no fp16 tensor cores.
        asr = WhisperForConditionalGeneration.from_pretrained(
            args.asr, dtype=torch.float32).to(device).eval()

        def transcribe(wav, lang):
            feats = proc(wav.squeeze().cpu().numpy(), sampling_rate=16_000,
                         return_tensors="pt").input_features.to(device, asr.dtype)
            with torch.no_grad():
                ids = asr.generate(feats, language=lang, task="transcribe",
                                   max_new_tokens=220)
            return proc.batch_decode(ids, skip_special_tokens=True)[0]

    print(f"ASR ready on {device}", flush=True)

    jobs = []
    for d in args.spoof:
        root = Path(d)
        if not (root / "manifest.jsonl").exists():
            continue
        rows = [json.loads(l) for l in open(root / "manifest.jsonl")]
        if args.limit:
            rows = rows[: args.limit]
        for r in rows:
            jobs.append({"group": root.name, "path": root / r["path"],
                         "language": r["language"], "text": r["target_text"],
                         "item_id": r.get("item_id")})
    broot = Path(args.bonafide)
    brows = [json.loads(l) for l in open(broot / "references.jsonl")]
    if args.limit:
        brows = brows[: args.limit]
    for r in brows:
        jobs.append({"group": "bonafide", "path": broot / r["ref_path"],
                     "language": r["language"], "text": r["transcript"],
                     "item_id": r["ref_id"]})

    # Stratified subsample. Whisper-large-v3-turbo pads every clip to 30 s and this GPU
    # has no tensor cores, so all 1200 would take ~5 hours. The verdict reads medians per
    # (group, language), and sampling evenly across those cells keeps every median honest
    # while cutting the work. Taking the first N per manifest instead would have been
    # language-biased, because the items are ordered by language.
    if args.per_cell:
        rng = random.Random(args.seed)
        cells: dict = {}
        for j in jobs:
            cells.setdefault((j["group"], j["language"]), []).append(j)
        jobs = []
        for k in sorted(cells):
            g = cells[k]
            rng.shuffle(g)
            jobs += g[: args.per_cell]
        print(f"stratified: {args.per_cell} per (group,language) -> {len(jobs)} clips",
              flush=True)

    results = []
    for n, j in enumerate(jobs, 1):
        if not j["path"].exists():
            continue
        try:
            wav, sr = torchaudio.load(str(j["path"]))
            wav = torch.mean(wav, dim=0, keepdim=True)
            if sr != 16_000:
                wav = torchaudio.transforms.Resample(sr, 16_000)(wav)
            hyp = transcribe(wav, LANG_ID[j["language"]])
            results.append({**{k: v for k, v in j.items() if k != "path"},
                            "hyp": str(hyp), "cer": cer(j["text"], str(hyp))})
        except Exception as exc:
            results.append({**{k: v for k, v in j.items() if k != "path"},
                            "hyp": None, "cer": float("nan"),
                            "error": f"{type(exc).__name__}: {exc}"})
            if sum(1 for r in results if r.get("error")) <= 2:
                print(f"  ASR FAIL {j['item_id']}: {exc}", flush=True)
        if n % 50 == 0:
            print(f"  [{n}/{len(jobs)}]", flush=True)

    print("\n" + "=" * 78)
    print("CER vs the text the clip was told to say   (lower is better)")
    print("=" * 78)
    groups = sorted({r["group"] for r in results})
    langs = sorted({r["language"] for r in results})
    print(f"{'group':14s} " + "  ".join(f"{l:>12s}" for l in langs) + f" {'overall':>12s}")
    table = {}
    for g in groups:
        row = []
        for l in langs:
            v = [r["cer"] for r in results
                 if r["group"] == g and r["language"] == l and not np.isnan(r["cer"])]
            row.append(float(np.median(v)) if v else float("nan"))
        allv = [r["cer"] for r in results if r["group"] == g and not np.isnan(r["cer"])]
        table[g] = {"per_language": dict(zip(langs, row)),
                    "overall": float(np.median(allv)) if allv else float("nan")}
        print(f"{g:14s} " + "  ".join(f"{100*v:11.1f}%" for v in row)
              + f" {100*table[g]['overall']:11.1f}%")

    print("\n" + "=" * 78)
    print("EXCESS CER over genuine speech in the SAME language  (this is the verdict)")
    print("=" * 78)
    base = table.get("bonafide", {}).get("per_language", {})
    verdicts = {}
    print(f"{'group':14s} " + "  ".join(f"{l:>12s}" for l in langs) + "   verdict")
    for g in groups:
        if g == "bonafide":
            continue
        row, worst = [], 0.0
        for l in langs:
            d = table[g]["per_language"].get(l, float("nan")) - base.get(l, float("nan"))
            row.append(d)
            if not np.isnan(d):
                worst = max(worst, d)
        v = ("GOOD" if worst <= 0.10 else "USABLE WITH FILTERING" if worst <= 0.25
             else "POOR" if worst <= 0.40 else "REJECT")
        verdicts[g] = {"worst_excess_cer": worst, "verdict": v,
                       "per_language_excess": dict(zip(langs, row))}
        print(f"{g:14s} " + "  ".join(f"{100*d:+11.1f}%" for d in row) + f"   {v}")

    print("\nper-language verdicts (a generator can be good in one language and not another):")
    for g, info in verdicts.items():
        for l, d in info["per_language_excess"].items():
            if np.isnan(d):
                continue
            v = ("GOOD" if d <= 0.10 else "USABLE" if d <= 0.25
                 else "POOR" if d <= 0.40 else "REJECT")
            print(f"    {g:12s} {l:11s} {100*d:+7.1f}%  {v}")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump({"asr": args.asr, "decoding": args.decoding, "median_cer": table,
               "verdicts": verdicts, "per_clip": results}, open(args.out, "w"),
              indent=2, ensure_ascii=False)
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
