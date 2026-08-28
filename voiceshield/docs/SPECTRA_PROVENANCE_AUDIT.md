# Spectra-AASIST — provenance audit

No fine-tuning was performed. The checkpoint was not modified. No data was added.
This document answers one question: **is our external benchmark genuinely unseen by
`lab260/Spectra-AASIST`?**

Model under audit:

```
repo        lab260/Spectra-AASIST
revision    eb65c2662d9e646d72557b3f4bdd08b000068c7f
sha256      2e2727a7397f78d28b0a2a2b8ee031ff08143b9c431ea7f06fc29a808b0180db
created     2026-04-18   (weights untouched since; later commits are eval artefacts only)
params      316.0 M      encoder facebook/wav2vec2-xls-r-300m
```

---

## 0. A correction that came out of the audit, before any provenance question

Two things were checked against the current source revision as part of Phase 12, and
both were wrong in our first frozen evaluation.

**(a) We scored Spectra without preemphasis.** The model card's own inference example
applies `torchaudio.functional.preemphasis` (coefficient 0.97) to the full waveform
*before* windowing. The Arena's submission record for this exact checkpoint says the
same: *"FP32, preemphasis (0.97), deterministic first-64600-sample window"*. Our
`score_spectra.py` applied none.

**(b) We used the wrong window.** The model's internal `d_args` says `nb_samp: 64400`,
but the card example and the Arena both window at **64,600**. We used 64,400.

This is the same class of error as the `trim` contract mismatch that cost 11.5 points on
SPRING_F5 detection earlier in this project: a silent preprocessing divergence that
produces plausible-looking numbers. `benchmark/score_spectra.py` now takes `--preemph`
and `--nb-samp`, and every number in §6 below is measured under the published contract
(`--preemph 0.97 --nb-samp 64600`).

**This correction is not cosmetic — it was the whole story.** Re-scoring all 12,231
clips under the published contract moves every cell, and the "regression" the previous
report treated as real disappears:

| cell | our wrong contract | **published contract** | iv15 |
|---|---|---|---|
| A internal x internal | 12.95 | **1.35** | 1.68 |
| B internal bona x unseen spoof | 21.22 | **1.22** | 25.49 |
| C external bona x internal spoof | 1.14 | **0.15** | 9.76 |
| D external x external | 1.62 | **0.25** | 47.38 |

The previous report stated that "A is a real regression, not a preprocessing artefact."
**That was wrong.** Feeding a preemphasis-trained model non-preemphasised audio was the
entire effect: SherryT997 genuine false-accusations at threshold 0 fall from 38.57% to
5.80%, and the Tamil and Malayalam weaknesses attributed to the model largely go with
them (Tamil A 19.11 -> 3.12, Malayalam A 22.32 -> 1.65). Class order was re-verified
after the change (AUC 0.9994 on `logit_bonafide`), and iv15 reproduces its committed
numbers exactly on the same code path, which is what rules out a second bug.

**(c) The card and the code disagree on the default threshold.** README says
`-1.140625`; `SpectraAASIST.classify()` in `model.py` defaults to `-1.0625009`. Neither
is used for our EER/AUC figures, which are threshold-free, but it is recorded here.

---

## 1. Where the training data was looked for

Every avenue in the audit brief was searched. What was found:

| source | training data disclosed? |
|---|---|
| HF model card, current revision | no |
| **All 14 README revisions back to the first commit (2026-04-18)** | **no — never present at any point** |
| Full repo file tree (51 files) | no train script, no train config, `config.json` is `{}` |
| `model.safetensors` header `__metadata__` | `None` |
| `model.py` source | no dataset reference anywhere |
| Sibling cards: `spectra_0`, `Spectra-AASIST3` | no |
| Speech Anti-Spoofing Arena system record | **explicitly none** — see §2 |
| Arena submission plan `2026-06-07-spectra-aasist-arena-submission.md` | logs "no paper", unpublished tier |
| lab260 papers: AASIST3, LRLspoof (2603.02364), RuASD (2604.02374) | Spectra is not mentioned in any of them |
| GitHub `lab260ru` (19 repos) | no Spectra training code |
| ModelScope / lab260.ru | nothing further |

**Finding: there is no training-data disclosure for Spectra anywhere in public.** This
is not "we did not look hard enough" — the Arena's own machine-readable registry has a
field for it, other systems populate it, and Spectra's is empty.

---

## 2. The Arena is not independent, and does not audit training data

Two facts that bear on how much weight the Arena scores can carry.

**(a) The Arena is run by the model's author.** The Arena Space README names its
maintainer as **Kirill Borodin** (`kborodin.research@gmail.com`); that is the same
contact address on the Spectra model card, and `speech_spoof_bench` — the tool that
produces every Arena number — is a **`lab260ru`** GitHub repository. Spectra's scores
are reproducible, sha-pinned, and recomputable from the committed score files; they are
not *independent*. The model author, the benchmark tool, and the leaderboard are one
party. Our own evaluation is independent, and is what §6 reports.

**(b) The tier system does not mean what it sounds like.** The manifest defines the
tiers purely by `requires_paper` and dataset coverage:

```
gold      coverage 1.0   requires_paper true
silver    coverage 0.5   requires_paper true
bronze    coverage 0.0   requires_paper true
unpublished  coverage 0.0   requires_paper false
```

"Unpublished / Proprietary" means *no paper*. It is **not** a contamination judgement,
and the Arena performs no train/eval overlap checking at all. Spectra's rank is
`unranked` for lack of a paper, not for lack of provenance.

For each system the Arena stores a free-text `description`, and for several systems it
does record training exposure — `res2tcnguard` and `rescapsguard` are both described as
"ASVspoof2019 LA pretrained". Spectra's description ends:

> "Pre-release lab260/Spectra-AASIST checkpoint. FP32, preemphasis (0.97), deterministic
> first-64600-sample window (no random crop). score = output logit for class 1 (bona
> fide). **Unpublished / pre-release model (no paper).**"

The field exists, the maintainer fills it in when he knows, and for his own model it is
blank.

---

## 3. Model lineage

The three Spectra models share one training pipeline and differ only in the back-end:

| model | encoder | bridge | back-end | ASVspoof19 LA |
|---|---|---|---|---|
| `spectra_0` | XLS-R-300m | MLP 1024→128 (SELU) | ECAPA-TDNN | 0.181 |
| **`Spectra-AASIST`** | XLS-R-300m | MLP 1024→128 | AASIST | **0.159** |
| `Spectra-AASIST3` | XLS-R-300m | MLP 1024→128 | KAN-AASIST | 0.723 |

Two pieces of hard evidence that they are one family, not three independent efforts:

- The **first Spectra-AASIST README commit is titled "Model Card: Spectra-0"** and the
  next one "Model Card: Spectra-AASIST3" — the card was copy-pasted across siblings.
- All three were submitted to the Arena within 24 hours of each other (2026-06-06/07)
  with identical preprocessing contracts.

**The predecessor is the important link.** `lab260/AASIST3` is the same lab's published
ASVspoof-2024 system, and it is now deprecated *in favour of Spectra-AASIST3*. Unlike
Spectra, **AASIST3 does disclose its training data**:

> ASVspoof 2019 LA · **ASVspoof 5 (ASVspoof 2024)** · **MLAAD** · **M-AILABS**

That recipe is the single best available estimate of what Spectra was trained on. It is
an estimate, not a disclosure — Spectra scores 27.6 → 0.16 EER against AASIST3 on
ASVspoof19 LA, a gap far too large for a pure back-end swap, so Spectra's training set is
substantially *larger* than AASIST3's, not identical to it. The disclosed four are
therefore best read as a **lower bound** on Spectra's training data.

---

## 4. Generator- and corpus-specific findings

### 4.1 XTTS-v2 — suspected SEEN

MLAAD's generator list, read directly from the dataset's file tree, contains:

```
tts_models_multilingual_multi-dataset_xtts_v2      <-- our held-out generator
tts_models_multilingual_multi-dataset_xtts_v1.1
```

and MLAAD's language directories include `hi`, `ta`, `ml`, `mr`, `kn`, `bn`, `ur`.

MLAAD is named in the training data of the lab's immediately preceding model. If Spectra
inherited that corpus — which the lineage in §3 makes the most probable single
hypothesis — then **Coqui XTTS-v2, the exact system behind one of our two held-out
generators, was in its training set, in Indic languages among others.**

This cannot be confirmed, because Spectra discloses nothing. It also cannot be dismissed.
**XTTS-v2 is reclassified from "unseen" to "suspected seen".**

### 4.2 FreeVC24 — probably UNSEEN

MLAAD contains **no voice-conversion data at all** — it is a TTS re-synthesis corpus, and
its authors say so explicitly; researchers who want VC data generate it themselves.
FreeVC appears in none of the four disclosed corpora. ASVspoof 2019 LA contains VC
attacks, but not FreeVC (which postdates it by four years).

**FreeVC24 remains the cleanest unseen generator we have.** Its result carries the most
weight of anything in the evaluation.

### 4.3 FLEURS — no evidence of inclusion, and behavioural evidence against it

FLEURS appears in none of the disclosed corpora, in none of the Arena's 24 benchmark
datasets, and nowhere in the lab's three papers.

Beyond absence of evidence, there is positive evidence. If FLEURS were training data,
FLEURS clips should sit in a distinctly more saturated score region than comparable
genuine speech the model has never seen. They do not:

| genuine corpus | n | median bonafide logit | IQR | % below 0 |
|---|---|---|---|---|
| OpenSLR | 1078 | **4.47** | 0.37 | 0.00 |
| SherryT997 (IndicTTS studio) | 3378 | 3.90 | 1.17 | 5.80 |
| **google/fleurs** | 1000 | **3.84** | 0.71 | 1.20 |
| IndicVoices | 747 | 3.78 | 0.95 | 1.74 |

**FLEURS ranks third of four.** OpenSLR — a corpus with no more claim to being training
data than FLEURS has — scores higher and with a quarter of the spread. Whatever explains
Spectra's FLEURS performance, it is not FLEURS-specific memorisation. A memorised corpus
does not sit mid-pack.

### 4.4 Indic exposure — evidence AGAINST special Indic training

`lab260/LRLspoof` is the lab's own 66-language spoof corpus (2,732 h, 24 TTS systems),
and the Spectra repo ships its per-utterance scores. Two things follow.

First, **Spectra ranks 18th of 32 systems on its own lab's dataset** (1-SRR 2.94% against
0.064% for the best published system, a 46× gap). A model trained on LRLspoof, or on
broad low-resource TTS data, would not place 18th on it.

Second, its per-language spoof rejection is wildly uneven, computed here over all
1,304,169 scored clips at the card's default threshold:

```
hindi      99.99%     marathi    100.00%     nepali      2.44%   <-- near-total failure
gujarati  100.00%     assamese   100.00%     malayalam  78.78%
odia       99.98%     manipuri    99.99%     czech      78.17%
telugu     93.54%     rajasthani 100.00%     indonesian 64.47%
```

Malayalam at 78.78% and Telugu at 93.54% against a 96.39% global mean, and Nepali
collapsing to 2.44%, are not the signature of a model with systematic Indic coverage.
Note LRLspoof contains **no Tamil**, so it says nothing about our Tamil results.

**Indic training exposure: not established, and the direct evidence points away from it.**
Indic-language *spoof* data may have arrived incidentally via MLAAD's `hi`/`ta`/`ml`
directories; Indic *bonafide* has no plausible route in any disclosed corpus.

### 4.5 Where Spectra is anomalous — the residual open question

Across the 24 Arena datasets, Spectra's margin over the best *published* system is
largest on:

| dataset | Spectra | best published | gap |
|---|---|---|---|
| CFAD (Chinese) | 0.481 | 8.002 | **−7.52** |
| CVoiceFake_small (Common Voice) | 0.260 | 5.838 | **−5.58** |
| DECRO (Chinese/English) | 0.171 | 4.330 | **−4.16** |
| CD-ADD | 0.027 | 1.721 | −1.69 |

and it is *behind* on ASVspoof5 (14.22), ASVspoof2021_DF (2.53), ADD2023 (6.53) and
LRLspoof (18th). Sub-0.5% EERs are not by themselves suspicious — published systems also
reach 0.000 on DFADD and J-SPAW_LA, and these benchmarks are simply saturated for large
SSL models. The *pattern* is what is notable: Spectra is strongest exactly where public
labelled training splits exist (CFAD, ADD, DECRO, CVoiceFake all ship trainable
partitions) and weakest on the sequestered challenge sets.

**Suspected but unproven: Chinese anti-spoofing corpora (CFAD/ADD family) and a
Common-Voice-derived corpus in training.** Neither touches our held-out evaluation
directly. CVoiceFake matters only by analogy — it shows that clean multilingual
crowd-recorded read speech is a domain Spectra handles unusually well, which is the same
domain FLEURS occupies, and is an alternative explanation for our FLEURS result that
requires no contamination at all.

---

## 5. Licence and terms

| item | value |
|---|---|
| HF card frontmatter | `license: apache-2.0` |
| README body text | "MIT (see the `license` field in the model repo header)" |
| Arena submission plan | records the conflict as "apache-2.0/MIT" |
| Gated / access conditions | none — public, ungated, 61 downloads |
| Predecessor `lab260/AASIST3` | **CC BY-NC-ND 4.0** — non-commercial, no derivatives |
| Dataset provenance | **undisclosed** |

Two things to carry forward. The **card contradicts itself** on Apache-2.0 vs MIT; both
are permissive and either permits our research use, but the ambiguity should be resolved
with the author before anything ships. More seriously, the **predecessor from the same lab
is CC BY-NC-ND** — which would forbid both commercial use and fine-tuning. Spectra's own
declared licence does not carry that restriction, but if its weights inherit anything
from the AASIST3 line, the permissive label may be wrong. **Fine-tuning is a derivative
work; this needs a direct answer from the author before any adapted model is published.**

Separately: because the training data is undisclosed, **no licence claim can be made about
the data behind the weights.** We cannot assert that the training corpora permitted
redistribution, and we must not imply it.

---

## 6. Frozen performance under the corrected contract

Frozen checkpoint, no fine-tuning, no data added. Both models scored on identical clips,
each under its own trained-for audio contract. iv15 reproduces its committed numbers
exactly on this code path, which is what rules out a second pipeline bug.

### 6.1 The 2x2

| cell | Spectra EER | 95% CI | AUC | iv15 EER | iv15 AUC | delta |
|---|---|---|---|---|---|---|
| **A** internal bona x internal spoof | **1.35** | [0.67, 2.19] | 0.9977 | 1.68 | 0.9979 | −0.34 |
| **B** internal bona x unseen spoof | **1.22** | [0.72, 2.03] | 0.9980 | 25.49 | 0.8197 | **−24.26** |
| **C** external bona x internal spoof | **0.15** | [0.00, 0.50] | 1.0000 | 9.76 | 0.9649 | −9.61 |
| **D** external bona x unseen spoof | **0.25** | [0.00, 0.62] | 1.0000 | 47.38 | 0.5328 | **−47.12** |

**Spectra is better on all four cells.** D moves from near chance to essentially solved.
There is no longer a cell on which iv15 wins.

### 6.2 Safety — genuine-speech false accusations at threshold 0

| genuine corpus | Spectra FPR | iv15 FPR |
|---|---|---|
| OpenSLR | **0.00%** | — |
| google/fleurs (held out) | **1.20%** | 16.2% |
| IndicVoices (held out) | **1.74%** | — |
| SherryT997 (internal) | **5.80%** | 2.8% |

The hard constraint holds. Spectra false-accuses held-out genuine Indic speech at 1.2–1.7%
against iv15's 16.2% on FLEURS. It is worse than iv15 on SherryT997 genuine (5.80% vs
2.8%) — the one place iv15 retains an edge, and it is on iv15's own training population.

### 6.3 Splitting the held-out generators by provenance risk

Because XTTS-v2 is suspected seen (§4.1) and FreeVC24 is not (§4.2), the unseen-generator
cells are reported separately rather than pooled:

| | Spectra B | Spectra D |
|---|---|---|
| **FreeVC24 only** — clean provenance | **1.73** | **0.50** |
| XTTS-v2 only — suspected seen | 1.22 | 0.06 |

**This is the single most important number in the audit.** The generator with no plausible
training path performs almost as well as the one we suspect was trained on. If
contamination were driving the result, the gap would be large; it is 0.5 EER points on B
and 0.44 on D. **Contamination does not account for Spectra's advantage.**

### 6.4 Per language

| language | A | D | internal FPR@0 | external FPR@0 |
|---|---|---|---|---|
| Hindi | 0.00 | 0.00 | 3.12% | 4.50% |
| Telugu | 0.00 | 0.00 | 0.00% | 0.00% |
| Malayalam | 1.65 | 0.50 | 17.04% | 0.00% |
| Tamil | 3.12 | 0.00 | 18.46% | 0.50% |

Tamil and Malayalam remain the weak languages, but only on the **internal** genuine side
(17–18% FPR) — on held-out FLEURS genuine in the same languages the FPR is 0.00% and
0.50%. The residual weakness is a property of the SherryT997 recordings, not of Spectra's
handling of Tamil or Malayalam. Note also that LRLspoof independently shows Spectra weak
on Malayalam (§4.4), so some genuine Malayalam softness is likely real.

### 6.5 Error overlap (Phase 10)

At each model's own dev-fitted threshold, over 3,809 evaluation clips scored by both:

```
both correct          2913   76.5%
Spectra fixes iv15     870   22.8%
Spectra breaks iv15     22    0.6%
both wrong               4    0.1%
```

**Spectra fixes 40 of iv15's errors for every one it breaks.**

- **Fixes** concentrate in the unseen generators and held-out genuine — freevc24 342,
  xtts_v2 270, genuine bonafide 172, spring_f5 32, sherry_spoof 24 — and are spread
  evenly across all four Indic languages (Hindi 219, Telugu 214, Tamil 209, Malayalam
  193). This is not a single-corpus artefact.
- **Breaks** are 22 clips, almost all SherryT997 (16 genuine + 4 spoof), concentrated in
  Tamil (12) and Malayalam (7) — the same SherryT997 residual as §6.4.

### 6.6 Hardware — the 4 GB constraint holds

Re-measured, unchanged from the frozen evaluation:

```
batch 1   1,290 MiB peak      resident 1,214 MiB
batch 8   1,823 MiB peak      of 3,724 MiB usable
latency   108 ms/clip (batch 8, GTX 1650)
```

Frozen inference is comfortable. **Nothing here has been measured for training**, which
needs optimiser state and activations for a 316 M-parameter model and is a separate
question (see §7).

---

### 6.7 Are the two representations fundamentally different? (Phase 11)

5-fold CV linear probes on the frozen penultimate embedding of each model — Spectra's
input to `aasist.out_layer` (160-d), iv15's input to `fc1_binary_gru` (1024-d) — over
2,400 clips sampled across the whole evaluation set. A high score on *real vs spoof* is
good. A high score on generator, language or corpus means the representation carries
**domain identity**, which is exactly what makes a detector fail to transfer.

| linear probe | Spectra | iv15 | majority baseline |
|---|---|---|---|
| **real vs spoof** (the task) | **99.5%** | 93.3% | 51.6% |
| generator identity (spoof only) | **64.3%** | 84.3% | 52.6% |
| language identity | **34.0%** | 41.2% | 21.3% |
| recording corpus identity | **61.5%** | 68.5% | 53.0% |

**Spectra's representation carries more task signal and less domain identity on every
axis.** iv15 encodes *which generator produced this clip* at 84.3% — it has learned
generator identity, which is precisely why it collapses on generators it has not seen
(D AUC 0.533). Spectra encodes the same thing at 64.3%, barely above the 52.6% baseline,
while separating real from spoof almost perfectly.

This is domain-invariance — the property this project spent seven experiments, including
two ASDG variants, failing to obtain by training. It was not obtained by a better
objective. It came with a stronger pretrained representation.

**One caveat, and it runs in the conservative direction.** iv15's embedding is 1024-d
against Spectra's 160-d, and more dimensions make *any* attribute easier to decode
linearly. That confound inflates iv15 on the three nuisance probes, so those gaps should
be read as directional rather than exact. It does not touch the task probe, where Spectra
wins by 6.2 points **despite** having 6x fewer dimensions to work with.

## 7. Verdict

### Where each held-out asset stands

| asset | verdict | basis |
|---|---|---|
| **FLEURS** | **unseen** (high confidence) | Absent from every disclosed corpus, from all 24 Arena datasets, and from the lab's three papers. Behaviourally mid-pack among four genuine corpora (§4.3) — memorisation would not look like this. |
| **FreeVC24** | **unseen** (high confidence) | MLAAD contains no voice-conversion data at all; FreeVC postdates ASVspoof 2019 LA by four years. No route into any plausible training set. |
| **XTTS-v2** | **suspected seen** | MLAAD is declared training data for the lab's immediately preceding model, and MLAAD's file tree contains `tts_models_multilingual_multi-dataset_xtts_v2` verbatim. Inference from lineage, not disclosure. |
| **Indic data** | **not established; evidence points away** | Spectra ranks 18/32 on its own lab's LRLspoof, with Malayalam 78.8% and Nepali 2.4% rejection against a 96.4% mean. Indic *spoof* may have arrived incidentally via MLAAD's `hi`/`ta`/`ml` dirs; Indic *bonafide* has no plausible route. |
| **SherryT997 / SPRING_F5 / IndicVoices / OpenSLR** | **unseen** | SPRING_F5 clips were generated by us in 2026, after the checkpoint. The rest have no route into any disclosed or suspected corpus. |

### Which case applies

This is **CASE B — partial contamination**, and the brief's instruction for Case B is to
separate contaminated from clean results and reassess. That has been done, and the answer
is unambiguous:

> With XTTS-v2 set aside entirely, on FreeVC24 alone Spectra scores **B 1.73 / D 0.50**
> against iv15's **B 25.49 / D 47.38**. The clean-provenance result is not meaningfully
> weaker than the suspect one.

**Spectra's advantage survives the removal of every result we have reason to doubt.**

### What may and may not be claimed

**May:** Spectra-AASIST, frozen and unmodified, outperforms iv15 on all four cells of our
benchmark; its advantage is largest on unseen bonafide and unseen generators; it holds on
a generator with clean provenance; it false-accuses held-out genuine Indic speech at
1.2–1.7% against iv15's 16.2%; it fixes 40 of iv15's errors for every one it breaks.

**May not:** that Spectra is "clean". Its training data is undisclosed and that cannot be
resolved from public evidence. We may not present D as an unseen-generator result without
noting XTTS-v2's status. We may not claim Spectra never saw Indic speech — only that
there is no evidence it did and some evidence against systematic exposure. And we may not
make any claim about the licensing of the data behind the weights.

### Recommendation: **investigate further, then fine-tune — but the first move is not training**

Spectra is now the strongest model this project has produced or found, by a wide margin,
and iv15 is no longer competitive on anything except its own training population. But
three things should happen before a single gradient step:

1. **Ask the author.** `kborodin.research@gmail.com` is live and the model is pre-release.
   One email asking (a) what Spectra was trained on, (b) whether MLAAD/XTTS-v2 was
   included, and (c) whether Apache-2.0 or MIT governs, and whether fine-tuning is
   permitted, would resolve in one reply what no amount of inference can. **This is the
   highest-value next action in the whole project.** The licence question is not
   optional: the same lab's predecessor is CC BY-NC-ND, which would forbid derivatives.
2. **Re-run the safety and shortcut audits under the corrected contract.** Every shortcut
   number we have for Spectra — the loudness correlation r = +0.457, the low-pass
   bandwidth probe — was measured without preemphasis and is therefore void. Preemphasis
   is a high-pass filter; it directly changes what a bandwidth or loudness probe sees.
3. **Reconsider whether fine-tuning is worth its risk.** The case for adaptation was
   A = 12.78%. A is now **1.35%**, better than iv15's 1.68%. The problem fine-tuning was
   meant to solve has largely dissolved. What remains is 5.80% FPR on SherryT997 genuine
   and the Tamil/Malayalam residual — a narrow target, against the risk of damaging a
   B/C/D profile that is currently near-perfect and that seven previous experiments in
   this project failed to achieve by any other means.

If fine-tuning does proceed, the Phase-16 ladder stands (frozen baseline → head only →
partial → PEFT → full), with the §17 dataset, the §18 success criterion, and the 4 GB
limit. Frozen inference fits in 1.8 GB of 3.7; **training feasibility for 316 M parameters
is unmeasured and must be measured before it is assumed.**

