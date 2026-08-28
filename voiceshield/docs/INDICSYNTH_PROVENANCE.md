# INDICSYNTH_PROVENANCE.md

Recorded whether or not IndicSynth is used for training, so the position is documented.

| field | value |
|---|---|
| dataset | `vdivyasharma/IndicSynth` |
| revision | `c0a10386b723717aff682f757bd67f72983f269f` |
| last modified | 2026-01-12 |
| URL | https://huggingface.co/datasets/vdivyasharma/IndicSynth |
| **licence** | **CC BY-NC 4.0 — non-commercial** |
| paper | IndicSynth (ACL 2025) |
| total size | 845.2 GB, 1,412 shards, 12 language configs |
| languages | Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Odia, Punjabi, Sanskrit, Tamil, Telugu, Urdu |
| generators advertised | xtts_v2, vits, freevc24 |
| **generators observed** | **xtts_v2, freevc24 only** (see below) |
| metadata fields | Generative Model, Source Speaker_ID, Target Speaker ID, Gender, Source/Target Reference Audio, TTS Transcript |
| **current use in this project** | **evaluation only** — the external spoof side of `data/external2` |
| clips currently used | 800 (200 x 4 languages), xtts_v2 + freevc24 |
| training use | **none, and none planned** — see the blocker |
| deployment restriction | any checkpoint trained on it is **research/restricted provenance**; not to be described as commercially or government deployable without a separate licence review |

## `vits` was not observed

The card advertises three generators. Across 32 datasets-server probe points spanning
2 %-98 % of the row range in each of the four target languages, only `xtts_v2` and
`freevc24` appeared. A direct columnar read of the `Generative Model` column from the
parquet shards (which skips the audio) is confirming this independently.

Probes of the eight non-target languages were rate-limited and are inconclusive, so the
claim is scoped to our targets.

## The blocker

The external spoof side of our evaluation **is** IndicSynth xtts_v2 and freevc24. Both
are therefore held out. Since those are the only generators present in our target
languages, IndicSynth offers **no generator we can train on without contaminating cells
B and D**.

Every cross-generator number this project has reported — v0 through v3, and the v2
cell-D result specifically — depends on those two generators remaining unseen.

## Underlying generation systems

IndicSynth's synthetic speech derives from XTTS v2 (Coqui) and FreeVC24. Coqui XTTS v2
ships under the **CPML**, which is itself non-commercial. This is recorded because
"the dataset is CC BY-NC" understates the position: the generators carry their own
terms, and a permissive dataset licence would not by itself clear the outputs.
