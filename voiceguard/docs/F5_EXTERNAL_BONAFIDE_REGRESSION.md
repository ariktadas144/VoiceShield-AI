# The external-bonafide regression — diagnosis

Both SPRING_F5 models improved on the thing they were built for and broke the thing that
matters more. This documents what actually happened, including three hypotheses that were
tested and refuted, one of them my own.

**No further training has been run. v1 remains the best safe model.**

---

## 1. v1 baseline

| cell | n | EER% | 95% CI | AUC | FPR% | FNR% |
|---|---|---|---|---|---|---|
| A internal bona × internal spoof | 1189 | 1.68 | [1.0, 2.4] | 0.998 | 2.22 | 1.32 |
| B internal bona × EXTERNAL spoof | 1385 | 26.14 | [23.8, 28.5] | 0.799 | 2.22 | 72.62 |
| C EXTERNAL bona × internal spoof | 1404 | 10.61 | [9.0, 12.3] | 0.956 | 27.12 | 1.32 |
| D EXTERNAL × EXTERNAL | 1600 | 49.75 | [47.1, 52.0] | 0.478 | 27.12 | 72.62 |

Dev EER 2.22%, threshold 0.176874. D is at chance.

## 2. F5 untrimmed

| cell | EER% | AUC | FPR% | FNR% |
|---|---|---|---|---|
| A | 2.52 | 0.998 | 1.88 | 2.65 |
| B | 22.38 | 0.841 | 1.88 | 67.00 |
| C | 13.60 | 0.940 | 44.00 | 2.65 |
| D | **56.00** | **0.413** | 44.00 | 67.00 |

Dev EER 3.90%. **D got worse than v1 and inverted** — AUC below 0.5 means genuine
external speech scores as *more* synthetic than actual external spoof (mean P(spoof)
0.463 vs 0.352).

## 3. F5 trimmed

| cell | EER% | AUC | FPR% | FNR% |
|---|---|---|---|---|
| A | 2.02 | 0.997 | 2.05 | 1.99 |
| B | **17.97** | **0.890** | 2.05 | 56.12 |
| C | 14.39 | 0.930 | 39.75 | 1.99 |
| D | 47.12 | 0.523 | 39.75 | 56.12 |

Dev EER 4.71%. B is a genuine, substantial improvement (26.14 → 17.97, AUC 0.799 →
0.890) and the inversion is fixed. D moves off chance but only to 0.523.

Two pre-registered predictions were wrong: trimming cost **1.21×** dev EER, not the
1.5–3× predicted from the ASVspoof literature; and D was predicted to improve for both
models when it degraded badly for one.

## 4. The regression, on genuine speech

Flagged rate, each model at its own dev-fitted threshold and its own audio contract:

| genuine set | v1 | f5-untrimmed | f5-trimmed |
|---|---|---|---|
| FLEURS (external) | 26.2% | **43.5%** (+17.3) | **40.0%** (+13.8) |
| pilot refs (OpenSLR + Sherry) | 1.2% | 4.8% (+3.6) | 6.2% (+5.0) |
| internal test bonafide | 3.2% | 3.0% (−0.2) | 2.5% (−0.7) |

Both exceed the pre-registered ≤5-point safety limit on FLEURS, which disqualifies them
regardless of B and D. Mean P(spoof) on genuine clips, sampled at random:

| population | n | v1 | f5-untrimmed | f5-trimmed | Δ |
|---|---|---|---|---|---|
| Sherry bonafide | 250 | 0.000 | 0.000 | 0.000 | −0.000 |
| OpenSLR bonafide | 250 | 0.000 | 0.000 | 0.001 | +0.000 |
| FLEURS bonafide | 400 | 0.226 | 0.431 | 0.332 | **+0.206** |

**The regression is exclusively FLEURS.** Neither training corpus moved at all.

## 5. Acoustic comparison

Medians over 400 clips per population, everything resampled to 16 kHz:

| population | dyn range dB | rms dB | noise floor dB | flatness | silence frac | hf share | crest dB |
|---|---|---|---|---|---|---|---|
| v1 bona (Sherry) | 55.1 | −21.9 | −70.6 | 0.029 | 0.170 | 0.005 | 17.7 |
| v1 bona (OpenSLR) | 60.3 | −26.0 | −79.1 | 0.011 | 0.370 | 0.002 | 16.4 |
| v1 spoof (Sherry) | 48.4 | −22.8 | −59.7 | 0.025 | 0.114 | 0.003 | 17.1 |
| SPRING_F5 | 67.1 | −24.2 | −72.3 | 0.014 | 0.162 | 0.002 | 17.8 |
| **FLEURS** | **31.9** | **−34.2** | −62.3 | 0.030 | 0.023 | 0.008 | 18.3 |
| ext spoof xtts_v2 | 36.5 | −20.1 | −49.8 | 0.013 | 0.047 | 0.002 | 17.0 |
| ext spoof freevc24 | 34.1 | −16.7 | −41.7 | 0.014 | 0.023 | 0.002 | 16.7 |

FLEURS is an outlier on two axes at once: the lowest dynamic range of any population
(31.9 against 48–67 for everything in training) and by far the quietest (−34.2 dB against
−21.9 to −26.0). It is not "like the training data but cleaner" — it is somewhere else.

## 6. Trivial-classifier analysis

Recording statistics only, thirteen features, 5-fold cross-validated:

| contrast | classifier AUC | worst single feature |
|---|---|---|
| FLEURS vs SPRING_F5 | 0.979 | dyn_range 0.956 |
| FLEURS vs v1 bonafide (Sherry) | **0.975** | rms_db 0.161 |
| FLEURS vs OpenSLR bonafide | **0.994** | dyn_range 0.043 |
| SPRING_F5 vs v1 spoof | 0.985 | dyn_range 0.882 |
| **v1 bonafide vs v1 spoof** | **0.763** | dyn_range 0.365 |

The bottom row is the control and it is the important one: within v1's own training data,
real and fake are *not* trivially separable (0.763). But **FLEURS is separable from both
training bonafide corpora at 0.975 and 0.994** — nearly perfectly, on recording
statistics alone, without any synthesis information. FLEURS is further from the training
bonafide than the training spoof is.

## 7. Score distributions

FLEURS scores are strongly bimodal, so the mean hides the mechanism:

| score band | v1 | f5-untrimmed | f5-trimmed |
|---|---|---|---|
| < 0.1 (confidently real) | 73.1% | 49.9% | 61.2% |
| 0.1 – 0.9 | 7.0% | 12.0% | 10.6% |
| > 0.9 (confidently fake) | 19.9% | **38.1%** | 28.2% |

**A subpopulation flipped; the distribution did not shift.** About 18% of FLEURS clips
moved from confidently-real to confidently-fake. Every language is affected (Malayalam
worst 0.388 → 0.503, English least 0.169 → 0.333), so it is not one language.

## 8. Hypotheses tested

**H1 — "SPRING_F5 taught the model that clean read speech is synthetic." REFUTED.**
OpenSLR is clean read speech and its score did not move at all (Δ +0.000). If the model
had learned a clean-speech rule, OpenSLR would have moved too.

**H2 — "The fake class became too heterogeneous for the real class to explain."
REFUTED.** In standardised feature space the fake class is still *tighter* than the real
class after the change: within-class spread REAL 3.567, FAKE 2.933 → 3.125. The ratio
moved 0.82 → 0.88 and never exceeded 1.

**H3 — "SPRING_F5 occupies acoustic space that FLEURS lives in, which was previously
unlabelled and defaulted to real." REFUTED.** Nearest training centroid for FLEURS
clips: FAKE_sherry **80.7%**, REAL_sherry 13.2%, FAKE_f5 **3.5%**, REAL_openslr 2.6%.
FLEURS is nowhere near SPRING_F5.

**H4 — "A specific acoustic feature explains which clips flip." REFUTED.** Flipped vs
stayed clips separate at only AUC 0.670, with no feature past |AUC−0.5| ≥ 0.25. The
strongest correlate of the score increase across all genuine clips is dyn_range at
r = −0.20; within FLEURS alone it is zcr at r = −0.27. Both weak.

**H5 — "Channel/recording augmentation fixes it." REFUTED, with existing evidence.**
`checkpoints_rb4` (RawBoost 1+2+3, trained earlier in this project) on the same cells:
A 4.79%, B 29.39%, C 19.23% with **FPR 46.62%**, D 50.50% / AUC 0.455. RawBoost made the
external-bonafide false-accusation rate *worse than either F5 model* — the same failure,
more severe. Augmenting the training manifold did not extend the model to FLEURS.

## 9. Root cause

**FLEURS is out-of-distribution bonafide, and it sits closest to the spoof side of the
training manifold. Any change that sharpens the decision boundary on the training
manifold converts more near-boundary FLEURS clips into confident false accusations.**

The chain of evidence:

1. FLEURS is separable from *both* training bonafide corpora at 0.975 / 0.994 on
   recording statistics alone — a larger gap than separates real from fake within
   training (0.763).
2. 80.7% of FLEURS clips have `FAKE_sherry` as their nearest training centroid. Being
   near the spoof cluster is a *pre-existing* property of FLEURS, present under v1 — which
   is why v1 already flagged 26.2% of it.
3. The flipped clips are uniformly *closer* to every training centroid than the clips
   that stayed real (−0.53 to −0.71 in standardised distance). The clips that most
   resemble the training data resemble its spoof side; clips far from everything are
   scored real by default.
4. Adding SPRING_F5 made the training problem harder (two acoustically disjoint fake
   sources, separable from each other at 0.981) and the model resolved it by fitting the
   training manifold harder — train accuracy 99.96%, scores saturated at 0.000 and 1.000
   on every in-domain population. A sharper boundary reclassifies more of the ambiguous
   FLEURS mass.
5. The same thing happens under a completely different intervention (RawBoost, H5), which
   is what rules out an F5-specific artefact.

**This is not a SPRING_F5 defect.** SPRING_F5 measurably improved unseen-spoof detection
(B: 26.14 → 17.97 trimmed). The limiting factor is **bonafide domain coverage**: the
training real class spans two corpora that are themselves 0.974 separable from each
other, and neither resembles FLEURS. The published literature names this exact weak spot —
ADD datasets "lack diversity in bona fide speech, often featuring a single environment and
speech style" ([arXiv:2509.09204](https://arxiv.org/abs/2509.09204)).

The project's own history says the same thing twice: v1 improved bonafide generalisation
by adding a second real corpus (OpenSLR) and lost spoof coverage; F5 improved spoof
coverage and lost bonafide generalisation. Both moved along one axis because only one
axis was being changed.

## 10. Proposed smallest fix

The measured cause is bonafide coverage, so the smallest intervention that addresses it is
**a third bonafide corpus, acoustically unlike both Sherry and OpenSLR, added to the real
side while the F5 spoof side is kept exactly as it is now.**

Constraints this must satisfy:

* **It cannot be FLEURS.** FLEURS is the external evaluation bonafide; training on it
  would destroy the only unseen-bonafide measurement in the project.
* It must cover the axes on which FLEURS is an outlier — low dynamic range (31.9 dB) and
  low level (−34.2 dB) — since those are where the training real class has no mass.
* It must be added *without* changing the spoof side, so the comparison against the two
  F5 models isolates one variable.

What this fix is **not**: another generator, IndicSynth, a ratio change, or an
architecture change — none of those touch the measured cause, and RawBoost has already
been shown to make it worse.

Before running it, the candidate corpus should be measured against the same thirteen
features and required to (a) be permissively licensed, (b) sit closer to FLEURS than
either existing bonafide corpus on dynamic range and level, and (c) not be trivially
separable from the fake class, or it will introduce a fresh corpus shortcut of its own.

**No training until that measurement is done and reported.**
