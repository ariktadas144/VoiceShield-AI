# Foundation: how the Indic adaptation rests on the ASVspoof baseline

> This was the project README through the v0/v1 phase. It documents the starting point —
> that VoiceShield is the official ASVspoof 2021 RawNet2 baseline, that the pretrained
> weights transfer numerically exactly, and why 16 kHz is mandatory. All of that still
> holds and is still load-bearing.
>
> It predates the SPRING_F5, IndicVoices and ASDG work. For current status, models and
> usage see the top-level [README](../README.md); for the experiment history see
> `SPOOF_GENERATION_PILOT.md`, `F5_EXTERNAL_BONAFIDE_REGRESSION.md` and
> `ASDG_EXPERIMENT.md`.


Fork of [`Mrkomiljon/voiceshield`](https://github.com/Mrkomiljon/voiceshield) (`88c0f44`),
adapted to run on Indic-language speech. The original upstream README is preserved as
`README.upstream.md`.

**Scope:** make the existing RawNet2 detector work correctly and reproducibly on Indic
speech. Not a streaming service, benchmark platform, or production system.

---

## What the adaptation rests on

**VoiceShield is the official ASVspoof 2021 RawNet2 baseline with a second head bolted
on.** Diffed against `asvspoof-challenge/2021` `LA/Baseline-RawNet2/model.py`, the only
differences are the author comment, `SincConv(sample_rate=16000 -> 24000)`, the head
rename plus an added 7-class LibriSeVoc head, and a tuple return. SincConv,
`Residual_block`, all six blocks, the attention FCs and the GRU are byte-identical.

So the official pretrained weights transfer, and `tests/test_equivalence.py` proves the
adapted model is not merely loadable but **numerically identical** to the official one:

| | |
|---|---|
| Tensors matched | **119 / 123**, 0 unexpected |
| Parameters restored | **17,623,671 / 18,680,446 = 94.3 %** |
| Uninitialised | only the LibriSeVoc 7-class head, which the Indic path disables |
| Logit agreement | `torch.equal == True` on all probe signals (max abs Δ **0.000e+00**) |

The two-key rename (`fc1_gru -> fc1_binary_gru`, `fc2_gru -> fc2_binary_gru`) plus
`sample_rate: 16000` is the entire adaptation.

### 16 kHz is required, not preferred

`SincConv` has **zero learnable parameters** — its filter bank is recomputed from
`sample_rate` on every forward and is **not stored in the checkpoint**. The official
weights were trained against a 16 kHz bank. Loading them into a model built at this
fork's old 24000 default raises no error; it just feeds trained weights a filter bank
they have never seen. `weights/load_pretrained.py` asserts the rate rather than
trusting the caller.

---

## Quickstart

```bash
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements.txt
source .venv/bin/activate

# 1. Verify the pretrained weights (expects 119/123, 0 unexpected)
python weights/load_pretrained.py

# 2. Prove the adaptation is numerically exact
pytest tests/ -v

# 3. Build Indic manifests. --streaming avoids the full ~19 GB download.
python data/build_indic.py --streaming --limit 2000 --report-shortcut   # quick
python data/build_indic.py --report-shortcut                            # full

# 4. Fine-tune from the official weights
python main.py --manifests data/indic --init pretrained --batch_size 32

# 5. Per-language evaluation
python benchmark/evaluate.py --split test --compare-unnormalized --out results.json

# 6. Score one file
python eval.py --input_path clip.wav --lang Hindi
```

The checkpoint is not committed (70.5 MB). Download it from
`https://www.asvspoof.org/asvspoof2021/pre_trained_DF_RawNet2.zip` into `weights/`;
`weights/PROVENANCE.md` records the SHA-256, which the loader verifies.

---

## Data

[`SherryT997/IndicTTS-Deepfake-Challenge-Data`](https://huggingface.co/datasets/SherryT997/IndicTTS-Deepfake-Challenge-Data),
revision `57347517658ae989597d8cef303cffb647ed2434`, **CC-BY-4.0**, 31,102 labelled
train rows across 16 Indian languages.

Two properties were measured rather than read off the card, and both changed the
pipeline:

**The audio is not 16 kHz.** The HF feature declares `Audio(sampling_rate=16000)`, but
all 360 files sampled from the served assets decode at **44,100 Hz**. `datasets`
resamples on access; the files do not. The builder casts explicitly and asserts.

**There is a loudness shortcut.** Measured over 360 clips, 9 languages, balanced:

| | median duration | median RMS | median peak |
|---|---|---|---|
| REAL (`is_tts=0`) | 5.35 s | **−23.45 dB** | **0.501** |
| FAKE (`is_tts=1`) | 5.41 s | **−28.00 dB** | **0.313** |

Single-feature AUC: **peak 0.227**, **RMS 0.268**, duration 0.499, ZCR 0.462. Real audio
sits ~4.5 dB louder, so peak amplitude alone separates the classes at ≈0.77 AUC with no
synthesis modelling at all.

Per-utterance peak normalisation (on by default) denies the model that cue. It is
applied in `audio_utils` at load time, **not** baked into the stored files, so training
and inference share one transform and `--no-normalise` genuinely toggles it at both
ends. On a 400-clip streamed sample `--report-shortcut` measured peak AUC **0.086 raw →
0.544 after normalisation**, and `benchmark/evaluate.py --compare-unnormalized` showed
**EER 36.08 % normalised vs 29.52 % un-normalised** — the un-normalised figure looks
better precisely because it is partly reading loudness rather than synthesis. Reporting
the pair keeps that visible instead of letting it hide inside a headline number.

### What this data cannot support

There is **no speaker field and no generator field**. `id` is
`LANG_GENDER_CATEGORY_INDEX` with a scheme that differs per language
(`ASM_F_ANGER_00342`, `te_f_books_…`, `gujaratifemale_…`), too irregular to parse a
speaker from. So **speaker-disjoint and generator-disjoint splits are impossible**, and
no claim of unseen-speaker or unseen-generator generalisation may be made from it. What
is enforced: **language-stratified**, **text-disjoint**, duration-filtered splits.

The official test split carries `is_tts = -1` on every row — labels are withheld for the
challenge — so it cannot serve as a held-out set. It is left untouched and our
train/dev/test is cut from the labelled train partition.

---

## Upstream bugs: fixed, worked around, and deliberately left alone

| Item | Action |
|---|---|
| `load_data()` ignored its `split` argument and globbed everything — train/dev/test were the same list | **Fixed** (manifest-driven) |
| `main.py` fed hand-crafted features to a raw-waveform model while `eval.py` fed raw audio | **Fixed** — both now import `audio_utils` |
| `criterion()` called on the `(binary, multi)` tuple | **Fixed** |
| `requirements.txt` UTF-16 (`pip install -r` fails), pinned `torch==2.0.1` | **Fixed** |
| `eval.py`'s `if (i+1) == range(...)` — int vs range, never true, dropped the final segment | **Fixed** |
| `RawNet.__init__` mutates the caller's config dict | **Worked around** with `copy.deepcopy` |
| `Residual_block.forward` discards its pre-activation (`out = self.conv1(x)`) | **Left alone** |

The last two are **verbatim upstream in the official ASVspoof baseline**, not fork
defects. The config mutation is handled at call sites rather than by patching
`model.py`. The dead pre-activation is left exactly as-is: it is what the pretrained
checkpoint was trained with, so "fixing" it would break weight compatibility and void
comparability with published RawNet2 numbers.

---

## Claims

**Supported:** VoiceShield's existing RawNet2 detector was adapted and evaluated on
multilingual Indic speech using an official pretrained anti-spoofing initialisation and
a reproducible Indic real/fake dataset; bit-exact equivalence to the official baseline;
per-language EER with bootstrap CIs; the measured loudness shortcut and its mitigation.

**Not supported:** unseen-speaker generalisation · unseen-generator generalisation ·
production readiness · government deployment clearance · "Indic-aware architecture"
(the architecture is unchanged — the *data* is Indic) · any claim about which TTS
systems produced the synthetic side, which the dataset does not document.

---

## Layout

```
model.py                  RawNet2 — architecture untouched; only SincConv's sample_rate
                          became configurable
audio_utils.py            the one front end, imported by training AND inference
metrics.py                EER, DET, operating-point rates, bootstrap CIs
weights/load_pretrained.py  two-key rename + strict load checks + rate assertion
data/build_indic.py       manifests: resample, normalise, stratify, text-disjoint split
main.py                   fine-tuning; checkpoint selected on dev EER
benchmark/evaluate.py     per-language EER / FPR / FNR with CIs, dev-fitted threshold
eval.py                   single-file scoring, both backends
tests/                    equivalence + front-end regression tests
```
