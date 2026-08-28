# BONAFIDE_DOMAIN_SHIFT.md — diagnosis and remediation

## 1. The failure

v0 scores **1.74 % EER / AUC 0.998** on its own corpus and **49.89 % / 0.491** — chance —
on an independent one. The 2x2 isolation put the failure on the bonafide side: 76 % of
genuine speech from an unfamiliar recording domain was flagged synthetic, while spoof
cues still transferred to unseen generators (AUC 0.956).

## 2. Is this a known failure mode? Yes

The ASVspoof 2021 organisers describe it and prescribe the remedy:

> "the inclusion of two unexposed datasets in the DF database exposed a lack of CM
> generalization due mostly to **differences in the characteristics of bona fide speech**
> ... ASVspoof should increase diversity **not only in spoofing attacks, but also in bona
> fide source data**, including collection in different recording environments, languages
> and speaking styles."

RawNet2 specifically is documented as attaining the lowest training-set error while
generalising worst among compared architectures — the shape of our result exactly.

A counter-warning was also found and taken seriously: multi-corpus training "**do[es] not
consistently improve performance and can significantly degrade it in some cases**" for
spoofing detection (IDFE, arXiv 2603.18657), because a bonafide corpus with no spoof
counterpart lets corpus identity stand in for the label.

## 3. Corpus comparison

| corpus | peak | RMS dB | crest | **noise floor** | silence | v0 rejects |
|---|---:|---:|---:|---:|---:|---:|
| SherryT997 bonafide (train) | 0.497 | −22.87 | 17.46 | **−62.9 dB** | 19.7 % | 1.5 % |
| FLEURS bonafide (test) | 0.222 | −33.07 | 18.06 | **−42.4 dB** | 8.5 % | 71.5 % |
| OpenSLR Tamil | 0.307 | −26.92 | 16.83 | **−74.0 dB** | 40.3 % | 62.5 % |
| OpenSLR Telugu | 0.349 | −26.49 | 17.53 | **−76.4 dB** | 45.4 % | 42.5 % |
| OpenSLR Malayalam | 0.445 | −24.08 | 15.57 | −59.0 dB | 18.7 % | 74.0 % |

### A hypothesis this table refuted

A causal probe had shown that adding broadband noise to *genuine internal* clips drives
the flagged-as-spoof rate from 1.3 % (−62.8 dB floor) to 76.7 % (−37.1 dB), which
suggested noise floor was the mechanism.

**OpenSLR falsifies that as a complete explanation.** Tamil and Telugu are *cleaner* than
the training corpus (−74 / −76 dB) and are still rejected 62.5 % / 42.5 %. Malayalam is
the sharpest counterexample: closest to SherryT997 on both noise floor and silence, and
rejected *most* (74 %).

The shift is real but **multi-factorial**, and simple level statistics do not capture it.
The noise-floor result stands as sufficient-but-not-necessary.

## 4. Intervention chosen

| Option | Addresses | New data | Licence | Architecture |
|---|---|---|---|---|
| RawBoost (tested, rejected) | simulated channel/noise | none | MIT | none |
| **OpenSLR SLR63/65/66** | a real second recording domain | 3.5 GB | CC-BY-SA-4.0 | none |
| FLEURS in training | one more domain | 1.3 GB | CC-BY-4.0 | none |

**FLEURS was deliberately NOT used for training.** Training on it would destroy the only
independent external test we have, turning cells C and D into "unseen speakers in a seen
domain". FLEURS also reports `speaker_id='unknown'` for every clip, so train/test speaker
separation could not have been verified. OpenSLR carries speaker IDs in its filenames and
was split speaker-disjoint (139 speakers, none spanning splits).

OpenSLR also supplies **male Tamil (183 clips) and male Malayalam (213)**, which the
training corpus lacked entirely.

## 5. Experimental design

    v0  Real_A + Fake_A
    v1  Real_A/2 + Real_B/2 + Fake_A     (per language, treated languages only)

Replacement rather than addition, so total count and class balance are identical to v0
and the *only* difference is which domains the bonafide half is drawn from. The spoof
side, architecture, optimizer, loss, sample rate, schedule and seed are unchanged.

Hindi and English receive no Real_B and act as a control group.

## 6. Results — 2x2, identical test sets

| cell | v0 EER | v1 EER | Δ | v0 AUC (CI) | v1 AUC (CI) | verdict |
|---|---:|---:|---:|---|---|---|
| A internal × internal | 1.18 % | 1.68 % | +0.50 pp | 0.999 [0.997, 1.000] | 0.998 [0.997, 0.999] | unchanged |
| B internal × **unseen spoof** | 8.88 % | 26.14 % | +17.26 pp | 0.956 [0.944, 0.967] | 0.799 [0.775, 0.822] | **damaged** |
| C **unseen bonafide** × internal | 17.52 % | 10.61 % | -6.91 pp | 0.890 [0.872, 0.906] | 0.956 [0.945, 0.965] | **improved** |
| D unseen × unseen | 52.62 % | 49.75 % | -2.88 pp | 0.453 [0.427, 0.481] | 0.478 [0.453, 0.507] | unchanged |

## 7. The control group refutes the attribution

| language | group | v0 FPR | v1 FPR | Δ | ΔAUC |
|---|---|---:|---:|---:|---:|
| Tamil | treated | 78.0 % | 23.0 % | −55.0 pp | +0.118 |
| Telugu | treated | 83.5 % | 15.5 % | −68.0 pp | +0.146 |
| Malayalam | treated | 68.0 % | 40.5 % | −27.5 pp | +0.065 |
| Hindi | **control** | 75.5 % | 29.5 % | **−46.0 pp** | **+0.136** |
| English | **control** | 44.0 % | 20.0 % | **−24.0 pp** | **+0.111** |
| | treated mean | | | −50.2 pp | +0.110 |
| | control mean | | | −35.0 pp | **+0.124** |

**Hindi and English received no OpenSLR data and improved as much as the treated
languages — on AUC, slightly more.** The effect is therefore *not* language-local. We
cannot claim "adding a second bonafide domain for language X fixed language X".

The defensible reading is that exposure to a second recording domain in *any* language
teaches a global "recording variability is not evidence of synthesis" property that
transfers across languages. That is a weaker and more interesting claim than the one the
experiment was designed to test, and it is the one the data supports.

## 8. Safety — substantially improved

| condition (all GENUINE speech) | v0 | v1 | Δ |
|---|---:|---:|---:|
| clean speech | 0.0 % | 0.0 % | +0.0 pp |
| 25% leading silence | 0.0 % | 0.0 % | +0.0 pp |
| 50% leading silence | 3.3 % | 0.0 % | -3.3 pp |
| 75% leading silence | 36.7 % | 0.0 % | -36.7 pp |
| 50% trailing silence | 45.0 % | 20.0 % | -25.0 pp |
| internal pause 30% | 15.0 % | 6.7 % | -8.3 pp |
| turn-taking gaps | 21.7 % | 6.7 % | -15.0 pp |
| low-energy speech (-30 dB) | 0.0 % | 0.0 % | +0.0 pp |
| digital silence | 0.0 % | 0.0 % | +0.0 pp |
| white noise | 0.0 % | 30.0 % | +30.0 pp |
| 50 Hz hum | 100.0 % | 0.0 % | -100.0 pp **fixed** |

**The 50 Hz mains hum false accusation is eliminated (100 % → 0 %)**, and every
conversational-silence condition improved. The one regression is white noise, which is
not speech.

## 9. Limitations

* Cell B degraded materially (AUC 0.956 → 0.799, non-overlapping CIs). v1 became less
  willing to call *anything* from an unfamiliar domain spoof, which fixes bonafide and
  simultaneously excuses unfamiliar spoofs. Mean P(spoof) on external spoof fell
  0.751 → 0.225.
* Cell D remains near chance (AUC 0.478). External spoof detection is now the binding
  constraint, not external bonafide.
* The control group shows the mechanism is not what the experiment was designed to test.
* Male Tamil/Malayalam bonafide is now present in training but was **not** separately
  evaluated; no male-specific claim is made.
* One seed, two bonafide corpora, one spoof corpus.
