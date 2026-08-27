# Pre-registration — IndicVoices third-bonafide experiment

Written before training. Predictions are not revised after seeing results.

## The change under test

**One substantive change: bonafide source composition.** Each language's real budget is
held at exactly what the F5 experiment used and 30% of the Indic-language budget is
reallocated to IndicVoices, taken proportionally from SherryT997 and OpenSLR. Total
dataset size, class balance (1.02:1), the entire spoof side (byte-identical, 3,440 clips),
the internal test split (byte-identical), architecture, optimiser, loss, sample rate,
schedule and checkpoint-selection rule are all unchanged.

Initialised from `checkpoints_f5_trimmed`, the best unseen-spoof result, and trained under
the same trimmed audio contract — a model cannot be continued under a different contract
than it was taught.

## Baselines, measured on the same cells

| | A | B | C | D | FLEURS FPR |
|---|---|---|---|---|---|
| v1 | 1.68% / 0.998 | 26.14% / 0.799 | 10.61% / 0.956 | 49.75% / 0.478 | 26.2% |
| F5-trimmed | 2.02% | **17.97% / 0.890** | 14.39% | 47.12% / 0.523 | 40.0% |

## Predictions

**A — internal × internal: approximately preserved.** Predict **1.5–3.5%**. The internal
test is byte-identical, but 45% of the Sherry bonafide it resembles has been replaced.

**B — unseen spoof: retains the F5 improvement.** Predict **≤ 21%**, i.e. still clearly
better than v1's 26.14%. The spoof side is untouched, so losing B would mean bonafide
dilution cost spoof recall. Predict AUC ≥ 0.85.

**C — external bona × internal spoof: improves over F5-trimmed.** Predict EER **< 14.39%**
and external-bonafide FPR **< 39.75%**. This is the cell the intervention targets.

**D — external × external: improves over F5-trimmed.** Predict EER **< 47.12%** and
**AUC ≥ 0.54**.

**Safety — FLEURS false accusations fall.** Predict FLEURS flagged **< 40.0%** and
ideally toward v1's 26.2%. Predict internal-genuine flagging stays **≤ 5%** (v1 3.2%).

**Per-generator.** XTTS-v2 and FreeVC24 reported separately. FreeVC24 has been the harder
of the two for every model so far (mean P(spoof) 0.11–0.30 against 0.28–0.48 for XTTS-v2);
predict it stays harder.

## What would falsify this

* **FLEURS FPR does not fall below 40%** → bonafide diversity at this dose does not fix
  external-bonafide safety, and the 30% share or the corpus choice is wrong.
* **B rises above 21%** → adding real-speech diversity costs unseen-spoof detection, and
  the two objectives really are in tension rather than jointly achievable.
* **A rises above 3.5%** → the Sherry reduction cost too much in-domain capability.
* **A new shortcut appears** in the post-training audit — particularly
  `IndicVoices = real`, whose pre-training identifiability is 0.850.

Any of the first three means the intervention failed; per Step 22 the response is
diagnosis, not another dataset.

## Dataset

```
train    3497 real / 3440 fake  (1.02:1)
         real:  SherryT997 1922 | IndicVoices 840 | OpenSLR 735
         fake:  sherry_spoof 2073 | spring_f5 1367     <- byte-identical to F5 run
dev       722 real /  763 fake
test      744 real /  746 fake                          <- byte-identical to F5 run
test_f5     0 real /  279 fake   held-out F5 speakers
test_iv   240 real /    0 fake   held-out IndicVoices speakers
```

Step 11 audit, run on this exact mixture, both policies pass:

| contrast | F5 only (trimmed) | F5 + IV (trimmed) |
|---|---|---|
| REAL vs ALL FAKE | 0.680 | **0.651** |
| REAL vs SPRING_F5 | 0.774 | **0.752** |
| REAL vs Sherry spoof | 0.653 | **0.606** |

Step 12: the OpenSLR silence shortcut is reduced, not merely diluted — silence AUC vs the
fake class falls from 0.677 to 0.560 because IndicVoices (median 0.040) pulls opposite to
OpenSLR (0.366).

Step 13: `IndicVoices = real` is identifiable at 0.850 — above SherryT997's 0.818, below
OpenSLR's 0.957 which is already in training. Flagged, not disqualifying.

Step 14: 1,191 IndicVoices speakers, **0 crossing splits**; 0 speaker or audio overlap
with the external set; 0 FLEURS clips in training.
