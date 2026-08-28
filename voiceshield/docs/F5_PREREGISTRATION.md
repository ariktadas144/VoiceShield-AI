# Pre-registration — SPRING_F5 multi-generator experiment

Written **before** either model was trained, against a v1 baseline measured on the exact
evaluation cells used to judge the result. Predictions are not revised after seeing
outcomes; if they are wrong, the record says so.

## The change under test

One substantive change from v1: **half of each language's fake budget is reallocated from
SherryT997 spoof to SPRING_F5 spoof.** Nothing is added — the fake total per language is
exactly v1's, so any effect is attributable to generator *diversity*, not to more data.
Real side, real/fake ratio, architecture, sample rate, loss, optimiser, schedule,
normalisation and checkpoint-selection rule are all unchanged, and both runs start from
frozen v1 with seed 1234.

Two runs, differing **only** in preprocessing:

| run | silence policy |
|---|---|
| `f5-untrimmed` (primary) | none — identical to v1's contract |
| `f5-trimmed` (ablation) | symmetric leading/trailing trim, `top_db=40`, applied to REAL and FAKE alike, in the shared front end used by training and inference |

XTTS-v2 and FreeVC24 remain fully held out. The external evaluation set is unchanged.

## Baseline: v1, measured

| cell | n | EER% | AUC | FPR% | FNR% |
|---|---|---|---|---|---|
| A internal bona × internal spoof | 1189 | 1.68 | 0.998 | 2.22 | 1.32 |
| B internal bona × EXTERNAL spoof | 1385 | 26.14 | 0.799 | 2.22 | 72.62 |
| C EXTERNAL bona × internal spoof | 1404 | 10.61 | 0.956 | 27.12 | 1.32 |
| D EXTERNAL bona × EXTERNAL spoof | 1600 | 49.75 | 0.478 | 27.12 | 72.62 |

v1's dev EER is 2.22% at threshold 0.176874. **D is at chance** — on unseen generators
scored against unseen bonafide, v1 has no discriminative signal at all. That is the
failure this experiment exists to attack.

## Predictions

**A — internal × internal: ≈ v1.**
Predict EER in **1.0–3.5%**, AUC ≥ 0.99. Half the Sherry spoof is gone, so a small
regression is acceptable; anything above 3.5% means the reallocation cost real in-domain
capability and the trade is not obviously worth it.

**B — internal bona × unseen spoof: improves.**
Predict EER **below 22%** (v1: 26.14), i.e. at least ~4 points. This is the first real
test of whether an independent Indic generator transfers to generators never trained on.
No improvement here means SPRING_F5's artefacts do not generalise to XTTS-v2/FreeVC24.

**C — external bona × internal spoof: ≈ v1 or better.**
Predict EER **≤ 12%** (v1: 10.61) and AUC ≥ 0.94. C is dominated by the false-accusation
rate on FLEURS bonafide (v1: 27.12% FPR). Predict FPR **≤ 30%** — I do not expect F5 spoof
to fix bonafide-domain shift, only to avoid making it worse.

**D — external × external: improves.**
The headline. Predict EER **below 45%** and **AUC ≥ 0.55** (v1: 49.75 / 0.478). This is a
deliberately modest bar: moving off chance at all would be the first evidence in this
project of genuine cross-generator generalisation. AUC staying ≤ 0.52 means the added
diversity bought nothing where it matters most.

**Safety: not materially worse.**
Predict the genuine-speech false-accusation rate rises by **no more than 5 points** over
v1 on every safety probe (clean, mains hum, leading/trailing silence, internal pause,
low-energy, band-limited). A model that improves D while accusing substantially more real
speakers is rejected regardless of D — this is a hard constraint, not a trade.

**Per-generator (Step 16).** XTTS-v2 and FreeVC24 are reported separately, never only
pooled. Predict the improvement is **uneven** between them: FreeVC24 is voice conversion
and XTTS-v2 is autoregressive TTS, and SPRING_F5 is flow-matching TTS, so I expect more
transfer to XTTS-v2 than to FreeVC24. If pooled D improves while one generator is
unchanged, the pooled number is not the finding.

### The trimmed run specifically

**Predict the trimmed model shows a HIGHER dev EER than the untrimmed one, and this is
expected rather than a failure.** A classifier trained on leading-silence duration alone
scores 15.1% EER on ASVspoof, and signal models there move from 3.6% to 15.5% EER once
silence is trimmed (arXiv:2106.12914). Removing silence removes a crutch; the resulting
number is worse and more honest. Predict trimmed dev EER **1.5–3× the untrimmed value**.

The trimmed run earns adoption only if it improves **B and D** — generalisation — not
merely the shortcut-audit scores. Better shortcut numbers with equal or worse
generalisation means the shortcut was not what was limiting the model.

## What would falsify the whole experiment

* D unchanged (AUC ≤ 0.52) → SPRING_F5 diversity does not transfer; do not add another
  generator reflexively, diagnose first (Step 20).
* A above 3.5% → the reallocation cost more in-domain than it bought.
* Safety worse by more than 5 points → rejected outright.
* B and D both improving while the post-training shortcut probe finds a NEW strong
  acoustic cue → the gain is a shortcut and does not count.

## Selection rules, fixed in advance

* Checkpoint selection: **lowest dev EER**, dev only.
* Threshold: fitted on **dev only**. The external set is never used for selection or
  tuning.
* Each model is evaluated under the audio contract it was trained under; the evaluator
  reads `trim` from the checkpoint rather than being told.
* The untrimmed model is preferred if both satisfy the success criteria, because it is
  the cleaner causal result.

## Dataset under test

```
train    3497 real / 3440 fake   (sherry_spoof 2073, spring_f5 1367)
dev       722 real /  763 fake   (sherry_spoof  470, spring_f5  293)
test      744 real /  746 fake   (sherry_spoof  746)   <- unchanged from v1
test_f5     0 real /  279 fake   (spring_f5 279)       <- held-out F5 speakers
```

Step 8 gate, run on this exact mixture, both policies **PASS**:

| contrast | untrimmed | trimmed |
|---|---|---|
| REAL vs ALL FAKE | 0.725 | 0.680 |
| REAL vs SPRING_F5 | 0.802 | 0.774 |
| REAL vs Sherry spoof | 0.733 | 0.653 |

On the model's own 4.04 s input, the tiling cue that failed the first gate is gone:
REAL vs SPRING_F5 tiling AUC **0.705 → 0.513**, classifier **0.860 → 0.776**.
