# ASDG experiment — aggregate bonafide domains, leave spoof free

**Source.** Xie, Cheng, Wang, Ye, *Domain Generalization via Aggregation and Separation for
Audio Deepfake Detection*, IEEE TIFS 2024. Workshop variant SM-ASDG, IJCAI 2023 DADA.

## The question

Four experiments changed the DATA and all landed on the same trade. This changes the
LEARNING OBJECTIVE and asks one thing:

> Can the model learn "REAL regardless of recording domain" without also learning
> "FAKE regardless of generator"?

## Exact formulation

```
L_all = L_BCE + λ1·L_ada + λ2·L_tri                      λ1 = λ2 = 0.1

L_ada:  minmax  − E_{x~P(X_r), y~Y_D}  Σ_d p(y=d) log D(G(x))       (Eq. 4)
          D  G
L_tri:  Σ_i ‖f(x_a) − f(x_r)‖²₂ − ‖f(x_a) − f(x_f)‖²₂ + α,  α = 0.1  (Eq. 3)
```

`X_r` is the **real** distribution — the discriminator never sees a spoof sample.

### Two adaptations, reported not hidden

1. **Eq. 3 has no hinge as written.** Taken literally the term is unbounded below: the
   model minimises it by driving the fake distance to infinity and ignoring everything
   else. `max(0, ·)` is applied, which is the standard reading of a triplet loss and what
   every practical implementation does. Verified: the term is 0 when real is tight and
   fake far, positive when real is spread and fake near.
2. **λ is described only as "negative dynamic coefficients"**, with GRL cited to Ganin &
   Lempitsky (ICML 2015). Their schedule is inherited verbatim,
   `λ_p = 2/(1+exp(−10p)) − 1`, giving 0.000 → 0.987 → 1.000 across training. IDFE reports
   the same 0→1 ramp independently.

Neither half of the method is dropped. The aggregation term and the separation term are
both implemented.

## Implementation

`model.py`, `main.py` and `audio_utils.py` are **byte-identical** to the versions used for
the iv15 run — verified by diff, so the comparison stays causal. ASDG lives in
`train_asdg.py`, which imports `Dataset_Indic`, `score_split` and `set_seed` from `main.py`.

The 1024-d GRU embedding is captured as the *input* to `fc1_binary_gru` via a forward hook.
Verified: shape `(batch, 1024)`, and both `output_binary` and `output_multi` are bit-identical
with the hook attached and after its removal.

```
domain_head = nn.Linear(1024, 3)     # 3,075 params = 0.016% of 18,678,185
real = (labels == 0) & (domain_id >= 0)          # SINGLE-SIDED
z    = GradReverse.apply(embedding[real], lam)
L_ada = cross_entropy(domain_head(z), domain_id[real])
```

Training-only; discarded at inference. `detect.py` confirmed working unchanged.

**Domain labels** from the `source` field: SherryT997 → 0, OpenSLR → 1, IndicVoices → 2.
Verified: all 3,497 train bonafide have exactly one id; **0** of 3,440 spoof clips appear in
the domain map.

**Unchanged:** dataset, splits, labels, preprocessing, trimming, sample rate, optimiser
(Adam 1e-4, wd 1e-4), ReduceLROnPlateau, batch 32, 30 epochs, seed 1234, NLLLoss on the
binary head, class order, thresholds, checkpoint selection (lowest dev EER, dev only).
Init from `checkpoints_f5_iv15/best_model.pth`.

## GRL verified, not assumed

| check | result |
|---|---|
| forward is identity | True |
| gradient sign reversed | True |
| λ scales the gradient (0.5 → −0.5×) | True |
| domain head still gets a NORMAL gradient | True |

## Reading the domain head correctly

The three domains are imbalanced — Sherry 2185, OpenSLR 892, IndicVoices 420 — so
**uniform chance is the wrong yardstick**:

* majority-class accuracy **62.5%**, marginal-distribution CE **0.896**
* uniform chance would be 33.3% / 1.099

Aggregation working looks like domain accuracy falling **toward 33.3%** with CE rising.
A collapsed discriminator sits **at ~62.5%** with CE ~0.896. Both are printed each epoch,
because reading the second as the first would invert the conclusion.

## Baseline: iv15

| A | B | C | D | FLEURS FPR |
|---|---|---|---|---|
| 1.68% | 25.49% | 9.76% | 47.38% / AUC 0.533 | 16.2% |

## Hypothesis and predictions

> Aligning bonafide representations across Sherry, OpenSLR and IndicVoices while leaving
> spoof representations unconstrained should reduce external bonafide false positives
> without sacrificing unseen-generator detection.

Against iv15, direction only — the method has never been run at this scale, so point
predictions would be false precision:

* **A** — approximately preserved.
* **B** — improves, or at minimum does not materially worsen. **This is the experiment.**
* **C** — preserved or improves.
* **D** — improves.
* **FLEURS FPR** — preserved or improves.
* **Safety** — preserved or improves.

**The critical test is not C.** iv15 already has the best C and FLEURS numbers. ASDG earns
its place only if it improves **B without giving those back**.

**Failure** is: B collapses; C or safety collapses; adversarial training is unstable; binary
separation deteriorates; a new shortcut appears; or the domain head is ineffective —
identifiable as accuracy pinned at ~62.5%, meaning it never learned rather than being
successfully confused.

## Research limitation, recorded before the run

ASDG was validated on LCNN/W2V2 with 27,084 training clips. We apply it to a GRU embedding
with 6,937 clips, three domains, and only **420 IndicVoices clips** carrying the smallest
domain. GRL is known to be unstable at small scale. The paper's RawNet2 comparison (EER
−39.24%) is encouraging but was a comparison *against* RawNet2, not an application *of*
ASDG to RawNet2.

**This is an evidence-backed experiment, not a guaranteed fix.**

## Results — FAILED on its critical test

| | A | B | C | D | FLEURS | xtts_v2 | freevc24 | SPRING_F5 |
|---|---|---|---|---|---|---|---|---|
| v1 | 1.68 | 26.14 | 10.61 | 49.75 / 0.478 | 26.2% | 41.2% | 13.5% | 3.2% |
| f5-trim | 2.02 | **17.97** | 14.39 | 47.12 / 0.523 | 40.0% | 47.8% | 40.0% | 90.3% |
| iv15 | **1.68** | 25.49 | 9.76 | 47.38 / 0.533 | 16.2% | 32.5% | 13.5% | 88.5% |
| **asdg** | 2.19 | **33.86** | **8.12** | **40.62 / 0.618** | **14.0%** | 26.0% | 16.8% | 91.8% |

**B collapsed: 25.49% → 33.86%, AUC 0.820 → 0.699.** That is the pre-registered failure
condition, and B was the entire point — iv15 already held the best C and FLEURS numbers.
ASDG improved C (9.76 → 8.12), D (AUC 0.533 → 0.618) and FLEURS (16.2% → 14.0%) while
losing more unseen-spoof performance than it gained. It moved *further along the same
trade-off*, which is what it was chosen to break.

## The mechanism never engaged

Domain accuracy locked at the majority-class rate and stayed there while λ ramped 5.5×:

| epoch | L_ada | domain acc | λ |
|---|---|---|---|
| 1 | 1.0733 | 49.9% | 0.164 |
| 3 | 0.9430 | 61.9% | 0.462 |
| 5 | 0.9339 | 62.0% | 0.682 |
| 9 | 0.9402 | 62.4% | 0.905 |
| 15 | 1.1079 | 62.4% | 0.987 |

Actual domain prior: Sherry 3378 / OpenSLR 1078 / IndicVoices 747 → majority 64.9%,
marginal CE 0.885. The head sat at 62.4% with CE ~0.94 — essentially the prior.

**A pinned accuracy has two explanations that look identical, so they were separated by
probing frozen embeddings with a fresh classifier:**

| model | fresh probe recovers real domain |
|---|---|
| iv15 | 64.6% |
| **asdg** | **73.2%** |

The ASDG representation is **more** domain-separable, not less. The generator did not
confuse the discriminator; the discriminator collapsed to the prior and its reversed
gradient was noise. The published mechanism did not operate here.

## Diagnosis before any conclusion about architecture

Per the standing rule, this is not evidence that RawNet2 is insufficient. Ranked by
support in the measurements:

1. **Small-data adversarial instability — best supported.** 747 IndicVoices clips carrying
   the smallest of three imbalanced domains. GRL is known to be unstable at this scale, and
   collapse to the prior is its textbook failure. ASDG was validated on 27,084 clips.
2. **Domain imbalance (4.5:1 Sherry:IndicVoices)** — a class-weighted or balanced-sampled
   domain loss was not part of the published method and was not added, but the collapse is
   precisely toward the majority class.
3. **λ possibly too strong for this scale** — untested; one run was the agreed scope.
4. **Three domains may be too few** to define invariance that transfers to a fourth.

Not supported: wrong domain labels (verified, 3497/3497 bonafide labelled, 0/3440 spoof),
broken GRL (unit-tested — identity forward, reversed and λ-scaled backward, domain head
receiving normal gradient), or a dropped separation term (both halves implemented, triplet
verified to be 0 when separated and 43.0 when not).

## Verdict

**Rejected.** B collapsed and the representation-domain audit shows the intended mechanism
never engaged. iv15 remains the best all-round model; v1 remains the safe baseline;
f5-trimmed remains the best unseen-spoof result.

Worth recording: ASDG produced the **best C (8.12%), best D (AUC 0.618) and best FLEURS
(14.0%)** of any model built. If the objective were bonafide robustness alone it would win.
It is rejected because it bought that with unseen-spoof detection, again.
