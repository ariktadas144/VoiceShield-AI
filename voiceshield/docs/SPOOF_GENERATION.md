# SPOOF_GENERATION.md — selecting independent Indic generators

## Why we are generating at all

IndicSynth's only generators in our four target languages are **XTTS-v2** and
**FreeVC24**, and both are the held-out spoof side of our external evaluation. Training
on either destroys the instrument that told us v2's cell-D gain was a shortcut. Every
ready-made alternative was audited and rejected (see `docs/INDICSYNTH_AUDIT.md`).

So we generate a bounded set ourselves **using existing pretrained generators** — not by
training a TTS model.

## What "independent" has to mean here

The held-out mechanisms are:

| held-out | mechanism |
|---|---|
| XTTS-v2 | autoregressive GPT over VQ tokens → HiFiGAN vocoder |
| FreeVC24 | VITS voice conversion — WavLM content encoder → VITS decoder |

A second checkpoint of either family would not be independent. We need a different
*synthesis mechanism*, not a different checkpoint.

## Candidates

| Generator | Family / mechanism | Hi | Ta | Te | Ml | Size | Licence | Independent of held-out? |
|---|---|:-:|:-:|:-:|:-:|---:|---|---|
| **ai4bharat/IndicF5** | **F5-TTS — flow-matching Diffusion Transformer, non-autoregressive** | ✅ | ✅ | ✅ | ✅ | 1,403 MB | **MIT** | **Strongly** — flow matching is neither AR nor VAE |
| **ai4bharat/indic-parler-tts** | **Parler — autoregressive LM over DAC neural-codec tokens** | ✅ | ✅ | ✅ | ✅ | 3,763 MB | **Apache-2.0** | **Yes** — DAC codec tokens, not VQ+HiFiGAN |
| ai4bharat/vits_rasa_13 | **VITS** — conditional VAE + flows + adversarial | ❌ | ✅ | ✅ | ✅ | 161 MB | CC-BY-4.0 | **Weak — VITS is FreeVC24's own family** |
| facebook/mms-tts-* | VITS | ✅ | ✅ | ✅ | ✅ | ~145 MB | CC-BY-NC-4.0 | **No — already used in v2/v3** |
| SPRINGLab/F5-Hindi | F5-TTS | ✅ | ❌ | ❌ | ❌ | ~1.3 GB | CC-BY-4.0 | Yes, but Hindi only |

The HF language tags for both AI4Bharat models are incomplete; the model cards confirm
all four target languages. IndicF5 lists 11 Indian languages, Indic Parler-TTS lists 21.

## Selection

**Generator A — IndicF5.** The most mechanistically distant option available: flow
matching resembles neither held-out generator. MIT, all four targets, 1.4 GB.

**Generator B — Indic Parler-TTS.** Autoregressive like XTTS-v2, but over DAC neural
codec tokens rather than VQ-VAE + HiFiGAN, so the acoustic path differs. Apache-2.0, all
four targets.

**vits_rasa_13 rejected** despite being the smallest and easiest: VITS is precisely
FreeVC24's architecture family. Using it would weaken the independence claim it exists to
support, and it lacks Hindi.

## Licence classification

| Generator | Licence | Class | Notes |
|---|---|---|---|
| IndicF5 | MIT | **CLEAR** | no output restriction |
| Indic Parler-TTS | Apache-2.0 | **CLEAR** | no output restriction |
| vits_rasa_13 | CC-BY-4.0 | usable with attribution | not selected |

Both selected generators are **more permissive than IndicSynth's CC BY-NC 4.0**. A
checkpoint trained on data we generate with these does not inherit a non-commercial
restriction from the generator — though the reference speech we condition on carries its
own terms (OpenSLR is CC BY-SA 4.0).

## Speaker/reference strategy, and why it removes a shortcut

IndicF5 is reference-conditioned: it needs a prompt clip plus that clip's transcript.
Indic Parler-TTS is **description**-conditioned and needs no reference audio at all.

References will come from **OpenSLR** (139 speakers, CC BY-SA 4.0, transcripts included in
`line_index.tsv`), spread across many speakers per language per generator.

Using OpenSLR speakers — which are already our bonafide Real_B — is deliberate. It puts
the *same voices* on both labels, which makes speaker identity useless as a cue and forces
the detector toward synthesis artefacts. It also mirrors the real threat: attackers clone
real people.

FLEURS and IndicSynth reference audio are **excluded** — both are external test material.

## Hardware

GTX 1650, 3.64 GiB usable.

| | weights | fp32 inference | plan |
|---|---:|---|---|
| IndicF5 | 1.4 GB | ~2–3 GB | fits GPU |
| Indic Parler-TTS | 3.75 GB | **exceeds VRAM** | fp16 (~1.9 GB) or CPU |

Parler at fp32 does not fit and must run in fp16 or on CPU. This is a measured constraint,
not an estimate — the file is 3,763 MB against 3,728 MiB usable.

## Status

Candidate selection only. **Nothing downloaded, nothing generated.** Pilot sizing, the
shortcut audit and the generation run follow once the plan is approved.


---

# REVISED SELECTION — the AI4Bharat pair is gated

Phase 1 re-verification changed the recommendation.

## Gating

| model | gated | our token |
|---|---|---|
| ai4bharat/IndicF5 | **auto** | **HTTP 403** |
| ai4bharat/indic-parler-tts | **auto** | **HTTP 403** |
| ai4bharat/vits_rasa_13 | **auto** | 403 |
| **SPRINGLab/SPRING_F5** | **no** | **HTTP 200** |
| **SPRINGLab/Indic-Mio** | **no** | **HTTP 200** |
| facebook/mms-tts-* | no | 200 (but already used in v2/v3) |

Every AI4Bharat Indic TTS model is gated. The gate is `auto`, so it is a one-click terms
acceptance rather than a review — but it cannot be done programmatically, and nothing can
be downloaded until a human accepts it on each model page.

Two **ungated** alternatives cover all four target languages under Apache-2.0.

## Selected pair (ungated, immediately usable)

### Generator A — `SPRINGLab/SPRING_F5`

| | |
|---|---|
| Family | **F5-TTS — flow-matching Diffusion Transformer**, non-autoregressive |
| Base | SWivid/F5-TTS, fine-tuned for Indic |
| Languages | 24, incl. **Hindi, Tamil, Telugu, Malayalam** |
| Checkpoint | `checkpoints/model_170000.pt`, **5,151 MB** (training checkpoint; model weights are a fraction of it) |
| Licence | **Apache-2.0 — CLEAR** |
| Gated | **no** |
| Reference | prompt audio + transcript (reference-conditioned) |
| Ships | full `f5_tts/` inference code |

### Generator B — `SPRINGLab/Indic-Mio`

| | |
|---|---|
| Family | **autoregressive LM over MioCodec speech tokens** |
| Base | Aratako/MioTTS-0.6B (Apache-2.0) + MioCodec-25Hz-24kHz (MIT), both ungated |
| Languages | 22 scheduled Indian languages + English |
| Checkpoint | **1,161 MB** |
| Licence | **Apache-2.0 — CLEAR** |
| Gated | **no** |
| Reference | zero-shot cloning via codec speaker embeddings |
| Output | 44 kHz, RTF < 0.1 |

## Independence from the held-out generators

| | mechanism | vs XTTS-v2 (AR GPT → VQ → HiFiGAN) | vs FreeVC24 (VITS VC) |
|---|---|---|---|
| SPRING_F5 | flow-matching DiT, non-AR | **different** — neither AR nor VAE | **different** |
| Indic-Mio | AR LM over **MioCodec** tokens | AR is shared, but the codec and vocoder path differ | **different** |

Both are also distinct from **MMS-TTS** (VITS), which we already trained on in v2/v3.

Caveat recorded: both are fine-tuned by the same lab (SPRINGLab). Their **base models and
architectures are unrelated** (SWivid F5-TTS vs Aratako MioTTS/MioCodec), so this is not
architectural lineage — but it is a shared fine-tuning pipeline and shared Indic training
data, which could correlate their artefacts more than two wholly independent labs would.
The Phase 8 shortcut audit will test exactly that.

`ai4bharat/vits_rasa_13` remains rejected: VITS is FreeVC24's own family.

## Storage

| item | size |
|---|---:|
| SPRING_F5 checkpoint | 5.15 GB |
| Indic-Mio + MioCodec | ~1.4 GB |
| `f5-tts` + deps | ~1–2 GB |
| Pilot audio (800 clips, 16 kHz PCM16) | ~0.15 GB |
| **Peak** | **~8 GB** |
| Free now | **96 GB** |
| **Remaining after** | **~88 GB** |

## Pilot

400 clips per generator: **100 per language x 4 languages x 2 generators = 800 clips.**

References from **OpenSLR** (139 speakers, CC BY-SA 4.0, transcripts in `line_index.tsv`),
many speakers per language per generator. FLEURS and IndicSynth are excluded — both are
external test material.

Using OpenSLR speakers deliberately puts the same voices on both labels, making speaker
identity useless as a cue.

## Success criteria for the pilot, fixed in advance

The pilot passes only if:

1. audio is valid — 16 kHz mono after conversion, no clipping, no corruption, correct language;
2. **no generator is trivially separable** from bonafide by RMS / peak / crest / HF share /
   noise floor / duration / silence alone — the v2 failure was peak AUC 0.924 and HF share
   0.000, so anything approaching that is a rejection;
3. the low-pass probe shows no new "bandlimited = fake" association;
4. transcripts match the audio on inspection.

If a generator fails 2 or 3, it is not scaled up. Generation parameters and loudness
normalisation are investigated first; if the artefact is irreducible, the generator is
rejected and another is sought.
