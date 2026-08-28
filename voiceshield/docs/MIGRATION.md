# Migration: voiceshield working directory → VoiceShield-AI

Everything from the standalone `voiceshield/` working directory now lives on this branch.
The old folder is no longer the source of truth. This records exactly what came across,
what deliberately did not, and how to rebuild the parts that did not.

## What is here

| | |
|---|---|
| source | `main.py`, `model.py`, `audio_utils.py`, `eval.py`, `detect.py`, `metrics.py`, `rawboost.py`, `train_asdg.py`, `train_asdg_balanced.py` |
| data builders | `data/build_*.py`, `data/gen/*.py`, `data/plan_f5_mix.py` |
| evaluation | `benchmark/` — 2×2 matrix, shortcut audits, safety, low-pass, leakage, diagnosis |
| inference backends | `detectors/` — VoiceShield and the selectable Dhwani backend |
| **trained models** | **5 checkpoints, 71 MB each** — frozen v0.1, v1, f5-trimmed, iv15, asdg-bal |
| manifests | every `manifest.jsonl` and split file, with per-clip sha256 |
| results | `results/*.json`, per-experiment audit JSON and console logs |
| documentation | `docs/` — pilots, pre-registrations, diagnoses, this file |
| provenance | pinned revisions, checksums and licences for every external asset |

Five checkpoints are included even though the repo-root `.gitignore` excludes `*.pth`.
Training is not bit-reproducible on GPU, so unlike the audio these cannot be regenerated —
they are the irreplaceable output of the work. The five are the ones the write-ups cite as
baselines or best results; the seven historical checkpoints (v2, v3, rb4, indic, f5_iv,
f5_untrimmed, asdg) stay on the training machine, and their `history.json` training curves
are tracked here instead. `voiceshield/.gitignore` negates the ignore rule for those five
paths only — audio and generator weights stay excluded.

## What is NOT here, and why

| | size | why | how to get it back |
|---|---|---|---|
| audio, 46,078 wav | ~6.5 GB | unusable in git | manifests carry sha256; SPRING_F5 clips carry per-clip seeds — see below |
| generator weights | 9.5 GB | 5 files exceed GitHub's 100 MB hard limit | `generators/DOWNLOAD_RECORD.json` pins revision + licence per repo |
| IndicVoices parquet | 1.7 GB | 6 files over 100 MB | `data/indicvoices_raw/DOWNLOAD_RECORD.json`, valid split only |
| OpenSLR / MMS corpora | 6 GB | source corpora | public downloads; the small `line_index_*.tsv` transcripts ARE kept |
| ASVspoof baseline weights | 68 MB | third-party | `weights/PROVENANCE.md` has URL + sha256 |
| `.venv`, `.venv-gen` | 11.7 GB | virtualenvs | `requirements.lock.txt`, `requirements-gen.lock.txt` |

## Rebuilding

```bash
# environments
python3.11 -m venv .venv     && .venv/bin/pip install -r requirements.lock.txt
python3.11 -m venv .venv-gen && .venv-gen/bin/pip install -r requirements-gen.lock.txt
#   .venv-gen additionally needs:
#     pip install "git+https://github.com/ArigalaAdarsh/SPRING_F5.git" rjieba torchcodec
#     pip install --ignore-requires-python "git+https://github.com/Aratako/MioCodec"

# generators, at the pinned revisions in generators/DOWNLOAD_RECORD.json
#   SPRINGLab/SPRING_F5          @ 898dd2a56fbb42c994b545fadfdd831eeadfafb0  Apache-2.0
#   SPRINGLab/Indic-Mio          @ 25feace00ca76c71c40b1e8d921fd3c2943c545e  Apache-2.0
#   Aratako/MioCodec-25Hz-24kHz  @ 3a737f0de2c6324cb2fe40c1fbd1056c7add423d  MIT
#   ai4bharat/IndicVoices        @ c96f9088f138cf89d419da7e8e643e1f05c00a87  CC-BY-4.0 (valid split only, 1.64 GiB)

# SPRING_F5 audio, 2,000 clips, ~14 h on a GTX 1650. Seeds are per-clip and recorded
# in each manifest, so any single clip regenerates independently and identically.
.venv-gen/bin/python data/gen/gen_spring_f5.py --items data/train_refs/train_items.jsonl \
    --refs-root . --out data/f5_train
```

Every generated clip's manifest row carries `seed`, `sha256`, `peak_before_scaling` and the
exact `target_text`, so regeneration is verifiable rather than approximate.

## Held out — do not train on these

`FLEURS` genuine, `XTTS-v2`, `FreeVC24`. The 1,800-clip external evaluation set
(`data/external2`) is the only unseen benchmark in the project and every reported A/B/C/D
number depends on it staying unseen.

## Model status at migration

| model | A | B | C | D | FLEURS FPR | role |
|---|---|---|---|---|---|---|
| v1 | 1.68 | 26.14 | 10.61 | 49.75 / 0.478 | 26.2% | safe baseline |
| f5-trimmed | 2.02 | **17.97** | 14.39 | 47.12 / 0.523 | 40.0% | best unseen-spoof |
| **iv15** | **1.68** | 25.49 | 9.76 | 47.38 / 0.533 | 16.2% | **best all-round** |
| iv30 | 1.85 | 28.23 | **6.48** | 40.88 / **0.615** | 8.2% | best C |
| asdg-bal | 1.68 | 30.97 | 7.48 | 44.12 / 0.576 | **13.0%** | best FLEURS |

No model satisfies every criterion simultaneously; see `docs/ASDG_EXPERIMENT.md` for the
current state of the bonafide/spoof trade-off.
