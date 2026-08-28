# VoiceShield — Indic speech deepfake detection

A RawNet2 detector for distinguishing genuine human speech from synthetic speech in
**Hindi, Tamil, Telugu, Malayalam and English**.

Fork of [`Mrkomiljon/voiceshield`](https://github.com/Mrkomiljon/voiceshield) (`88c0f44`),
which is itself the official ASVspoof 2021 RawNet2 baseline with a second head added. The
architecture is unchanged — the work here is data, training distribution and evaluation.

---

## Quickstart

```bash
git clone git@github.com:ariktadas144/VoiceShield-AI.git
cd VoiceShield-AI && git checkout feat/voiceshield-indic-adaptation
cd voiceshield

python3.11 -m venv .venv                       # 3.14 has no wheels for these pins
.venv/bin/pip install -r requirements.lock.txt

.venv/bin/python detect.py --backend voiceshield --audio yourclip.wav
```

```
P(fake)         : 0.000002
P(real)         : 0.999998
threshold       : 0.331564
verdict         : BONAFIDE
latency         : 189.4 ms
```

Defaults to **iv15**, the best all-round model. Checkpoints are self-contained — each
carries its own config, dev-fitted threshold, class index and audio contract — so no
external files are needed to score audio.

```bash
# a specific model
.venv/bin/python detect.py --backend voiceshield \
    --checkpoint checkpoints_f5_trimmed/best_model.pth --audio clip.wav

# machine-readable, with per-window detail
.venv/bin/python eval.py --model_path checkpoints_f5_iv15/best_model.pth \
    --input_path clip.wav --lang Tamil --json

# the alternative pretrained backend (see docs/DETECTOR_BACKENDS.md)
.venv/bin/python detect.py --backend dhwani --audio clip.wav
```

The audio contract (16 kHz, peak normalisation, silence trimming) is read **from the
checkpoint**, not assumed. Scoring a trimmed-audio model on untrimmed audio silently costs
11.5 points of detection, so the code refuses to guess.

---

## Models

Five checkpoints ship with the repo. All were evaluated on the same held-out benchmark.

| model | A | B | C | D | FLEURS FPR | role |
|---|---|---|---|---|---|---|
| `frozen/voiceshield-indic-v0.1` | — | — | — | — | — | first frozen adaptation |
| `checkpoints_v1` | 1.68 | 26.14 | 10.61 | 49.75 / 0.478 | 26.2 % | safe baseline |
| `checkpoints_f5_trimmed` | 2.02 | **17.97** | 14.39 | 47.12 / 0.523 | 40.0 % | best unseen-spoof |
| **`checkpoints_f5_iv15`** | **1.68** | 25.49 | 9.76 | 47.38 / 0.533 | 16.2 % | **best all-round — default** |
| `checkpoints_asdg_bal` | 1.68 | 30.97 | **7.48** | 44.12 / 0.576 | **13.0 %** | best external-bonafide |

EER %, lower is better. D also shows ROC-AUC.

### What A/B/C/D mean

The 2×2 matrix crosses *where the genuine speech came from* with *which generator made the
spoof*, because a single pooled number hides which half is failing.

| cell | genuine speech | spoof | question |
|---|---|---|---|
| **A** | internal | internal | in-domain accuracy |
| **B** | internal | **unseen generators** | does it catch attacks it never trained on? |
| **C** | **unseen corpus** | internal | does it trust real speakers it never heard? |
| **D** | **unseen corpus** | **unseen generators** | both at once — the realistic case |

### Per-generator detection

XTTS-v2 and FreeVC24 are **never trained on**. SPRING_F5 is in the training distribution;
the figures below are for held-out speakers.

| model | xtts_v2 | freevc24 | SPRING_F5 |
|---|---|---|---|
| v1 | 41.2 % | 13.5 % | 3.2 % |
| f5-trimmed | 47.8 % | 40.0 % | 90.3 % |
| **iv15** | 32.5 % | 13.5 % | 88.5 % |
| asdg-bal | 29.2 % | 15.2 % | 88.9 % |

### Honest status

**No model satisfies every criterion at once.** Seven experiments — four changing the data,
three changing the training objective — all moved along the same trade-off:

```
better unseen-REAL robustness  <-->  better unseen-FAKE detection
```

The diagnosed cause is that unseen genuine speech and unseen generators **overlap
acoustically**: the training population nearest to FLEURS is also the one nearest to
XTTS-v2 and FreeVC24, so claiming that region as "real" fixes false accusations and blinds
the detector in the same act. iv15 is shipped as the default because it is the best
compromise, not because the problem is solved. See `docs/ASDG_EXPERIMENT.md`.

---

## Data

### Training

| corpus | role | licence |
|---|---|---|
| [SherryT997/IndicTTS-Deepfake-Challenge-Data](https://huggingface.co/datasets/SherryT997/IndicTTS-Deepfake-Challenge-Data) | genuine + spoof, 5 languages | CC-BY-4.0 |
| [OpenSLR SLR63/65/66](https://openslr.org) | genuine, ta/te/ml crowdsourced read | CC-BY-SA-4.0 |
| [ai4bharat/IndicVoices](https://huggingface.co/datasets/ai4bharat/IndicVoices) | genuine, spontaneous/conversational | CC-BY-4.0 |
| [SPRINGLab/SPRING_F5](https://huggingface.co/SPRINGLab/SPRING_F5) | spoof generator (F5-TTS flow-matching) | Apache-2.0 |

### Held out — never trained on

| corpus | role | licence |
|---|---|---|
| [google/fleurs](https://huggingface.co/datasets/google/fleurs) | unseen genuine speech | CC-BY-4.0 |
| [vdivyasharma/IndicSynth](https://huggingface.co/datasets/vdivyasharma/IndicSynth) | unseen spoof — XTTS-v2, FreeVC24 | **CC-BY-NC-4.0, evaluation only** |

The 1,800-clip external set is the only unseen benchmark in the project. Every A/B/C/D
number depends on it staying unseen. **Do not train on it.** IndicSynth is
non-commercial-licensed and is used solely as a measuring instrument.

### Evaluated and rejected

| candidate | why rejected |
|---|---|
| SPRINGLab/Indic-Mio (Apache-2.0) | MioCodec spectral signature separable at AUC 0.735 after trimming — a shortcut |
| RawBoost channel augmentation | made external-bonafide false accusations worse (FPR 46.6 %) |
| Mozilla Common Voice (CC0) | access broken — loading-script deprecation, no parquet conversion |
| ai4bharat/Shrutilipi (CC-BY-4.0) | 141 GB for four languages, no speaker IDs |

Also used: [Aratako/MioCodec-25Hz-24kHz](https://huggingface.co/Aratako/MioCodec-25Hz-24kHz)
(MIT) for the rejected Indic-Mio pilot, and
[openai/whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo)
(MIT) as an ASR round-trip quality check.

---

## Layout

```
model.py  audio_utils.py  metrics.py     detector, shared front end, EER/AUC
main.py                                  training
train_asdg.py  train_asdg_balanced.py    domain-adversarial variants
eval.py  detect.py  detectors/           inference; selectable VoiceShield/Dhwani backend
data/build_*.py  data/gen/               dataset construction and spoof generation
benchmark/                               2x2 matrix, shortcut audits, safety, leakage gates
checkpoints_*/  frozen/                  trained models + training curves
data/*/manifest.jsonl                    every clip, with sha256 and generation seed
results/                                 every reported number, as produced
docs/                                    pilots, pre-registrations, diagnoses
```

Audio, generator weights and virtualenvs are **not** in git — see
[`docs/MIGRATION.md`](docs/MIGRATION.md) for sizes, pinned revisions and rebuild commands.
Manifests carry per-clip sha256 and generation seeds, so the audio is reproducible.

---

## Reproducing

```bash
.venv/bin/python weights/load_pretrained.py --ckpt pre_trained_DF_RawNet2.pth  # 119/123
.venv/bin/pytest tests/test_equivalence.py                                     # torch.equal
.venv/bin/python benchmark/mixed_audit.py --trim --manifest data/mixed_f5_iv15/manifest.jsonl
.venv/bin/python benchmark/matrix2x2.py --models iv15=checkpoints_f5_iv15/best_model.pth \
    --internal data/mixed_f5_iv15 --external data/external2
```

Every training run was **pre-registered** before it started — predictions, and what would
falsify them, recorded in `docs/` and committed ahead of the run. Where a prediction was
wrong, the document says so.

---

## What this does and does not support

**Supported.** Per-language EER/AUC with bootstrap CIs on Indic speech; measured behaviour
on two generators never trained on; measured false-accusation rates on a genuine corpus
never trained on; a reproducible pipeline pinned to dataset revisions and checksums.

**Not supported.** Production readiness. Any claim of solving the real/fake trade-off —
it is documented, not solved. Speaker-level claims for Hindi, where the source corpus has
no speaker IDs and splits are clip-disjoint only. Malayalam synthesis quality, which is
unverified because no permissively-licensed ASR available to us transcribes it well enough
to measure (Whisper scores 64.7 % CER on *genuine* Malayalam).

## Further reading

| document | |
|---|---|
| [`ADAPTATION_FOUNDATION.md`](docs/ADAPTATION_FOUNDATION.md) | why the ASVspoof weights transfer exactly; why 16 kHz is mandatory |
| [`SPOOF_GENERATION_PILOT.md`](docs/SPOOF_GENERATION_PILOT.md) | generator selection, shortcut audit, why Indic-Mio was rejected |
| [`F5_EXTERNAL_BONAFIDE_REGRESSION.md`](docs/F5_EXTERNAL_BONAFIDE_REGRESSION.md) | the safety regression, four hypotheses tested and refuted |
| [`ASDG_EXPERIMENT.md`](docs/ASDG_EXPERIMENT.md) | domain-adversarial training; why it failed twice, and differently each time |
| [`DETECTOR_BACKENDS.md`](docs/DETECTOR_BACKENDS.md) | the selectable Dhwani backend |
| [`MIGRATION.md`](docs/MIGRATION.md) | what is not in git, and how to rebuild it |
