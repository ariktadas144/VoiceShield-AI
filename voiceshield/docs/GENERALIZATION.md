# GENERALIZATION.md — does Indic-fine-tuned VoiceShield generalise beyond its training corpus?

**Short answer: not as trained.** It learned to detect synthesis reasonably well, but it
also learned one corpus's *bonafide* audio as the definition of "genuine", and rejects
genuine speech from any other recording domain. The evidence and the isolation of the
cause are below.

## 1. Frozen model

| | |
|---|---|
| Name | VoiceShield-Indic v0.1 |
| Checkpoint | `frozen/voiceshield-indic-v0.1.pth` |
| SHA-256 | `e9937affd88c0232c323240b839c2ff27ac65e3598fa5af49393a435ae1a6b9b` |
| Architecture | RawNet2, VoiceShield fork, **unmodified** (18,680,446 params) |
| Initialisation | official ASVspoof 2021 RawNet2, 119/123 tensors, 94.3 % of params |
| Selection | lowest dev EER (1.41 %, epoch 29, seed 1234) |
| Threshold | 0.806183 — fitted on the **training** corpus dev split and frozen |

Nothing was trained, tuned or re-thresholded for this evaluation. It is zero-shot.

## 2. Training dataset

`SherryT997/IndicTTS-Deepfake-Challenge-Data` @ `57347517658ae989...`
(CC-BY-4.0), five languages, 6937 train /
1485 dev / 1490 test,
language-stratified and text-disjoint, split seed 0.

**One bonafide source and one spoof source.** No speaker or generator metadata. That
single fact is what this whole document ends up being about.

## 3. External dataset

| Role | Source | Licence | n |
|---|---|---|---|
| bonafide | `google/fleurs` validation | CC-BY-4.0 | 1000 (200 × 5 languages) |
| spoof | `vdivyasharma/IndicSynth` | CC-BY-NC-4.0, **evaluation only** | 800 (200 × 4 languages) |

Independent of the training corpus and of each other. IndicSynth carries generator,
speaker and gender metadata, which the training corpus does not. English has no
IndicSynth config, so English is bonafide-only and excluded from paired metrics.

Nothing was trained on IndicSynth and no threshold or calibration constant was fitted
from it, so no NC-derived quantity enters the deployable path.

## 4. Preprocessing

Exactly the frozen contract: 16 kHz, 64600-sample
(4.037 s) window, tiled rather than
zero-padded, per-utterance peak normalisation applied at load in `audio_utils` —
identically in training and inference.

## 5. The confound, stated before the results

Bonafide and spoof come from different corpora, so a detector could separate them on
channel rather than synthesis. Measured on the same clips:

| feature | raw | after the production front end |
|---|---:|---:|
| peak | 0.916 (0.416 off chance) | **0.642 (0.142 off)** |
| RMS | 0.931 (0.431 off) | **0.600 (0.100 off)** |
| duration | 0.281 (0.219 off) | erased — tiling fixes every input to 4.037 s |

Peak normalisation removes most of it. **The residual confound floor is AUC ≈ 0.64**:
a trivial loudness classifier would score about that. Any result near or below 0.64 tells
us nothing; results well above it are doing something real.

## 6. Internal results, for contrast

| Language | EER | AUC |
|---|---:|---:|
| Hindi | 0.00 % | 1.000 |
| English | 3.65 % | 0.988 |
| Tamil | 3.82 % | 0.989 |
| Telugu | 0.00 % | 1.000 |
| Malayalam | 1.35 % | 1.000 |
| **POOLED** | **1.74 %** | **0.998** |

## 7. External results — zero-shot

| Language | n | bona | spoof | EER | 95 % CI | AUC | FPR | FNR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Hindi | 400 | 200 | 200 | 60.50 % | [56.0, 66.0] | 0.361 | 75.5 % | 39.0 % |
| Malayalam | 400 | 200 | 200 | 49.50 % | [44.0, 53.5] | 0.478 | 68.0 % | 31.5 % |
| Tamil | 400 | 200 | 200 | 55.00 % | [50.0, 60.0] | 0.445 | 78.0 % | 34.0 % |
| Telugu | 400 | 200 | 200 | 49.00 % | [43.7, 54.0] | 0.523 | 83.5 % | 15.0 % |
| **OVERALL** | 1800 | 1000 | 800 | **49.89 %** | [47.4, 52.1] | **0.491** | 69.8 % | 29.9 % |
| **MACRO** | — | — | — | 53.50 % | — | 0.452 | 76.2 % | 29.9 % |

**49.89 % EER at AUC 0.491 is chance.** Hindi is
*below* chance (AUC 0.361). The score distribution shows the
mechanism: bonafide mean 0.7419, spoof mean 0.7511, median ≈ 0.996 for **both** —
the model saturates and calls almost everything spoof, exactly as the un-adapted ASVspoof
checkpoint did on Indic speech.

## 8. Isolating the cause

The failure is not symmetric. Crossing the two sources one at a time:

| bonafide × spoof | EER | AUC | FPR | FNR |
|---|---:|---:|---:|---:|
| internal × internal (reference) | 1.18 % | 0.999 | 1.7 % | 1.0 % |
| internal × **external spoof** | **8.88 %** | **0.956** | 1.7 % | 29.9 % |
| **external bonafide** × internal | **17.52 %** | 0.890 | **76.2 %** | 1.0 % |
| external × external | 52.62 % | 0.453 | 76.2 % | 29.9 % |

Mean P(spoof) by source:

| source | mean | median |
|---|---:|---:|
| internal bonafide (SherryT997) | 0.0257 | 0.0000 |
| **external bonafide (FLEURS)** | **0.8032** | **0.9984** |
| internal spoof (SherryT997) | 0.9928 | 1.0000 |
| external spoof (IndicSynth) | 0.7511 | 0.9960 |

**The bonafide side is the dominant failure.** Against *unseen generators* with in-domain
bonafide the model still reaches **AUC 0.956 at 8.88 % EER** — well above the 0.64 confound
floor, so it has learned genuine synthesis cues that transfer. But it flags **76 % of
genuine FLEURS speech as synthetic**. It did not learn "what synthetic sounds like" so
much as "what this corpus's genuine speech sounds like", and treats every other recording
domain as fake.

Root cause: **the training corpus contains exactly one bonafide source.**

## 9. Generator-level results

| Generator | spoof n | FNR | mean P(spoof) |
|---|---:|---:|---:|
| freevc24 | 400 | 43.25 % | 0.6313 |
| xtts_v2 | 400 | 16.50 % | 0.8709 |

xtts_v2 is caught far more reliably than freevc24 (voice conversion, which preserves more
of the source recording). **No unseen-generator claim is made**: the training corpus does
not document its generators, so disjointness cannot be established.

## 10. Speaker-level results

20 distinct synthetic target speakers in the external set. The training corpus exposes no
speaker IDs, so overlap cannot be checked and **no unseen-speaker claim is made**.

## 11. Gender, and the Tamil / Malayalam question

| Group | n | bona | spoof | EER | AUC | FPR | FNR |
|---|---:|---:|---:|---:|---:|---:|---:|
| Female | 1203 | 603 | 600 | 49.96 % | 0.484 | 63.2 % | 36.3 % |
| Male | 597 | 397 | 200 | 46.05 % | 0.574 | 79.8 % | 10.5 % |

Both are at chance externally, so the external set cannot answer the Tamil/Malayalam
male-voice question — the model fails on this corpus regardless of gender. The internal
limitation stands unchanged: **Tamil is 100 % female and Malayalam 93 % female in
training**, so neither internal figure measures male voices in those languages.

## 12. Silence / non-speech safety

60 genuine clips, degraded. Every row is real human speech, so a high score is a false
accusation:

| Condition | speech frames | mean P(spoof) | flagged spoof | energy gate |
|---|---:|---:|---:|---|
| clean speech | 86.5 % | 0.0072 | 0.0 % | passes |
| 25% leading silence | 64.5 % | 0.0086 | 0.0 % | passes |
| 50% leading silence | 42.1 % | 0.1118 | 3.3 % | passes |
| 75% leading silence | 20.3 % | 0.5063 | 36.7 % | gated |
| 50% trailing silence | 43.1 % | 0.4871 | 45.0 % | passes |
| internal pause 30% | 60.7 % | 0.2084 | 15.0 % | passes |
| turn-taking gaps | 80.4 % | 0.2607 | 21.7 % | passes |
| low-energy speech (-30 dB) | 86.5 % | 0.0072 | 0.0 % | passes |
| digital silence | 0.0 % | 0.3810 | 0.0 % | gated |
| white noise | 100.0 % | 0.0000 | 0.0 % | passes |
| 50 Hz hum | 100.0 % | 1.0000 | 100.0 % | passes |

Three false-accusation paths survive a 35 % energy gate:

* **50 Hz mains hum — 100 % flagged.** Continuous energy defeats an energy gate entirely.
  Hum on a phone line would produce a guaranteed false accusation.
* **50 % trailing silence — 45 % flagged**, versus 3.3 % for the same amount of *leading*
  silence. `model.py:258` is `x = x[:,-1,:]`: the classifier reads only the final GRU
  timestep, so trailing silence corrupts precisely the state it consumes while leading
  silence is overwritten by later speech. This is upstream-official behaviour.
* **Turn-taking gaps — 21.7 % flagged**, at 80 % speech frames, so no gate would catch it.

An energy gate is therefore insufficient; a speech/non-speech model (Silero VAD, MIT)
would be needed to reject hum. **This is reported, not fixed** — it is a safety finding,
not a licence to start building.

## 13. Limitations

* Bonafide and spoof come from different corpora (residual confound floor AUC ≈ 0.64).
  The §8 isolation is what carries the argument, not the headline external number.
* No speaker or generator metadata in training → no unseen-speaker or unseen-generator claim.
* English is bonafide-only externally (IndicSynth has no English config).
* One seed, one architecture, two corpora.
* The reproducibility manifest records commit `88c0f44`, which is **upstream** — this work
  is uncommitted, so that hash does not identify this code.

## Conclusion

> **Does the existing VoiceShield RawNet2 architecture, after Indic fine-tuning, generalise
> beyond its training corpus?**

**Partially, and not enough to deploy.**

It generalises on the *spoof* side: against unseen generators with in-domain bonafide it
holds **AUC 0.956 / 8.88 % EER**, far above the 0.64 confound floor. Real synthesis cues
were learned.

It fails on the *bonafide* side: **76 % of genuine speech from an unseen recording domain
is flagged synthetic**, which collapses end-to-end performance to chance (49.89 % EER,
AUC 0.491).

The internal 1.74 % EER is real but corpus-bound. It measures performance on
SherryT997-like audio, not on Indic speech in general, and must not be quoted without
that qualifier.

**The indicated next step is data, not architecture.** The training corpus has one
bonafide source; the obvious experiment is to add a second (FLEURS train, CC-BY-4.0,
already accessible) and re-measure. Nothing here argues for a different model — RawNet2
learned what its data contained.
