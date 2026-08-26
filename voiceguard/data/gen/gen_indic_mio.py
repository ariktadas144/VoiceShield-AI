"""Generator B -- SPRINGLab/Indic-Mio (AR LM over MioCodec tokens, Apache-2.0).

Consumes the same data/pilot_refs/pilot_items.jsonl as Generator A, so both see identical
references, texts and item ids.

HOW IT WORKS. The LM is a ChatML causal model whose vocabulary embeds 12,800 speech
tokens at offset 151,669. It emits *content* tokens only -- no speaker information. Voice
identity enters at decode time: MioCodec encodes the reference clip into a global
embedding, and decode() combines that embedding with the LM's content tokens. So the
reference conditions the codec, not the prompt.

THREE DEVIATIONS FROM THE MODEL CARD, each deliberate:

  1. The card writes the output at 44100 Hz while loading a codec named
     MioCodec-25Hz-*24kHz*. Writing 24 kHz samples at 44.1 kHz plays them ~1.84x fast
     and shifts every formant up. The rate is read from codec.config.sample_rate and
     asserted instead.

  2. The card calls generate(temperature=..., top_p=...) without do_sample=True.
     transformers ignores both under the default greedy path, and greedy decoding of an
     AR codec LM tends to loop or collapse. do_sample=True is passed explicitly.

  3. The card's dtype is bfloat16. This GPU is Turing (GTX 1650), which has no bf16
     hardware. float16 is used instead and the output is checked for non-finite values.

MioTTS's own normalize_text() is NOT applied: it is written for Japanese and strips ASCII
spaces, which would destroy word boundaries in every language in this pilot.
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

GENERATOR = "indic_mio"
SPEECH_OFFSET = 151_669       # model card
SPEECH_VOCAB = 12_800         # MioCodec codebook size
MAX_REF_SECONDS = 20.0        # MioTTS-Inference default


def item_seed(item_id: str, base: int) -> int:
    return int.from_bytes(hashlib.sha256(f"{base}:{item_id}".encode()).digest()[:4], "big")


def reseed(seed: int) -> None:
    random.seed(seed); np.random.seed(seed)
    torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--items", default="data/pilot_refs/pilot_items.jsonl")
    ap.add_argument("--refs-root", default="data/pilot_refs")
    ap.add_argument("--model", default="generators/indic_mio")
    ap.add_argument("--codec", default="generators/miocodec")
    ap.add_argument("--out", default="data/pilot_spoof/indic_mio")
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--temperature", type=float, default=0.9)   # card value
    ap.add_argument("--top-p", type=float, default=0.9)         # card value
    ap.add_argument("--max-new-tokens", type=int, default=1024) # card value
    ap.add_argument("--dtype", default="float16", choices=["float16", "float32", "bfloat16"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--languages", default="")
    args = ap.parse_args()

    out = Path(args.out); (out / "audio").mkdir(parents=True, exist_ok=True)
    items = [json.loads(l) for l in open(args.items)]
    if args.languages:
        want = {s.strip() for s in args.languages.split(",")}
        items = [i for i in items if i["language"] in want]
    if args.limit:
        by_lang: dict = {}
        for i in items:
            by_lang.setdefault(i["language"], []).append(i)
        per = max(1, args.limit // max(1, len(by_lang)))
        items = [i for g in by_lang.values() for i in g[:per]]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from miocodec import MioCodecModel
    from miocodec.util import load_audio

    print(f"loading LM {args.model} ({args.dtype}) ...", flush=True)
    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    lm = AutoModelForCausalLM.from_pretrained(
        args.model, dtype=getattr(torch, args.dtype)).to(device).eval()

    # MioCodecModel, not MioCodec. The MioCodec pipeline class bundles codec + external
    # vocoder and refuses to load without weights prefixed "vocoder."; the 24 kHz variant
    # has an integrated iSTFTHead and ships none, so that class raises here. The card for
    # this codec uses MioCodecModel directly, which is the supported path.
    print(f"loading codec {args.codec} ...", flush=True)
    cfg_p = Path(args.codec) / "config.yaml"
    w_p = Path(args.codec) / "model.safetensors"
    codec = MioCodecModel.from_pretrained(
        config_path=str(cfg_p), weights_path=str(w_p)).to(device).eval()

    # from_pretrained loads with strict=False, so a renamed or absent tensor would leave
    # part of the codec randomly initialised and produce quietly bad audio. Check -- but
    # check the right thing.
    #
    # 203 of the 523 tensors are legitimately absent from the file. MioCodecModel's own
    # weights_to_save() drops ssl_feature_extractor, feature_decoder and conv_upsample as
    # "not needed for inference": the SSL encoder is WavLM-base+, fetched separately from
    # the torch hub, and the other two belong to the training-time content path. One more
    # is istft_head.istft.window, a computed buffer. Comparing raw key sets therefore
    # reports a 203-tensor catastrophe on a perfectly good checkpoint. Only learned
    # parameters outside the library's own exclusion list count.
    from safetensors.torch import load_file
    sd = load_file(str(w_p), device="cpu")
    EXCLUDED = ("ssl_feature_extractor", "feature_decoder", "conv_upsample")
    params = {k for k, _ in codec.named_parameters()}
    missing = sorted(k for k in params - set(sd) if not k.startswith(EXCLUDED))
    unexpected = sorted(set(sd) - set(codec.state_dict()))
    print(f"  codec weights: {len(sd)} in file; inference params missing="
          f"{len(missing)} unexpected={len(unexpected)}", flush=True)
    for k in missing[:8]:
        print(f"    MISSING {k}", flush=True)
    if missing or unexpected:
        raise RuntimeError(f"codec checkpoint does not match the model: "
                           f"{len(missing)} missing, {len(unexpected)} unexpected")
    for pre in ("wave_prenet", "wave_conv_upsample", "wave_post_net", "istft_head"):
        n = sum(1 for k in sd if k.startswith(pre))
        print(f"    wave path {pre:20s} {n:3d} tensors", flush=True)
        if n == 0:
            raise RuntimeError(f"decode path module '{pre}' has no weights")

    sr = int(codec.config.sample_rate)
    print(f"codec sample_rate = {sr} Hz  (the Indic-Mio card's 44100 is wrong)", flush=True)
    assert sr == 24_000, f"expected 24000 Hz for MioCodec-25Hz-24kHz, got {sr}"

    manifest = out / "manifest.jsonl"
    done = set()
    if manifest.exists():
        for line in open(manifest):
            try: done.add(json.loads(line)["item_id"])
            except Exception: pass
        print(f"resuming: {len(done)} already generated", flush=True)

    fh = open(manifest, "a")
    ok = fail = empty = 0
    t0 = time.time()
    for n, it in enumerate(items, 1):
        if it["item_id"] in done:
            continue
        seed = item_seed(it["item_id"], args.seed)
        reseed(seed)
        dst = out / "audio" / f"{GENERATOR}_{it['item_id']}.wav"
        try:
            prompt = tok.apply_chat_template(
                [{"role": "user", "content": it["target_text"]}],
                tokenize=False, add_generation_prompt=True)
            enc = tok(prompt, return_tensors="pt").to(device)
            with torch.no_grad():
                gen = lm.generate(**enc, max_new_tokens=args.max_new_tokens,
                                  do_sample=True, temperature=args.temperature,
                                  top_p=args.top_p,
                                  pad_token_id=tok.pad_token_id or tok.eos_token_id)
            new = gen[0][enc["input_ids"].shape[1]:]
            codes = [int(t) - SPEECH_OFFSET for t in new
                     if SPEECH_OFFSET <= int(t) < SPEECH_OFFSET + SPEECH_VOCAB]
            if len(codes) < 10:
                empty += 1
                raise ValueError(f"LM emitted {len(codes)} speech tokens")

            ref = load_audio(str(Path(args.refs_root) / it["ref_path"]), sample_rate=sr)
            ref = ref.to(device=device, dtype=torch.float32)
            ref = ref[..., : int(MAX_REF_SECONDS * sr)]

            with torch.no_grad():
                g = codec.encode(ref, return_content=False,
                                 return_global=True).global_embedding
                wav = codec.decode(
                    global_embedding=g,
                    content_token_indices=torch.tensor(codes, dtype=torch.long,
                                                       device=device),
                )
            y = np.ascontiguousarray(wav.squeeze().float().cpu().numpy().astype(np.float32))
            if y.ndim > 1:
                y = y.mean(axis=0)
            if y.size == 0 or not np.isfinite(y).all():
                raise ValueError(f"bad audio: size={y.size} finite={np.isfinite(y).all()}")
            # Scale down rather than let PCM_16 hard-clip. Some outputs exceed full
            # scale, and clipping a waveform adds broadband harmonic distortion that
            # survives the detector's loudness normalisation -- it would become a
            # synthetic-only artefact created by this script, not by the generator.
            # A scalar gain does not: VoiceGuard peak-normalises at load anyway, so
            # scaling is invisible downstream while clipping is not.
            peak = float(np.max(np.abs(y)))
            scaled = peak > 0.999
            if scaled:
                y = (y * (0.999 / peak)).astype(np.float32)
            sf.write(dst, y, sr, subtype="PCM_16")
            rec = {
                "item_id": it["item_id"], "generator": GENERATOR,
                "path": f"audio/{dst.name}",
                "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
                "language": it["language"], "ref_id": it["ref_id"],
                "ref_speaker": it["ref_speaker"], "ref_gender": it["ref_gender"],
                "target_text": it["target_text"], "target_text_from": it["target_text_from"],
                "sample_rate": sr, "duration_s": round(len(y) / sr, 3),
                "n_speech_tokens": len(codes), "seed": seed, "peak_scaled": scaled,
                "peak_before_scaling": round(peak, 5),
                "temperature": args.temperature, "top_p": args.top_p,
                "dtype": args.dtype, "label": 1,
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
            print(f"  [{n}/{len(items)}] ok={ok} fail={fail} (empty={empty}) "
                  f"{el:.0f}s ({el/max(1,ok):.1f}s/clip)", flush=True)
    fh.close()
    print(f"\n{GENERATOR}: {ok} generated, {fail} failed ({empty} token-empty) -> {out}")
    sys.stdout.flush()
    os._exit(0 if ok else 1)


if __name__ == "__main__":
    main()
