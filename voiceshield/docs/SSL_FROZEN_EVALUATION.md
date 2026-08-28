# SSL frozen evaluation — Spectra-AASIST vs iv15 on our benchmark

No fine-tuning. iv15 untouched and re-verified mid-experiment (A 1.68 · B 25.49 · C 9.76 ·
D 47.38 / 0.533, identical after the dependency install).

```
Model             lab260/Spectra-AASIST
Repository        huggingface.co/lab260/Spectra-AASIST
Revision          eb65c2662d9e646d72557b3f4bdd08b000068c7f
Checkpoint SHA    2e2727a7397f78d28b0a2a2b8ee031ff08143b9c431ea7f06fc29a808b0180db
                  (1,264,151,840 bytes, verified after download)
Architecture      SSL encoder -> MLP bridge (1024->128) -> KAN-AASIST 2-class
Encoder           facebook/wav2vec2-xls-r-300m
Backend           AASIST, gat_dims [64,32], pool_ratios [0.5]*4
Parameters        316.0 M (measured)
Licence           Apache-2.0, not gated
```

## Inference contract — read from source, not the card

```
sample rate     16 kHz
channels        mono (3-D input squeezed)
normalisation   NONE. Wav2Vec2Encoder is constructed with normalize_waveform=False
                (7th positional arg). Our RawNet2 path peak-normalises to 0.95.
window          64,400 samples (the model's own AASIST nb_samp), first window,
                tiled if shorter -- the same rule matrix2x2 applies to iv15
padding         not implemented in the model; caller's responsibility
silence         no handling in the model
class 0         spoof
class 1         bonafide
score direction logits[:,1] higher = MORE BONAFIDE; its classify() thresholds
                logits[:,1] at -1.0625009 (a raw logit, not a probability)
we use          P(spoof) = softmax(logits)[:,0], directly comparable with ours
```

**Each model was given the preprocessing it was trained under.** Forcing our
normalisation onto Spectra would have measured a preprocessing mismatch and called it
architecture.

### Class-order verification (mandatory, done before any benchmark)

80 clips of known label — 40 genuine, 40 spoof, from the internal test split:

| score | AUC(spoof > genuine) |
|---|---|
| `logits[:,1]` (card: bonafide) | **0.028** |
| `logits[:,0]` (card: spoof) | **0.973** |
| `softmax[:,0]` | **0.973** |

Card confirmed. Mean `logits[:,1]`: genuine **+0.126**, spoof **−4.232**.

## Hardware — measured, not estimated

```
weights resident   1,214 MiB
peak, batch 1      1,290 MiB
peak, batch 8      1,823 MiB
GPU total           3,724 MiB usable
4 GB feasible      YES for inference and batch-8 scoring
latency            108.3 ms per clip (batch 8, CUDA), 64,400-sample window
                   iv15: ~185 ms per clip, 64,600-sample window -- comparable windows
```

## Our benchmark

| cell | Spectra | iv15 | delta |
|---|---|---|---|
| **A** internal bona × internal spoof | 12.78 [10.8, 14.8] / 0.943 | **1.68 / 0.998** | **+11.10 pp worse** |
| **B** internal bona × unseen spoof | **21.22** [18.6, 23.5] / 0.886 | 25.49 / 0.820 | **−4.27 pp better** |
| **C** external bona × internal spoof | **1.14** [0.6, 1.7] / 0.999 | 9.76 / 0.965 | **−8.62 pp better** |
| **D** external × external | **1.62** [1.0, 2.3] / **0.999** | 47.38 / 0.533 | **−45.76 pp better** |

Threshold fitted on the dev split only (dev EER 7.34%, threshold 0.997347). The external
set was never used for selection or tuning.

**D goes from near chance to 1.62% EER at AUC 0.999.** That is not an improvement, it is a
different regime.

### Per language (internal test)

| language | n | EER% | AUC | FPR% | FNR% |
|---|---|---|---|---|---|
| Hindi | 301 | 4.32 | 0.992 | 8.75 | 2.84 |
| Telugu | 300 | 2.68 | 0.998 | 7.50 | 0.00 |
| English | 301 | 4.31 | 0.986 | 1.26 | 11.97 |
| **Tamil** | 288 | **18.41** | 0.874 | **43.85** | 2.53 |
| **Malayalam** | 300 | **22.32** | 0.852 | **26.67** | 18.79 |

### Per generator (flagged at the dev threshold)

| generator | seen in training? | Spectra | iv15 |
|---|---|---|---|
| xtts_v2 | **no — held out** | **87.5 %** | 32.5 % |
| freevc24 | **no — held out** | **66.8 %** | 13.5 % |
| spring_f5 | yes (ours) | 96.9 % | 88.5 % |
| sherry_spoof | yes (ours) | 91.3 % | — |

### External genuine speech

| | Spectra | iv15 |
|---|---|---|
| FLEURS FPR | **0.20 %** | 16.2 % |
| FLEURS mean P(spoof) | 0.077 (median 0.004) | — |
| **SherryT997 genuine FPR** | **16.26 %** | **2.8 %** |

FLEURS per language: Hindi 0.00, Tamil 0.00, Telugu 0.00, Malayalam 0.00, English 1.00 %.

**The two models are near mirror images.** iv15 trusts our internal corpus and
false-accuses FLEURS; Spectra trusts FLEURS and false-accuses our internal corpus, with
the damage concentrated in Tamil (43.9 % FPR) and Malayalam (26.7 %).

## Error overlap with iv15 — 2,789 clips scored by both

| | count | share |
|---|---|---|
| both correct | 1,818 | 65.2 % |
| both wrong | 162 | 5.8 % |
| iv15 correct / Spectra wrong | 179 | 6.4 % |
| **iv15 wrong / Spectra correct** | **630** | **22.6 %** |

What Spectra **fixes**: freevc24 235, xtts_v2 225, FLEURS genuine 152 — precisely the three
failures that have defined this project. What it **breaks**: SherryT997 genuine 116,
sherry_spoof 36. Net positive in every language: Hindi +154, Telugu +134, Tamil +102,
Malayalam +61.

These are complementary models, not a better and a worse one.

## Shortcut audit

Low-pass probe on genuine speech (flagged %):

| set | unfiltered | 4 kHz | 2 kHz |
|---|---|---|---|
| FLEURS | 0.0 | 0.0 | 0.0 |
| SherryT997 | 3.2 | 1.2 | 2.0 |

**No bandwidth dependence** — the "bandlimited = fake" shortcut is absent, which is not
true of every model we have built.

Acoustic correlation of P(spoof) over 500 mixed clips: `rms_db` **r = +0.457**, `peak`
+0.393, `duration_s` −0.354. The loudness correlation is moderate and worth watching —
part of it is genuine label correlation in our data, but it is the largest single
association and would need isolating before trusting the model in a louder domain.

## Verdict

**BETTER THAN iv15 on three of four cells, worse on one, and complementary in its errors.**

It wins B, C and D — including turning D from chance into 0.999 AUC — while cutting FLEURS
false accusations from 16.2 % to 0.20 %, and it detects the two held-out generators at
87.5 % and 66.8 % against iv15's 32.5 % and 13.5 %. It loses A badly (12.78 vs 1.68) and
false-accuses our internal Tamil and Malayalam genuine speech.

## Two caveats that must not be dropped

1. **Training data undisclosed.** The Arena lists Spectra in its "Unpublished /
   Proprietary" tier — no paper. A 0.20 % FPR on FLEURS and 0.999 AUC on D are consistent
   with a very strong model *and* with FLEURS or IndicSynth appearing in its training set.
   **We cannot currently distinguish those.** Every number above is real on our data; what
   is unproven is whether the data was unseen *to it*.
2. **A is a real regression, not a preprocessing artefact.** The contract was read from
   source, class order verified on known labels, and the window matched to iv15's rule.
   Internal genuine Tamil/Malayalam are genuinely being flagged.

## Recommended next step

Not fine-tuning yet. The decision rule's Case A applies — it materially improves B, C and D
— so the instruction is to stop and document, which this does.

The one measurement that would most change the picture is **resolving caveat 1**: probe
whether Spectra has memorised FLEURS by scoring FLEURS *speakers* it should not know
against fresh genuine speech from the same recording conditions. If the model is clean,
this is the strongest candidate this project has produced. If it is contaminated, cells C
and D collapse and only B survives — still an improvement, but a much smaller one.
