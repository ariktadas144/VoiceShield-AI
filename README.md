# VoiceShield AI

Voice deepfake detection for Indic languages and live calls. Two detection lines live in
this repo: an **Indic detector** (`voiceshield/`) trained and evaluated on Hindi, Tamil,
Telugu, Malayalam and English, and a **call-oriented ASVspoof pipeline** (`ml/`) with a
FastAPI service and React UI.

---

## Quickstart — score a file with the Indic detector

```bash
git clone git@github.com:ariktadas144/VoiceShield-AI.git
cd VoiceShield-AI && git checkout feat/indic-detection
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
latency         : 185 ms
```

Defaults to **iv15**, the current best model. Checkpoints are self-contained — each carries
its own config, dev-fitted threshold, class index and audio contract — so nothing external
is needed to score audio.

```bash
# a specific model, or machine-readable output
.venv/bin/python detect.py --backend voiceshield \
    --checkpoint checkpoints_f5_trimmed/best_model.pth --audio clip.wav
.venv/bin/python eval.py --model_path checkpoints_f5_iv15/best_model.pth \
    --input_path clip.wav --lang Tamil --json
```

The audio contract (16 kHz, peak normalisation, silence trimming) is read **from the
checkpoint**, never assumed. Scoring a trimmed-audio model on untrimmed audio silently
costs 11.5 points of detection, so the code refuses to guess.

## Quickstart — run the call service

```bash
uv venv --python 3.11 .venv
uv pip install --python .venv --index-url https://download.pytorch.org/whl/cu126 \
    -r ml/requirements-torch.txt
uv pip install --python .venv -r ml/requirements.txt

PYTHONPATH=. .venv/bin/python -m uvicorn app.main:app --app-dir backend --port 8000
cd frontend && npm install && npm run dev
```

`GET /health` reports whether the detector is actually loaded, so a degraded deployment is
visible instead of silently scoring every call as genuine. The API response includes a
`signal_provenance` block stating which signals come from a model and which are still
placeholders — nothing is presented as measured when it is not.

---

## Current best model — iv15

Five checkpoints ship in `voiceshield/`, all evaluated on the same held-out benchmark.

| model | A | B | C | D | FLEURS FPR | role |
|---|---|---|---|---|---|---|
| `frozen/voiceshield-indic-v0.1` | — | — | — | — | — | first frozen model |
| `checkpoints_v1` | 1.68 | 26.14 | 10.61 | 49.75 / 0.478 | 26.2 % | safe baseline |
| `checkpoints_f5_trimmed` | 2.02 | **17.97** | 14.39 | 47.12 / 0.523 | 40.0 % | best unseen-spoof |
| **`checkpoints_f5_iv15`** | **1.68** | 25.49 | 9.76 | 47.38 / 0.533 | 16.2 % | **best all-round — default** |
| `checkpoints_asdg_bal` | 1.68 | 30.97 | **7.48** | 44.12 / 0.576 | **13.0 %** | best external-bonafide |

EER %, lower is better; D also shows ROC-AUC.

### What A/B/C/D mean

The 2×2 matrix crosses *where the genuine speech came from* with *which generator made the
spoof*, because a single pooled number hides which half is failing.

| cell | genuine | spoof | question |
|---|---|---|---|
| **A** | internal | internal | in-domain accuracy |
| **B** | internal | **unseen generators** | catches attacks it never trained on? |
| **C** | **unseen corpus** | internal | trusts real speakers it never heard? |
| **D** | **unseen corpus** | **unseen generators** | both at once — the realistic case |

### Per-generator detection

XTTS-v2 and FreeVC24 are **never trained on**. SPRING_F5 is in the training distribution;
figures below are for held-out speakers.

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
the detector in the same act. iv15 is the default because it is the best compromise, not
because the problem is solved.

---

## Data and licences

### Indic detector — training

| corpus | role | licence |
|---|---|---|
| [SherryT997/IndicTTS-Deepfake-Challenge-Data](https://huggingface.co/datasets/SherryT997/IndicTTS-Deepfake-Challenge-Data) | genuine + spoof, 5 languages | CC-BY-4.0 |
| [OpenSLR SLR63/65/66](https://openslr.org) | genuine, ta/te/ml crowdsourced read | CC-BY-SA-4.0 |
| [ai4bharat/IndicVoices](https://huggingface.co/datasets/ai4bharat/IndicVoices) | genuine, spontaneous/conversational | CC-BY-4.0 |
| [SPRINGLab/SPRING_F5](https://huggingface.co/SPRINGLab/SPRING_F5) | spoof generator (F5-TTS flow-matching) | Apache-2.0 |

### Indic detector — held out, never trained on

| corpus | role | licence |
|---|---|---|
| [google/fleurs](https://huggingface.co/datasets/google/fleurs) | unseen genuine speech | CC-BY-4.0 |
| [vdivyasharma/IndicSynth](https://huggingface.co/datasets/vdivyasharma/IndicSynth) | unseen spoof — XTTS-v2, FreeVC24 | **CC-BY-NC-4.0, evaluation only** |

The 1,800-clip external set is the only unseen benchmark in the project and every A/B/C/D
number depends on it staying unseen. **Do not train on it.** IndicSynth is
non-commercial-licensed and used solely as a measuring instrument.

### Evaluated and rejected

| candidate | why |
|---|---|
| SPRINGLab/Indic-Mio (Apache-2.0) | MioCodec spectral signature separable at AUC 0.735 after trimming — a shortcut |
| RawBoost channel augmentation | made external-bonafide false accusations worse (FPR 46.6 %) |
| Mozilla Common Voice (CC0) | access broken — loading-script deprecation, no parquet conversion |
| ai4bharat/Shrutilipi (CC-BY-4.0) | 141 GB for four languages, no speaker IDs |

Also used: [Aratako/MioCodec-25Hz-24kHz](https://huggingface.co/Aratako/MioCodec-25Hz-24kHz)
(MIT) for the rejected Indic-Mio pilot, and
[openai/whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo) (MIT)
as an ASR round-trip quality check.

### Call pipeline

ASVspoof 2019 LA for training, ASVspoof 2021 DF/LA eval for evaluation — the official
protocol every published 2021 number uses. **Open Data Commons Attribution (ODC-By 1.0).**
Cite Todisco et al., *ASVspoof 2019*, Interspeech 2019, and Yamagishi et al.,
*ASVspoof 2021*, 2021.

### Model architecture credit

The Indic detector's RawNet2 architecture is the **official ASVspoof 2021 Baseline-RawNet2**
(`asvspoof-challenge/2021`, `LA/Baseline-RawNet2`). Its pretrained weights transfer exactly
— 119/123 tensors, `torch.equal` logit agreement — which is what makes the adaptation sound.
See `voiceshield/docs/ADAPTATION_FOUNDATION.md`.

---

## Layout

```
voiceshield/                    Indic detector
  model.py audio_utils.py       detector, shared front end
  main.py train_asdg*.py        training, incl. domain-adversarial variants
  eval.py detect.py detectors/  inference; selectable backends
  data/build_*.py data/gen/     dataset construction and spoof generation
  benchmark/                    2x2 matrix, shortcut audits, safety, leakage gates
  checkpoints_*/ frozen/        trained models + training curves
  data/*/manifest.jsonl         every clip, with sha256 and generation seed
  docs/                         pilots, pre-registrations, diagnoses

ml/                             call-oriented ASVspoof pipeline
  common/audio_utils.py         shared front end — training AND serving
  data/build_cache.py           parquet -> int16 memmap + manifests
  deepfake_detection/           WavLM SSL model, LFCC baseline, training, metrics
backend/  frontend/             FastAPI service, React UI
```

Audio, generator weights and virtualenvs are **not** in git — see
`voiceshield/docs/MIGRATION.md` for sizes, pinned revisions and rebuild commands.
Manifests carry per-clip sha256 and generation seeds, so the audio is reproducible.

## Design notes

**One front end, two callers.** Preprocessing is shared between training and serving in
both lines. Train/serve drift is the most common reason a model with a good offline score
fails in deployment.

**The silence shortcut is real and was measured — twice.** On ASVspoof 2019 LA, edge
silence alone separates bonafide from spoof at 34.8 % EER. In the Indic data, OpenSLR
genuine speech is separable from the fake class at AUC 0.965 on silence fraction alone.
Both lines trim, symmetrically, and the Indic line records the contract in the checkpoint.

**Sized for a 4 GB GTX 1650.** SSL encoders are frozen; mixed precision is deliberately
**off** — fp16 measured 4× *slower* on a card with no tensor cores.

**Every training run was pre-registered.** Predictions, and what would falsify them, were
committed before the run. Where a prediction was wrong, the document says so.

## Further reading

| document | |
|---|---|
| `voiceshield/README.md` | Indic detector detail |
| `voiceshield/docs/ADAPTATION_FOUNDATION.md` | why the ASVspoof weights transfer exactly; why 16 kHz is mandatory |
| `voiceshield/docs/SPOOF_GENERATION_PILOT.md` | generator selection and shortcut audit |
| `voiceshield/docs/F5_EXTERNAL_BONAFIDE_REGRESSION.md` | the safety regression, four hypotheses refuted |
| `voiceshield/docs/ASDG_EXPERIMENT.md` | domain-adversarial training; why it failed twice |
| `voiceshield/docs/SSL_RESEARCH.md` | pretrained SSL candidates surveyed for the next step |
| `docs/research/preprocessing.md` | call-pipeline decisions and measurements |
