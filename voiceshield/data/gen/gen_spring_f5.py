"""Generator A -- SPRINGLab/SPRING_F5 (F5-TTS flow-matching DiT, Apache-2.0).

Reads data/pilot_refs/pilot_items.jsonl and synthesises each item. Nothing about the
item selection lives here: the reference, the target text and the item id are all fixed
upstream so that Generator B receives byte-identical inputs.

Reproducibility. F5-TTS integrates an ODE from a Gaussian sample, so the output depends
on the RNG state. torch/numpy/random are reseeded per item with a seed derived from the
item id, which makes any single clip regenerable on its own without replaying the whole
run.

Output rate. Taken from the model's own config (mel_spec.target_sample_rate = 24000)
and asserted, rather than copied from the card.

WHY THIS DOES NOT USE AutoModel. The card documents

    AutoModel.from_pretrained("SPRINGLab/SPRING_F5", trust_remote_code=True)

and config.json maps AutoModel -> "model.SPRING_F5Model". There is no model.py at the
repo root -- revision 898dd2a5 contains exactly README.md, config.json and .gitattributes
there -- so that call cannot resolve and the documented usage is broken. The repo does
ship the complete F5-TTS source under f5_tts/, so this loads the checkpoint through the
upstream F5TTS API instead, with the config and vocab the repo provides.

Two consequences of bypassing the missing wrapper, both recorded rather than hidden:
  * f5_tts/ ships without __init__.py, so it imports as a namespace package and
    importlib.resources cannot find configs/. The markers are created at setup time.
  * the wrapper held the lang= number-to-Indic-words conversion. Digits appear in 2 of
    400 pilot texts (both Hindi), and Generator B has no such conversion either, so both
    generators see identical text and the comparison stays controlled.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

GENERATOR = "spring_f5"
EXPECTED_SR = 24_000


def item_seed(item_id: str, base: int) -> int:
    h = hashlib.sha256(f"{base}:{item_id}".encode()).digest()
    return int.from_bytes(h[:4], "big")


def reseed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def to_float32(audio) -> np.ndarray:
    a = np.asarray(audio)
    if a.dtype == np.int16:
        a = a.astype(np.float32) / 32768.0
    a = a.astype(np.float32, copy=False)
    if a.ndim > 1:
        a = a.reshape(a.shape[0], -1).mean(axis=1) if a.shape[0] > a.shape[-1] else a.mean(axis=0)
    return np.ascontiguousarray(a)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--items", default="data/pilot_refs/pilot_items.jsonl")
    ap.add_argument("--refs-root", default="data/pilot_refs")
    ap.add_argument("--model", default="generators/spring_f5")
    ap.add_argument("--out", default="data/pilot_spoof/spring_f5")
    ap.add_argument("--ckpt", default="", help="override; defaults to the slim EMA export")
    ap.add_argument("--f5-config", default="F5TTS_v1_Base_multilingual",
                    help="the only config shipped in the repo")
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--limit", type=int, default=0, help="0 = all; smoke-test with a few")
    ap.add_argument("--languages", default="", help="comma-separated subset")
    args = ap.parse_args()

    out = Path(args.out); (out / "audio").mkdir(parents=True, exist_ok=True)
    items = [json.loads(l) for l in open(args.items)]
    if args.languages:
        want = {s.strip() for s in args.languages.split(",")}
        items = [i for i in items if i["language"] in want]
    if args.limit:
        # take from every language, not just the first one in file order
        by_lang: dict = {}
        for i in items:
            by_lang.setdefault(i["language"], []).append(i)
        per = max(1, args.limit // max(1, len(by_lang)))
        items = [i for g in by_lang.values() for i in g[:per]]

    print(f"loading {args.model} ...", flush=True)
    sys.path.insert(0, str(Path(args.model).resolve()))
    from f5_tts.api import F5TTS
    import yaml
    cfg = json.load(open(Path(args.model) / "config.json"))
    # Prefer the slim EMA export. utils_infer.load_checkpoint does
    # torch.load(map_location=device), so handing it the published 5.4 GB checkpoint
    # puts model + EMA + Adam moments on a 3.64 GiB card and OOMs before the first
    # sample. The safetensors path loads only the 1.26 GiB of weights inference uses.
    ckpt = Path(args.ckpt) if args.ckpt else Path(args.model) / cfg["ckpt_path"]
    slim = Path(args.model) / "checkpoints" / "model_170000_ema.safetensors"
    if not args.ckpt and slim.exists():
        ckpt = slim
    print(f"  checkpoint: {ckpt.name} ({ckpt.stat().st_size/2**30:.2f} GiB)", flush=True)
    tts = F5TTS(
        model=args.f5_config,
        ckpt_file=str(ckpt),
        vocab_file=str(Path(args.model) / cfg["vocab_path"]),
        device="cuda" if torch.cuda.is_available() else "cpu",
    )
    sr_model = int(tts.target_sample_rate)
    assert sr_model == EXPECTED_SR, f"model reports {sr_model} Hz, expected {EXPECTED_SR}"
    print(f"loaded  target_sample_rate={sr_model}", flush=True)

    manifest = out / "manifest.jsonl"
    done = set()
    if manifest.exists():
        for line in open(manifest):
            try:
                done.add(json.loads(line)["item_id"])
            except Exception:
                pass
        print(f"resuming: {len(done)} already generated", flush=True)

    fh = open(manifest, "a")
    ok = fail = 0
    t0 = time.time()
    for n, it in enumerate(items, 1):
        if it["item_id"] in done:
            continue
        seed = item_seed(it["item_id"], args.seed)
        reseed(seed)
        dst = out / "audio" / f"{GENERATOR}_{it['item_id']}.wav"
        try:
            with torch.no_grad():
                audio, sr_out, _ = tts.infer(
                    ref_file=str(Path(args.refs_root) / it["ref_path"]),
                    ref_text=it["ref_text"],
                    gen_text=it["target_text"],
                    seed=seed,
                    remove_silence=False,
                    show_info=lambda *a, **k: None,
                    progress=None,
                )
            assert int(sr_out) == EXPECTED_SR, f"got {sr_out} Hz"
            y = to_float32(audio)
            if y.size == 0 or not np.isfinite(y).all():
                raise ValueError(f"bad audio: size={y.size} finite={np.isfinite(y).all()}")
            # Scale down rather than let PCM_16 hard-clip. Some outputs exceed full
            # scale, and clipping a waveform adds broadband harmonic distortion that
            # survives the detector's loudness normalisation -- it would become a
            # synthetic-only artefact created by this script, not by the generator.
            # A scalar gain does not: VoiceShield peak-normalises at load anyway, so
            # scaling is invisible downstream while clipping is not.
            peak = float(np.max(np.abs(y)))
            scaled = peak > 0.999
            if scaled:
                y = (y * (0.999 / peak)).astype(np.float32)
            sf.write(dst, y, EXPECTED_SR, subtype="PCM_16")
            rec = {
                "item_id": it["item_id"], "generator": GENERATOR,
                "path": f"audio/{dst.name}",
                "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
                "language": it["language"], "ref_id": it["ref_id"],
                "ref_speaker": it["ref_speaker"], "ref_gender": it["ref_gender"],
                "target_text": it["target_text"], "target_text_from": it["target_text_from"],
                "sample_rate": EXPECTED_SR, "duration_s": round(len(y) / EXPECTED_SR, 3),
                "seed": seed, "peak_scaled": scaled,
                "peak_before_scaling": round(peak, 5), "label": 1,
            }
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n"); fh.flush()
            ok += 1
        except Exception as exc:
            fail += 1
            print(f"  FAIL {it['item_id']}: {type(exc).__name__}: {exc}", flush=True)
            if fail <= 2:
                traceback.print_exc()
            if fail >= 12 and ok == 0:
                print("aborting: first 12 items all failed", flush=True)
                break
        if n % 10 == 0 or n == len(items):
            el = time.time() - t0
            print(f"  [{n}/{len(items)}] ok={ok} fail={fail} {el:.0f}s "
                  f"({el/max(1,ok):.1f}s/clip)", flush=True)
    fh.close()
    print(f"\n{GENERATOR}: {ok} generated, {fail} failed -> {out}")
    sys.stdout.flush()
    os._exit(0 if ok else 1)


if __name__ == "__main__":
    main()
