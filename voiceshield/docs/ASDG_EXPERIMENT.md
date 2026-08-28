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

---

# Follow-up: was it sampling exposure rather than the objective?

Investigated without training the detector.

## What the discriminator actually saw

Replaying the exact loader (batch 32, shuffle, drop_last) over the full 30-epoch budget,
6,480 steps:

| domain | per batch | batches with 0 | with ≤1 |
|---|---|---|---|
| SherryT997 | 10.1 | 0.0% | 0.0% |
| OpenSLR | 4.1 | 1.5% | 7.2% |
| **IndicVoices** | **1.9** | **13.2%** | **42.0%** |

All three domains were present in 85.5% of batches and a cross-domain triplet was formable
in 99.8%, so the *separation* half had ample signal. The *aggregation* half did not.

## The decisive test

The same 3-way linear head, on frozen iv15 embeddings, identical steps and learning rate,
differing only in batch composition:

| batch composition | test acc | Sherry | OpenSLR | IndicVoices |
|---|---|---|---|---|
| imbalanced 10/4/2 — as ASDG saw it | 46.3% | 82.1% | 26.1% | **25.0%** |
| domain-balanced 5/5/6 | 50.0% | 36.8% | 53.9% | **62.5%** |

Under the real batch mix the discriminator degenerates into a **Sherry detector**: the two
minority domains sit at chance. Under balanced batches all three become learnable, and
IndicVoices — the domain added specifically to fix FLEURS — becomes the *best* recovered.

**The information was in the embedding all along. The sampling regime prevented the
discriminator from learning it.** A gradient reversal layer can only reverse a gradient
that exists; for IndicVoices there was effectively none to reverse. That is a sampling
failure, not a refutation of single-side domain adversarial learning.

## Does under-exposure also affect the main task?

Plausible but **not demonstrated**. Two mechanisms:

| source | share | per batch now | balanced | change |
|---|---|---|---|---|
| SherryT997 | 62.5% | 10.1 | 5.4 | 0.53× |
| OpenSLR | 25.5% | 4.1 | 5.4 | 1.31× |
| IndicVoices | 12.0% | 1.9 | 5.4 | **2.78×** |
| sherry_spoof | 60.3% | 9.6 | 7.9 | 0.83× |
| spring_f5 | 39.7% | 6.3 | 7.9 | 1.26× |

1. Gradient composition per step is dominated by SherryT997.
2. RawNet2 carries four BatchNorm declarations, so batch composition sets the
   normalisation statistics the whole network sees — an under-exposed source contributes
   less to them regardless of its total count.

This reframes the dose-response result. The 15% and 30% experiments varied how many
IndicVoices clips exist; **neither varied how many the model sees per step**, which stayed
proportional. Source-balanced batching is a different axis from dose and has not been
tested.

## Status

This is a diagnosis, not a result. It identifies a concrete, cheap, established
intervention — balanced batch sampling, which the multi-corpus literature already
recommends "to stabilise training and improve generalisation" — that changes **no data**:
same clips, same counts per epoch, only the per-step mix.

It does not show that fixing exposure would recover B. The honest position is that ASDG
was never given a fair test of its central mechanism, and that the trade-off conclusion
drawn from five experiments rests on runs that all shared one untested sampling regime.

---

# Experiment 2: balanced-domain ASDG — pre-registration

```
sampling strategy:  separate DOMAIN-BALANCED auxiliary draw, 5 bonafide per domain
                    per step, used ONLY for L_ada. L_BCE and L_tri stay on the
                    original main batch.
why:                Class-weighted loss was tried first and measured insufficient --
                    on frozen iv15 embeddings it lifts IndicVoices only to 40.9%
                    against 62.5% for true balanced sampling, because weighting
                    amplifies a sparse signal but cannot densify one and does nothing
                    about the 13.2% of batches with no IndicVoices sample at all.
                    The literature supports both class-balanced batch sampling and
                    class-weighted components; the measurement chose between them.
                    BatchNorm is frozen during the auxiliary pass so the main batch
                    keeps sole ownership of the running statistics.

expected domain samples/batch:  Sherry 5.00 | OpenSLR 5.00 | IndicVoices 5.00
one-epoch sampler audit:        zero-domain batches 0.0% (was 13.2% for IndicVoices)
                                <=1-sample batches  0.0% (was 42.0%)
                                all three present in 100.0% of batches

ASDG objective:  unchanged  -- L_BCE + 0.1 L_ada + 0.1 L_tri, margin 0.1,
                 GRL lambda = 2/(1+exp(-10p)) - 1, same hinge interpretation
GRL:             verified   -- identity forward, reversed and lambda-scaled backward,
                 domain head still receiving a normal gradient
dataset:         unchanged  -- data/mixed_f5_iv15, same splits and labels
preprocessing:   unchanged  -- trimmed, 16 kHz, peak-normalised
seed:            unchanged  -- 1234
```

## Hypothesis

> Balanced auxiliary domain exposure will let the discriminator learn all three bonafide
> domains, giving gradient reversal meaningful gradients and reducing domain information
> in the shared embedding.

Expected, direction only:

* domain-head **balanced accuracy** meaningfully above 33.3% early, then falling as λ ramps
* fresh embedding-domain probe **below** iv15's 64.6% and old-ASDG's 73.2%
* **B** improves, or at minimum no longer collapses (old ASDG: 33.86%)
* **C**, **D**, **FLEURS FPR** preserved or improved

## The three states this must distinguish

* **A — discriminator collapse.** Domain head poor AND fresh probe still recovers domain
  easily. This is what experiment 1 turned out to be.
* **B — failure.** Domain head majority-biased, embedding still domain-separable.
* **C — genuine invariance.** Domain head performance reduced AND the fresh probe finds
  less domain information. **Only C counts.**

Primary domain metric is **balanced accuracy**, not raw accuracy: the auxiliary draw is
balanced by construction so chance is 33.3%, but per-domain recall is reported every epoch
so collapse onto one domain cannot hide inside an average.

## Experiment 2 results — the mechanism engaged, and still did not produce invariance

Balanced exposure fixed the discriminator. It did **not** fix the representation.

### The discriminator was genuinely engaged this time

| | experiment 1 (imbalanced) | experiment 2 (balanced) |
|---|---|---|
| domain samples/batch | 10.1 / 4.1 / 1.9 | 5.00 / 5.00 / 5.00 |
| batches with ≤1 IndicVoices | 42.0% | 0.0% |
| domain CE at convergence | ~0.94 (**the prior**, 0.885) | **1.099 (= ln 3, chance)** |
| domain accuracy | 62.4%, pinned at majority (64.9%) | balanced acc 30–34%, at chance |

Experiment 1 collapsed onto the majority class. Experiment 2 held the discriminator at
true chance for 30 epochs at full λ, with per-domain recall thrashing between epochs —
the signature of an adversarial game actually running.

### The decisive test says it failed anyway

Fresh probe, balanced 900-clip set, 5-fold CV:

| model | balanced accuracy |
|---|---|
| iv15 | 64.6% |
| asdg (imbalanced) | 73.2% |
| **asdg-balanced** | **74.8%** |

The pre-registered requirement was that this **decrease**. It increased. The embedding
carries *more* recoverable domain information than iv15's, not less.

**This is a fourth state, not one of the three anticipated.** The discriminator was not
confused because domain information was removed; it was confused because the encoder
learned to hide that information from *that particular linear head*, pushing it into
directions the head was not using. A freshly trained probe finds it immediately. This is
the known failure mode of adversarial feature learning — fooling a specific discriminator
is not the same as removing information, and the frozen-probe test is what distinguishes
them.

### Detection results

| | A | B | C | D | FLEURS | xtts | freevc | F5 |
|---|---|---|---|---|---|---|---|---|
| v1 | 1.68 | 26.14 | 10.61 | 49.75 / 0.478 | 26.2% | 41.2% | 13.5% | 3.2% |
| f5-trim | 2.02 | **17.97** | 14.39 | 47.12 / 0.523 | 40.0% | 47.8% | 40.0% | 90.3% |
| iv15 | 1.68 | 25.49 | 9.76 | 47.38 / 0.533 | 16.2% | 32.5% | 13.5% | 88.5% |
| iv30 | 1.85 | 28.23 | **6.48** | 40.88 / **0.615** | 8.2% | 22.0% | 12.5% | 90.0% |
| asdg | 2.19 | 33.86 | 8.12 | 40.62 / 0.618 | 14.0% | 26.0% | 16.8% | 91.8% |
| **asdg-bal** | **1.68** | 30.97 | 7.48 | 44.12 / 0.576 | **13.0%** | 29.2% | 15.2% | 88.9% |

Balanced exposure recovered part of what experiment 1 lost — B 33.86 → 30.97 — but B
remains far below iv15 (25.49) and below v1 (26.14). A returned to its best value (1.68),
C improved to 7.48, and FLEURS reached its best figure across every model built (13.0%).

Scored against the pre-registration: domain-head engagement **as predicted**; C, D and
FLEURS **preserved or improved as predicted**; the fresh-probe decrease **failed**; B
"improves or at least no longer collapses" **partially** — it improved on experiment 1 and
still collapsed relative to iv15.

### Verdict

**Rejected**, on the criterion set in advance. The one claim this experiment existed to
test — that balanced exposure would let gradient reversal reduce domain information — is
refuted by direct measurement.

What it establishes positively is worth keeping: the experiment-1 collapse really was a
sampling artefact, and fixing it really does make the adversarial game run. The method's
mechanism was given a fair test on the second attempt and still did not deliver invariance
at this scale.

### Diagnosis before any further step

Per the standing rule, this is not evidence that RawNet2 is insufficient.

* **Adversarial evasion, not removal — best supported.** The encoder minimises the loss of
  one linear head by relocating domain information rather than destroying it. Established
  remedies exist and were not used: periodically re-initialising the discriminator, a
  stronger or non-linear head, or an information-theoretic penalty such as the variational
  information bottleneck that two of the surveyed papers pair with GRL.
* **Three domains may be too few** to define an invariance that generalises to a fourth.
* **λ = 0.1 may be too weak** to force removal rather than relocation — untested; one run
  was the agreed scope.

Not supported: discriminator starvation (fixed and verified), broken GRL (unit-tested),
wrong labels (verified), a dropped separation term (both halves implemented).
